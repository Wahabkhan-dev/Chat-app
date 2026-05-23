
"use client";

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { Bell, Search, UserPlus, X, MessageSquare, AtSign, UserPlus2, ShieldAlert, VolumeX } from 'lucide-react';
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
      case 'mention': return <AtSign className="h-3 w-3 text-white" />;
      case 'group_added': return <UserPlus2 className="h-3 w-3 text-white" />;
      case 'kicked': return <X className="h-3 w-3 text-white" />;
      case 'promoted': return <ShieldAlert className="h-3 w-3 text-white" />;
      case 'broadcast': return <ShieldAlert className="h-3 w-3 text-white" />;
      default: return <MessageSquare className="h-3 w-3 text-white" />;
    }
  };

  const getIconBg = () => {
    switch (notification.type) {
      case 'mention': return 'bg-secondary';
      case 'group_added': return 'bg-green-500';
      case 'kicked': return 'bg-destructive';
      case 'promoted': return 'bg-orange-500';
      case 'broadcast': return 'bg-primary';
      case 'reaction': return 'bg-pink-500';
      default: return 'bg-accent';
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
            {isToday(new Date(notification.timestamp)) ? format(new Date(notification.timestamp), 'h:mm a') : format(new Date(notification.timestamp), 'MMM d')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{notification.body}</p>
        {isMuted && <p className="text-[9px] text-muted-foreground font-bold uppercase mt-1">Notifications silenced</p>}
        {!notification.read && <div className="h-2 w-2 rounded-full bg-primary mt-2" />}
      </div>
    </div>
  );
};

const TopBar: React.FC<{ onCreateUser: () => void }> = ({ onCreateUser }) => {
  const { state, dispatch } = useAppContext();
  
  const myNotifications = useMemo(() =>
    state.notifications.filter(
      (n) =>
        (n.recipientId === state.currentUser?.id || n.recipientId === 'all') && !n.read
    ),
    [state.notifications, state.currentUser]
  );
  
  const unreadCount = myNotifications.length;

  const [globalSearch, setGlobalSearch] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  const searchResults = useMemo(() => {
    if (globalSearch.length < 2) return null;
    return {
      people: state.users.filter(u => u.name.toLowerCase().includes(globalSearch.toLowerCase())),
      groups: state.groups.filter(g => g.name.toLowerCase().includes(globalSearch.toLowerCase())),
    };
  }, [globalSearch, state.users, state.groups]);

  const handleSelectResult = (type: 'dm' | 'group', item: any) => {
    const id = type === 'dm' ? [state.currentUser?.id, item.id].sort().join('_') : item.id;
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type, id, name: item.name, avatar: item.avatar || null } });
    setGlobalSearch('');
    setShowSearchResults(false);
  };

  const router = useRouter();

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
        try {
          router.replace(`${window.location.pathname}?focusMessageId=${n.messageId}`);
        } catch (e) {
          console.warn('Could not update focus query:', e);
        }
      }
    }
  };

  return (
    <div className="h-14 border-b bg-card text-card-foreground flex items-center justify-between px-3 md:px-6 shrink-0 relative z-50 shadow-sm gap-2">
      <div className="flex-1 max-w-2xl relative mx-auto group">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Search team members or group spaces..."
            className="w-full pl-10 pr-10 py-2 bg-muted/40 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
            value={globalSearch}
            onChange={(e) => { setGlobalSearch(e.target.value); setShowSearchResults(true); }}
            onFocus={() => setShowSearchResults(true)}
          />
          {globalSearch && <button className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full" onClick={() => { setGlobalSearch(''); setShowSearchResults(false); }}><X className="h-4 w-4 text-muted-foreground" /></button>}
        </div>

        {showSearchResults && searchResults && (
          <div className="absolute top-full left-0 w-full mt-2 bg-card rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-border p-4 max-h-[400px] overflow-y-auto animate-in fade-in slide-in-from-top-2">
            {searchResults.people.length === 0 && searchResults.groups.length === 0 ? (
              <div className="text-center py-10 opacity-50">
                <Search className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-bold uppercase tracking-widest">No matching results</p>
              </div>
            ) : (
              <div className="space-y-6">
                {searchResults.people.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">People</h4>
                    <div className="space-y-1">
                      {searchResults.people.map(u => (
                        <div
                          key={u.id}
                          className={cn(
                            "flex items-center gap-3 p-2.5 rounded-xl transition-all",
                            u.isActive === false
                              ? "opacity-60 cursor-default"
                              : "hover:bg-muted cursor-pointer"
                          )}
                          onClick={() => u.isActive !== false && handleSelectResult('dm', u)}
                        >
                          <Avatar
                            name={u.name}
                            src={u.avatar}
                            size="sm"
                            status={u.isActive === false ? undefined : u.status}
                            showStatus={u.isActive !== false}
                            className={u.isActive === false ? 'grayscale' : ''}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-foreground truncate">{u.name}</p>
                              {u.isActive === false && (
                                <span className="shrink-0 text-[9px] font-bold text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded">Inactive</span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">{u.department}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {searchResults.groups.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">Work Groups</h4>
                    <div className="space-y-1">
                      {searchResults.groups.map(g => (
                        <div key={g.id} className="flex items-center gap-3 p-2.5 hover:bg-muted rounded-xl cursor-pointer transition-all" onClick={() => handleSelectResult('group', g)}>
                          <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">{g.name[0]}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-foreground truncate">{g.name}</p>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">{g.members.length} Members</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 md:gap-3 ml-1 md:ml-4 shrink-0">
        {state.currentUser?.role === 'admin' && (
          <button onClick={onCreateUser} className="p-2 hover:bg-muted rounded-full transition-all text-muted-foreground hover:text-primary flex items-center gap-2 md:px-3 border border-transparent hover:border-primary/20">
            <UserPlus className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-widest hidden md:inline">Add Member</span>
          </button>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button className="p-2.5 hover:bg-muted rounded-full transition-all text-muted-foreground hover:text-secondary relative border border-transparent hover:border-secondary/20">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && <Badge className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 bg-secondary text-white text-[10px] font-bold flex items-center justify-center border-2 border-card animate-in zoom-in">{unreadCount}</Badge>}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(360px,calc(100vw-16px))] p-0 rounded-2xl overflow-hidden bg-card border border-border shadow-2xl z-[var(--z-toast)]" align="end">
            <div className="p-4 border-b flex justify-between items-center bg-card/50">
              <h3 className="font-bold text-sm uppercase tracking-widest">Inbox</h3>
              <button
                className="text-[10px] text-primary font-bold hover:underline uppercase tracking-widest"
                onClick={() => {
                  dispatch({ type: 'MARK_NOTIFICATIONS_READ' });
                  markAllNotificationsRead();
                }}
              >Mark all as read</button>
            </div>
            <div className="max-h-[60vh] md:max-h-[400px] overflow-y-auto scroll-smooth scrollbar-thin">
              {myNotifications.length === 0 ? (
                <div className="text-center py-20 opacity-30 flex flex-col items-center">
                  <Bell className="h-10 w-10 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-widest">No new alerts</p>
                </div>
              ) : (
                myNotifications.map(n => <NotificationRow key={n.id} notification={n} onClick={() => handleNotificationClick(n)} />)
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default TopBar;
