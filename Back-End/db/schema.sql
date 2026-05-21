-- ============================================================
--  Teams App — Full Database Schema
--  Run this file once on a fresh MySQL instance to set up
--  everything needed for the application.
--
--  Usage:
--    MySQL Workbench : Open file → Run
--    CLI             : mysql -u root -p < db/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS teams_app;
USE teams_app;

-- ------------------------------------------------------------
-- 1. Users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
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
  updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 2. Groups
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `groups` (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(255)  NOT NULL,
  description           VARCHAR(1000) DEFAULT '',
  avatar                MEDIUMTEXT    DEFAULT NULL,
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
);

-- ------------------------------------------------------------
-- 3. Group Members
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_members (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  group_id  INT NOT NULL,
  user_id   INT NOT NULL,
  role      ENUM('member', 'admin', 'owner') DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at   DATETIME NULL DEFAULT NULL,
  UNIQUE KEY unique_membership (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)    ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 4. Messages
-- ------------------------------------------------------------
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
);

-- ------------------------------------------------------------
-- 5. Message Reactions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_reactions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  user_id    INT NOT NULL,
  emoji      VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_reaction (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 6. Notifications
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  type         VARCHAR(50)   NOT NULL DEFAULT 'info',
  recipient_id INT           NULL,        -- NULL = broadcast to all users
  title        VARCHAR(255)  NOT NULL,
  body         VARCHAR(1000) NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 7. Notification Reads  (tracks which users have read which notification)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INT NOT NULL,
  user_id         INT NOT NULL,
  read_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id, user_id),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 8. Seed — first admin account
--    Login : admin@mawbytec.com
--    Password : admin123   (bcrypt hash below)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Migrations (run these on existing databases)
-- ------------------------------------------------------------
-- Widen groups.avatar to hold base64 image data
ALTER TABLE `groups` MODIFY avatar MEDIUMTEXT DEFAULT NULL;

-- ------------------------------------------------------------
-- Verify
-- ------------------------------------------------------------
SHOW TABLES;
SELECT id, name, email, role FROM users;
