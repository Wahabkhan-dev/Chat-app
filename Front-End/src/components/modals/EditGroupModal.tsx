
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';
import Modal from '../ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';

const EditGroupModal: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const isOpen = state.activeModal === 'editGroup';
  const group = state.modalData?.group;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState('open');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (group && isOpen) {
      setName(group.name);
      setDescription(group.description || '');
      setMode(group.settings?.mode || 'open');
    }
  }, [group, isOpen]);

  const handleClose = useCallback(() => {
    setIsLoading(false);
    dispatch({ type: 'CLOSE_MODAL' });
  }, [dispatch]);

  if (!isOpen || !group) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);

    const updatedGroup = {
      ...group,
      name: name.trim(),
      description: description.trim(),
      settings: {
        ...group.settings,
        mode
      }
    };

    setTimeout(() => {
      dispatch({ type: 'UPDATE_GROUP', payload: updatedGroup });
      dispatch({ type: 'ADD_TOAST', payload: { message: `✅ Group "${name}" updated`, type: 'success' } });
      handleClose();
    }, 600);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit Group Settings">
      <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-gname" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Group Name</Label>
            <Input 
              id="edit-gname" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border-border h-11"
              placeholder="e.g. Engineering Team"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="edit-gdesc" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</Label>
            <Input 
              id="edit-gdesc" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl border-border h-11"
              placeholder="What is this group for?"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Messaging Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="rounded-xl border-border h-11">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="open">Open (Everyone can message)</SelectItem>
                <SelectItem value="readonly">Read Only (Admins only)</SelectItem>
                <SelectItem value="announcement">Announcement (Restricted)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <Button type="button" variant="ghost" className="flex-1 rounded-xl font-bold" onClick={handleClose}>Cancel</Button>
          <Button 
            type="submit" 
            className="flex-1 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold h-11 shadow-lg shadow-primary/20 gap-2"
            disabled={isLoading || !name.trim()}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Save Changes</>}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default EditGroupModal;
