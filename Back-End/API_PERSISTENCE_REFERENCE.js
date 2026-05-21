/**
 * PERSISTENCE & SESSION MANAGEMENT API REFERENCE
 * Complete guide to all new database-backed endpoints
 * 
 * All endpoints require authentication (Bearer token in Authorization header)
 * All responses return JSON format with { success, data, message } structure
 */

// ============================================================================
// AUTH ROUTES - Enhanced with session management
// ============================================================================

/**
 * POST /api/auth/login
 * Login user and create session
 * 
 * Request:
 * {
 *   "email": "user@example.com",
 *   "password": "password123",
 *   "deviceInfo": {
 *     "deviceName": "iPhone 15",
 *     "userAgent": "...",
 *     "ipAddress": "192.168.1.1"
 *   }
 * }
 * 
 * Response:
 * {
 *   "message": "Login successful.",
 *   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *   "sessionId": "12345",
 *   "expiresAt": "2026-05-16T12:34:56Z",
 *   "user": { id, name, email, role, avatar, ... }
 * }
 */

/**
 * POST /api/auth/refresh
 * Refresh JWT token and create new session
 * 
 * Response:
 * {
 *   "message": "Token refreshed.",
 *   "token": "new_jwt_token",
 *   "sessionId": "new_session_id",
 *   "expiresAt": "2026-05-16T12:34:56Z",
 *   "user": { ... }
 * }
 */

/**
 * POST /api/auth/logout
 * Logout from current device only (blacklist current token)
 * 
 * Response:
 * {
 *   "message": "Logged out successfully.",
 *   "timestamp": "2026-05-15T10:20:30Z"
 * }
 * 
 * Effect: Invalidates only current token/session. Other devices stay logged in.
 */

/**
 * POST /api/auth/logout-all
 * Logout from ALL devices (invalidate all sessions)
 * 
 * Response:
 * {
 *   "message": "Logged out from all devices successfully.",
 *   "invalidatedSessions": 3,
 *   "timestamp": "2026-05-15T10:20:30Z"
 * }
 * 
 * Effect: Invalidates all active sessions. User must login again on all devices.
 */

// ============================================================================
// SETTINGS ROUTES - Persistent user preferences
// ============================================================================

/**
 * GET /api/settings
 * Get all user settings
 * 
 * Response:
 * {
 *   "settings": {
 *     "theme": "dark",
 *     "compactMode": false,
 *     "messageDensity": "comfortable",
 *     "sidebarCollapsed": false,
 *     "notificationsEnabled": true,
 *     "soundEnabled": true,
 *     "notificationSound": "default",
 *     "desktopNotifications": true,
 *     "muteAll": false,
 *     "onlineStatusVisible": true,
 *     "typingIndicator": true,
 *     "readReceipts": true,
 *     "lastSeenVisible": true,
 *     "autoPlayVideos": false,
 *     "autoPlayGifs": true,
 *     "previewLinks": true,
 *     "dateFormat": "12h",
 *     "language": "en",
 *     "timezone": "UTC",
 *     "debugMode": false
 *   }
 * }
 */

/**
 * PATCH /api/settings
 * Update multiple settings at once
 * 
 * Request:
 * {
 *   "theme": "light",
 *   "soundEnabled": false,
 *   "messageDensity": "spacious"
 * }
 * 
 * Response:
 * {
 *   "message": "Settings updated.",
 *   "settings": {
 *     "theme": "light",
 *     "soundEnabled": false,
 *     "messageDensity": "spacious"
 *   }
 * }
 */

/**
 * PATCH /api/settings/:key
 * Update a single setting
 * 
 * Request:
 * {
 *   "value": "dark"
 * }
 * 
 * Example: PATCH /api/settings/theme
 * 
 * Response:
 * {
 *   "message": "Setting updated.",
 *   "setting": {
 *     "theme": "dark"
 *   }
 * }
 */

// ============================================================================
// SESSIONS ROUTES - Multi-device session management
// ============================================================================

/**
 * GET /api/sessions
 * Get all active sessions for current user (device listing)
 * 
 * Response:
 * {
 *   "sessions": [
 *     {
 *       "id": "sess_123",
 *       "deviceInfo": "iPhone",
 *       "ipAddress": "192.168.1.1",
 *       "loginAt": "2026-05-15T10:00:00Z",
 *       "lastActivity": "2026-05-15T10:20:30Z",
 *       "expiresAt": "2026-05-16T10:00:00Z",
 *       "isActive": true
 *     },
 *     {
 *       "id": "sess_456",
 *       "deviceInfo": "Chrome on Windows",
 *       "ipAddress": "10.0.0.5",
 *       "loginAt": "2026-05-14T14:00:00Z",
 *       "lastActivity": "2026-05-15T09:45:00Z",
 *       "expiresAt": "2026-05-15T14:00:00Z",
 *       "isActive": true
 *     }
 *   ]
 * }
 */

