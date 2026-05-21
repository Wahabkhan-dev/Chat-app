"use client";

import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { api } from '@/lib/api';
import Modal from '../ui/Modal';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Loader2, LogOut, ChevronRight, Search, Crown } from 'lucide-react';
import { Avatar } from '../ui/avatar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const LeaveGroupModal: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [newAdminId, setNewAdminId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const group = state.modalData?.group;
  const isOpen = state.activeModal === 'leaveGroup';

  const currentUserId = String(state.currentUser?.id || '');
  const isOwner = group?.ownerId === currentUserId;
  const isOnlyMember = (group?.members.length ?? 0) === 1;

  const allEligibleMembers = isOpen && group
    ? state.users.filter(u => group.members.includes(u.id) && u.id !== currentUserId)
    : [];

  useEffect(() => {
    if (isOpen && isOwner && !isOnlyMember && allEligibleMembers.length === 1 && !newAdminId) {
      setNewAdminId(allEligibleMembers[0].id);
    }
  }, [isOpen, isOwner, isOnlyMember, allEligibleMembers.length]);

  if (!isOpen || !group) return null;

  const eligibleMembers = allEligibleMembers.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleClose = () => {
    setNewAdminId('');
    setSearchTerm('');
    setIsLoading(false);
    dispatch({ type: 'CLOSE_MODAL' });
  };

  const handleLeave = async () => {
    if (isOwner && !isOnlyMember && !newAdminId) return;
    setIsLoading(true);

    try {
      if (isOnlyMember) {
        await api.delete(`/groups/${group.id}`);
        dispatch({ type: 'DELETE_GROUP', payload: group.id });
        dispatch({ type: 'ADD_TOAST', payload: { message: 'Group deleted as you were the last member', type: 'info' } });
        handleClose();
        return;
      }

      if (isOwner) {
        await api.put(`/groups/${group.id}/members/${newAdminId}/role`, { role: 'owner' });
        await api.delete(`/groups/${group.id}/members/${state.currentUser!.id}`);

        const newAdmin = state.users.find(u => u.id === newAdminId);
        const messages = [
          { id: `sys-p-${Date.now()}`, senderId: 'system', content: `Ownership was transferred to ${newAdmin?.name}`, timestamp: new Date(Date.now() - 1000).toISOString(), type: 'text', reactions: [] },
          { id: `sys-l-${Date.now()}`, senderId: 'system', content: `${state.currentUser?.name} left the group`, timestamp: new Date().toISOString(), type: 'text', reactions: [] },
        ];
        dispatch({ type: 'TRANSFER_ADMIN_AND_LEAVE', payload: { groupId: group.id, leavingUserId: state.currentUser!.id, newAdminId, systemMessages: messages } });
        dispatch({ type: 'ADD_NOTIFICATION', payload: { id: `p_${Date.now()}`, type: 'ownership_transferred', recipientId: newAdminId, title: 'You are now the group owner', body: `${state.currentUser?.name} transferred ownership to you before leaving`, timestamp: new Date().toISOString(), read: false } });
      } else {
        await api.delete(`/groups/${group.id}/members/${state.currentUser!.id}`);
        const sysMsg = { id: `sys-l-${Date.now()}`, senderId: 'system', content: `${state.currentUser?.name} left the group`, timestamp: new Date().toISOString(), type: 'text', reactions: [] };
        dispatch({ type: 'REMOVE_GROUP_MEMBER', payload: { groupId: group.id, userId: state.currentUser!.id, systemMessage: sysMsg } });
      }

      dispatch({ type: 'ADD_TOAST', payload: { message: `You left ${group.name}`, type: 'info' } });
      handleClose();
    } catch {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to leave group. Please try again.', type: 'error' } });
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Leave Group">
      <div className="p-6 pt-2 space-y-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
             <LogOut className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Leave &quot;{group.name}&quot;?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {isOnlyMember
                ? 'You are the only member. Leaving will permanently delete this group.'
                : 'You will no longer receive messages or see this group in your sidebar.'}
            </p>
          </div>
        </div>

        {isOwner && !isOnlyMember && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex gap-3">
              <Crown className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-orange-800 dark:text-orange-300">Transfer Ownership</h4>
                <p className="text-xs text-orange-700 dark:text-orange-400 mt-1 leading-relaxed">
                  You are the group owner. Please transfer ownership to another member before leaving.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search members..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs border-orange-200"
                />
              </div>

              <ScrollArea className="h-40 rounded-lg bg-card border border-orange-100">
                <RadioGroup value={newAdminId} onValueChange={setNewAdminId} className="p-1 space-y-1">
                  {eligibleMembers.map(m => (
                    <label key={m.id} className={cn(
                      'flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all hover:bg-orange-50/60',
                      newAdminId === m.id ? 'bg-orange-50/60 ring-1 ring-orange-200' : ''
                    )}>
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} src={m.avatar} size="sm" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate text-foreground">{m.name}</p>
                          <p className="text-[10px] text-muted-foreground uppercase">{m.department}</p>
                        </div>
                      </div>
                      <RadioGroupItem value={m.id} className="h-4 w-4" />
                    </label>
                  ))}
                  {eligibleMembers.length === 0 && (
                    <div className="p-8 text-center text-xs text-muted-foreground italic">No members found</div>
                  )}
                </RadioGroup>
              </ScrollArea>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="ghost" className="flex-1 rounded-xl font-bold h-11" onClick={handleClose}>Cancel</Button>
          <Button
            variant="destructive"
            className="flex-1 rounded-xl font-bold h-11 shadow-lg shadow-destructive/20 gap-2"
            disabled={isLoading || (isOwner && !isOnlyMember && !newAdminId)}
            onClick={handleLeave}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isOnlyMember ? 'Leave & Delete' : 'Leave Group'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default LeaveGroupModal;
