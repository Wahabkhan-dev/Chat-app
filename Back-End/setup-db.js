const mysql = require('mysql2/promise');
require('dotenv').config();

const sqlQueries = [
  // 1. Create Database
  'CREATE DATABASE IF NOT EXISTS teams_app',
  'USE teams_app',

  // 2. Users Table
  `CREATE TABLE IF NOT EXISTS users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100)  NOT NULL,
    email       VARCHAR(150)  NOT NULL UNIQUE,
    password    VARCHAR(255)  NOT NULL,
    role        ENUM('admin', 'user') NOT NULL DEFAULT 'user',
    avatar      TEXT,
    status      ENUM('online', 'away', 'offline', 'dnd') NOT NULL DEFAULT 'offline',
    department  VARCHAR(100)  DEFAULT '',
    is_active   TINYINT(1)    NOT NULL DEFAULT 1,
    created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3. Groups Table
  `CREATE TABLE IF NOT EXISTS \`groups\` (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    name                  VARCHAR(255) NOT NULL,
    description           VARCHAR(1000) DEFAULT '',
    avatar                VARCHAR(500) DEFAULT NULL,
    created_by            INT NOT NULL,
    owner_id              INT NOT NULL,
    message_permission    ENUM('all', 'admin_only') DEFAULT 'all',
    add_member_permission ENUM('admin_only', 'everyone') DEFAULT 'everyone',
    allow_member_leave    TINYINT(1) DEFAULT 1,
    slow_mode             TINYINT(1) DEFAULT 0,
    slow_mode_seconds     INT DEFAULT 10,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (owner_id)   REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 4. Group Members Table
  `CREATE TABLE IF NOT EXISTS group_members (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    group_id  INT NOT NULL,
    user_id   INT NOT NULL,
    role      ENUM('member', 'admin', 'owner') DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at   DATETIME NULL DEFAULT NULL,
    UNIQUE KEY unique_membership (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)    ON DELETE CASCADE,
    INDEX idx_group_user (group_id, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 5. Messages Table
  `CREATE TABLE IF NOT EXISTS messages (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(100) NOT NULL,
    sender_id       INT NOT NULL,
    content         TEXT NOT NULL,
    type            ENUM('text', 'file', 'system', 'image', 'video') DEFAULT 'text',
    files           TEXT NULL,
    links           TEXT NULL,
    reply_to        INT NULL,
    is_deleted      TINYINT(1) DEFAULT 0,
    deleted_by      INT NULL,
    deleted_at      TIMESTAMP NULL,
    is_pinned       TINYINT(1) DEFAULT 0,
    edited_at       TIMESTAMP NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_at    DATETIME NULL,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    INDEX idx_conversation (conversation_id),
    INDEX idx_sender_conversation (sender_id, conversation_id),
    INDEX idx_conversation_created (conversation_id, created_at DESC),
    INDEX idx_is_deleted (is_deleted),
    INDEX idx_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 6. Message Reactions Table
  `CREATE TABLE IF NOT EXISTS message_reactions (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    user_id    INT NOT NULL,
    emoji      VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_reaction (message_id, user_id, emoji),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    INDEX idx_message_user (message_id, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 7. Notifications Table
  `CREATE TABLE IF NOT EXISTS notifications (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    type           VARCHAR(50) NOT NULL DEFAULT 'info',
    recipient_id   INT NULL,
    sender_id      INT NULL,
    conversation_id VARCHAR(100) NULL,
    message_id     INT NULL,
    emoji          VARCHAR(20) NULL,
    title          VARCHAR(255) NOT NULL,
    body           VARCHAR(1000) NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_notifications_recipient (recipient_id),
    INDEX idx_notifications_sender (sender_id),
    INDEX idx_notifications_conversation (conversation_id),
    INDEX idx_notifications_message (message_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  // 8. Notification Reads Table
  `CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id INT NOT NULL,
    user_id         INT NOT NULL,
    read_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id, user_id),
    FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE,
    INDEX idx_notification (notification_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 9. Message Reads Table
  `CREATE TABLE IF NOT EXISTS message_reads (
    id         INT NOT NULL AUTO_INCREMENT,
    message_id INT NOT NULL,
    user_id    INT NOT NULL,
    read_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY message_reads_message_id_user_id_key (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_read_at (read_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 10. Message Deliveries Table
  `CREATE TABLE IF NOT EXISTS message_deliveries (
    id           INT NOT NULL AUTO_INCREMENT,
    message_id   INT NOT NULL,
    user_id      INT NOT NULL,
    delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY message_deliveries_message_id_user_id_key (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    INDEX idx_deliveries_message (message_id),
    INDEX idx_deliveries_user (user_id),
    INDEX idx_delivered_at (delivered_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 11. Conversation Last Seen Table
  `CREATE TABLE IF NOT EXISTS conversation_last_seen (
    id              INT NOT NULL AUTO_INCREMENT,
    user_id         INT NOT NULL,
    conversation_id VARCHAR(100) NOT NULL,
    last_seen_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_message_id INT,
    PRIMARY KEY (id),
    UNIQUE KEY conversation_last_seen_conversation_id_user_id_key (conversation_id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_conversation_id (conversation_id),
    INDEX idx_last_seen_at (last_seen_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 11. Seed Admin User
  `INSERT IGNORE INTO users (name, email, password, role, department, avatar, status, is_active)
   VALUES (
     'Admin User',
     'admin@mawbytec.com',
     '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
     'admin',
     'Engineering',
     '',
     'offline',
     1
   )`,
];

async function setupDatabase() {
  let connection;
  try {
    // Connect without specifying database first
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true,
    });

    console.log('✅ Connected to MySQL');

    // Run each query
    for (const [index, query] of sqlQueries.entries()) {
      try {
        await connection.query(query);
        const queryPreview = query.substring(0, 50).replace(/\n/g, ' ');
        console.log(`✅ [${index + 1}/${sqlQueries.length}] ${queryPreview}...`);
      } catch (err) {
        // Ignore duplicate key errors - these are expected on re-runs
        if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEY_NAME' || err.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`⚠️  [${index + 1}/${sqlQueries.length}] Already exists (skipped)`);
        } else if (err.code === 'ER_DUP_ENTRY') {
          console.log(`⚠️  [${index + 1}/${sqlQueries.length}] Duplicate entry (skipped)`);
        } else {
          console.error(`❌ [${index + 1}/${sqlQueries.length}] Error:`, err.message);
        }
      }
    }

    // Verify setup
    console.log('\n📊 VERIFICATION:');
    const [tables] = await connection.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'teams_app' 
      ORDER BY table_name
    `);
    console.log('✅ Tables created:');
    tables.forEach((t) => console.log(`   - ${t.table_name}`));

    const [users] = await connection.query('SELECT id, name, email, role, status FROM users LIMIT 1');
    if (users.length > 0) {
      console.log('\n✅ Admin user:');
      console.log(`   - Email: ${users[0].email}`);
      console.log(`   - Role: ${users[0].role}`);
      console.log(`   - Status: ${users[0].status}`);
    }

    console.log('\n🎉 DATABASE SETUP COMPLETE!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Setup failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

setupDatabase();
