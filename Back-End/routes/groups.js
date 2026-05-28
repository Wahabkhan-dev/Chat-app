const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const pool = require('../config/database');
const { r2 } = require('../config/r2');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function formatGroup(g, members) {
  const ts = g.created_at;
  // Only include members who haven't voluntarily left
  const activeMembers = members.filter((m) => m.group_id === g.id && !m.left_at);
  const memberIds = activeMembers.map((m) => String(m.user_id));
  const adminIds = activeMembers
    .filter((m) => m.role === 'admin' || m.role === 'owner')
    .map((m) => String(m.user_id));
  return {
    id: String(g.id),
    name: g.name,
    description: g.description || '',
    avatar: g.avatar || null,
    createdBy: String(g.created_by),
    ownerId: String(g.owner_id),
    members: memberIds,
    admins: adminIds,
    createdAt: ts instanceof Date ? ts.toISOString() : String(ts),
    settings: {
      messagePermission: g.message_permission || 'all',
      addMemberPermission: g.add_member_permission || 'everyone',
      allowMemberLeave: g.allow_member_leave === 1,
      slowMode: g.slow_mode === 1,
      slowModeSeconds: g.slow_mode_seconds || 10,
    },
  };
}

const notificationMetadataCache = { checked: false, hasMetadata: false };
async function hasNotificationMetadataColumns() {
  if (notificationMetadataCache.checked) return notificationMetadataCache.hasMetadata;
  try {
    const [rows] = await pool.query("SHOW COLUMNS FROM notifications LIKE 'sender_id'");
    notificationMetadataCache.hasMetadata = rows.length > 0;
  } catch (err) {
    console.error('[groups] notification schema check failed:', err);
    notificationMetadataCache.hasMetadata = false;
  }
  notificationMetadataCache.checked = true;
  return notificationMetadataCache.hasMetadata;
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

async function getActiveMembershipRole(groupId, userId) {
  const [rows] = await pool.query(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ? AND left_at IS NULL',
    [groupId, userId]
  );
  return rows.length ? rows[0].role : null;
}

async function removeUserFromGroupSocketRoom(io, groupId, userId) {
  if (!io || !userId) return;
  try {
    const socketIds = await io.in(`user_${userId}`).allSockets();
    for (const socketId of socketIds) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) socket.leave(String(groupId));
    }
  } catch (err) {
    console.error(`[groups] Failed to remove user ${userId} from group room ${groupId}:`, err);
  }
}

