
"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import {
  Search, Plus, Settings, Shield, LogOut, FileText,
  MessageSquare, Trash2, Ban,
  CheckCheck, Search as SearchIcon, VolumeX, Volume2, Lock, Camera, X,
  Star, ChevronDown, Users, BookMarked,
} from 'lucide-react';
import { Avatar } from '../ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AppView } from '@/context/AppContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import Image from 'next/image';
import { BRAND_FAVICON_URL } from '@/lib/brand';
import { api, getApiBaseUrl, getToken } from '@/lib/api';
import { getSocket } from '@/services/socket';
import { logoutUser } from '@/services/auth';
import { setConversationBlockStatus, emitConversationMetadataChanged, muteConversation, unmuteConversation, markConversationUnread, markConversationRead } from '@/services/conversationMetadata';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import NotificationBell from './NotificationBell';

function getDmConvId(id1: string | undefined, id2: string) {
  const a = Number(id1 || 0);
  const b = Number(id2);
  return `dm_${Math.min(a, b)}_${Math.max(a, b)}`;
}

const GroupAvatar: React.FC<{ name: string; avatar?: string | null; hasLeft?: boolean }> = ({ name, avatar, hasLeft }) => {
  const isR2Key = typeof avatar === 'string' && avatar.startsWith('group-avatars/');
  const { url: resolvedUrl } = useSignedUrl(isR2Key ? avatar : undefined);
  if (resolvedUrl) {
    return <img src={resolvedUrl} alt={name} className={cn('h-10 w-10 rounded-xl object-cover shrink-0 shadow-sm transition-transform', !hasLeft && 'group-hover:scale-105')} />;
  }
  return (
    <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm font-bold text-white transition-transform', hasLeft ? 'bg-muted-foreground/40' : 'bg-secondary group-hover:scale-105')}>
      {name[0]}
    </div>
  );
};

const SectionHeader: React.FC<{
  icon: React.ReactNode;
  label: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
}> = ({ icon, label, count, open, onToggle, action }) => (
  <div className="flex items-center gap-1 px-0.5 pt-4 pb-1">
    <button
      onClick={onToggle}
      className="flex-1 flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors group/sh"
    >
      <span className="text-primary/50 shrink-0">{icon}</span>
      <span className="flex-1 text-left text-[10px] font-extrabold tracking-[0.15em] uppercase text-muted-foreground/80 group-hover/sh:text-foreground transition-colors">
        {label}
        {typeof count === 'number' && count > 0 && (
          <span className="ml-2 text-[9px] font-normal opacity-40">{count}</span>
        )}
      </span>
      <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground/50 shrink-0 transition-transform duration-200', !open && '-rotate-90')} />
    </button>
    {action}
  </div>
);

