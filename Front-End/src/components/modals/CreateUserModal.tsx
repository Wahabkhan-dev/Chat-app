
"use client";

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppContext } from '@/context/AppContext';
import { User, UserRole } from '@/mock/users';
import { toast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import Modal from '../ui/Modal';

const CreateUserModal: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const isOpen = state.activeModal === 'createUser';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: '',
    role: 'user' as UserRole,
    password: ''
  });
  const [loading, setLoading] = useState(false);

  const handleClose = useCallback(() => {
    if (loading) return;
    setFormData({ name: '', email: '', department: '', role: 'user', password: '' });
    dispatch({ type: 'CLOSE_MODAL' });
  }, [dispatch, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await api.post<{ message: string; user: any }>('/users', {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        department: formData.department,
      });

      const newUser: User = {
        id: String(data.user.id),
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        department: data.user.department || '',
        avatar: data.user.avatar || `https://picsum.photos/seed/${data.user.name.replace(/\s+/g, '')}/150/150`,
        status: data.user.status || 'offline',
        createdAt: data.user.created_at,
      };

      dispatch({ type: 'CREATE_USER', payload: { ...newUser, isActive: true } as User });

      toast({
        title: "User created",
        description: `${formData.name} has been added to the workspace.`,
      });

      handleClose();
    } catch (err: unknown) {
      toast({
        title: "Failed to create user",
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add New Team Member">
      <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Full Name</Label>
            <Input 
              id="name" 
              placeholder="Arham Nawaz" 
              required 
              value={formData.name}
              className="rounded-xl border-border h-11"
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Work Email</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="arham@mawbytec.com" 
              required 
              value={formData.email}
              className="rounded-xl border-border h-11"
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="department" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Department</Label>
              <Input 
                id="department" 
                placeholder="Engineering" 
                value={formData.department}
                className="rounded-xl border-border h-11"
                onChange={(e) => setFormData({...formData, department: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Workspace Role</Label>
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
          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Initial Password</Label>
            <Input 
              id="password" 
              type="password" 
              placeholder="••••••••" 
              required 
              minLength={6}
              value={formData.password}
              className="rounded-xl border-border h-11"
              onChange={(e) => setFormData({...formData, password: e.target.value})}
            />
          </div>
        </div>
        <div className="flex gap-3 pt-4 border-t">
          <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold" onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button type="submit" disabled={loading} className="flex-1 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold h-11 shadow-lg shadow-primary/20">
            {loading ? 'Creating...' : 'Create User'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateUserModal;
