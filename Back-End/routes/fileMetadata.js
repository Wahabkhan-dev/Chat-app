const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
  getConversationFiles,
  getUserFiles,
  searchConversationFiles,
  getConversationFilesByType,
} = require('../services/fileMetadataService');

const router = express.Router();

// GET /api/file-metadata/conversation/:conversationId — get all files in a conversation
router.get('/conversation/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;

  try {
    const files = await getConversationFiles(conversationId);
    res.json({ conversationId, files });
  } catch (err) {
    console.error('Error getting conversation files:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/file-metadata/user — get all files uploaded by current user
router.get('/user', authenticateToken, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);

  try {
    const files = await getUserFiles(req.user.id, limit);
    res.json({ files });
  } catch (err) {
    console.error('Error getting user files:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/file-metadata/search/:conversationId — search files in a conversation
router.get('/search/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  const { q } = req.query;

  if (!q || q.length < 2) {
    return res.json({ conversationId, files: [] });
  }

  try {
    const files = await searchConversationFiles(conversationId, q);
    res.json({ conversationId, files });
  } catch (err) {
    console.error('Error searching files:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/file-metadata/type/:conversationId/:fileType — get files by type
router.get('/type/:conversationId/:fileType', authenticateToken, async (req, res) => {
  const { conversationId, fileType } = req.params;

  try {
    const files = await getConversationFilesByType(conversationId, fileType);
    res.json({ conversationId, fileType, files });
  } catch (err) {
    console.error('Error getting files by type:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
