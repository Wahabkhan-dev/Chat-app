/**
 * Optimization Service
 * Provides caching, deduplication, batch operations, and health monitoring
 */

const pool = require('../config/database');

class OptimizationService {
  constructor() {
    this.queryCache = new Map();
    this.socketEventDeduplicator = new Map();
    this.notificationDedup = new Map();
    this.eventCounters = new Map();
    this.socketHeartbeats = new Map();
  }

  /**
   * Query caching with TTL
   */
  async cachedQuery(key, queryFn, ttlMs = 30000) {
    const now = Date.now();
    if (this.queryCache.has(key)) {
      const { data, expiry } = this.queryCache.get(key);
      if (now < expiry) {
        return data;
      }
      this.queryCache.delete(key);
    }

    try {
      const data = await queryFn();
      this.queryCache.set(key, { data, expiry: now + ttlMs });
      return data;
    } catch (err) {
      console.error(`[queryCache] error for key ${key}:`, err.message);
      throw err;
    }
  }

  /**
   * Clear specific cache entry
   */
  clearCache(key) {
    this.queryCache.delete(key);
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    this.queryCache.clear();
  }

  /**
   * Deduplicate socket events within a time window
   * Prevents duplicate processing of same event
   */
  shouldProcessSocketEvent(socketId, eventName, dataHash, windowMs = 1000) {
    const key = `${socketId}_${eventName}`;
    const now = Date.now();

    if (this.socketEventDeduplicator.has(key)) {
      const { hash, lastTime } = this.socketEventDeduplicator.get(key);
      if (hash === dataHash && (now - lastTime) < windowMs) {
        return false; // Duplicate detected, skip processing
      }
    }

    this.socketEventDeduplicator.set(key, { hash: dataHash, lastTime: now });
    return true;
  }

  /**
   * Track socket event counts for monitoring
   */
  incrementEventCounter(eventName) {
    const count = (this.eventCounters.get(eventName) || 0) + 1;
    this.eventCounters.set(eventName, count);
    return count;
  }

  /**
   * Get event statistics
   */
  getEventStats() {
    return Object.fromEntries(this.eventCounters);
  }

  /**
   * Reset event counters
   */
  resetEventStats() {
    this.eventCounters.clear();
  }

  /**
   * Socket health check - detect stale connections
   */
  recordSocketHeartbeat(socketId) {
    this.socketHeartbeats.set(socketId, Date.now());
  }

  /**
   * Check if socket has stale heartbeat
   */
  isSocketStale(socketId, maxAgeMs = 60000) {
    const lastHeartbeat = this.socketHeartbeats.get(socketId);
    if (!lastHeartbeat) return true;
    return (Date.now() - lastHeartbeat) > maxAgeMs;
  }

