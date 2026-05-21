
"use client";

import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  maxWidth?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, title, maxWidth = 'max-w-md' }) => {
  // Hardened body lock management
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Ensure the body itself is interactive, but blocked by the backdrop
      document.body.style.pointerEvents = 'auto';
    } else {
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    }
    
    // Cleanup on unmount or close
    return () => {
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 overflow-hidden"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Backdrop - Explicitly clickable to close */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        style={{ pointerEvents: 'auto' }}
      />
      
      {/* Content - Blocks click propagation to backdrop */}
      <div 
        className={cn(
          "relative z-[51] bg-card text-card-foreground rounded-2xl shadow-2xl w-full animate-in zoom-in-95 duration-200 flex flex-col",
          maxWidth
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between p-6 pb-2">
            {title && <h2 className="text-xl font-bold font-headline">{title}</h2>}
            <button 
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto max-h-[85vh] scrollbar-hide">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
