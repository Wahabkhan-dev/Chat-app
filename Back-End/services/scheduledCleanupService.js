/**
 * Weekly chat cleanup — every Friday 6:30 AM (Asia/Karachi), deletes anything older than
 * RETENTION_DAYS from both the database (messages table) and R2 storage (chats/ folder).
 * Same scope and logic as the one-off manual cleanup this was modeled on:
 *   - message_reactions / message_reads / message_deliveries cascade automatically (FK)
 *   - file_metadata / notifications / conversation_last_seen are left untouched (dangling
 *     references are harmless — same tradeoff accepted for the manual cleanup)
 *   - group/user avatars and the uploads/ folder are never touched (file_metadata only ever
 *     tracks chats/ uploads, so the R2 key scope here is already confined to that)
 */

const cron = require('node-cron');
const { DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const pool = require('../config/database');
const { r2 } = require('../config/r2');

const RETENTION_DAYS = 7;
const SCHEDULE = '30 6 * * 5'; // minute hour * * day-of-week(5=Friday)
const TIMEZONE = 'Asia/Karachi';
const R2_BATCH = 1000; // S3 DeleteObjects max per request

async function deleteOldR2Files(cutoffSql) {
  const [rows] = await pool.query(
    "SELECT r2_key FROM file_metadata WHERE uploaded_at < ? AND r2_key LIKE 'chats/%'",
    [cutoffSql]
  );
  if (rows.length === 0) return { found: 0, deleted: 0, errors: 0 };

  let deleted = 0;
  let errors = 0;
  for (let i = 0; i < rows.length; i += R2_BATCH) {
    const chunk = rows.slice(i, i + R2_BATCH).map(r => ({ Key: r.r2_key }));
    const result = await r2.send(new DeleteObjectsCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Delete: { Objects: chunk, Quiet: true },
    }));
    const batchErrors = result.Errors ? result.Errors.length : 0;
    errors += batchErrors;
    deleted += chunk.length - batchErrors;
  }
  return { found: rows.length, deleted, errors };
}

async function deleteOldMessages(cutoffSql) {
  const [result] = await pool.query('DELETE FROM messages WHERE created_at < ?', [cutoffSql]);
  return result.affectedRows;
}

async function runWeeklyCleanup() {
  const startedAt = new Date();
  console.log(`[scheduled-cleanup] starting — retention=${RETENTION_DAYS}d, bucket=${process.env.R2_BUCKET_NAME}, at ${startedAt.toISOString()}`);

  // Computed once and reused for both deletes, so the DB and R2 cutoff are identical to the
  // millisecond — avoids a message/file pair being split across the boundary.
  const cutoff = new Date(startedAt.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const cutoffSql = cutoff.toISOString().slice(0, 19).replace('T', ' '); // 'YYYY-MM-DD HH:MM:SS' (UTC)

  try {
    const r2Result = await deleteOldR2Files(cutoffSql);
    console.log(`[scheduled-cleanup] R2: found=${r2Result.found} deleted=${r2Result.deleted} errors=${r2Result.errors}`);

    const deletedMessages = await deleteOldMessages(cutoffSql);
    console.log(`[scheduled-cleanup] DB: deleted ${deletedMessages} messages older than ${cutoffSql} UTC`);

    console.log(`[scheduled-cleanup] done in ${((Date.now() - startedAt.getTime()) / 1000).toFixed(1)}s`);
  } catch (err) {
    // Never let a cleanup failure crash the server — log loudly and let next Friday's run retry.
    console.error('[scheduled-cleanup] FAILED:', err.message, err.stack);
  }
}

function startScheduledCleanup() {
  cron.schedule(SCHEDULE, runWeeklyCleanup, { timezone: TIMEZONE });
  console.log(`[scheduled-cleanup] registered — every Friday 6:30 AM (${TIMEZONE}), retention=${RETENTION_DAYS} days`);
}

module.exports = { startScheduledCleanup, runWeeklyCleanup };
