# Database Setup Guide

Complete setup instructions for the Teams App MySQL database. Run these steps in order when setting up on a new system.

---

## Prerequisites

- MySQL 8.x installed and running
- MySQL Workbench (optional but recommended)
- Node.js 18+ installed

---

## Step 1 — Create Database & Users Table

Run this in **MySQL Workbench** or `mysql` CLI:

```sql
-- Create the database
CREATE DATABASE IF NOT EXISTS teams_app;
USE teams_app;

-- Users table
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
```

---

## Step 2 — Create Chat & Groups Tables

```sql
USE teams_app;

-- Groups table
CREATE TABLE IF NOT EXISTS `groups` (
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
);

-- Group members table
CREATE TABLE IF NOT EXISTS group_members (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  group_id  INT NOT NULL,
  user_id   INT NOT NULL,
  role      ENUM('member', 'admin', 'owner') DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_membership (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)    ON DELETE CASCADE
);

-- Messages table
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

-- Message reactions table
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
```

---

## Step 3 — Seed First Admin User

The password for this account is: **`admin123`**

```sql
USE teams_app;

INSERT INTO users (name, email, password, role, department, avatar, status, is_active)
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

> After logging in, change the admin password immediately from the profile settings.

---

## Step 4 — Configure Environment Variables

Create a `.env` file in the `Backend/` folder with the following content:

```env
# Server
PORT=3001

# Database — update password to match your MySQL installation
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=teams_app

# JWT — keep this secret, change in production
JWT_SECRET=teams_super_secret_key_change_this_in_production
JWT_EXPIRES_IN=7d
```

---

## Step 5 — Install & Start Backend

```bash
cd Backend
npm install
npm run dev
```

Server will start on `http://localhost:3001`

---

## Verify Setup

```sql
USE teams_app;
SHOW TABLES;
-- Should show: users, groups, group_members, messages, message_reactions

SELECT id, name, email, role FROM users;
-- Should show the Admin User row
```

---

## Step 2b — Notifications Tables (added later)

```sql
USE teams_app;

CREATE TABLE IF NOT EXISTS notifications (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  type         VARCHAR(50) NOT NULL DEFAULT 'info',
  recipient_id INT NULL,
  title        VARCHAR(255) NOT NULL,
  body         VARCHAR(1000) NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INT NOT NULL,
  user_id         INT NOT NULL,
  read_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id, user_id),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE
);
```

---

## Alter Queries (run if upgrading an existing DB)

If you already have the database from a previous version and need to add missing columns:

```sql
-- Add is_pinned column if missing (added for pin message feature)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_pinned TINYINT(1) DEFAULT 0;
```

---

## Conversation ID Format

DM conversations use the format: `dm_{lower_id}_{higher_id}`  
Example: user 2 and user 5 → `dm_2_5`

Group conversations use the group's numeric ID as a plain string: `"1"`, `"2"`, etc.
