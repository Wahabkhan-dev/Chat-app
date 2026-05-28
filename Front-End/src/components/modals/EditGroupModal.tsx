
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';
import Modal from '../ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { patchFormData } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const EditGroupModal: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const isOpen = state.activeModal === 'editGroup';
  const group = state.modalData?.group;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (group && isOpen) {
      setName(group.name);
      setDescription(group.description || '');
    }
  }, [group, isOpen]);

  const handleClose = useCallback(() => {
    setIsLoading(false);
    dispatch({ type: 'CLOSE_MODAL' });
  }, [dispatch]);

  if (!isOpen || !group) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);

    try {
      // Create FormData for multipart request
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('description', description.trim());

      console.log('[EditGroupModal] Updating group:', { groupId: group.id, name, description });

      const { group: updatedGroupData } = await patchFormData<{ message: string; group: any }>(
        `/groups/${group.id}/info`,
        formData
      );

      console.log('[EditGroupModal] ✅ Update successful:', updatedGroupData);

      const updatedGroup = {
        ...group,
        name: updatedGroupData.name,
        description: updatedGroupData.description || '',
        avatar: updatedGroupData.avatar || null,
        settings: updatedGroupData.settings || group.settings,
      };

      dispatch({ type: 'UPDATE_GROUP', payload: updatedGroup });
      toast({ title: '✅ Success', description: `Group "${name}" updated successfully.`, type: 'success' });
      handleClose();
    } catch (err: unknown) {
      console.error('[EditGroupModal] ❌ Error:', err);
      toast({
        title: '❌ Failed',
        description: err instanceof Error ? err.message : 'Could not update group.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
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
