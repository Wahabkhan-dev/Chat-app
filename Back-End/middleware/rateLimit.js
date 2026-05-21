const pool = require('../config/database');

// In-memory store for rate limiting (can be replaced with Redis for production)
const userLastMessageTime = new Map();
const userRequestCounts = new Map();
const socketEventCounts = new Map();

// Enhanced rate limiting with specific limits for different operations
const RATE_LIMITS = {
  general: { maxRequests: 100, windowMs: 60000 }, // 100 req/min
  messages: { maxRequests: 30, windowMs: 60000 }, // 30 messages/min
  notifications: { maxRequests: 50, windowMs: 60000 }, // 50 notif/min
  reactions: { maxRequests: 60, windowMs: 60000 }, // 60 reactions/min
  uploads: { maxRequests: 10, windowMs: 60000 }, // 10 uploads/min
  search: { maxRequests: 20, windowMs: 60000 }, // 20 searches/min
};

// Rate limiting middleware for slow mode in groups
async function enforceSlowMode(req, res, next) {
  const userId = req.user?.id;
  const conversationId = req.body?.conversationId || req.params?.conversationId;

  if (!userId || !conversationId) {
    return next();
  }

  // Check if conversation is a group with slow mode enabled
  if (conversationId.startsWith('dm_')) {
    return next(); // Skip slow mode for DMs
  }

  try {
    const groupId = parseInt(conversationId);
    const [[groupSettings]] = await pool.query(
      'SELECT slow_mode, slow_mode_seconds FROM `groups` WHERE id = ?',
      [groupId]
    );

    if (!groupSettings?.slow_mode) {
      return next();
    }

    const key = `${userId}_${conversationId}`;
    const lastTime = userLastMessageTime.get(key) || 0;
    const now = Date.now();
    const timeSinceLastMessage = (now - lastTime) / 1000; // Convert to seconds
    const slowModeSeconds = groupSettings.slow_mode_seconds || 10;

    if (timeSinceLastMessage < slowModeSeconds) {
      const waitTime = Math.ceil(slowModeSeconds - timeSinceLastMessage);
      return res.status(429).json({
        message: `Slow mode active. Please wait ${waitTime} second${waitTime !== 1 ? 's' : ''} before sending another message.`,
        retryAfter: waitTime,
      });
    }

    // Update last message time
    userLastMessageTime.set(key, now);
    next();
  } catch (err) {
    console.error('[enforceSlowMode] error:', err);
    next(); // Continue on error, don't block messages
  }
}

// Enhanced generic rate limiter for API endpoints with category support
class RateLimiter {
  constructor(category = 'general', maxRequests = null, windowMs = null) {
    const limits = RATE_LIMITS[category] || RATE_LIMITS.general;
    this.category = category;
    this.maxRequests = maxRequests || limits.maxRequests;
    this.windowMs = windowMs || limits.windowMs;
    this.requests = new Map();
  }

  middleware() {
    return (req, res, next) => {
      const userId = req.user?.id || req.ip;
      const now = Date.now();
      const key = `${userId}_${this.category}`;

      if (!this.requests.has(key)) {
        this.requests.set(key, []);
      }

      const userRequests = this.requests.get(key);

      // Remove old requests outside the window
      const recentRequests = userRequests.filter(time => now - time < this.windowMs);

      if (recentRequests.length >= this.maxRequests) {
        const resetTime = Math.ceil((userRequests[0] + this.windowMs - now) / 1000);
        return res.status(429).json({
          error: {
            message: `Rate limit exceeded for ${this.category} operations. Please try again in ${resetTime}s.`,
            statusCode: 429,
            retryAfter: resetTime,
            limit: this.maxRequests,
            window: `${this.windowMs / 1000}s`,
          },
        });
      }

      recentRequests.push(now);
      this.requests.set(key, recentRequests);

      // Cleanup old entries (prevent memory leak)
      if (this.requests.size > 50000) {
        for (const [k, requests] of this.requests.entries()) {
          const recent = requests.filter(time => now - time < this.windowMs);
          if (recent.length === 0) {
            this.requests.delete(k);
          } else {
            this.requests.set(k, recent);
          }
        }
      }

      // Add rate limit headers
      res.set('X-RateLimit-Limit', this.maxRequests);
      res.set('X-RateLimit-Remaining', Math.max(0, this.maxRequests - recentRequests.length));
      res.set('X-RateLimit-Reset', Math.ceil((userRequests[0] + this.windowMs) / 1000));

      next();
    };
  }

