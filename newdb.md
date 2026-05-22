# Railway Database Setup and Test Queries for Mawby Teams

This file contains the full MySQL database setup and verification queries you can run on Railway to prepare and test the `teams_app` database used by this app.

---

## 1. Railway MySQL Connection

Use Railway dashboard or the Railway CLI to get the MySQL connection values.

Example connection command with `mysql`:

```bash
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p
```

Then enter your password when prompted.

If you already have a `DATABASE_URL` from Railway, split it into host/user/pass values or use a tool that supports the full URL.

---

## 2. Create the Database and Use It

Run these first:

```sql
CREATE DATABASE IF NOT EXISTS teams_app;
USE teams_app;
```

---

## 3. Create Tables (A to Z)

### Users

```sql
CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  avatar      TEXT,
  status      ENUM('online', 'away', 'offline', 'dnd') NOT NULL DEFAULT 'offline',
  department  VARCHAR(100) DEFAULT '',
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Groups

```sql
CREATE TABLE IF NOT EXISTS `groups` (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(255) NOT NULL,
  description           VARCHAR(1000) DEFAULT '',
  avatar                MEDIUMTEXT DEFAULT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Group Members

```sql
CREATE TABLE IF NOT EXISTS group_members (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  group_id  INT NOT NULL,
  user_id   INT NOT NULL,
  role      ENUM('member', 'admin', 'owner') DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at   DATETIME NULL DEFAULT NULL,
  UNIQUE KEY unique_membership (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)    ON DELETE CASCADE,
  INDEX idx_group_user (group_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Messages

```sql
CREATE TABLE IF NOT EXISTS messages (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id VARCHAR(100) NOT NULL,
  sender_id       INT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  type            ENUM('text', 'file', 'system', 'image', 'video') DEFAULT 'text',
  reply_to        INT NULL,
  is_deleted      TINYINT(1) DEFAULT 0,
  deleted_by      INT NULL,
  deleted_at      TIMESTAMP NULL,
  edited_at       TIMESTAMP NULL,
  is_pinned       TINYINT(1) DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(id),
  INDEX idx_conversation (conversation_id),
  INDEX idx_created_at   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Message Reactions

```sql
CREATE TABLE IF NOT EXISTS message_reactions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  user_id    INT NOT NULL,
  emoji      VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_reaction (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  INDEX idx_message_user (message_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Notifications

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  type         VARCHAR(50) NOT NULL DEFAULT 'info',
  recipient_id INT NULL,
  sender_id    INT NULL,
  conversation_id VARCHAR(100) NULL,
  message_id   INT NULL,
  emoji        VARCHAR(20) NULL,
  title        VARCHAR(255) NOT NULL,
  body         VARCHAR(1000) NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id)    REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_notifications_recipient (recipient_id),
  INDEX idx_notifications_sender (sender_id),
  INDEX idx_notifications_conversation (conversation_id),
  INDEX idx_notifications_message (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Notification Reads

```sql
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INT NOT NULL,
  user_id         INT NOT NULL,
  read_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id, user_id),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE,
  INDEX idx_notification (notification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Message Reads

```sql
CREATE TABLE IF NOT EXISTS message_reads (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Message Deliveries

```sql
CREATE TABLE IF NOT EXISTS message_deliveries (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Conversation Last Seen

```sql
CREATE TABLE IF NOT EXISTS conversation_last_seen (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 4. Seed the First Admin User

```sql
INSERT IGNORE INTO users (name, email, password, role, department, avatar, status, is_active)
VALUES (
  'Admin User',
  'admin@mawbytec.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin',
  'Engineering',
  '',
  'offline',
  1
);
```

> Login test credentials:
> - Email: `admin@mawbytec.com`
> - Password: `admin123`

---

## 5. Railway Test Data Inserts

Use these sample inserts to verify the app behavior on Railway.

### Add test users

```sql
INSERT INTO users (name, email, password, role, department, status, is_active)
VALUES
  ('Test User One', 'test1@example.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'user', 'Sales', 'online', 1),
  ('Test User Two', 'test2@example.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'user', 'Design', 'online', 1);
```

### Create a group

```sql
INSERT INTO `groups` (name, description, created_by, owner_id)
VALUES ('Railway Test Group', 'Group for Railway deployment testing', 1, 1);
```

### Add group members

```sql
INSERT INTO group_members (group_id, user_id, role)
VALUES
  (1, 1, 'owner'),
  (1, 2, 'admin'),
  (1, 3, 'member');
```

### Create sample conversation messages

```sql
INSERT INTO messages (conversation_id, sender_id, content, type)
VALUES
  ('conversation-1', 1, 'Welcome to the Railway test conversation.', 'text'),
  ('conversation-1', 2, 'Hello from Test User One!', 'text'),
  ('conversation-1', 3, 'Hello from Test User Two!', 'text');
```

### Add a reply and a pinned message

```sql
INSERT INTO messages (conversation_id, sender_id, content, type, reply_to, is_pinned)
VALUES ('conversation-1', 2, 'Replying to the first message.', 'text', 1, 1);
```

### Add message reactions

```sql
INSERT INTO message_reactions (message_id, user_id, emoji)
VALUES
  (1, 2, '👍'),
  (1, 3, '❤️'),
  (2, 1, '😊');
```

### Create a notification and mark it read

```sql
INSERT INTO notifications (type, recipient_id, sender_id, conversation_id, message_id, title, body)
VALUES ('info', 2, 1, 'conversation-1', 1, 'Welcome Notification', 'This is a Railway deployment test notification.');

INSERT INTO notification_reads (notification_id, user_id)
VALUES (LAST_INSERT_ID(), 2);
```

### Create message reads and deliveries

```sql
INSERT INTO message_reads (message_id, user_id)
VALUES
  (1, 2),
  (2, 1),
  (3, 1);

INSERT INTO message_deliveries (message_id, user_id)
VALUES
  (1, 2),
  (1, 3),
  (2, 1);
```

### Set conversation last seen

```sql
INSERT INTO conversation_last_seen (user_id, conversation_id, last_message_id)
VALUES
  (2, 'conversation-1', 2),
  (3, 'conversation-1', 3);
```

---

## 6. Verification Queries

Run these queries to confirm your Railway schema and test data are correct.

### Verify tables exist

```sql
SHOW TABLES;
```

### Verify admin account

```sql
SELECT id, name, email, role, status FROM users WHERE email = 'admin@mawbytec.com';
```

### Verify users

```sql
SELECT id, name, email, role, department, status FROM users ORDER BY id;
```

### Verify groups and members

```sql
SELECT g.id, g.name, g.description, g.created_by, g.owner_id FROM `groups` g;
SELECT gm.group_id, gm.user_id, gm.role FROM group_members gm ORDER BY gm.id;
```

### Verify messages in conversation

```sql
SELECT id, conversation_id, sender_id, content, type, reply_to, is_pinned, created_at
FROM messages
WHERE conversation_id = 'conversation-1'
ORDER BY created_at;
```

### Verify reactions

```sql
SELECT message_id, user_id, emoji FROM message_reactions ORDER BY id;
```

### Verify notifications

```sql
SELECT id, type, recipient_id, sender_id, title, body, created_at FROM notifications ORDER BY id;
SELECT notification_id, user_id, read_at FROM notification_reads ORDER BY notification_id;
```

### Verify reads and deliveries

```sql
SELECT * FROM message_reads ORDER BY id;
SELECT * FROM message_deliveries ORDER BY id;
```

### Verify last seen

```sql
SELECT * FROM conversation_last_seen ORDER BY id;
```

---

## 7. Optional Railway CLI Commands

If you use the Railway CLI and your project is linked, you can run a MySQL client with:

```bash
railway run mysql -u $DB_USER -p -h $DB_HOST -P $DB_PORT teams_app
```

If you have a single `DATABASE_URL`, use a parser or connect directly with a compatible client.

---

## 8. Notes

- If the database already exists, the `CREATE TABLE IF NOT EXISTS` queries are safe to rerun.
- Use `SHOW CREATE TABLE <table_name>;` to inspect any table structure.
- If Railway uses a different database name than `teams_app`, replace `teams_app` with the actual name in the `USE` statement and queries.
- The seeded admin password is bcrypt-hashed; the clear-text login is `admin123`.
