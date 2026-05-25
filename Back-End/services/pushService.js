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

    console.log(`[push] user ${userId} has ${subs.length} subscription(s) in DB`);
    if (!subs.length) return;

    await Promise.allSettled(
      subs.map(async (sub) => {
        const subscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          await webpush.sendNotification(subscription, JSON.stringify(payload));
          console.log(`[push] notification sent to user ${userId} via ${sub.endpoint.slice(0, 60)}...`);
        } catch (err) {
          console.warn(`[push] webpush error for user ${userId} — status=${err.statusCode} msg=${err.message}`);
          if (err.statusCode === 410 || err.statusCode === 404) {
            await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
            console.log(`[push] removed expired subscription id=${sub.id} for user ${userId}`);
          }
        }
      })
    );
  } catch (err) {
    console.warn('[push] sendPushToUser error:', err.message);
  }
}

module.exports = { sendPushToUser };
