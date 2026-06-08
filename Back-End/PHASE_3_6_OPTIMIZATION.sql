-- ═══════════════════════════════════════════════════════════════════════════════════
-- Phases 3-6 Optimization: Indexes & Performance Improvements
-- ═══════════════════════════════════════════════════════════════════════════════════
-- Run this file on your MySQL database to add the necessary indexes for:
--   Phase 3: Message Read Status Sync
--   Phase 4: Real-Time Sidebar Updates
--   Phase 5: Cross-Device Draft Sync
--   Phase 6: Performance (Virtual Scrolling)

USE teams_app;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- PHASE 3: Message Read Status Tracking
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Index messages by conversation_id and created_at for efficient pagination
-- (used by Phase 6 get_messages_paginated)
ALTER TABLE messages ADD INDEX idx_conversation_created
  (conversation_id, created_at DESC);

-- Index message_reads for fast lookups by message and user
ALTER TABLE message_reads ADD INDEX idx_message_user
  (message_id, user_id);

-- Index message_reads by user for "unread messages by user" queries
ALTER TABLE message_reads ADD INDEX idx_user_read_at
  (user_id, read_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════════
-- PHASE 4: Real-Time Sidebar Updates
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Index conversation_last_seen for efficient "unread count" queries
ALTER TABLE conversation_last_seen ADD INDEX idx_user_conversation
  (user_id, conversation_id);

ALTER TABLE conversation_last_seen ADD INDEX idx_updated_at
  (updated_at DESC);

-- Index conversation_metadata for sidebar sync queries
ALTER TABLE conversation_metadata ADD INDEX idx_user_updated
  (user_id, updated_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════════
-- PHASE 6: Virtual Scrolling Performance
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Message pagination optimization (already created above)
-- Ensure sender_id index exists for message filtering
ALTER TABLE messages ADD INDEX idx_sender_conversation
  (sender_id, conversation_id);

-- Index for deleted message filtering
ALTER TABLE messages ADD INDEX idx_deleted_conversation
  (is_deleted, conversation_id);

-- ═══════════════════════════════════════════════════════════════════════════════════
-- Verification
-- ═══════════════════════════════════════════════════════════════════════════════════

-- Check all indexes on messages table
SHOW INDEX FROM messages;

-- Check all indexes on message_reads table
SHOW INDEX FROM message_reads;

-- Check all indexes on conversation_last_seen table
SHOW INDEX FROM conversation_last_seen;

-- Check all indexes on conversation_metadata table
SHOW INDEX FROM conversation_metadata;
