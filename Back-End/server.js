const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

// Prevent unhandled rejections from killing the process
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
});

const pool = require('./config/database');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const groupRoutes = require('./routes/groups');
const notificationRoutes = require('./routes/notifications');
const uploadRoutes = require('./routes/upload');
const fileRoutes = require('./routes/files');
const reactionRoutes = require('./routes/reactions');
const settingsRoutes = require('./routes/settings');
const sessionsRoutes = require('./routes/sessions');
const messageReadsRoutes = require('./routes/messageReads');
const fileMetadataRoutes = require('./routes/fileMetadata');
const conversationMetadataRoutes = require('./routes/conversationMetadata');
const { setupSocket } = require('./socket');
const { cleanupExpiredData } = require('./services/sessionService');
const { errorHandler } = require('./middleware/errorHandler');
const { RateLimiter } = require('./middleware/rateLimit');
const optimizationService = require('./services/optimizationService');
const attachmentService = require('./services/attachmentService');

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Enhanced CORS with public IP and dynamic origin support
const defaultAllowedOrigins = [
  'http://localhost:9002',
  'http://localhost:9003',
  'http://192.168.91.173:9002',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://chat-app-three-beta-14.vercel.app',
];

const frontendUrl = process.env.FRONTEND_URL?.trim();

// Support environment variable origins
const envOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((url) => url.trim()).filter(Boolean)
  : [];

const ALLOWED_ORIGINS = [...new Set([
  ...defaultAllowedOrigins,
  ...envOrigins,
  ...(frontendUrl ? [frontendUrl] : []),
])];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS origin denied: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

console.log('[CORS] Frontend URL:', frontendUrl || 'not set');
console.log('[CORS] Allowed origins:', ALLOWED_ORIGINS);

// Socket.IO with enhanced configuration
const io = new Server(server, {
  cors: corsOptions,
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6, // 1MB
  transports: ['websocket', 'polling'],
});

// Make io and services accessible to routes
app.set('io', io);
app.set('optimizationService', optimizationService);
app.set('attachmentService', attachmentService);

// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

// Global rate limiters for different endpoint categories
const generalLimiter = new RateLimiter('general', 100, 60000).middleware();
const messageLimiter = new RateLimiter('messages', 30, 60000).middleware();
const notificationLimiter = new RateLimiter('notifications', 50, 60000).middleware();
const uploadLimiter = new RateLimiter('uploads', 10, 60000).middleware();

// Apply rate limiting to specific routes
app.use('/api/auth', generalLimiter);
app.use('/api/users', generalLimiter);
app.use('/api/messages', messageLimiter);
app.use('/api/notifications', notificationLimiter);
app.use('/api/upload', uploadLimiter);

// REST routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/reactions', reactionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/message-reads', messageReadsRoutes);
app.use('/api/file-metadata', fileMetadataRoutes);
app.use('/api/conversation-metadata', conversationMetadataRoutes);

// Health check with optimization stats
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Teams backend is running.',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    ...(process.env.NODE_ENV === 'development' && {
      optimizationStats: optimizationService.getStats(),
      attachmentServiceStats: attachmentService.getStats(),
    }),
  });
});

// Enhanced error handler (must be last)
app.use(errorHandler);

