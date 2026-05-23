const express = require('express');
const crypto = require('crypto');

// Sanitize text input
function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    .trim()
    .slice(0, 2000) // Limit to 2000 chars
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]+>/g, ''); // Remove all HTML tags
}

// Sanitize email
function sanitizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.toLowerCase().trim().slice(0, 255);
}

// Sanitize user input in request body
function validateAndSanitizeBody(allowedFields) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      req.body = {};
    }

    const sanitized = {};
    allowedFields.forEach(field => {
      if (field in req.body) {
        const value = req.body[field];
        if (field.includes('email')) {
          sanitized[field] = sanitizeEmail(value);
        } else if (typeof value === 'string') {
          sanitized[field] = sanitizeText(value);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          sanitized[field] = value;
        } else if (Array.isArray(value)) {
          sanitized[field] = value.map(v => 
            typeof v === 'string' ? sanitizeText(v) : v
          );
        }
      }
    });

    req.body = sanitized;
    next();
  };
}

// Validate required fields
function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => !req.body[f]);
    if (missing.length > 0) {
      return res.status(400).json({
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }
    next();
  };
}

// Validate message content
function validateMessage(req, res, next) {
  const { content, files } = req.body;
  
  if (!content?.trim() && (!files || files.length === 0)) {
    return res.status(400).json({ message: 'Message cannot be empty' });
  }

  if (content && content.length > 5000) {
    return res.status(400).json({ message: 'Message exceeds 5000 character limit' });
  }

  req.body.content = sanitizeText(content || '');
  next();
}

// Validate email format
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Validate group name
function validateGroupName(req, res, next) {
  const { name } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ message: 'Group name is required' });
  }

  if (name.length > 255) {
    return res.status(400).json({ message: 'Group name exceeds 255 characters' });
  }

  req.body.name = sanitizeText(name);
  next();
}

// Validate numeric IDs
function validateNumericId(paramName = 'id') {
  return (req, res, next) => {
    const id = req.params[paramName];
    const numId = parseInt(id);

    if (isNaN(numId) || numId <= 0) {
      return res.status(400).json({ message: `Invalid ${paramName}` });
    }

    req.params[paramName] = numId;
    next();
  };
}

/**
 * SECURE UPLOAD VALIDATION
 */

// Production Linux servers report different MIME types than macOS/Windows.
// Allowed MIME types — maps MIME to accepted extensions.
// A file passes if EITHER its MIME type is in this map OR its extension is in ALLOWED_EXTENSIONS.
const ALLOWED_MIME_TYPES = {
  // Images
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/jpg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'image/svg+xml': ['.svg'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tiff', '.tif'],
  'image/x-icon': ['.ico'],
  // Videos
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],        // macOS/Safari — .mov
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],       // Linux for .mkv
  'video/webm': ['.webm'],
  'video/mpeg': ['.mpeg', '.mpg'],
  'video/ogg': ['.ogv'],
  'video/3gpp': ['.3gp'],
  // Audio — Linux may use audio/x-wav, audio/x-m4a instead of audio/wav, audio/mp4
  'audio/mpeg': ['.mp3'],
  'audio/mp3': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/x-wav': ['.wav'],            // Linux variant for WAV
  'audio/ogg': ['.ogg'],
  'audio/webm': ['.webm'],
  'audio/aac': ['.aac'],
  'audio/mp4': ['.m4a', '.mp4'],
  'audio/x-m4a': ['.m4a'],           // macOS variant for M4A
  'audio/flac': ['.flac'],
  'audio/x-flac': ['.flac'],
  // Documents
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'text/plain': ['.txt', '.md', '.rtf'],
  'text/csv': ['.csv'],
  'text/markdown': ['.md'],
  'application/rtf': ['.rtf'],
  // Archives
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],   // Windows ZIP variant
  'application/x-zip': ['.zip'],
  'application/x-rar-compressed': ['.rar'],
  'application/vnd.rar': ['.rar'],            // Linux RAR variant
  'application/x-7z-compressed': ['.7z'],
  'application/x-tar': ['.tar'],
  'application/gzip': ['.gz'],
  'application/x-gzip': ['.gz'],
  // Fallback — production Linux sometimes reports octet-stream for valid files
  'application/octet-stream': ['.bin', '.dat'],
};

// Extension whitelist — used as fallback when MIME type is unknown/wrong
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.tif', '.ico',
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.mpeg', '.mpg', '.3gp',
  '.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.md', '.rtf', '.odt',
  '.zip', '.rar', '.7z', '.tar', '.gz',
]);

