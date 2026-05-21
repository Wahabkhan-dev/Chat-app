
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppContext } from '@/context/AppContext';
import { User, UserRole } from '@/mock/users';
import { toast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import Modal from '../ui/Modal';

const EditUserModal: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const isOpen = state.activeModal === 'editUser';
  const user = state.modalData?.user as User | null;

  const [formData, setFormData] = useState({
    department: '',
    role: 'user' as UserRole,
  });

  useEffect(() => {
    if (user && isOpen) {
      setFormData({
        department: user.department,
        role: user.role,
      });
    }
  }, [user, isOpen]);

  const handleClose = useCallback(() => {
    setFormData({ department: '', role: 'user' });
    dispatch({ type: 'CLOSE_MODAL' });
  }, [dispatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const { user: updated } = await api.put<{ user: any }>(`/users/${user.id}`, {
        role: formData.role,
        department: formData.department,
        avatar: user.avatar || '',
      });
      dispatch({ type: 'UPDATE_USER', payload: { ...user, ...updated, id: String(updated.id), isActive: updated.is_active === 1 } });
      toast({ title: 'Profile Updated', description: `${user.name}'s information has been updated.` });
      handleClose();
    } catch (err: any) {
      toast({ title: 'Update Failed', description: err?.message || 'Server error.', variant: 'destructive' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit Team Member">
      <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Full Name</Label>
            <div className="rounded-xl border border-border h-11 px-4 flex items-center text-sm font-medium text-muted-foreground bg-muted/30 select-none">
              {user?.name}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Work Email</Label>
            <div className="rounded-xl border border-border h-11 px-4 flex items-center text-sm font-medium text-muted-foreground bg-muted/30 select-none">
              {user?.email}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-department" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Department</Label>
              <Input 
                id="edit-department" 
                placeholder="Engineering" 
                value={formData.department}
                className="rounded-xl border-border h-11"
                onChange={(e) => setFormData({...formData, department: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Role</Label>
              <Select 
                value={formData.role} 
                onValueChange={(val: UserRole) => setFormData({...formData, role: val})}
              >
                <SelectTrigger className="rounded-xl border-border h-11">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold" onClick={handleClose}>Cancel</Button>
          <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold h-11 shadow-lg shadow-primary/20">Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
};

export default EditUserModal;
