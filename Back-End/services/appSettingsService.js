/**
 * Global (not per-user) app configuration — currently just the admin-configurable max upload
 * size. Backed by the app_settings key/value table, with a short in-memory cache so the
 * per-file upload validation path (fileFilter, called once per file) doesn't hit the database
 * on every upload.
 */

const pool = require('../config/database');

const SETTING_KEY = 'max_upload_mb';
const DEFAULT_MAX_UPLOAD_MB = 150;
const MIN_MAX_UPLOAD_MB = 1;
const MAX_MAX_UPLOAD_MB = 500; // hard ceiling — matches multer's own limits.fileSize safety net
const CACHE_TTL_MS = 15_000;

let cache = { maxUploadMb: DEFAULT_MAX_UPLOAD_MB, loadedAt: 0 };
let refreshing = null; // in-flight refresh promise, deduped

async function refreshCache() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const [rows] = await pool.query(
        'SELECT setting_value FROM app_settings WHERE setting_key = ?',
        [SETTING_KEY]
      );
      const parsed = rows[0] ? parseInt(rows[0].setting_value, 10) : NaN;
      cache = {
        maxUploadMb: Number.isFinite(parsed) && parsed >= MIN_MAX_UPLOAD_MB && parsed <= MAX_MAX_UPLOAD_MB
          ? parsed
          : DEFAULT_MAX_UPLOAD_MB,
        loadedAt: Date.now(),
      };
    } catch (err) {
      console.error('[appSettings] failed to load max_upload_mb, keeping previous/default value:', err.message);
      // Keep whatever was cached (or the default) rather than throwing — a settings read
      // failure must never block file uploads.
      cache = { ...cache, loadedAt: Date.now() };
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Sync read for the hot path (multer's fileFilter). Triggers a background refresh when stale,
 *  but never blocks — returns the last known value immediately either way. */
function getMaxUploadMbSync() {
  if (Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    refreshCache().catch(() => {}); // already logs internally; this just avoids an unhandled rejection
  }
  return cache.maxUploadMb;
}

/** Async read — waits for a fresh value when the cache is stale. Used by the settings API. */
async function getMaxUploadMb() {
  if (Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    await refreshCache();
  }
  return cache.maxUploadMb;
}

async function setMaxUploadMb(mb) {
  const value = Math.round(Number(mb));
  if (!Number.isFinite(value) || value < MIN_MAX_UPLOAD_MB || value > MAX_MAX_UPLOAD_MB) {
    throw Object.assign(
      new Error(`Max upload size must be between ${MIN_MAX_UPLOAD_MB} and ${MAX_MAX_UPLOAD_MB} MB.`),
      { status: 400 }
    );
  }
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [SETTING_KEY, String(value)]
  );
  cache = { maxUploadMb: value, loadedAt: Date.now() };
  return value;
}

module.exports = {
  getMaxUploadMb,
  getMaxUploadMbSync,
  setMaxUploadMb,
  MIN_MAX_UPLOAD_MB,
  MAX_MAX_UPLOAD_MB,
  DEFAULT_MAX_UPLOAD_MB,
};
