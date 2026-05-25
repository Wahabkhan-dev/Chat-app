const webpush = require('web-push');
const pool = require('../config/database');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function sendPushToUser(userId, payload) {
  try {
    const [subs] = await pool.query(
      'SELECT * FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );

    if (!subs.length) return;

    await Promise.allSettled(
      subs.map(async (sub) => {
        const subscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          await webpush.sendNotification(subscription, JSON.stringify(payload));
        } catch (err) {
          // 410 Gone = subscription expired, remove it
          if (err.statusCode === 410 || err.statusCode === 404) {
            await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
          }
        }
      })
    );
  } catch (err) {
    console.warn('[push] sendPushToUser error:', err.message);
  }
}

module.exports = { sendPushToUser };
