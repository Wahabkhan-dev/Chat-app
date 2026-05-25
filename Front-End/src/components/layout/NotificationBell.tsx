"use client";

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { Bell, MessageSquare, AtSign, UserPlus2, X, ShieldAlert, VolumeX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '../ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format, isToday } from 'date-fns';
import { markAllNotificationsRead, markNotificationRead } from '@/services/notifications';

const NotificationRow: React.FC<{ notification: any; onClick: () => void }> = ({ notification, onClick }) => {
  const { state } = useAppContext();
  const sender = state.users.find(u => u.id === notification.senderId);
  const convId = notification.conversationId;
  const isMuted = convId ? state.conversationMeta[convId]?.muted : false;

  const getIcon = () => {
    if (notification.type === 'reaction') {
      return <span className="text-[12px] leading-none">{notification.emoji || '❤️'}</span>;
    }
    switch (notification.type) {
      case 'mention':   return <AtSign className="h-3 w-3 text-white" />;
      case 'group_added': return <UserPlus2 className="h-3 w-3 text-white" />;
      case 'kicked':    return <X className="h-3 w-3 text-white" />;
      case 'promoted':  return <ShieldAlert className="h-3 w-3 text-white" />;
      case 'broadcast': return <ShieldAlert className="h-3 w-3 text-white" />;
      default:          return <MessageSquare className="h-3 w-3 text-white" />;
    }
  };

  const getIconBg = () => {
    switch (notification.type) {
      case 'mention':   return 'bg-secondary';
      case 'group_added': return 'bg-green-500';
      case 'kicked':    return 'bg-destructive';
      case 'promoted':  return 'bg-orange-500';
      case 'broadcast': return 'bg-primary';
      case 'reaction':  return 'bg-pink-500';
      default:          return 'bg-accent';
    }
  };

  return (
    <div
      className={cn(
        'p-4 hover:bg-muted/50 transition-all cursor-pointer border-b last:border-b-0 flex gap-4 relative',
        !notification.read && 'bg-primary/5',
        isMuted && 'opacity-60'
      )}
      onClick={onClick}
    >
      <div className="relative shrink-0">
        <Avatar name={sender?.name || 'System'} src={sender?.avatar} size="sm" />
        <div className={cn("absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-card flex items-center justify-center", getIconBg())}>
          {getIcon()}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start mb-0.5">
          <p className="text-xs font-bold text-foreground truncate pr-2 flex items-center gap-1.5">
            {isMuted && <VolumeX className="h-3 w-3" />}
            {notification.title}
          </p>
          <span className="text-[9px] text-muted-foreground font-bold uppercase whitespace-nowrap">
            {isToday(new Date(notification.timestamp))
              ? format(new Date(notification.timestamp), 'h:mm a')
              : format(new Date(notification.timestamp), 'MMM d')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{notification.body}</p>
        {isMuted && <p className="text-[9px] text-muted-foreground font-bold uppercase mt-1">Notifications silenced</p>}
        {!notification.read && <div className="h-2 w-2 rounded-full bg-primary mt-2" />}
      </div>
    </div>
  );
};

const NotificationBell: React.FC<{ className?: string }> = ({ className }) => {
  const { state, dispatch } = useAppContext();
  const router = useRouter();

  const myNotifications = useMemo(() =>
    state.notifications.filter(
      (n) => (n.recipientId === state.currentUser?.id || n.recipientId === 'all') && !n.read
    ),
    [state.notifications, state.currentUser]
  );

  const unreadCount = myNotifications.length;

  const handleNotificationClick = (n: any) => {
    if (!n.read) {
      dispatch({ type: 'MARK_NOTIFICATION_READ', payload: n.id });
      markNotificationRead(n.id);
    }
    if (n.conversationId) {
      const conv = n.type === 'dm_message'
        ? { type: 'dm' as const, id: n.conversationId, name: state.users.find(u => u.id === n.senderId)?.name || 'User' }
        : { type: 'group' as const, id: n.conversationId, name: state.groups.find(g => g.id === n.conversationId)?.name || 'Group' };
      dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { ...conv, avatar: null } });
      if (n.messageId) {
        try { router.replace(`${window.location.pathname}?focusMessageId=${n.messageId}`); } catch (e) {}
      }
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'p-2.5 hover:bg-muted rounded-full transition-all text-muted-foreground hover:text-secondary relative border border-transparent hover:border-secondary/20',
            className
          )}
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 bg-secondary text-white text-[10px] font-bold flex items-center justify-center border-2 border-card animate-in zoom-in">
              {unreadCount}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(360px,calc(100vw-16px))] p-0 rounded-2xl overflow-hidden bg-card border border-border shadow-2xl z-[var(--z-toast)]"
        align="end"
      >
        <div className="p-4 border-b flex justify-between items-center bg-card/50">
          <h3 className="font-bold text-sm uppercase tracking-widest">Inbox</h3>
          <button
            className="text-[10px] text-primary font-bold hover:underline uppercase tracking-widest"
            onClick={() => { dispatch({ type: 'MARK_NOTIFICATIONS_READ' }); markAllNotificationsRead(); }}
          >
            Mark all as read
          </button>
        </div>
        <div className="max-h-[60vh] md:max-h-[400px] overflow-y-auto scroll-smooth scrollbar-thin">
          {myNotifications.length === 0 ? (
            <div className="text-center py-20 opacity-30 flex flex-col items-center">
              <Bell className="h-10 w-10 mb-2" />
              <p className="text-xs font-bold uppercase tracking-widest">No new alerts</p>
            </div>
          ) : (
            myNotifications.map(n => (
              <NotificationRow key={n.id} notification={n} onClick={() => handleNotificationClick(n)} />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
