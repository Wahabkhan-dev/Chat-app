const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { r2 } = require('../config/r2');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });

const router = express.Router();
const sessionService = require('../services/sessionService');

// GET /api/users/directory — all users (active + inactive) for directory and DM list
router.get('/directory', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, avatar, status, department, is_active, created_at FROM users ORDER BY name ASC'
    );
    res.json({ users: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/users/search — search for users by name or email
router.get('/search/:query', authenticateToken, async (req, res) => {
  const { query } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  if (!query || query.length < 2) {
    return res.json({ results: [] });
  }

  try {
    const searchTerm = `%${query.toLowerCase()}%`;
    const [rows] = await pool.query(
      `SELECT id, name, email, role, avatar, status, department, is_active, created_at 
       FROM users 
       WHERE is_active = 1 
         AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(department) LIKE ?)
       ORDER BY 
         CASE WHEN LOWER(name) LIKE ? THEN 0 ELSE 1 END,
         name ASC
       LIMIT ?`,
      [searchTerm, searchTerm, searchTerm, `${query.toLowerCase()}%`, limit]
    );

    res.json({ results: rows });
  } catch (err) {
    console.error('GET /users/search error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/users — get all users (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, avatar, status, department, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/users — admin creates a new user
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { name, email, password, role, department, avatar } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  try {
    // Check if email already exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password, role, department, avatar, status, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 'offline', 1)`,
      [
        name.trim(),
        email.toLowerCase().trim(),
        hashedPassword,
        role || 'user',
        department || '',
        avatar || '',
      ]
    );

    const [newUser] = await pool.query(
      'SELECT id, name, email, role, avatar, status, department, is_active, created_at FROM users WHERE id = ?',
      [result.insertId]
    );

    // Persist notification in DB so offline users see it on next login
    await pool.query(
      'INSERT INTO notifications (type, recipient_id, title, body) VALUES (?, NULL, ?, ?)',
      [
        'user_joined',
        'New team member',
        `${newUser[0].name} (${newUser[0].department || newUser[0].role}) has joined the team!`,
      ]
    );

    // Notify all currently connected clients via socket
    const io = req.app.get('io');
    if (io) {
      io.emit('new_user', { user: newUser[0] });
    }

    res.status(201).json({ message: 'User created successfully.', user: newUser[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/users/:id — admin edits a user (name and email are immutable after creation)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { role, department, avatar } = req.body;
  const { id } = req.params;

  try {
    await pool.query(
      'UPDATE users SET role = ?, department = ?, avatar = ? WHERE id = ?',
      [role, department, avatar, id]
    );

    const [updated] = await pool.query(
      'SELECT id, name, email, role, avatar, status, department, is_active, created_at FROM users WHERE id = ?',
      [id]
    );

    const io = req.app.get('io');
    if (io) io.emit('user_updated', { user: updated[0] });

    res.json({ message: 'User updated.', user: updated[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/users/:id/deactivate — admin deactivates a user
router.put('/:id/deactivate', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE users SET is_active = 0 WHERE id = ?', [id]);

    // Invalidate all server-side sessions for this user so tokens/sessions are revoked
    try {
      await sessionService.invalidateAllUserSessions(id);
    } catch (e) {
      console.warn('[users] failed to invalidate sessions for user', id, e.message || e);
    }

    // Notify the user's personal socket room to force immediate logout
    const [rows] = await pool.query(
      'SELECT id, name, email, role, avatar, status, department, is_active, created_at FROM users WHERE id = ?',
      [id]
    );
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${id}`).emit('force_logout', { reason: 'account_deactivated' });
      if (rows && rows[0]) io.emit('user_updated', { user: rows[0] });
    }

    res.json({ message: 'User deactivated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/users/:id/reactivate — admin reactivates a user
router.put('/:id/reactivate', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE users SET is_active = 1 WHERE id = ?', [id]);

    const [rows] = await pool.query(
      'SELECT id, name, email, role, avatar, status, department, is_active, created_at FROM users WHERE id = ?',
      [id]
    );

    const io = req.app.get('io');
    if (io) {
      io.emit('user_reactivated', { userId: id });
      if (rows && rows[0]) io.emit('user_updated', { user: rows[0] });
    }

    res.json({ message: 'User reactivated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/users/me/avatar — upload current user's profile picture to R2
router.patch('/me/avatar', authenticateToken, avatarUpload.single('avatar'), async (req, res) => {
  const userId = req.user.id;
  if (!req.file) return res.status(400).json({ message: 'No file provided.' });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const key = `user-avatars/${userId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));
    await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [key, userId]);
    const [rows] = await pool.query(
      'SELECT id, name, email, role, avatar, status, department, is_active, created_at FROM users WHERE id = ? AND is_active = 1',
      [userId]
    );
    const io = req.app.get('io');
    if (io) io.emit('user_updated', { user: rows[0] });
    res.json({ message: 'Avatar updated.', user: rows[0], avatarKey: key });
  } catch (err) {
    console.error('[users] avatar upload error:', err.message);
    res.status(500).json({ message: 'Failed to upload avatar.' });
  }
});

// PATCH /api/users/:id/password — admin overrides a user's password
router.patch('/:id/password', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
    res.json({ message: 'Password updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/users/:id — admin permanently deletes a user
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM message_reactions WHERE user_id = ?', [id]);
    await pool.query('DELETE FROM messages WHERE sender_id = ?', [id]);
    await pool.query('DELETE FROM group_members WHERE user_id = ?', [id]);
    await pool.query('DELETE FROM notification_reads WHERE user_id = ?', [id]);
    await pool.query('DELETE FROM notifications WHERE recipient_id = ?', [id]);
    await pool.query('DELETE FROM users WHERE id = ?', [id]);

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${id}`).emit('force_logout', { reason: 'account_deleted' });
      io.emit('user_deleted', { userId: id });
    }

    res.json({ message: 'User permanently deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
