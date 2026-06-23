"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { Paperclip, Send, Smile, X, CornerDownRight, AtSign, Lock, ShieldAlert, Plus, Search, FileText, File as FileIcon, Play, Video, LogOut, UserX, ClipboardPaste } from 'lucide-react';
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

const MAX_FILES = 10;
const MAX_FILE_SIZE_MB = 150;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

function getFileIcon(filename: string): string {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return '/icons/pdf.png';
  if (ext === 'csv') return '/icons/csv.png';
  if (['exe', 'msi', 'bat', 'cmd'].includes(ext)) return '/icons/exe.png';
  if (['ppt', 'pptx'].includes(ext)) return '/icons/ppt.png';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return '/icons/word.png';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst'].includes(ext)) return '/icons/zip.png';
  if (['mp4','webm','mov','avi','mkv','mpeg','mpg','3gp','ogv','m4v','wmv','flv',
       'mp3','wav','ogg','m4a','aac','flac','wma','opus'].includes(ext)) return '/icons/media.png';
  return '/icons/file.png';
}

const IMAGE_EXTS = new Set(['png','jpg','jpeg','webp','gif','svg','bmp','tiff','tif','ico','heic','heif','avif']);
const VIDEO_EXTS = new Set(['mp4','webm','mov','avi','mkv','mpeg','mpg','3gp','ogv','m4v','wmv','flv']);
const AUDIO_EXTS = new Set(['mp3','wav','ogg','m4a','aac','flac','wma','opus']);
const ARCHIVE_EXTS = new Set(['zip','rar','7z','tar','gz','bz2','xz','zst']);
const DOCUMENT_EXTS = new Set([
  'pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','md','rtf','odt','ods','odp','pages','numbers','key',
  'js','ts','jsx','tsx','html','htm','css','scss','sass','less',
  'json','xml','yaml','yml','toml','ini','cfg','conf','env',
  'py','java','c','cpp','h','hpp','cs','php','rb','go','rs','kt','swift',
  'sh','bash','zsh','fish','ps1','bat','cmd',
  'sql','graphql','proto','dart','lua','r','m','scala','pl','ex','exs',
  'psd','ai','xd','fig','sketch','indd','eps','afdesign','afpub','afphoto',
]);

export function getFileCategory(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, '');
  if (IMAGE_EXTS.has(e)) return 'image';
  if (VIDEO_EXTS.has(e)) return 'video';
  if (AUDIO_EXTS.has(e)) return 'audio';
  if (ARCHIVE_EXTS.has(e)) return 'archive';
  if (DOCUMENT_EXTS.has(e)) return 'document';
  return 'other';
}

const EVERYONE_OPTION = { id: 'everyone', name: 'everyone', department: 'Mention everyone', status: 'online' as const, avatar: undefined as string | undefined };

// ── Draft persistence ──────────────────────────────────────────────────────────
// Keyed per conversation so each chat has an independent draft.
// We only store text + file names (File objects can't be serialised to JSON).
interface DraftPayload { text: string; fileNames: string[] }

function draftKey(convId: string) { return `draft_${convId}`; }

function writeDraft(convId: string, text: string, fileNames: string[]) {
  try {
    if (!text.trim() && fileNames.length === 0) {
      localStorage.removeItem(draftKey(convId));
    } else {
      localStorage.setItem(draftKey(convId), JSON.stringify({ text, fileNames } satisfies DraftPayload));
    }
  } catch {} // storage full — fail silently
}

function readDraft(convId: string): DraftPayload | null {
  try {
    const raw = localStorage.getItem(draftKey(convId));
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftPayload;
    // Do not restore purely-whitespace drafts
    if (!d?.text?.trim()) return null;
    return { text: d.text, fileNames: d.fileNames ?? [] };
  } catch { return null; }
}

function deleteDraft(convId: string) {
  try { localStorage.removeItem(draftKey(convId)); } catch {}
}

