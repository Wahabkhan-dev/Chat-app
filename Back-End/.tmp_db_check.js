const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
    });

    const [tables] = await pool.query("SHOW TABLES LIKE 'message_deliveries'");
    console.log('message_deliveries exists:', tables.length > 0);

    const [msg] = await pool.query("SELECT id, conversation_id, sender_id, content, created_at FROM messages WHERE conversation_id = 'dm_1_2' LIMIT 1");
    console.log('sample dm_1_2 row count:', msg.length);
    if (msg.length) console.log(msg[0]);

    await pool.end();
  } catch (e) {
    console.error('DB test error:', e);
    process.exit(1);
  }
})();
