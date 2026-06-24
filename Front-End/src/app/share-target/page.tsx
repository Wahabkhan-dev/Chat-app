"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, Share2 } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { uploadFilesToR2 } from '@/services/upload';
import { connectSocket, getSocket } from '@/services/socket';
import { getCurrentUser } from '@/services/auth';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const SHARE_CACHE = 'mawby-share-target';

// Mirror the DM conversation-id format used across the app (Sidebar / ForwardMessageModal).
function getDmConvId(id1: string | undefined, id2: string | undefined): string {
  const a = Number(id1);
  const b = Number(id2);
  return `dm_${Math.min(a, b)}_${Math.max(a, b)}`;
}

interface SharedPayload {
  text: string;
  files: File[];
}

interface DirectoryUser {
  id: string;
  name: string;
  avatar?: string;
  is_active?: number;
}

interface DirectoryGroup {
  id: string;
  name: string;
  members: string[];
}

type Target = { id: string; name: string; type: 'dm' | 'group' };

// Read the payload the service worker stashed in Cache Storage, rebuild File
// objects, then clear the stash so it can't be re-sent on a later visit.
async function readSharedPayload(): Promise<SharedPayload> {
  const empty: SharedPayload = { text: '', files: [] };
  if (typeof caches === 'undefined') return empty;

  try {
    const cache = await caches.open(SHARE_CACHE);
    const metaRes = await cache.match('/__shared_meta');
    if (!metaRes) return empty;

    const meta = await metaRes.json();
    const files: File[] = [];
    const count = Number(meta?.fileCount) || 0;

    for (let i = 0; i < count; i++) {
      const res = await cache.match(`/__shared_file_${i}`);
      if (!res) continue;
      const blob = await res.blob();
      files.push(
        new File([blob], meta.fileNames?.[i] || `shared-${i}`, {
          type: meta.fileTypes?.[i] || blob.type || 'application/octet-stream',
        })
      );
    }

    const text = [meta?.title, meta?.text, meta?.url].filter(Boolean).join('\n').trim();

    await caches.delete(SHARE_CACHE);
    return { text, files };
  } catch {
    return empty;
  }
}