/**
 * DELETE /api/sessions/:sessionId
 * Logout from a specific device
 * 
 * Example: DELETE /api/sessions/sess_123
 * 
 * Response:
 * {
 *   "message": "Session invalidated."
 * }
 * 
 * Effect: Only invalidates that session. User stays logged in on other devices.
 */

// ============================================================================
// MESSAGE READS ROUTES - Unread counts & read receipts
// ============================================================================

/**
 * POST /api/message-reads/:messageId
 * Mark a single message as read
 * 
 * Example: POST /api/message-reads/42
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Message marked as read."
 * }
 */

/**
 * POST /api/message-reads/conversation/:conversationId
 * Mark all messages in a conversation as read
 * 
 * Example: POST /api/message-reads/conversation/dm_1_2
 * 
 * Response:
 * {
 *   "success": true,
 *   "markedCount": 15,
 *   "message": "Conversation marked as read."
 * }
 */

/**
 * GET /api/message-reads/unread/:conversationId
 * Get unread count for a specific conversation
 * 
 * Example: GET /api/message-reads/unread/dm_1_2
 * 
 * Response:
 * {
 *   "conversationId": "dm_1_2",
 *   "unreadCount": 5
 * }
 */

/**
 * GET /api/message-reads/unread
 * Get unread counts for ALL conversations + last-seen tracking
 * 
 * Response:
 * {
 *   "unreadCounts": {
 *     "dm_1_2": {
 *       "unread_count": 3,
 *       "last_message_id": 125,
 *       "last_message_time": "2026-05-15T10:20:00Z"
 *     },
 *     "5": {
 *       "unread_count": 7,
 *       "last_message_id": 789,
 *       "last_message_time": "2026-05-15T10:15:00Z"
 *     }
 *   },
 *   "lastSeen": {
 *     "dm_1_2": {
 *       "lastSeenAt": "2026-05-15T09:00:00Z",
 *       "lastMessageId": 120
 *     },
 *     "5": {
 *       "lastSeenAt": "2026-05-15T08:30:00Z",
 *       "lastMessageId": 700
 *     }
 *   }
 * }
 */

/**
 * POST /api/message-reads/last-seen/:conversationId
 * Update last-seen timestamp for a conversation (call when opening chat)
 * 
 * Request:
 * {
 *   "messageId": 150
 * }
 * 
 * Example: POST /api/message-reads/last-seen/dm_1_2
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Last seen updated."
 * }
 */

/**
 * GET /api/message-reads/last-seen/:conversationId
 * Get last-seen info for a conversation
 * 
 * Example: GET /api/message-reads/last-seen/dm_1_2
 * 
 * Response:
 * {
 *   "conversationId": "dm_1_2",
 *   "lastSeen": {
 *     "lastSeenAt": "2026-05-15T10:00:00Z",
 *     "lastMessageId": 145
 *   }
 * }
 */

/**
 * GET /api/message-reads/last-seen
 * Get last-seen for all conversations
 * 
 * Response:
 * {
 *   "lastSeen": {
 *     "dm_1_2": {
 *       "lastSeenAt": "2026-05-15T10:00:00Z",
 *       "lastMessageId": 145
 *     },
 *     "5": {
 *       "lastSeenAt": "2026-05-15T09:30:00Z",
 *       "lastMessageId": 600
 *     }
 *   }
 * }
 */

// ============================================================================
// FILE METADATA ROUTES - Track uploaded files
// ============================================================================

/**
 * GET /api/file-metadata/conversation/:conversationId
 * Get all files in a conversation
 * 
 * Example: GET /api/file-metadata/conversation/dm_1_2
 * 
 * Response:
 * {
 *   "conversationId": "dm_1_2",
 *   "files": [
 *     {
 *       "id": "file_123",
 *       "r2Key": "chats/dm_1_2/1234567890-abcd.jpg",
 *       "originalName": "photo.jpg",
 *       "fileType": "image",
 *       "mimeType": "image/jpeg",
 *       "fileSize": 2048576,
 *       "uploadedAt": "2026-05-15T10:20:00Z"
 *     },
 *     {
 *       "id": "file_456",
 *       "r2Key": "chats/dm_1_2/1234567891-efgh.pdf",
 *       "originalName": "document.pdf",
 *       "fileType": "document",
 *       "mimeType": "application/pdf",
 *       "fileSize": 1048576,
 *       "uploadedAt": "2026-05-15T10:15:00Z"
 *     }
 *   ]
 * }
 */

