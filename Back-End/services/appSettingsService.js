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

// ── Per-user override ───────────────────────────────────────────────────────
// A user's own users.max_upload_mb (set by an admin) wins when present; otherwise falls back
// to the workspace default above. Cached per-user, same reasoning as the global cache: this
// runs once per uploaded file (fileFilter), so it must never cost a DB round-trip per file.
const userCache = new Map(); // userId -> { value: number | null, loadedAt: number }

async function getEffectiveMaxUploadMb(userId) {
  const hit = userCache.get(userId);
  if (hit && Date.now() - hit.loadedAt <= CACHE_TTL_MS) {
    return hit.value !== null ? hit.value : getMaxUploadMb();
  }
  try {
    const [rows] = await pool.query('SELECT max_upload_mb FROM users WHERE id = ?', [userId]);
    const raw = rows[0]?.max_upload_mb;
    const value = Number.isFinite(raw) && raw >= MIN_MAX_UPLOAD_MB && raw <= MAX_MAX_UPLOAD_MB ? raw : null;
    userCache.set(userId, { value, loadedAt: Date.now() });
    return value !== null ? value : await getMaxUploadMb();
  } catch (err) {
    console.error('[appSettings] failed to load per-user max_upload_mb, falling back to workspace default:', err.message);
    return getMaxUploadMb();
  }
}

/** Admin sets (or clears, with mb=null) one user's personal override. */
async function setUserMaxUploadMb(userId, mb) {
  let value = null;
  if (mb !== null && mb !== undefined) {
    value = Math.round(Number(mb));
    if (!Number.isFinite(value) || value < MIN_MAX_UPLOAD_MB || value > MAX_MAX_UPLOAD_MB) {
      throw Object.assign(
        new Error(`Per-user upload limit must be between ${MIN_MAX_UPLOAD_MB} and ${MAX_MAX_UPLOAD_MB} MB, or cleared to use the workspace default.`),
        { status: 400 }
      );
    }
  }
  await pool.query('UPDATE users SET max_upload_mb = ? WHERE id = ?', [value, userId]);
  userCache.set(userId, { value, loadedAt: Date.now() });
  return value;
}

/** Drop a user's cached override so the next upload re-reads it from the DB. Used whenever
 *  routes/users.js updates max_upload_mb directly (its own UPDATE, outside setUserMaxUploadMb). */
function invalidateUserUploadCache(userId) {
  userCache.delete(String(userId));
  userCache.delete(Number(userId));
}

module.exports = {
  getMaxUploadMb,
  getMaxUploadMbSync,
  setMaxUploadMb,
  getEffectiveMaxUploadMb,
  setUserMaxUploadMb,
  invalidateUserUploadCache,
  MIN_MAX_UPLOAD_MB,
  MAX_MAX_UPLOAD_MB,
  DEFAULT_MAX_UPLOAD_MB,
};
