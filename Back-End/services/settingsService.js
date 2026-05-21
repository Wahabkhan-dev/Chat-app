const pool = require('../config/database');

/**
 * User Settings Service - Handles persistent user preferences in database
 */

// Default settings that every new user gets
const DEFAULT_SETTINGS = {
  theme: 'system',
  compact_mode: false,
  message_density: 'comfortable',
  sidebar_collapsed: false,
  notifications_enabled: true,
  sound_enabled: true,
  notification_sound: 'default',
  desktop_notifications: true,
  mute_all: false,
  online_status_visible: true,
  typing_indicator: true,
  read_receipts: true,
  last_seen_visible: true,
  auto_play_videos: false,
  auto_play_gifs: true,
  preview_links: true,
  date_format: '12h',
  language: 'en',
  timezone: 'UTC',
  debug_mode: false,
};

/**
 * Get user settings from database
 */
async function getSettings(userId) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM user_settings WHERE user_id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      // Create default settings for new user
      return await createDefaultSettings(userId);
    }

    return formatSettings(rows[0]);
  } catch (error) {
    console.error('Error getting user settings:', error.message);
    throw error;
  }
}

/**
 * Create default settings for a new user
 */
async function createDefaultSettings(userId) {
  try {
    const insertData = {
      user_id: userId,
      ...DEFAULT_SETTINGS,
    };

    // Build dynamic query to handle all fields
    const fields = Object.keys(insertData);
    const placeholders = fields.map(() => '?').join(',');
    const values = fields.map(key => insertData[key]);

    await pool.query(
      `INSERT INTO user_settings (${fields.join(',')}) VALUES (${placeholders})`,
      values
    );

    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Error creating default settings:', error.message);
    throw error;
  }
}

/**
 * Update a single setting
 */
async function updateSetting(userId, settingKey, value) {
  // Map camelCase from frontend to snake_case in DB
  const dbKey = camelToSnakeCase(settingKey);

  // Validate setting exists
  if (!DEFAULT_SETTINGS.hasOwnProperty(dbKey) && !DEFAULT_SETTINGS.hasOwnProperty(settingKey)) {
    throw new Error(`Invalid setting key: ${settingKey}`);
  }

  try {
    const [result] = await pool.query(
      `UPDATE user_settings SET ${dbKey} = ?, updated_at = NOW() WHERE user_id = ?`,
      [value, userId]
    );

    if (result.affectedRows === 0) {
      // Settings don't exist, create them first
      await createDefaultSettings(userId);
      // Then update
      await pool.query(
        `UPDATE user_settings SET ${dbKey} = ?, updated_at = NOW() WHERE user_id = ?`,
        [value, userId]
      );
    }

    return { [settingKey]: value };
  } catch (error) {
    console.error(`Error updating setting ${settingKey}:`, error.message);
    throw error;
  }
}

/**
 * Update multiple settings at once
 */
async function updateSettings(userId, settingsObj) {
  try {
    const updates = [];
    const values = [];

    for (const [key, value] of Object.entries(settingsObj)) {
      const dbKey = camelToSnakeCase(key);
      if (DEFAULT_SETTINGS.hasOwnProperty(dbKey) || DEFAULT_SETTINGS.hasOwnProperty(key)) {
        updates.push(`${dbKey} = ?`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      return settingsObj;
    }

    values.push(userId);

    await pool.query(
      `UPDATE user_settings SET ${updates.join(', ')}, updated_at = NOW() WHERE user_id = ?`,
      values
    );

    return settingsObj;
  } catch (error) {
    console.error('Error updating settings:', error.message);
    throw error;
  }
}

/**
 * Delete all settings for a user (cleanup on account deletion)
 */
async function deleteSettings(userId) {
  try {
    await pool.query(`DELETE FROM user_settings WHERE user_id = ?`, [userId]);
  } catch (error) {
    console.error('Error deleting settings:', error.message);
    throw error;
  }
}

/**
 * Helper: Convert camelCase to snake_case
 */
function camelToSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Helper: Convert snake_case DB row to camelCase object
 */
function formatSettings(dbRow) {
  const formatted = {};
  for (const [key, value] of Object.entries(dbRow)) {
    if (key === 'id' || key === 'user_id' || key === 'updated_at') continue;
    const camelKey = snakeToCamelCase(key);
    formatted[camelKey] = value;
  }
  // Merge with defaults to ensure all expected keys are present
  return { ...DEFAULT_SETTINGS, ...formatted };
}

/**
 * Helper: Convert snake_case to camelCase
 */
function snakeToCamelCase(str) {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

module.exports = {
  getSettings,
  createDefaultSettings,
  updateSetting,
  updateSettings,
  deleteSettings,
  DEFAULT_SETTINGS,
};
