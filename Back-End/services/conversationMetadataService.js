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
 * Touch (upsert) a conversation_metadata row for a user, creating it if absent.
 * Called when a user sends a message or the recipient receives one — this is what
 * moves a DM from the Users section to the Chats section in the sidebar.
 * Does NOT touch is_unread so it is safe to call for both sender and recipient,
 * and works even before the is_unread column has been added via ALTER TABLE.
 * Non-fatal: errors are swallowed so they never block message delivery.
 */
async function touchConversation(conversationId, userId) {
  try {
    await pool.query(
      `INSERT INTO conversation_metadata (conversation_id, user_id, updated_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE updated_at = NOW()`,
      [conversationId, userId]
    );
  } catch (error) {
    console.error('Error touching conversation metadata:', error.message);
  }
}

/**
 * Clear the manual unread flag when a user opens a conversation.
 * Separated from touchConversation so that recipients are never accidentally
 * marked as read when a new message arrives.
 * Non-fatal: errors are swallowed, and the UPDATE is a no-op if is_unread column
 * has not been added yet.
 */
async function clearConversationUnread(conversationId, userId) {
  try {
    await pool.query(
      `UPDATE conversation_metadata SET is_unread = 0, updated_at = NOW()
       WHERE conversation_id = ? AND user_id = ? AND is_unread = 1`,
      [conversationId, userId]
    );
  } catch {
    // is_unread column may not exist yet — non-fatal
  }
}

/**
 * Set the manual unread flag for a conversation.
 * is_unread = 1 → user explicitly marked this conversation as unread.
 * is_unread = 0 → cleared when they open the conversation (via touchConversation).
 */
async function setUnreadStatus(conversationId, userId, isUnread) {
  try {
    const [result] = await pool.query(
      `INSERT INTO conversation_metadata (conversation_id, user_id, is_unread, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE is_unread = ?, updated_at = NOW()`,
      [conversationId, userId, isUnread ? 1 : 0, isUnread ? 1 : 0]
    );
    return result.affectedRows > 0 || result.changedRows > 0;
  } catch (error) {
    console.error('Error setting unread status:', error.message);
    throw error;
  }
}

/**
 * Get all conversations the user has interacted with, enriched with the latest message
 * preview. Covers both DMs (via conversation_metadata rows) and groups (via group_members).
 * The lastMessage data is used by the sidebar to sort conversations by recency.
 */
async function getConversationList(userId) {
  try {
    const [rows] = await pool.query(
      `(
         SELECT
           cm.conversation_id,
           MAX(m.created_at) AS last_message_at,
           SUBSTRING_INDEX(
             GROUP_CONCAT(
               CASE WHEN m.is_deleted = 1 THEN 'This message was deleted' ELSE m.content END
               ORDER BY m.created_at DESC SEPARATOR '||'
             ),
             '||', 1
           ) AS last_content,
           SUBSTRING_INDEX(
             GROUP_CONCAT(CAST(m.sender_id AS CHAR) ORDER BY m.created_at DESC SEPARATOR '||'),
             '||', 1
           ) AS last_sender_id
         FROM conversation_metadata cm
         LEFT JOIN messages m
           ON m.conversation_id = cm.conversation_id
         WHERE cm.user_id = ? AND cm.conversation_id LIKE 'dm_%'
         GROUP BY cm.conversation_id, cm.updated_at
       )
       UNION ALL
       (
         SELECT
           gm.group_id AS conversation_id,
           MAX(m.created_at) AS last_message_at,
           SUBSTRING_INDEX(
             GROUP_CONCAT(
               CASE WHEN m.is_deleted = 1 THEN 'This message was deleted' ELSE m.content END
               ORDER BY m.created_at DESC SEPARATOR '||'
             ),
             '||', 1
           ) AS last_content,
           SUBSTRING_INDEX(
             GROUP_CONCAT(CAST(m.sender_id AS CHAR) ORDER BY m.created_at DESC SEPARATOR '||'),
             '||', 1
           ) AS last_sender_id
         FROM group_members gm
         LEFT JOIN messages m
           ON m.conversation_id = gm.group_id
         WHERE gm.user_id = ? AND gm.left_at IS NULL
         GROUP BY gm.group_id
       )
       ORDER BY COALESCE(last_message_at, '1970-01-01') DESC
       LIMIT 500`,
      [userId, userId]
    );

    return rows.map(row => ({
      conversationId: row.conversation_id,
      type: row.conversation_id.startsWith('dm_') ? 'dm' : 'group',
      lastMessageAt: row.last_message_at ? row.last_message_at.toISOString() : null,
      lastMessageContent: row.last_content || '',
      lastMessageSenderId: row.last_sender_id ? String(row.last_sender_id) : '',
    }));
  } catch (error) {
    console.error('Error getting conversation list:', error.message);
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
    isUnread: row.is_unread === 1,
    updatedAt: row.updated_at?.toISOString(),
  };
}

module.exports = {
  getMetadata,
  setMuteStatus,
  setPinStatus,
  setBlockStatus,
  setHiddenStatus,
  setUnreadStatus,
  getAllMetadataForUser,
  getPinnedConversations,
  getMutedConversations,
  getConversationList,
  touchConversation,
  clearConversationUnread,
};
