const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  markMessageAsRead,
  markConversationAsRead,
  getUnreadCount,
  getAllUnreadCounts,
  updateLastSeen,
  getLastSeen,
  getAllLastSeen,
} = require('../services/messageReadsService');

const router = express.Router();

// POST /api/message-reads/:messageId — mark a message as read
router.post('/:messageId', authenticateToken, async (req, res) => {
  const { messageId } = req.params;

  try {
    const success = await markMessageAsRead(messageId, req.user.id);
    res.json({ success, message: 'Message marked as read.' });
  } catch (err) {
    console.error('Error marking message as read:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/message-reads/conversation/:conversationId — mark all messages in conversation as read
router.post('/conversation/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const markedCount = await markConversationAsRead(conversationId, req.user.id);
    await updateLastSeen(conversationId, req.user.id);
    res.json({ success: true, markedCount, message: 'Conversation marked as read.' });
  } catch (err) {
    console.error('Error marking conversation as read:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/message-reads/unread/:conversationId — get unread count for a conversation
router.get('/unread/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const unreadCount = await getUnreadCount(conversationId, req.user.id);
    res.json({ conversationId, unreadCount });
  } catch (err) {
    console.error('Error getting unread count:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/message-reads/unread — get unread counts for all conversations
router.get('/unread', authenticateToken, async (req, res) => {
  try {
    const unreadCounts = await getAllUnreadCounts(req.user.id);
    const lastSeen = await getAllLastSeen(req.user.id);
    res.json({ unreadCounts, lastSeen });
  } catch (err) {
    console.error('Error getting all unread counts:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/message-reads/last-seen/:conversationId — update last seen timestamp
router.post('/last-seen/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const { messageId } = req.body;

  try {
    const success = await updateLastSeen(conversationId, req.user.id, messageId);
    res.json({ success, message: 'Last seen updated.' });
  } catch (err) {
    console.error('Error updating last seen:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/message-reads/last-seen/:conversationId — get last seen info
router.get('/last-seen/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const lastSeen = await getLastSeen(conversationId, req.user.id);
    res.json({ conversationId, lastSeen });
  } catch (err) {
    console.error('Error getting last seen:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/message-reads/last-seen — get last seen for all conversations
router.get('/last-seen', authenticateToken, async (req, res) => {
  try {
    const lastSeen = await getAllLastSeen(req.user.id);
    res.json({ lastSeen });
  } catch (err) {
    console.error('Error getting all last seen:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
