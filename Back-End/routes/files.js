const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { generateSignedUrl, r2 } = require('../config/r2');
const { GetObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../config/database');
const { createFileMetadata } = require('../services/fileMetadataService');

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const router = express.Router();

const SIGNED_URL_EXPIRY = 300; // 5 minutes

const ALLOWED_PREFIXES = ['chats/', 'group-avatars/', 'user-avatars/'];

const UPLOAD_ROOT = process.env.UPLOAD_ROOT
  ? path.resolve(process.env.UPLOAD_ROOT)
  : path.join(__dirname, '..', 'uploads');

function resolveStoragePath(key) {
  const candidate = path.resolve(UPLOAD_ROOT, key);
  if (!candidate.startsWith(UPLOAD_ROOT)) {
    throw new Error('Invalid file key path');
  }
  return candidate;
}

function isValidKey(key) {
  if (typeof key !== 'string') return false;
  if (key.includes('..') || key.includes('//')) return false;
  if (!ALLOWED_PREFIXES.some(p => key.startsWith(p))) return false;
  if (!/^[\w\-./]+$/.test(key)) return false;
  return true;
}

async function checkAccess(key, userId, userRole, pool) {
  if (key.startsWith('user-avatars/')) return; // any authenticated user can view profile pictures
  if (key.startsWith('group-avatars/')) {
    const groupId = key.split('/')[1];
    if (!groupId) throw { status: 400, message: 'Invalid key.' };
    if (userRole !== 'admin') {
      const [rows] = await pool.query('SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL', [groupId, userId]);
      if (!rows.length) throw { status: 403, message: 'Access denied.' };
    }
    return;
  }
  // chats/ key
  const parts = key.split('/');
  const conversationId = parts.length >= 3 ? parts[1] : null;
  if (!conversationId) throw { status: 400, message: 'Cannot determine conversation from key.' };
  if (conversationId.startsWith('dm_')) {
    const dmParts = conversationId.split('_');
    if (String(userId) !== dmParts[1] && String(userId) !== dmParts[2]) {
      if (userRole !== 'admin') throw { status: 403, message: 'Access denied.' };
      // Admins can access DM files for moderation (consistent with group file access)
    }
  } else if (userRole !== 'admin') {
    const [rows] = await pool.query('SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL', [conversationId, userId]);
    if (!rows.length) throw { status: 403, message: 'Access denied.' };
  }
}

// GET /api/files/shared — list all shared files user has access to (from conversations)
router.get('/shared', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Load all shared messages for conversations the user has access to,
    // without requiring any chat to be opened first.
    const [messages] = await pool.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.files, m.links, m.created_at
       FROM messages m
       WHERE m.is_deleted = 0
         AND (m.files IS NOT NULL OR m.links IS NOT NULL)
         AND (
           (m.conversation_id LIKE 'dm_%' AND (
             m.conversation_id LIKE CONCAT('dm_', ?, '_%') OR
             m.conversation_id LIKE CONCAT('dm_%_', ?)
           ))
           OR m.conversation_id IN (
             SELECT group_id FROM group_members WHERE user_id = ? AND left_at IS NULL
           )
         )
       ORDER BY m.created_at DESC`,
      [userId, userId, userId]
    );

    // Collect unique conversation IDs to fetch their metadata
    const conversationIds = [...new Set(messages.map(m => m.conversation_id))];
    const groupIds = conversationIds.filter(id => !id.startsWith('dm_'));
    const dmIds = conversationIds.filter(id => id.startsWith('dm_'));

    // Fetch group names
    const groupMap = {};
    if (groupIds.length > 0) {
      const [groups] = await pool.query(
        `SELECT id, name FROM \`groups\` WHERE id IN (?)`,
        [groupIds]
      );
      groups.forEach(g => groupMap[g.id] = g.name);
    }

    // Fetch user names for DMs
    const userMap = {};
    if (dmIds.length > 0) {
      const userIds = new Set();
      dmIds.forEach(id => {
        const parts = id.split('_');
        userIds.add(parts[1]);
        userIds.add(parts[2]);
      });

      if (userIds.size > 0) {
        const [users] = await pool.query(
          `SELECT id, name FROM users WHERE id IN (?)`,
          [[...userIds]]
        );
        users.forEach(u => userMap[u.id] = u.name);
      }
    }

    // Helper function to get conversation display name
    const getConvName = (convId) => {
      if (groupMap[convId]) return groupMap[convId];

      if (convId.startsWith('dm_')) {
        const parts = convId.split('_');
        const otherUserId = parts[1] === String(userId) ? parts[2] : parts[1];
        return userMap[otherUserId] || convId;
      }

      return convId;
    };

    // Parse attachments and links from each message
    const allFiles = [];
    for (const msg of messages) {
      const conversationName = getConvName(msg.conversation_id);

      try {
        const files = JSON.parse(msg.files || '[]');
        if (Array.isArray(files)) {
          for (const file of files) {
            allFiles.push({
              id: `f_${msg.id}_${file.key || file.name}`,
              name: file.name,
              size: file.size || '',
              type: file.type || 'other',
              key: file.key,
              url: file.url,
              uploadedBy: msg.sender_id,
              conversationId: msg.conversation_id,
              conversationName,
              messageId: msg.id,
              timestamp: msg.created_at,
            });
          }
        }
      } catch (e) {
        console.warn('Error parsing files from message:', e.message);
      }

      try {
        const links = JSON.parse(msg.links || '[]');
        if (Array.isArray(links)) {
          for (const link of links) {
            allFiles.push({
              id: `l_${msg.id}_${link.url}`,
              name: link.title || link.url,
              size: link.domain || '',
              type: 'link',
              url: link.url,
              uploadedBy: msg.sender_id,
              conversationId: msg.conversation_id,
              conversationName,
              messageId: msg.id,
              timestamp: msg.created_at,
              previewUrl: link.url,
            });
          }
        }
      } catch (e) {
        console.warn('Error parsing links from message:', e.message);
      }
    }

    res.json({ files: allFiles });
  } catch (err) {
    console.error('[files] shared error:', err.message);
    res.status(500).json({ message: 'Could not fetch shared files.' });
  }
});

