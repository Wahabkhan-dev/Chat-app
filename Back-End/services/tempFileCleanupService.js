/**
 * Temp-file cleanup — temp_files rows carry their own per-file expiry (user-chosen, capped at
 * 72h), unlike the fixed weekly chat cleanup. So this runs on a short recurring interval instead
 * of a fixed weekly time, sweeping up anything whose expiry has already passed.
 */

const cron = require('node-cron');
const { DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const pool = require('../config/database');
const { r2 } = require('../config/r2');

const SCHEDULE = '*/15 * * * *'; // every 15 minutes
const R2_BATCH = 1000; // S3 DeleteObjects max per request

async function runTempFileCleanup() {
  const startedAt = new Date();
  try {
    const [rows] = await pool.query('SELECT id, r2_key FROM temp_files WHERE expires_at <= UTC_TIMESTAMP()');
    if (rows.length === 0) return;

    let deleted = 0;
    let errors = 0;
    for (let i = 0; i < rows.length; i += R2_BATCH) {
      const chunk = rows.slice(i, i + R2_BATCH);
      const result = await r2.send(new DeleteObjectsCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Delete: { Objects: chunk.map(r => ({ Key: r.r2_key })), Quiet: true },
      }));
      const batchErrors = result.Errors ? result.Errors.length : 0;
      errors += batchErrors;
      deleted += chunk.length - batchErrors;
    }

    const ids = rows.map(r => r.id);
    await pool.query('DELETE FROM temp_files WHERE id IN (?)', [ids]);

    console.log(`[temp-file-cleanup] expired=${rows.length} r2Deleted=${deleted} r2Errors=${errors} in ${((Date.now() - startedAt.getTime()) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error('[temp-file-cleanup] FAILED:', err.message);
  }
}

function startTempFileCleanup() {
  cron.schedule(SCHEDULE, runTempFileCleanup);
  console.log('[temp-file-cleanup] registered — every 15 minutes');
}

module.exports = { startTempFileCleanup, runTempFileCleanup };
