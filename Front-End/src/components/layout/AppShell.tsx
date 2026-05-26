
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
import MessageNotificationToast from '../chat/MessageNotificationToast';
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

const AppShell: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const appRef = useRef<HTMLDivElement | null>(null);

  // Controls whether the conversation list (sidebar) is visible on mobile.
  // On desktop this state has no effect — sidebar is always shown.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);

  useSocket();
  useNotificationPermission();
  usePushNotifications();

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

  const renderContent = () => {
    switch (state.activeView) {
      case 'chat':
        return (
          <>
            <ChatArea onBack={() => setMobileSidebarOpen(true)} />
            <RightPanel />
          </>
        );
      case 'admin':
        return <AdminDashboard />;
      case 'files':
        return <FilesPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <ChatArea onBack={() => setMobileSidebarOpen(true)} />;
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
      className="flex h-[100dvh] w-full bg-background text-foreground overflow-hidden"
    >
      {/* ── Sidebar / Conversation List ── */}
      {/*
        Desktop  : always visible, fixed 280px column
        Mobile   : full-width "page", visible only when showSidebar is true
      */}
      <div
        className={cn(
          'flex-col overflow-hidden transition-none',
          // Desktop: always visible column
          'md:flex md:w-[280px] md:shrink-0 md:border-r md:border-border',
          // Mobile: full-width, conditional
          showSidebar ? 'flex w-full' : 'hidden md:flex',
        )}
      >
        <Sidebar
          onViewChange={(view) => dispatch({ type: 'SET_ACTIVE_VIEW', payload: view })}
          onCreateGroup={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'createGroup' } })}
          activeView={state.activeView}
          onConversationSelect={() => {
            // On mobile, selecting a conversation hides the sidebar
            if (typeof window !== 'undefined' && window.innerWidth < 768) {
              setMobileSidebarOpen(false);
            }
          }}
        />
      </div>

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
        <TopBar
          onCreateUser={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'createUser' } })}
        />

        {/* View content — shrinks above mobile bottom nav */}
        <div className="flex-1 flex overflow-hidden relative pb-0 md:pb-0">
          {renderContent()}
        </div>

        {/* ── Mobile Bottom Navigation (Teams-style) ── */}
        <div className="md:hidden flex items-center justify-around shrink-0 h-16 bg-card border-t border-border safe-bottom z-40">
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

          {isAdmin && (
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
          )}

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
      <MessageNotificationToast />
      <PushPermissionBanner />
      <SocketStatusBanner />
    </div>
  );
};

export default AppShell;
