"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { Paperclip, Send, Smile, X, CornerDownRight, AtSign, Lock, ShieldAlert, Plus, Search, FileText, File as FileIcon, Play, Video, LogOut, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Message, MessageFile } from '@/mock/messages';
import { Avatar } from '../ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getLinkMetadata } from '@/services/link-preview';
import { getSocket } from '@/services/socket';
import { uploadFilesToR2 } from '@/services/upload';
import { toast } from '@/hooks/use-toast';

const COMMON_EMOJIS = ['😀', '😂', '😊', '😍', '👍', '🙌', '🔥', '✨', '🚀', '💡', '✅', '❌', '👋', '🎉', '🙏', '💯'];

const EVERYONE_OPTION = { id: 'everyone', name: 'everyone', department: 'Mention everyone', status: 'online' as const, avatar: undefined as string | undefined };

const MessageInput: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingMentions = useRef<{ name: string; id: string }[]>([]);

  const activeConversation = state.activeConversation;
  const group = activeConversation?.type === 'group' ? state.groups.find(g => g.id === activeConversation.id) : null;
  const isEditing = !!state.chatUI.editingMessageId;
  
  const canManageGroup = (user: any, group: any) =>
    user.role === 'admin' || group?.admins.includes(user.id);

  const isReadOnly = group?.settings?.messagePermission === 'admin_only' && !canManageGroup(state.currentUser, group);
  const hasLeftGroup = !!(activeConversation?.type === 'group' && state.conversationMeta[activeConversation.id]?.leftAt);
  const isBlockedConversation = activeConversation?.type === 'dm' && state.conversationMeta[activeConversation.id]?.blocked;

  const dmPartnerId = activeConversation?.type === 'dm'
    ? activeConversation.id.split('_').slice(1).find(id => id !== String(state.currentUser?.id))
    : null;
  const dmPartner = dmPartnerId ? state.users.find(u => u.id === dmPartnerId) : null;
  const isPartnerDeactivated = activeConversation?.type === 'dm' && dmPartner?.isActive === false;

  const uploadedFiles = state.chatUI.uploadedFiles;

  const currentUserId = String(state.currentUser?.id || '');
  const groupMembers = group 
    ? state.users.filter(u => group.members.includes(u.id) && u.id !== currentUserId && u.isActive)
    : [];

  const filteredMembers: any[] = [
    ...('everyone'.includes(mentionSearch.toLowerCase()) ? [EVERYONE_OPTION] : []),
    ...groupMembers.filter(m => m.name.toLowerCase().includes(mentionSearch.toLowerCase()))
  ];

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [inputText]);

  const processFiles = (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    if (uploadedFiles.length + fileList.length > 10) {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Max 10 files per message', type: 'error' } });
      return;
    }

    const largeFile = fileList.find(f => f.size > 25 * 1024 * 1024);
    if (largeFile) {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Max file size 25MB', type: 'error' } });
      return;
    }

    const newFiles = fileList.map(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let category = 'other';
      if (['png','jpg','jpeg','webp','gif'].includes(ext)) category = 'image';
      else if (['mp4','webm','mov'].includes(ext)) category = 'video';
      else if (['mp3','wav','ogg','m4a','aac','flac'].includes(ext)) category = 'audio';
      else if (['pdf','docx','xlsx','pptx','txt','md','rtf','odt'].includes(ext)) category = 'document';
      else if (['zip','rar','7z','tar','gz'].includes(ext)) category = 'archive';

      return {
        file,
        previewUrl: URL.createObjectURL(file),
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        type: category,
        mimeType: file.type
      };
    });

    dispatch({ type: 'ADD_UPLOADED_FILES', payload: newFiles });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      processFiles(e.clipboardData.files);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && uploadedFiles.length === 0) || !activeConversation || isEditing || isReadOnly || isSending || isBlockedConversation) return;

    const socket = getSocket();
    if (!socket?.connected) return;

    setIsSending(true);

    const content = processMentions(inputText.trim());
    pendingMentions.current = [];
    const replyTo = state.replyingTo?.id;

    // Upload files to Cloudflare R2 before emitting the socket event
    let r2Files: { key: string; name: string; size: string; type: string; mimeType?: string }[] = [];
    if (uploadedFiles.length > 0) {
      try {
        r2Files = await uploadFilesToR2(uploadedFiles.map(f => f.file), activeConversation.id);
      } catch (err: any) {
        toast({
          title: 'Upload failed',
          description: err.message || 'Could not upload files. Please try again.',
          variant: 'destructive',
        });
        setIsSending(false);
        return;
      }
    }

    socket.emit(
      'send_message',
      { conversationId: activeConversation.id, content, type: 'text', replyTo, files: r2Files },
      (ack: { success: boolean; message?: any }) => {
        if (ack?.success && ack.message) {
          dispatch({
            type: 'SEND_MESSAGE',
            payload: { conversationId: activeConversation.id, message: { ...ack.message, files: r2Files } },
          });
        }
      }
    );

    socket.emit('stop_typing', { conversationId: activeConversation.id });

    setInputText('');
    pendingMentions.current = [];
    dispatch({ type: 'SET_REPLYING_TO', payload: null });
    dispatch({ type: 'CLEAR_UPLOADED_FILES' });
    setIsSending(false);
  };

  const extractMentions = (text: string) => {
    const matches = text.match(/@\[(.*?)\]\((.*?)\)/g);
    return matches ? matches.map(m => m.match(/\((.*?)\)/)![1]) : [];
  };

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputText(value);

    // Emit typing indicator
    if (activeConversation) {
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('typing', { conversationId: activeConversation.id });
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          socket.emit('stop_typing', { conversationId: activeConversation.id });
        }, 2000);
      }
    }

    if (activeConversation?.type === 'group') {
      const atIndex = value.lastIndexOf('@');
      if (atIndex !== -1 && (atIndex === 0 || value[atIndex - 1] === ' ' || value[atIndex - 1] === '\n')) {
        const query = value.slice(atIndex + 1);
        if (!query.includes(' ')) {
          setShowMentions(true);
          setMentionSearch(query);
          setHighlightedIndex(0);
        } else setShowMentions(false);
      } else setShowMentions(false);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = inputText;
      const newText = text.substring(0, start) + emoji + text.substring(end);
      setInputText(newText);
      
      // Set focus back and move cursor
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setInputText(prev => prev + emoji);
    }
  };

  const selectMember = (user: any) => {
    const atIndex = inputText.lastIndexOf('@');
    // Show only @Name in textarea; track the user ID separately for sending
    const newText = inputText.slice(0, atIndex) + `@${user.name} `;
    setInputText(newText);
    pendingMentions.current = [...pendingMentions.current, { name: user.name, id: user.id }];
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const processMentions = (text: string): string => {
    let result = text;
    for (const m of pendingMentions.current) {
      const escaped = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`@${escaped}(?=\\s|$)`, 'g'), `@[${m.name}](${m.id})`);
    }
    return result;
  };

  const openPreviewLightbox = (idx: number) => {
    dispatch({
      type: 'OPEN_GALLERY',
      payload: {
        items: uploadedFiles.map(f => ({
          url: f.previewUrl,
          name: f.name,
          type: f.type as any,
          size: f.size,
          mimeType: f.mimeType,
        })),
        index: idx,
      }
    });
  };

  if (isPartnerDeactivated) {
    return (
      <div className="p-6 pt-0">
        <div className="bg-muted/50 border-2 border-dashed border-border rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2 animate-in slide-in-from-bottom-2">
          <UserX className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">This user is deactivated</p>
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter opacity-60">Messages cannot be sent to deactivated accounts</p>
        </div>
      </div>
    );
  }

  if (hasLeftGroup) {
    return (
      <div className="p-6 pt-0">
        <div className="bg-muted/50 border-2 border-dashed border-border rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2 animate-in slide-in-from-bottom-2">
          <LogOut className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">You are no longer in this group</p>
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter opacity-60">You can still view the message history</p>
        </div>
      </div>
    );
  }

  if (isReadOnly) {
    return (
      <div className="p-6 pt-0">
        <div className="bg-muted/50 border-2 border-dashed border-border rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2 animate-in slide-in-from-bottom-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
            Only admins can send messages in this group
          </p>
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter opacity-60">You can still read messages and react to them</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 pt-0 relative">
      {isBlockedConversation && (
        <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive animate-in slide-in-from-bottom-2">
          <p className="font-bold">Messages from this user are blocked.</p>
          <p className="text-xs text-destructive/80 mt-1">You will not receive new messages or notifications from this conversation until you unblock them.</p>
        </div>
      )}
      {showMentions && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-6 right-6 mb-2 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-30 animate-in slide-in-from-bottom-2 duration-200">
          <div className="p-3 border-b border-border bg-muted/30 flex justify-between items-center">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2"><AtSign className="h-3 w-3" /> Team Member</h4>
            <span className="text-[9px] text-muted-foreground font-bold">TAB TO SELECT</span>
          </div>
          <ScrollArea className="max-h-[240px]">
            <div className="p-1.5">
              {filteredMembers.map((member, idx) => (
                <button
                  key={member.id}
                  className={cn("w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left", highlightedIndex === idx ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted")}
                  onClick={() => selectMember(member)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  <Avatar name={member.name} src={member.avatar} size="sm" status={member.status} showStatus />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{member.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">{member.department}</p>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      <div className={cn("bg-card border border-border rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-xl", isEditing && "opacity-50 cursor-not-allowed grayscale")}>
        
        {/* File Previews */}
        {uploadedFiles.length > 0 && (
          <div className="p-4 bg-muted/20 border-b border-border flex flex-wrap gap-2 animate-in slide-in-from-bottom-2">
            {uploadedFiles.map((file, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden group/thumb border border-border bg-card shadow-sm shrink-0 flex items-center justify-center">
                {file.type === 'image' ? (
                  <img src={file.previewUrl} alt="preview" className="w-full h-full object-cover transition-transform group-hover/thumb:scale-110" />
                ) : file.type === 'video' ? (
                  <div className="relative w-full h-full">
                    <video src={file.previewUrl} className="w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Play className="h-5 w-5 text-white fill-white" />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <FileIcon className="h-6 w-6 text-muted-foreground" />
                    <span className="text-[8px] font-bold uppercase truncate px-1 w-full text-center">{file.name}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                  <button type="button" onClick={() => openPreviewLightbox(idx)} className="p-1 bg-white/20 rounded-lg hover:bg-white/40 text-white transition-colors"><Search className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => dispatch({ type: 'REMOVE_UPLOADED_FILE', payload: idx })} className="p-1 bg-destructive/80 rounded-lg hover:bg-destructive text-white transition-colors"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
            {uploadedFiles.length < 10 && (
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-20 h-20 rounded-xl border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-all bg-card/50"
              >
                <Plus className="h-5 w-5 mb-1" />
                <span className="text-[9px] font-bold uppercase">Add</span>
              </button>
            )}
          </div>
        )}

        {/* Reply Preview */}
        {state.replyingTo && (
          <div className="p-3 bg-muted/40 border-b border-border flex items-center justify-between animate-in slide-in-from-bottom-1">
            <div className="flex items-center gap-3 min-w-0">
              <CornerDownRight className="h-4 w-4 text-primary" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Replying to {state.users.find(u => u.id === state.replyingTo?.senderId)?.name}</p>
                <p className="text-xs text-muted-foreground truncate italic">{(state.replyingTo.content || '').replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')}</p>
              </div>
            </div>
            <button onClick={() => dispatch({ type: 'SET_REPLYING_TO', payload: null })} className="p-1 hover:bg-muted rounded-full transition-colors"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        
        <form
          onSubmit={handleSendMessage}
          className="flex flex-col"
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files); }}
        >
          <textarea
            ref={textareaRef}
            disabled={isEditing || isSending || isBlockedConversation}
            onPaste={handlePaste}
            placeholder={isBlockedConversation ? 'This conversation is blocked. Unblock to send messages.' : isEditing ? 'Finish editing the message above first' : `Message ${activeConversation?.name}...`}
            className="w-full p-4 bg-transparent outline-none resize-none min-h-[56px] max-h-[160px] text-sm text-foreground placeholder:text-muted-foreground/60"
            rows={1}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (showMentions) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => (i + 1) % filteredMembers.length); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => (i - 1 + filteredMembers.length) % filteredMembers.length); }
                else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMember(filteredMembers[highlightedIndex]); }
                else if (e.key === 'Escape') { e.preventDefault(); setShowMentions(false); }
              } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
            }}
          />
          <div className="px-4 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button type="button" disabled={isEditing || isSending} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-primary transition-all" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-4 w-4" /></button>
              
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" disabled={isEditing || isSending} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-primary transition-all">
                    <Smile className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-[280px] p-2 bg-card border border-border shadow-2xl rounded-2xl z-[var(--z-popover)]">
                  <div className="grid grid-cols-6 gap-1">
                    {COMMON_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleEmojiSelect(emoji)}
                        className="h-9 w-9 flex items-center justify-center text-xl rounded-lg hover:bg-muted transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <input type="file" multiple ref={fileInputRef} className="hidden" onChange={(e) => {
                if (e.target.files) processFiles(e.target.files);
              }} />
            </div>
            <button 
              type="submit" 
              disabled={(!inputText.trim() && uploadedFiles.length === 0) || isEditing || isSending || isBlockedConversation}
              className={cn('p-2 rounded-xl transition-all flex items-center gap-2 px-5 shadow-lg', (inputText.trim() || uploadedFiles.length > 0) && !isEditing && !isSending && !isBlockedConversation ? 'bg-primary text-white hover:bg-primary/90 hover:scale-105' : 'bg-muted text-muted-foreground cursor-not-allowed')}
            >
              <span className="text-[11px] font-bold uppercase tracking-widest">Send</span>
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MessageInput;
