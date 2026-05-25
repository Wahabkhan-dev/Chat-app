
"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext, ActiveConversation } from '@/context/AppContext';
import {
  Search, Plus, Settings, Shield, LogOut, FileText,
  MessageSquare, Pin, BellOff, Trash2, Ban,
  CheckCheck, Search as SearchIcon, VolumeX, Volume2, Lock, ShieldAlert, Camera, X
} from 'lucide-react';
import { Avatar } from '../ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AppView } from '@/context/AppContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import Image from 'next/image';
import { BRAND_FAVICON_URL } from '@/lib/brand';
import { api } from '@/lib/api';
import { getSocket } from '@/services/socket';
import { logoutUser } from '@/services/auth';
import { setConversationBlockStatus, emitConversationMetadataChanged } from '@/services/conversationMetadata';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import NotificationBell from './NotificationBell';

function getDmConvId(id1: string | undefined, id2: string) {
  const a = Number(id1 || 0);
  const b = Number(id2);
  return `dm_${Math.min(a, b)}_${Math.max(a, b)}`;
}

const GroupAvatar: React.FC<{ name: string; avatar?: string | null; hasLeft?: boolean; isActive?: boolean }> = ({ name, avatar, hasLeft, isActive }) => {
  const isR2Key = typeof avatar === 'string' && avatar.startsWith('group-avatars/');
  const { url: resolvedUrl } = useSignedUrl(isR2Key ? avatar : undefined);

  if (resolvedUrl) {
    return (
      <img
        src={resolvedUrl}
        alt={name}
        className={cn('h-10 w-10 rounded-xl object-cover shrink-0 shadow-sm transition-transform', !hasLeft && 'group-hover:scale-105')}
      />
    );
  }

  return (
    <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm font-bold text-white transition-transform', hasLeft ? 'bg-muted-foreground/40' : 'bg-secondary group-hover:scale-105')}>
      {name[0]}
    </div>
  );
};

