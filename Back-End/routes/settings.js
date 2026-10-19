const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getSettings, updateSetting, updateSettings } = require('../services/settingsService');
const {
  getMaxUploadMb, setMaxUploadMb, getEffectiveMaxUploadMb, MIN_MAX_UPLOAD_MB, MAX_MAX_UPLOAD_MB,
} = require('../services/appSettingsService');

const router = express.Router();

// GET /api/settings/system — maxUploadMb is THIS user's effective limit (their own admin-set
// override if they have one, otherwise the workspace default) — what client-side validation
// should actually use. workspaceDefaultMb is the plain default, shown to admins for context.
router.get('/system', authenticateToken, async (req, res) => {
  try {
    const [maxUploadMb, workspaceDefaultMb] = await Promise.all([
      getEffectiveMaxUploadMb(req.user.id),
      getMaxUploadMb(),
    ]);
    res.json({ maxUploadMb, workspaceDefaultMb, minUploadMb: MIN_MAX_UPLOAD_MB, maxUploadMbCeiling: MAX_MAX_UPLOAD_MB });
  } catch (err) {
    console.error('Error getting system settings:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/settings/system — admin-only: change the max upload size (1–500 MB)
router.put('/system', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const maxUploadMb = await setMaxUploadMb(req.body.maxUploadMb);
    res.json({ message: 'Max upload size updated.', maxUploadMb });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error('Error updating system settings:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET /api/settings — get all settings for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const settings = await getSettings(req.user.id);
    res.json({ settings });
  } catch (err) {
    console.error('Error getting settings:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/settings/:key — update a single setting
router.patch('/:key', authenticateToken, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (value === undefined) {
    return res.status(400).json({ message: 'Value is required.' });
  }

  try {
    const result = await updateSetting(req.user.id, key, value);
    res.json({ message: 'Setting updated.', setting: result });
  } catch (err) {
    console.error(`Error updating setting ${key}:`, err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/settings — update multiple settings at once
router.patch('/', authenticateToken, async (req, res) => {
  try {
    const result = await updateSettings(req.user.id, req.body);
    res.json({ message: 'Settings updated.', settings: result });
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
