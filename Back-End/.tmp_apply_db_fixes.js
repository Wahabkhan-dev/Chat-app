const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  });

  const stmts = [
    `ALTER TABLE message_deliveries DROP PRIMARY KEY, ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST, ADD UNIQUE KEY message_deliveries_message_id_user_id_key (message_id, user_id);`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_id INT NULL AFTER recipient_id, ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(100) NULL AFTER sender_id, ADD COLUMN IF NOT EXISTS message_id INT NULL AFTER conversation_id, ADD COLUMN IF NOT EXISTS emoji VARCHAR(20) NULL AFTER message_id`,
  ];

  try {
    for (const s of stmts) {
      console.log('running:', s);
      await pool.query(s);
    }
    console.log('tables updated');
  } catch (error) {
    console.error('error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
