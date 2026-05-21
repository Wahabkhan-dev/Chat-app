require('dotenv').config();
const jwt = require('jsonwebtoken');
const { blacklistToken } = require('../services/sessionService');
const pool = require('../config/database');

async function run() {
  try {
    const token = jwt.sign({ id: 1, email: 'admin@mawbytec.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log('Generated token (truncated):', token.slice(0, 30) + '...');

    await blacklistToken(token);
    console.log('Called blacklistToken()');

    const [rows] = await pool.query('SELECT id, token_hash, user_id, blacklist_at, expires_at FROM token_blacklist WHERE user_id = ? ORDER BY blacklist_at DESC LIMIT 5', [1]);
    console.log('Current blacklist rows for user 1:', rows);
  } catch (err) {
    console.error('Test blacklist error:', err);
    process.exit(1);
  }
}

run();
