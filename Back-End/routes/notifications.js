const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const notificationMetadataCache = { checked: false, hasMetadata: false };
async function hasNotificationMetadataColumns() {
  if (notificationMetadataCache.checked) return notificationMetadataCache.hasMetadata;
  try {
    const [rows] = await pool.query("SHOW COLUMNS FROM notifications LIKE 'sender_id'");
    notificationMetadataCache.hasMetadata = rows.length > 0;
  } catch (err) {
    console.error('[notifications] schema check failed:', err);
    notificationMetadataCache.hasMetadata = false;
  }
  notificationMetadataCache.checked = true;
  return notificationMetadataCache.hasMetadata;
}

// GET /api/notifications — fetch unread notifications for the current user
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const hasMetadata = await hasNotificationMetadataColumns();
    const query = hasMetadata
      ? `SELECT n.id, n.type, n.recipient_id, n.sender_id, n.conversation_id, n.message_id, n.emoji, n.title, n.body, n.created_at,
                 (SELECT COUNT(*) FROM notification_reads WHERE notification_id = n.id AND user_id = ?) as is_read
           FROM notifications n
           WHERE (n.recipient_id IS NULL OR n.recipient_id = ?)
           ORDER BY n.created_at DESC
           LIMIT 100`
      : `SELECT n.id, n.type, n.recipient_id, n.title, n.body, n.created_at,
                 (SELECT COUNT(*) FROM notification_reads WHERE notification_id = n.id AND user_id = ?) as is_read
           FROM notifications n
           WHERE (n.recipient_id IS NULL OR n.recipient_id = ?)
           ORDER BY n.created_at DESC
           LIMIT 100`;
    const [rows] = await pool.query(query, [userId, userId]);
    res.json({ notifications: rows });
  } catch (err) {
    console.error('GET /notifications error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/notifications/unread/count — get count of unread notifications
router.get('/unread/count', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const [[{ count }]] = await pool.query(
      `SELECT COUNT(*) as count FROM notifications n
       LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
       WHERE (n.recipient_id IS NULL OR n.recipient_id = ?)
         AND nr.user_id IS NULL`,
      [userId, userId]
    );
    res.json({ unreadCount: count || 0 });
  } catch (err) {
    console.error('GET /notifications/unread/count error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/notifications — create a new notification (admin only for broadcast)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { type, recipientId, title, body } = req.body;

  if (!type || !title || !body) {
    return res.status(400).json({ message: 'Type, title, and body are required.' });
  }

  try {
    const hasMetadata = await hasNotificationMetadataColumns();
    const insertQuery = hasMetadata
      ? 'INSERT INTO notifications (type, recipient_id, sender_id, conversation_id, message_id, emoji, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())'
      : 'INSERT INTO notifications (type, recipient_id, title, body, created_at) VALUES (?, ?, ?, ?, NOW())';
    const insertParams = hasMetadata
      ? [type, recipientId || null, req.body.senderId || null, req.body.conversationId || null, req.body.messageId || null, req.body.emoji || null, title, body]
      : [type, recipientId || null, title, body];

    const [result] = await pool.query(insertQuery, insertParams);

    const notificationId = result.insertId;
    const io = req.app.get('io');

    const notification = {
      id: String(notificationId),
      type,
      recipientId: recipientId ? String(recipientId) : null,
      senderId: hasMetadata && req.body.senderId ? String(req.body.senderId) : null,
      conversationId: hasMetadata ? req.body.conversationId || null : null,
      messageId: hasMetadata && req.body.messageId ? String(req.body.messageId) : null,
      emoji: hasMetadata ? req.body.emoji || null : null,
      title,
      body,
      timestamp: new Date().toISOString(),
      read: false,
    };

    // Broadcast to appropriate room
    if (recipientId) {
      io.to(`user_${recipientId}`).emit('new_notification', notification);
    } else {
      // Broadcast to all connected users
      io.emit('new_notification', notification);
    }

    res.json({ success: true, notification });
  } catch (err) {
    console.error('POST /notifications error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/notifications/read — mark all unread notifications as read
router.post('/read', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const [unread] = await pool.query(
      `SELECT n.id FROM notifications n
       LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
       WHERE (n.recipient_id IS NULL OR n.recipient_id = ?) AND nr.user_id IS NULL`,
      [userId, userId]
    );

    if (unread.length > 0) {
      const values = unread.map((n) => [n.id, userId]);
      await pool.query(
        'INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES ?',
        [values]
      );
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${userId}`).emit('all_notifications_read');
    }

    res.json({ success: true });
  } catch (err) {
    console.error('POST /notifications/read error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
