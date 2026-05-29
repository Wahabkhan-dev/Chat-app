
"use client";

import React from 'react';
import { useAppContext } from '@/context/AppContext';
import Modal from '../ui/Modal';
import { Avatar } from '../ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Building, Calendar, MessageSquare, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { User } from '@/mock/users';

const UserProfileModal: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const isOpen = state.activeModal === 'userProfile';
  const user = state.modalData?.user as User | null;

  if (!isOpen || !user) return null;

  const handleClose = () => {
    dispatch({ type: 'CLOSE_MODAL' });
  };

  const handleMessage = () => {
    const a = Number(state.currentUser?.id);
    const b = Number(user.id);
    const dmId = `dm_${Math.min(a, b)}_${Math.max(a, b)}`;
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type: 'dm', id: dmId, name: user.name, avatar: user.avatar } });
    dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'chat' });
    handleClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="User Profile">
      <div className="p-6 pt-2 flex flex-col items-center">
        <div className="mb-6 relative">
          <Avatar name={user.name} src={user.avatar} size="xl" status={user.status} showStatus />
          {!user.isActive && (
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
              <Badge variant="destructive" className="text-[10px] font-bold">INACTIVE</Badge>
            </div>
          )}
        </div>

        <h2 className="text-2xl font-bold font-headline text-foreground">{user.name}</h2>
        <div className="flex gap-2 mt-2">
          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="bg-primary/10 text-primary border-none text-[10px] font-bold uppercase tracking-widest px-3">
            {user.role}
          </Badge>
          <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest px-3 border-border">
            {user.department}
          </Badge>
        </div>

        <div className="w-full mt-8 space-y-4">
          <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/30">
            <div className="p-2 bg-card rounded-lg shadow-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Email Address</p>
              <p className="text-sm font-bold text-foreground truncate">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/30">
            <div className="p-2 bg-card rounded-lg shadow-sm">
              <Building className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Department</p>
              <p className="text-sm font-bold text-foreground">{user.department}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/30">
            <div className="p-2 bg-card rounded-lg shadow-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Joined Mawby</p>
              <p className="text-sm font-bold text-foreground">{format(new Date(user.createdAt), 'MMMM d, yyyy')}</p>
            </div>
          </div>
        </div>

        <div className="w-full mt-8 flex gap-3">
          <Button 
            className="flex-1 bg-primary hover:bg-primary/90 text-white rounded-xl h-12 font-bold gap-2 shadow-lg shadow-primary/20"
            onClick={handleMessage}
            disabled={!user.isActive || user.id === state.currentUser?.id}
          >
            <MessageSquare className="h-4 w-4" />
            Message
          </Button>
          <Button 
            variant="outline" 
            className="flex-1 rounded-xl h-12 font-bold border-border"
            onClick={() => {
              navigator.clipboard.writeText(user.email);
              dispatch({ type: 'ADD_TOAST', payload: { message: 'Email copied to clipboard!', type: 'success' } });
            }}
          >
            Copy Email
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default UserProfileModal;
