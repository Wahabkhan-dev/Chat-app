const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { sendPushToUser } = require('../services/pushService');

const router = express.Router();

// POST /api/push/subscribe — save or update a push subscription
router.post('/subscribe', authenticateToken, async (req, res) => {
  const { subscription } = req.body;
  const userId = req.user.id;

  console.log(`[push] subscribe called for user ${userId}, endpoint: ${subscription?.endpoint?.slice(0, 60)}...`);

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    console.warn('[push] invalid subscription payload:', JSON.stringify(subscription));
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
    console.log(`[push] subscription saved for user ${userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[push] subscribe error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/push/test — send a test push notification to all devices of the current user
router.post('/test', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  console.log(`[push] test notification requested by user ${userId}`);

  try {
    const [subs] = await pool.query(
      'SELECT id FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );

    if (!subs.length) {
      return res.status(400).json({ message: 'No push subscriptions found for this device. Please enable notifications first.' });
    }

    await sendPushToUser(userId, {
      title: 'Test Notification',
      body: 'Push notifications are working correctly on this device.',
      icon: '/icon-192x192.png',
    });

    console.log(`[push] test notification sent to user ${userId} (${subs.length} device(s))`);
    res.json({ success: true });
  } catch (err) {
    console.error('[push] test notification error:', err);
    res.status(500).json({ message: 'Failed to send test notification.' });
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