const ContextMenu: React.FC<{
  x: number;
  y: number;
  onClose: () => void;
  type: 'dm' | 'group';
  convId: string;
  convName: string;
  isFavourite: boolean;
  onToggleFavourite: () => void;
  hasHistory: boolean;
}> = ({ x, y, onClose, type, convId, convName, isFavourite, onToggleFavourite, hasHistory }) => {
  const { state, dispatch } = useAppContext();
  const meta = state.conversationMeta[convId] || { muted: false, pinned: false, unreadCount: 0, blocked: false };

  const handleBlockChange = async (shouldBlock: boolean) => {
    try {
      const success = await setConversationBlockStatus(convId, shouldBlock);
      if (!success) throw new Error();
      dispatch({ type: shouldBlock ? 'BLOCK_USER' : 'UNBLOCK_USER', payload: convId });
      emitConversationMetadataChanged(convId, shouldBlock ? 'block' : 'unblock', shouldBlock);
      dispatch({ type: 'ADD_TOAST', payload: { message: shouldBlock ? `${convName} blocked.` : `${convName} unblocked.`, type: 'success' } });
    } catch {
      dispatch({ type: 'ADD_TOAST', payload: { message: `Failed to ${shouldBlock ? 'block' : 'unblock'} ${convName}.`, type: 'error' } });
    }
  };

  const openBlockConfirm = (shouldBlock: boolean) => {
    dispatch({
      type: 'OPEN_MODAL',
      payload: {
        type: 'confirm',
        data: {
          title: shouldBlock ? `Block ${convName}?` : `Unblock ${convName}?`,
          body: shouldBlock
            ? `Blocking ${convName} will prevent them from sending new messages or notifications to you.`
            : `Unblocking ${convName} will restore normal messaging.`,
          confirmLabel: shouldBlock ? 'Block' : 'Unblock',
          confirmStyle: shouldBlock ? 'danger' : 'default',
          onConfirm: () => handleBlockChange(shouldBlock),
        },
      },
    });
    onClose();
  };

  const handleToggleMute = async () => {
    const wasMuted = meta.muted;
    if (wasMuted) {
      dispatch({ type: 'UNMUTE_CONVERSATION', payload: convId });
      onClose();
      try {
        await unmuteConversation(convId);
      } catch {
        dispatch({ type: 'MUTE_CONVERSATION', payload: { conversationId: convId, muteUntil: null } });
        dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to unmute. Try again.', type: 'error' } });
      }
    } else {
      dispatch({ type: 'MUTE_CONVERSATION', payload: { conversationId: convId, muteUntil: null } });
      dispatch({ type: 'ADD_TOAST', payload: { message: `${convName} muted.`, type: 'info' } });
      onClose();
      try {
        await muteConversation(convId, null);
      } catch {
        dispatch({ type: 'UNMUTE_CONVERSATION', payload: convId });
        dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to mute. Try again.', type: 'error' } });
      }
    }
  };

  const isSiteAdmin = state.currentUser?.role === 'admin';
  const menuW = 210;
  const menuH = hasHistory ? 380 : 120;
  const menuX = x + menuW > window.innerWidth ? x - menuW : x;
  const menuY = y + menuH > window.innerHeight ? y - menuH : y;

  return (
    <div
      className="fixed z-[var(--z-modal)] bg-card border border-border shadow-2xl py-1.5 min-w-[210px] animate-in zoom-in-95 duration-150 rounded-xl"
      style={{ left: menuX, top: menuY }}
      onClick={e => e.stopPropagation()}
    >
      <button
        onClick={() => { dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type, id: convId, name: convName, avatar: null } }); onClose(); }}
        className="w-full px-3 py-2 text-left text-xs font-semibold hover:bg-muted flex items-center gap-3 transition-colors"
      >
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        Open {type === 'group' ? 'Group' : 'Conversation'}
      </button>

      <div className="h-px bg-border my-1" />

      <button
        onClick={() => { onToggleFavourite(); onClose(); }}
        className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-muted flex items-center gap-3 transition-colors"
      >
        <Star className={cn('h-3.5 w-3.5', isFavourite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
        {isFavourite ? 'Remove from Favourites' : 'Add to Favourites'}
      </button>

      {hasHistory && (
        <>
          <div className="h-px bg-border my-1" />

          <button
            onClick={handleToggleMute}
            className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-muted flex items-center gap-3 transition-colors"
          >
            {meta.muted ? <Volume2 className="h-3.5 w-3.5 text-primary" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
            {meta.muted ? 'Unmute Notifications' : 'Mute Notifications'}
          </button>

          <div className="h-px bg-border my-1" />

          <button
            onClick={() => { dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type, id: convId, name: convName, avatar: null } }); dispatch({ type: 'SET_RIGHT_PANEL_TAB', payload: 'files' }); dispatch({ type: 'TOGGLE_RIGHT_PANEL', payload: true }); onClose(); }}
            className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-muted flex items-center gap-3 transition-colors"
          >
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            View Shared Files
          </button>

          <button
            onClick={() => { dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type, id: convId, name: convName, avatar: null } }); dispatch({ type: 'SET_CHAT_SEARCH', payload: { active: true, query: '' } }); onClose(); }}
            className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-muted flex items-center gap-3 transition-colors"
          >
            <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
            Search in Conversation
          </button>

          <div className="h-px bg-border my-1" />

          <button
            onClick={() => {
              const markUnread = !(meta.unreadCount > 0 || meta.isManuallyUnread);
              dispatch({ type: markUnread ? 'MARK_CONVERSATION_UNREAD' : 'MARK_CONVERSATION_READ', payload: convId });
              if (markUnread) { markConversationUnread(convId).catch(() => dispatch({ type: 'MARK_CONVERSATION_READ', payload: convId })); }
              else { markConversationRead(convId).catch(() => dispatch({ type: 'MARK_CONVERSATION_UNREAD', payload: convId })); }
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-muted flex items-center gap-3 transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />
            Mark as {(meta.unreadCount > 0 || meta.isManuallyUnread) ? 'Read' : 'Unread'}
          </button>

          {type === 'dm' ? (
            <>
              <div className="h-px bg-border my-1" />
              <button onClick={() => openBlockConfirm(!meta.blocked)} className="w-full px-3 py-2 text-left text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-3 transition-colors">
                <Ban className="h-3.5 w-3.5" />
                {meta.blocked ? 'Unblock User' : 'Block User'}
              </button>
              {isSiteAdmin && (
                <button onClick={() => { dispatch({ type: 'ADD_TOAST', payload: { message: 'Use Admin Control to delete conversations', type: 'info' } }); onClose(); }} className="w-full px-3 py-2 text-left text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-3 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Conversation
                </button>
              )}
            </>
          ) : (
            <>
              <div className="h-px bg-border my-1" />
              <button onClick={() => { dispatch({ type: 'OPEN_MODAL', payload: { type: 'leaveGroup', data: { group: state.groups.find(g => g.id === convId) } } }); onClose(); }} className="w-full px-3 py-2 text-left text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-3 transition-colors">
                <LogOut className="h-3.5 w-3.5" />
                Leave Group
              </button>
              {isSiteAdmin && (
                <button
                  onClick={() => {
                    dispatch({
                      type: 'OPEN_MODAL',
                      payload: {
                        type: 'confirm',
                        data: {
                          title: 'Delete Group',
                          body: `Permanently delete "${convName}"?`,
                          confirmLabel: 'Delete Permanently',
                          confirmStyle: 'danger',
                          onConfirm: async () => {
                            try { await api.delete(`/groups/${convId}`); dispatch({ type: 'DELETE_GROUP', payload: convId }); }
                            catch { dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to delete group', type: 'error' } }); }
                          },
                        },
                      },
                    });
                    onClose();
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-3 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Group
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

const Sidebar: React.FC<{
  onViewChange: (view: AppView) => void;
  onCreateGroup: () => void;
  activeView: AppView;
  onConversationSelect?: () => void;
}> = ({ onViewChange, onCreateGroup, activeView, onConversationSelect }) => {
  const { state, dispatch } = useAppContext();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string; name: string; type: 'dm' | 'group'; hasHistory: boolean } | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [activeTab, setActiveTab] = useState<'chats' | 'groups'>('chats');
  const [openSections, setOpenSections] = useState({ favourites: true, chats: true, users: true, groups: true });
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPos = useRef<{ x: number; y: number } | null>(null);

  const currentUserId = String(state.currentUser?.id || '');

  const isFavourite = (convId: string) => !!(state.conversationMeta[convId]?.pinned);

  const toggleFavourite = async (convId: string) => {
    const wasPinned = isFavourite(convId);
    // Optimistic update for instant UI feedback
    dispatch({ type: wasPinned ? 'UNPIN_CONVERSATION' : 'PIN_CONVERSATION', payload: convId });
    try {
      await api.post(`/conversation-metadata/${encodeURIComponent(convId)}/${wasPinned ? 'unpin' : 'pin'}`, {});
    } catch {
      // Revert on failure
      dispatch({ type: wasPinned ? 'PIN_CONVERSATION' : 'UNPIN_CONVERSATION', payload: convId });
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to update favourite. Try again.', type: 'error' } });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const token = getToken();
      const res = await fetch(`${getApiBaseUrl()}/users/me/avatar`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      dispatch({ type: 'UPDATE_USER', payload: { ...state.currentUser!, avatar: data.avatarKey } });
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Profile picture updated', type: 'success' } });
    } catch {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to update profile picture', type: 'error' } });
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  // --- Compute lists ---

  const otherActiveUsers = useMemo(() =>
    state.users.filter(u => u.id !== currentUserId && u.isActive !== false),
    [state.users, currentUserId]);

  const byRecency = (a: string, b: string) => {
    const aT = state.conversationMeta[a]?.lastMessage?.timestamp;
    const bT = state.conversationMeta[b]?.lastMessage?.timestamp;
    // Date.parse is more robust than new Date().getTime() — handles MySQL "YYYY-MM-DD HH:MM:SS"
    // format that returns NaN in Firefox/Safari with the Date constructor.
    const aMs = aT ? (Date.parse(aT) || 0) : 0;
    const bMs = bT ? (Date.parse(bT) || 0) : 0;
    const diff = bMs - aMs;
    return diff !== 0 ? diff : a.localeCompare(b);
  };

  // Favourites section: any pinned DM or pinned group
  const favouriteItems = useMemo(() => {
    const favDms = otherActiveUsers
      .filter(u => isFavourite(getDmConvId(currentUserId, u.id)))
      .map(u => ({ kind: 'dm' as const, convId: getDmConvId(currentUserId, u.id), user: u }));
    const favGroups = state.groups
      .filter(g => isFavourite(g.id) && (g.members.includes(currentUserId) || !!state.conversationMeta[g.id]?.leftAt))
      .map(g => ({ kind: 'group' as const, convId: g.id, group: g }));
    return [...favDms, ...favGroups].sort((a, b) => byRecency(a.convId, b.convId));
  }, [otherActiveUsers, state.groups, state.conversationMeta, currentUserId]);

  // Chats section: DMs where user has interacted (chatTracked) OR has a lastMessage, NOT pinned
  const chatItems = useMemo(() =>
    otherActiveUsers
      .filter(u => {
        const convId = getDmConvId(currentUserId, u.id);
        const meta = state.conversationMeta[convId];
        return (meta?.chatTracked || !!meta?.lastMessage) && !meta?.pinned;
      })
      .map(u => ({ kind: 'dm' as const, convId: getDmConvId(currentUserId, u.id), user: u }))
      .sort((a, b) => byRecency(a.convId, b.convId)),
    [otherActiveUsers, state.conversationMeta, currentUserId]);

  // All groups (for Groups tab) — favourited groups sort to top
  const sortedGroups = useMemo(() =>
    state.groups
      .filter(g => g.members.includes(currentUserId) || !!state.conversationMeta[g.id]?.leftAt)
      .sort((a, b) => {
        const aFav = isFavourite(a.id), bFav = isFavourite(b.id);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return byRecency(a.id, b.id);
      }),
    [state.groups, state.conversationMeta, currentUserId]);

  // Users section: no interaction yet (no chatTracked, no lastMessage) and NOT pinned
  const userItems = useMemo(() =>
    otherActiveUsers
      .filter(u => {
        const convId = getDmConvId(currentUserId, u.id);
        const meta = state.conversationMeta[convId];
        return !meta?.chatTracked && !meta?.lastMessage && !meta?.pinned;
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    [otherActiveUsers, state.conversationMeta, currentUserId]);

  // Combined Chats: DMs with history + active groups, sorted by recency.
  // Left groups are appended at the bottom so they don't disrupt the recency order.
  // Flat single-dep useMemo — avoids stale closures from the chatItems/sortedGroups chain.
  const combinedChats = useMemo(() => {
    const getMs = (convId: string): number => {
      const ts = state.conversationMeta[convId]?.lastMessage?.timestamp;
      if (!ts) return 0;
      const ms = Date.parse(ts);
      return isNaN(ms) ? 0 : ms;
    };
    const dmItems = otherActiveUsers
      .filter(u => {
        const convId = getDmConvId(currentUserId, u.id);
        const meta = state.conversationMeta[convId];
        return (meta?.chatTracked || !!meta?.lastMessage) && !meta?.pinned;
      })
      .map(u => ({ kind: 'dm' as const, convId: getDmConvId(currentUserId, u.id), user: u }));
    const activeGroupItems = state.groups
      .filter(g => (g.members.includes(currentUserId) || !!state.conversationMeta[g.id]?.leftAt) && !state.conversationMeta[g.id]?.leftAt && !state.conversationMeta[g.id]?.pinned)
      .map(g => ({ kind: 'group' as const, convId: g.id, group: g }));
    const leftGroupItems = state.groups
      .filter(g => !!state.conversationMeta[g.id]?.leftAt)
      .map(g => ({ kind: 'group' as const, convId: g.id, group: g }));
    const sorted = [...dmItems, ...activeGroupItems].sort((a, b) => {
      const diff = getMs(b.convId) - getMs(a.convId);
      return diff !== 0 ? diff : a.convId.localeCompare(b.convId);
    });
    return [...sorted, ...leftGroupItems];
  }, [otherActiveUsers, state.groups, state.conversationMeta, currentUserId]);

  // Mobile search results (People + Groups)
  const mobileSearchResults = useMemo(() => {
    if (mobileSearchQuery.length < 1) return null;
    const mq = mobileSearchQuery.toLowerCase();
    return {
      people: state.users.filter(u => u.id !== currentUserId && u.name.toLowerCase().includes(mq)),
      groups: state.groups.filter(g => g.members.includes(currentUserId) && g.name.toLowerCase().includes(mq)),
    };
  }, [mobileSearchQuery, state.users, state.groups, currentUserId]);

  const handleMobileSearchSelect = (type: 'dm' | 'group', item: any) => {
    const convId = type === 'dm' ? getDmConvId(currentUserId, item.id) : item.id;
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type, id: convId, name: item.name, avatar: item.avatar || null } });
    if (type === 'dm') getSocket()?.emit('join_dm', { otherUserId: item.id });
    setMobileSearchOpen(false);
    setMobileSearchQuery('');
    onConversationSelect?.();
  };

  // Context menu
  const openCtxMenu = (e: React.MouseEvent, id: string, name: string, type: 'dm' | 'group', hasHistory: boolean) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, id, name, type, hasHistory });
  };

  // Long-press (mobile)
  const startLongPress = (id: string, name: string, type: 'dm' | 'group', hasHistory: boolean) =>
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      longPressPos.current = { x: e.clientX, y: e.clientY };
      longPressTimer.current = setTimeout(() => {
        if (longPressPos.current) {
          setCtxMenu({ x: longPressPos.current.x, y: longPressPos.current.y, id, name, type, hasHistory });
        }
      }, 600);
    };

  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    longPressPos.current = null;
  };

  const onLongPressMove = (e: React.PointerEvent) => {
    if (!longPressPos.current) return;
    if (Math.abs(e.clientX - longPressPos.current.x) > 8 || Math.abs(e.clientY - longPressPos.current.y) > 8) cancelLongPress();
  };

  // Self-DM ("You" chat) — same user on both sides of the conv ID
  const selfConvId = getDmConvId(currentUserId, currentUserId);

  // --- Item renderers ---

  const renderYouItem = () => {
    const meta = state.conversationMeta[selfConvId] || { pinned: false, muted: false, unreadCount: 0 };
    const isActive = state.activeConversation?.id === selfConvId;
    return (
      <button
        onClick={() => {
          dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: {
            type: 'dm',
            id: selfConvId,
            name: 'You',
            avatar: state.currentUser?.avatar || null,
          }});
          getSocket()?.emit('join_dm', { otherUserId: currentUserId });
          onConversationSelect?.();
        }}
        className={cn(
          'w-full flex items-center gap-3 p-2.5 rounded-xl transition-all group border relative',
          isActive
            ? 'bg-primary/5 text-primary border-primary/20'
            : 'hover:bg-muted text-muted-foreground border-transparent hover:border-border/40'
        )}
      >
        <div className="relative shrink-0">
          <Avatar name={state.currentUser?.name || 'You'} src={state.currentUser?.avatar} size="md" showStatus={false} />
          <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1 shadow border-2 border-card">
            <BookMarked className="h-2 w-2 text-white" />
          </div>
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn('text-sm font-bold truncate group-hover:text-primary transition-colors', isActive ? 'text-primary' : 'text-foreground')}>
              You
            </p>
            <span className="shrink-0 text-[8px] font-black uppercase tracking-widest bg-primary/10 text-primary px-1.5 py-0.5 rounded-full border border-primary/20">
              YOU
            </span>
          </div>
          {meta.lastMessage ? (
            <p className={cn('text-[11px] truncate', meta.unreadCount > 0 ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
              {meta.lastMessage.content || '📎 Attachment'}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground/70 truncate font-semibold">Personal notes & saved items</p>
          )}
        </div>
        {meta.unreadCount > 0 && (
          <Badge className="h-5 px-1.5 bg-primary text-white font-bold rounded-lg shrink-0">
            {meta.unreadCount}
          </Badge>
        )}
      </button>
    );
  };

  const renderDmItem = (item: { kind: 'dm'; convId: string; user: any }) => {
    const { convId, user } = item;
    const meta = state.conversationMeta[convId] || { pinned: false, muted: false, unreadCount: 0 };
    const isActive = state.activeConversation?.id === convId;
    const isDeactivated = user.isActive === false;
    return (
      <button
        key={convId}
        onContextMenu={e => !isDeactivated && openCtxMenu(e, convId, user.name, 'dm', true)}
        onPointerDown={!isDeactivated ? startLongPress(convId, user.name, 'dm', true) : undefined}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerMove={onLongPressMove}
        onClick={() => {
          dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type: 'dm', id: convId, name: user.name, avatar: user.avatar } });
          if (!isDeactivated) getSocket()?.emit('join_dm', { otherUserId: user.id });
          onConversationSelect?.();
        }}
        className={cn(
          'w-full flex items-center gap-3 p-2.5 rounded-xl transition-all group border border-transparent relative',
          isDeactivated ? 'opacity-50 cursor-default' : isActive ? 'bg-primary/5 text-primary border-primary/10' : 'hover:bg-muted text-muted-foreground'
        )}
      >
        <div className="relative">
          <Avatar name={user.name} src={user.avatar} size="md" status={isDeactivated ? undefined : user.status} showStatus={!isDeactivated} className={isDeactivated ? 'grayscale' : ''} />
          {meta.muted && !isDeactivated && (
            <div className="absolute -bottom-1 -right-1 bg-card rounded-full p-0.5 shadow-sm border border-border">
              <VolumeX className="h-2.5 w-2.5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-1">
            <p className={cn('text-sm truncate transition-colors', !isActive && meta.unreadCount > 0 && !meta.muted ? 'font-bold text-foreground group-hover:text-primary' : 'font-semibold group-hover:text-primary')}>{user.name}</p>
            {meta.blocked && !isDeactivated && <Ban className="h-2.5 w-2.5 text-destructive shrink-0" />}
          </div>
          {isDeactivated ? (
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Deactivated</p>
          ) : meta.lastMessage ? (
            <p className={cn('text-[11px] truncate', !isActive && meta.unreadCount > 0 && !meta.muted ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
              {String(meta.lastMessage.senderId) === currentUserId ? 'You: ' : ''}{meta.lastMessage.content || '📎 Attachment'}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground truncate font-bold uppercase tracking-tighter">{user.department}</p>
          )}
        </div>
        {!isDeactivated && meta.unreadCount > 0 && (
          <Badge className={cn('h-5 px-1.5 font-bold rounded-lg', meta.muted ? 'bg-muted-foreground/30 text-white' : 'bg-secondary text-white')}>
            {meta.unreadCount}
          </Badge>
        )}
      </button>
    );
  };

  const renderGroupItem = (item: { kind: 'group'; convId: string; group: any }) => {
    const { group } = item;
    const meta = state.conversationMeta[group.id] || { pinned: false, muted: false, unreadCount: 0, hasUnreadMention: false };
    const isActive = state.activeConversation?.id === group.id;
    const isAdminOnly = group.settings?.messagePermission === 'admin_only';
    const hasLeft = !!meta.leftAt;
    return (
      <button
        key={group.id}
        onContextMenu={e => !hasLeft && openCtxMenu(e, group.id, group.name, 'group', true)}
        onPointerDown={!hasLeft ? startLongPress(group.id, group.name, 'group', true) : undefined}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerMove={onLongPressMove}
        onClick={() => { dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type: 'group', id: group.id, name: group.name, avatar: group.avatar } }); onConversationSelect?.(); }}
        className={cn(
          'w-full flex items-center gap-3 p-2.5 rounded-xl transition-all group border border-transparent relative',
          hasLeft ? 'opacity-50' : isActive ? 'bg-primary/5 text-primary border-primary/10' : 'hover:bg-muted text-muted-foreground'
        )}
      >
        <div className="relative">
          <GroupAvatar name={group.name} avatar={group.avatar} hasLeft={hasLeft} />
          {meta.muted && !hasLeft && (
            <div className="absolute -bottom-1 -right-1 bg-card rounded-full p-0.5 shadow-sm border border-border">
              <VolumeX className="h-2.5 w-2.5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn('text-sm truncate transition-colors', hasLeft ? 'text-muted-foreground font-semibold' : !isActive && (meta.unreadCount > 0 || meta.hasUnreadMention) && !meta.muted ? 'font-bold text-foreground group-hover:text-primary' : 'font-semibold group-hover:text-primary')}>
              {group.name}
            </p>
            {isAdminOnly && !hasLeft && <Lock className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />}
            {hasLeft && <LogOut className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />}
          </div>
          {hasLeft ? (
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">You left this group</p>
          ) : meta.lastMessage ? (
            <p className={cn('text-[11px] truncate', !isActive && (meta.unreadCount > 0 || meta.hasUnreadMention) && !meta.muted ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
              {meta.lastMessage.senderId === state.currentUser?.id
                ? 'You: '
                : `${state.users.find(u => u.id === meta.lastMessage!.senderId)?.name?.split(' ')[0] || ''}: `
              }{meta.lastMessage.content || '📎 Attachment'}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground truncate font-bold uppercase tracking-tighter">{group.members.length} members</p>
          )}
        </div>
        {hasLeft ? (
          <div
            role="button"
            tabIndex={0}
            className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
            onClick={async e => {
              e.stopPropagation();
              try { await api.delete(`/groups/${group.id}/leave/dismiss`); } catch { /* ignore */ }
              dispatch({ type: 'DISMISS_LEFT_GROUP', payload: group.id });
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); e.stopPropagation();
                api.delete(`/groups/${group.id}/leave/dismiss`).catch(() => {});
                dispatch({ type: 'DISMISS_LEFT_GROUP', payload: group.id });
              }
            }}
          >
            <X className="h-3.5 w-3.5" />
          </div>
        ) : meta.hasUnreadMention ? (
          <Badge className="h-5 px-1.5 bg-secondary text-white font-bold rounded-lg animate-pulse">@</Badge>
        ) : meta.unreadCount > 0 ? (
          <Badge className={cn('h-5 px-1.5 font-bold rounded-lg', meta.muted ? 'bg-muted-foreground/30 text-white' : 'bg-muted-foreground text-white')}>
            {meta.unreadCount}
          </Badge>
        ) : null}
      </button>
    );
  };

  const renderUserItem = (user: any) => {
    const convId = getDmConvId(currentUserId, user.id);
    const isActive = state.activeConversation?.id === convId;
    return (
      <button
        key={user.id}
        onContextMenu={e => openCtxMenu(e, convId, user.name, 'dm', false)}
        onPointerDown={startLongPress(convId, user.name, 'dm', false)}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerMove={onLongPressMove}
        onClick={() => {
          dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type: 'dm', id: convId, name: user.name, avatar: user.avatar } });
          getSocket()?.emit('join_dm', { otherUserId: user.id });
          onConversationSelect?.();
        }}
        className={cn(
          'w-full flex items-center gap-3 p-2.5 rounded-xl transition-all group border border-transparent',
          isActive ? 'bg-primary/5 text-primary border-primary/10' : 'hover:bg-muted text-muted-foreground'
        )}
      >
        <Avatar name={user.name} src={user.avatar} size="md" status={user.status} showStatus />
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{user.name}</p>
          <p className="text-[10px] text-muted-foreground truncate font-bold uppercase tracking-tighter">{user.department || 'Team Member'}</p>
        </div>
      </button>
    );
  };

  return (
    <div className="w-full h-full bg-card text-card-foreground flex flex-col relative z-20 shadow-xl overflow-hidden">

      {/* Header */}
      <div className="p-5 border-b border-border bg-card/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-2xl relative overflow-hidden shrink-0 bg-transparent">
            <Image src={BRAND_FAVICON_URL} alt="Mawby Teams icon" fill sizes="40px" className="object-contain p-2" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm font-headline truncate tracking-tight">Mawby Teams</span>
            {state.currentUser?.role === 'admin' && (
              <Badge variant="default" className="w-fit text-[9px] h-3.5 bg-primary px-1 font-bold rounded-sm mt-0.5">WORKSPACE ADMIN</Badge>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <NotificationBell className="md:hidden" />
            <button
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border bg-muted/20 shrink-0">
        <button
          onClick={() => setActiveTab('chats')}
          className={cn('flex-1 py-3 text-[10px] font-bold tracking-[0.15em] transition-all relative', activeTab === 'chats' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
        >
          CHATS
          {activeTab === 'chats' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary" />}
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={cn('flex-1 py-3 text-[10px] font-bold tracking-[0.15em] transition-all relative', activeTab === 'groups' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
        >
          GROUPS
          {activeTab === 'groups' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary" />}
        </button>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-2.5 pb-3 scrollbar-chat bg-card/30">

        {activeTab === 'chats' ? (
          <>
            {/* 📓 You — personal notepad, always pinned at the very top */}
            <div className="pt-2 pb-1">
              {renderYouItem()}
            </div>
            <div className="h-px bg-border/40 mx-1 mb-1" />

            {/* ⭐ Favourites */}
            <SectionHeader
              icon={<Star className="h-3.5 w-3.5" />}
              label="Favourites"
              count={favouriteItems.length}
              open={openSections.favourites}
              onToggle={() => setOpenSections(s => ({ ...s, favourites: !s.favourites }))}
            />
            {openSections.favourites && (
              <div className="space-y-0.5">
                {favouriteItems.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/40 text-center py-3 italic px-2">No favourites yet — right-click any chat to add one</p>
                ) : (
                  favouriteItems.map(item => item.kind === 'dm' ? renderDmItem(item) : renderGroupItem(item))
                )}
              </div>
            )}

            {/* 💬 Chats (DMs + Groups) */}
            <SectionHeader
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label="Chats"
              count={combinedChats.length}
              open={openSections.chats}
              onToggle={() => setOpenSections(s => ({ ...s, chats: !s.chats }))}
            />
            {openSections.chats && (
              <div className="space-y-0.5">
                {combinedChats.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/40 text-center py-3 italic px-2">
                    No conversations yet
                  </p>
                ) : (
                  combinedChats.map(item =>
                    item.kind === 'dm' ? renderDmItem(item) : renderGroupItem(item)
                  )
                )}
              </div>
            )}

            {/* 👥 Users */}
            <SectionHeader
              icon={<Users className="h-3.5 w-3.5" />}
              label="Users"
              count={userItems.length}
              open={openSections.users}
              onToggle={() => setOpenSections(s => ({ ...s, users: !s.users }))}
            />
            {openSections.users && (
              <div className="space-y-0.5">
                {userItems.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/40 text-center py-3 italic px-2">
                    Everyone has been messaged
                  </p>
                ) : (
                  userItems.map(user => renderUserItem(user))
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {/* ➕ New Group button */}
            <button
              onClick={onCreateGroup}
              className="w-full mt-3 mb-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-dashed border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 transition-all font-bold text-sm"
            >
              <Plus className="h-4 w-4" />
              New Group
            </button>

            {/* Groups list */}
            <div className="space-y-0.5 mt-1">
              {sortedGroups.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/40 text-center py-6 italic px-2">
                  No groups yet — create one!
                </p>
              ) : (
                sortedGroups.map(group => renderGroupItem({ kind: 'group', convId: group.id, group }))
              )}
            </div>
          </>
        )}

      </div>

      {/* Bottom bar */}
      <div className="p-4 border-t border-border space-y-2 bg-muted/10">
        {state.currentUser?.role === 'admin' && (
          <button
            onClick={() => onViewChange('admin')}
            className={cn('hidden md:flex w-full items-center gap-3 p-2.5 rounded-xl transition-all shadow-md font-bold', activeView === 'admin' ? 'bg-primary text-white' : 'bg-card border border-border hover:bg-muted text-muted-foreground')}
          >
            <Shield className="h-4 w-4" />
            <span className="text-[13px] uppercase tracking-wider">Admin Control</span>
          </button>
        )}
        <div className="flex items-center justify-between p-2.5 rounded-2xl bg-card border border-border shadow-xl ring-1 ring-black/5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative group/avatar cursor-pointer shrink-0" onClick={() => avatarInputRef.current?.click()} title="Change profile picture">
              <Avatar name={state.currentUser?.name || ''} src={state.currentUser?.avatar} size="sm" status="online" showStatus />
              <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity z-10">
                {uploadingAvatar
                  ? <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera className="h-3 w-3 text-white" />
                }
              </div>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{state.currentUser?.name}</p>
              <p className="text-[9px] text-green-600 font-bold uppercase tracking-widest">Active Now</p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => onViewChange('settings')} className={cn('p-2 rounded-lg transition-all', activeView === 'settings' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted')}>
                  <Settings className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Preferences</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    dispatch({
                      type: 'OPEN_MODAL',
                      payload: {
                        type: 'confirm',
                        data: {
                          title: 'Sign Out',
                          body: 'Are you sure you want to sign out? You will need to sign back in to access your messages.',
                          confirmLabel: 'Sign Out',
                          confirmStyle: 'danger',
                          onConfirm: async () => {
                            try { await logoutUser(); } catch (e) { console.error('Logout failed:', e); } finally { dispatch({ type: 'LOGOUT' }); }
                          },
                        },
                      },
                    });
                  }}
                  className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-lg text-muted-foreground transition-all"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Sign Out</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Mobile search overlay — full-screen within sidebar, slide in from top */}
      {mobileSearchOpen && (
        <div className="absolute inset-0 z-50 bg-card flex flex-col md:hidden animate-in slide-in-from-top-2 duration-200">
          {/* Search input row */}
          <div className="p-4 border-b border-border bg-card/95 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <input
                  ref={mobileSearchRef}
                  autoFocus
                  type="text"
                  placeholder="Search team members and group spaces"
                  className="w-full pl-9 pr-4 py-2.5 bg-muted/40 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
                  value={mobileSearchQuery}
                  onChange={e => setMobileSearchQuery(e.target.value)}
                />
              </div>
              <button
                onClick={() => { setMobileSearchOpen(false); setMobileSearchQuery(''); }}
                className="shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Results area */}
          <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-chat">
            {mobileSearchQuery.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full pb-16 opacity-30">
                <Search className="h-12 w-12 mb-3 text-muted-foreground" />
                <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Search people or groups</p>
              </div>
            ) : !mobileSearchResults || (mobileSearchResults.people.length === 0 && mobileSearchResults.groups.length === 0) ? (
              <div className="flex flex-col items-center justify-center h-full pb-16 opacity-30">
                <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">No results found</p>
              </div>
            ) : (
              <div className="space-y-5">
                {mobileSearchResults.people.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">People</h4>
                    <div className="space-y-0.5">
                      {mobileSearchResults.people.map(u => (
                        <button
                          key={u.id}
                          onClick={() => u.isActive !== false && handleMobileSearchSelect('dm', u)}
                          className={cn(
                            'w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left',
                            u.isActive === false ? 'opacity-50 cursor-default' : 'hover:bg-muted'
                          )}
                        >
                          <Avatar name={u.name} src={u.avatar} size="md" status={u.isActive === false ? undefined : u.status} showStatus={u.isActive !== false} className={u.isActive === false ? 'grayscale' : ''} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{u.name}</p>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">{u.department}</p>
                          </div>
                          {u.isActive === false && (
                            <span className="shrink-0 text-[9px] font-bold text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded">Inactive</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {mobileSearchResults.groups.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Groups</h4>
                    <div className="space-y-0.5">
                      {mobileSearchResults.groups.map(g => (
                        <button
                          key={g.id}
                          onClick={() => handleMobileSearchSelect('group', g)}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted transition-all text-left"
                        >
                          <GroupAvatar name={g.name} avatar={g.avatar} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{g.name}</p>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">{g.members.length} members</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context menu backdrop + menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[49]" onPointerDown={() => setCtxMenu(null)} />
          <ContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            convId={ctxMenu.id}
            convName={ctxMenu.name}
            type={ctxMenu.type}
            onClose={() => setCtxMenu(null)}
            isFavourite={isFavourite(ctxMenu.id)}
            onToggleFavourite={() => toggleFavourite(ctxMenu.id)}
            hasHistory={ctxMenu.hasHistory}
          />
        </>
      )}
    </div>
  );
};

export default Sidebar;