  /**
   * Clean up stale socket heartbeats
   */
  cleanupStaleHeartbeats(maxAgeMs = 120000) {
    const now = Date.now();
    let cleaned = 0;
    for (const [socketId, timestamp] of this.socketHeartbeats.entries()) {
      if ((now - timestamp) > maxAgeMs) {
        this.socketHeartbeats.delete(socketId);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * Batch fetch messages with reactions (prevents N+1)
   */
  async fetchMessagesWithReactions(messageIds) {
    if (!messageIds || messageIds.length === 0) return [];

    try {
      // Fetch all messages
      const placeholders = messageIds.map(() => '?').join(',');
      const [messages] = await pool.query(
        `SELECT * FROM messages WHERE id IN (${placeholders})`,
        messageIds
      );

      // Fetch all reactions for these messages in one query
      const [allReactions] = await pool.query(
        `SELECT message_id, emoji, user_id FROM message_reactions WHERE message_id IN (${placeholders})`,
        messageIds
      );

      // Map reactions to messages
      const reactionMap = {};
      allReactions.forEach(r => {
        if (!reactionMap[r.message_id]) reactionMap[r.message_id] = {};
        if (!reactionMap[r.message_id][r.emoji]) reactionMap[r.message_id][r.emoji] = [];
        reactionMap[r.message_id][r.emoji].push(String(r.user_id));
      });

      // Attach reactions to messages
      messages.forEach(msg => {
        const reactions = reactionMap[msg.id] || {};
        msg.reactions = Object.entries(reactions).map(([emoji, users]) => ({ emoji, users }));
      });

      return messages;
    } catch (err) {
      console.error('[fetchMessagesWithReactions] error:', err);
      throw err;
    }
  }

  /**
   * Batch check user permissions across multiple conversations
   */
  async checkUserConversationAccess(userId, conversationIds) {
    if (!conversationIds || conversationIds.length === 0) return {};

    try {
      const dmIds = conversationIds.filter(id => id.startsWith('dm_'));
      const groupIds = conversationIds.filter(id => !id.startsWith('dm_'));

      const access = {};

      // Check DM access
      dmIds.forEach(id => {
        const parts = id.split('_');
        if (parts.length === 3) {
          const hasAccess = String(userId) === String(parts[1]) || String(userId) === String(parts[2]);
          access[id] = hasAccess;
        } else {
          access[id] = false;
        }
      });

      // Check group access
      if (groupIds.length > 0) {
        const placeholders = groupIds.map(() => '?').join(',');
        const params = [...groupIds.map(id => [id, userId]).flat()];
        
        const query = `
          SELECT DISTINCT group_id 
          FROM group_members 
          WHERE group_id IN (${placeholders.split(',').map((_, i) => i % 2 === 0 ? '?' : 'AND user_id = ?').join(', ')})
          AND user_id = ?
          AND left_at IS NULL
        `;
        
        // Simpler approach: fetch in batches
        for (const groupId of groupIds) {
          const [rows] = await pool.query(
            'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1',
            [groupId, userId]
          );
          access[groupId] = rows.length > 0;
        }
      }

      return access;
    } catch (err) {
      console.error('[checkUserConversationAccess] error:', err);
      throw err;
    }
  }

  /**
   * Deduplicate notification before creation
   */
  async shouldCreateNotification(type, recipientId, senderId, messageId, emoji, timeWindowMs = 30000) {
    const key = `notif_${type}_${recipientId}_${senderId}_${messageId}_${emoji || 'none'}`;
    const now = Date.now();

    if (this.notificationDedup.has(key)) {
      const lastTime = this.notificationDedup.get(key);
      if ((now - lastTime) < timeWindowMs) {
        return false; // Recent duplicate, skip
      }
    }

    this.notificationDedup.set(key, now);
    return true;
  }

  /**
   * Cleanup old dedup entries
   */
  cleanupDedup(maxAgeMs = 60000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, timestamp] of this.notificationDedup.entries()) {
      if ((now - timestamp) > maxAgeMs) {
        this.notificationDedup.delete(key);
        cleaned++;
      }
    }

    for (const [key, { lastTime }] of this.socketEventDeduplicator.entries()) {
      if ((now - lastTime) > maxAgeMs) {
        this.socketEventDeduplicator.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get optimization stats
   */
  getStats() {
    return {
      cacheSize: this.queryCache.size,
      socketDeduplicatorSize: this.socketEventDeduplicator.size,
      notificationDedupSize: this.notificationDedup.size,
      heartbeatsSize: this.socketHeartbeats.size,
      eventStats: Object.fromEntries(this.eventCounters),
    };
  }
}

const optimizationService = new OptimizationService();

// Periodic cleanup
setInterval(() => {
  const cleaned = optimizationService.cleanupDedup();
  const staleHeartbeats = optimizationService.cleanupStaleHeartbeats();
  if (cleaned > 0 || staleHeartbeats > 0) {
    console.log(`[optimizationService] cleaned ${cleaned} dedup entries, ${staleHeartbeats} stale heartbeats`);
  }
}, 60000);

module.exports = optimizationService;
