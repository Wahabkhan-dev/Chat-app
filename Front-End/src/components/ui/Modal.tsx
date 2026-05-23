
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
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.pointerEvents = 'auto';
    } else {
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    }
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
      className="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center overflow-hidden"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        style={{ pointerEvents: 'auto' }}
      />

      {/*
        Mobile   : full-screen (inset-x-0 bottom-0, rounded top corners, slides up)
        Desktop  : centered card with maxWidth
      */}
      <div
        className={cn(
          // base
          'relative z-[51] bg-card text-card-foreground shadow-2xl w-full flex flex-col',
          // mobile — full-screen, slide up
          'rounded-t-2xl sm:rounded-2xl',
          'animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300',
          'max-h-[95dvh] sm:max-h-[90vh]',
          // desktop — centered card
          `sm:${maxWidth}`,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
            {/* Drag handle — mobile only */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden" />
            {title && <h2 className="text-xl font-bold font-headline">{title}</h2>}
            <button
              onClick={onClose}
              className="ml-auto p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto scrollbar-hide touch-scroll safe-bottom">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
