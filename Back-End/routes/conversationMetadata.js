const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  getMetadata,
  setMuteStatus,
  setPinStatus,
  setBlockStatus,
  setHiddenStatus,
  getAllMetadataForUser,
  getPinnedConversations,
  getMutedConversations,
} = require('../services/conversationMetadataService');

const router = express.Router();

// GET /api/conversation-metadata/:conversationId — get metadata for a conversation
router.get('/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const metadata = await getMetadata(conversationId, req.user.id);
    res.json({ conversationId, metadata });
  } catch (err) {
    console.error('Error getting conversation metadata:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/conversation-metadata — get all metadata for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const metadata = await getAllMetadataForUser(req.user.id);
    res.json({ metadata });
  } catch (err) {
    console.error('Error getting all metadata:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Helper: push a metadata change to all the user's OTHER connected devices.
// The client that made the REST call already applied the change locally, so we
// exclude the originating socket by broadcasting via socket.to() on the server.
// Here we have no socket reference, so we emit to the full personal room via io —
// the frontend handler filters by userId so unintended clients are unaffected.
function emitMetaSync(req, conversationId, action, value) {
  const io = req.app.get('io');
  if (!io) return;
  io.to(`user_${req.user.id}`).emit('conversation_metadata_updated', {
    conversationId,
    userId: String(req.user.id),
    action,
    value,
  });
}

// POST /api/conversation-metadata/:conversationId/mute — mute a conversation
router.post('/:conversationId/mute', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const { mutedUntil } = req.body;

  try {
    const success = await setMuteStatus(conversationId, req.user.id, true, mutedUntil || null);
    emitMetaSync(req, conversationId, 'mute', { mutedUntil: mutedUntil || null });
    res.json({ success, message: 'Conversation muted.' });
  } catch (err) {
    console.error('Error muting conversation:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/conversation-metadata/:conversationId/unmute — unmute a conversation
router.post('/:conversationId/unmute', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const success = await setMuteStatus(conversationId, req.user.id, false);
    emitMetaSync(req, conversationId, 'unmute', null);
    res.json({ success, message: 'Conversation unmuted.' });
  } catch (err) {
    console.error('Error unmuting conversation:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/conversation-metadata/:conversationId/pin — pin a conversation
router.post('/:conversationId/pin', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const success = await setPinStatus(conversationId, req.user.id, true);
    emitMetaSync(req, conversationId, 'pin', null);
    res.json({ success, message: 'Conversation pinned.' });
  } catch (err) {
    console.error('Error pinning conversation:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/conversation-metadata/:conversationId/unpin — unpin a conversation
router.post('/:conversationId/unpin', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const success = await setPinStatus(conversationId, req.user.id, false);
    emitMetaSync(req, conversationId, 'unpin', null);
    res.json({ success, message: 'Conversation unpinned.' });
  } catch (err) {
    console.error('Error unpinning conversation:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/conversation-metadata/:conversationId/block — block a conversation
router.post('/:conversationId/block', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const success = await setBlockStatus(conversationId, req.user.id, true);
    emitMetaSync(req, conversationId, 'block', null);
    res.json({ success, message: 'Conversation blocked.' });
  } catch (err) {
    console.error('Error blocking conversation:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/conversation-metadata/:conversationId/unblock — unblock a conversation
router.post('/:conversationId/unblock', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const success = await setBlockStatus(conversationId, req.user.id, false);
    emitMetaSync(req, conversationId, 'unblock', null);
    res.json({ success, message: 'Conversation unblocked.' });
  } catch (err) {
    console.error('Error unblocking conversation:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/conversation-metadata/:conversationId/hide — hide a conversation
router.post('/:conversationId/hide', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const success = await setHiddenStatus(conversationId, req.user.id, true);
    res.json({ success, message: 'Conversation hidden.' });
  } catch (err) {
    console.error('Error hiding conversation:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/conversation-metadata/:conversationId/unhide — unhide a conversation
router.post('/:conversationId/unhide', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const success = await setHiddenStatus(conversationId, req.user.id, false);
    res.json({ success, message: 'Conversation unhidden.' });
  } catch (err) {
    console.error('Error unhiding conversation:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/conversation-metadata/pinned — get pinned conversations
router.get('/pinned', authenticateToken, async (req, res) => {
  try {
    const pinnedConversations = await getPinnedConversations(req.user.id);
    res.json({ pinnedConversations });
  } catch (err) {
    console.error('Error getting pinned conversations:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/conversation-metadata/muted — get muted conversations
router.get('/muted', authenticateToken, async (req, res) => {
  try {
    const mutedConversations = await getMutedConversations(req.user.id);
    res.json({ mutedConversations });
  } catch (err) {
    console.error('Error getting muted conversations:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
