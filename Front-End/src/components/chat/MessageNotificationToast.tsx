'use client';

import React from 'react';
import { X, MessageSquare } from 'lucide-react';
import { useAppContext, InAppNotification } from '@/context/AppContext';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';

const NotificationCard: React.FC<{
  notification: InAppNotification;
  onDismiss: () => void;
  onClick: () => void;
}> = ({ notification, onDismiss, onClick }) => (
  <div
    className={cn(
      'relative w-[320px] rounded-2xl shadow-2xl overflow-hidden cursor-pointer',
      'bg-card border border-border/60',
      'animate-in slide-in-from-right-4 fade-in duration-300',
    )}
    onClick={onClick}
  >
    {/* Header bar */}
    <div className="flex items-center justify-between px-3 py-2 bg-primary/10 border-b border-border/40">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-bold text-primary uppercase tracking-widest">Mawby Teams</span>
        {notification.conversationType === 'group' && (
          <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[100px]">
            · {notification.conversationName}
          </span>
        )}
      </div>
      <button
        className="p-1 rounded-full hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
        onClick={e => { e.stopPropagation(); onDismiss(); }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>

    {/* Body */}
    <div className="flex items-start gap-3 px-3 py-3">
      <Avatar
        name={notification.senderName}
        src={notification.senderAvatar}
        size="lg"
        className="shrink-0 shadow-md"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{notification.senderName}</p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
          {notification.message}
        </p>
      </div>
    </div>
  </div>
);

const MessageNotificationToast: React.FC = () => {
  const { state, dispatch } = useAppContext();

  const handleClick = (notif: InAppNotification) => {
    dispatch({
      type: 'SET_ACTIVE_CONVERSATION',
      payload: {
        type: notif.conversationType,
        id: notif.conversationId,
        name: notif.conversationName,
        avatar: notif.senderAvatar || null,
      },
    });
    dispatch({ type: 'DISMISS_IN_APP_NOTIFICATION', payload: notif.id });
  };

  const handleDismiss = (id: string) => {
    dispatch({ type: 'DISMISS_IN_APP_NOTIFICATION', payload: id });
  };

  if (state.inAppNotifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[var(--z-toast)] flex flex-col gap-2 pointer-events-none">
      {state.inAppNotifications.map(notif => (
        <div key={notif.id} className="pointer-events-auto">
          <NotificationCard
            notification={notif}
            onDismiss={() => handleDismiss(notif.id)}
            onClick={() => handleClick(notif)}
          />
        </div>
      ))}
    </div>
  );
};

export default MessageNotificationToast;
