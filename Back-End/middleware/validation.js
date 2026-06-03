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

// File size limit: 100 MB per file
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// FILE_SIZE_LIMITS kept for reference / future per-type enforcement
const FILE_SIZE_LIMITS = {
  image: MAX_FILE_SIZE,
  video: MAX_FILE_SIZE,
  audio: MAX_FILE_SIZE,
  document: MAX_FILE_SIZE,
  archive: MAX_FILE_SIZE,
  other: MAX_FILE_SIZE,
};

// ALLOWED_MIME_TYPES / ALLOWED_EXTENSIONS kept for reference; no longer used as a blocklist.
// The system accepts any file type — validation is size-based + security checks only.
const ALLOWED_MIME_TYPES = {};
const ALLOWED_EXTENSIONS = new Set();

/**
 * Validate file upload security.
 * Accepts any file type; blocks only:
 *   1. Path traversal attacks in the filename
 *   2. Files exceeding 50 MB
 *   3. Image files whose magic bytes do not match their declared MIME type (prevents spoofing)
 */
function validateFileUpload(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Prevent path traversal attempts
  if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
    return { valid: false, error: 'Invalid file name' };
  }

  // Enforce 100 MB per-file limit (only meaningful when buffer is available; multer enforces it earlier)
  if (file.size && file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File exceeds maximum size of 100 MB' };
  }

  // Magic bytes check — only for declared image MIME types to prevent MIME spoofing
  const mimeType = file.mimetype || '';
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