/**
 * GET /api/file-metadata/user
 * Get all files uploaded by current user
 * 
 * Query params:
 * - limit: max results (default 100, max 500)
 * 
 * Example: GET /api/file-metadata/user?limit=50
 * 
 * Response:
 * {
 *   "files": [ ... same format as above ... ]
 * }
 */

/**
 * GET /api/file-metadata/search/:conversationId
 * Search files in a conversation by name
 * 
 * Query params:
 * - q: search term (minimum 2 chars)
 * 
 * Example: GET /api/file-metadata/search/5?q=invoice
 * 
 * Response:
 * {
 *   "conversationId": "5",
 *   "files": [ ... matching files ... ]
 * }
 */

/**
 * GET /api/file-metadata/type/:conversationId/:fileType
 * Get files by type in a conversation
 * 
 * File types: image, video, document, archive, other
 * 
 * Example: GET /api/file-metadata/type/5/image
 * 
 * Response:
 * {
 *   "conversationId": "5",
 *   "fileType": "image",
 *   "files": [ ... image files only ... ]
 * }
 */

// ============================================================================
// CONVERSATION METADATA ROUTES - Mute, pin, block, hide
// ============================================================================

/**
 * GET /api/conversation-metadata/:conversationId
 * Get metadata for a conversation
 * 
 * Example: GET /api/conversation-metadata/dm_1_2
 * 
 * Response:
 * {
 *   "conversationId": "dm_1_2",
 *   "metadata": {
 *     "isMuted": false,
 *     "mutedUntil": null,
 *     "isPinned": true,
 *     "isBlocked": false,
 *     "isHidden": false
 *   }
 * }
 */

/**
 * GET /api/conversation-metadata
 * Get all metadata for current user across all conversations
 * 
 * Response:
 * {
 *   "metadata": {
 *     "dm_1_2": {
 *       "isMuted": false,
 *       "mutedUntil": null,
 *       "isPinned": true,
 *       "isBlocked": false,
 *       "isHidden": false
 *     },
 *     "5": {
 *       "isMuted": true,
 *       "mutedUntil": "2026-05-16T10:00:00Z",
 *       "isPinned": false,
 *       "isBlocked": false,
 *       "isHidden": false
 *     }
 *   }
 * }
 */

/**
 * POST /api/conversation-metadata/:conversationId/mute
 * Mute a conversation (hide notifications)
 * 
 * Request (optional):
 * {
 *   "mutedUntil": "2026-05-16T10:00:00Z"  // Optional: auto-unmute at this time
 * }
 * 
 * Example: POST /api/conversation-metadata/dm_1_2/mute
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Conversation muted."
 * }
 */

/**
 * POST /api/conversation-metadata/:conversationId/unmute
 * Unmute a conversation
 * 
 * Example: POST /api/conversation-metadata/dm_1_2/unmute
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Conversation unmuted."
 * }
 */

/**
 * POST /api/conversation-metadata/:conversationId/pin
 * Pin a conversation (keeps it at top of list)
 * 
 * Example: POST /api/conversation-metadata/5/pin
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Conversation pinned."
 * }
 */

/**
 * POST /api/conversation-metadata/:conversationId/unpin
 * Unpin a conversation
 * 
 * Example: POST /api/conversation-metadata/5/unpin
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Conversation unpinned."
 * }
 */

/**
 * POST /api/conversation-metadata/:conversationId/block
 * Block a user or conversation (for DMs)
 * 
 * Example: POST /api/conversation-metadata/dm_1_2/block
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Conversation blocked."
 * }
 */

/**
 * POST /api/conversation-metadata/:conversationId/unblock
 * Unblock a conversation
 * 
 * Example: POST /api/conversation-metadata/dm_1_2/unblock
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Conversation unblocked."
 * }
 */

/**
 * POST /api/conversation-metadata/:conversationId/hide
 * Hide a conversation from the list
 * 
 * Example: POST /api/conversation-metadata/dm_1_2/hide
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Conversation hidden."
 * }
 */

/**
 * POST /api/conversation-metadata/:conversationId/unhide
 * Unhide a conversation (show in list)
 * 
 * Example: POST /api/conversation-metadata/dm_1_2/unhide
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Conversation unhidden."
 * }
 */

/**
 * GET /api/conversation-metadata/pinned
 * Get list of pinned conversation IDs
 * 
 * Response:
 * {
 *   "pinnedConversations": ["dm_1_2", "5", "12"]
 * }
 */

/**
 * GET /api/conversation-metadata/muted
 * Get list of muted conversations with mute expiry times
 * 
 * Response:
 * {
 *   "mutedConversations": {
 *     "dm_1_3": "2026-05-16T10:00:00Z",  // null if muted permanently
 *     "7": null
 *   }
 * }
 */

// ============================================================================
// SOCKET.IO REAL-TIME EVENTS
// ============================================================================

