"use client";

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Modal from '../ui/Modal';
import { useAppContext } from '@/context/AppContext';
import { Eye, EyeOff, Lock } from 'lucide-react';

interface ChangePasswordModalProps {
  userId: string;
  userName: string;
  open: boolean;
  onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ userId, userName, open, onClose }) => {
  const { dispatch } = useAppContext();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword('');
      setConfirm('');
      setShowPassword(false);
      setIsLoading(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Password must be at least 6 characters.', type: 'error' } });
      return;
    }
    if (password !== confirm) {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Passwords do not match.', type: 'error' } });
      return;
    }
    setIsLoading(true);
    try {
      await api.patch(`/users/${userId}/password`, { password });
      dispatch({ type: 'ADD_TOAST', payload: { message: `Password updated for ${userName}.`, type: 'success' } });
      onClose();
    } catch (err: any) {
      dispatch({ type: 'ADD_TOAST', payload: { message: err?.message || 'Failed to update password.', type: 'error' } });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Change Password">
      <div className="p-6 pt-2 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl shrink-0">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Set a new password for <span className="font-bold text-foreground">{userName}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wide">New Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="pr-10 rounded-xl border-muted/40 h-11"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wide">Confirm Password</Label>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat new password"
              className="rounded-xl border-muted/40 h-11"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-xl h-11 border-border"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 rounded-xl h-11 bg-primary text-white hover:bg-primary/90 font-bold"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default ChangePasswordModal;
