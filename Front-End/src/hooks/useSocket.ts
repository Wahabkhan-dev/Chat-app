'use client';

import { useEffect, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import { connectSocket, disconnectSocket, getSocket } from '@/services/socket';
import { forceLogout } from '@/services/auth';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { playNotificationSound } from '@/lib/notificationSound';

export function useSocket() {
  const { state, dispatch } = useAppContext();
  const initialized = useRef(false);
  // Always-current snapshot of state for use inside socket callbacks (avoids stale closures)
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });
  // Dedup processed message IDs — prevents double-delivery from room + personal room
  const processedMsgIds = useRef(new Set<string>());
  const loadedOnce = useRef(false); // true after first loadData() completes
  const lastSyncAt = useRef(0); // throttle syncMissedMessages against reconnect/focus churn
  const lastActiveRefetchAt = useRef(0); // throttle open-conversation refetch on reconnect/focus

  useEffect(() => {
    if (!state.isAuthenticated || initialized.current) return;
    const token = localStorage.getItem('teams_token');
    if (!token) return;

    initialized.current = true;
    const socket = connectSocket(token);

    // Fetch server-driven unread counts for all conversations.
    // Uses conversation_last_seen on the server — no localStorage needed.
    // Called on initial load, every reconnect, and on tab focus.
    const syncMissedMessages = async () => {
      // Throttle so rapid reconnects / focus events don't storm the endpoint.
      const nowTs = Date.now();
      if (nowTs - lastSyncAt.current < 15000) return;
      lastSyncAt.current = nowTs;
      try {
        const { counts, previews } = await api.get<{
          counts: Record<string, number>;
          previews: Record<string, { senderId: string; content: string; type: string; timestamp: string }>;
        }>('/messages/unread-counts');
        dispatch({ type: 'UPDATE_UNREAD_COUNTS', payload: { counts, previews } });
      } catch {
        // best-effort — silently fail so it doesn't surface to the user
      }
    };

    // Re-fetch the conversation the user currently has OPEN. The new_message socket events that
    // fired while offline/backgrounded are not replayed on reconnect, so unread-since (sidebar
    // badges) isn't enough — the open thread itself must be refreshed or the message never shows.
    // LOAD_MESSAGES replaces the thread with the server's authoritative list (no duplicates).
    const refetchActiveConversation = async () => {
      const activeId = stateRef.current.activeConversation?.id;
      if (!activeId) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      // Throttle so rapid focus toggles / flaky reconnects don't storm the messages endpoint.
      const nowTs = Date.now();
      if (nowTs - lastActiveRefetchAt.current < 8000) return;
      lastActiveRefetchAt.current = nowTs;
      try {
        const { messages } = await api.get<{ messages: any[] }>(`/messages/${activeId}`);
        dispatch({ type: 'LOAD_MESSAGES', payload: { conversationId: activeId, messages } });
      } catch {
        // best-effort; the sidebar badge still reflects the unread via syncMissedMessages
      }
    };

    // ── Load initial data ──────────────────────────────────────────────────
    const loadData = async () => {
      try {
        const [usersRes, groupsRes, notifsRes] = await Promise.allSettled([
          api.get<{ users: any[] }>('/users/directory'),
          api.get<{ groups: any[] }>('/groups'),
          api.get<{ notifications: any[] }>('/notifications'),
        ]);

        let users: any[] = [];
        let groups: any[] = [];

        if (usersRes.status === 'fulfilled') {
          const currentUserRole = stateRef.current.currentUser?.role;
          users = usersRes.value.users
            .filter((u: any) => currentUserRole === 'admin' || u.role !== 'admin')
            .map((u: any) => ({
              id: String(u.id),
              name: u.name,
              email: u.email,
              role: u.role,
              avatar: u.avatar || '',
              status: u.status || 'offline',
              department: u.department || '',
              createdAt: u.created_at ? String(u.created_at) : new Date().toISOString(),
              isActive: u.is_active === 1,
            }));
          dispatch({ type: 'SET_USERS', payload: users });
        } else {
          console.error('[useSocket] failed to load users:', usersRes.reason);
        }

        if (groupsRes.status === 'fulfilled') {
          groups = groupsRes.value.groups.map((g: any) => ({
            id: String(g.id),
            name: g.name,
            description: g.description || '',
            avatar: g.avatar || null,
            createdBy: String(g.createdBy),
            ownerId: String(g.ownerId),
            members: (g.members || []).map(String),
            admins: (g.admins || []).map(String),
            createdAt: g.createdAt || new Date().toISOString(),
            settings: g.settings || {
              messagePermission: 'all',
              addMemberPermission: 'everyone',
              allowMemberLeave: true,
              slowMode: false,
              slowModeSeconds: 10,
            },
          }));
          dispatch({ type: 'SET_GROUPS', payload: groups });

          const leftAtMeta: Record<string, any> = {};
          groupsRes.value.groups.forEach((g: any) => {
            if (g.leftAt || g.leftReason) {
              leftAtMeta[String(g.id)] = {
                ...(g.leftAt ? { leftAt: g.leftAt } : {}),
                ...(g.leftReason ? { leftReason: g.leftReason } : {}),
              };
            }
          });
          if (Object.keys(leftAtMeta).length > 0) {
            dispatch({ type: 'HYDRATE_CONVERSATION_META', payload: leftAtMeta });
          }

          groups.filter((g: any) => !g.leftAt).forEach((g: any) => socket.emit('join_group', { groupId: g.id }));
        } else {
          console.error('[useSocket] failed to load groups:', groupsRes.reason);
        }

        if (notifsRes.status === 'fulfilled') {
          const notifications = (notifsRes.value.notifications || []).map((n: any) => ({
            id: String(n.id),
            type: n.type as any,
            recipientId: n.recipient_id ? String(n.recipient_id) : 'all',
            senderId: n.sender_id ? String(n.sender_id) : undefined,
            conversationId: n.conversation_id ? String(n.conversation_id) : undefined,
            messageId: n.message_id ? String(n.message_id) : undefined,
            emoji: n.emoji || undefined,
            title: n.title,
            body: n.body,
            timestamp: n.created_at instanceof Date ? n.created_at.toISOString() : String(n.created_at),
            read: n.is_read === 1,
          }));
          notifications.forEach((n: any) => dispatch({ type: 'ADD_NOTIFICATION', payload: n }));
        } else {
          console.error('[useSocket] failed to load notifications:', notifsRes.reason);
        }

        // Compute unread counts using the server-driven endpoint — no localStorage required.
        // The server joins conversation_last_seen with messages to count what's unread.
        try {
          const uid = stateRef.current.currentUser?.id;
          const { counts, previews } = await api.get<{ counts: Record<string, number>; previews: Record<string, { senderId: string; content: string; type: string; timestamp: string }> }>('/messages/unread-counts');
          dispatch({ type: 'UPDATE_UNREAD_COUNTS', payload: { counts, previews } });
          if (Object.keys(counts).length > 0) {

            // Add bell-panel notifications for each conversation that has offline unread messages.
            // Uses locally-scoped `users` and `groups` (just fetched) to avoid stale-ref race.
            const currentUserId = uid || '';
            Object.entries(counts).forEach(([convId, count]) => {
              if (Number(count) <= 0) return;
              // Skip bell notification for muted conversations
              const convMeta = stateRef.current.conversationMeta[convId];
              if (convMeta?.muted && (!convMeta.muteUntil || new Date(convMeta.muteUntil) > new Date())) return;
              const isDm = convId.startsWith('dm_');
              const preview = previews?.[convId];
              const rawContent = preview?.content || '';
              const bodyText = rawContent
                ? rawContent.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1').slice(0, 80) || '📎 Attachment'
                : `${count} new message${Number(count) > 1 ? 's' : ''}`;

              if (isDm) {
                const parts = convId.split('_');
                const otherId = parts[1] === String(currentUserId) ? parts[2] : parts[1];
                const sender = users.find(u => u.id === otherId);
                if (!sender) return;
                dispatch({
                  type: 'ADD_NOTIFICATION',
                  payload: {
                    id: `offline_msg_${convId}`,
                    type: 'dm_message' as any,
                    recipientId: currentUserId,
                    senderId: preview?.senderId,
                    conversationId: convId,
                    title: sender.name,
                    body: bodyText,
                    timestamp: preview?.timestamp || new Date().toISOString(),
                    read: false,
                  },
                });
              } else {
                const group = groups.find(g => g.id === convId);
                if (!group) return;
                const senderUser = preview?.senderId ? users.find(u => u.id === preview.senderId) : null;
                dispatch({
                  type: 'ADD_NOTIFICATION',
                  payload: {
                    id: `offline_msg_${convId}`,
                    type: 'group_message' as any,
                    recipientId: currentUserId,
                    senderId: preview?.senderId,
                    conversationId: convId,
                    title: senderUser ? `${senderUser.name} in ${group.name}` : group.name,
                    body: bodyText,
                    timestamp: preview?.timestamp || new Date().toISOString(),
                    read: false,
                  },
                });
              }
            });
          }
        } catch { /* best-effort */ }

        loadedOnce.current = true; // initial load done — future connects are reconnects
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    };

    loadData();

    // STRICT presence: report whether the app is currently on-screen. The server marks the user
    // online only while at least one of their tabs/devices is visible.
    const emitPresence = () => {
      const sock = getSocket();
      if (!sock?.connected) return;
      const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
      sock.emit('presence_state', { visible });
    };

    // ── Rejoin rooms on every (re)connect so group and DM events work after reconnects ──
    socket.on('connect', async () => {
      const s = stateRef.current;
      // Tell the server our current on-screen state as soon as we (re)connect.
      emitPresence();
      if (s.activeConversation?.type === 'dm' && s.currentUser?.id) {
        const parts = s.activeConversation.id.split('_');
        const otherId = parts[1] === String(s.currentUser.id) ? parts[2] : parts[1];
        socket.emit('join_dm', { otherUserId: otherId });
      }

      s.groups
        .filter(g => !s.conversationMeta[g.id]?.leftAt)
        .forEach((group) => socket.emit('join_group', { groupId: group.id }));

      // Pull missed messages on both initial connect and reconnects.
      // syncMissedMessages calls the server-driven /messages/unread-counts endpoint,
      // so no localStorage pre-seeding is needed before calling it.
      syncMissedMessages();
      refetchActiveConversation();
    });

    const isBlockedConversation = (conversationId?: string) => {
      return Boolean(conversationId && stateRef.current.conversationMeta[conversationId]?.blocked);
    };

    // ── Socket event listeners ─────────────────────────────────────────────
    // Deduplicate message_deleted — personal room + conversation room both fire for DMs
    const processedDeletes = new Set<string>();
    socket.on('message_deleted', ({ messageId, conversationId, deletedBy, deletedAt }) => {
      const s = stateRef.current;
      if (isBlockedConversation(conversationId) && deletedBy !== s.currentUser?.id) {
        return;
      }
      const key = `${conversationId}:${messageId}`;
      if (processedDeletes.has(key)) return;
      processedDeletes.add(key);
      setTimeout(() => processedDeletes.delete(key), 5000);
      dispatch({ type: 'DELETE_MESSAGE', payload: { conversationId, messageId, deletedBy, deletedAt } });
    });

    socket.on('new_message', ({ conversationId, message }) => {
      const s = stateRef.current;
      // If we have blocked this conversation, ignore incoming messages from the other user.
      if (conversationId && message.senderId !== s.currentUser?.id && s.conversationMeta[conversationId]?.blocked) {
        return;
      }

      // Deduplicate — DM messages fire on the DM room AND the personal room
      if (processedMsgIds.current.has(message.id)) return;
      processedMsgIds.current.add(message.id);
      if (processedMsgIds.current.size > 300) {
        const arr = Array.from(processedMsgIds.current);
        processedMsgIds.current = new Set(arr.slice(-150));
      }

      dispatch({ type: 'SEND_MESSAGE', payload: { conversationId, message } });

      // Signal delivery back to sender once this client has received the message
      if (message.senderId !== s.currentUser?.id) {
        const socketInstance = getSocket();
        if (socketInstance?.connected) {
          socketInstance.emit('message_received', { messageId: message.id, conversationId });
        }
      }

      // Message notifications are now persisted on the backend. The new_notification event
      // will handle notification display so we can avoid duplicate local message notifications.
      if (message.senderId === s.currentUser?.id) return;
    });

    socket.on('message_edited', ({ messageId, conversationId, content, editedAt }) => {
      if (isBlockedConversation(conversationId)) return;
      dispatch({
        type: 'EDIT_MESSAGE',
        payload: { conversationId, messageId, newContent: content, editedAt },
      });
    });

    socket.on('reaction_updated', ({ messageId, conversationId, reactions }) => {
      if (isBlockedConversation(conversationId)) return;
      dispatch({
        type: 'SET_MESSAGE_REACTIONS',
        payload: { conversationId, messageId, reactions },
      });
    });

    socket.on('user_typing', ({ conversationId, userName }) => {
      if (isBlockedConversation(conversationId)) return;
      dispatch({
        type: 'SET_TYPING',
        payload: { conversationId, userName, isTyping: true },
      });
    });

    socket.on('user_stop_typing', ({ conversationId, userId }) => {
      if (isBlockedConversation(conversationId)) return;
      // We need to find the user name to remove from typing
      // Pass userId so reducer can handle it by id
      dispatch({
        type: 'CLEAR_TYPING',
        payload: { conversationId, userId },
      });
    });

    socket.on('user_status_change', ({ userId, status }) => {
      dispatch({ type: 'UPDATE_USER_STATUS', payload: { userId: String(userId), status } });
    });

    // PHASE 2: Listen for device connection on other devices
    socket.on('device_status_change', ({ userId, action }) => {
      if (action === 'device_connected') {
        // Another device of this user logged in — update status to online
        dispatch({
          type: 'UPDATE_USER_STATUS',
          payload: { userId: String(userId), status: 'online' },
        });
      }
    });

    socket.on('user_updated', ({ user }) => {
      if (!user) return;
      const normalized = { ...user, id: String(user.id), isActive: user.is_active === 1 || user.is_active === true };
      dispatch({ type: 'UPDATE_USER', payload: normalized });
    });

    // Force logout (server-side deactivation) — clear local session and redirect
    socket.on('force_logout', async ({ reason }) => {
      try {
        await forceLogout();
      } catch {}
      dispatch({ type: 'LOGOUT' });
      try { disconnectSocket(); } catch {}
      try {
        toast({ title: 'Logged out', description: reason === 'account_deactivated' ? 'Your account was deactivated.' : 'You have been logged out.', type: 'info' });
        window.location.href = '/';
      } catch {}
    });

    // Notify clients when a user is reactivated — refresh user list and update state
    socket.on('user_reactivated', async ({ userId }) => {
      try {
        dispatch({ type: 'REACTIVATE_USER', payload: String(userId) });
        const res = await api.get('/users/directory');
        if (res && Array.isArray(res.users)) dispatch({ type: 'SET_USERS', payload: res.users.map((u: any) => ({ ...u, id: String(u.id), isActive: u.is_active === 1 })) });
      } catch { /* best-effort */ }
    });

    const processedUndeletes = new Set<string>();
    socket.on('message_undeleted', ({ messageId, conversationId }) => {
      const key = `${conversationId}:${messageId}`;
      if (processedUndeletes.has(key)) return;
      processedUndeletes.add(key);
      setTimeout(() => processedUndeletes.delete(key), 5000);
      dispatch({ type: 'UNDO_DELETE', payload: { conversationId, messageId } });
    });

    socket.on('message_pinned', ({ conversationId, message }) => {
      if (isBlockedConversation(conversationId)) return;
      dispatch({ type: 'PIN_MESSAGE', payload: { conversationId, message } });
    });

    socket.on('message_unpinned', ({ conversationId }) => {
      if (isBlockedConversation(conversationId)) return;
      dispatch({ type: 'UNPIN_MESSAGE', payload: conversationId });
    });

    socket.on('new_group', ({ group }) => {
      const s = stateRef.current;
      const gid = String(group.id);

      const normalized = {
        id: gid,
        name: group.name,
        description: group.description || '',
        avatar: group.avatar || null,
        createdBy: String(group.createdBy),
        ownerId: String(group.ownerId),
        members: (group.members || []).map(String),
        admins: (group.admins || []).map(String),
        createdAt: group.createdAt || new Date().toISOString(),
        settings: group.settings || {
          messagePermission: 'all',
          addMemberPermission: 'everyone',
          allowMemberLeave: true,
          slowMode: false,
          slowModeSeconds: 10,
        },
      };

      const alreadyExists = s.groups.some(g => g.id === gid);
      // leftAt can come from in-memory state OR from localStorage (survives kicks + refresh)
      const wasLeft = !!(s.conversationMeta[gid]?.leftAt);

      // If leftAt is set, this is ALWAYS a re-add (voluntary leave or kick+refresh)
      // Must check wasLeft BEFORE alreadyExists to handle kick+refresh scenario
      if (wasLeft) {
        dispatch({ type: 'REJOIN_GROUP', payload: normalized });
        socket.emit('join_group', { groupId: gid });
        return;
      }

      if (alreadyExists) return; // already an active member, nothing to do

      // Brand new group
      dispatch({ type: 'RECEIVE_NEW_GROUP', payload: normalized });
      socket.emit('join_group', { groupId: gid });

      if (String(group.createdBy) !== s.currentUser?.id) {
        return;
      }
    });

    socket.on('group_role_changed', ({ groupId, userId, role, initiatorId }) => {
      const s = stateRef.current;
      const gid = String(groupId);
      const uid = String(userId);
      const group = s.groups.find(g => g.id === gid);
      if (!group) return;

      const isInitiator = String(initiatorId) === s.currentUser?.id;

      if (role === 'owner') {
        if (isInitiator) return; // Leaving owner already dispatched TRANSFER_ADMIN_AND_LEAVE locally
        dispatch({
          type: 'TRANSFER_OWNERSHIP',
          payload: {
            groupId: gid,
            oldOwnerId: group.ownerId,
            newOwnerId: uid,
            systemMessage: {
              id: `sys-own-${Date.now()}`,
              senderId: 'system',
              content: `${s.users.find(u => u.id === uid)?.name || 'A member'} is now the group owner`,
              timestamp: new Date().toISOString(),
              type: 'text',
              reactions: [],
            } as any,
          },
        });
      } else if (role === 'admin') {
        dispatch({ type: 'PROMOTE_TO_ADMIN', payload: { groupId: gid, userId: uid } });
      } else if (role === 'member') {
        dispatch({ type: 'DEMOTE_FROM_ADMIN', payload: { groupId: gid, userId: uid } });
      }
    });

    const processedMemberLeave = new Set<string>();
    socket.on('group_member_left', ({ groupId, userId, leftAt, leftReason }) => {
      const key = `${groupId}:${userId}`;
      if (processedMemberLeave.has(key)) return;
      processedMemberLeave.add(key);
      setTimeout(() => processedMemberLeave.delete(key), 5000);

      const s = stateRef.current;
      const uid = String(userId);
      const gid = String(groupId);
      const leavingUser = s.users.find(u => u.id === uid);
      const group = s.groups.find(g => g.id === gid);

      if (uid === s.currentUser?.id) {
        const wasKicked = leftReason === 'removed' || (!leftAt && s.conversationMeta[gid]?.leftAt === undefined);
        dispatch({
          type: 'REMOVE_GROUP_MEMBER',
          payload: {
            groupId: gid,
            userId: uid,
            leftAt: leftAt || new Date().toISOString(),
            leftReason: leftReason || (wasKicked ? 'removed' : 'left'),
            systemMessage: {
              id: `sys-left-${Date.now()}`,
              senderId: 'system',
              content: leftReason === 'removed' ? 'You were removed from the group' : 'You left the group',
              timestamp: new Date().toISOString(),
              type: 'text',
              reactions: [],
            } as any,
          },
        });
        if (wasKicked && group) {
          toast({ title: `Removed from "${group.name}"`, description: 'An admin removed you from this group.' });
        }
        return;
      }

      dispatch({
        type: 'REMOVE_GROUP_MEMBER',
        payload: {
          groupId: gid,
          userId: uid,
          systemMessage: {
            id: `sys-left-${Date.now()}`,
            senderId: 'system',
            content: `${leavingUser?.name || 'A member'} left the group`,
            timestamp: new Date().toISOString(),
            type: 'text',
            reactions: [],
          } as any,
        },
      });
    });

    socket.on('group_updated', ({ group }) => {
      dispatch({
        type: 'UPDATE_GROUP',
        payload: {
          id: String(group.id),
          name: group.name,
          description: group.description || '',
          avatar: group.avatar || null,
          createdBy: String(group.createdBy),
          ownerId: String(group.ownerId),
          members: (group.members || []).map(String),
          admins: (group.admins || []).map(String),
          createdAt: group.createdAt || new Date().toISOString(),
          settings: group.settings || { messagePermission: 'all', addMemberPermission: 'everyone', allowMemberLeave: true, slowMode: false, slowModeSeconds: 10 },
        },
      });
    });

    socket.on('group_deleted', ({ groupId }) => {
      dispatch({ type: 'DELETE_GROUP', payload: String(groupId) });
    });

    socket.on('group_members_added', ({ groupId, addedUserIds }) => {
      const s = stateRef.current;
      const gid = String(groupId);
      const group = s.groups.find(g => g.id === gid);
      if (!group) return;

      const newIds = (addedUserIds as string[]).map(String);
      const addedNames = newIds
        .map(id => s.users.find(u => u.id === id)?.name || 'A member')
        .join(', ');

      dispatch({
        type: 'ADD_GROUP_MEMBERS',
        payload: {
          groupId: gid,
          userIds: newIds,
          systemMessage: {
            id: `sys-added-${Date.now()}`,
            senderId: 'system',
            content: `${addedNames} ${newIds.length === 1 ? 'was' : 'were'} added to the group`,
            timestamp: new Date().toISOString(),
            type: 'text',
            reactions: [],
          } as any,
        },
      });
    });

    socket.on('new_notification', (notif) => {
      const s = stateRef.current;
      const isMessageNotification = notif.type === 'dm_message' || notif.type === 'group_message';
      if (isMessageNotification && notif.conversationId && s.activeConversation?.id === notif.conversationId) {
        return;
      }

      if (notif.conversationId && s.conversationMeta[notif.conversationId]?.blocked) {
        return;
      }

      // Suppress notifications for muted conversations (message types only — reactions, mentions
      // from @everyone, etc. should still show if the user specifically muted only message noise)
      if (isMessageNotification && notif.conversationId) {
        const meta = s.conversationMeta[notif.conversationId];
        const effectivelyMuted = meta?.muted && (!meta.muteUntil || new Date(meta.muteUntil) > new Date());
        if (effectivelyMuted) return;
      }

      dispatch({
        type: 'ADD_NOTIFICATION',
        payload: {
          id: String(notif.id),
          type: notif.type,
          recipientId: notif.recipientId ? String(notif.recipientId) : 'all',
          senderId: notif.senderId ? String(notif.senderId) : undefined,
          conversationId: notif.conversationId ? String(notif.conversationId) : undefined,
          messageId: notif.messageId ? String(notif.messageId) : undefined,
          emoji: notif.emoji || undefined,
          title: notif.title,
          body: notif.body,
          timestamp: notif.timestamp || new Date().toISOString(),
          read: false,
        },
      });

      // Play notification sound if the user hasn't disabled it
      if (s.userSettings?.soundEnabled !== false) {
        playNotificationSound();
      }

      // Show a small toast for non-message notifications (group admin actions, etc.)
      // when the tab is in the background. Message notifications are handled via
      // the sidebar badge and bell panel — no in-app popup is shown for messages.
      if ((typeof document === 'undefined' || document.visibilityState !== 'visible') && !isMessageNotification) {
        toast({ title: notif.title, description: notif.body });
      }
    });

    socket.on('new_user', ({ user }) => {
      // Don't surface new admin accounts to regular chat users
      const currentUserRole = stateRef.current.currentUser?.role;
      if (user.role === 'admin' && currentUserRole !== 'admin') return;

      const newUser = {
        id: String(user.id),
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || '',
        status: user.status || 'offline',
        department: user.department || '',
        createdAt: user.created_at ? String(user.created_at) : new Date().toISOString(),
        isActive: user.is_active === 1,
      };

      dispatch({ type: 'CREATE_USER', payload: newUser });

      dispatch({
        type: 'ADD_NOTIFICATION',
        payload: {
          id: `notif_${Date.now()}`,
          type: 'user_joined',
          recipientId: 'all',
          title: 'New team member',
          body: `${user.name} has joined the team!`,
          timestamp: new Date().toISOString(),
          read: false,
        },
      });

      // Show visible popup to every connected user
      toast({
        title: '👋 New team member',
        description: `${user.name} (${user.department || user.role}) has joined the team!`,
      });
    });

    socket.on('user_deleted', async ({ userId }) => {
      dispatch({ type: 'DELETE_USER', payload: String(userId) });
      // Re-fetch directory to stay in sync (deleted user will not appear)
      try {
        const res = await api.get<{ users: any[] }>('/users/directory');
        if (res && Array.isArray(res.users)) {
          dispatch({
            type: 'SET_USERS',
            payload: res.users.map((u: any) => ({
              id: String(u.id),
              name: u.name,
              email: u.email,
              role: u.role,
              avatar: u.avatar || '',
              status: u.status || 'offline',
              department: u.department || '',
              createdAt: u.created_at ? String(u.created_at) : new Date().toISOString(),
              isActive: u.is_active === 1,
            })),
          });
        }
      } catch { /* best-effort */ }
    });

    socket.on('conversation_metadata_updated', ({ conversationId, userId, action, value }) => {
      const s = stateRef.current;
      if (String(userId) !== String(s.currentUser?.id) || !conversationId) return;

      switch (action) {
        case 'block':
          dispatch({ type: 'BLOCK_USER', payload: conversationId });
          break;
        case 'unblock':
          dispatch({ type: 'UNBLOCK_USER', payload: conversationId });
          break;
        case 'mute':
          dispatch({ type: 'MUTE_CONVERSATION', payload: { conversationId, muteUntil: value?.mutedUntil ?? null } });
          break;
        case 'unmute':
          dispatch({ type: 'UNMUTE_CONVERSATION', payload: conversationId });
          break;
        case 'pin':
          dispatch({ type: 'PIN_CONVERSATION', payload: conversationId });
          break;
        case 'unpin':
          dispatch({ type: 'UNPIN_CONVERSATION', payload: conversationId });
          break;
        case 'mark_unread':
          dispatch({ type: 'MARK_CONVERSATION_UNREAD', payload: conversationId });
          break;
        case 'mark_read':
          dispatch({ type: 'MARK_CONVERSATION_READ', payload: conversationId });
          break;
        case 'favourite':
        case 'favorite':
          dispatch({ type: 'PIN_CONVERSATION', payload: conversationId });
          break;
        case 'unfavourite':
        case 'unfavorite':
          dispatch({ type: 'UNPIN_CONVERSATION', payload: conversationId });
          break;
        default:
          break;
      }
    });

    // Sync user settings changes (theme, sound, notifications, etc.) to all active devices
    socket.on('user_settings_updated', ({ userId, settings }) => {
      const s = stateRef.current;
      if (String(userId) !== String(s.currentUser?.id) || !settings) return;
      dispatch({ type: 'UPDATE_SETTING', payload: settings });
    });

    socket.on('all_notifications_read', () => {
      dispatch({ type: 'MARK_NOTIFICATIONS_READ' });
    });

    socket.on('notification_read', ({ notificationId }) => {
      if (!notificationId) return;
      dispatch({ type: 'MARK_NOTIFICATION_READ', payload: String(notificationId) });
    });

    socket.on('conversation_notifications_read', ({ notificationIds }) => {
      if (!Array.isArray(notificationIds) || notificationIds.length === 0) return;
      dispatch({ type: 'MARK_NOTIFICATIONS_READ_BY_IDS', payload: notificationIds.map(String) });
    });

    // Handle message read receipts
    socket.on('message_read', ({ conversationId, messageId, userId, readAt }) => {
      const s = stateRef.current;
      if (userId === s.currentUser?.id) return;
      if (!conversationId) return;

      const message = s.messages?.[conversationId]?.find((m) => m.id === messageId);
      if (!message || message.senderId !== s.currentUser?.id) return;
      if (message.status === 'seen') return;

      dispatch({ type: 'SET_MESSAGE_STATUS', payload: { conversationId, messageId, status: 'seen' } });
    });

    socket.on('message_delivered', ({ messageId, conversationId, deliveredAt }) => {
      const s = stateRef.current;
      const message = s.messages?.[conversationId]?.find((m) => m.id === messageId);
      if (!message || message.senderId !== s.currentUser?.id) return;
      if (message.status === 'seen' || message.status === 'delivered') return;

      dispatch({ type: 'SET_MESSAGE_STATUS', payload: { conversationId, messageId, status: 'delivered' } });
    });

    socket.on('conversation_read', ({ conversationId, userId, readUntilMessageId, readAt }) => {
      const s = stateRef.current;
      if (!conversationId) return;

      // Case A: WE read this conversation on another device. Clear the unread badge here
      // so reading on one device clears it everywhere in real time.
      if (userId === s.currentUser?.id) {
        dispatch({ type: 'CONVERSATION_READ', payload: { conversationId, userId: String(userId) } });
        return;
      }

      // Case B: the OTHER participant read our messages — update read receipts to "seen".
      const messages = s.messages?.[conversationId] || [];
      const numericCutoff = readUntilMessageId != null ? Number(readUntilMessageId) : NaN;
      messages.forEach((message) => {
        if (message.senderId !== s.currentUser?.id) return;
        if (message.status === 'seen') return;
        // If a cutoff was provided, only mark messages up to that point; otherwise mark all.
        if (!Number.isNaN(numericCutoff)) {
          const messageIdNum = Number(message.id);
          if (Number.isNaN(messageIdNum) || messageIdNum > numericCutoff) return;
        }
        dispatch({ type: 'SET_MESSAGE_STATUS', payload: { conversationId, messageId: message.id, status: 'seen' } });
      });
    });

    // Handle pinned messages
    // removed: duplicate message_pinned/message_unpinned listeners — the originals above
    // (with the blocked-conversation guard) already handle these; the duplicates caused
    // PIN_MESSAGE/UNPIN_MESSAGE to dispatch twice and bypassed the blocked guard.

    // ═══════════════════════════════════════════════════════════════════════════════
    // PHASE 5: Cross-Device Draft Sync Listeners
    // ═══════════════════════════════════════════════════════════════════════════════

    // Another device of this user updated a draft — sync to current device
    socket.on('draft_updated', ({ conversationId, content, fileNames, timestamp }) => {
      const s = stateRef.current;
      const userId = s.currentUser?.id;
      // Only sync drafts from other devices (not self)
      // This listener receives broadcasts to user_${userId}
      dispatch({
        type: 'UPDATE_DRAFT',
        payload: { conversationId, content, fileNames: fileNames || [] },
      });
    });

    // Another device of this user cleared a draft
    socket.on('draft_cleared', ({ conversationId, userId }) => {
      dispatch({ type: 'CLEAR_DRAFT', payload: conversationId });
    });

    // Heartbeat: mobile OS can suspend the socket when the app is backgrounded.
    // Check every 30 s; if disconnected, kick Socket.IO's own reconnect loop.
    const heartbeatTimer = setInterval(() => {
      if (!getSocket()?.connected && stateRef.current.isAuthenticated) {
        getSocket()?.connect();
      }
    }, 30_000);

    // Foreground: when the user switches back to the app, reconnect immediately
    // rather than waiting for the next heartbeat tick.
    const handleVisibility = async () => {
      // Report on-screen state on EVERY change (visible or hidden) so presence flips correctly
      // when the user leaves or returns to the app.
      emitPresence();
      if (document.visibilityState !== 'visible') return;
      const sock = getSocket();
      if (!sock?.connected && stateRef.current.isAuthenticated) {
        sock?.connect();
      } else if (sock?.connected && loadedOnce.current) {
        // removed: per-focus /users/directory fetch — online status already syncs via the
        // user_status_change / device_status_change socket events. Fetching the whole
        // directory on every tab focus multiplied requests across tabs and tripped the
        // 100 req/min rate limiter (429). syncMissedMessages is one batched call, kept.
        syncMissedMessages();
        // The socket may have reconnected in the background (so the 'connect' refetch was
        // skipped while hidden). Refresh the open thread now that the user is looking at it,
        // so messages received while away appear. Throttled inside the helper.
        refetchActiveConversation();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      initialized.current = false;
      clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      // Remove all event listeners before disconnecting so no handler fires
      // on the stale socket instance if the component remounts quickly.
      getSocket()?.offAny();
      disconnectSocket();
    };
  }, [state.isAuthenticated, dispatch]);
}
