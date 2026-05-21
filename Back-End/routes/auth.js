const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { createSession, invalidateAllUserSessions, blacklistToken } = require('../services/sessionService');
const { getSettings, createDefaultSettings } = require('../services/settingsService');
require('dotenv').config();

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password, deviceInfo } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Create session in database
    const sessionInfo = await createSession(user.id, token, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
      deviceName: deviceInfo?.deviceName,
    });

    // Ensure user settings exist
    await getSettings(user.id).catch(() => createDefaultSettings(user.id));

    // Don't send password back
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful.',
      token,
      sessionId: sessionInfo.sessionId,
      expiresAt: sessionInfo.expiresAt,
      user: userWithoutPassword,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// GET /api/auth/me  — returns logged-in user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, avatar, status, department, created_at FROM users WHERE id = ? AND is_active = 1',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auth/refresh  — refresh the JWT token to extend session
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, role, avatar, status, department, is_active FROM users WHERE id = ? AND is_active = 1',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'User not found or inactive.' });
    }

    const user = rows[0];
    const newToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Create new session for refreshed token
    const sessionInfo = await createSession(user.id, newToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    res.json({
      message: 'Token refreshed.',
      token: newToken,
      sessionId: sessionInfo.sessionId,
      expiresAt: sessionInfo.expiresAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        status: user.status,
        department: user.department,
        is_active: user.is_active,
      },
    });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/auth/logout  — logout from current device (blacklist current token)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Blacklist the current token
    await blacklistToken(req.token);

    console.log(`User ${req.user.id} (${req.user.email}) logged out from current device`);

    res.json({
      message: 'Logged out successfully.',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ message: 'Server error during logout.' });
  }
});

// POST /api/auth/logout-all — logout from all devices (invalidate all sessions)
router.post('/logout-all', authenticateToken, async (req, res) => {
  try {
    const invalidatedCount = await invalidateAllUserSessions(req.user.id);

    console.log(`User ${req.user.id} (${req.user.email}) logged out from all devices (${invalidatedCount} sessions)`);

    res.json({
      message: 'Logged out from all devices successfully.',
      invalidatedSessions: invalidatedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Logout all error:', err);
    res.status(500).json({ message: 'Server error during logout.' });
  }
});

module.exports = router;
