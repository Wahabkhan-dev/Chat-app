
"use client";

import React, { useState, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';
import Modal from '../ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar } from '../ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { getSocket } from '@/services/socket';
import { toast } from '@/hooks/use-toast';

const CreateGroupModal: React.FC = () => {
  const { state, dispatch } = useAppContext();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleClose = useCallback(() => {
    setName('');
    setDescription('');
    setSelectedMembers([]);
    setSearch('');
    setIsLoading(false);
    dispatch({ type: 'CLOSE_MODAL' });
  }, [dispatch]);

  if (state.activeModal !== 'createGroup') return null;

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || selectedMembers.length === 0) return;

    setIsLoading(true);
    try {
      const { group } = await api.post<{ message: string; group: any }>('/groups', {
        name,
        description,
        memberIds: selectedMembers,
      });

      const newGroup = {
        id: String(group.id),
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

      dispatch({ type: 'CREATE_GROUP', payload: newGroup });
      // Let socket know we joined this group room
      getSocket()?.emit('join_group', { groupId: newGroup.id });

      toast({ title: 'Group created', description: `'${name}' is ready.` });
      handleClose();
    } catch (err: unknown) {
      toast({
        title: 'Failed to create group',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const currentUserId = String(state.currentUser?.id || '');
  const filteredUsers = state.users.filter(u => 
    u.id !== currentUserId && 
    u.isActive &&
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  const isFormValid = name.length >= 2 && selectedMembers.length > 0;

  return (
    <Modal isOpen={state.activeModal === 'createGroup'} onClose={handleClose} title="Create New Group">
      <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gname" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Group Name *</Label>
            <Input 
              id="gname" 
              placeholder="e.g. Q2 Sprint Team" 
              required 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border-border h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gdesc" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</Label>
            <Input 
              id="gdesc" 
              placeholder="What is this group for?" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl border-border h-11"
            />
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Add Members *</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search team members..." 
              className="pl-9 h-10 text-sm border-muted/30 rounded-xl" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <ScrollArea className="h-48 rounded-xl border border-border bg-muted/5 p-2">
            <div className="space-y-1">
              {filteredUsers.map(user => (
                <label 
                  key={user.id} 
                  className={cn(
                    "flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer group",
                    selectedMembers.includes(user.id) ? "bg-primary/10" : "hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={user.name} src={user.avatar} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{user.name}</p>
                      <Badge variant="secondary" className="text-[9px] h-4 py-0 font-bold uppercase tracking-tighter bg-muted/50 border-none">{user.department}</Badge>
                    </div>
                  </div>
                  <Checkbox 
                    checked={selectedMembers.includes(user.id)}
                    className="rounded-md h-5 w-5 pointer-events-none"
                    onCheckedChange={() => toggleMember(user.id)}
                  />
                </label>
              ))}
              {filteredUsers.length === 0 && (
                <p className="text-center py-8 text-xs text-muted-foreground italic">No members found</p>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border mt-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Selection</span>
            <span className="text-sm font-bold text-primary">{selectedMembers.length} members selected</span>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" className="rounded-xl font-bold" onClick={handleClose}>Cancel</Button>
            <Button 
              type="submit" 
              className="bg-primary hover:bg-primary/90 text-white rounded-xl px-6 font-bold h-11 shadow-lg shadow-primary/20 gap-2"
              disabled={!isFormValid || isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create Group <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default CreateGroupModal;
