
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
import { Loader2, Search, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const AddMemberModal: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const group = state.modalData?.group;

  const handleClose = useCallback(() => {
    setSelectedMembers([]);
    setSearch('');
    setIsLoading(false);
    dispatch({ type: 'CLOSE_MODAL' });
  }, [dispatch]);

  if (state.activeModal !== 'addMember' || !group) return null;

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMembers.length === 0) return;

    setIsLoading(true);
    try {
      await api.post(`/groups/${group.id}/members`, { userIds: selectedMembers });

      const addedNames = state.users
        .filter(u => selectedMembers.includes(u.id))
        .map(u => u.name);
      const namesString = addedNames.length > 1
        ? `${addedNames.slice(0, -1).join(', ')} and ${addedNames.slice(-1)}`
        : addedNames[0];

      dispatch({
        type: 'ADD_GROUP_MEMBERS',
        payload: {
          groupId: group.id,
          userIds: selectedMembers,
          systemMessage: {
            id: `sys${Date.now()}`,
            senderId: 'system',
            content: `${state.currentUser?.name} added ${namesString} to the group`,
            timestamp: new Date().toISOString(),
            type: 'text',
            reactions: [],
          },
        },
      });

      toast({
        title: 'Members added',
        description: `${namesString} ${selectedMembers.length === 1 ? 'has' : 'have'} been added to ${group.name}`,
      });
      handleClose();
    } catch (err: any) {
      toast({
        title: 'Failed to add members',
        description: err.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = state.users.filter(u => 
    !group.members.includes(u.id) &&
    u.isActive &&
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal isOpen={state.activeModal === 'addMember'} onClose={handleClose} title={`Add Members to ${group.name}`}>
      <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-6">
        <div className="space-y-3">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Team Members</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search team members..." 
              className="pl-9 h-10 text-sm border-muted/30 rounded-xl" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <ScrollArea className="h-64 rounded-xl border border-border bg-muted/5 p-2">
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
                <div className="text-center py-12 flex flex-col items-center">
                  <UserPlus className="h-10 w-10 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground italic">All team members are already in this group</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border mt-4">
          <span className="text-sm font-bold text-primary">{selectedMembers.length} selected</span>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" className="rounded-xl font-bold" onClick={handleClose}>Cancel</Button>
            <Button 
              type="submit" 
              className="bg-primary hover:bg-primary/90 text-white rounded-xl px-6 font-bold h-11 shadow-lg shadow-primary/20 gap-2"
              disabled={selectedMembers.length === 0 || isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Add to Group</>}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default AddMemberModal;
