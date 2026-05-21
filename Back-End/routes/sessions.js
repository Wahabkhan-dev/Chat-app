const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getUserSessions, invalidateSession } = require('../services/sessionService');

const router = express.Router();

// GET /api/sessions — get all active sessions for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sessions = await getUserSessions(req.user.id);
    res.json({ sessions });
  } catch (err) {
    console.error('Error getting sessions:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/sessions/:sessionId — logout from a specific device
router.delete('/:sessionId', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const success = await invalidateSession(sessionId, req.user.id);
    if (!success) {
      return res.status(404).json({ message: 'Session not found.' });
    }
    res.json({ message: 'Session invalidated.' });
  } catch (err) {
    console.error('Error invalidating session:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
