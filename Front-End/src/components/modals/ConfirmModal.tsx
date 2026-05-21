"use client";

import React, { useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import Modal from '../ui/Modal';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const ConfirmModal: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [confirmName, setConfirmName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (state.activeModal !== 'confirm' || !state.modalData) return null;

  const { title, body, confirmLabel, onConfirm, confirmStyle, requireName } = state.modalData;

  const handleClose = () => {
    setConfirmName('');
    setIsLoading(false);
    dispatch({ type: 'CLOSE_MODAL' });
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } catch (error) {
      console.error("Confirmation action failed:", error);
    } finally {
      handleClose();
    }
  };

  const isConfirmDisabled = (requireName && confirmName !== requireName) || isLoading;

  return (
    <Modal isOpen={state.activeModal === 'confirm'} onClose={handleClose}>
      <div className="p-6 text-center">
        <div className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4",
          confirmStyle === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
        )}>
          <AlertTriangle className="h-8 w-8" />
        </div>
        
        <h3 className="text-xl font-bold font-headline mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">{body}</p>

        {requireName && (
          <div className="mb-6 text-left space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              Type <span className="text-foreground">"{requireName}"</span> to confirm
            </label>
            <Input 
              value={confirmName} 
              onChange={(e) => setConfirmName(e.target.value)} 
              placeholder={requireName}
              className="rounded-xl border-border"
            />
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            variant={confirmStyle === 'danger' ? 'destructive' : 'default'} 
            className="flex-1 rounded-xl font-bold"
            disabled={isConfirmDisabled}
            onClick={handleConfirm}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmModal;