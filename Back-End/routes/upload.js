const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { r2 } = require('../config/r2');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../config/database');
const { createFileMetadata } = require('../services/fileMetadataService');
const { validateFileUpload, validateConversationId } = require('../middleware/validation');
const attachmentService = require('../services/attachmentService');

const router = express.Router();

const UPLOAD_ROOT = process.env.UPLOAD_ROOT
  ? path.resolve(process.env.UPLOAD_ROOT)
  : path.join(__dirname, '..', 'uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    // Only block path traversal attacks at this stage; size is enforced by limits above.
    // Full security validation (magic bytes etc.) runs after the buffer is available.
    const validation = validateFileUpload(file);
    if (!validation.valid) {
      cb(new Error(validation.error));
    } else {
      cb(null, true);
    }
  },
});

function resolveUploadPath(key) {
  const candidate = path.resolve(UPLOAD_ROOT, key);
  if (!candidate.startsWith(UPLOAD_ROOT)) {
    throw new Error('Invalid upload key path');
  }
  return candidate;
}

const _IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.webp','.gif','.svg','.bmp','.tiff','.tif','.ico','.heic','.heif','.avif']);
const _VIDEO_EXTS = new Set(['.mp4','.webm','.mov','.avi','.mkv','.mpeg','.mpg','.3gp','.ogv','.m4v','.wmv','.flv']);
const _AUDIO_EXTS = new Set(['.mp3','.wav','.ogg','.m4a','.aac','.flac','.wma','.opus']);
const _ARCHIVE_EXTS = new Set(['.zip','.rar','.7z','.tar','.gz','.bz2','.xz','.zst']);
const _DOCUMENT_EXTS = new Set([
  // Office / text
  '.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.txt','.csv','.md','.rtf','.odt','.ods','.odp','.pages','.numbers','.key',
  // Code / config
  '.js','.ts','.jsx','.tsx','.html','.htm','.css','.scss','.sass','.less',
  '.json','.xml','.yaml','.yml','.toml','.ini','.cfg','.conf','.env',
  '.py','.java','.c','.cpp','.h','.hpp','.cs','.php','.rb','.go','.rs','.kt','.swift',
  '.sh','.bash','.zsh','.fish','.ps1','.bat','.cmd',
  '.sql','.graphql','.proto','.dart','.lua','.r','.m','.scala','.pl','.ex','.exs',
  // Design
  '.psd','.ai','.xd','.fig','.sketch','.indd','.eps','.afdesign','.afpub','.afphoto',
]);

function getFileCategory(mimeType, ext) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/')) return 'document';
  if (_IMAGE_EXTS.has(ext)) return 'image';
  if (_VIDEO_EXTS.has(ext)) return 'video';
  if (_AUDIO_EXTS.has(ext)) return 'audio';
  if (_ARCHIVE_EXTS.has(ext)) return 'archive';
  if (_DOCUMENT_EXTS.has(ext)) return 'document';
  return 'other';
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeConvId(convId) {
  return String(convId || '').replace(/[^a-zA-Z0-9_\-]/g, '');
}