// Run startup DB migrations (safe: no-op if column already exists)
(async () => {
  const migrations = [
    'ALTER TABLE messages ADD COLUMN files TEXT NULL',
    'ALTER TABLE messages ADD COLUMN links TEXT NULL',
    'ALTER TABLE messages ADD COLUMN is_pinned TINYINT(1) DEFAULT 0',
    'ALTER TABLE messages ADD COLUMN is_deleted TINYINT(1) DEFAULT 0',
    'ALTER TABLE messages ADD COLUMN deleted_by INT NULL',
    'ALTER TABLE messages ADD COLUMN deleted_at DATETIME NULL',
    'ALTER TABLE group_members ADD COLUMN left_at DATETIME NULL DEFAULT NULL',
    // Create message_reads table for tracking read receipts
    `CREATE TABLE IF NOT EXISTS message_reads (
      id INT NOT NULL AUTO_INCREMENT,
      message_id INT NOT NULL,
      user_id INT NOT NULL,
      read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY message_reads_message_id_user_id_key (message_id, user_id),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_read_at (read_at)
    )`,
    // Create message_deliveries table for tracking delivery receipts
    `CREATE TABLE IF NOT EXISTS message_deliveries (
      id INT NOT NULL AUTO_INCREMENT,
      message_id INT NOT NULL,
      user_id INT NOT NULL,
      delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY message_deliveries_message_id_user_id_key (message_id, user_id),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_deliveries_message (message_id),
      INDEX idx_deliveries_user (user_id),
      INDEX idx_delivered_at (delivered_at)
    )`,
    'ALTER TABLE messages ADD COLUMN last_read_at DATETIME NULL',
    // Create conversation_last_seen table for tracking when users last viewed conversations
    `CREATE TABLE IF NOT EXISTS conversation_last_seen (
      user_id INT NOT NULL,
      conversation_id VARCHAR(100) NOT NULL,
      last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      last_message_id INT,
      PRIMARY KEY (user_id, conversation_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_conversation_id (conversation_id),
      INDEX idx_last_seen_at (last_seen_at)
    )`,
    // Create token_blacklist table for JWT revocation
    `CREATE TABLE IF NOT EXISTS token_blacklist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      user_id INT NOT NULL,
      blacklist_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      INDEX idx_token_hash (token_hash),
      INDEX idx_expires_at (expires_at)
    )`,
    // Create user_sessions table for session management
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id VARCHAR(36) PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      device_info VARCHAR(255),
      ip_address VARCHAR(45),
      user_agent TEXT,
      login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      logged_out_at TIMESTAMP NULL DEFAULT NULL,
      is_active TINYINT(1) DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_token_hash (token_hash),
      INDEX idx_is_active (is_active),
      INDEX idx_expires_at (expires_at)
    )`,
    // Create file_metadata table for persistent file tracking
    `CREATE TABLE IF NOT EXISTS file_metadata (
      id VARCHAR(36) PRIMARY KEY,
      r2_key VARCHAR(500) NOT NULL UNIQUE,
      conversation_id VARCHAR(100) NOT NULL,
      user_id INT NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      file_type VARCHAR(50) DEFAULT 'other',
      mime_type VARCHAR(100) DEFAULT '',
      file_size BIGINT DEFAULT 0,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      origin_message_id INT NULL DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_fm_conversation_id (conversation_id),
      INDEX idx_fm_user_id (user_id),
      INDEX idx_fm_uploaded_at (uploaded_at)
    )`,
    // Add performance indexes
    'ALTER TABLE users ADD INDEX idx_email (email)',
    'ALTER TABLE users ADD INDEX idx_status (status)',
    'ALTER TABLE messages ADD INDEX idx_sender_conversation (sender_id, conversation_id)',
    'ALTER TABLE messages ADD INDEX idx_conversation_created (conversation_id, created_at DESC)',
    'ALTER TABLE messages ADD INDEX idx_is_deleted (is_deleted)',
    'ALTER TABLE message_reactions ADD INDEX idx_message_user (message_id, user_id)',
    'ALTER TABLE group_members ADD INDEX idx_group_user (group_id, user_id)',
    'ALTER TABLE notification_reads ADD INDEX idx_notification (notification_id)',
  ];

  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_TABLE_EXISTS_ERROR' && err.code !== 'ER_DUP_KEY_NAME') {
        console.error('[migration]', err.message);
      }
    }
  }

  console.log('✅ Database migrations completed');
})();

// Wire Socket.IO handlers with optimization service
setupSocket(io, optimizationService);

// Cleanup expired sessions and blacklisted tokens every hour
setInterval(async () => {
  try {
    await cleanupExpiredData();
    console.log('[cleanup] Expired data cleanup completed');
  } catch (err) {
    console.error('Error during scheduled cleanup:', err.message);
  }
}, 60 * 60 * 1000); // 1 hour

// Periodic optimization service cleanup
setInterval(() => {
  const cleanupCount = optimizationService.cleanupDedup();
  if (cleanupCount > 0) {
    console.log(`[optimization] Cleaned ${cleanupCount} dedup entries`);
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Periodic attachment service cache cleanup
setInterval(() => {
  attachmentService.clearCache(); // Will be repopulated on demand
  console.log('[attachmentService] Cache cleared');
}, 60 * 60 * 1000); // Every hour

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  console.log(`✅ CORS enabled for: ${ALLOWED_ORIGINS.join(', ')}`);
  console.log(`✅ Optimization service initialized`);
  console.log(`✅ Socket.IO configured with health checks`);
});

// Run startup DB migrations (safe: no-op if column already exists)
(async () => {
  const migrations = [
    'ALTER TABLE messages ADD COLUMN files TEXT NULL',
    'ALTER TABLE messages ADD COLUMN links TEXT NULL',
    'ALTER TABLE messages ADD COLUMN is_pinned TINYINT(1) DEFAULT 0',
    'ALTER TABLE messages ADD COLUMN is_deleted TINYINT(1) DEFAULT 0',
    'ALTER TABLE messages ADD COLUMN deleted_by INT NULL',
    'ALTER TABLE messages ADD COLUMN deleted_at DATETIME NULL',
    'ALTER TABLE group_members ADD COLUMN left_at DATETIME NULL DEFAULT NULL',
    // Create message_reads table for tracking read receipts
    `CREATE TABLE IF NOT EXISTS message_reads (
      id INT NOT NULL AUTO_INCREMENT,
      message_id INT NOT NULL,
      user_id INT NOT NULL,
      read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY message_reads_message_id_user_id_key (message_id, user_id),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_read_at (read_at)
    )`,
    // Create message_deliveries table for tracking delivery receipts
    `CREATE TABLE IF NOT EXISTS message_deliveries (
      id INT NOT NULL AUTO_INCREMENT,
      message_id INT NOT NULL,
      user_id INT NOT NULL,
      delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY message_deliveries_message_id_user_id_key (message_id, user_id),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_deliveries_message (message_id),
      INDEX idx_deliveries_user (user_id),
      INDEX idx_delivered_at (delivered_at)
    )`,
    'ALTER TABLE messages ADD COLUMN last_read_at DATETIME NULL',
    // Create conversation_last_seen table for tracking when users last viewed conversations
    `CREATE TABLE IF NOT EXISTS conversation_last_seen (
      user_id INT NOT NULL,
      conversation_id VARCHAR(100) NOT NULL,
      last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      last_message_id INT,
      PRIMARY KEY (user_id, conversation_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_conversation_id (conversation_id),
      INDEX idx_last_seen_at (last_seen_at)
    )`,
    // Create token_blacklist table for JWT revocation
    `CREATE TABLE IF NOT EXISTS token_blacklist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      user_id INT NOT NULL,
      blacklist_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      INDEX idx_token_hash (token_hash),
      INDEX idx_expires_at (expires_at)
    )`,
    // Create user_sessions table for session management
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id VARCHAR(36) PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      device_info VARCHAR(255),
      ip_address VARCHAR(45),
      user_agent TEXT,
      login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      logged_out_at TIMESTAMP NULL DEFAULT NULL,
      is_active TINYINT(1) DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_token_hash (token_hash),
      INDEX idx_is_active (is_active),
      INDEX idx_expires_at (expires_at)
    )`,
    // Create file_metadata table for persistent file tracking
    `CREATE TABLE IF NOT EXISTS file_metadata (
      id VARCHAR(36) PRIMARY KEY,
      r2_key VARCHAR(500) NOT NULL UNIQUE,
      conversation_id VARCHAR(100) NOT NULL,
      user_id INT NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      file_type VARCHAR(50) DEFAULT 'other',
      mime_type VARCHAR(100) DEFAULT '',
      file_size BIGINT DEFAULT 0,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      origin_message_id INT NULL DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_fm_conversation_id (conversation_id),
      INDEX idx_fm_user_id (user_id),
      INDEX idx_fm_uploaded_at (uploaded_at)
    )`,
    // Add performance indexes
    'ALTER TABLE users ADD INDEX idx_email (email)',
    'ALTER TABLE users ADD INDEX idx_status (status)',
    'ALTER TABLE messages ADD INDEX idx_sender_conversation (sender_id, conversation_id)',
    'ALTER TABLE messages ADD INDEX idx_conversation_created (conversation_id, created_at DESC)',
    'ALTER TABLE messages ADD INDEX idx_is_deleted (is_deleted)',
    'ALTER TABLE message_reactions ADD INDEX idx_message_user (message_id, user_id)',
    'ALTER TABLE group_members ADD INDEX idx_group_user (group_id, user_id)',
    'ALTER TABLE notification_reads ADD INDEX idx_notification (notification_id)',
  ];

  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_TABLE_EXISTS_ERROR' && err.code !== 'ER_DUP_KEY_NAME') {
        console.error('[migration]', err.message);
      }
    }
  }
})();

// Wire Socket.IO handlers
setupSocket(io);

// Cleanup expired sessions and blacklisted tokens every hour
setInterval(async () => {
  try {
    await cleanupExpiredData();
  } catch (err) {
    console.error('Error during scheduled cleanup:', err.message);
  }
}, 60 * 60 * 1000); // 1 hour

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});
