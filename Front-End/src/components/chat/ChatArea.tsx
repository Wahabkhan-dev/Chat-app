
"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { api } from '@/lib/api';
import { getSocket } from '@/services/socket';
import { Search, Info, X, ChevronDown, VolumeX, Lock, Pin } from 'lucide-react';
import { Avatar } from '../ui/avatar';
import MessageBubble from './MessageBubble';
import { Message } from '@/mock/messages';
import { format, isToday, isYesterday, isThisWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import MessageInput from './MessageInput';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { BRAND_LOGO_URL, BRAND_LOGO_DARK_URL } from '@/lib/brand';

const DateDivider: React.FC<{ date: string }> = ({ date }) => {
  const dateObj = new Date(date);
  let label = format(dateObj, 'MMMM d, yyyy');
  if (isToday(dateObj)) label = 'Today';
  else if (isYesterday(dateObj)) label = 'Yesterday';
  else if (isThisWeek(dateObj)) label = format(dateObj, 'EEEE');

  return (
    <div className="flex items-center gap-4 my-8">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 bg-background z-10">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
};

const ChatArea: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [isDragging, setIsDragging] = useState(false);
  const [showScrollPill, setShowScrollPill] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeConversationId = state.activeConversation?.id;
  const rawMessages = activeConversationId ? state.messages[activeConversationId] || [] : [];

  // Load message history + join socket room whenever conversation changes
  useEffect(() => {
    if (!activeConversationId) return;

    const socket = getSocket();
    if (socket) {
      if (state.activeConversation?.type === 'dm') {
        const parts = activeConversationId.split('_');
        const otherId = parts[1] === String(state.currentUser?.id) ? parts[2] : parts[1];
        socket.emit('join_dm', { otherUserId: otherId });
      }
    }

    // Only fetch if we haven't loaded messages for this conversation yet
    if (state.messages[activeConversationId] !== undefined) return;

    api.get<{ messages: any[] }>(`/messages/${activeConversationId}`)
      .then(({ messages }) => {
        dispatch({ type: 'LOAD_MESSAGES', payload: { conversationId: activeConversationId, messages } });
        const pinned = messages.find((m: any) => m.isPinned);
        if (pinned) {
          dispatch({ type: 'PIN_MESSAGE', payload: { conversationId: activeConversationId, message: pinned } });
        }
      })
      .catch((error) => {
        console.error(`[ChatArea] failed to load messages for ${activeConversationId}:`, error);
      });
  }, [activeConversationId]);
  
  const emitReadStatus = () => {
    if (!activeConversationId || !state.currentUser?.id) return;
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;

    const socket = getSocket();
    if (!socket?.connected) return;

    const lastMessage = rawMessages[rawMessages.length - 1];
    const lastMessageId = lastMessage?.id || null;

    if (lastMessageId) {
      socket.emit('mark_conversation_read', { conversationId: activeConversationId, lastMessageId }, (response: any) => {
        if (!response?.success) {
          console.warn('[ReadReceipt] mark_conversation_read failed:', response?.error);
        }
      });
    }

    socket.emit('update_last_seen', { conversationId: activeConversationId, lastMessageId }, (response: any) => {
      if (!response?.success) {
        console.warn('[LastSeen] update_last_seen failed:', response?.error);
      }
    });
  };

  useEffect(() => {
    emitReadStatus();
  }, [activeConversationId, rawMessages.length, state.currentUser?.id]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      emitReadStatus();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeConversationId, rawMessages.length, state.currentUser?.id]);

  const filteredMessages = useMemo(() => {
    if (!state.chatUI.isSearchActive || !state.chatUI.searchQuery) return rawMessages;
    return rawMessages.filter(m => 
      m.content.toLowerCase().includes(state.chatUI.searchQuery.toLowerCase())
    );
  }, [rawMessages, state.chatUI.isSearchActive, state.chatUI.searchQuery]);

  const typingUsers = activeConversationId ? state.typingUsers[activeConversationId] || [] : [];
  const meta = activeConversationId ? state.conversationMeta[activeConversationId] : null;
  const group = state.activeConversation?.type === 'group' ? state.groups.find(g => g.id === state.activeConversation?.id) : null;
  const isAdminOnly = group?.settings.messagePermission === 'admin_only';
  const pinnedMessage = activeConversationId ? state.pinnedMessages?.[activeConversationId] : null;

  const dmUser = useMemo(() => {
    if (state.activeConversation?.type !== 'dm' || !state.activeConversation.id) return null;
    const parts = state.activeConversation.id.split('_');
    const otherId = parts[1] === String(state.currentUser?.id) ? parts[2] : parts[1];
    return state.users.find(u => u.id === otherId) || null;
  }, [state.activeConversation, state.currentUser?.id, state.users]);

  useEffect(() => {
    if (scrollRef.current && !state.chatUI.isSearchActive) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [rawMessages.length, activeConversationId, state.chatUI.isSearchActive]);

  // If URL contains ?focusMessageId=..., try to scroll to it (persistent navigation)
  useEffect(() => {
    try {
      const focus = searchParams?.get?.('focusMessageId');
      if (!focus) return;
      const id = Number(focus);
      if (!id) return;

      let attempts = 0;
      const maxAttempts = 25;
      const interval = 200;
      const tryScroll = () => {
        attempts += 1;
        const el = document.getElementById(`msg-${id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-4','ring-primary/40','rounded-2xl');
          setTimeout(() => el.classList.remove('ring-4','ring-primary/40','rounded-2xl'), 2000);
          // remove query param
          try { router.replace(window.location.pathname); } catch (e) {}
          return;
        }
        if (attempts < maxAttempts) setTimeout(tryScroll, interval);
      };
      setTimeout(tryScroll, 300);
    } catch (e) {
      // ignore
    }
  }, [activeConversationId, rawMessages.length, searchParams]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
    setShowScrollPill(!isAtBottom);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    if (state.chatUI.uploadedFiles.length + files.length > 5) {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Max 5 images per message', type: 'error' } });
      return;
    }

    const newFiles = files.map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      size: `${(file.size / 1024).toFixed(1)} KB`,
      type: 'image',
      mimeType: file.type,
    }));

    dispatch({ type: 'ADD_UPLOADED_FILES', payload: newFiles });
  };

  if (!state.activeConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background p-8 text-center animate-in fade-in">
        <div className="w-64 h-24 mb-8 relative">
          <Image src={BRAND_LOGO_URL} alt="Mawby Teams logo" fill className="object-contain dark:hidden" />
          <Image src={BRAND_LOGO_DARK_URL} alt="Mawby Teams logo" fill className="object-contain hidden dark:block" />
        </div>
        <h2 className="text-2xl font-bold font-headline mb-2">Select a conversation</h2>
        <p className="text-muted-foreground max-w-md">Choose from your team members or groups to start collaborating.</p>
      </div>
    );
  }

  return (
    <div 
      className={cn("flex-1 flex flex-col bg-background overflow-hidden relative transition-all", isDragging && "bg-primary/5 ring-4 ring-inset ring-primary/20")}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="h-14 border-b border-border bg-card text-card-foreground flex items-center justify-between px-6 shrink-0 z-20 shadow-sm">
        <div 
          className="flex items-center gap-3 cursor-pointer group/header hover:opacity-90 transition-all active:scale-[0.98]"
          onClick={() => dispatch({ type: 'TOGGLE_RIGHT_PANEL', payload: true })}
        >
          <Avatar
            name={state.activeConversation.name}
            src={state.activeConversation.avatar}
            size="md"
            status={state.activeConversation.type === 'dm' ? dmUser?.status : undefined}
            showStatus={state.activeConversation.type === 'dm'}
          />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm leading-tight group-hover/header:text-primary transition-colors">{state.activeConversation.name}</h3>
              {meta?.muted && (
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    dispatch({ type: 'UNMUTE_CONVERSATION', payload: state.activeConversation!.id }); 
                  }}
                  className="flex items-center gap-1.5 px-2 py-0.5 bg-muted border rounded-full group hover:border-primary/30 transition-all"
                >
                  <VolumeX className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
                  <span className="text-[10px] font-bold text-muted-foreground group-hover:text-primary">Muted</span>
                </button>
              )}
              {isAdminOnly && (
                <Badge variant="outline" className="h-5 px-1.5 gap-1 border-muted text-muted-foreground font-bold text-[9px] uppercase tracking-wider">
                  <Lock className="h-2.5 w-2.5" /> Admin Only
                </Badge>
              )}
            </div>
            <p className={cn("text-[11px] font-bold uppercase tracking-wider",
              state.activeConversation.type === 'dm'
                ? (dmUser?.status === 'online' ? 'text-green-600' : dmUser?.status === 'away' ? 'text-yellow-500' : dmUser?.status === 'dnd' ? 'text-red-500' : 'text-muted-foreground')
                : 'text-muted-foreground'
            )}>
              {state.activeConversation.type === 'dm' ? (dmUser?.status || 'offline') : `${group?.members.length || 0} Members`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => dispatch({ type: 'SET_CHAT_SEARCH', payload: { active: !state.chatUI.isSearchActive, query: '' } })}
            className={cn('p-2 rounded-full transition-all h-9 w-9 flex items-center justify-center', state.chatUI.isSearchActive ? 'bg-muted text-primary' : 'hover:bg-muted text-muted-foreground')}
          >
            <Search className="h-4 w-4" />
          </button>
          <button onClick={() => dispatch({ type: 'TOGGLE_RIGHT_PANEL' })} className={cn('p-2 rounded-full transition-all h-9 w-9 flex items-center justify-center', state.rightPanel.open ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground')}>
            <Info className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {state.chatUI.isSearchActive && (
        <div className="px-6 py-2 border-b bg-muted/30 flex items-center gap-2 animate-in slide-in-from-top-1 z-10">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search messages..." 
            className="flex-1 h-8 bg-transparent border-none focus-visible:ring-0 px-0 text-sm"
            value={state.chatUI.searchQuery}
            onChange={(e) => dispatch({ type: 'SET_CHAT_SEARCH', payload: { active: true, query: e.target.value } })}
            autoFocus
          />
          <button onClick={() => dispatch({ type: 'SET_CHAT_SEARCH', payload: { active: false, query: '' } })} className="p-1 hover:bg-muted rounded-full">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Pinned Message Banner */}
      {pinnedMessage && (
        <div
          className="mx-4 mt-2 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-primary/10 transition-colors animate-in fade-in z-10"
          onClick={() => {
            const el = document.getElementById(`msg-${pinnedMessage.id}`);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('ring-4','ring-primary/40','rounded-2xl'); setTimeout(() => el.classList.remove('ring-4','ring-primary/40','rounded-2xl'), 2000); }
          }}
        >
          <Pin className="h-3.5 w-3.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Pinned Message</span>
            <p className="text-xs text-muted-foreground truncate">{pinnedMessage.content}</p>
          </div>
          <button
            className="text-muted-foreground hover:text-primary p-1 rounded"
            onClick={(e) => { e.stopPropagation(); getSocket()?.emit('unpin_message', { conversationId: activeConversationId }); }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div 
        className="flex-1 overflow-y-auto p-6 scrollbar-hide scroll-smooth relative" 
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {filteredMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 opacity-30">
            <Search className="h-12 w-12 mb-4" />
            <p className="text-sm font-bold uppercase tracking-widest">No messages found</p>
          </div>
        )}
        
        {filteredMessages.map((msg, idx) => {
          const prevMsg = filteredMessages[idx - 1];
          const showDivider = !prevMsg || format(new Date(msg.timestamp), 'yyyy-MM-dd') !== format(new Date(prevMsg.timestamp), 'yyyy-MM-dd');
          const isGrouped = prevMsg && prevMsg.senderId === msg.senderId && 
                            (new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()) < 300000 && !showDivider;

          return (
            <React.Fragment key={msg.id}>
              {showDivider && <DateDivider date={msg.timestamp} />}
              <div id={`msg-${msg.id}`} className={cn("transition-all duration-1000", isGrouped ? "mt-1" : "mt-6")}>
                <MessageBubble 
                  message={msg} 
                  isFirstInGroup={!isGrouped}
                />
              </div>
            </React.Fragment>
          );
        })}

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 mt-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex -space-x-2">
              {typingUsers.slice(0, 3).map((u, i) => (
                <div key={i} className="h-5 w-5 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[8px] font-bold">
                  {u[0]}
                </div>
              ))}
            </div>
            <div className="px-3 py-1.5 bg-muted/40 rounded-2xl rounded-bl-none text-[10px] text-muted-foreground italic flex items-center gap-1.5">
              <span>{typingUsers.length === 1 ? `${typingUsers[0]} is typing` : typingUsers.length === 2 ? `${typingUsers[0]} and ${typingUsers[1]} are typing` : `${typingUsers.length} people are typing`}</span>
              <div className="flex gap-0.5">
                <div className="h-1 w-1 bg-muted-foreground rounded-full animate-bounce" />
                <div className="h-1 w-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="h-1 w-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scroll Pill */}
      {showScrollPill && (
        <button 
          onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
          className="absolute bottom-24 right-8 bg-primary text-white p-2.5 rounded-full shadow-2xl hover:scale-110 transition-all z-30 animate-in bounce-in"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}

      <MessageInput />
    </div>
  );
};

export default ChatArea;
