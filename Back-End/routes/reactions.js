const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/reactions/:messageId — get all reactions for a message
router.get('/:messageId', authenticateToken, async (req, res) => {
  const { messageId } = req.params;

  try {
    const [reactions] = await pool.query(
      `SELECT emoji, user_id, created_at 
       FROM message_reactions 
       WHERE message_id = ? 
       ORDER BY created_at ASC`,
      [messageId]
    );

    // Group by emoji
    const grouped = {};
    reactions.forEach((r) => {
      if (!grouped[r.emoji]) grouped[r.emoji] = [];
      grouped[r.emoji].push({
        userId: String(r.user_id),
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      });
    });

    res.json({
      reactions: Object.entries(grouped).map(([emoji, users]) => ({
        emoji,
        users: users.map(u => u.userId),
        count: users.length,
        details: users,
      })),
    });
  } catch (err) {
    console.error('GET /reactions/:messageId error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/reactions — add/remove reaction (alternative to socket)
router.post('/', authenticateToken, async (req, res) => {
  const { messageId, emoji } = req.body;
  const userId = req.user.id;

  if (!messageId || !emoji) {
    return res.status(400).json({ message: 'Message ID and emoji are required.' });
  }

  try {
    // Check if user already has this reaction
    const [existing] = await pool.query(
      'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [messageId, userId, emoji]
    );

    if (existing.length > 0) {
      // Remove reaction (toggle off)
      await pool.query(
        'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
        [messageId, userId, emoji]
      );
      res.json({ success: true, action: 'removed' });
    } else {
      // Add reaction
      await pool.query(
        'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
        [messageId, userId, emoji]
      );
      res.json({ success: true, action: 'added' });
    }
  } catch (err) {
    console.error('POST /reactions error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/reactions/:messageId/:emoji — remove a specific reaction
router.delete('/:messageId/:emoji', authenticateToken, async (req, res) => {
  const { messageId, emoji } = req.params;
  const userId = req.user.id;

  try {
    const [result] = await pool.query(
      'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [messageId, userId, emoji]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reaction not found.' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /reactions/:messageId/:emoji error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
