const jwt = require('jsonwebtoken');
const pool = require('./config/database');
const { updateLastSeen } = require('./services/messageReadsService');
const { createFileMetadata } = require('./services/fileMetadataService');
const { checkSocketEventLimit } = require('./middleware/rateLimit');
const crypto = require('crypto');
require('dotenv').config();

// Hash object for deduplication
function hashData(data) {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

function getDmConvId(id1, id2) {
  return `dm_${Math.min(Number(id1), Number(id2))}_${Math.max(Number(id1), Number(id2))}`;
}

function extractLinks(content) {
  const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
  const urls = [...new Set((content || '').match(urlRegex) || [])];
  return urls.map((url) => {
    let domain = '';
    try { domain = new URL(url).hostname.replace('www.', ''); } catch { domain = ''; }
    return {
      url,
      title: url,
      description: 'Shared external link for Mawby Technologies team members and collaborators.',
      domain,
    };
  });
}

function parseLinksRow(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch { return []; }
}

function formatMessage(row) {
  const ts = row.created_at;
  const files = (() => {
    if (!row.files) return [];
    if (Array.isArray(row.files)) return row.files;
    try { return JSON.parse(row.files); } catch { return []; }
  })();
  const links = parseLinksRow(row.links);
  return {
    id: String(row.id),
    senderId: String(row.sender_id),
    content: row.content || '',
    timestamp: ts instanceof Date ? ts.toISOString() : String(ts),
    type: row.type || 'text',
    reactions: [],
    replyTo: row.reply_to ? String(row.reply_to) : undefined,
    editedAt: row.edited_at ? (row.edited_at instanceof Date ? row.edited_at.toISOString() : String(row.edited_at)) : undefined,
    isDeleted: row.is_deleted === 1,
    isPinned: row.is_pinned === 1,
    deletedAt: row.deleted_at ? (row.deleted_at instanceof Date ? row.deleted_at.toISOString() : String(row.deleted_at)) : undefined,
    deletedBy: row.deleted_by ? String(row.deleted_by) : undefined,
    files,
    links,
    status: 'sent',
  };
}

const notificationSchemaCache = { checked: false, hasMetadata: false, hasConversationColumn: false };
async function hasNotificationMetadataColumns() {
  if (notificationSchemaCache.checked) return notificationSchemaCache.hasMetadata;
  try {
    const [rows] = await pool.query("SHOW COLUMNS FROM notifications LIKE 'sender_id'");
    notificationSchemaCache.hasMetadata = rows.length > 0;
  } catch (err) {
    console.error('[socket] notification schema check failed:', err);
    notificationSchemaCache.hasMetadata = false;
  }
  notificationSchemaCache.checked = true;
  return notificationSchemaCache.hasMetadata;
}

async function hasNotificationConversationColumn() {
  if (notificationSchemaCache.checked && notificationSchemaCache.hasConversationColumn !== undefined) {
    return notificationSchemaCache.hasConversationColumn;
  }
  try {
    const [rows] = await pool.query("SHOW COLUMNS FROM notifications LIKE 'conversation_id'");
    notificationSchemaCache.hasConversationColumn = rows.length > 0;
  } catch (err) {
    console.error('[socket] notification schema check failed for conversation_id:', err);
    notificationSchemaCache.hasConversationColumn = false;
  }
  return notificationSchemaCache.hasConversationColumn;
}

async function createNotification({ type, recipientId, senderId, conversationId, messageId, emoji, title, body }) {
  const hasMetadata = await hasNotificationMetadataColumns();
  const insertQuery = hasMetadata
    ? 'INSERT INTO notifications (type, recipient_id, sender_id, conversation_id, message_id, emoji, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())'
    : 'INSERT INTO notifications (type, recipient_id, title, body, created_at) VALUES (?, ?, ?, ?, NOW())';
  const insertParams = hasMetadata
    ? [type, recipientId || null, senderId || null, conversationId || null, messageId || null, emoji || null, title, body]
    : [type, recipientId || null, title, body];
  const [result] = await pool.query(insertQuery, insertParams);
  return result.insertId;
}

function setupSocket(io, optimizationService) {
  optimizationService = optimizationService || {}; // Fallback if not provided

  // JWT authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token provided'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const [rows] = await pool.query(
        'SELECT id, name, avatar, role FROM users WHERE id = ? AND is_active = 1',
        [decoded.id]
      );
      if (!rows.length) return next(new Error('User not found'));
      socket.user = { ...decoded, name: rows[0].name, avatar: rows[0].avatar };
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    
    // Record socket heartbeat for health monitoring
    if (optimizationService.recordSocketHeartbeat) {
      optimizationService.recordSocketHeartbeat(socket.id);
    }

    // Wrap the entire async setup so an unhandled rejection never crashes the process
    (async () => {
      try {
        // Mark online
        await pool.query('UPDATE users SET status = ? WHERE id = ?', ['online', userId]);
        socket.broadcast.emit('user_status_change', { userId: String(userId), status: 'online' });

        // Join personal room for notifications
        socket.join(`user_${userId}`);

        // Auto-join all group rooms this user belongs to
        // Room name = String(group_id) to match activeConversation.id on the frontend
        const [userGroups] = await pool.query(
          'SELECT group_id FROM group_members WHERE user_id = ? AND left_at IS NULL',
            [userId]
        );
          userGroups.forEach((g) => socket.join(String(g.group_id)));
      } catch (err) {
        console.error(`[socket] connection setup error for user ${userId}:`, err.message);
      }
    })();

    // Client requests to join a DM room (called when opening a DM conversation)
    socket.on('join_dm', ({ otherUserId }) => {
      const roomId = getDmConvId(userId, otherUserId);
      socket.join(roomId);
    });

    // Client joins a group room (e.g. after creating a new group)
    socket.on('join_group', async ({ groupId }) => {
      try {
        const [rows] = await pool.query(
          'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL',
          [groupId, userId]
        );
        if (!rows.length) return;
        socket.join(String(groupId));
      } catch (err) {
        console.error('[join_group] membership check failed:', err);
      }
    });

    // Send message
    socket.on('send_message', async ({ conversationId, content, type = 'text', replyTo, files }, callback) => {
      // Rate limiting
      if (!checkSocketEventLimit(userId, 'send_message')) {
        return callback?.({ success: false, error: 'Too many messages. Please slow down.' });
      }

      // Deduplication hash
      const eventHash = hashData({ conversationId, content, replyTo, fileCount: files?.length });
      if (optimizationService.shouldProcessSocketEvent && !optimizationService.shouldProcessSocketEvent(socket.id, 'send_message', eventHash, 2000)) {
        return callback?.({ success: true, message: null }); // Silently ignore duplicate
      }

      if (!content?.trim() && (!files || files.length === 0) && type === 'text') {
        return callback?.({ success: false, error: 'Empty message' });
      }

      if (conversationId.startsWith('dm_')) {
        const parts = conversationId.split('_');
        const otherId = String(parts[1]) === String(userId) ? parts[2] : parts[1];
        const [blockedRows] = await pool.query(
          'SELECT user_id FROM conversation_metadata WHERE conversation_id = ? AND user_id = ? AND is_blocked = 1',
          [conversationId, otherId]
        );
        if (blockedRows.length > 0) {
          return callback?.({ success: false, error: 'This user has blocked you. Your message was not delivered.' });
        }      } else {
        // Ensure sender is an active group member
        const [membershipRows] = await pool.query('SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL', [conversationId, userId]);
        if (!membershipRows.length) {
          return callback?.({ success: false, error: 'You are not a member of this group.' });
        }      }

      try {
        const fileAttachments = Array.isArray(files) ? files.map((file) => ({
          key: typeof file?.key === 'string' ? file.key : null,
          name: file?.name ? String(file.name) : 'attachment',
          size: file?.size ? String(file.size) : '0 B',
          type: file?.type ? String(file.type) : 'other',
          mimeType: file?.mimeType ? String(file.mimeType) : null,
        })).filter((file) => file.key) : [];

        if (Array.isArray(files) && files.length > 0 && fileAttachments.length !== files.length) {
          return callback?.({ success: false, error: 'One or more attached files are missing persistent storage keys.' });
        }

        const filesJson = fileAttachments.length > 0 ? JSON.stringify(fileAttachments) : null;
        const msgType = fileAttachments.length > 0
          ? (fileAttachments[0].type === 'image' ? 'image' : fileAttachments[0].type === 'video' ? 'video' : 'file')
          : type;

        const messageLinks = extractLinks(content);
        const linksJson = messageLinks.length > 0 ? JSON.stringify(messageLinks) : null;

        const [result] = await pool.query(
          'INSERT INTO messages (conversation_id, sender_id, content, type, reply_to, files, links) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [conversationId, userId, content || '', msgType, replyTo ? Number(replyTo) : null, filesJson, linksJson]
        );

        const message = {
          id: String(result.insertId),
          senderId: String(userId),
          content: content || '',
          timestamp: new Date().toISOString(),
          type: msgType,
          reactions: [],
          replyTo: replyTo ? String(replyTo) : undefined,
          files: fileAttachments,
          links: messageLinks,
          status: 'sent',
        };

        if (fileAttachments.length > 0) {
          try {
            await Promise.all(fileAttachments.map((file) => {
              const fileSize = Number(file.size) || 0;
              return createFileMetadata(file.key, conversationId, userId, file.name, file.type, file.mimeType, fileSize, result.insertId);
            }));
          } catch (metaErr) {
            console.error('[send_message] file metadata save failed:', metaErr);
          }
        }

        // Broadcast to everyone in the room EXCEPT the sender
        socket.to(conversationId).emit('new_message', { conversationId, message });

        // Persist a message notification for recipients so it survives refresh/relogin.
        try {
          const [senderRows] = await pool.query('SELECT name FROM users WHERE id = ?', [userId]);
          const senderName = senderRows[0]?.name || 'Someone';
          const preview = (message.content || '').replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1').slice(0, 80) || '📎 Attachment';
          let notificationTitle = senderName;

          if (!conversationId.startsWith('dm_')) {
            const [[groupRow]] = await pool.query('SELECT name FROM `groups` WHERE id = ?', [conversationId]);
            notificationTitle = `${senderName} in ${groupRow?.name || 'Group'}`;
          }

          const notifyRecipients = [];
          if (conversationId.startsWith('dm_')) {
            const parts = conversationId.split('_');
            const otherId = String(parts[1]) === String(userId) ? parts[2] : parts[1];
            if (String(otherId) !== String(userId)) {
              notifyRecipients.push(String(otherId));
            }
          } else {
            const [groupMembers] = await pool.query(
              'SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ? AND left_at IS NULL',
              [conversationId, userId]
            );
            const [blockedRows] = await pool.query(
              'SELECT user_id FROM conversation_metadata WHERE conversation_id = ? AND is_blocked = 1',
              [conversationId]
            );
            const blockedSet = new Set(blockedRows.map((row) => String(row.user_id)));
            groupMembers.forEach((member) => {
              const recipientId = String(member.user_id);
              if (!blockedSet.has(recipientId)) {
                notifyRecipients.push(recipientId);
              }
            });
          }

          for (const recipientId of notifyRecipients) {
            const notificationId = await createNotification({
              type: conversationId.startsWith('dm_') ? 'dm_message' : 'group_message',
              recipientId,
              senderId: userId,
              conversationId,
              messageId: message.id,
              emoji: null,
              title: notificationTitle,
              body: preview,
            });
            socket.to(`user_${recipientId}`).emit('new_notification', {
              id: String(notificationId),
              type: conversationId.startsWith('dm_') ? 'dm_message' : 'group_message',
              recipientId,
              senderId: String(userId),
              conversationId,
              messageId: String(message.id),
              title: notificationTitle,
              body: preview,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (noteErr) {
          console.error('[send_message] notification error:', noteErr);
        }

        // For DMs, also notify the other user via their personal room in case they haven't opened the chat yet.
        if (conversationId.startsWith('dm_')) {
          const parts = conversationId.split('_');
          const otherId = String(parts[1]) === String(userId) ? parts[2] : parts[1];
          if (String(otherId) !== String(userId)) {
            socket.to(`user_${otherId}`).emit('new_message', { conversationId, message });
          }
        }

        // Send the saved message back to the sender via the ack so they can add it locally
        callback?.({ success: true, message });
      } catch (err) {
        console.error('send_message error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Typing indicator
socket.on('typing', async ({ conversationId }) => {
        if (conversationId?.startsWith('dm_')) {
          const parts = conversationId.split('_');
          const otherId = String(parts[1]) === String(userId) ? parts[2] : parts[1];
          try {
            const [blockedRows] = await pool.query(
              'SELECT user_id FROM conversation_metadata WHERE conversation_id = ? AND user_id = ? AND is_blocked = 1',
              [conversationId, otherId]
            );
            if (blockedRows.length > 0) return;
            socket.to(conversationId).emit('user_typing', {
              conversationId,
              userId: String(userId),
              userName: socket.user.name,
            });
          } catch (err) {
            console.error('[typing] block check failed:', err);
          }
          return;
        }

        try {
          const [membershipRows] = await pool.query(
            'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL',
            [conversationId, userId]
          );
          if (!membershipRows.length) return;
          socket.to(conversationId).emit('user_typing', {
            conversationId,
            userId: String(userId),
            userName: socket.user.name,
          });
        } catch (err) {
          console.error('[typing] membership check failed:', err);
        }
      });

      socket.on('stop_typing', async ({ conversationId }) => {
        if (conversationId?.startsWith('dm_')) {
          const parts = conversationId.split('_');
          const otherId = String(parts[1]) === String(userId) ? parts[2] : parts[1];
          try {
            const [blockedRows] = await pool.query(
              'SELECT user_id FROM conversation_metadata WHERE conversation_id = ? AND user_id = ? AND is_blocked = 1',
              [conversationId, otherId]
            );
            if (blockedRows.length > 0) return;
            socket.to(conversationId).emit('user_stop_typing', {
              conversationId,
              userId: String(userId),
            });
          } catch (err) {
            console.error('[stop_typing] block check failed:', err);
          }
          return;
        }

        try {
          const [membershipRows] = await pool.query(
            'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL',
            [conversationId, userId]
          );
          if (!membershipRows.length) return;
          socket.to(conversationId).emit('user_stop_typing', {
            conversationId,
            userId: String(userId),
          });
        } catch (err) {
          console.error('[stop_typing] membership check failed:', err);
        }
    });

    // Update user presence status (online, away, dnd, offline)
    socket.on('update_presence', async ({ status }, callback) => {
      if (!['online', 'away', 'dnd'].includes(status)) {
        return callback?.({ success: false, error: 'Invalid status' });
      }

      try {
        await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
        socket.broadcast.emit('user_status_change', { userId: String(userId), status });
        callback?.({ success: true });
      } catch (err) {
        console.error('[update_presence] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Get current online users (for presence awareness)
    socket.on('get_online_users', async (callback) => {
      try {
        const [onlineUsers] = await pool.query(
          `SELECT id, name, avatar, status FROM users WHERE status IN ('online', 'away', 'dnd') AND is_active = 1`
        );

        callback?.({
          success: true,
          users: onlineUsers.map((u) => ({
            id: String(u.id),
            name: u.name,
            avatar: u.avatar,
            status: u.status,
          })),
        });
      } catch (err) {
        console.error('[get_online_users] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Track user activity and auto-away after inactivity
    socket.on('user_activity', async (callback) => {
      try {
        // If user was in 'away' or 'dnd' status, reset to online
        const [[{ currentStatus }]] = await pool.query(
          'SELECT status as currentStatus FROM users WHERE id = ?',
          [userId]
        );

        if (currentStatus === 'away' || currentStatus === 'dnd') {
          await pool.query('UPDATE users SET status = ? WHERE id = ?', ['online', userId]);
          socket.broadcast.emit('user_status_change', { userId: String(userId), status: 'online' });
        }

        callback?.({ success: true });
      } catch (err) {
        console.error('[user_activity] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Edit message
    socket.on('edit_message', async ({ messageId, conversationId, content }, callback) => {
      if (!content?.trim()) return callback?.({ success: false, error: 'Empty content' });
      try {
        if (!conversationId?.startsWith('dm_')) {
          const [membershipRows] = await pool.query(
            'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL',
            [conversationId, userId]
          );
          if (!membershipRows.length) {
            return callback?.({ success: false, error: 'You are not a member of this group.' });
          }
        }

        const [result] = await pool.query(
          'UPDATE messages SET content = ?, edited_at = NOW() WHERE id = ? AND sender_id = ? AND is_deleted = 0',
          [content, messageId, userId]
        );
        if (result.affectedRows === 0) {
          return callback?.({ success: false, error: 'Not found or unauthorized' });
        }
        const editedAt = new Date().toISOString();
        io.to(conversationId).emit('message_edited', {
          messageId: String(messageId),
          conversationId,
          content,
          editedAt,
        });
        callback?.({ success: true });
      } catch (err) {
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Delete message
    socket.on('delete_message', async ({ messageId, conversationId }, callback) => {
      try {
        console.log(`[delete_message] user=${userId} msgId=${messageId} conv=${conversationId}`);

        if (!conversationId?.startsWith('dm_')) {
          const [membershipRows] = await pool.query(
            'SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL',
            [conversationId, userId]
          );
          if (!membershipRows.length) {
            return callback?.({ success: false, error: 'You are not a member of this group.' });
          }
        }

        const [rows] = await pool.query('SELECT sender_id FROM messages WHERE id = ?', [messageId]);
        if (!rows.length) {
          console.warn(`[delete_message] NOT FOUND msgId=${messageId}`);
          return callback?.({ success: false, error: 'Not found' });
        }

        const isOwner = String(rows[0].sender_id) === String(userId);
        const isAdmin = socket.user.role === 'admin';
        if (!isOwner && !isAdmin) {
          console.warn(`[delete_message] UNAUTHORIZED user=${userId} sender=${rows[0].sender_id}`);
          return callback?.({ success: false, error: 'Unauthorized' });
        }

        await pool.query(
          'UPDATE messages SET is_deleted = 1, deleted_by = ?, deleted_at = NOW() WHERE id = ?',
          [userId, messageId]
        );
        const deletedAt = new Date().toISOString();

        const payload = { messageId: String(messageId), conversationId, deletedBy: String(userId), deletedAt };

        // Broadcast to everyone in the conversation room (DM or group)
        io.to(conversationId).emit('message_deleted', payload);
        console.log(`[delete_message] broadcasted to room=${conversationId}`);

        // For DMs: also push via each participant's personal room as a fallback
        // (covers the case where a user hasn't joined the DM room yet)
        if (conversationId.startsWith('dm_')) {
          const parts = conversationId.split('_');
          // Push to both users' personal rooms — deduplication is handled on the frontend
          const uid1 = parts[1];
          const uid2 = parts[2];
          io.to(`user_${uid1}`).emit('message_deleted', payload);
          io.to(`user_${uid2}`).emit('message_deleted', payload);
          console.log(`[delete_message] personal room fallback → user_${uid1}, user_${uid2}`);
        } else {
          // For groups: push to each member's personal room so members outside the active room catch it
          try {
            const [members] = await pool.query('SELECT user_id FROM group_members WHERE group_id = ? AND left_at IS NULL', [conversationId]);
            members.forEach(m => io.to(`user_${m.user_id}`).emit('message_deleted', payload));
          } catch { /* best-effort */ }
        }

        callback?.({ success: true });
      } catch (err) {
        console.error('[delete_message] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Toggle reaction — one emoji per user per message (clicking different emoji replaces, same emoji removes)
    socket.on('react_message', async ({ messageId, conversationId, emoji }, callback) => {
      // Rate limiting
      if (!checkSocketEventLimit(userId, 'react_message')) {
        return callback?.({ success: false, error: 'Too many reactions. Please slow down.' });
      }

      // Deduplication
      const eventHash = hashData({ messageId, emoji });
      if (optimizationService.shouldProcessSocketEvent && !optimizationService.shouldProcessSocketEvent(socket.id, 'react_message', eventHash, 2000)) {
        return callback?.({ success: true }); // Silently ignore duplicate
      }

      try {
        if (conversationId?.startsWith('dm_')) {
          const parts = conversationId.split('_');
          const otherId = String(parts[1]) === String(userId) ? parts[2] : parts[1];
          const [blockedRows] = await pool.query(
            'SELECT user_id FROM conversation_metadata WHERE conversation_id = ? AND user_id = ? AND is_blocked = 1',
            [conversationId, otherId]
          );
          if (blockedRows.length > 0) {
            return callback?.({ success: false, error: 'This user has blocked you. Reaction was not delivered.' });
          }
        } else {
          // Ensure reactor is an active group member
          const [membershipRows] = await pool.query('SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL', [conversationId, userId]);
          if (!membershipRows.length) {
            return callback?.({ success: false, error: 'You are not a member of this group.' });
          }
        }

        const [existing] = await pool.query(
          'SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?',
          [messageId, userId]
        );

        const alreadyHasThisEmoji = existing.some(r => r.emoji === emoji);

        // Remove ALL existing reactions from this user on this message
        await pool.query(
          'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?',
          [messageId, userId]
        );

        // Only re-add if they didn't already have this exact emoji (toggle off if same)
        if (!alreadyHasThisEmoji) {
          await pool.query(
            'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
            [messageId, userId, emoji]
          );
        }

        const [all] = await pool.query(
          'SELECT emoji, user_id FROM message_reactions WHERE message_id = ?',
          [messageId]
        );

        const map = {};
        all.forEach((r) => {
          if (!map[r.emoji]) map[r.emoji] = [];
          map[r.emoji].push(String(r.user_id));
        });
        const reactions = Object.entries(map).map(([e, users]) => ({ emoji: e, users }));

        io.to(conversationId).emit('reaction_updated', {
          messageId: String(messageId),
          conversationId,
          reactions,
        });

        // Notify the message author when someone reacts (skip if reacting to own message)
        try {
          const [[msgRow]] = await pool.query('SELECT sender_id, content FROM messages WHERE id = ?', [messageId]);
          if (msgRow && String(msgRow.sender_id) !== String(userId)) {
            // Check if notification already exists (deduplication)
            if (optimizationService.shouldCreateNotification) {
              const shouldCreate = await optimizationService.shouldCreateNotification('reaction', msgRow.sender_id, userId, messageId, emoji, 30000);
              if (!shouldCreate) {
                callback?.({ success: true });
                return;
              }
            }

            const [[reactorRow]] = await pool.query('SELECT name FROM users WHERE id = ?', [userId]);
            const reactorName = reactorRow?.name || 'Someone';
            const preview = (msgRow.content || '').replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1').slice(0, 40);
            const title = `${reactorName} reacted ${emoji}`;
            const body = preview ? `"${preview}"` : 'Your message';

            const hasMetadata = await hasNotificationMetadataColumns();
            let hasExistingNotification = false;

            if (hasMetadata) {
              const [existing] = await pool.query(
                `SELECT n.id FROM notifications n
                 LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
                 WHERE n.type = 'reaction'
                   AND n.recipient_id = ?
                   AND n.sender_id = ?
                   AND n.conversation_id = ?
                   AND n.message_id = ?
                   AND n.emoji = ?
                   AND nr.user_id IS NULL
                 LIMIT 1`,
                [msgRow.sender_id, msgRow.sender_id, userId, conversationId, messageId, emoji]
              );
              hasExistingNotification = existing.length > 0;
            }

            if (!hasExistingNotification) {
              const insertQuery = hasMetadata
                ? 'INSERT INTO notifications (type, recipient_id, sender_id, conversation_id, message_id, emoji, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())'
                : 'INSERT INTO notifications (type, recipient_id, title, body, created_at) VALUES (?, ?, ?, ?, NOW())';
              const insertParams = hasMetadata
                ? ['reaction', msgRow.sender_id, userId, conversationId, messageId, emoji, title, body]
                : ['reaction', msgRow.sender_id, title, body];

              const [insertResult] = await pool.query(insertQuery, insertParams);
              const notificationId = insertResult.insertId;

              io.to(`user_${msgRow.sender_id}`).emit('new_notification', {
                id: String(notificationId),
                type: 'reaction',
                recipientId: String(msgRow.sender_id),
                senderId: String(userId),
                conversationId,
                messageId: String(messageId),
                emoji,
                title,
                body,
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (error) {
          console.error('[react_message] notification error:', error);
        }

        callback?.({ success: true });
      } catch (err) {
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Undo delete (restore message)
    socket.on('undelete_message', async ({ messageId, conversationId }, callback) => {
      try {
        const [rows] = await pool.query('SELECT sender_id FROM messages WHERE id = ?', [messageId]);
        if (!rows.length) return callback?.({ success: false, error: 'Not found' });
        if (String(rows[0].sender_id) !== String(userId)) return callback?.({ success: false, error: 'Unauthorized' });

        await pool.query(
          'UPDATE messages SET is_deleted = 0, deleted_by = NULL, deleted_at = NULL WHERE id = ?',
          [messageId]
        );

        const payload = { messageId: String(messageId), conversationId };
        io.to(conversationId).emit('message_undeleted', payload);

        if (conversationId.startsWith('dm_')) {
          const parts = conversationId.split('_');
          io.to(`user_${parts[1]}`).emit('message_undeleted', payload);
          io.to(`user_${parts[2]}`).emit('message_undeleted', payload);
        } else {
          try {
            const [members] = await pool.query('SELECT user_id FROM group_members WHERE group_id = ? AND left_at IS NULL', [conversationId]);
            members.forEach(m => io.to(`user_${m.user_id}`).emit('message_undeleted', payload));
          } catch { /* best-effort */ }
        }

        callback?.({ success: true });
      } catch (err) {
        console.error('undelete_message error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Pin a message (one pin per conversation)
    socket.on('pin_message', async ({ messageId, conversationId }, callback) => {
      try {
        await pool.query('UPDATE messages SET is_pinned = 0 WHERE conversation_id = ?', [conversationId]);
        await pool.query('UPDATE messages SET is_pinned = 1 WHERE id = ?', [messageId]);
        const [rows] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
        if (!rows.length) return callback?.({ success: false, error: 'Not found' });
        const msg = formatMessage(rows[0]);
        msg.isPinned = true;
        io.to(conversationId).emit('message_pinned', { conversationId, message: msg });
        callback?.({ success: true });
      } catch (err) {
        console.error('pin_message error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Unpin all messages in a conversation
    socket.on('unpin_message', async ({ conversationId }, callback) => {
      try {
        await pool.query('UPDATE messages SET is_pinned = 0 WHERE conversation_id = ?', [conversationId]);
        io.to(conversationId).emit('message_unpinned', { conversationId });
        callback?.({ success: true });
      } catch (err) {
        console.error('unpin_message error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Mark notification as read
    socket.on('mark_notification_read', async ({ notificationId }, callback) => {
      try {
        await pool.query(
          'INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)',
          [notificationId, userId]
        );

        io.to(`user_${userId}`).emit('notification_read', { notificationId });
        callback?.({ success: true });
      } catch (err) {
        console.error('[mark_notification_read] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Mark all notifications as read
    socket.on('mark_all_notifications_read', async (callback) => {
      try {
        const [unread] = await pool.query(
          `SELECT n.id FROM notifications n
           LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
           WHERE (n.recipient_id IS NULL OR n.recipient_id = ?) AND nr.user_id IS NULL`,
          [userId, userId]
        );

        if (unread.length > 0) {
          const values = unread.map((n) => [n.id, userId]);
          await pool.query(
            'INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES ?',
            [values]
          );
        }

        io.to(`user_${userId}`).emit('all_notifications_read');
        callback?.({ success: true });
      } catch (err) {
        console.error('[mark_all_notifications_read] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Mark message as read
    socket.on('mark_message_read', async ({ messageId, conversationId }, callback) => {
      try {
        // Insert read receipt
        await pool.query(
          'INSERT IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)',
          [messageId, userId]
        );

        // Broadcast read status to all users in the conversation
        io.to(conversationId).emit('message_read', {
          conversationId,
          messageId: String(messageId),
          userId: String(userId),
          readAt: new Date().toISOString(),
        });

        callback?.({ success: true });
      } catch (err) {
        console.error('[mark_message_read] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Get read status for a message
    socket.on('get_message_reads', async ({ messageId }, callback) => {
      try {
        const [reads] = await pool.query(
          'SELECT user_id, read_at FROM message_reads WHERE message_id = ?',
          [messageId]
        );

        callback?.({
          success: true,
          reads: reads.map((r) => ({
            userId: String(r.user_id),
            readAt: r.read_at instanceof Date ? r.read_at.toISOString() : String(r.read_at),
          })),
        });
      } catch (err) {
        console.error('[get_message_reads] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Notify sender when a recipient has received the message from the server
    socket.on('message_received', async ({ messageId, conversationId }, callback) => {
      try {
        const [rows] = await pool.query(
          'SELECT sender_id FROM messages WHERE id = ?',
          [messageId]
        );

        if (rows.length === 0) {
          return callback?.({ success: false, error: 'Message not found' });
        }

        const senderId = String(rows[0].sender_id);
        if (senderId === String(userId)) {
          return callback?.({ success: true });
        }

        await pool.query(
          'INSERT IGNORE INTO message_deliveries (message_id, user_id) VALUES (?, ?)',
          [messageId, userId]
        );

        io.to(`user_${senderId}`).emit('message_delivered', {
          messageId: String(messageId),
          conversationId,
          deliveredAt: new Date().toISOString(),
        });

        callback?.({ success: true });
      } catch (err) {
        console.error('[message_received] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Mark conversation as read (all messages up to a certain point)
    socket.on('mark_conversation_read', async ({ conversationId, lastMessageId }, callback) => {
      try {
        // Get all unread messages in conversation up to the specified message
        const [unreadMessages] = await pool.query(
          `SELECT m.id FROM messages m
           LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = ?
           WHERE m.conversation_id = ? 
             AND mr.user_id IS NULL
             AND m.created_at <= (SELECT created_at FROM messages WHERE id = ?)
           ORDER BY m.created_at ASC`,
          [userId, conversationId, lastMessageId]
        );

        if (unreadMessages.length > 0) {
          const values = unreadMessages.map((m) => [m.id, userId]);
          await pool.query(
            'INSERT IGNORE INTO message_reads (message_id, user_id) VALUES ?',
            [values]
          );

          // Broadcast to conversation room
          io.to(conversationId).emit('conversation_read', {
            conversationId,
            userId: String(userId),
            readUntilMessageId: String(lastMessageId),
            readAt: new Date().toISOString(),
          });
        }

        callback?.({ success: true, readCount: unreadMessages.length });
      } catch (err) {
        console.error('[mark_conversation_read] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    socket.on('mark_conversation_notifications_read', async ({ conversationId }, callback) => {
      if (!conversationId) {
        return callback?.({ success: false, error: 'conversationId is required' });
      }

      try {
        const hasConversationColumn = await hasNotificationConversationColumn();
        const query = hasConversationColumn
          ? `SELECT n.id FROM notifications n
               LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
               WHERE n.conversation_id = ?
                 AND (n.recipient_id IS NULL OR n.recipient_id = ?)
                 AND nr.user_id IS NULL`
          : `SELECT n.id FROM notifications n
               LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
               WHERE (n.recipient_id IS NULL OR n.recipient_id = ?)
                 AND nr.user_id IS NULL`;
        const params = hasConversationColumn ? [userId, conversationId, userId] : [userId, userId];
        const [unreadNotifications] = await pool.query(query, params);

        if (unreadNotifications.length > 0) {
          const values = unreadNotifications.map((n) => [n.id, userId]);
          await pool.query(
            'INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES ?',
            [values]
          );

          const ids = unreadNotifications.map((n) => String(n.id));
          io.to(`user_${userId}`).emit('conversation_notifications_read', { notificationIds: ids });
        }

        callback?.({ success: true, readCount: unreadNotifications.length });
      } catch (err) {
        console.error('[mark_conversation_notifications_read] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Update last_seen time for a conversation (called when user opens/views a conversation)
    socket.on('update_last_seen', async ({ conversationId, lastMessageId }, callback) => {
      try {
        // Upsert last_seen record
        await pool.query(
          `INSERT INTO conversation_last_seen (user_id, conversation_id, last_seen_at, last_message_id)
           VALUES (?, ?, NOW(), ?)
           ON DUPLICATE KEY UPDATE last_seen_at = NOW(), last_message_id = ?`,
          [userId, conversationId, lastMessageId, lastMessageId]
        );

        callback?.({ success: true });
      } catch (err) {
        console.error('[update_last_seen] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Periodically check socket health
    let healthCheckInterval = null;
    healthCheckInterval = setInterval(() => {
      if (socket.connected && optimizationService.recordSocketHeartbeat) {
        optimizationService.recordSocketHeartbeat(socket.id);
      } else if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
      }
    }, 30000); // Every 30 seconds

    socket.on('disconnect', () => {
      pool.query('UPDATE users SET status = ? WHERE id = ?', ['offline', userId])
        .then(() => socket.broadcast.emit('user_status_change', { userId: String(userId), status: 'offline' }))
        .catch((err) => console.error(`[socket] disconnect error for user ${userId}:`, err.message));
      
      // Clean up resources
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
      }
      if (optimizationService.socketHeartbeats) {
        optimizationService.socketHeartbeats.delete(socket.id);
      }
    });

    // Socket health check / heartbeat
    socket.on('ping', (callback) => {
      if (optimizationService.recordSocketHeartbeat) {
        optimizationService.recordSocketHeartbeat(socket.id);
      }
      callback?.({ pong: true, timestamp: Date.now() });
    });

    // Settings sync — notify other connected devices when settings change
    socket.on('settings_changed', async ({ setting, value }, callback) => {
      try {
        // Broadcast to all other devices of this user so they sync
        socket.broadcast.to(`user_${userId}`).emit('settings_updated', {
          userId: String(userId),
          setting,
          value,
          timestamp: new Date().toISOString(),
        });

        callback?.({ success: true });
      } catch (err) {
        console.error('[settings_changed] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Session invalidated notification — sent by server when user logs out from another device
    socket.on('check_session_status', async (callback) => {
      try {
        // Check if this user's session is still valid
        const [activeSessions] = await pool.query(
          'SELECT COUNT(*) as count FROM user_sessions WHERE user_id = ? AND is_active = 1 AND expires_at > NOW()',
          [userId]
        );

        callback?.({
          success: true,
          sessionActive: activeSessions[0].count > 0,
        });
      } catch (err) {
        console.error('[check_session_status] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });

    // Conversation metadata changes (mute, pin, block)
    socket.on('conversation_metadata_changed', async ({ conversationId, action, value }, callback) => {
      try {
        // Broadcast metadata change to all connected users in the conversation
        io.to(conversationId).emit('conversation_metadata_updated', {
          conversationId,
          userId: String(userId),
          action,
          value,
          timestamp: new Date().toISOString(),
        });

        // Also notify other devices for the same user so block/mute/pin state stays in sync across sessions
        socket.broadcast.to(`user_${userId}`).emit('conversation_metadata_updated', {
          conversationId,
          userId: String(userId),
          action,
          value,
          timestamp: new Date().toISOString(),
        });

        callback?.({ success: true });
      } catch (err) {
        console.error('[conversation_metadata_changed] error:', err);
        callback?.({ success: false, error: 'Server error' });
      }
    });
  });
}

module.exports = { setupSocket, getDmConvId };
