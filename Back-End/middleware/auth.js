const jwt = require('jsonwebtoken');
const { isTokenBlacklisted, updateSessionActivity, hashToken } = require('../services/sessionService');
require('dotenv').config();

const authenticateToken = async (req, res, next) => {
  // Try to get token from Authorization header first (for API clients)
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.split(' ')[1]) {
    token = authHeader.split(' ')[1]; // Bearer TOKEN
  }

  // Fall back to HTTP-Only cookie (for browsers/mobile apps)
  if (!token && req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    // Verify JWT signature and expiration
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if token is blacklisted
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
      return res.status(403).json({ message: 'Token has been revoked. Please login again.' });
    }

    // Update session activity
    const tokenHash = hashToken(token);
    // Verify there's an active session row for this token
    const sessionActive = await (async () => {
      try {
        const pool = require('../config/database');
        const [rows] = await pool.query(`SELECT id FROM user_sessions WHERE token_hash = ? AND is_active = 1 AND expires_at > NOW() LIMIT 1`, [tokenHash]);
        return rows.length > 0;
      } catch (e) {
        console.error('Error checking session active state:', e.message || e);
        return true; // best-effort: if DB check fails, allow and continue
      }
    })();

    if (!sessionActive) {
      return res.status(403).json({ message: 'Session no longer active. Please login again.' });
    }

    updateSessionActivity(tokenHash).catch(err => {
      console.error('Error updating session activity:', err.message);
    });

    req.user = decoded;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ message: 'Token expired. Please refresh your token.' });
    }
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admins only.' });
  }
  next();
};

module.exports = { authenticateToken, requireAdmin };