const MessageInput: React.FC<{ onFileError?: (message: string) => void }> = ({ onFileError }) => {
  const { state, dispatch } = useAppContext();
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [inputCtxMenu, setInputCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingMentions = useRef<{ name: string; id: string }[]>([]);

  // Draft persistence refs
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevConvId = useRef<string | null>(null);
  const inputTextRef = useRef(inputText); // always-current for use inside timers
  inputTextRef.current = inputText;
  const isSwitching = useRef(false); // suppress auto-save during conversation switch

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
      const maxH = window.innerWidth < 768 ? 96 : 160; // ~4 lines on mobile
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxH)}px`;
    }
  }, [inputText]);

  // ── Conversation switch: save draft for the old chat, restore for the new one
  useEffect(() => {
    const newId = activeConversation?.id ?? null;
    const oldId = prevConvId.current;

    if (oldId && oldId !== newId) {
      // Flush any pending debounce and immediately save the departing draft
      if (draftTimer.current) clearTimeout(draftTimer.current);
      writeDraft(oldId, inputTextRef.current, uploadedFiles.map(f => f.name));
    }

    // Block the file-change effect from firing a spurious save during reset
    isSwitching.current = true;
    setInputText('');
    dispatch({ type: 'CLEAR_UPLOADED_FILES' });
    pendingMentions.current = [];
    setShowMentions(false);

    // Restore saved draft for the incoming conversation
    if (newId) {
      const draft = readDraft(newId);
      if (draft) setInputText(draft.text);
    }

    prevConvId.current = newId;

    // Allow auto-save again after this render cycle completes, then auto-focus
    // the textarea on desktop so the user can type immediately without clicking.
    requestAnimationFrame(() => {
      isSwitching.current = false;
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        textareaRef.current?.focus();
      }
    });
  }, [activeConversation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save draft when uploaded files are added / removed and sync to other devices
  useEffect(() => {
    if (!activeConversation?.id || isSwitching.current) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    const convId = activeConversation.id;
    draftTimer.current = setTimeout(() => {
      const fileNames = uploadedFiles.map(f => f.name);
      writeDraft(convId, inputTextRef.current, fileNames);

      // PHASE 5: Broadcast draft to other devices of this user via socket
      const socket = getSocket();
      if (socket?.connected && (inputTextRef.current.trim() || fileNames.length > 0)) {
        socket.emit('save_draft', {
          conversationId: convId,
          content: inputTextRef.current,
          fileNames,
        });
      }
    }, 500);
  }, [uploadedFiles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const processFiles = (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    // 1. Drop files that individually exceed the size limit and notify
    const oversized = fileList.filter(f => f.size > MAX_FILE_SIZE);
    let valid = fileList.filter(f => f.size <= MAX_FILE_SIZE);

    if (oversized.length > 0) {
      const names = oversized.map(f => `"${f.name}"`).join(', ');
      const msg = oversized.length === 1
        ? `${names} exceeds the ${MAX_FILE_SIZE_MB} MB limit and was removed.`
        : `${oversized.length} files exceed the ${MAX_FILE_SIZE_MB} MB limit and were removed: ${names}`;
      if (onFileError) onFileError(msg);
      dispatch({ type: 'ADD_TOAST', payload: { message: msg, type: 'error' } });
    }

    if (valid.length === 0) return;

    // 2. Enforce max file count — reject ALL new files if total would exceed limit
    if (uploadedFiles.length + valid.length > MAX_FILES) {
      const msg = `You can only send up to ${MAX_FILES} files at a time.`;
      if (onFileError) onFileError(msg);
      dispatch({ type: 'ADD_TOAST', payload: { message: msg, type: 'error' } });
      return;
    }

    const newFiles = valid.map(file => {
      const ext = file.name.split('.').pop() || '';
      const category = getFileCategory(ext);
      return {
        file,
        previewUrl: URL.createObjectURL(file),
        name: file.name,
        size: file.size >= 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${(file.size / 1024).toFixed(1)} KB`,
        type: category,
        mimeType: file.type,
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
      dispatch({ type: 'SET_UPLOADING', payload: true });
      try {
        r2Files = await uploadFilesToR2(uploadedFiles.map(f => f.file), activeConversation.id, undefined, (percentage) => {
          dispatch({ type: 'SET_UPLOAD_PROGRESS', payload: percentage });
        });
      } catch (err: any) {
        dispatch({ type: 'SET_UPLOADING', payload: false });
        toast({
          title: 'Upload failed',
          description: err.message || 'Could not upload files. Please try again.',
          variant: 'destructive',
        });
        setIsSending(false);
        return;
      }
      dispatch({ type: 'SET_UPLOADING', payload: false });
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

    // Clear draft immediately on send — no need to keep it anymore
    if (activeConversation?.id) {
      deleteDraft(activeConversation.id);
      // PHASE 5: Broadcast draft clear to other devices of this user
      socket.emit('clear_draft', { conversationId: activeConversation.id });
    }
    if (draftTimer.current) clearTimeout(draftTimer.current);

    setInputText('');
    pendingMentions.current = [];
    dispatch({ type: 'SET_REPLYING_TO', payload: null });
    dispatch({ type: 'CLEAR_UPLOADED_FILES' });
    setIsSending(false);
    // Keep keyboard open on mobile — refocus the textarea immediately after send
    // so the user can type the next message without tapping to bring the keyboard back
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const extractMentions = (text: string) => {
    const matches = text.match(/@\[(.*?)\]\((.*?)\)/g);
    return matches ? matches.map(m => m.match(/\((.*?)\)/)![1]) : [];
  };

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let value = e.target.value;

    // Auto-convert "- " at the start of a line to "• "
    const lines = value.split('\n');
    const lastLine = lines[lines.length - 1];
    if (lastLine === '- ') {
      lines[lines.length - 1] = '• ';
      value = lines.join('\n');
      setTimeout(() => {
        if (textareaRef.current) textareaRef.current.setSelectionRange(value.length, value.length);
      }, 0);
    }

    setInputText(value);

    // ── Debounced draft save (500 ms after user pauses typing) and sync to other devices
    if (activeConversation?.id && !isSwitching.current) {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      const convId = activeConversation.id;
      draftTimer.current = setTimeout(() => {
        const fileNames = uploadedFiles.map(f => f.name);
        writeDraft(convId, value, fileNames);

        // PHASE 5: Broadcast draft to other devices of this user via socket
        const socket = getSocket();
        if (socket?.connected && (value.trim() || fileNames.length > 0)) {
          socket.emit('save_draft', {
            conversationId: convId,
            content: value,
            fileNames,
          });
        }
      }, 500);
    }

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
      if (atIndex !== -1) {
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
    <div className="p-3 md:p-6 pt-0 relative">
      {isBlockedConversation && (
        <div className="mb-3 md:mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 p-3 md:p-4 text-sm text-destructive animate-in slide-in-from-bottom-2">
          <p className="font-bold">Messages from this user are blocked.</p>
          <p className="text-xs text-destructive/80 mt-1">You will not receive new messages or notifications from this conversation until you unblock them.</p>
        </div>
      )}
      {showMentions && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 md:left-6 md:right-6 mb-2 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-30 animate-in slide-in-from-bottom-2 duration-200">
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
                  <div className="flex flex-col items-center justify-center gap-1 p-1 w-full h-full">
                    <img src={getFileIcon(file.name)} alt="" className="h-9 w-9 object-contain" />
                    <span className="text-[8px] font-bold truncate px-1 w-full text-center leading-tight">{file.name}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                  <button type="button" onClick={() => openPreviewLightbox(idx)} className="p-1 bg-white/20 rounded-lg hover:bg-white/40 text-white transition-colors"><Search className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => dispatch({ type: 'REMOVE_UPLOADED_FILE', payload: idx })} className="p-1 bg-destructive/80 rounded-lg hover:bg-destructive text-white transition-colors"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
            {uploadedFiles.length < MAX_FILES && (
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
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; }}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files); }}
        >
          <textarea
            ref={textareaRef}
            disabled={isEditing || isSending || isBlockedConversation}
            onPaste={handlePaste}
            placeholder={isBlockedConversation ? 'This conversation is blocked. Unblock to send messages.' : isEditing ? 'Finish editing the message above first' : `Message ${activeConversation?.name}...`}
            className="w-full p-3 md:p-4 bg-transparent outline-none resize-none min-h-[48px] md:min-h-[56px] max-h-[96px] md:max-h-[160px] text-sm text-foreground placeholder:text-muted-foreground/60"
            rows={1}
            value={inputText}
            onChange={handleInputChange}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const x = Math.min(e.clientX, window.innerWidth - 150);
              const y = Math.min(e.clientY, window.innerHeight - 50);
              setInputCtxMenu({ x, y });
            }}
            onKeyDown={(e) => {
              if (showMentions) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => (i + 1) % filteredMembers.length); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => (i - 1 + filteredMembers.length) % filteredMembers.length); }
                else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMember(filteredMembers[highlightedIndex]); }
                else if (e.key === 'Escape') { e.preventDefault(); setShowMentions(false); }
              } else if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                e.preventDefault();
                const textarea = textareaRef.current;
                if (!textarea) return;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const selected = inputText.substring(start, end);
                if (selected) {
                  const newText = inputText.substring(0, start) + `**${selected}**` + inputText.substring(end);
                  setInputText(newText);
                  setTimeout(() => textarea.setSelectionRange(start + 2, end + 2), 0);
                }
              } else if (e.key === 'Enter' && !e.shiftKey) {
                // On mobile (touch screen or narrow viewport) let Enter create a newline;
                // the Send button is the primary send action on mobile.
                if (typeof window !== 'undefined' && window.innerWidth < 768) return;
                const textarea = textareaRef.current;
                if (textarea) {
                  const cursorPos = textarea.selectionStart;
                  const currentLine = inputText.substring(0, cursorPos).split('\n').pop() || '';
                  const numberedMatch = currentLine.match(/^(\d+)\. /);
                  if (numberedMatch) {
                    e.preventDefault();
                    const nextNum = parseInt(numberedMatch[1]) + 1;
                    const insert = `\n${nextNum}. `;
                    const newText = inputText.substring(0, cursorPos) + insert + inputText.substring(cursorPos);
                    setInputText(newText);
                    setTimeout(() => textarea.setSelectionRange(cursorPos + insert.length, cursorPos + insert.length), 0);
                    return;
                  }
                }
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <div className="px-3 md:px-4 pb-2 md:pb-3 flex items-center justify-between">
            <div className="flex items-center gap-0.5 md:gap-1">
              {/* On mobile: hide attachment when text is typed to give room for send button */}
              <button
                type="button"
                disabled={isEditing || isSending}
                className={cn(
                  "p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-primary transition-all tap-small",
                  inputText.trim() ? "hidden md:flex" : "flex"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" disabled={isEditing || isSending} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-primary transition-all tap-small">
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
              className={cn(
                'p-2 rounded-xl transition-all flex items-center gap-1.5 md:gap-2 px-3 md:px-5 shadow-lg',
                (inputText.trim() || uploadedFiles.length > 0) && !isEditing && !isSending && !isBlockedConversation
                  ? 'bg-primary text-white hover:bg-primary/90 active:scale-95'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest hidden md:inline">Send</span>
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Custom context menu — appears on right-click in textarea */}
        {inputCtxMenu && (
          <div
            className="fixed bg-card border border-border rounded-lg shadow-2xl py-1 z-[9999]"
            style={{ left: `${inputCtxMenu.x}px`, top: `${inputCtxMenu.y}px` }}
            onMouseLeave={() => setInputCtxMenu(null)}
          >
            <button
              className="w-full px-4 py-2 flex items-center gap-2 hover:bg-muted text-sm font-medium text-foreground transition-colors"
              onClick={async () => {
                setInputCtxMenu(null);
                try {
                  // Try to read clipboard items (images, files, etc.)
                  const items = await navigator.clipboard.read();
                  let processedSomething = false;

                  for (const item of items) {
                    // Check for image types
                    const imageTypes = Array.from(item.types).filter(t => t.startsWith('image/'));
                    if (imageTypes.length > 0) {
                      const blob = await item.getType(imageTypes[0]);
                      const filename = `pasted-image.${imageTypes[0].split('/')[1] || 'png'}`;
                      const file = new File([blob], filename, { type: imageTypes[0] });
                      processFiles([file]);
                      processedSomething = true;
                    }

                    // Check for generic file types (any non-text type)
                    const fileTypes = Array.from(item.types).filter(t => !t.startsWith('text/'));
                    if (fileTypes.length > 0 && !imageTypes.length) {
                      for (const type of fileTypes) {
                        const blob = await item.getType(type);
                        const ext = type.split('/')[1] || 'file';
                        const filename = `pasted-file.${ext}`;
                        const file = new File([blob], filename, { type });
                        processFiles([file]);
                        processedSomething = true;
                      }
                    }
                  }

                  // If no files found, try to paste text
                  if (!processedSomething) {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text) {
                        setInputText(inputText + text);
                        dispatch({ type: 'ADD_TOAST', payload: { message: 'Text pasted', type: 'success' } });
                      }
                    } catch {
                      // Text read failed, no problem
                    }
                  }
                } catch (err) {
                  // Try fallback text-only paste
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                      setInputText(inputText + text);
                      dispatch({ type: 'ADD_TOAST', payload: { message: 'Text pasted', type: 'success' } });
                    }
                  } catch {
                    dispatch({ type: 'ADD_TOAST', payload: { message: 'Could not paste from clipboard', type: 'error' } });
                  }
                }
              }}
            >
              <ClipboardPaste className="h-4 w-4" /> Paste
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageInput;
