const webpush = require('web-push');
const pool = require('../config/database');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);
// CHECK
async function sendPushToUser(userId, payload) {
  try {
    const [subs] = await pool.query(
      'SELECT * FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );

    const total = subs.length;
    console.log(`[push] user ${userId} has ${total} device(s) registered — sending to all simultaneously`);
    if (!total) return;

    await Promise.allSettled(
      subs.map(async (sub, index) => {
        const device = `device ${index + 1}/${total} (sub_id=${sub.id})`;
        const subscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        console.log(`[push] → ${device} user=${userId} endpoint=${sub.endpoint.slice(0, 70)}...`);
        try {
          await webpush.sendNotification(subscription, JSON.stringify(payload));
          console.log(`[push] ✓ delivered — ${device} user=${userId}`);
        } catch (err) {
          console.warn(`[push] ✗ failed — ${device} user=${userId} status=${err.statusCode} msg=${err.message}`);
          if (err.statusCode === 410 || err.statusCode === 404) {
            await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
            console.log(`[push] removed expired sub — ${device} user=${userId}`);
          }
        }
      })
    );
  } catch (err) {
    console.warn('[push] sendPushToUser error:', err.message);
  }
}

module.exports = { sendPushToUser };
