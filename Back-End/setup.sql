-- Run this once against your teams_app database to add real-time chat tables
-- mysql -u root -p teams_app < setup.sql

CREATE TABLE IF NOT EXISTS `groups` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(1000) DEFAULT '',
  avatar VARCHAR(500) DEFAULT NULL,
  created_by INT NOT NULL,
  owner_id INT NOT NULL,
  message_permission ENUM('all', 'admin_only') DEFAULT 'all',
  add_member_permission ENUM('admin_only', 'everyone') DEFAULT 'everyone',
  allow_member_leave TINYINT(1) DEFAULT 1,
  slow_mode TINYINT(1) DEFAULT 0,
  slow_mode_seconds INT DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS group_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('member', 'admin', 'owner') DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_membership (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id VARCHAR(100) NOT NULL,
  sender_id INT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  type ENUM('text', 'file', 'system', 'image', 'video') DEFAULT 'text',
  reply_to INT NULL,
  is_deleted TINYINT(1) DEFAULT 0,
  deleted_by INT NULL,
  deleted_at TIMESTAMP NULL,
  edited_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(id),
  INDEX idx_conversation (conversation_id),
  INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS message_reactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  emoji VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_reaction (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