/**
 * Socket Events for Message Reads & Notifications
 */

// Emit from client to mark message as read
socket.emit('mark_message_read', {
  messageId: 42,
  conversationId: 'dm_1_2'
}, (response) => {
  console.log(response.success); // true
});

// Listen for broadcast when another user reads message
socket.on('message_read', ({ messageId, userId, readAt }) => {
  console.log(`User ${userId} read message ${messageId} at ${readAt}`);
});

// Mark entire conversation as read
socket.emit('mark_conversation_read', {
  conversationId: 'dm_1_2',
  lastMessageId: 150
}, (response) => {
  console.log(response.readCount); // number of messages marked
});

// Listen for conversation read broadcast
socket.on('conversation_read', ({ conversationId, userId, readUntilMessageId, readAt }) => {
  // User read all messages up to readUntilMessageId
});

// Update last seen (call when opening a conversation)
socket.emit('update_last_seen', {
  conversationId: 'dm_1_2',
  lastMessageId: 150
});

/**
 * Socket Events for Settings Sync
 */

// Emit when user changes settings
socket.emit('settings_changed', {
  setting: 'theme',
  value: 'dark'
}, (response) => {
  console.log(response.success);
});

// Listen for settings changes on other devices
socket.on('settings_updated', ({ userId, setting, value, timestamp }) => {
  // Update settings automatically on all connected devices
});

/**
 * Socket Events for Session Management
 */

// Check if current session is still valid
socket.emit('check_session_status', (response) => {
  if (!response.sessionActive) {
    // Redirect to login
  }
});

// Listen for session invalidation (logout from another device)
// Server broadcasts when user logs out elsewhere
socket.on('session_invalidated', ({ timestamp, reason }) => {
  // Force logout and redirect to login
});

/**
 * Socket Events for Conversation Metadata
 */

// Notify when user mutes/pins/blocks a conversation
socket.emit('conversation_metadata_changed', {
  conversationId: 'dm_1_2',
  action: 'mute',
  value: true
});

// Listen for metadata changes
socket.on('conversation_metadata_updated', ({ conversationId, userId, action, value, timestamp }) => {
  // Update conversation metadata in UI
});

// ============================================================================
// INTEGRATION EXAMPLES
// ============================================================================

/**
 * EXAMPLE: Login with session creation
 */
async function loginWithSession(email, password, deviceInfo) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      deviceInfo: {
        deviceName: deviceInfo.deviceName,
        userAgent: navigator.userAgent,
        ipAddress: 'client-ip' // Server extracts from request
      }
    })
  });

  const data = await response.json();
  
  // Store session info
  localStorage.setItem('token', data.token);
  localStorage.setItem('sessionId', data.sessionId);
  localStorage.setItem('sessionExpires', data.expiresAt);

  return data;
}

/**
 * EXAMPLE: Load unread counts and last-seen on app startup
 */
async function loadConversationState() {
  const response = await fetch('/api/message-reads/unread', {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });

  const { unreadCounts, lastSeen } = await response.json();

  // Update conversation list UI with unread badges
  // Use lastSeen to highlight unread messages
}

/**
 * EXAMPLE: Mark conversation as read when user opens it
 */
async function openConversation(conversationId) {
  // Update last seen in database
  await fetch(`/api/message-reads/last-seen/${conversationId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messageId: lastMessageInConversation.id
    })
  });

  // Notify socket for real-time sync
  socket.emit('update_last_seen', {
    conversationId,
    lastMessageId: lastMessageInConversation.id
  });

  // Mark all as read
  await fetch(`/api/message-reads/conversation/${conversationId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
}

/**
 * EXAMPLE: Load user settings on app startup
 */
async function loadUserSettings() {
  const response = await fetch('/api/settings', {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });

  const { settings } = await response.json();

  // Apply theme
  applyTheme(settings.theme);
  
  // Update UI preferences
  updateUIFromSettings(settings);

  // Listen for changes on other devices
  socket.on('settings_updated', ({ setting, value }) => {
    if (setting === 'theme') {
      applyTheme(value);
    }
  });
}

/**
 * EXAMPLE: Change a setting (syncs across devices)
 */
async function updateUserSetting(key, value) {
  // Update in database
  await fetch(`/api/settings/${key}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ value })
  });

  // Notify all other devices via socket
  socket.emit('settings_changed', { setting: key, value });
}

/**
 * EXAMPLE: List user's devices and logout from one
 */
async function manageDevices() {
  // Get all active sessions
  const response = await fetch('/api/sessions', {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });

  const { sessions } = await response.json();

  // Display list to user...

  // Logout from specific device
  async function logoutDevice(sessionId) {
    await fetch(`/api/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
  }
}
