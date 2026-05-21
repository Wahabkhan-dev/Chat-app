
"use client";

import React, { useState } from 'react';
import { Message } from '@/mock/messages';
import { useAppContext } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Avatar } from '../ui/avatar';
import { format } from 'date-fns';
import { Reply, Forward, SmilePlus, Edit2, Trash2, MoreHorizontal, Check, X, Ban, Pin, CheckCheck, Clock, Undo2 } from 'lucide-react';
import { getSocket } from '@/services/socket';
import { api } from '@/lib/api';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import FileRenderer from './FileRenderer';
import LinkPreviewCard from './LinkPreviewCard';

interface MessageBubbleProps {
  message: Message;
  isFirstInGroup: boolean;
}

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '✅'];

const MessageStatus: React.FC<{ status?: Message['status'] }> = ({ status }) => {
  if (status === 'sending') return <Clock className="h-3 w-3 text-muted-foreground animate-pulse" />;
  if (status === 'sent') return <Check className="h-3 w-3 text-muted-foreground" />;
  if (status === 'delivered') return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  if (status === 'seen') return <CheckCheck className="h-3 w-3 text-primary" />;
  return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isFirstInGroup }) => {
  const { state, dispatch } = useAppContext();
  const [editText, setEditText] = useState(message.content);
  const isMe = String(message.senderId) === String(state.currentUser?.id);
  const isAdmin = state.currentUser?.role === 'admin';
  const sender = state.users.find(u => String(u.id) === String(message.senderId));
  const isEditing = state.chatUI.editingMessageId === message.id;
  const isDeleted = message.isDeleted;

  const activeConversationId = state.activeConversation?.id || '';
  const repliedMessage = message.replyTo ? 
    state.messages[activeConversationId]?.find(m => m.id === message.replyTo) : null;
  const repliedSender = repliedMessage ? state.users.find(u => u.id === repliedMessage.senderId) : null;

  const handleJumpToOriginal = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!message.replyTo) return;
    
    const element = document.getElementById(`msg-${message.replyTo}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      element.classList.add('ring-4', 'ring-primary/40', 'bg-primary/5', 'rounded-2xl');
      setTimeout(() => {
        element.classList.remove('ring-4', 'ring-primary/40', 'bg-primary/5');
      }, 2000);
    }
  };

  const handleReaction = (emoji: string) => {
    if (isDeleted) return;
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('react_message', { messageId: message.id, conversationId: activeConversationId, emoji });
    } else {
      dispatch({
        type: 'ADD_REACTION',
        payload: { conversationId: activeConversationId, messageId: message.id, emoji, userId: state.currentUser?.id || '' },
      });
    }
  };

  const handleSaveEdit = () => {
    if (editText.trim() === '' || editText.trim() === message.content) {
      dispatch({ type: 'SET_EDITING_MESSAGE', payload: null });
      return;
    }
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('edit_message', { messageId: message.id, conversationId: activeConversationId, content: editText.trim() });
    } else {
      dispatch({
        type: 'EDIT_MESSAGE',
        payload: { conversationId: activeConversationId, messageId: message.id, newContent: editText.trim(), editedAt: new Date().toISOString() },
      });
    }
    dispatch({ type: 'SET_EDITING_MESSAGE', payload: null });
    dispatch({ type: 'ADD_TOAST', payload: { message: '✅ Message updated', type: 'success' } });
  };

  const handleDelete = () => {
    const deletedAt = new Date().toISOString();
    // Step 1: update UI immediately — never revert
    dispatch({
      type: 'DELETE_MESSAGE',
      payload: { conversationId: activeConversationId, messageId: message.id, deletedBy: state.currentUser!.id, deletedAt },
    });
    // Step 2: try REST API (updates DB + broadcasts via socket to receiver)
    api.delete(`/messages/${message.id}`).catch(() => {
      // REST failed — fall back to socket so the broadcast still reaches the receiver
      getSocket()?.emit('delete_message', { messageId: message.id, conversationId: activeConversationId });
    });
  };

  const handleUndoDelete = () => {
    dispatch({ type: 'UNDO_DELETE', payload: { conversationId: activeConversationId, messageId: message.id } });
    getSocket()?.emit('undelete_message', { messageId: message.id, conversationId: activeConversationId });
  };

  const handlePin = () => {
    const socket = getSocket();
    if (!socket?.connected) return;
    if (message.isPinned) {
      socket.emit('unpin_message', { conversationId: activeConversationId });
    } else {
      socket.emit('pin_message', { messageId: message.id, conversationId: activeConversationId });
    }
  };

  if (isDeleted) {
    return (
      <div id={`msg-${message.id}`} className={cn('flex gap-3 group/msg relative animate-in fade-in duration-300', isMe ? 'justify-end' : 'justify-start', !isFirstInGroup && 'mt-1')}>
        {!isMe && (
          <div className="w-8 shrink-0">
            {isFirstInGroup && <Avatar name={sender?.name || ''} src={sender?.avatar} size="sm" />}
          </div>
        )}
        <div className={cn('flex flex-col', isMe ? 'items-end' : 'items-start')}>
          <div className={cn(
            'px-4 py-2.5 rounded-2xl border border-dashed text-xs italic flex items-center gap-3 transition-all shadow-inner',
            isMe
              ? 'bg-muted/10 border-muted-foreground/30 text-muted-foreground rounded-tr-none'
              : 'bg-muted/20 border-muted-foreground/20 text-muted-foreground/60 rounded-tl-none'
          )}>
            <div className="flex items-center gap-2">
              <Ban className="h-3 w-3 shrink-0" />
              <span>{isMe ? 'You deleted this message' : 'This message was deleted'}</span>
            </div>
            {isMe && (
              <button
                onClick={handleUndoDelete}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-primary text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-primary/90 transition-all shadow-sm active:scale-95 not-italic shrink-0"
              >
                <Undo2 className="h-3 w-3" />
                Undo
              </button>
            )}
          </div>
          <div className="mt-1 px-1">
            <p className="text-[10px] text-muted-foreground font-medium">{format(new Date(message.timestamp), 'h:mm a')}</p>
          </div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (isEditing) {
      return (
        <div className="space-y-2 min-w-[280px] p-1 text-foreground">
          <Textarea 
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="text-sm bg-primary/5 border-primary focus-visible:ring-0 min-h-[80px] rounded-xl text-foreground"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
              if (e.key === 'Escape') dispatch({ type: 'SET_EDITING_MESSAGE', payload: null } as any);
            }}
          />
          <div className="flex justify-between items-center px-1">
            <span className="text-[10px] text-muted-foreground">esc to cancel Â· enter to save</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg" onClick={() => dispatch({ type: 'SET_EDITING_MESSAGE', payload: null })}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs bg-primary hover:bg-primary/90 rounded-lg text-white" onClick={handleSaveEdit}>Save</Button>
            </div>
          </div>
        </div>
      );
    }

    const renderText = () => {
      const rawContent = message.content?.startsWith('[Forwarded]: ')
        ? message.content.slice('[Forwarded]: '.length)
        : message.content;
      if (!rawContent) return null;
      let content = rawContent
        .replace(/@\[everyone\]\(everyone\)/g, '<span class="text-white bg-yellow-500 px-1.5 py-0.5 rounded-md font-bold cursor-pointer hover:bg-yellow-600 transition-colors">@everyone</span>')
        .replace(/@\[(.*?)\]\((.*?)\)/g, '<span class="text-accent bg-accent/10 px-1 rounded font-bold cursor-pointer hover:bg-accent/20 transition-colors" data-user-id="$2">@$1</span>');
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      content = content.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline decoration-blue-500/30 hover:decoration-blue-500 transition-all font-medium">${url}</a>`;
      });

      return (
        <div className="space-y-2">
          <p className="text-sm whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: content }} />
          {message.links && message.links.length > 0 && (
            <LinkPreviewCard metadata={message.links[0]} />
          )}
        </div>
      );
    };

    if (message.type === 'file' || message.files) {
      return (
        <div className="space-y-3">
          {renderText()}
          <FileRenderer 
            files={message.files || []} 
            messageId={message.id} 
            senderId={message.senderId} 
            timestamp={message.timestamp} 
          />
        </div>
      );
    }

    return renderText();
  };

  return (
    <div id={`msg-${message.id}`} className={cn('flex gap-3 group/msg relative animate-in fade-in slide-in-from-bottom-1 duration-300', isMe ? 'justify-end' : 'justify-start', !isFirstInGroup && 'mt-1')}>
      {!isMe && (
        <div className="w-8 shrink-0">
          {isFirstInGroup && <Avatar name={sender?.name || ''} src={sender?.avatar} size="sm" />}
        </div>
      )}
      
      <div className={cn('flex flex-col max-w-[75%]', isMe ? 'items-end' : 'items-start')}>
        {isFirstInGroup && !isMe && state.activeConversation?.type === 'group' && (
          <span className="text-[10px] font-bold text-primary mb-1 uppercase tracking-widest ml-1">{sender?.name}</span>
        )}

        {!isEditing && (
          <div className={cn(
            "flex items-center gap-1 mb-1 opacity-0 group-hover/msg:opacity-100 transition-all bg-card border rounded-xl p-1 shadow-xl z-10 scale-95 group-hover/msg:scale-100",
            isMe ? "mr-1" : "ml-1"
          )}>
            <Popover>
              <PopoverTrigger asChild>
                <button title="Emoji Reaction" className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-secondary"><SmilePlus className="h-4 w-4" /></button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-1.5 rounded-full flex gap-1.5 bg-card border shadow-2xl" side="top">
                {EMOJIS.map(emoji => (
                  <button key={emoji} onClick={() => handleReaction(emoji)} className="p-1.5 hover:bg-muted rounded-full text-xl transition-transform hover:scale-125">{emoji}</button>
                ))}
              </PopoverContent>
            </Popover>

            {isMe && (
              <button title="Edit Message" onClick={() => { setEditText(message.content); dispatch({ type: 'SET_EDITING_MESSAGE', payload: message.id }); }} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-primary"><Edit2 className="h-4 w-4" /></button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button title="More Actions" className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground"><MoreHorizontal className="h-4 w-4" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isMe ? "end" : "start"} className="bg-card min-w-[180px] rounded-xl shadow-2xl z-[var(--z-dropdown)]">
                <DropdownMenuItem className="gap-2 py-2.5 font-medium" onClick={() => dispatch({ type: 'SET_REPLYING_TO', payload: message })}>
                  <Reply className="h-4 w-4 text-muted-foreground" /> Reply
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 py-2.5 font-medium" onClick={() => dispatch({ type: 'SET_FORWARDING_MESSAGE', payload: message })}>
                  <Forward className="h-4 w-4 text-muted-foreground" /> Forward
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 py-2.5 font-medium" onClick={() => { navigator.clipboard.writeText((message.content || '').replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')); dispatch({ type: 'ADD_TOAST', payload: { message: 'Copied to clipboard!', type: 'success' } }); }}>
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" /> Copy Text
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 py-2.5 font-medium" onClick={handlePin}>
                  <Pin className="h-4 w-4 text-muted-foreground" /> {message.isPinned ? 'Unpin Message' : 'Pin Message'}
                </DropdownMenuItem>
                {(isMe || isAdmin) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="gap-2 py-2.5 text-destructive font-medium focus:bg-destructive/10 cursor-pointer"
                      onClick={handleDelete}
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {repliedMessage && !isEditing && (
          <button 
            onClick={handleJumpToOriginal}
            className={cn(
              "p-2 px-3 mb-1 border-l-4 rounded-lg bg-muted/20 text-[11px] text-muted-foreground italic max-w-[240px] shadow-sm text-left hover:bg-muted/30 transition-all",
              isMe ? "border-primary/50" : "border-accent/50"
            )}
          >
            <p className="font-bold text-[9px] uppercase not-italic mb-1 text-primary/70">{repliedSender?.name}</p>
            <p className="truncate opacity-70">
              {repliedMessage.isDeleted ? "This message was deleted" : (repliedMessage.content || "Media file").replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')}
            </p>
          </button>
        )}
        
        {message.content?.startsWith('[Forwarded]') && (
          <div className="flex items-center gap-1.5 mb-1 px-1 opacity-60">
            <Forward className="h-3 w-3" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Forwarded</span>
          </div>
        )}

        <div 
          className={cn(
            'p-3 px-4 shadow-sm border relative transition-all duration-300',
            isMe 
              ? 'bg-primary text-white border-primary rounded-2xl rounded-tr-none' 
              : 'bg-card text-card-foreground border-border rounded-2xl rounded-tl-none',
            isEditing && 'w-full shadow-2xl ring-4 ring-primary/10 border-primary',
            (message.content?.includes(state.currentUser?.name || '---') || (message.content?.includes('@[everyone](everyone)') && !isMe)) && 'ring-2 ring-accent/30 bg-accent/5'
          )}
        >
          {renderContent()}
        </div>

        {message.reactions && message.reactions.length > 0 && !isEditing && (
          <div className={cn("flex flex-wrap gap-1 mt-1.5", isMe ? "justify-end" : "justify-start")}>
            {message.reactions.map((r, i) => {
              const hasReacted = r.users.includes(state.currentUser?.id || '');
              return (
                <button 
                  key={i} 
                  onClick={(e) => { e.stopPropagation(); handleReaction(r.emoji); }}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1.5 border transition-all hover:scale-110",
                    hasReacted ? "bg-primary/20 border-primary text-primary font-bold" : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  <span>{r.emoji}</span>
                  {r.users.length > 1 && <span>{r.users.length}</span>}
                </button>
              );
            })}
          </div>
        )}
        
        {!isEditing && (
          <div className="flex items-center gap-1.5 mt-1 px-1">
            <p className="text-[10px] text-muted-foreground font-medium">
              {format(new Date(message.timestamp), 'h:mm a')}
              {message.editedAt && <span className="opacity-60 ml-1.5 italic">Â· edited</span>}
            </p>
            {isMe && <MessageStatus status={message.status} />}
          </div>
        )}

      </div>
    </div>
  );
};

export default MessageBubble;