const ContextMenu: React.FC<{ 
  x: number; 
  y: number; 
  onClose: () => void; 
  type: 'dm' | 'group';
  convId: string;
  convName: string;
}> = ({ x, y, onClose, type, convId, convName }) => {
  const { state, dispatch } = useAppContext();
  const meta = state.conversationMeta[convId] || { muted: false, pinned: false, unreadCount: 0, blocked: false };
  const [showMuteSubmenu, setShowMuteSubmenu] = useState(false);

  const handleBlockChange = async (shouldBlock: boolean) => {
    try {
      const success = await setConversationBlockStatus(convId, shouldBlock);
      if (!success) throw new Error('Unable to update block status');

      dispatch({ type: shouldBlock ? 'BLOCK_USER' : 'UNBLOCK_USER', payload: convId });
      emitConversationMetadataChanged(convId, shouldBlock ? 'block' : 'unblock', shouldBlock);
      dispatch({ type: 'ADD_TOAST', payload: { message: shouldBlock ? `${convName} has been blocked.` : `${convName} is now unblocked.`, type: 'success' } });
    } catch (error) {
      console.error('[Sidebar] Block state update failed:', error);
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
            ? `Blocking ${convName} will prevent them from sending new direct messages or notifications to you.`
            : `Unblocking ${convName} will restore normal direct messaging and notifications from them.`,
          confirmLabel: shouldBlock ? 'Block' : 'Unblock',
          confirmStyle: shouldBlock ? 'danger' : 'default',
          onConfirm: () => handleBlockChange(shouldBlock),
        },
      },
    });
    onClose();
  };

  const handleMute = (hours: number | 'forever') => {
    const muteUntil = hours === 'forever' ? null : new Date(Date.now() + hours * 3600000).toISOString();
    dispatch({ type: 'MUTE_CONVERSATION', payload: { conversationId: convId, muteUntil } });
    dispatch({
      type: 'ADD_TOAST',
      payload: {
        message: `🔇 ${convName} muted ${hours === 'forever' ? 'until you turn it back on' : `for ${hours} hour${hours > 1 ? 's' : ''}`}`,
        type: 'info',
      },
    });
    onClose();
  };

  const isGroupCreator = type === 'group' && state.groups.find(g => g.id === convId)?.createdBy === state.currentUser?.id;
  const isSiteAdmin = state.currentUser?.role === 'admin';

  // Adjust menu position to stay within viewport
  const menuX = x + 200 > window.innerWidth ? x - 200 : x;
  const menuY = y + 300 > window.innerHeight ? y - 300 : y;

  return (
    <div 
      className="fixed z-[var(--z-modal)] bg-card border border-border shadow-2xl py-1.5 min-w-[200px] animate-in zoom-in-95 duration-150 rounded-xl"
      style={{ left: menuX, top: menuY }}
      onClick={e => e.stopPropagation()}
    >
      <button onClick={() => { dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type, id: convId, name: convName, avatar: null } }); onClose(); }} className="w-full px-3 py-2 text-left text-xs font-semibold hover:bg-muted flex items-center gap-3 transition-colors">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        Open {type === 'group' ? 'Group' : 'Conversation'}
      </button>
      
      <div className="h-px bg-border my-1" />

      <button onClick={() => { dispatch({ type: meta.pinned ? 'UNPIN_CONVERSATION' : 'PIN_CONVERSATION', payload: convId }); onClose(); }} className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-muted flex items-center justify-between transition-colors">
        <div className="flex items-center gap-3">
          <Pin className="h-3.5 w-3.5 text-muted-foreground" />
          {meta.pinned ? 'Unpin' : 'Pin Conversation'}
        </div>
        {!meta.pinned && state.conversationMeta && Object.values(state.conversationMeta).filter(m => m.pinned).length >= 5 && (
           <span className="text-[10px] text-destructive font-bold">MAX 5</span>
        )}
      </button>

      <div className="relative group/mute">
        <button 
          onMouseEnter={() => setShowMuteSubmenu(true)}
          onClick={() => meta.muted && dispatch({ type: 'UNMUTE_CONVERSATION', payload: convId })}
          className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-muted flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-3">
            {meta.muted ? <Volume2 className="h-3.5 w-3.5 text-primary" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
            {meta.muted ? 'Unmute Notifications' : 'Mute Notifications'}
          </div>
          {!meta.muted && <span className="text-[10px] text-muted-foreground">â€º</span>}
        </button>

        {showMuteSubmenu && !meta.muted && (
          <div className="absolute left-full top-0 ml-1 bg-card border border-border shadow-2xl py-1.5 min-w-[160px] rounded-xl animate-in fade-in slide-in-from-left-2">
            {[1, 8, 24].map(h => (
              <button key={h} onClick={() => handleMute(h)} className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-muted transition-colors">For {h} hour{h > 1 ? 's' : ''}</button>
            ))}
            <button onClick={() => handleMute('forever')} className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-muted transition-colors">Until I turn it back on</button>
          </div>
        )}
      </div>

      <div className="h-px bg-border my-1" />

      <button onClick={() => { dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type, id: convId, name: convName, avatar: null } }); dispatch({ type: 'SET_RIGHT_PANEL_TAB', payload: 'files' }); dispatch({ type: 'TOGGLE_RIGHT_PANEL', payload: true }); onClose(); }} className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-muted flex items-center gap-3 transition-colors">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        View Shared Files
      </button>

      <button onClick={() => { dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type, id: convId, name: convName, avatar: null } }); dispatch({ type: 'SET_CHAT_SEARCH', payload: { active: true, query: '' } }); onClose(); }} className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-muted flex items-center gap-3 transition-colors">
        <SearchIcon className="h-3.5 w-3.5 text-muted-foreground" />
        Search in Conversation
      </button>

      <div className="h-px bg-border my-1" />

      <button onClick={() => { dispatch({ type: meta.unreadCount > 0 ? 'MARK_CONVERSATION_READ' : 'MARK_CONVERSATION_UNREAD', payload: convId }); onClose(); }} className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-muted flex items-center gap-3 transition-colors">
        <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />
        Mark as {meta.unreadCount > 0 ? 'Read' : 'Unread'}
      </button>

      {type === 'dm' ? (
        <>
          <div className="h-px bg-border my-1" />
          <button onClick={() => openBlockConfirm(!meta.blocked)} className="w-full px-3 py-2 text-left text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-3 transition-colors">
            <Ban className="h-3.5 w-3.5" />
            {meta.blocked ? 'Unblock User' : 'Block User'}
          </button>
          {isSiteAdmin && (
            <button onClick={() => dispatch({ type: 'ADD_TOAST', payload: { message: 'Use Admin Control to delete conversations', type: 'info' } })} className="w-full px-3 py-2 text-left text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-3 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
              Delete Conversation
            </button>
          )}
        </>
      ) : (
        <>
          <div className="h-px bg-border my-1" />
          <button onClick={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'leaveGroup', data: { group: state.groups.find(g => g.id === convId) } } })} className="w-full px-3 py-2 text-left text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-3 transition-colors">
            <LogOut className="h-3.5 w-3.5" />
            Leave Group
          </button>
          {isSiteAdmin && (
            <button onClick={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'confirm', data: { title: 'Delete Group', body: `Permanently delete "${convName}"?`, confirmLabel: 'Delete Permanently', confirmStyle: 'danger', onConfirm: async () => { try { await api.delete(`/groups/${convId}`); dispatch({ type: 'DELETE_GROUP', payload: convId }); } catch { dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to delete group', type: 'error' } }); } } } } })} className="w-full px-3 py-2 text-left text-xs font-medium text-destructive hover:bg-destructive/10 flex items-center gap-3 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
              Delete Group
            </button>
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
  const [activeTab, setActiveTab] = useState<'dm' | 'groups'>('dm');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number, y: number, id: string, name: string, type: 'dm' | 'group' } | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const token = typeof window !== 'undefined' ? localStorage.getItem('teams_token') : null;
      const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');
      const res = await fetch(`${BASE_URL}/users/me/avatar`, {
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

  const filteredUsers = useMemo(() => {
    return state.users
      .filter(u => {
        if (u.id === state.currentUser?.id) return false;
        if (!u.name.toLowerCase().includes(sidebarSearch.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const aId = getDmConvId(state.currentUser?.id, a.id);
        const bId = getDmConvId(state.currentUser?.id, b.id);
        const aMeta = state.conversationMeta[aId];
        const bMeta = state.conversationMeta[bId];
        if (aMeta?.pinned && !bMeta?.pinned) return -1;
        if (!aMeta?.pinned && bMeta?.pinned) return 1;
        const aTime = aMeta?.lastMessage?.timestamp ? new Date(aMeta.lastMessage.timestamp).getTime() : 0;
        const bTime = bMeta?.lastMessage?.timestamp ? new Date(bMeta.lastMessage.timestamp).getTime() : 0;
        return bTime - aTime;
      });
  }, [state.users, state.currentUser, sidebarSearch, state.conversationMeta]);

  const filteredGroups = useMemo(() => {
    const currentUserId = String(state.currentUser?.id || '');
    return state.groups
      .filter(g => {
        if (!g.name.toLowerCase().includes(sidebarSearch.toLowerCase())) return false;
        const isMember = g.members.includes(currentUserId);
        const hasLeft = !!(state.conversationMeta[g.id]?.leftAt);
        return isMember || hasLeft;
      })
      .sort((a, b) => {
        const aMeta = state.conversationMeta[a.id];
        const bMeta = state.conversationMeta[b.id];
        if (aMeta?.pinned && !bMeta?.pinned) return -1;
        if (!aMeta?.pinned && bMeta?.pinned) return 1;
        const aTime = aMeta?.lastMessage?.timestamp ? new Date(aMeta.lastMessage.timestamp).getTime() : 0;
        const bTime = bMeta?.lastMessage?.timestamp ? new Date(bMeta.lastMessage.timestamp).getTime() : 0;
        return bTime - aTime;
      });
  }, [state.groups, state.currentUser, sidebarSearch, state.conversationMeta]);

  const handleContextMenu = (e: React.MouseEvent, id: string, name: string, type: 'dm' | 'group') => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, id, name, type });
  };

  return (
    <div className="w-full h-full bg-card text-card-foreground flex flex-col relative z-20 shadow-xl overflow-hidden">
      <div className="p-5 border-b border-border bg-card/50">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-2xl relative overflow-hidden shrink-0 bg-transparent">
            <Image src={BRAND_FAVICON_URL} alt="Mawby Teams icon" fill className="object-contain p-2" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm font-headline truncate tracking-tight">Mawby Teams</span>
            {state.currentUser?.role === 'admin' && <Badge variant="default" className="w-fit text-[9px] h-3.5 bg-primary px-1 font-bold rounded-sm mt-0.5">WORKSPACE ADMIN</Badge>}
          </div>
          <NotificationBell className="ml-auto shrink-0 md:hidden" />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
          <input type="text" placeholder="Jump to..." className="w-full pl-9 pr-3 py-2.5 bg-muted/40 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium" value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} />
        </div>
      </div>

      {/* View switcher — desktop only. Mobile uses the bottom nav */}
      <div className="hidden md:block p-3 border-b border-border space-y-1 bg-muted/5">
        <button onClick={() => onViewChange('chat')} className={cn('w-full flex items-center gap-3 p-2.5 rounded-xl transition-all font-bold', activeView === 'chat' ? 'bg-primary/10 text-primary shadow-sm' : 'hover:bg-muted text-muted-foreground')}>
          <MessageSquare className="h-4 w-4" />
          <span className="text-[13px] uppercase tracking-wider">Workspace Chat</span>
        </button>
        <button onClick={() => onViewChange('files')} className={cn('w-full flex items-center gap-3 p-2.5 rounded-xl transition-all font-bold', activeView === 'files' ? 'bg-primary/10 text-primary shadow-sm' : 'hover:bg-muted text-muted-foreground')}>
          <FileText className="h-4 w-4" />
          <span className="text-[13px] uppercase tracking-wider">Shared Assets</span>
        </button>
      </div>

      <div className="flex border-b border-border bg-muted/20">
        <button onClick={() => setActiveTab('dm')} className={cn('flex-1 py-3 text-[10px] font-bold tracking-[0.15em] transition-all relative', activeTab === 'dm' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>DIRECT MESSAGES {activeTab === 'dm' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary" />}</button>
        <button onClick={() => setActiveTab('groups')} className={cn('flex-1 py-3 text-[10px] font-bold tracking-[0.15em] transition-all relative', activeTab === 'groups' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>WORK GROUPS {activeTab === 'groups' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary" />}</button>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-1 scrollbar-hide bg-card/30">
        {activeTab === 'dm' ? filteredUsers.map(user => {
          const convId = getDmConvId(state.currentUser?.id, user.id);
          const meta = state.conversationMeta[convId] || { pinned: false, muted: false, unreadCount: 0 };
          const isActive = state.activeConversation?.id === convId;
          const isDeactivated = user.isActive === false;
          return (
            <button
              key={user.id}
              onContextMenu={e => !isDeactivated && handleContextMenu(e, convId, user.name, 'dm')}
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
                  <p className={cn("text-sm truncate transition-colors", isDeactivated ? "text-muted-foreground font-semibold" : !isActive && meta.unreadCount > 0 && !meta.muted ? "font-bold text-foreground group-hover:text-primary" : "font-semibold group-hover:text-primary")}>{user.name}</p>
                  {meta.pinned && !isDeactivated && <Pin className="h-2.5 w-2.5 text-primary" />}
                  {meta.blocked && !isDeactivated && <Ban className="h-2.5 w-2.5 text-destructive" />}
                  {isDeactivated && <Ban className="h-2.5 w-2.5 text-muted-foreground/50" />}
                </div>
                {isDeactivated ? (
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Deactivated</p>
                ) : meta.lastMessage ? (
                    <p className={cn("text-[11px] truncate", !isActive && meta.unreadCount > 0 && !meta.muted ? "text-foreground font-semibold" : "text-muted-foreground")}>
                    {String(meta.lastMessage.senderId) === String(state.currentUser?.id) ? 'You: ' : ''}{meta.lastMessage.content || '📎 Attachment'}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground truncate font-bold uppercase tracking-tighter">{user.department}</p>
                )}
              </div>
              {!isDeactivated && meta.unreadCount > 0 && (
                <Badge className={cn("h-5 px-1.5 font-bold rounded-lg", meta.muted ? "bg-muted-foreground/30 text-white" : "bg-secondary text-white")}>
                  {meta.unreadCount}
                </Badge>
              )}
            </button>
          );
        }) : (
          <>
            {filteredGroups.map(group => {
              const meta = state.conversationMeta[group.id] || { pinned: false, muted: false, unreadCount: 0, hasUnreadMention: false };
              const isActive = state.activeConversation?.id === group.id;
              const isAdminOnly = group.settings.messagePermission === 'admin_only';
              const hasLeft = !!(meta.leftAt);
              return (
                <button
                  key={group.id}
                  onContextMenu={e => !hasLeft && handleContextMenu(e, group.id, group.name, 'group')}
                  onClick={() => {
                    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type: 'group', id: group.id, name: group.name, avatar: group.avatar } });
                    onConversationSelect?.();
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 p-2.5 rounded-xl transition-all group border border-transparent relative',
                    hasLeft ? 'opacity-50' : isActive ? 'bg-primary/5 text-primary border-primary/10' : 'hover:bg-muted text-muted-foreground'
                  )}
                >
                  <div className="relative">
                    <GroupAvatar name={group.name} avatar={group.avatar} hasLeft={hasLeft} isActive={isActive} />
                    {meta.muted && !hasLeft && (
                      <div className="absolute -bottom-1 -right-1 bg-card rounded-full p-0.5 shadow-sm border border-border">
                        <VolumeX className="h-2.5 w-2.5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={cn("text-sm truncate transition-colors", hasLeft ? "text-muted-foreground font-semibold" : !isActive && (meta.unreadCount > 0 || meta.hasUnreadMention) && !meta.muted ? "font-bold text-foreground group-hover:text-primary" : "font-semibold group-hover:text-primary")}>
                        {group.name}
                      </p>
                      {meta.pinned && !hasLeft && <Pin className="h-2.5 w-2.5 text-primary" />}
                      {isAdminOnly && !hasLeft && <Lock className="h-2.5 w-2.5 text-muted-foreground/40" />}
                      {hasLeft && <LogOut className="h-2.5 w-2.5 text-muted-foreground/50" />}
                    </div>
                    {hasLeft ? (
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">You left this group</p>
                    ) : meta.lastMessage ? (
                      <p className={cn("text-[11px] truncate", !isActive && (meta.unreadCount > 0 || meta.hasUnreadMention) && !meta.muted ? "text-foreground font-semibold" : "text-muted-foreground")}>
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
                      title="Remove from list"
                      onClick={async e => {
                        e.stopPropagation();
                        try { await api.delete(`/groups/${group.id}/leave/dismiss`); } catch { /* ignore */ }
                        dispatch({ type: 'DISMISS_LEFT_GROUP', payload: group.id });
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
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
                    <Badge className={cn("h-5 px-1.5 font-bold rounded-lg", meta.muted ? "bg-muted-foreground/30 text-white" : "bg-muted-foreground text-white")}>
                      {meta.unreadCount}
                    </Badge>
                  ) : null}
                </button>
              );
            })}
            <Button variant="outline" className="w-full mt-3 border-dashed border-primary/30 text-primary hover:bg-primary/5 h-11 gap-2 font-bold rounded-xl" onClick={onCreateGroup}><Plus className="h-4 w-4" /> Create New Group</Button>
          </>
        )}
      </div>

      <div className="p-4 border-t border-border space-y-2 bg-muted/10">
        {/* Admin + Settings buttons only on desktop — mobile uses bottom nav */}
        {state.currentUser?.role === 'admin' && <button onClick={() => onViewChange('admin')} className={cn('hidden md:flex w-full items-center gap-3 p-2.5 rounded-xl transition-all shadow-md font-bold', activeView === 'admin' ? 'bg-primary text-white' : 'bg-card border border-border hover:bg-muted text-muted-foreground')}><Shield className="h-4 w-4" /><span className="text-[13px] uppercase tracking-wider">Admin Control</span></button>}
        <div className="flex items-center justify-between p-2.5 rounded-2xl bg-card border border-border shadow-xl ring-1 ring-black/5">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="relative group/avatar cursor-pointer shrink-0"
              onClick={() => avatarInputRef.current?.click()}
              title="Change profile picture"
            >
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
            <Tooltip><TooltipTrigger asChild><button onClick={() => onViewChange('settings')} className={cn("p-2 rounded-lg transition-all", activeView === 'settings' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted')}><Settings className="h-4 w-4" /></button></TooltipTrigger><TooltipContent side="top">Preferences</TooltipContent></Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={async () => {
                    try {
                      await logoutUser();
                    } catch (e) {
                      console.error('Logout failed:', e);
                    } finally {
                      dispatch({ type: 'LOGOUT' });
                    }
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

      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} convId={ctxMenu.id} convName={ctxMenu.name} type={ctxMenu.type} onClose={() => setCtxMenu(null)} />}
    </div>
  );
};

export default Sidebar;
