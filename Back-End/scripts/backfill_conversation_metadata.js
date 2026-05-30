/**
 * One-time backfill: insert a conversation_metadata row for every (user_id, conversation_id)
 * pair that exists in the messages table but is missing from conversation_metadata.
 *
 * Run with:  node scripts/backfill_conversation_metadata.js
 *
 * Safe to re-run — uses INSERT IGNORE so existing rows are untouched.
 */

require('dotenv').config();
const pool = require('../config/database');

async function run() {
  console.log('Starting conversation_metadata backfill...');

  // Step 1: Insert rows for every message sender
  const [senderResult] = await pool.query(`
    INSERT IGNORE INTO conversation_metadata (conversation_id, user_id, updated_at)
    SELECT conversation_id, sender_id, MAX(created_at)
    FROM messages
    WHERE conversation_id LIKE 'dm_%'
    GROUP BY conversation_id, sender_id
  `);
  console.log(`Sender rows inserted: ${senderResult.affectedRows}`);

  // Step 2: Insert rows for the other participant in each DM.
  // DM conversation_id format is dm_X_Y where X = LEAST(id1, id2), Y = GREATEST(id1, id2).
  // The recipient of a message is whichever of X or Y is not the sender.
  const [recipientResult] = await pool.query(`
    INSERT IGNORE INTO conversation_metadata (conversation_id, user_id, updated_at)
    SELECT
      conversation_id,
      CASE
        WHEN CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(conversation_id, '_', 2), '_', -1) AS UNSIGNED) = sender_id
          THEN CAST(SUBSTRING_INDEX(conversation_id, '_', -1) AS UNSIGNED)
        ELSE CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(conversation_id, '_', 2), '_', -1) AS UNSIGNED)
      END AS user_id,
      MAX(created_at) AS updated_at
    FROM messages
    WHERE conversation_id LIKE 'dm_%'
    GROUP BY conversation_id, user_id
  `);
  console.log(`Recipient rows inserted: ${recipientResult.affectedRows}`);

  console.log('Backfill complete.');
  process.exit(0);
}

run().catch(err => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