  /**
   * Check if user is within rate limit (without incrementing)
   */
  isAllowed(userId) {
    const key = `${userId}_${this.category}`;
    const now = Date.now();

    if (!this.requests.has(key)) {
      return true;
    }

    const userRequests = this.requests.get(key);
    const recentRequests = userRequests.filter(time => now - time < this.windowMs);
    return recentRequests.length < this.maxRequests;
  }

  /**
   * Get remaining quota for user
   */
  getRemaining(userId) {
    const key = `${userId}_${this.category}`;
    const now = Date.now();

    if (!this.requests.has(key)) {
      return this.maxRequests;
    }

    const userRequests = this.requests.get(key);
    const recentRequests = userRequests.filter(time => now - time < this.windowMs);
    return Math.max(0, this.maxRequests - recentRequests.length);
  }
}

/**
 * Socket event rate limiter
 */
function checkSocketEventLimit(userId, eventName, limits = {}) {
  const defaultLimits = {
    send_message: { maxEvents: 10, windowMs: 10000 },
    react_message: { maxEvents: 20, windowMs: 10000 },
    edit_message: { maxEvents: 10, windowMs: 10000 },
    delete_message: { maxEvents: 10, windowMs: 10000 },
    typing: { maxEvents: 30, windowMs: 5000 },
    mark_message_read: { maxEvents: 50, windowMs: 10000 },
    get_online_users: { maxEvents: 5, windowMs: 10000 },
  };

  const eventLimit = limits[eventName] || defaultLimits[eventName];
  if (!eventLimit) return true; // No limit defined

  const key = `socket_${userId}_${eventName}`;
  const now = Date.now();

  if (!socketEventCounts.has(key)) {
    socketEventCounts.set(key, []);
  }

  const counts = socketEventCounts.get(key);
  const recent = counts.filter(time => now - time < eventLimit.windowMs);

  if (recent.length >= eventLimit.maxEvents) {
    return false; // Rate limit exceeded
  }

  recent.push(now);
  socketEventCounts.set(key, recent);

  return true; // Allowed
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, requests] of userRequestCounts.entries()) {
    if (!requests || requests.length === 0) {
      userRequestCounts.delete(key);
      cleaned++;
      continue;
    }
    const recent = requests.filter(time => now - time < 300000); // 5 min window
    if (recent.length === 0) {
      userRequestCounts.delete(key);
      cleaned++;
    }
  }

  for (const [key, events] of socketEventCounts.entries()) {
    if (!events || events.length === 0) {
      socketEventCounts.delete(key);
      cleaned++;
      continue;
    }
    const recent = events.filter(time => now - time < 300000);
    if (recent.length === 0) {
      socketEventCounts.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[rateLimit] cleaned ${cleaned} stale entries`);
  }
}, 120000); // Every 2 minutes

// Pre-configured limiters
const generalLimiter = new RateLimiter(100, 60000); // 100 requests per minute
const messageLimiter = new RateLimiter(30, 60000); // 30 messages per minute
const authLimiter = new RateLimiter(5, 900000); // 5 auth attempts per 15 minutes

module.exports = {
  enforceSlowMode,
  RateLimiter,
  checkSocketEventLimit,
  RATE_LIMITS,
  generalLimiter,
  messageLimiter,
  authLimiter,
};
