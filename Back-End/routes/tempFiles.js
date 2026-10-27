const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { HeadObjectCommand } = require('@aws-sdk/client-s3');
const { r2, generateSignedUrl, generateUploadUrl } = require('../config/r2');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../config/database');

const router = express.Router();

const MIN_EXPIRES_HOURS = 5 / 60; // 5 minutes — temporary, for testing the expiry/cleanup flow quickly
const MAX_EXPIRES_HOURS = 72; // 3 days — hard cap
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids visual ambiguity
const CODE_LENGTH = 8;

function generateCode() {
  let code = '';
  const bytes = crypto.randomBytes(CODE_LENGTH);
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

function buildKey(originalname) {
  const ext = path.extname(originalname).toLowerCase();
  const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const yearMonth = new Date().toISOString().slice(0, 7);
  return `temp/${yearMonth}/${uniqueName}`;
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// POST /api/temp-files/presign — mint a presigned PUT URL for a direct-to-R2 upload.
// No size limit here by design: temporary files are deliberately exempt from the chat
// per-user/workspace upload cap.
router.post('/presign', authenticateToken, async (req, res) => {
  const name = String(req.body?.name || 'file');
  const mimeType = String(req.body?.mimeType || 'application/octet-stream');

  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    return res.status(400).json({ error: { message: 'Invalid file name.', statusCode: 400 } });
  }

  try {
    const key = buildKey(name);
    const uploadUrl = await generateUploadUrl(key, mimeType);
    res.json({ key, uploadUrl });
  } catch (err) {
    console.error('[temp-files/presign] error:', err.message);
    res.status(500).json({ error: { message: 'Failed to prepare upload.', statusCode: 500 } });
  }
});

// POST /api/temp-files/complete — after the client PUTs the bytes to R2: verify, pick an expiry
// (capped at MAX_EXPIRES_HOURS), mint a unique share code, and record it.
router.post('/complete', authenticateToken, async (req, res) => {
  const key = String(req.body?.key || '');
  const name = String(req.body?.name || 'file');
  const mimeType = String(req.body?.mimeType || 'application/octet-stream');
  let expiresInHours = Number(req.body?.expiresInHours);
  if (!Number.isFinite(expiresInHours)) expiresInHours = MAX_EXPIRES_HOURS;
  expiresInHours = Math.min(MAX_EXPIRES_HOURS, Math.max(MIN_EXPIRES_HOURS, expiresInHours));

  if (!key.startsWith('temp/')) {
    return res.status(400).json({ error: { message: 'Invalid file key.', statusCode: 400 } });
  }

  try {
    const head = await r2.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
    const size = Number(head.ContentLength) || 0;
    const actualMimeType = head.ContentType || mimeType;

    let code;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateCode();
      const [existing] = await pool.query('SELECT id FROM temp_files WHERE code = ?', [candidate]);
      if (existing.length === 0) { code = candidate; break; }
    }
    if (!code) {
      return res.status(500).json({ error: { message: 'Could not generate a unique code. Try again.', statusCode: 500 } });
    }

    // MINUTE (not HOUR) so the 5-minute testing option isn't truncated to 0 by MySQL's
    // INTERVAL ... HOUR integer rounding.
    const expiresInMinutes = Math.round(expiresInHours * 60);
    const [result] = await pool.query(
      `INSERT INTO temp_files (code, r2_key, original_name, file_size, mime_type, uploader_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
      [code, key, name, size, actualMimeType, req.user.id, expiresInMinutes]
    );

    const [[row]] = await pool.query('SELECT expires_at FROM temp_files WHERE id = ?', [result.insertId]);

    res.json({ code, expiresAt: row.expires_at, name, size: formatSize(size) });
  } catch (err) {
    console.error('[temp-files/complete] error:', err.message);
    res.status(500).json({ error: { message: 'Failed to finalize upload.', statusCode: 500 } });
  }
});

// GET /api/temp-files/mine — this user's active (not-yet-expired) shares. Must be registered
// before the /:code route below, or Express would match "mine" as a code. Expired rows are
// never returned here because the cleanup sweep (tempFileCleanupService.js) deletes them
// outright — there's nothing to filter, the record simply stops existing once it expires.
router.get('/mine', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT code, original_name AS name, file_size AS size, mime_type AS mimeType, created_at AS createdAt, expires_at AS expiresAt
       FROM temp_files WHERE uploader_id = ? AND expires_at > UTC_TIMESTAMP() ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ files: rows.map(r => ({ ...r, size: formatSize(r.size) })) });
  } catch (err) {
    console.error('[temp-files/mine] error:', err.message);
    res.status(500).json({ error: { message: 'Server error.', statusCode: 500 } });
  }
});

// GET /api/temp-files/:code — public lookup. No auth: the code itself is the access credential,
// same as any "share via link/code" file drop. Expired or unknown codes get the same 404 so a
// guesser can't tell a code "existed but expired" from "never existed".
router.get('/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  if (code.length !== CODE_LENGTH) {
    return res.status(404).json({ error: { message: 'Code not found or expired.', statusCode: 404 } });
  }

  try {
    const [[row]] = await pool.query(
      `SELECT tf.r2_key, tf.original_name, tf.file_size, tf.mime_type, tf.expires_at, u.name AS shared_by
       FROM temp_files tf
       JOIN users u ON u.id = tf.uploader_id
       WHERE tf.code = ? AND tf.expires_at > UTC_TIMESTAMP()`,
      [code]
    );
    if (!row) {
      return res.status(404).json({ error: { message: 'Code not found or expired.', statusCode: 404 } });
    }

    const url = await generateSignedUrl(row.r2_key, 60 * 5); // 5 min — just long enough to start the download
    res.json({
      url,
      name: row.original_name,
      size: formatSize(row.file_size),
      mimeType: row.mime_type,
      expiresAt: row.expires_at,
      sharedBy: row.shared_by,
    });
  } catch (err) {
    console.error('[temp-files/:code] error:', err.message);
    res.status(500).json({ error: { message: 'Server error.', statusCode: 500 } });
  }
});

module.exports = router;