// Ensure a connected socket (the standalone page doesn't boot the full AppShell).
function ensureSocket(token: string) {
  return new Promise<ReturnType<typeof connectSocket>>((resolve, reject) => {
    const existing = getSocket();
    if (existing?.connected) {
      resolve(existing);
      return;
    }
    const socket = connectSocket(token);
    if (socket.connected) {
      resolve(socket);
      return;
    }
    const timer = setTimeout(() => reject(new Error('Could not connect. Check your network and try again.')), 12000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}

export default function ShareTargetPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [payload, setPayload] = useState<SharedPayload>({ text: '', files: [] });
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [groups, setGroups] = useState<DirectoryGroup[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Target | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Read the shared content first — works even before auth resolves.
      const shared = await readSharedPayload();
      if (cancelled) return;
      setPayload(shared);

      const token = getToken();
      if (!token) {
        setAuthed(false);
        setLoading(false);
        return;
      }

      try {
        const me = await getCurrentUser();
        if (!me) {
          setAuthed(false);
          setLoading(false);
          return;
        }
        if (cancelled) return;
        setCurrentUserId(String(me.id));
        setAuthed(true);

        const [usersRes, groupsRes] = await Promise.all([
          api.get<{ users: DirectoryUser[] }>('/users/directory').catch(() => ({ users: [] })),
          api.get<{ groups: DirectoryGroup[] }>('/groups').catch(() => ({ groups: [] })),
        ]);
        if (cancelled) return;
        setUsers(usersRes.users || []);
        setGroups(groupsRes.groups || []);
      } catch {
        if (!cancelled) setAuthed(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          String(u.id) !== currentUserId &&
          u.is_active !== 0 &&
          u.name.toLowerCase().includes(search.toLowerCase())
      ),
    [users, currentUserId, search]
  );

  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (g) => g.members?.includes(currentUserId) && g.name.toLowerCase().includes(search.toLowerCase())
      ),
    [groups, currentUserId, search]
  );

  const handleSend = async () => {
    if (!selected || sending) return;
    const token = getToken();
    if (!token) {
      toast({ title: 'Not signed in', description: 'Please open Mawby Teams and sign in first.', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      const socket = await ensureSocket(token);

      let r2Files: any[] = [];
      if (payload.files.length > 0) {
        r2Files = await uploadFilesToR2(payload.files, selected.id, undefined, (p) => setProgress(p));
      }

      const content = payload.text || '';
      if (!content && r2Files.length === 0) {
        toast({ title: 'Nothing to share', description: 'No text or files were received.', variant: 'destructive' });
        setSending(false);
        return;
      }

      await new Promise<void>((resolve, reject) => {
        socket.emit(
          'send_message',
          { conversationId: selected.id, content, type: 'text', files: r2Files },
          (ack: { success: boolean; error?: string }) => {
            if (ack?.success) resolve();
            else reject(new Error(ack?.error || 'Failed to send message.'));
          }
        );
      });

      toast({ title: 'Shared', description: `Sent to ${selected.name}.` });
      router.replace('/');
    } catch (err: any) {
      toast({ title: 'Share failed', description: err?.message || 'Could not send the shared content.', variant: 'destructive' });
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <Share2 className="h-10 w-10 text-primary" />
        <p className="text-sm text-muted-foreground max-w-xs">
          Please open Mawby Teams and sign in, then try sharing again.
        </p>
        <Button className="rounded-xl font-bold" onClick={() => router.replace('/')}>Open Mawby Teams</Button>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-background">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Share2 className="h-5 w-5 text-primary" />
        <h1 className="text-base font-bold text-foreground">Share to a chat</h1>
      </div>

      <div className="p-4 space-y-4 flex-1 overflow-hidden flex flex-col">
        {/* Shared content preview */}
        <div className="bg-muted/50 p-3 rounded-xl border border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Sharing</p>
          {payload.text ? (
            <p className="text-sm text-foreground italic line-clamp-3 whitespace-pre-wrap">{payload.text}</p>
          ) : null}
          {payload.files.length > 0 ? (
            <p className="text-sm text-muted-foreground italic mt-1">
              📎 {payload.files.length} file{payload.files.length > 1 ? 's' : ''}: {payload.files.map((f) => f.name).join(', ')}
            </p>
          ) : null}
          {!payload.text && payload.files.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No content received.</p>
          ) : null}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search people or groups..."
            className="pl-10 rounded-xl"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-4 pr-2">
            {filteredGroups.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Groups</h4>
                <div className="space-y-1">
                  {filteredGroups.map((g) => (
                    <div
                      key={g.id}
                      className={cn(
                        'flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer',
                        selected?.id === g.id ? 'bg-primary/10 border border-primary' : 'hover:bg-muted'
                      )}
                      onClick={() => setSelected({ id: g.id, name: g.name, type: 'group' })}
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
                  {filteredUsers.map((u) => {
                    const dmId = getDmConvId(currentUserId, u.id);
                    return (
                      <div
                        key={u.id}
                        className={cn(
                          'flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer',
                          selected?.id === dmId ? 'bg-primary/10 border border-primary' : 'hover:bg-muted'
                        )}
                        onClick={() => setSelected({ id: dmId, name: u.name, type: 'dm' })}
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
      </div>

      <div className="flex items-center justify-between gap-2 p-4 border-t border-border">
        <Button variant="ghost" className="rounded-xl font-bold" onClick={() => router.replace('/')} disabled={sending}>
          Cancel
        </Button>
        <Button className="rounded-xl font-bold" onClick={handleSend} disabled={!selected || sending}>
          {sending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {payload.files.length > 0 && progress > 0 && progress < 100 ? `Uploading ${progress}%` : 'Sending…'}
            </span>
          ) : (
            selected ? `Send to ${selected.name}` : 'Select a chat'
          )}
        </Button>
      </div>
    </div>
  );
}
