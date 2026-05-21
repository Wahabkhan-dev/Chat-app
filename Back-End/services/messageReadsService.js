const pool = require('../config/database');

/**
 * Message Reads Service - Track message read states and unread counts
 */

/**
 * Mark message as read by a user
 */
async function markMessageAsRead(messageId, userId) {
  try {
    const [result] = await pool.query(
      `INSERT IGNORE INTO message_reads (message_id, user_id, read_at)
       VALUES (?, ?, NOW())`,
      [messageId, userId]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Error marking message as read:', error.message);
    throw error;
  }
}

/**
 * Mark all messages in a conversation as read by a user
 */
async function markConversationAsRead(conversationId, userId) {
  try {
    const query = `
      INSERT IGNORE INTO message_reads (message_id, user_id, read_at)
      SELECT m.id, ?, NOW()
      FROM messages m
      WHERE m.conversation_id = ? AND m.is_deleted = 0 AND m.sender_id != ?
      AND NOT EXISTS (
        SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?
      )
    `;

    const [result] = await pool.query(query, [userId, conversationId, userId, userId]);
    return result.affectedRows;
  } catch (error) {
    console.error('Error marking conversation as read:', error.message);
    throw error;
  }
}

/**
 * Get unread count for a specific conversation
 */
async function getUnreadCount(conversationId, userId) {
  try {
    const [[{ unread_count }]] = await pool.query(
      `SELECT COUNT(m.id) as unread_count
       FROM messages m
       LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = ?
       WHERE m.conversation_id = ? AND m.is_deleted = 0 AND m.sender_id != ?
       AND mr.user_id IS NULL`,
      [userId, conversationId, userId]
    );

    return unread_count || 0;
  } catch (error) {
    console.error('Error getting unread count:', error.message);
    throw error;
  }
}

/**
 * Get unread counts for all conversations
 */
async function getAllUnreadCounts(userId) {
  try {
    const [results] = await pool.query(
      `SELECT
        m.conversation_id,
        COUNT(DISTINCT m.id) as unread_count,
        MAX(m.id) as last_message_id,
        MAX(m.created_at) as last_message_time
       FROM messages m
       LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = ?
       WHERE m.is_deleted = 0 AND m.sender_id != ?
       AND mr.user_id IS NULL
       GROUP BY m.conversation_id`,
      [userId, userId]
    );

    const unreadMap = {};
    results.forEach(row => {
      unreadMap[row.conversation_id] = {
        unread_count: row.unread_count,
        last_message_id: row.last_message_id,
        last_message_time: row.last_message_time?.toISOString(),
      };
    });

    return unreadMap;
  } catch (error) {
    console.error('Error getting all unread counts:', error.message);
    throw error;
  }
}

/**
 * Update last seen timestamp for a conversation
 */
async function updateLastSeen(conversationId, userId, messageId = null) {
  try {
    const [result] = await pool.query(
      `INSERT INTO conversation_last_seen (conversation_id, user_id, last_seen_at, last_message_id)
       VALUES (?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
       last_seen_at = NOW(),
       last_message_id = COALESCE(?, last_message_id),
       updated_at = NOW()`,
      [conversationId, userId, messageId, messageId]
    );

    return result.affectedRows > 0 || result.changedRows > 0;
  } catch (error) {
    console.error('Error updating last seen:', error.message);
    throw error;
  }
}

/**
 * Get last seen info for a conversation
 */
async function getLastSeen(conversationId, userId) {
  try {
    const [rows] = await pool.query(
      `SELECT last_seen_at, last_message_id FROM conversation_last_seen
       WHERE conversation_id = ? AND user_id = ?`,
      [conversationId, userId]
    );

    if (rows.length === 0) return null;

    return {
      lastSeenAt: rows[0].last_seen_at?.toISOString(),
      lastMessageId: rows[0].last_message_id,
    };
  } catch (error) {
    console.error('Error getting last seen:', error.message);
    throw error;
  }
}

/**
 * Get all last seen data for a user across all conversations
 */
async function getAllLastSeen(userId) {
  try {
    const [rows] = await pool.query(
      `SELECT conversation_id, last_seen_at, last_message_id FROM conversation_last_seen
       WHERE user_id = ?`,
      [userId]
    );

    const lastSeenMap = {};
    rows.forEach(row => {
      lastSeenMap[row.conversation_id] = {
        lastSeenAt: row.last_seen_at?.toISOString(),
        lastMessageId: row.last_message_id,
      };
    });

    return lastSeenMap;
  } catch (error) {
    console.error('Error getting all last seen:', error.message);
    throw error;
  }
}

module.exports = {
  markMessageAsRead,
  markConversationAsRead,
  getUnreadCount,
  getAllUnreadCounts,
  updateLastSeen,
  getLastSeen,
  getAllLastSeen,
};
