
"use client";

import React, { useEffect, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import RightPanel from './RightPanel';
import ChatArea from '../chat/ChatArea';
import AdminDashboard from '../admin/AdminDashboard';
import FilesPage from '../files/FilesPage';
import SettingsPage from '../settings/SettingsPage';
import { useAppContext } from '@/context/AppContext';
import { useSocket } from '@/hooks/useSocket';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import PushPermissionBanner from '../PushPermissionBanner';
import SocketStatusBanner from '../SocketStatusBanner';
import { MessageSquare, FileText, Shield, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

// Modals
import CreateUserModal from '../modals/CreateUserModal';
import CreateGroupModal from '../modals/CreateGroupModal';
import AddMemberModal from '../modals/AddMemberModal';
import EditUserModal from '../modals/EditUserModal';
import EditGroupModal from '../modals/EditGroupModal';
import UserProfileModal from '../modals/UserProfileModal';
import ConfirmModal from '../modals/ConfirmModal';
import ForwardMessageModal from '../modals/ForwardMessageModal';
import FilePreviewModal from '../modals/FilePreviewModal';
import LeaveGroupModal from '../modals/LeaveGroupModal';
import { Toaster } from '../ui/toaster';
import { ErrorBoundary } from '../ErrorBoundary';

const AppShell: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const appRef = useRef<HTMLDivElement | null>(null);

  // Controls whether the conversation list (sidebar) is visible on mobile.
  // On desktop this state has no effect — sidebar is always shown.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);

  useSocket();
  useNotificationPermission();
  usePushNotifications();

  // iOS keyboard fix: set height via JS so the keyboard never pushes content off-screen.
  // CSS dvh/svh units are unreliable on iOS Safari when the virtual keyboard opens.
  useEffect(() => {
    const root = appRef.current;
    if (!root) return;
    const setHeight = () => { root.style.height = `${window.innerHeight}px`; };
    setHeight();
    window.addEventListener('resize', setHeight);
    return () => window.removeEventListener('resize', setHeight);
  }, []);

  // Prevent pinch-to-zoom and double-tap zoom on mobile (iOS ignores viewport user-scalable since iOS 10)
  useEffect(() => {
    const preventGesture = (e: Event) => e.preventDefault();
    const preventMultiTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener('gesturestart', preventGesture, false);
    document.addEventListener('gesturechange', preventGesture, false);
    document.addEventListener('gestureend', preventGesture, false);
    document.addEventListener('touchstart', preventMultiTouch, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
      document.removeEventListener('touchstart', preventMultiTouch);
    };
  }, []);

  // When a conversation is selected on mobile, slide into chat view
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (state.activeConversation && window.innerWidth < 768) {
      setMobileSidebarOpen(false);
    }
  }, [state.activeConversation?.id]);

  // When the active view changes to non-chat (files/admin/settings) on mobile,
  // hide the sidebar so content is shown
  useEffect(() => {
    if (state.activeView !== 'chat') {
      setMobileSidebarOpen(false);
    }
  }, [state.activeView]);

  // PWA taskbar badge: show number of conversations with unread messages
  useEffect(() => {
    const nav = navigator as any;
    const uid = String(state.currentUser?.id || '');
    // The "You" self-DM conv ID — never badge for personal notepad
    const selfConvId = uid ? `dm_${uid}_${uid}` : null;

    const count = Object.entries(state.conversationMeta).filter(([convId, meta]: [string, any]) => {
      // Exclude the "You" self-DM — it's a personal notepad, never needs a badge
      if (selfConvId && convId === selfConvId) return false;
      // Only count conversations that actually have tracked history with unread messages
      const hasUnread = (meta.unreadCount || 0) > 0;
      const hasHistory = meta.chatTracked || !!meta.lastMessage;
      return hasUnread && hasHistory;
    }).length;

    if (!('setAppBadge' in navigator)) return;
    if (count > 0) {
      nav.setAppBadge(count).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch?.(() => {});
    }
  }, [state.conversationMeta, state.currentUser?.id]);

  useEffect(() => {
    const root = appRef.current;
    if (!root) return;

    const handleContextMenu = (event: MouseEvent) => {
      if (event.target instanceof Node && root.contains(event.target)) {
        event.preventDefault();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.target instanceof Node) || !root.contains(event.target)) return;
      const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
      const isInspectShortcut =
        event.key === 'F12' ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && (key === 'i' || key === 'c')) ||
        ((event.ctrlKey || event.metaKey) && key === 'u');
      if (isInspectShortcut) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (!state.isAuthenticated) return null;

  const isAdmin = state.currentUser?.role === 'admin';

  // Admins must always stay on admin/settings views — enforce on every render cycle
  useEffect(() => {
    if (isAdmin && state.activeView !== 'admin' && state.activeView !== 'settings') {
      dispatch({ type: 'SET_ACTIVE_VIEW', payload: 'admin' });
    }
  }, [isAdmin, state.activeView, dispatch]);

  const renderContent = () => {
    if (isAdmin) {
      // Admins only see the admin portal or their own settings
      if (state.activeView === 'settings') return <ErrorBoundary><SettingsPage /></ErrorBoundary>;
      return <ErrorBoundary><AdminDashboard /></ErrorBoundary>;
    }
    switch (state.activeView) {
      case 'chat':
        return (
          <>
            <ErrorBoundary>
              <ChatArea onBack={() => setMobileSidebarOpen(true)} />
            </ErrorBoundary>
            <ErrorBoundary>
              <RightPanel />
            </ErrorBoundary>
          </>
        );
      case 'admin':
        return <ErrorBoundary><AdminDashboard /></ErrorBoundary>;
      case 'files':
        return <ErrorBoundary><FilesPage /></ErrorBoundary>;
      case 'settings':
        return <ErrorBoundary><SettingsPage /></ErrorBoundary>;
      default:
        return <ErrorBoundary><ChatArea onBack={() => setMobileSidebarOpen(true)} /></ErrorBoundary>;
    }
  };

  const handleBottomNavChange = (view: typeof state.activeView) => {
    dispatch({ type: 'SET_ACTIVE_VIEW', payload: view });
    if (view === 'chat') {
      // Tapping Chat in bottom nav → show conversation list
      setMobileSidebarOpen(true);
    } else {
      setMobileSidebarOpen(false);
    }
  };

  // On mobile, the sidebar is shown as a full-screen page (conversation list).
  // On desktop, sidebar is always a fixed 280px column.
  const showSidebar = mobileSidebarOpen && state.activeView === 'chat';

  return (
    <div
      ref={appRef}
      className="flex w-full bg-background text-foreground overflow-hidden"
    >
      {/* ── Sidebar / Conversation List — hidden for admin users ── */}
      {!isAdmin && (
        <div
          className={cn(
            'flex-col overflow-hidden transition-none',
            'md:flex md:w-[280px] md:shrink-0 md:border-r md:border-border',
            showSidebar ? 'flex w-full' : 'hidden md:flex',
          )}
        >
          <ErrorBoundary>
            <Sidebar
              onViewChange={(view) => dispatch({ type: 'SET_ACTIVE_VIEW', payload: view })}
              onCreateGroup={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'createGroup' } })}
              activeView={state.activeView}
              onConversationSelect={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  setMobileSidebarOpen(false);
                }
              }}
            />
          </ErrorBoundary>
        </div>
      )}

      {/* ── Main content area ── */}
      {/*
        Desktop: always visible, takes remaining width
        Mobile: hidden when sidebar is open (single-column experience)
      */}
      <div
        className={cn(
          'flex-col min-w-0 flex-1',
          showSidebar ? 'hidden md:flex' : 'flex',
        )}
      >
        {!isAdmin && (
          <TopBar
            onCreateUser={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'createUser' } })}
          />
        )}

        {/* View content — shrinks above mobile bottom nav */}
        <div className="flex-1 flex overflow-hidden relative pb-0 md:pb-0">
          {renderContent()}
        </div>

        {/* ── Mobile Bottom Navigation (Teams-style) ── */}
        <div className="md:hidden flex items-center justify-around shrink-0 h-16 bg-card border-t border-border safe-bottom z-40">
          {isAdmin ? (
            // Admins only see Admin Portal + Settings
            <>
              <button
                onClick={() => handleBottomNavChange('admin')}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
                  state.activeView === 'admin' ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Shield className="h-5 w-5" />
                <span className="text-[10px] font-bold uppercase tracking-wide">Admin</span>
              </button>
              <button
                onClick={() => handleBottomNavChange('settings')}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
                  state.activeView === 'settings' ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Settings className="h-5 w-5" />
                <span className="text-[10px] font-bold uppercase tracking-wide">Settings</span>
              </button>
            </>
          ) : (
            // Regular users see Chat + Files + Settings
            <>
              <button
                onClick={() => handleBottomNavChange('chat')}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
                  state.activeView === 'chat' ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <MessageSquare className="h-5 w-5" />
                <span className="text-[10px] font-bold uppercase tracking-wide">Chat</span>
              </button>
              <button
                onClick={() => handleBottomNavChange('files')}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
                  state.activeView === 'files' ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <FileText className="h-5 w-5" />
                <span className="text-[10px] font-bold uppercase tracking-wide">Files</span>
              </button>
              <button
                onClick={() => handleBottomNavChange('settings')}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
                  state.activeView === 'settings' ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Settings className="h-5 w-5" />
                <span className="text-[10px] font-bold uppercase tracking-wide">Settings</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Global Modals */}
      <CreateUserModal />
      <CreateGroupModal />
      <AddMemberModal />
      <EditUserModal />
      <EditGroupModal />
      <UserProfileModal />
      <ConfirmModal />
      <FilePreviewModal />
      <LeaveGroupModal />
      <ForwardMessageModal />

      <Toaster />
      <PushPermissionBanner />
      <SocketStatusBanner />
    </div>
  );
};

export default AppShell;