// GET /api/groups — groups the current user belongs to or has left (admins get ALL groups)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const isSiteAdmin = req.user.role === 'admin';
    const userId = req.user.id;
    let groups;
    if (isSiteAdmin) {
      const [allGroups] = await pool.query('SELECT g.* FROM `groups` g ORDER BY g.created_at ASC');
      groups = allGroups;
    } else {
      // Include groups the user has left (left_at IS NOT NULL) so they persist after refresh
      const [memberGroups] = await pool.query(
        'SELECT g.* FROM `groups` g JOIN group_members gm ON g.id = gm.group_id WHERE gm.user_id = ? ORDER BY g.created_at ASC',
        [userId]
      );
      groups = memberGroups;
    }

    if (groups.length === 0) return res.json({ groups: [] });

    const groupIds = groups.map((g) => g.id);
    const [members] = await pool.query(
      'SELECT group_id, user_id, role, left_at FROM group_members WHERE group_id IN (?)',
      [groupIds]
    );

    // Build a per-group leftAt map for the requesting user
    const userLeftAt = {};
    members
      .filter((m) => String(m.user_id) === String(userId) && m.left_at)
      .forEach((m) => {
        userLeftAt[String(m.group_id)] = m.left_at instanceof Date ? m.left_at.toISOString() : String(m.left_at);
      });

    const formatted = groups.map((g) => {
      const group = formatGroup(g, members);
      if (userLeftAt[String(g.id)]) group.leftAt = userLeftAt[String(g.id)];
      return group;
    });

    res.json({ groups: formatted });
  } catch (err) {
    console.error('groups GET error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/groups — create a group
router.post('/', authenticateToken, async (req, res) => {
  const { name, description, memberIds = [], avatar } = req.body;
  const userId = req.user.id;
  if (!name?.trim()) return res.status(400).json({ message: 'Group name is required.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO `groups` (name, description, avatar, created_by, owner_id) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), description || '', avatar || null, userId, userId]
    );
    const groupId = result.insertId;

    // Creator as owner
    await conn.query(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
      [groupId, userId, 'owner']
    );

    // Other members
    const others = memberIds.filter((id) => String(id) !== String(userId));
    for (const memberId of others) {
      await conn.query(
        'INSERT IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
        [groupId, memberId, 'member']
      );
    }

    await conn.commit();

    const allMemberIds = [String(userId), ...others.map(String)];
    const group = {
      id: String(groupId),
      name: name.trim(),
      description: description || '',
      avatar: avatar || null,
      createdBy: String(userId),
      ownerId: String(userId),
      members: allMemberIds,
      admins: [String(userId)],
      createdAt: new Date().toISOString(),
      settings: {
        messagePermission: 'all',
        addMemberPermission: 'everyone',
        allowMemberLeave: true,
        slowMode: false,
        slowModeSeconds: 10,
      },
    };

    // Notify all members in real-time via their personal rooms
    const io = req.app.get('io');
    if (io) {
      for (const memberId of allMemberIds) {
        io.to(`user_${memberId}`).emit('new_group', { group });
      }

      const [[creatorRow]] = await pool.query('SELECT name FROM users WHERE id = ?', [userId]);
      const actorName = creatorRow?.name || 'Someone';
      for (const memberId of others.map(String)) {
        const title = `Added to "${group.name}"`;
        const body = `${actorName} added you to "${group.name}"`;
        const notificationId = await createNotification({
          type: 'group_added',
          recipientId: memberId,
          senderId: userId,
          conversationId: String(groupId),
          title,
          body,
        });
        io.to(`user_${memberId}`).emit('new_notification', {
          id: String(notificationId),
          type: 'group_added',
          recipientId: String(memberId),
          senderId: String(userId),
          conversationId: String(groupId),
          title,
          body,
          timestamp: new Date().toISOString(),
          read: false,
        });
      }
    }

    res.status(201).json({ message: 'Group created.', group });
  } catch (err) {
    await conn.rollback();
    console.error('groups POST error:', err);
    res.status(500).json({ message: 'Server error.' });
  } finally {
    conn.release();
  }
});

// PUT /api/groups/:id — update group info / settings
router.put('/:id', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  const userId = req.user.id;
  const { name, description, avatar, settings } = req.body;

  try {
    const membershipRole = await getActiveMembershipRole(groupId, userId);
    const isGroupAdmin = membershipRole && ['admin', 'owner'].includes(membershipRole);
    const isSiteAdmin = req.user.role === 'admin';
    if (!isGroupAdmin && !isSiteAdmin) {
      return res.status(403).json({ message: 'Only group admins can update settings.' });
    }

    const sets = [];
    const vals = [];
    if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
    if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
    if (avatar !== undefined) { sets.push('avatar = ?'); vals.push(avatar); }
    if (settings?.messagePermission !== undefined) { sets.push('message_permission = ?'); vals.push(settings.messagePermission); }
    if (settings?.addMemberPermission !== undefined) { sets.push('add_member_permission = ?'); vals.push(settings.addMemberPermission); }
    if (settings?.allowMemberLeave !== undefined) { sets.push('allow_member_leave = ?'); vals.push(settings.allowMemberLeave ? 1 : 0); }
    if (settings?.slowMode !== undefined) { sets.push('slow_mode = ?'); vals.push(settings.slowMode ? 1 : 0); }
    if (settings?.slowModeSeconds !== undefined) { sets.push('slow_mode_seconds = ?'); vals.push(settings.slowModeSeconds); }

    if (sets.length > 0) {
      vals.push(groupId);
      await pool.query(`UPDATE \`groups\` SET ${sets.join(', ')} WHERE id = ?`, vals);
    }

    // Emit group_updated so all members see the change in real-time
    const io = req.app.get('io');
    if (io && sets.length > 0) {
      const [[updatedGroup]] = await pool.query('SELECT * FROM `groups` WHERE id = ?', [groupId]);
      const [allMembers] = await pool.query('SELECT user_id, role FROM group_members WHERE group_id = ? AND left_at IS NULL', [groupId]);
      const ts = updatedGroup.created_at;
      const groupPayload = {
        id: String(updatedGroup.id),
        name: updatedGroup.name,
        description: updatedGroup.description || '',
        avatar: updatedGroup.avatar || null,
        createdBy: String(updatedGroup.created_by),
        ownerId: String(updatedGroup.owner_id),
        members: allMembers.map(m => String(m.user_id)),
        admins: allMembers.filter(m => ['admin','owner'].includes(m.role)).map(m => String(m.user_id)),
        createdAt: ts instanceof Date ? ts.toISOString() : String(ts),
        settings: {
          messagePermission: updatedGroup.message_permission || 'all',
          addMemberPermission: updatedGroup.add_member_permission || 'everyone',
          allowMemberLeave: updatedGroup.allow_member_leave === 1,
          slowMode: updatedGroup.slow_mode === 1,
          slowModeSeconds: updatedGroup.slow_mode_seconds || 10,
        },
      };

      io.to(String(groupId)).emit('group_updated', { group: groupPayload });

      const [[updaterRow]] = await pool.query('SELECT name FROM users WHERE id = ?', [userId]);
      const actorName = updaterRow?.name || 'Someone';
      const title = `Group updated: "${groupPayload.name}"`;
      const body = `${actorName} updated settings for "${groupPayload.name}"`;

      for (const memberId of groupPayload.members.filter((uid) => uid !== String(userId))) {
        const notificationId = await createNotification({
          type: 'group_updated',
          recipientId: memberId,
          senderId: userId,
          conversationId: String(groupId),
          title,
          body,
        });
        io.to(`user_${memberId}`).emit('new_notification', {
          id: String(notificationId),
          type: 'group_updated',
          recipientId: memberId,
          senderId: String(userId),
          conversationId: String(groupId),
          title,
          body,
          timestamp: new Date().toISOString(),
          read: false,
        });
      }
    }

    res.json({ message: 'Group updated.' });
  } catch (err) {
    console.error('groups PUT error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PATCH /api/groups/:id/info — update name / description / avatar (multipart, avatar uploaded to R2)
router.patch('/:id/info', authenticateToken, avatarUpload.single('avatar'), async (req, res) => {
  const groupId = req.params.id;
  const userId = req.user.id;

  console.log(`[groups.PATCH /info] groupId=${groupId}, userId=${userId}, hasFile=${!!req.file}`);

  try {
    const membershipRole = await getActiveMembershipRole(groupId, userId);
    const isGroupAdmin = membershipRole && ['admin', 'owner'].includes(membershipRole);
    const isSiteAdmin = req.user.role === 'admin';
    
    console.log(`[groups.PATCH /info] membershipRole=${membershipRole}, isGroupAdmin=${isGroupAdmin}, isSiteAdmin=${isSiteAdmin}`);
    
    if (!isGroupAdmin && !isSiteAdmin) {
      console.log(`[groups.PATCH /info] Access denied - not admin`);
      return res.status(403).json({ message: 'Only group admins can update group info.' });
    }

    const { name, description } = req.body;
    console.log(`[groups.PATCH /info] name="${name}", description="${description}"`);
    
    const sets = [];
    const vals = [];

    if (name?.trim()) { sets.push('name = ?'); vals.push(name.trim()); }
    if (description !== undefined) { sets.push('description = ?'); vals.push(description); }

    let avatarKey = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
      avatarKey = `group-avatars/${groupId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      await r2.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: avatarKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));
      sets.push('avatar = ?');
      vals.push(avatarKey);
    }

    if (sets.length > 0) {
      vals.push(groupId);
      console.log(`[groups.PATCH /info] Updating group with ${sets.length} fields`);
      await pool.query(`UPDATE \`groups\` SET ${sets.join(', ')} WHERE id = ?`, vals);
    } else {
      console.log(`[groups.PATCH /info] No fields to update - skipping DB update`);
    }

    const [[updatedGroup]] = await pool.query('SELECT * FROM `groups` WHERE id = ?', [groupId]);
    const [allMembers] = await pool.query('SELECT user_id, role FROM group_members WHERE group_id = ? AND left_at IS NULL', [groupId]);
    const ts = updatedGroup.created_at;
    const groupPayload = {
      id: String(updatedGroup.id),
      name: updatedGroup.name,
      description: updatedGroup.description || '',
      avatar: updatedGroup.avatar || null,
      createdBy: String(updatedGroup.created_by),
      ownerId: String(updatedGroup.owner_id),
      members: allMembers.map(m => String(m.user_id)),
      admins: allMembers.filter(m => ['admin','owner'].includes(m.role)).map(m => String(m.user_id)),
      createdAt: ts instanceof Date ? ts.toISOString() : String(ts),
      settings: {
        messagePermission: updatedGroup.message_permission || 'all',
        addMemberPermission: updatedGroup.add_member_permission || 'everyone',
        allowMemberLeave: updatedGroup.allow_member_leave === 1,
        slowMode: updatedGroup.slow_mode === 1,
        slowModeSeconds: updatedGroup.slow_mode_seconds || 10,
      },
    };

    const io = req.app.get('io');
    if (io) {
      io.to(String(groupId)).emit('group_updated', { group: groupPayload });
      // Also notify via each member's personal room so they get it even if not in the group socket room
      groupPayload.members.forEach(uid => {
        io.to(`user_${uid}`).emit('group_updated', { group: groupPayload });
      });

      const [[updaterRow]] = await pool.query('SELECT name FROM users WHERE id = ?', [userId]);
      const actorName = updaterRow?.name || 'Someone';
      const title = `Group updated: "${groupPayload.name}"`;
      const body = `${actorName} updated settings for "${groupPayload.name}"`;

      for (const memberId of groupPayload.members.filter((uid) => uid !== String(userId))) {
        const notificationId = await createNotification({
          type: 'group_updated',
          recipientId: memberId,
          senderId: userId,
          conversationId: String(groupId),
          title,
          body,
        });
        io.to(`user_${memberId}`).emit('new_notification', {
          id: String(notificationId),
          type: 'group_updated',
          recipientId: memberId,
          senderId: String(userId),
          conversationId: String(groupId),
          title,
          body,
          timestamp: new Date().toISOString(),
          read: false,
        });
      }
    }

    console.log(`[groups.PATCH /info] ✅ Success - returning group ${groupId}`);
    res.json({ message: 'Group updated.', group: groupPayload, avatarKey });
  } catch (err) {
    console.error('groups PATCH info error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/groups/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  const userId = req.user.id;
  try {
    const membershipRole = await getActiveMembershipRole(groupId, userId);
    const isOwner = membershipRole === 'owner';
    const isSiteAdmin = req.user.role === 'admin';
    if (!isOwner && !isSiteAdmin) {
      return res.status(403).json({ message: 'Only the group owner can delete this group.' });
    }
    await pool.query('DELETE FROM `groups` WHERE id = ?', [groupId]);
    const io = req.app.get('io');
    if (io) {
      io.to(String(groupId)).emit('group_deleted', { groupId: String(groupId) });
    }
    res.json({ message: 'Group deleted.' });
  } catch (err) {
    console.error('groups DELETE error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// POST /api/groups/:id/members — add members
router.post('/:id/members', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  const userId = req.user.id;
  const { userIds = [] } = req.body;

  try {
    const [groupRows] = await pool.query('SELECT * FROM `groups` WHERE id = ?', [groupId]);
    if (!groupRows.length) return res.status(404).json({ message: 'Group not found.' });
    const groupRow = groupRows[0];

    const requesterRole = await getActiveMembershipRole(groupId, userId);
    if (!requesterRole) {
      return res.status(403).json({ message: 'You must be an active member to add new users.' });
    }

    if (groupRow.add_member_permission === 'admin_only' && !['admin', 'owner'].includes(requesterRole)) {
      return res.status(403).json({ message: 'Only admins can add members.' });
    }

    const newMemberIds = [];
    for (const memberId of userIds) {
      const [result] = await pool.query(
        'INSERT INTO group_members (group_id, user_id, role, left_at) VALUES (?, ?, ?, NULL) ON DUPLICATE KEY UPDATE role = VALUES(role), left_at = NULL',
        [groupId, memberId, 'member']
      );
      if (result.affectedRows > 0) newMemberIds.push(String(memberId));
    }

    if (newMemberIds.length > 0) {
      const io = req.app.get('io');
      if (io) {
        // Fetch only active members (exclude those who voluntarily left)
        const [allMembers] = await pool.query(
          'SELECT user_id, role FROM group_members WHERE group_id = ? AND left_at IS NULL',
          [groupId]
        );
        const memberIds = allMembers.map((m) => String(m.user_id));
        const adminIds = allMembers
          .filter((m) => m.role === 'admin' || m.role === 'owner')
          .map((m) => String(m.user_id));

        const ts = groupRow.created_at;
        const fullGroup = {
          id: String(groupRow.id),
          name: groupRow.name,
          description: groupRow.description || '',
          avatar: groupRow.avatar || null,
          createdBy: String(groupRow.created_by),
          ownerId: String(groupRow.owner_id),
          members: memberIds,
          admins: adminIds,
          createdAt: ts instanceof Date ? ts.toISOString() : String(ts),
          settings: {
            messagePermission: groupRow.message_permission || 'all',
            addMemberPermission: groupRow.add_member_permission || 'everyone',
            allowMemberLeave: groupRow.allow_member_leave === 1,
            slowMode: groupRow.slow_mode === 1,
            slowModeSeconds: groupRow.slow_mode_seconds || 10,
          },
        };

        // Notify new members via their personal rooms so they receive the group
        const [[adderRow]] = await pool.query('SELECT name FROM users WHERE id = ?', [userId]);
        const adderName = adderRow?.name || 'Someone';
        for (const memberId of newMemberIds) {
          io.to(`user_${memberId}`).emit('new_group', { group: fullGroup });
          const title = `Added to "${fullGroup.name}"`;
          const body = `${adderName} added you to "${fullGroup.name}"`;
          const notificationId = await createNotification({
            type: 'group_added',
            recipientId: memberId,
            senderId: userId,
            conversationId: String(groupId),
            title,
            body,
          });
          io.to(`user_${memberId}`).emit('new_notification', {
            id: String(notificationId),
            type: 'group_added',
            recipientId: memberId,
            senderId: String(userId),
            conversationId: String(groupId),
            title,
            body,
            timestamp: new Date().toISOString(),
            read: false,
          });
        }

        // Notify existing members about the membership change
        const existingMemberIds = memberIds.filter((uid) => !newMemberIds.includes(uid) && uid !== String(userId));
        if (existingMemberIds.length > 0) {
          const addedNames = newMemberIds
            .map(id => {
              const user = fullGroup.members.includes(id);
              return id;
            })
            .join(', ');
          const title = `${adderName} added new members to "${fullGroup.name}"`;
          const body = `${adderName} added ${newMemberIds.length} member${newMemberIds.length === 1 ? '' : 's'} to "${fullGroup.name}"`;
          for (const memberId of existingMemberIds) {
            const notificationId = await createNotification({
              type: 'group_members_added',
              recipientId: memberId,
              senderId: userId,
              conversationId: String(groupId),
              title,
              body,
            });
            io.to(`user_${memberId}`).emit('new_notification', {
              id: String(notificationId),
              type: 'group_members_added',
              recipientId: memberId,
              senderId: String(userId),
              conversationId: String(groupId),
              title,
              body,
              timestamp: new Date().toISOString(),
              read: false,
            });
          }
        }

        // Notify existing group members that new people were added
        io.to(String(groupId)).emit('group_members_added', {
          groupId: String(groupId),
          addedUserIds: newMemberIds,
          addedBy: String(userId),
        });
      }
    }

    res.json({ message: 'Members added.' });
  } catch (err) {
    console.error('groups add members error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/groups/:id/members/:userId — remove member / leave
router.delete('/:id/members/:userId', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  const targetId = req.params.userId;
  const requestId = req.user.id;
  const isSelfLeave = String(targetId) === String(requestId);

  try {
    let eventLeftAt = new Date().toISOString();
    if (!isSelfLeave) {
      // Admin kicking someone — check permission, then soft leave so history remains available
      const requesterRole = await getActiveMembershipRole(groupId, requestId);
      if (!requesterRole || !['admin', 'owner'].includes(requesterRole)) {
        return res.status(403).json({ message: 'Only admins can remove members.' });
      }
      await pool.query('UPDATE group_members SET left_at = NOW() WHERE group_id = ? AND user_id = ?', [groupId, targetId]);
    } else {
      // Voluntary leave — soft delete so the group persists in the user's panel until dismissed
      await pool.query('UPDATE group_members SET left_at = NOW() WHERE group_id = ? AND user_id = ?', [groupId, targetId]);
    }

    const io = req.app.get('io');
    if (io) {
      // Ensure user's sockets are evicted from the group room immediately
      try { await removeUserFromGroupSocketRoom(io, groupId, targetId); } catch (e) { /* best-effort */ }
      const payload = {
        groupId: String(groupId),
        userId: String(targetId),
        leftAt: eventLeftAt,
        leftReason: isSelfLeave ? 'left' : 'removed',
      };
      io.to(String(groupId)).emit('group_member_left', payload);
      io.to(`user_${targetId}`).emit('group_member_left', payload);
    }
    res.json({ message: isSelfLeave ? 'You left the group.' : 'Member removed.' });
  } catch (err) {
    console.error('groups remove member error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE /api/groups/:id/leave/dismiss — permanently remove a left group from the user's panel
router.delete('/:id/leave/dismiss', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  const userId = req.user.id;
  try {
    await pool.query('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]);
    res.json({ message: 'Group dismissed.' });
  } catch (err) {
    console.error('groups dismiss error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// PUT /api/groups/:id/members/:userId/role — promote / demote / transfer ownership
router.put('/:id/members/:userId/role', authenticateToken, async (req, res) => {
  const groupId = req.params.id;
  const targetId = req.params.userId;
  const requestId = req.user.id;
  const { role } = req.body;

  try {
    const requesterRole = await getActiveMembershipRole(groupId, requestId);
    const isSiteAdmin = req.user.role === 'admin';
    if (!isSiteAdmin && (!requesterRole || !['admin', 'owner'].includes(requesterRole))) {
      return res.status(403).json({ message: 'Only admins can change roles.' });
    }
    await pool.query(
      'UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?',
      [role, groupId, targetId]
    );

    const io = req.app.get('io');
    if (io) {
      io.to(String(groupId)).emit('group_role_changed', {
        groupId: String(groupId),
        userId: String(targetId),
        role,
        initiatorId: String(requestId),
      });

      // For ownership transfer: save a notification and push to new owner
      if (role === 'owner') {
        try {
          const [[requester]] = await pool.query('SELECT name FROM users WHERE id = ?', [requestId]);
          const [[groupRow]] = await pool.query('SELECT name FROM `groups` WHERE id = ?', [groupId]);
          const title = 'You are now the group owner';
          const body = `${requester?.name || 'Someone'} transferred ownership of "${groupRow?.name || 'a group'}" to you`;
          const notificationId = await createNotification({
            type: 'ownership_transferred',
            recipientId: targetId,
            senderId: requestId,
            conversationId: String(groupId),
            title,
            body,
          });
          io.to(`user_${targetId}`).emit('new_notification', {
            id: String(notificationId),
            type: 'ownership_transferred',
            recipientId: String(targetId),
            senderId: String(requestId),
            conversationId: String(groupId),
            title,
            body,
            timestamp: new Date().toISOString(),
            read: false,
          });
        } catch (e) {
          console.error('ownership notification error:', e.message);
        }
      }
    }

    res.json({ message: 'Member role updated.' });
  } catch (err) {
    console.error('groups role change error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;


module.exports = router;
