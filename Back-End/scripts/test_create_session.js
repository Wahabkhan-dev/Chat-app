require('dotenv').config();
const jwt = require('jsonwebtoken');
const { createSession } = require('../services/sessionService');

(async () => {
  try {
    // create a token for the admin user (id will be determined by DB)
    const token = jwt.sign({ id: 1, email: 'admin@mawbytec.com', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const session = await createSession(1, token, { deviceName: 'Test Device', userAgent: 'NodeTest', ipAddress: '127.0.0.1' });
    console.log('Session created:', session);
  } catch (e) {
    console.error('Test failed:', e);
  }
})();