// POST /api/files/copy — server-side R2 copy for forwarded messages.
// Creates a fresh copy of each file under the destination conversation's path so
// the receiver can access it regardless of which conversation originally stored the file.
router.post('/copy', authenticateToken, async (req, res) => {
  const { keys, conversationId } = req.body;
  if (!Array.isArray(keys) || keys.length === 0 || !conversationId) {
    return res.status(400).json({ message: 'keys (array) and conversationId are required.' });
  }
  if (keys.some(k => !isValidKey(k))) {
    return res.status(400).json({ message: 'One or more file keys are invalid.' });
  }

  const userId   = req.user.id;
  const userRole = req.user.role;
  const bucket   = process.env.R2_BUCKET_NAME;

  try {
    const copied = await Promise.all(keys.map(async (srcKey) => {
      // Verify the requesting user has read access to the source file
      await checkAccess(srcKey, userId, userRole, pool);

      // Generate a new unique key under the destination conversation
      const ext     = path.extname(srcKey).toLowerCase();
      const newName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      const dstKey  = `chats/${conversationId}/${newName}`;

      // Server-side copy inside R2 — no client download/upload required
      await r2.send(new CopyObjectCommand({
        Bucket:     bucket,
        CopySource: `${bucket}/${srcKey}`,
        Key:        dstKey,
      }));

      // Carry over metadata from the original file_metadata row
      const [rows] = await pool.query(
        'SELECT original_name, file_type, mime_type, file_size FROM file_metadata WHERE r2_key = ? LIMIT 1',
        [srcKey]
      );
      const meta = rows[0];
      const originalName = meta?.original_name || path.basename(srcKey);
      const fileType     = meta?.file_type     || 'other';
      const mimeType     = meta?.mime_type     || 'application/octet-stream';
      const fileSize     = meta?.file_size     || 0;

      // Create metadata for the copy (origin_message_id will be set by send_message)
      createFileMetadata(dstKey, conversationId, userId, originalName, fileType, mimeType, fileSize)
        .catch(err => console.error('[files/copy] metadata save failed (non-fatal):', err.message));

      return { key: dstKey, name: originalName, size: formatSize(fileSize), type: fileType, mimeType };
    }));

    res.json({ files: copied });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error('[files/copy] error:', err.message || err);
    res.status(500).json({ message: 'File copy failed.' });
  }
});

// GET /api/files/url?key=... — returns a presigned R2 URL for private preview/download
router.get('/url', authenticateToken, async (req, res) => {
  const key = req.query.key;
  if (!isValidKey(key)) return res.status(400).json({ message: 'Invalid file key.' });
  try {
    await checkAccess(key, req.user.id, req.user.role, pool);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || 'Server error.' });
  }

  try {
    const signedUrl = await generateSignedUrl(key, SIGNED_URL_EXPIRY);
    res.json({ url: signedUrl, expiresIn: SIGNED_URL_EXPIRY, expiresAt: Date.now() + SIGNED_URL_EXPIRY * 1000, isPublic: false });
  } catch (err) {
    console.error('[files] presign failed, returning serve URL:', err.message);
    const rawToken = (req.headers.authorization || '').replace('Bearer ', '');
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0];
    const host = req.get('host') || `localhost:${process.env.PORT || 3001}`;
    const base = process.env.BASE_URL || `${proto}://${host}`;
    const serveUrl = `${base}/api/files/serve?key=${encodeURIComponent(key)}&t=${rawToken}`;
    res.json({ url: serveUrl, expiresIn: 3600, expiresAt: Date.now() + 3600 * 1000, fallback: true });
  }
});

