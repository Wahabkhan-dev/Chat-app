-- CreateTable
CREATE TABLE `group_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `group_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `role` ENUM('member', 'admin', 'owner') NULL DEFAULT 'member',
    `joined_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `user_id`(`user_id`),
    UNIQUE INDEX `unique_membership`(`group_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `description` VARCHAR(1000) NULL DEFAULT '',
    `avatar` MEDIUMTEXT NULL,
    `created_by` INTEGER NOT NULL,
    `owner_id` INTEGER NOT NULL,
    `message_permission` ENUM('all', 'admin_only') NULL DEFAULT 'all',
    `add_member_permission` ENUM('admin_only', 'everyone') NULL DEFAULT 'everyone',
    `allow_member_leave` BOOLEAN NULL DEFAULT true,
    `slow_mode` BOOLEAN NULL DEFAULT false,
    `slow_mode_seconds` INTEGER NULL DEFAULT 10,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `created_by`(`created_by`),
    INDEX `owner_id`(`owner_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_reactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `message_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `emoji` VARCHAR(20) NOT NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `user_id`(`user_id`),
    UNIQUE INDEX `unique_reaction`(`message_id`, `user_id`, `emoji`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` VARCHAR(100) NOT NULL,
    `content` TEXT NOT NULL,
    `sender_id` INTEGER NOT NULL,
    `type` ENUM('text', 'file', 'system', 'image', 'video') NULL DEFAULT 'text',
    `reply_to` INTEGER NULL,
    `is_deleted` BOOLEAN NULL DEFAULT false,
    `deleted_by` INTEGER NULL,
    `deleted_at` TIMESTAMP(0) NULL,
    `edited_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_conversation`(`conversation_id`),
    INDEX `idx_created_at`(`created_at`),
    INDEX `sender_id`(`sender_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_reads` (
    `notification_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `read_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `user_id`(`user_id`),
    PRIMARY KEY (`notification_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(50) NOT NULL DEFAULT 'info',
    `recipient_id` INTEGER NULL,
    `title` VARCHAR(255) NOT NULL,
    `body` VARCHAR(1000) NOT NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `device_info` VARCHAR(500) NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `login_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_activity` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` TIMESTAMP(0) NOT NULL,
    `logged_out_at` DATETIME(3) NULL,

    INDEX `user_sessions_user_id_idx`(`user_id`),
    INDEX `user_sessions_expires_at_idx`(`expires_at`),
    INDEX `user_sessions_token_hash_idx`(`token_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `token_blacklist` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token_hash` VARCHAR(255) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `blacklist_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` TIMESTAMP(0) NOT NULL,

    UNIQUE INDEX `token_blacklist_token_hash_key`(`token_hash`),
    INDEX `token_blacklist_user_id_idx`(`user_id`),
    INDEX `token_blacklist_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `theme` VARCHAR(20) NOT NULL DEFAULT 'system',
    `compact_mode` BOOLEAN NOT NULL DEFAULT false,
    `message_density` VARCHAR(20) NOT NULL DEFAULT 'comfortable',
    `sidebar_collapsed` BOOLEAN NOT NULL DEFAULT false,
    `notifications_enabled` BOOLEAN NOT NULL DEFAULT true,
    `sound_enabled` BOOLEAN NOT NULL DEFAULT true,
    `notification_sound` VARCHAR(20) NOT NULL DEFAULT 'default',
    `desktop_notifications` BOOLEAN NOT NULL DEFAULT true,
    `mute_all` BOOLEAN NOT NULL DEFAULT false,
    `online_status_visible` BOOLEAN NOT NULL DEFAULT true,
    `typing_indicator` BOOLEAN NOT NULL DEFAULT true,
    `read_receipts` BOOLEAN NOT NULL DEFAULT true,
    `last_seen_visible` BOOLEAN NOT NULL DEFAULT true,
    `auto_play_videos` BOOLEAN NOT NULL DEFAULT false,
    `auto_play_gifs` BOOLEAN NOT NULL DEFAULT true,
    `preview_links` BOOLEAN NOT NULL DEFAULT true,
    `date_format` VARCHAR(10) NOT NULL DEFAULT '12h',
    `language` VARCHAR(10) NOT NULL DEFAULT 'en',
    `timezone` VARCHAR(50) NOT NULL DEFAULT 'UTC',
    `debug_mode` BOOLEAN NOT NULL DEFAULT false,
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `user_settings_user_id_key`(`user_id`),
    INDEX `user_settings_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_reads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `message_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `read_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `message_reads_user_id_idx`(`user_id`),
    INDEX `message_reads_read_at_idx`(`read_at`),
    UNIQUE INDEX `message_reads_message_id_user_id_key`(`message_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_deliveries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `message_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `delivered_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `message_deliveries_message_id_idx`(`message_id`),
    INDEX `message_deliveries_user_id_idx`(`user_id`),
    UNIQUE INDEX `message_deliveries_message_id_user_id_key`(`message_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversation_last_seen` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` VARCHAR(100) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `last_seen_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_message_id` INTEGER NULL,
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `conversation_last_seen_user_id_idx`(`user_id`),
    UNIQUE INDEX `conversation_last_seen_conversation_id_user_id_key`(`conversation_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_metadata` (
    `id` VARCHAR(191) NOT NULL,
    `r2_key` VARCHAR(500) NOT NULL,
    `conversation_id` VARCHAR(100) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `file_type` VARCHAR(20) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `file_size` BIGINT NOT NULL,
    `uploaded_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `file_metadata_r2_key_key`(`r2_key`),
    INDEX `file_metadata_conversation_id_idx`(`conversation_id`),
    INDEX `file_metadata_user_id_idx`(`user_id`),
    INDEX `file_metadata_uploaded_at_idx`(`uploaded_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversation_metadata` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` VARCHAR(100) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `is_muted` BOOLEAN NOT NULL DEFAULT false,
    `muted_until` DATETIME(3) NULL,
    `is_pinned` BOOLEAN NOT NULL DEFAULT false,
    `is_blocked` BOOLEAN NOT NULL DEFAULT false,
    `is_hidden` BOOLEAN NOT NULL DEFAULT false,
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `conversation_metadata_user_id_idx`(`user_id`),
    UNIQUE INDEX `conversation_metadata_conversation_id_user_id_key`(`conversation_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `role` ENUM('admin', 'user') NOT NULL DEFAULT 'user',
    `avatar` TEXT NULL,
    `status` ENUM('online', 'away', 'offline', 'dnd') NOT NULL DEFAULT 'offline',
    `department` VARCHAR(100) NULL DEFAULT '',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `email`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `group_members` ADD CONSTRAINT `group_members_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `group_members` ADD CONSTRAINT `group_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `groups` ADD CONSTRAINT `groups_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `groups` ADD CONSTRAINT `groups_ibfk_2` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `message_reactions` ADD CONSTRAINT `message_reactions_ibfk_1` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `message_reactions` ADD CONSTRAINT `message_reactions_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `notification_reads` ADD CONSTRAINT `notification_reads_ibfk_1` FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `notification_reads` ADD CONSTRAINT `notification_reads_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_settings` ADD CONSTRAINT `user_settings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `message_reads` ADD CONSTRAINT `message_reads_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `conversation_last_seen` ADD CONSTRAINT `conversation_last_seen_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `file_metadata` ADD CONSTRAINT `file_metadata_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `conversation_metadata` ADD CONSTRAINT `conversation_metadata_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