// File size limits by type (in bytes)
const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024, // 10 MB
  video: 100 * 1024 * 1024, // 100 MB
  audio: 25 * 1024 * 1024, // 25 MB
  document: 25 * 1024 * 1024, // 25 MB
  archive: 25 * 1024 * 1024, // 25 MB
  other: 5 * 1024 * 1024, // 5 MB
};

/**
 * Validate file upload security
 * Accepts a file if EITHER its MIME type is in the whitelist OR its extension is allowed.
 * This handles production Linux environments that report different MIME types than local.
 */
function validateFileUpload(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Prevent path traversal attempts (checked first, before any file access)
  if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
    return { valid: false, error: 'Invalid file name' };
  }

  // Check file size (max 100 MB)
  if (file.size > 100 * 1024 * 1024) {
    return { valid: false, error: 'File exceeds maximum size of 100MB' };
  }

  const mimeType = file.mimetype || 'application/octet-stream';
  const ext = require('path').extname(file.originalname).toLowerCase();

  // Pass if MIME type is in whitelist OR extension is in allowed set
  // This covers production Linux reporting different MIME types (e.g. audio/x-wav vs audio/wav)
  const mimeAllowed = Boolean(ALLOWED_MIME_TYPES[mimeType]);
  const extAllowed = ALLOWED_EXTENSIONS.has(ext);

  if (!mimeAllowed && !extAllowed) {
    return { valid: false, error: `File type not allowed: ${mimeType} (${ext || 'no extension'})` };
  }

  // Magic bytes check — only for known image MIME types to prevent MIME spoofing
  // Skip for octet-stream and types where production MIME detection is unreliable
  const IMAGE_SIGNATURES = {
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/gif': [0x47, 0x49, 0x46],
  };
  const expectedSig = IMAGE_SIGNATURES[mimeType];
  if (expectedSig && file.buffer && file.buffer.length >= expectedSig.length) {
    const fileSig = Array.from(file.buffer.slice(0, expectedSig.length));
    if (!fileSig.every((byte, i) => byte === expectedSig[i])) {
      return { valid: false, error: 'File content does not match declared type' };
    }
  }

  return { valid: true };
}

/**
 * Validate multiple files for batch upload
 */
function validateFilesBatch(files = []) {
  if (!Array.isArray(files)) {
    return { valid: false, error: 'Files must be an array' };
  }

  if (files.length > 10) {
    return { valid: false, error: 'Maximum 10 files per upload' };
  }

  if (files.length === 0) {
    return { valid: false, error: 'At least one file required' };
  }

  let totalSize = 0;
  for (const file of files) {
    const validation = validateFileUpload(file);
    if (!validation.valid) {
      return validation;
    }
    totalSize += file.size;
  }

  // Check total batch size (50 MB max)
  if (totalSize > 50 * 1024 * 1024) {
    return { valid: false, error: 'Total file size exceeds 50MB limit' };
  }

  return { valid: true, totalSize };
}

/**
 * Middleware for validating file uploads
 */
function validateUploadMiddleware(req, res, next) {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ 
      error: { 
        message: 'No files provided',
        statusCode: 400,
      } 
    });
  }

  const validation = validateFilesBatch(req.files);
  if (!validation.valid) {
    return res.status(400).json({
      error: {
        message: validation.error,
        statusCode: 400,
      }
    });
  }

  // Attach validation result to request
  req.uploadValidation = validation;
  next();
}

/**
 * Validate conversation ID format
 */
function validateConversationId(req, res, next) {
  const conversationId = req.body?.conversationId || req.params?.conversationId;

  if (!conversationId) {
    return res.status(400).json({ message: 'Conversation ID is required' });
  }

  // For DMs: dm_num_num format
  if (conversationId.startsWith('dm_')) {
    const parts = conversationId.split('_');
    if (parts.length !== 3 || !Number.isInteger(parseInt(parts[1])) || !Number.isInteger(parseInt(parts[2]))) {
      return res.status(400).json({ message: 'Invalid DM conversation ID format' });
    }
  } else {
    // For groups: numeric
    if (!Number.isInteger(parseInt(conversationId)) || parseInt(conversationId) <= 0) {
      return res.status(400).json({ message: 'Invalid group ID' });
    }
  }

  next();
}

module.exports = {
  sanitizeText,
  sanitizeEmail,
  validateAndSanitizeBody,
  requireFields,
  validateMessage,
  isValidEmail,
  validateGroupName,
  validateNumericId,
  validateFileUpload,
  validateFilesBatch,
  validateUploadMiddleware,
  validateConversationId,
  ALLOWED_MIME_TYPES,
  FILE_SIZE_LIMITS,
};
