const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { createSession, invalidateAllUserSessions, blacklistToken } = require('../services/sessionService');
const { getSettings, createDefaultSettings } = require('../services/settingsService');
const { sendOTPEmail } = require('../services/emailService');
require('dotenv').config();

const router = express.Router();

function maskEmail(email) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/auth/login — verify credentials and send OTP
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
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

    // Check after password so we don't leak whether the email exists
    if (!user.is_active) {
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact an administrator to reactivate it.' });
    }

    // Generate and store OTP
    const otp = generateOTP();
    await pool.query('DELETE FROM login_otps WHERE user_id = ?', [user.id]);
    await pool.query(
      'INSERT INTO login_otps (user_id, email, otp_code, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
      [user.id, user.email, otp]
    );

    // Send OTP email
    await sendOTPEmail(user.email, otp, user.name);

    return res.json({
      success: true,
      requiresOTP: true,
      message: 'OTP sent to your email',
      maskedEmail: maskEmail(user.email),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/verify-otp — verify OTP and issue JWT
router.post('/verify-otp', async (req, res) => {
  const { email, otp_code } = req.body;

  if (!email || !otp_code) {
    return res.status(400).json({ message: 'Email and OTP code are required.' });
  }

  try {
    const [otpRows] = await pool.query(
      'SELECT * FROM login_otps WHERE email = ? AND is_used = 0 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email.toLowerCase().trim()]
    );

    if (otpRows.length === 0) {
      return res.status(401).json({ message: 'OTP expired. Please login again.' });
    }

    const record = otpRows[0];

    // Increment attempt count
    await pool.query('UPDATE login_otps SET attempts = attempts + 1 WHERE id = ?', [record.id]);
    const newAttempts = record.attempts + 1;

    if (String(record.otp_code) !== String(otp_code).trim()) {
      if (newAttempts >= 3) {
        await pool.query('UPDATE login_otps SET is_used = 1 WHERE id = ?', [record.id]);
        return res.status(401).json({ message: 'Too many incorrect attempts. Please login again.' });
      }
      const remaining = 3 - newAttempts;
      return res.status(401).json({
        message: `Incorrect OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      });
    }

    // OTP is correct — mark as used
    await pool.query('UPDATE login_otps SET is_used = 1 WHERE id = ?', [record.id]);

    // Fetch the user
    const [userRows] = await pool.query(
      'SELECT * FROM users WHERE id = ? AND is_active = 1',
      [record.user_id]
    );
    if (userRows.length === 0) {
      return res.status(401).json({ message: 'User not found or deactivated.' });
    }

    const user = userRows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const sessionInfo = await createSession(user.id, token, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    await getSettings(user.id).catch(() => createDefaultSettings(user.id));

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful.',
      token,
      sessionId: sessionInfo.sessionId,
      expiresAt: sessionInfo.expiresAt,
      user: userWithoutPassword,
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// POST /api/auth/resend-otp — rate-limited OTP resend
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    const [userRows] = await pool.query(
      'SELECT id, name, email FROM users WHERE email = ? AND is_active = 1',
      [email.toLowerCase().trim()]
    );

    if (userRows.length === 0) {
      // Return success to avoid leaking whether email exists
      return res.json({ success: true, message: 'If that email exists, a new OTP has been sent.' });
    }

    const user = userRows[0];

    // Rate limit: allow resend only if last OTP was created > 60 seconds ago
    const [lastRows] = await pool.query(
      'SELECT created_at FROM login_otps WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [user.id]
    );

    if (lastRows.length > 0) {
      const secondsSince = (Date.now() - new Date(lastRows[0].created_at).getTime()) / 1000;
      if (secondsSince < 60) {
        return res.status(429).json({ message: 'Please wait 60 seconds before requesting a new OTP.' });
      }
    }

    // Delete old OTPs and issue a new one
    await pool.query('DELETE FROM login_otps WHERE user_id = ?', [user.id]);
    const otp = generateOTP();
    await pool.query(
      'INSERT INTO login_otps (user_id, email, otp_code, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
      [user.id, user.email, otp]
    );

    await sendOTPEmail(user.email, otp, user.name);

    res.json({ success: true, message: 'New OTP sent to your email.' });
  } catch (err) {
    console.error('Resend OTP error:', err);
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
    await blacklistToken(req.token);
    console.log(`User ${req.user.id} (${req.user.email}) logged out from current device`);
    res.json({ message: 'Logged out successfully.', timestamp: new Date().toISOString() });
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
