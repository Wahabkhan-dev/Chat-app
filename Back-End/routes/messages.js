const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function parseLinksRow(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch { return []; }
}

async function verifyConversationAccess(userId, conversationId) {
  if (conversationId.startsWith('dm_')) {
    const parts = conversationId.split('_');
    if (parts.length !== 3) return { allowed: false };
    const [_, a, b] = parts;
    if (String(userId) !== String(a) && String(userId) !== String(b)) return { allowed: false };
    return { allowed: true, type: 'dm' };
  }

  const [rows] = await pool.query(
    'SELECT left_at FROM group_members WHERE group_id = ? AND user_id = ?',
    [conversationId, userId]
  );

  if (!rows.length) return { allowed: false };
  return { allowed: true, type: 'group', leftAt: rows[0].left_at };
}

// GET /api/messages/:conversationId/pinned — get pinned message for a conversation
router.get('/:conversationId/pinned', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.id;

  try {
    const access = await verifyConversationAccess(userId, conversationId);
    if (!access.allowed) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    let query = `SELECT * FROM messages WHERE conversation_id = ? AND is_pinned = 1 AND is_deleted = 0`;
    const params = [conversationId];
    if (access.type === 'group' && access.leftAt) {
      query += ' AND created_at <= ?';
      params.push(access.leftAt);
    }

    const [rows] = await pool.query(query + ' LIMIT 1', params);

    if (rows.length === 0) {
      return res.json({ pinnedMessage: null });
    }

    // Fetch reactions
    const [reactions] = await pool.query(
      'SELECT emoji, user_id FROM message_reactions WHERE message_id = ?',
      [rows[0].id]
    );

    const reactionMap = {};
    reactions.forEach((r) => {
      if (!reactionMap[r.emoji]) reactionMap[r.emoji] = [];
      reactionMap[r.emoji].push(String(r.user_id));
    });

    const reactionData = Object.entries(reactionMap).map(([emoji, users]) => ({ emoji, users }));

    const ts = rows[0].created_at;
    const files = (() => {
      if (!rows[0].files) return [];
      if (Array.isArray(rows[0].files)) return rows[0].files;
      try {
        return JSON.parse(rows[0].files);
      } catch {
        return [];
      }
    })();

    const message = {
      id: String(rows[0].id),
      senderId: String(rows[0].sender_id),
      content: rows[0].content || '',
      timestamp: ts instanceof Date ? ts.toISOString() : String(ts),
      type: rows[0].type || 'text',
      reactions: reactionData,
      replyTo: rows[0].reply_to ? String(rows[0].reply_to) : undefined,
      editedAt: rows[0].edited_at ? (rows[0].edited_at instanceof Date ? rows[0].edited_at.toISOString() : String(rows[0].edited_at)) : undefined,
      isDeleted: rows[0].is_deleted === 1,
      isPinned: rows[0].is_pinned === 1,
      deletedAt: rows[0].deleted_at ? (rows[0].deleted_at instanceof Date ? rows[0].deleted_at.toISOString() : String(rows[0].deleted_at)) : undefined,
      deletedBy: rows[0].deleted_by ? String(rows[0].deleted_by) : undefined,
      files,
      links: parseLinksRow(rows[0].links),
      status: 'sent',
    };

    res.json({ pinnedMessage: message });
  } catch (err) {
    console.error('GET /messages/:conversationId/pinned error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/messages/unread/counts — get unread message counts for all conversations
router.get('/unread/counts', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    // Get unread counts per conversation, limiting group messages after left_at for users who have left groups.
    const [unreadCounts] = await pool.query(
      `SELECT 
        m.conversation_id,
        COUNT(m.id) as unread_count,
        MAX(m.id) as last_message_id
      FROM messages m
      LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = ?
      LEFT JOIN group_members gm ON m.conversation_id = gm.group_id AND gm.user_id = ?
      WHERE mr.user_id IS NULL
        AND m.is_deleted = 0
        AND (
          (m.conversation_id LIKE 'dm_%' AND (
            m.conversation_id LIKE CONCAT('dm_', ?, '_%') OR
            m.conversation_id LIKE CONCAT('dm_%_', ?)
          ))
          OR (gm.id IS NOT NULL AND (gm.left_at IS NULL OR m.created_at <= gm.left_at))
        )
      GROUP BY m.conversation_id`,
      [userId, userId, userId, userId]
    );

    // Get last_seen_at for each conversation
    const [lastSeenData] = await pool.query(
      `SELECT conversation_id, last_seen_at, last_message_id 
       FROM conversation_last_seen 
       WHERE user_id = ?`,
      [userId]
    );

    const lastSeenMap = {};
    lastSeenData.forEach((row) => {
      lastSeenMap[row.conversation_id] = {
        lastSeenAt: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : String(row.last_seen_at),
        lastMessageId: row.last_message_id ? String(row.last_message_id) : null,
      };
    });

    const counts = {};
    unreadCounts.forEach((row) => {
      counts[row.conversation_id] = {
        unreadCount: row.unread_count,
        lastMessageId: row.last_message_id ? String(row.last_message_id) : null,
        ...lastSeenMap[row.conversation_id],
      };
    });

    res.json({ counts });
  } catch (err) {
    console.error('GET /messages/unread/counts error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/messages/:conversationId — load history (newest last, paginated)
router.get('/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.id;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const before = req.query.before ? parseInt(req.query.before) : null;

  try {
    const access = await verifyConversationAccess(userId, conversationId);
    if (!access.allowed) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    let query = 'SELECT * FROM messages WHERE conversation_id = ?';
    const params = [conversationId];

    if (before) {
      query += ' AND id < ?';
      params.push(before);
    }

    if (access.type === 'group' && access.leftAt) {
      query += ' AND created_at <= ?';
      params.push(access.leftAt);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await pool.query(query, params);

    if (rows.length === 0) {
      return res.json({ messages: [] });
    }

    const ids = rows.map((r) => r.id);

    const [reactions] = await pool.query(
      'SELECT message_id, emoji, user_id FROM message_reactions WHERE message_id IN (?)',
      [ids]
    );

    const [readRows] = await pool.query(
      `SELECT message_id, COUNT(*) AS read_count
       FROM message_reads
       WHERE message_id IN (?) AND user_id != ?
       GROUP BY message_id`,
      [ids, userId]
    );

    const [deliveryRows] = await pool.query(
      `SELECT message_id, COUNT(*) AS delivery_count
       FROM message_deliveries
       WHERE message_id IN (?) AND user_id != ?
       GROUP BY message_id`,
      [ids, userId]
    );

    const reactionsMap = {};
    reactions.forEach((r) => {
      if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = {};
      if (!reactionsMap[r.message_id][r.emoji]) reactionsMap[r.message_id][r.emoji] = [];
      reactionsMap[r.message_id][r.emoji].push(String(r.user_id));
    });

    const readMap = {};
    readRows.forEach((row) => {
      readMap[row.message_id] = Number(row.read_count);
    });

    const deliveryMap = {};
    deliveryRows.forEach((row) => {
      deliveryMap[row.message_id] = Number(row.delivery_count);
    });

    const messages = rows.reverse().map((row) => {
      const ts = row.created_at;
      const reactionData = reactionsMap[row.id] || {};
      const isOwnMessage = String(row.sender_id) === String(userId);
      let status = undefined;
      if (isOwnMessage) {
        if (readMap[row.id]) {
          status = 'seen';
        } else if (deliveryMap[row.id]) {
          status = 'delivered';
        } else {
          status = 'sent';
        }
      }

      return {
        id: String(row.id),
        senderId: String(row.sender_id),
        content: row.content || '',
        timestamp: ts instanceof Date ? ts.toISOString() : String(ts),
        type: row.type || 'text',
        reactions: Object.entries(reactionData).map(([emoji, users]) => ({ emoji, users })),
        replyTo: row.reply_to ? String(row.reply_to) : undefined,
        editedAt: row.edited_at
          ? row.edited_at instanceof Date
            ? row.edited_at.toISOString()
            : String(row.edited_at)
          : undefined,
        isDeleted: row.is_deleted === 1,
        isPinned: row.is_pinned === 1,
        deletedAt: row.deleted_at
          ? row.deleted_at instanceof Date
            ? row.deleted_at.toISOString()
            : String(row.deleted_at)
          : undefined,
        deletedBy: row.deleted_by ? String(row.deleted_by) : undefined,
        files: (() => {
          if (!row.files) return [];
          if (Array.isArray(row.files)) return row.files; // mysql2 auto-parses JSON columns
          try { return JSON.parse(row.files); } catch { return []; }
        })(),
        links: parseLinksRow(row.links),
        status,
      };
    });

    res.json({ messages });
  } catch (err) {
    console.error('messages GET error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/messages/unread-since — return unread counts + latest message preview per conversation
router.post('/unread-since', authenticateToken, async (req, res) => {
  const { conversations } = req.body;
  if (!Array.isArray(conversations) || conversations.length === 0) {
    return res.json({ counts: {}, previews: {} });
  }

  const userId = req.user.id;
  const counts = {};
  const previews = {};

  await Promise.all(conversations.slice(0, 100).map(async ({ id, since }) => {
    try {
      if (!id || !since) return;
      const sinceDate = new Date(since);

      const access = await verifyConversationAccess(userId, id);
      if (!access.allowed) {
        counts[id] = 0;
        return;
      }

      const isLeftGroupAfterSince = access.type === 'group' && access.leftAt && sinceDate > new Date(access.leftAt);
      if (isLeftGroupAfterSince) {
        counts[id] = 0;
        return;
      }

      const cutoff = access.type === 'group' && access.leftAt ? new Date(Math.min(sinceDate.getTime(), new Date(access.leftAt).getTime())) : sinceDate;
      const cutoffString = cutoff.toISOString();

      const [[countRow], [latestRow]] = await Promise.all([
        pool.query(
          'SELECT COUNT(*) AS cnt FROM messages WHERE conversation_id = ? AND created_at > ? AND sender_id != ? AND is_deleted = 0' + (access.type === 'group' && access.leftAt ? ' AND created_at <= ?' : ''),
          access.type === 'group' && access.leftAt ? [id, cutoffString, userId, access.leftAt] : [id, cutoffString, userId]
        ),
        pool.query(
          'SELECT sender_id, content, type, created_at FROM messages WHERE conversation_id = ? AND sender_id != ? AND is_deleted = 0' + (access.type === 'group' && access.leftAt ? ' AND created_at <= ?' : '') + ' ORDER BY created_at DESC LIMIT 1',
          access.type === 'group' && access.leftAt ? [id, userId, access.leftAt] : [id, userId]
        ),
      ]);

      counts[id] = Number(countRow[0].cnt);

      if (counts[id] > 0 && latestRow.length > 0) {
        const r = latestRow[0];
        const ts = r.created_at;
        previews[id] = {
          senderId: String(r.sender_id),
          content: r.content || '',
          type: r.type || 'text',
          timestamp: ts instanceof Date ? ts.toISOString() : String(ts),
        };
      }
    } catch {
      counts[id] = 0;
    }
  }));

  res.json({ counts, previews });
});

// DELETE /api/messages/:messageId — soft-delete a message
router.delete('/:messageId', authenticateToken, async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user.id;

  try {
    const [rows] = await pool.query('SELECT sender_id, conversation_id FROM messages WHERE id = ?', [messageId]);
    if (!rows.length) {
      console.warn(`[DELETE /messages] NOT FOUND messageId=${messageId}`);
      return res.status(404).json({ message: 'Message not found' });
    }

    const isOwner = String(rows[0].sender_id) === String(userId);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      console.warn(`[DELETE /messages] UNAUTHORIZED userId=${userId} senderId=${rows[0].sender_id}`);
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await pool.query(
      'UPDATE messages SET is_deleted = 1, deleted_by = ?, deleted_at = NOW() WHERE id = ?',
      [userId, messageId]
    );
    const deletedAt = new Date().toISOString();

    const conversationId = rows[0].conversation_id;
    console.log(`[DELETE /messages] success messageId=${messageId} conv=${conversationId}`);

    // Broadcast via socket to all participants
    const io = req.app.get('io');
    if (io) {
      const payload = { messageId: String(messageId), conversationId, deletedBy: String(userId), deletedAt };
      io.to(conversationId).emit('message_deleted', payload);

      if (conversationId.startsWith('dm_')) {
        const parts = conversationId.split('_');
        io.to(`user_${parts[1]}`).emit('message_deleted', payload);
        io.to(`user_${parts[2]}`).emit('message_deleted', payload);
        } else {
        try {
          const [members] = await pool.query('SELECT user_id FROM group_members WHERE group_id = ? AND left_at IS NULL', [conversationId]);
          members.forEach(m => io.to(`user_${m.user_id}`).emit('message_deleted', payload));
        } catch { /* best-effort */ }
      }
    }

    res.json({ success: true, deletedAt });
  } catch (err) {
    console.error('[DELETE /messages] error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/search/:query — search messages by content
router.get('/search/:query', authenticateToken, async (req, res) => {
  const { query } = req.params;
  const { conversationId, limit = 50, offset = 0 } = req.query;
  const userId = req.user.id;

  if (!query || query.length < 2) {
    return res.json({ results: [] });
  }

  try {
    const searchTerm = `%${query}%`;
    const queryLimit = Math.min(parseInt(limit) || 50, 100);
    const queryOffset = parseInt(offset) || 0;

    let sql = `SELECT m.id, m.conversation_id, m.content, m.sender_id, m.created_at, m.type, m.is_deleted
              FROM messages m
              LEFT JOIN group_members gm ON m.conversation_id = gm.group_id AND gm.user_id = ?
              WHERE m.is_deleted = 0
                AND LOWER(m.content) LIKE LOWER(?)`;
    const params = [userId, searchTerm];

    // Filter by conversation if specified
    if (conversationId) {
      sql += ' AND m.conversation_id = ?';
      params.push(conversationId);
    }

    sql += ` AND (
      (m.conversation_id LIKE 'dm_%' AND (
        m.conversation_id LIKE CONCAT('dm_', ?, '_%') OR
        m.conversation_id LIKE CONCAT('dm_%_', ?)
      ))
      OR (gm.id IS NOT NULL AND (gm.left_at IS NULL OR m.created_at <= gm.left_at))
    )`;
    params.push(userId, userId);

    sql += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
    params.push(queryLimit, queryOffset);

    const [messages] = await pool.query(sql, params);

    // Get sender info for these messages
    if (messages.length > 0) {
      const senderIds = [...new Set(messages.map(m => m.sender_id))];
      const [senders] = await pool.query(
        'SELECT id, name, avatar FROM users WHERE id IN (?)',
        [senderIds]
      );

      const senderMap = {};
      senders.forEach(s => {
        senderMap[s.id] = s;
      });

      const results = messages.map(m => ({
        id: String(m.id),
        conversationId: m.conversation_id,
        content: m.content.substring(0, 100), // Preview
        sender: senderMap[m.sender_id] ? {
          id: String(senderMap[m.sender_id].id),
          name: senderMap[m.sender_id].name,
          avatar: senderMap[m.sender_id].avatar,
        } : null,
        timestamp: m.created_at instanceof Date ? m.created_at.toISOString() : String(m.created_at),
        type: m.type || 'text',
      }));

      return res.json({ results });
    }

    res.json({ results: [] });
  } catch (err) {
    console.error('GET /messages/search error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