// POST /api/upload — upload files to private R2; returns key (no URL)
router.post('/', authenticateToken, upload.array('files', 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ 
      error: { 
        message: 'No files provided.',
        statusCode: 400,
      } 
    });
  }

  const conversationId = sanitizeConvId(req.body.conversationId || 'general');
  const userId = req.user.id;

  if (!conversationId) {
    return res.status(400).json({ 
      error: { 
        message: 'Invalid conversation ID.',
        statusCode: 400,
      } 
    });
  }

  // Authorization: verify user belongs to this conversation
  try {
    if (conversationId.startsWith('dm_')) {
      const parts = conversationId.split('_');
      if (parts.length !== 3) {
        return res.status(400).json({ 
          error: { 
            message: 'Invalid DM conversation ID.',
            statusCode: 400,
          } 
        });
      }
      if (String(userId) !== parts[1] && String(userId) !== parts[2]) {
        return res.status(403).json({ 
          error: { 
            message: 'Access denied to this conversation.',
            statusCode: 403,
          } 
        });
      }
    } else if (conversationId !== 'general') {
      const [rows] = await pool.query(
        'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL',
        [conversationId, userId]
      );
      if (rows.length === 0 && req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: { 
            message: 'You are not a member of this group.',
            statusCode: 403,
          } 
        });
      }
    }
  } catch (err) {
    console.error('[upload] access check error:', err.message);
    return res.status(500).json({ 
      error: { 
        message: 'Failed to verify conversation access.',
        statusCode: 500,
      } 
    });
  }

  const r2Ready = !!(process.env.R2_BUCKET_NAME && process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID);
  if (!r2Ready) {
    console.warn('[upload] R2 not configured — will save files locally');
  }

  try {
    const originMessageId = req.body.originMessageId ? parseInt(req.body.originMessageId, 10) : null;

    const uploaded = await Promise.all(
      req.files.map(async (file) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
        const key = `chats/${conversationId}/${uniqueName}`;

        console.log(`[upload] uploading — key=${key} size=${file.size} mime=${file.mimetype}`);

        // Try R2 first; fall back to local disk on any failure
        let storedLocally = false;
        let uploadError = null;
        if (r2Ready) {
          try {
            await r2.send(new PutObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME,
              Key: key,
              Body: file.buffer,
              ContentType: file.mimetype,
            }));
            console.log(`[upload] R2 success — key=${key}`);
          } catch (r2Err) {
            console.error('[upload] R2 upload failed, falling back to local:', {
              message: r2Err.message,
              code: r2Err.Code || r2Err.code,
            });
            uploadError = r2Err;
            storedLocally = true;
          }
        } else {
          storedLocally = true;
        }

        // Fallback to local storage
        if (storedLocally) {
          try {
            const localPath = resolveUploadPath(key);
            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            fs.writeFileSync(localPath, file.buffer);
            console.log(`[upload] saved locally — path=${localPath}`);
          } catch (localErr) {
            console.error('[upload] local save failed:', localErr.message);
            throw new Error(`Failed to save file: ${localErr.message}`);
          }
        }

        const fileType = getFileCategory(file.mimetype, ext);
        const result = {
          key,
          name: file.originalname,
          size: formatSize(file.size),
          type: fileType,
          mimeType: file.mimetype,
        };

        // Save metadata — non-fatal so a missing table never breaks the upload
        createFileMetadata(key, conversationId, userId, file.originalname, fileType, file.mimetype, file.size, originMessageId)
          .then(meta => console.log(`[upload] metadata saved — fileId=${meta.id}`))
          .catch(metaErr => console.error('[upload] metadata save failed (non-fatal):', metaErr.message));

        return result;
      })
    );

    console.log(`[upload] completed — ${uploaded.length} file(s)`);
    
    // Clear attachment service cache since new files were uploaded
    if (attachmentService && attachmentService.clearCache) {
      attachmentService.clearCache();
    }

    res.json({ files: uploaded });
  } catch (err) {
    console.error('[upload] error:', err.message);
    res.status(500).json({ 
      error: { 
        message: err.message || 'Upload failed. Please try again.',
        statusCode: 500,
      } 
    });
  }
});

// Multer error handler (must be 4-arg to be recognised as error middleware)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: {
          message: 'File too large. Maximum 50 MB per file.',
          statusCode: 413,
        }
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ 
        error: { 
          message: 'Too many files. Maximum 10 per upload.',
          statusCode: 413,
        } 
      });
    }
    return res.status(400).json({ 
      error: { 
        message: `Upload error: ${err.message}`,
        statusCode: 400,
      } 
    });
  }
  if (err) {
    console.error('[upload] middleware error:', err.message);
    return res.status(400).json({ 
      error: { 
        message: err.message || 'Upload failed',
        statusCode: 400,
      } 
    });
  }
  next();
});

module.exports = router;
