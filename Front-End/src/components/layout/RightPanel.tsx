
"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAppContext } from '@/context/AppContext';
import { setConversationBlockStatus, emitConversationMetadataChanged } from '@/services/conversationMetadata';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { getSignedUrl, downloadFile } from '@/services/fileUrl';
import { Avatar } from '../ui/avatar';
import { 
  X, Mail, Building, Calendar, FileIcon,
  UserPlus, Crown, ChevronRight, Download, MoreVertical,
  Trash2, ShieldCheck, ShieldAlert, LogOut, Edit, Bell,
  BellOff, ExternalLink, Image as ImageIcon, Camera,
  Search, Grid, List, ArrowLeft, ArrowRight,
  MessageSquare, FileText, FileSpreadsheet,
  File as GenericFile, Settings, Save, Shield,
  Radio, VolumeX, CheckCircle2, ChevronDown, UserCircle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';


// Sub-component: "View" button — resolves signed URL then opens in a new tab
const ViewFileButton: React.FC<{ fileKey: string; fileName: string }> = ({ fileKey, fileName }) => {
  const [opening, setOpening] = useState(false);
  const handleView = async () => {
    setOpening(true);
    try {
      const url = await getSignedUrl(fileKey);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // silently ignore
    } finally {
      setOpening(false);
    }
  };
  return (
    <Button variant="ghost" size="sm" className="h-7 text-[9px] font-bold uppercase tracking-wider gap-1" disabled={opening} onClick={handleView}>
      {opening ? <div className="h-3 w-3 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /> : <ExternalLink className="h-3 w-3" />}
      View
    </Button>
  );
};

// Sub-component: resolves R2 key to signed URL for thumbnails in the shared-assets panel
const MediaThumb: React.FC<{ item: { key?: string; url?: string; thumbnail?: string; fileName: string; type?: string }; onClick: () => void; extraContent?: React.ReactNode }> = ({ item, onClick, extraContent }) => {
  const { url: signedUrl } = useSignedUrl(item.key);
  const src = signedUrl || item.url || item.thumbnail || '';
  return (
    <div className="aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer group relative" onClick={onClick}>
      {src ? (
        <img src={src} alt={item.fileName} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <Search className="h-5 w-5 text-white" />
      </div>
      {extraContent}
    </div>
  );
};

// Sub-component: signed URL for group avatar (R2 key or legacy direct URL)
const GroupAvatarDisplay: React.FC<{ avatar: string | null; name: string }> = ({ avatar, name }) => {
  const isR2Key = !!avatar && (avatar.startsWith('group-avatars/') || avatar.startsWith('chats/'));
  const { url: signedUrl } = useSignedUrl(isR2Key ? avatar! : undefined);
  const src = isR2Key ? signedUrl : avatar;
  if (src) return <img src={src} alt={name} className="w-full h-full object-cover" />;
  return <span>{name[0]}</span>;
};

const RightPanel: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const conversation = state.activeConversation;
  const panel = state.rightPanel;

  const [transferTargetId, setTransferOwnershipTargetId] = useState<string>('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editingDescription, setEditingDescription] = useState('');
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [panelWidth, setPanelWidth] = useState(320);
  const [isMobile, setIsMobile] = useState(false);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(320);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = panelWidth;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [panelWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - e.clientX;
      const newWidth = Math.min(500, Math.max(260, dragStartWidth.current + delta));
      setPanelWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const mediaItems = useMemo(() => {
    if (!conversation?.id) return [];
    return state.sharedFiles
      .filter(f => f.conversationId === conversation.id && (f.type === 'image' || f.type === 'video'))
      .map(f => ({
        id: f.id,
        key: f.key,
        url: f.previewUrl || '',
        thumbnail: f.previewUrl || '',
        fileName: f.name,
        fileSize: f.size,
        timestamp: f.timestamp,
        senderId: f.uploadedBy,
        type: f.type,
      }));
  }, [state.sharedFiles, conversation?.id]);

  const fileItems = useMemo(() => {
    if (!conversation?.id) return [];
    return state.sharedFiles
      .filter(f => f.conversationId === conversation.id && f.type !== 'image' && f.type !== 'video' && f.type !== 'link')
      .map(f => ({
        id: f.id,
        key: f.key,
        fileName: f.name,
        fileType: f.type,
        fileSize: f.size,
        timestamp: f.timestamp,
        senderId: f.uploadedBy,
        url: f.previewUrl,
      }));
  }, [state.sharedFiles, conversation?.id]);

  const linksItems = useMemo(() => {
    if (!conversation?.id) return [];
    return state.sharedFiles
      .filter(f => f.conversationId === conversation.id && f.type === 'link')
      .map(f => ({
        id: f.id,
        url: f.previewUrl || '',
        title: f.name,
        domain: f.size || '',
        sharedBy: f.uploadedBy,
        timestamp: f.timestamp,
      }));
  }, [state.sharedFiles, conversation?.id]);

  if (!conversation) return null;

  const handleClose = () => dispatch({ type: 'TOGGLE_RIGHT_PANEL', payload: false });
  const isGroup = conversation.type === 'group';
  const group = isGroup ? state.groups.find(g => g.id === conversation.id) : null;
  const hasLeftGroup = isGroup && !!state.conversationMeta[conversation.id]?.leftAt;
  const leftReason = state.conversationMeta[conversation.id]?.leftReason;
  const isAdmin = (uid: string) => group?.admins.includes(uid) || state.currentUser?.role === 'admin';
  const isMeAdmin = state.currentUser ? isAdmin(state.currentUser.id) : false;
  const isMeOwner = state.currentUser?.id === group?.ownerId;

  const handleJumpToMessage = (messageId: string) => {
    const element = document.getElementById(`msg-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('bg-yellow-100/50');
      setTimeout(() => element.classList.remove('bg-yellow-100/50'), 2000);
      handleClose();
    }
  };

  const handleKickMember = (user: any) => {
    dispatch({
      type: 'OPEN_MODAL',
      payload: {
        type: 'confirm',
        data: {
          title: 'Remove Member',
          confirmStyle: 'danger',
          body: `Are you sure you want to remove ${user.name} from this group? They will lose access immediately.`,
          confirmLabel: 'Remove Member',
          onConfirm: async () => {
            try {
              await api.delete(`/groups/${group!.id}/members/${user.id}`);
              // State update is handled by the socket 'group_member_left' broadcast — no local dispatch needed
              dispatch({ type: 'ADD_TOAST', payload: { message: `${user.name} removed from group`, type: 'info' } });
            } catch {
              dispatch({ type: 'ADD_TOAST', payload: { message: `Failed to remove ${user.name}`, type: 'error' } });
            }
          }
        }
      }
    });
  };

  const handlePromoteAdmin = (userId: string) => {
    const user = state.users.find(u => u.id === userId);
    dispatch({
      type: 'PROMOTE_TO_ADMIN',
      payload: {
        groupId: group!.id,
        userId,
        systemMessage: {
          id: `sys${Date.now()}`,
          senderId: 'system',
          content: `${user?.name} is now a group admin`,
          timestamp: new Date().toISOString(),
          type: 'text',
          reactions: []
        }
      }
    });
    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: {
        id: `p_${Date.now()}`,
        type: 'promoted',
        recipientId: userId,
        title: 'You are now a group admin',
        body: `${state.currentUser?.name} made you admin of ${group!.name}`,
        timestamp: new Date().toISOString(),
        read: false
      }
    });
    dispatch({ type: 'ADD_TOAST', payload: { message: `ðŸ‘‘ ${user?.name} promoted to Admin`, type: 'success' } });
  };

  const handleTransferOwnership = () => {
    if (!transferTargetId || !group) return;
    const targetUser = state.users.find(u => u.id === transferTargetId);
    
    dispatch({
      type: 'OPEN_MODAL',
      payload: {
        type: 'confirm',
        data: {
          title: 'Transfer Group Ownership',
          body: `Transfer ownership of "${group.name}" to ${targetUser?.name}? You will remain a group admin but will lose ownership privileges.`,
          confirmLabel: 'Transfer Ownership',
          confirmStyle: 'danger',
          onConfirm: async () => {
            dispatch({
              type: 'TRANSFER_OWNERSHIP',
              payload: {
                groupId: group.id,
                oldOwnerId: state.currentUser!.id,
                newOwnerId: transferTargetId,
                systemMessage: {
                  id: `sys_own_${Date.now()}`,
                  senderId: 'system',
                  content: `Ownership of the group was transferred to ${targetUser?.name}`,
                  timestamp: new Date().toISOString(),
                  type: 'text',
                  reactions: []
                }
              }
            });
            dispatch({
              type: 'ADD_NOTIFICATION',
              payload: {
                id: `own_${Date.now()}`,
                type: 'ownership_transferred',
                recipientId: transferTargetId,
                title: 'You are now the group owner',
                body: `${state.currentUser?.name} transferred ownership of ${group.name} to you`,
                timestamp: new Date().toISOString(),
                read: false
              }
            });
            dispatch({ type: 'ADD_TOAST', payload: { message: `âœ… Ownership transferred to ${targetUser?.name}`, type: 'success' } });
            setTransferOwnershipTargetId('');
          }
        }
      }
    });
  };

  const handleGroupImageUpload = async (file: File) => {
    if (!group) return;
    setIsUploadingImage(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('teams_token') : null;
      const formData = new FormData();
      formData.append('avatar', file);
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${BASE_URL}/groups/${group.id}/info`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      dispatch({ type: 'UPDATE_GROUP', payload: data.group });
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Group image updated', type: 'success' } });
    } catch {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to upload image', type: 'error' } });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSaveGroupName = async () => {
    if (!group || !editingName.trim() || editingName.trim() === group.name) {
      setIsEditingName(false);
      return;
    }
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('teams_token') : null;
      const formData = new FormData();
      formData.append('name', editingName.trim());
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${BASE_URL}/groups/${group.id}/info`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Update failed');
      const data = await res.json();
      dispatch({ type: 'UPDATE_GROUP', payload: data.group });
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Group name updated', type: 'success' } });
    } catch {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to update group name', type: 'error' } });
    }
    setIsEditingName(false);
  };

  const handleSaveGroupDescription = async () => {
    if (!group || editingDescription.trim() === group.description) {
      setIsEditingDescription(false);
      return;
    }
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('teams_token') : null;
      const formData = new FormData();
      formData.append('description', editingDescription.trim());
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${BASE_URL}/groups/${group.id}/info`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Update failed');
      const data = await res.json();
      dispatch({ type: 'UPDATE_GROUP', payload: data.group });
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Group description updated', type: 'success' } });
    } catch {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to update group description', type: 'error' } });
    }
    setIsEditingDescription(false);
  };

  const handleDownloadFile = async (id: string, key: string | undefined, fileName: string) => {
    if (!key) return;
    setDownloadingIds(prev => new Set(prev).add(id));
    try {
      await downloadFile(key, fileName);
    } catch {
      dispatch({ type: 'ADD_TOAST', payload: { message: `Failed to download ${fileName}`, type: 'error' } });
    } finally {
      setDownloadingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const renderTabContent = () => {
    switch (panel.activeTab) {
      case 'members':
        if (!isGroup) return null;
        const canAdd = !hasLeftGroup && (group?.settings.addMemberPermission === 'everyone' || isMeAdmin);
        const members = state.users.filter(u => group?.members.includes(u.id));
        return (
          <div className="p-4 space-y-4">
            {hasLeftGroup && (
              <div className="bg-muted/40 border border-border rounded-2xl p-4 text-sm text-muted-foreground">
                <p className="font-bold text-foreground uppercase tracking-[0.28em] mb-2">Group Access Restricted</p>
                <p>{leftReason === 'removed' ? 'You were removed from this group. You can still view the history but cannot send messages or manage members.' : 'You left this group. You can still view the history but cannot send messages or manage members.'}</p>
              </div>
            )}
            {canAdd && (
              <Button 
                variant="outline" 
                className="w-full justify-start gap-2 h-9 border-dashed border-primary/50 text-primary hover:bg-primary/5 rounded-xl font-bold text-xs"
                onClick={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'addMember', data: { group } } })}
              >
                <UserPlus className="h-4 w-4" /> Add Team Member
              </Button>
            )}
            <div className="space-y-2">
              {members.map(member => (
                <div key={member.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-xl group transition-all">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={member.name} src={member.avatar} size="sm" status={member.status} showStatus />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate text-foreground">{member.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {group?.ownerId === member.id && (
                          <div className="flex items-center gap-1 text-[9px] text-orange-600 font-bold uppercase tracking-tighter">
                            <Crown className="h-2.5 w-2.5" />
                            <span>Owner</span>
                          </div>
                        )}
                        {group?.admins.includes(member.id) && group.ownerId !== member.id && (
                          <div className="flex items-center gap-1 text-[9px] text-primary font-bold uppercase tracking-tighter">
                            <ShieldCheck className="h-2.5 w-2.5" />
                            <span>Admin</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Own row — show Leave option for any non-owner member */}
                  {member.id === state.currentUser?.id && group?.ownerId !== member.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 hover:bg-muted rounded-lg text-muted-foreground"><MoreVertical className="h-3.5 w-3.5" /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="left" align="start" className="bg-card border-border min-w-[160px] rounded-xl shadow-xl z-[var(--z-dropdown)]">
                        <DropdownMenuItem className="text-destructive focus:bg-destructive/10" onClick={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'leaveGroup', data: { group } } })}>
                          <LogOut className="h-4 w-4" /> Leave Group
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {/* Other members' row — admin-only actions */}
                  {isMeAdmin && member.id !== state.currentUser?.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 hover:bg-muted rounded-lg text-muted-foreground"><MoreVertical className="h-3.5 w-3.5" /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="left" align="start" className="bg-card border-border min-w-[160px] rounded-xl shadow-xl z-[var(--z-dropdown)]">
                        {!group?.admins.includes(member.id) ? (
                          <DropdownMenuItem onClick={() => handlePromoteAdmin(member.id)}>
                            <ShieldCheck className="h-4 w-4 text-secondary" /> Make Group Admin
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            disabled={group?.ownerId === member.id}
                            onClick={() => dispatch({ type: 'DEMOTE_FROM_ADMIN', payload: { groupId: group!.id, userId: member.id, systemMessage: { id: `dem_${Date.now()}`, senderId: 'system', content: `${member.name} is no longer an admin`, timestamp: new Date().toISOString(), type: 'text', reactions: [] } } })}
                          >
                            <ShieldAlert className="h-4 w-4 text-muted-foreground" /> Remove Admin Role
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:bg-destructive/10" onClick={() => handleKickMember(member)}>
                          <Trash2 className="h-4 w-4" /> Remove from Group
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 'about':
        if (isGroup) {
          if (hasLeftGroup) {
            return (
              <div className="p-6 flex flex-col items-center text-center space-y-4">
                <div className="bg-muted/40 border border-border rounded-3xl p-6 space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <LogOut className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-bold">{leftReason === 'removed' ? 'Removed from group' : 'You left the group'}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {leftReason === 'removed'
                      ? 'You were removed by an admin. You can still view the group history, but you cannot send messages, add members, or change settings.'
                      : 'You left the group. You can still view the group history, but you cannot send messages, add members, or change settings.'}
                  </p>
                </div>
                <Button variant="outline" className="w-full gap-2 h-11 rounded-xl" onClick={() => dispatch({ type: 'DISMISS_LEFT_GROUP', payload: group.id })}>
                  <Trash2 className="h-4 w-4" /> Remove from panel
                </Button>
              </div>
            );
          }
          return (
            <div className="p-6 flex flex-col items-center text-center">
              <div className="h-20 w-20 rounded-2xl bg-secondary flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-secondary/20 relative overflow-hidden">
                <GroupAvatarDisplay avatar={group?.avatar || null} name={group?.name || ''} />
                {isMeAdmin && (
                  <>
                    <button
                      className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={isUploadingImage}
                    >
                      {isUploadingImage ? <div className="h-5 w-5 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : <Camera className="h-6 w-6 text-white" />}
                    </button>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => e.target.files?.[0] && handleGroupImageUpload(e.target.files[0])}
                    />
                  </>
                )}
              </div>
              {isMeAdmin && isEditingName ? (
                <div className="mt-4 flex items-center gap-2 w-full">
                  <input
                    autoFocus
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveGroupName(); if (e.key === 'Escape') setIsEditingName(false); }}
                    className="flex-1 text-lg font-bold font-headline text-center bg-muted border border-border rounded-lg px-3 py-1 focus:outline-none focus:border-primary"
                  />
                  <button onClick={handleSaveGroupName} className="p-1.5 bg-primary text-white rounded-lg hover:bg-primary/90"><Save className="h-4 w-4" /></button>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-2">
                  <h2 className="text-xl font-bold font-headline text-foreground">{group?.name}</h2>
                  {isMeAdmin && (
                    <button onClick={() => { setEditingName(group?.name || ''); setIsEditingName(true); }} className="p-1 text-muted-foreground hover:text-primary">
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
              {isMeAdmin && isEditingDescription ? (
                <div className="mt-4 w-full space-y-3">
                  <Textarea
                    autoFocus
                    value={editingDescription}
                    onChange={e => setEditingDescription(e.target.value)}
                    className="min-h-[100px] resize-none rounded-2xl border border-border bg-muted px-3 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
                    placeholder="Add a description for this group..."
                    onKeyDown={e => { if (e.key === 'Escape') setIsEditingDescription(false); }}
                  />
                  <div className="flex items-center justify-center gap-2">
                    <Button size="sm" className="h-10 px-4" onClick={handleSaveGroupDescription}>
                      Save Description
                    </Button>
                    <Button variant="outline" size="sm" className="h-10 px-4" onClick={() => setIsEditingDescription(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-center">
                  <p className="text-xs text-muted-foreground leading-relaxed px-4">{group?.description || 'No description provided.'}</p>
                  {isMeAdmin && (
                    <button
                      onClick={() => { setEditingDescription(group?.description || ''); setIsEditingDescription(true); }}
                      className="mt-3 text-[11px] font-bold uppercase tracking-[0.24em] text-primary hover:text-primary/80"
                    >
                      {group?.description ? 'Edit description' : 'Add description'}
                    </button>
                  )}
                </div>
              )}
              <div className="w-full mt-8 space-y-3">
                {!hasLeftGroup && (
                  <Button 
                    variant="outline" 
                    className="w-full gap-2 rounded-xl h-11 border-border" 
                    onClick={() => dispatch({ type: group?.muted ? 'UNMUTE_CONVERSATION' : 'MUTE_CONVERSATION', payload: { conversationId: group!.id, muteUntil: null } })}
                  >
                    {group?.muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                    <span>{group?.muted ? 'Unmute Group' : 'Mute Notifications'}</span>
                  </Button>
                )}
                {!hasLeftGroup && group?.ownerId !== state.currentUser?.id && (
                  <Button variant="ghost" className="w-full text-destructive hover:bg-destructive/10 gap-2 h-11 rounded-xl" onClick={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'leaveGroup', data: { group } } })}>
                    <LogOut className="h-4 w-4" /> Leave Group
                  </Button>
                )}
                {hasLeftGroup && (
                  <Button variant="ghost" className="w-full border-border gap-2 h-11 rounded-xl" onClick={() => dispatch({ type: 'DISMISS_LEFT_GROUP', payload: group!.id })}>
                    <Trash2 className="h-4 w-4" /> Remove from panel
                  </Button>
                )}
              </div>
            </div>
          );
        } else {
          const dmParts = conversation.id.split('_');
          const userId = dmParts[1] === String(state.currentUser?.id) ? dmParts[2] : dmParts[1];
          const user = state.users.find(u => u.id === userId);
          const isBlocked = state.conversationMeta[conversation.id]?.blocked;
          return (
            <div className="p-6 flex flex-col items-center text-center">
              <Avatar name={user?.name || ''} src={user?.avatar} size="xl" status={user?.status} showStatus />
              <h2 className="mt-4 text-xl font-bold font-headline text-foreground">{user?.name}</h2>
              <Badge variant="secondary" className="mt-2 bg-secondary/10 text-secondary border-none uppercase tracking-tighter">{user?.role}</Badge>
              
              <div className="w-full mt-8 space-y-4 text-left">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-lg text-muted-foreground"><Mail className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Email</p>
                    <p className="text-sm font-bold truncate">{user?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-lg text-muted-foreground"><Building className="h-4 w-4" /></div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Department</p>
                    <p className="text-sm font-bold">{user?.department}</p>
                  </div>
                </div>
              </div>

              <div className="w-full mt-8 flex flex-col gap-3">
                <div className="flex gap-3">
                  <Button className="flex-1 rounded-xl h-11 bg-primary text-white hover:bg-primary/90">Message</Button>
                  <Button variant="outline" className="flex-1 rounded-xl h-11 border-border" onClick={() => {
                    navigator.clipboard.writeText(user?.email || '');
                    dispatch({ type: 'ADD_TOAST', payload: { message: 'Email copied to clipboard!', type: 'success' } });
                  }}>Copy Email</Button>
                </div>
                <Button 
                  variant="ghost" 
                  className={cn("w-full gap-2 rounded-xl h-11", isBlocked ? "text-green-600 hover:bg-green-500/10" : "text-destructive hover:bg-destructive/5")}
                  onClick={() => {
                    dispatch({
                      type: 'OPEN_MODAL',
                      payload: {
                        type: 'confirm',
                        data: {
                          title: isBlocked ? `Unblock ${user?.name || 'this user'}?` : `Block ${user?.name || 'this user'}?`,
                          body: isBlocked
                            ? `Unblocking will allow ${user?.name || 'this user'} to send you direct messages again.`
                            : `Blocking will prevent ${user?.name || 'this user'} from sending you direct messages or notifications.`,
                          confirmLabel: isBlocked ? 'Unblock' : 'Block',
                          confirmStyle: isBlocked ? 'default' : 'danger',
                          onConfirm: async () => {
                            try {
                              const success = await setConversationBlockStatus(conversation.id, !isBlocked);
                              if (!success) throw new Error('Unable to update block status');
                              dispatch({ type: isBlocked ? 'UNBLOCK_USER' : 'BLOCK_USER', payload: conversation.id });
                              emitConversationMetadataChanged(conversation.id, isBlocked ? 'unblock' : 'block', !isBlocked);
                              dispatch({ type: 'ADD_TOAST', payload: { message: isBlocked ? `${user?.name || 'User'} has been unblocked.` : `${user?.name || 'User'} has been blocked.`, type: 'success' } });
                            } catch (error) {
                              console.error('[RightPanel] Block state update failed:', error);
                              dispatch({ type: 'ADD_TOAST', payload: { message: `Failed to ${isBlocked ? 'unblock' : 'block'} ${user?.name || 'user'}.`, type: 'error' } });
                            }
                          },
                        },
                      },
                    });
                  }}
                >
                  {isBlocked ? <CheckCircle2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  {isBlocked ? 'Unblock User' : 'Block User'}
                </Button>
              </div>
            </div>
          );
        }

      case 'settings':
        if (!isGroup || !isMeAdmin) return null;
        return (
          <div className="p-6 space-y-8 animate-in fade-in duration-300">
            <div>
               <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                 <Shield className="h-3.5 w-3.5" /> Messaging Mode
               </h4>
               <RadioGroup
                value={group?.settings?.messagePermission || 'all'}
                onValueChange={async (val: any) => {
                  dispatch({ type: 'UPDATE_GROUP_SETTINGS', payload: { groupId: group!.id, settings: { messagePermission: val } } });
                  dispatch({ type: 'SEND_MESSAGE', payload: { conversationId: group!.id, message: { id: `set_${Date.now()}`, senderId: 'system', content: val === 'admin_only' ? `Only admins can send messages now. Changed by ${state.currentUser?.name}.` : `Everyone can send messages again. Changed by ${state.currentUser?.name}.`, timestamp: new Date().toISOString(), type: 'text', reactions: [] } } });
                  dispatch({ type: 'ADD_TOAST', payload: { message: `✅ Messaging set to ${val === 'admin_only' ? 'Admins Only' : 'Everyone'}`, type: 'info' } });
                  try { await api.put(`/groups/${group!.id}`, { settings: { messagePermission: val } }); } catch { /* best-effort */ }
                }}
                className="space-y-3"
               >
                  <label className="flex items-center justify-between p-3 rounded-xl border border-border bg-card cursor-pointer hover:bg-muted/50 transition-all">
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold">Everyone</p>
                      <p className="text-[10px] text-muted-foreground">All members can post and reply</p>
                    </div>
                    <RadioGroupItem value="all" className="h-5 w-5" />
                  </label>
                  <label className="flex items-center justify-between p-3 rounded-xl border border-border bg-card cursor-pointer hover:bg-muted/50 transition-all">
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold">Only Admins</p>
                      <p className="text-[10px] text-muted-foreground">Members can only read and react</p>
                    </div>
                    <RadioGroupItem value="admin_only" className="h-5 w-5" />
                  </label>
               </RadioGroup>
            </div>

            <div>
               <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                 <UserPlus className="h-3.5 w-3.5" /> Administration
               </h4>
               <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold">Who can add members?</p>
                      <p className="text-[10px] text-muted-foreground">{group?.settings.addMemberPermission === 'everyone' ? 'All members' : 'Admins only'}</p>
                    </div>
                    <Switch
                      checked={group?.settings.addMemberPermission === 'everyone'}
                      onCheckedChange={async (checked) => {
                        const val = checked ? 'everyone' : 'admin_only';
                        dispatch({ type: 'UPDATE_GROUP_SETTINGS', payload: { groupId: group!.id, settings: { addMemberPermission: val } } });
                        dispatch({ type: 'SEND_MESSAGE', payload: { conversationId: group!.id, message: { id: `set_${Date.now()}`, senderId: 'system', content: checked ? `Anyone can now add members. Changed by ${state.currentUser?.name}.` : `Only admins can add members now. Changed by ${state.currentUser?.name}.`, timestamp: new Date().toISOString(), type: 'text', reactions: [] } } });
                        try { await api.put(`/groups/${group!.id}`, { settings: { addMemberPermission: val } }); } catch { /* best-effort */ }
                      }}
                    />
                  </div>
               </div>
            </div>

            {isMeOwner && (
              <div>
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Crown className="h-3.5 w-3.5" /> Transfer Ownership
                </h4>
                <div className="p-4 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 space-y-4">
                  <p className="text-[11px] text-orange-800 dark:text-orange-300 leading-relaxed font-medium">
                    Select a team member to transfer ownership of this group. You will remain an admin but will lose ownership privileges.
                  </p>
                  <div className="flex flex-col gap-3">
                    <Select value={transferTargetId} onValueChange={setTransferOwnershipTargetId}>
                      <SelectTrigger className="bg-card border-orange-200 dark:border-orange-800 h-10 text-xs rounded-xl">
                        <SelectValue placeholder="Select new owner..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {state.users
                          .filter(u => group?.members.includes(u.id) && u.id !== state.currentUser?.id)
                          .map(u => (
                            <SelectItem key={u.id} value={u.id} className="text-xs">
                              {u.name} ({u.department})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      onClick={handleTransferOwnership}
                      disabled={!transferTargetId}
                      variant="outline" 
                      className="w-full h-10 rounded-xl border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 hover:text-orange-800 dark:hover:text-orange-300 font-bold text-[11px] uppercase tracking-wider"
                    >
                      <ArrowRight className="h-3.5 w-3.5 mr-2" /> Transfer Group Ownership
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-6 border-t">
              <h4 className="text-[10px] font-bold text-destructive uppercase tracking-widest mb-4">Danger Zone</h4>
              <div className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full justify-between h-11 rounded-xl border-destructive/20 text-destructive hover:bg-destructive/5 font-bold text-xs"
                  onClick={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'confirm', data: { title: 'Delete Group', body: `Are you sure you want to permanently delete "${group?.name}"? This cannot be undone.`, confirmLabel: 'Delete Permanently', confirmStyle: 'danger', requireName: group?.name, onConfirm: async () => { try { await api.delete(`/groups/${group!.id}`); dispatch({ type: 'DELETE_GROUP', payload: group!.id }); } catch { dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to delete group', type: 'error' } }); } } } } })}
                >
                  Delete Group
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        );

      case 'media':
        return (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Media Files</h4>
              <div className="flex gap-1 bg-muted p-1 rounded-lg">
                <button 
                  onClick={() => dispatch({ type: 'SET_MEDIA_VIEW', payload: 'grid' })}
                  className={cn("p-1.5 rounded-md", panel.mediaView === 'grid' ? "bg-card shadow-sm text-primary" : "text-muted-foreground")}
                >
                  <Grid className="h-3.5 w-3.5" />
                </button>
                <button 
                  onClick={() => dispatch({ type: 'SET_MEDIA_VIEW', payload: 'list' })}
                  className={cn("p-1.5 rounded-md", panel.mediaView === 'list' ? "bg-card shadow-sm text-primary" : "text-muted-foreground")}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            
            {mediaItems.length > 0 ? (
              panel.mediaView === 'grid' ? (
                <div className="grid grid-cols-3 gap-2">
                  {mediaItems.map((item, idx) => (
                    <MediaThumb
                      key={item.id}
                      item={item}
                      onClick={() => dispatch({ type: 'OPEN_GALLERY', payload: { items: mediaItems.map(m => ({ key: m.key, url: m.url, name: m.fileName, type: (m.type || 'image') as any, size: m.fileSize })), index: idx } })}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {mediaItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-xl group transition-all">
                      <div className="h-12 w-12 shrink-0">
                        <MediaThumb item={item} onClick={() => dispatch({ type: 'OPEN_GALLERY', payload: { items: mediaItems.map(m => ({ key: m.key, url: m.url, name: m.fileName, type: (m.type || 'image') as any, size: m.fileSize })), index: idx } })} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{item.fileName}</p>
                        <p className="text-[10px] text-muted-foreground">{item.fileSize} • {format(new Date(item.timestamp), 'MMM d')}</p>
                      </div>
                      <button
                        disabled={downloadingIds.has(item.id)}
                        className="p-1.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all disabled:opacity-50"
                        onClick={() => handleDownloadFile(item.id, item.key, item.fileName)}
                      >
                        {downloadingIds.has(item.id) ? <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /> : <Download className="h-4 w-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="py-12 text-center opacity-50">
                <ImageIcon className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs">No media shared yet</p>
              </div>
            )}
          </div>
        );

      case 'files':
        return (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Shared Documents</h4>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px] font-bold uppercase border border-transparent hover:border-border">
                    Sort: {panel.filesSort} <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card min-w-[140px] rounded-xl z-[var(--z-dropdown)]">
                  <DropdownMenuItem onClick={() => dispatch({ type: 'SET_FILES_SORT', payload: 'newest' })}>Newest First</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => dispatch({ type: 'SET_FILES_SORT', payload: 'largest' })}>Largest First</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => dispatch({ type: 'SET_FILES_SORT', payload: 'nameAZ' })}>Name A-Z</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {fileItems.length > 0 ? (
              <div className="space-y-1">
                {fileItems.map(file => (
                  <div key={file.id} className="p-2 hover:bg-muted/50 rounded-xl group transition-all flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg shrink-0">
                        {file.fileType === 'pdf' ? <FileText className="h-4 w-4 text-red-500" /> : 
                         file.fileType === 'xlsx' ? <FileSpreadsheet className="h-4 w-4 text-green-600" /> :
                         <GenericFile className="h-4 w-4 text-blue-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{file.fileName}</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">
                          {file.fileSize} â€¢ {format(new Date(file.timestamp), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost" size="sm" className="h-7 text-[9px] font-bold uppercase tracking-wider gap-1"
                        disabled={downloadingIds.has(file.id)}
                        onClick={() => handleDownloadFile(file.id, file.key, file.fileName)}
                      >
                        {downloadingIds.has(file.id) ? <div className="h-3 w-3 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" /> : <Download className="h-3 w-3" />}
                        Download
                      </Button>
                      {file.key && (
                        <ViewFileButton fileKey={file.key} fileName={file.fileName} />
                      )}
                      <Button variant="ghost" size="sm" className="h-7 text-[9px] font-bold uppercase tracking-wider gap-1" onClick={() => handleJumpToMessage(file.id)}>
                        <MessageSquare className="h-3 w-3" /> Jump
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center opacity-50">
                <FileIcon className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs">No files shared yet</p>
              </div>
            )}
          </div>
        );

      case 'links':
        return (
          <div className="p-4 space-y-4">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Shared Links</h4>
            {linksItems.length > 0 ? (
              <div className="space-y-3">
                {linksItems.map(link => (
                  <div key={link.id} className="p-3 bg-muted/30 rounded-xl border border-border group hover:border-primary/30 transition-all">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="text-xs font-bold truncate text-primary">{link.title}</p>
                      </div>
                      <button onClick={() => window.open(link.url, '_blank')} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-primary">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-1">{link.url}</p>
                    {link.domain && <p className="text-[10px] text-muted-foreground mt-0.5">{link.domain}</p>}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[9px] font-bold uppercase text-muted-foreground">Shared by {state.users.find(u => u.id === link.sharedBy)?.name}</p>
                      <p className="text-[9px] text-muted-foreground">{format(new Date(link.timestamp), 'MMM d')}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center opacity-50">
                <ExternalLink className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs">No links shared yet</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Mobile: full-screen backdrop */}
      {panel.open && (
        <div
          className="fixed inset-0 bg-black/40 z-[var(--z-right-panel)] md:hidden"
          onClick={handleClose}
        />
      )}
    <div
      className={cn(
        "border-l bg-card text-card-foreground flex flex-col shrink-0 fixed right-0 transition-transform duration-300 z-[var(--z-right-panel)] shadow-2xl",
        "top-0 h-[100dvh]",
        "md:top-[56px] md:h-[calc(100vh-56px)]",
        panel.open ? "translate-x-0" : "translate-x-full shadow-none"
      )}
      style={{ width: isMobile ? '100%' : `${panelWidth}px` }}
    >
      {/* Drag-to-resize handle */}
      <div
        className="absolute left-0 top-0 h-full w-1 cursor-ew-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10"
        onMouseDown={handleResizeMouseDown}
      />
      {/* Panel Header */}
      <div className="h-14 border-b flex items-center justify-between px-6 bg-card/50">
        <h3 className="font-bold text-sm">{isGroup ? 'Group Info' : 'User Profile'}</h3>
        <button onClick={handleClose} className="p-2 hover:bg-muted rounded-full text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card sticky top-0 z-10 overflow-x-auto scrollbar-hide">
        {isGroup && (
          <button 
            onClick={() => dispatch({ type: 'SET_RIGHT_PANEL_TAB', payload: 'members' })}
            className={cn("px-4 py-3 text-[9px] font-bold tracking-widest relative transition-colors shrink-0", panel.activeTab === 'members' ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            MEMBERS
            {panel.activeTab === 'members' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary" />}
          </button>
        )}
        <button 
          onClick={() => dispatch({ type: 'SET_RIGHT_PANEL_TAB', payload: 'about' })}
          className={cn("px-4 py-3 text-[9px] font-bold tracking-widest relative transition-colors shrink-0", panel.activeTab === 'about' ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          ABOUT
          {panel.activeTab === 'about' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary" />}
        </button>
        <button 
          onClick={() => dispatch({ type: 'SET_RIGHT_PANEL_TAB', payload: 'media' })}
          className={cn("px-4 py-3 text-[9px] font-bold tracking-widest relative transition-colors shrink-0", panel.activeTab === 'media' ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          MEDIA
          {panel.activeTab === 'media' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary" />}
        </button>
        <button 
          onClick={() => dispatch({ type: 'SET_RIGHT_PANEL_TAB', payload: 'files' })}
          className={cn("px-4 py-3 text-[9px] font-bold tracking-widest relative transition-colors shrink-0", panel.activeTab === 'files' ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          FILES
          {panel.activeTab === 'files' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary" />}
        </button>
        <button 
          onClick={() => dispatch({ type: 'SET_RIGHT_PANEL_TAB', payload: 'links' })}
          className={cn("px-4 py-3 text-[9px] font-bold tracking-widest relative transition-colors shrink-0", panel.activeTab === 'links' ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          LINKS
          {panel.activeTab === 'links' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary" />}
        </button>
        {isGroup && isMeAdmin && !hasLeftGroup && (
          <button 
            onClick={() => dispatch({ type: 'SET_RIGHT_PANEL_TAB', payload: 'settings' })}
            className={cn("px-4 py-3 text-[9px] font-bold tracking-widest relative transition-colors shrink-0", panel.activeTab === 'settings' ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            SETTINGS
            {panel.activeTab === 'settings' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary" />}
          </button>
        )}
      </div>

      {/* Content Area */}
      <ScrollArea className="flex-1">
        {renderTabContent()}
      </ScrollArea>
    </div>
    </>
  );
};

export default RightPanel;
