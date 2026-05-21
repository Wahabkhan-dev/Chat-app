const pool = require('../config/database');

/**
 * Conversation Metadata Service - Manage muting, pinning, blocking, hiding conversations
 */

/**
 * Get or create conversation metadata for a user
 */
async function getMetadata(conversationId, userId) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM conversation_metadata WHERE conversation_id = ? AND user_id = ?`,
      [conversationId, userId]
    );

    if (rows.length === 0) {
      // Return default metadata
      return {
        conversationId,
        userId,
        is_muted: false,
        muted_until: null,
        is_pinned: false,
        is_blocked: false,
        is_hidden: false,
      };
    }

    return formatMetadata(rows[0]);
  } catch (error) {
    console.error('Error getting conversation metadata:', error.message);
    throw error;
  }
}

/**
 * Set mute status for a conversation
 */
async function setMuteStatus(conversationId, userId, isMuted, mutedUntil = null) {
  try {
    const [result] = await pool.query(
      `INSERT INTO conversation_metadata (conversation_id, user_id, is_muted, muted_until, updated_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
       is_muted = ?,
       muted_until = ?,
       updated_at = NOW()`,
      [conversationId, userId, isMuted ? 1 : 0, mutedUntil, isMuted ? 1 : 0, mutedUntil]
    );

    return result.affectedRows > 0 || result.changedRows > 0;
  } catch (error) {
    console.error('Error setting mute status:', error.message);
    throw error;
  }
}

/**
 * Set pin status for a conversation
 */
async function setPinStatus(conversationId, userId, isPinned) {
  try {
    const [result] = await pool.query(
      `INSERT INTO conversation_metadata (conversation_id, user_id, is_pinned, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
       is_pinned = ?,
       updated_at = NOW()`,
      [conversationId, userId, isPinned ? 1 : 0, isPinned ? 1 : 0]
    );

    return result.affectedRows > 0 || result.changedRows > 0;
  } catch (error) {
    console.error('Error setting pin status:', error.message);
    throw error;
  }
}

/**
 * Set block status for a conversation
 */
async function setBlockStatus(conversationId, userId, isBlocked) {
  try {
    const [result] = await pool.query(
      `INSERT INTO conversation_metadata (conversation_id, user_id, is_blocked, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
       is_blocked = ?,
       updated_at = NOW()`,
      [conversationId, userId, isBlocked ? 1 : 0, isBlocked ? 1 : 0]
    );

    return result.affectedRows > 0 || result.changedRows > 0;
  } catch (error) {
    console.error('Error setting block status:', error.message);
    throw error;
  }
}

/**
 * Set hidden status for a conversation
 */
async function setHiddenStatus(conversationId, userId, isHidden) {
  try {
    const [result] = await pool.query(
      `INSERT INTO conversation_metadata (conversation_id, user_id, is_hidden, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
       is_hidden = ?,
       updated_at = NOW()`,
      [conversationId, userId, isHidden ? 1 : 0, isHidden ? 1 : 0]
    );

    return result.affectedRows > 0 || result.changedRows > 0;
  } catch (error) {
    console.error('Error setting hidden status:', error.message);
    throw error;
  }
}

/**
 * Get all metadata for a user across all conversations
 */
async function getAllMetadataForUser(userId) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM conversation_metadata WHERE user_id = ?`,
      [userId]
    );

    const metadataMap = {};
    rows.forEach(row => {
      metadataMap[row.conversation_id] = formatMetadata(row);
    });

    return metadataMap;
  } catch (error) {
    console.error('Error getting all metadata for user:', error.message);
    throw error;
  }
}

/**
 * Get pinned conversations for a user
 */
async function getPinnedConversations(userId) {
  try {
    const [rows] = await pool.query(
      `SELECT conversation_id FROM conversation_metadata
       WHERE user_id = ? AND is_pinned = 1
       ORDER BY updated_at DESC`,
      [userId]
    );

    return rows.map(row => row.conversation_id);
  } catch (error) {
    console.error('Error getting pinned conversations:', error.message);
    throw error;
  }
}

/**
 * Get muted conversations for a user
 */
async function getMutedConversations(userId) {
  try {
    const [rows] = await pool.query(
      `SELECT conversation_id, muted_until FROM conversation_metadata
       WHERE user_id = ? AND is_muted = 1
       AND (muted_until IS NULL OR muted_until > NOW())`,
      [userId]
    );

    const mutedMap = {};
    rows.forEach(row => {
      mutedMap[row.conversation_id] = row.muted_until?.toISOString() || null;
    });

    return mutedMap;
  } catch (error) {
    console.error('Error getting muted conversations:', error.message);
    throw error;
  }
}

/**
 * Format conversation metadata row
 */
function formatMetadata(row) {
  return {
    conversationId: row.conversation_id,
    userId: row.user_id,
    isMuted: row.is_muted === 1,
    mutedUntil: row.muted_until?.toISOString() || null,
    isPinned: row.is_pinned === 1,
    isBlocked: row.is_blocked === 1,
    isHidden: row.is_hidden === 1,
    updatedAt: row.updated_at?.toISOString(),
  };
}

module.exports = {
  getMetadata,
  setMuteStatus,
  setPinStatus,
  setBlockStatus,
  setHiddenStatus,
  getAllMetadataForUser,
  getPinnedConversations,
  getMutedConversations,
};