// GET /api/files/download?key=...&filename=... — proxy R2 → client (no CORS needed)
router.get('/download', authenticateToken, async (req, res) => {
  const key = req.query.key;
  const filename = req.query.filename || 'download';
  if (!isValidKey(key)) return res.status(400).json({ message: 'Invalid file key.' });
  try {
    await checkAccess(key, req.user.id, req.user.role, pool);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || 'Server error.' });
  }
  try {
    const obj = await r2.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
    const safe = encodeURIComponent(filename);
    res.set('Content-Disposition', `attachment; filename="${safe}"; filename*=UTF-8''${safe}`);
    if (obj.ContentType) res.set('Content-Type', obj.ContentType);
    if (obj.ContentLength) res.set('Content-Length', String(obj.ContentLength));
    obj.Body.pipe(res);
  } catch (err) {
    console.error('[files] download error (R2):', err.message);
    // Fallback to local filesystem if present
    try {
      const localPath = resolveStoragePath(key);
      if (fs.existsSync(localPath)) {
        const stat = fs.statSync(localPath);
        const safe = encodeURIComponent(filename);
        res.set('Content-Disposition', `attachment; filename="${safe}"; filename*=UTF-8''${safe}`);
        res.set('Content-Type', 'application/octet-stream');
        res.set('Content-Length', String(stat.size));
        fs.createReadStream(localPath).pipe(res);
        return;
      }
    } catch (localErr) {
      console.error('[files] local fallback error:', localErr.message);
    }
    res.status(500).json({ message: 'Download failed.' });
  }
});

// GET /api/files/shared/metadata — list file_metadata entries (uploaded files not embedded in message JSON)
router.get('/shared/metadata', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT * FROM file_metadata fm
       WHERE (
         (fm.conversation_id LIKE 'dm_%' AND (
            fm.conversation_id LIKE CONCAT('dm_', ?, '_%') OR
            fm.conversation_id LIKE CONCAT('dm_%_', ?)
         ))
         OR fm.conversation_id IN (
           SELECT group_id FROM group_members WHERE user_id = ? AND left_at IS NULL
         )
       )
       ORDER BY fm.uploaded_at DESC`,
      [userId, userId, userId]
    );

    const files = rows.map(r => ({
      id: `m_${r.id}`,
      name: r.original_name,
      size: r.file_size ? String(r.file_size) : '',
      type: r.file_type || 'other',
      key: r.r2_key,
      url: null,
      uploadedBy: r.user_id,
      conversationId: r.conversation_id,
      messageId: r.origin_message_id || null,
      originMessageId: r.origin_message_id || null,
      timestamp: r.uploaded_at,
    }));

    res.json({ files });
  } catch (err) {
    console.error('[files] shared metadata error:', err.message);
    res.status(500).json({ message: 'Could not fetch shared files metadata.' });
  }
});

// GET /api/files/serve?key=...&t=<token> — inline proxy (Bearer header OR ?t= for <img src>)
router.get('/serve', async (req, res) => {
  let token = req.query.t;
  if (!token) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) token = auth.split(' ')[1];
  }
  if (!token) return res.status(401).json({ message: 'Unauthorized.' });

  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }

  const key = req.query.key;
  if (!isValidKey(key)) return res.status(400).json({ message: 'Invalid file key.' });

  try {
    await checkAccess(key, user.id, user.role, pool);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || 'Server error.' });
  }

  // Try R2
  try {
    const obj = await r2.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
    if (obj.ContentType) res.set('Content-Type', obj.ContentType);
    if (obj.ContentLength) res.set('Content-Length', String(obj.ContentLength));
    res.set('Cache-Control', 'private, max-age=300');
    obj.Body.pipe(res);
    return;
  } catch (r2Err) {
    // fall through to local
  }

  // Local fallback
  try {
    const localPath = path.join(UPLOAD_ROOT, key);
    if (fs.existsSync(localPath)) {
      const stat = fs.statSync(localPath);
      const ext = path.extname(key).toLowerCase();
      const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.txt': 'text/plain', '.csv': 'text/csv' };
      res.set('Content-Type', MIME[ext] || 'application/octet-stream');
      res.set('Content-Length', String(stat.size));
      res.set('Cache-Control', 'private, max-age=300');
      fs.createReadStream(localPath).pipe(res);
      return;
    }
  } catch (localErr) {
    console.error('[files] serve local error:', localErr.message);
  }

  res.status(404).json({ message: 'File not found.' });
});

module.exports = router;
