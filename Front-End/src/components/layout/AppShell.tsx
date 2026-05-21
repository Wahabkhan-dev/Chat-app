
"use client";

import React, { useEffect, useRef } from 'react';
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
import MessageNotificationToast from '../chat/MessageNotificationToast';

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
  useSocket();
  useNotificationPermission();

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

  const renderContent = () => {
    switch (state.activeView) {
      case 'chat':
        return (
          <>
            <ChatArea />
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
        return <ChatArea />;
    }
  };

  return (
    <div ref={appRef} className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <Sidebar 
        onViewChange={(view) => dispatch({ type: 'SET_ACTIVE_VIEW', payload: view })} 
        onCreateGroup={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'createGroup' } })}
        activeView={state.activeView}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onCreateUser={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'createUser' } })} />
        
        <div className="flex-1 flex overflow-hidden relative">
          {renderContent()}
        </div>
      </div>

      {/* Global Modals Manager */}
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

      {/* Global Toast Manager */}
      <Toaster />

      {/* Real-time message notification toasts (Teams-style) */}
      <MessageNotificationToast />
    </div>
  );
};

export default AppShell;
