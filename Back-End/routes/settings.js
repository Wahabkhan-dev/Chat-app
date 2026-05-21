const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { getSettings, updateSetting, updateSettings } = require('../services/settingsService');

const router = express.Router();

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
