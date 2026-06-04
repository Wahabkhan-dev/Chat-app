
"use client";

import React, { useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import Modal from '../ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { Avatar } from '../ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { getSocket } from '@/services/socket';
import { uploadFilesToR2 } from '@/services/upload';
import { getSignedUrl } from '@/services/fileUrl';
import { cn } from '@/lib/utils';

function getDmConvId(id1: string | undefined, id2: string | undefined): string {
  const a = Number(id1);
  const b = Number(id2);
  return `dm_${Math.min(a, b)}_${Math.max(a, b)}`;
}

const ForwardMessageModal: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [search, setSearch] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<{ id: string; name: string; type: 'dm' | 'group' } | null>(null);
  const [isForwarding, setIsForwarding] = useState(false);

  const isOpen = !!state.forwardingMessage;

  const handleClose = () => {
    if (isForwarding) return;
    dispatch({ type: 'SET_FORWARDING_MESSAGE', payload: null });
    setSearch('');
    setSelectedTarget(null);
  };

  const resolveFileSource = async (file: any): Promise<string> => {
    if (file?.key) {
      try {
        return await getSignedUrl(file.key);
      } catch {
        if (file?.previewUrl) return file.previewUrl;
        if (file?.url) return file.url;
        throw new Error(`Unable to resolve source for file ${file?.name || ''}.`);
      }
    }
    if (file?.previewUrl) {
      return file.previewUrl;
    }
    if (file?.url) {
      return file.url;
    }
    throw new Error(`Cannot forward file ${file?.name || ''}. Missing file source.`);
  };

  const normalizeFile = async (file: any): Promise<File> => {
    if (file?.file instanceof File) {
      return file.file;
    }

    const source = await resolveFileSource(file);
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Unable to retrieve file ${file.name || 'attachment'} for forwarding.`);
    }

    const blob = await response.blob();
    return new File([blob], file.name || 'attachment', { type: file.mimeType || blob.type || 'application/octet-stream' });
  };

  const buildForwardFiles = async (messageFiles: any[], conversationId: string) => {
    // Files that already live in R2 — pass the key directly, no re-upload needed
    const persistedFiles = messageFiles
      .filter((file) => file && typeof file.key === 'string' && file.key.trim())
      .map((file) => ({ key: file.key, name: file.name, size: file.size, type: file.type, mimeType: file.mimeType }));

    // Files with no R2 key must be fetched from their source URL and re-uploaded
    const uploadCandidates = messageFiles
      .filter((file) => file && (!file.key || !String(file.key).trim()));

    if (uploadCandidates.length === 0) {
      return persistedFiles;
    }

    const filesToUpload = await Promise.all(uploadCandidates.map(normalizeFile));
    const uploaded = await uploadFilesToR2(filesToUpload, conversationId);
    return [...persistedFiles, ...uploaded];
  };

  const handleForward = async (conversationId: string, targetName: string) => {
    const message = state.forwardingMessage;
    if (!message) return;

    const socket = getSocket();
    if (!socket?.connected) {
      toast({ title: 'Not connected', description: 'Socket is not connected.', variant: 'destructive' });
      return;
    }

    setIsForwarding(true);

    // Build file list first — errors here are caught before we even emit
    let files: any[] = [];
    try {
      files = message.files?.length ? await buildForwardFiles(message.files, conversationId) : [];
    } catch (err: any) {
      toast({ title: 'Forward failed', description: err.message || 'Could not prepare file attachments.', variant: 'destructive' });
      setIsForwarding(false);
      return;
    }

    const rawContent = message.content || '';
    const trimmedContent = rawContent.replace(/^(?:\[Forwarded\]:\s*)+/i, '').trim();
    const content = trimmedContent ? `[Forwarded]: ${trimmedContent}` : '[Forwarded]: ';

    socket.emit(
      'send_message',
      { conversationId, content, type: 'text', files },
      (ack: { success: boolean; message?: any; error?: string }) => {
        setIsForwarding(false);
        if (ack?.success && ack.message) {
          // Merge the resolved files into the dispatched message so attachments render immediately
          dispatch({ type: 'SEND_MESSAGE', payload: { conversationId, message: { ...ack.message, files } } });
          toast({ title: 'Message Forwarded', description: `Sent to ${targetName}` });
          handleClose();
        } else {
          toast({ title: 'Forward failed', description: ack?.error || 'Unable to forward message.', variant: 'destructive' });
        }
      }
    );
  };

  const currentUserId = String(state.currentUser?.id || '');
  const filteredUsers = state.users.filter(u =>
    u.id !== currentUserId &&
    u.isActive &&
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredGroups = state.groups.filter(g =>
    g.members.includes(currentUserId) &&
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Forward Message" maxWidth="max-w-md">
      <div className="p-6 pt-2 space-y-4">
        {state.forwardingMessage && (
          <div className="bg-muted/50 p-3 rounded-xl border border-border">
            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Message</p>
            {state.forwardingMessage.content ? (
              <p className="text-sm text-foreground italic truncate">{state.forwardingMessage.content}</p>
            ) : state.forwardingMessage.files?.length ? (
              <p className="text-sm text-muted-foreground italic">
                📎 {state.forwardingMessage.files.length} attachment{state.forwardingMessage.files.length > 1 ? 's' : ''}: {state.forwardingMessage.files.map(f => f.name).join(', ')}
              </p>
            ) : null}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search people or groups..."
            className="pl-10 rounded-xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm text-foreground">
          <p className="font-semibold">Step 1</p>
          <p className="text-xs text-muted-foreground">Select a recipient, then confirm with Forward.</p>
        </div>

        <ScrollArea className="h-56">
          <div className="space-y-4 pr-2">
            {filteredGroups.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Groups</h4>
                <div className="space-y-1">
                  {filteredGroups.map(g => (
                    <div
                      key={g.id}
                      className={cn(
                        'flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer',
                        selectedTarget?.id === g.id ? 'bg-primary/10 border border-primary' : 'hover:bg-muted'
                      )}
                      onClick={() => setSelectedTarget({ id: g.id, name: g.name, type: 'group' })}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                          {g.name[0]}
                        </div>
                        <span className="text-sm font-semibold">{g.name}</span>
                      </div>
                      <Button size="sm" variant="ghost" className="text-primary hover:bg-primary/10 pointer-events-none">Select</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredUsers.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">People</h4>
                <div className="space-y-1">
                  {filteredUsers.map(u => {
                    const dmId = getDmConvId(state.currentUser?.id, u.id);
                    return (
                      <div
                        key={u.id}
                        className={cn(
                          'flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer',
                          selectedTarget?.id === dmId ? 'bg-primary/10 border border-primary' : 'hover:bg-muted'
                        )}
                        onClick={() => setSelectedTarget({ id: dmId, name: u.name, type: 'dm' })}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} src={u.avatar} size="sm" />
                          <span className="text-sm font-semibold">{u.name}</span>
                        </div>
                        <Button size="sm" variant="ghost" className="text-primary hover:bg-primary/10 pointer-events-none">Select</Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredUsers.length === 0 && filteredGroups.length === 0 && (
              <p className="text-center py-8 text-xs text-muted-foreground italic">No results found</p>
            )}
          </div>
        </ScrollArea>

        {selectedTarget && (
          <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm text-foreground">
            <p className="font-semibold">Selected recipient</p>
            <p className="text-xs text-muted-foreground">Forwarding to {selectedTarget.name} ({selectedTarget.type === 'group' ? 'Group' : 'Direct Message'})</p>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2 border-t border-border sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Button variant="ghost" className="rounded-xl font-bold" onClick={handleClose} disabled={isForwarding}>Cancel</Button>
            <Button
              className="rounded-xl font-bold"
              onClick={() => selectedTarget && handleForward(selectedTarget.id, selectedTarget.name)}
              disabled={!selectedTarget || isForwarding}
            >
              Forward
            </Button>
          </div>
          {selectedTarget && (
            <span className="text-xs text-muted-foreground">Ready to forward to {selectedTarget.name}.</span>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ForwardMessageModal;
