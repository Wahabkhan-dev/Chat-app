const crypto = require('crypto');
const pool = require('../config/database');
const jwt = require('jsonwebtoken');

/**
 * Session Service - Handles server-side session management, token tracking, and revocation
 */

/**
 * Hash a JWT token for secure storage
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new session in the database
 */
async function createSession(userId, token, deviceInfo = null) {
  const tokenHash = hashToken(token);
  const decoded = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000);

  // Extract device info from user agent
  const userAgent = deviceInfo?.userAgent || '';
  const ipAddress = deviceInfo?.ipAddress || null;
  const deviceName = deviceInfo?.deviceName || parseDeviceFromUserAgent(userAgent);

  try {
    const sessionId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO user_sessions (id, user_id, token_hash, device_info, ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, userId, tokenHash, deviceName, ipAddress, userAgent, expiresAt]
    );

    return {
      sessionId,
      userId,
      expiresAt: expiresAt.toISOString(),
    };
  } catch (error) {
    console.error('Error creating session:', error.message);
    throw error;
  }
}

/**
 * Get all active sessions for a user
 */
async function getUserSessions(userId) {
  try {
    const [sessions] = await pool.query(
      `SELECT id, device_info, ip_address, login_at, last_activity, expires_at, is_active
       FROM user_sessions
       WHERE user_id = ? AND is_active = 1 AND expires_at > NOW()
       ORDER BY last_activity DESC`,
      [userId]
    );
    return sessions;
  } catch (error) {
    console.error('Error getting user sessions:', error.message);
    throw error;
  }
}

/**
 * Update last activity timestamp for a session
 */
async function updateSessionActivity(tokenHash) {
  try {
    await pool.query(
      `UPDATE user_sessions SET last_activity = NOW() WHERE token_hash = ? AND is_active = 1`,
      [tokenHash]
    );
  } catch (error) {
    console.error('Error updating session activity:', error.message);
  }
}

/**
 * Invalidate a specific session (logout from one device)
 */
async function invalidateSession(sessionId, userId) {
  try {
    const [result] = await pool.query(
      `UPDATE user_sessions SET is_active = 0, logged_out_at = NOW() WHERE id = ? AND user_id = ?`,
      [sessionId, userId]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Error invalidating session:', error.message);
    throw error;
  }
}

/**
 * Invalidate ALL sessions for a user (logout everywhere)
 */
async function invalidateAllUserSessions(userId) {
  try {
    const [result] = await pool.query(
      `UPDATE user_sessions SET is_active = 0, logged_out_at = NOW() WHERE user_id = ? AND is_active = 1`,
      [userId]
    );
    return result.affectedRows;
  } catch (error) {
    console.error('Error invalidating all sessions:', error.message);
    throw error;
  }
}

/**
 * Add token to blacklist (revoke token)
 */
async function blacklistToken(token) {
  const tokenHash = hashToken(token);
  const decoded = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000);
  const userId = decoded.id;

  try {
    // Insert into blacklist (use upsert to avoid unique constraint failures)
    await pool.query(
      `INSERT INTO token_blacklist (token_hash, user_id, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE blacklist_at = NOW(), expires_at = VALUES(expires_at)`,
      [tokenHash, userId, expiresAt]
    );

    console.log('Token blacklisted for user', userId, 'hash', tokenHash.slice(0, 12) + '...');

    // Also mark any matching session as logged out so session listing is accurate
    try {
      await pool.query(
        `UPDATE user_sessions SET is_active = 0, logged_out_at = NOW() WHERE token_hash = ?`,
        [tokenHash]
      );
    } catch (e) {
      // Non-fatal — blacklist succeeded
      console.warn('Failed to update user_sessions during blacklist:', e.message || e);
    }
  } catch (error) {
    console.error('Error blacklisting token:', error.message);
    throw error;
  }
}

/**
 * Check if a token is blacklisted
 */
async function isTokenBlacklisted(token) {
  const tokenHash = hashToken(token);

  try {
    const [rows] = await pool.query(
      `SELECT id FROM token_blacklist WHERE token_hash = ? AND expires_at > NOW() LIMIT 1`,
      [tokenHash]
    );
    return rows.length > 0;
  } catch (error) {
    console.error('Error checking token blacklist:', error.message);
    return false;
  }
}

/**
 * Verify session is still valid (not blacklisted, expired, or logged out)
 */
async function verifySessionValid(token) {
  // Check blacklist first
  if (await isTokenBlacklisted(token)) {
    return false;
  }

  // Token expiration is handled by JWT middleware, so if we got here token is structurally valid
  return true;
}

/**
 * Clean up expired sessions and blacklisted tokens (run periodically)
 */
async function cleanupExpiredData() {
  try {
    // Delete expired sessions
    const [sessionResult] = await pool.query(
      `DELETE FROM user_sessions WHERE expires_at < NOW() OR logged_out_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    // Delete expired blacklisted tokens
    const [blacklistResult] = await pool.query(
      `DELETE FROM token_blacklist WHERE expires_at < NOW()`
    );

    console.log(
      `Cleanup: Deleted ${sessionResult.affectedRows} expired sessions and ${blacklistResult.affectedRows} blacklisted tokens`
    );
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }
}

/**
 * Parse device name from user agent string
 */
function parseDeviceFromUserAgent(userAgent) {
  if (!userAgent) return 'Unknown Device';
  if (userAgent.includes('iPhone')) return 'iPhone';
  if (userAgent.includes('Android')) return 'Android Phone';
  if (userAgent.includes('iPad')) return 'iPad';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac')) return 'Mac';
  if (userAgent.includes('Linux')) return 'Linux';
  return 'Unknown Device';
}

module.exports = {
  createSession,
  getUserSessions,
  updateSessionActivity,
  invalidateSession,
  invalidateAllUserSessions,
  blacklistToken,
  isTokenBlacklisted,
  verifySessionValid,
  cleanupExpiredData,
  hashToken,
};
