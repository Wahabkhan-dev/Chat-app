const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/push/subscribe — save or update a push subscription
router.post('/subscribe', authenticateToken, async (req, res) => {
  const { subscription } = req.body;
  const userId = req.user.id;

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ message: 'Invalid subscription.' });
  }

  try {
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         user_id  = VALUES(user_id),
         p256dh   = VALUES(p256dh),
         auth     = VALUES(auth),
         updated_at = NOW()`,
      [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[push] subscribe error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/push/subscribe — remove a specific subscription
router.delete('/subscribe', authenticateToken, async (req, res) => {
  const { endpoint } = req.body;
  const userId = req.user.id;

  try {
    await pool.query(
      'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
      [userId, endpoint]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[push] unsubscribe error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
