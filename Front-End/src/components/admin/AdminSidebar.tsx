
"use client";

import React, { useState, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import {
  LayoutDashboard, Users, Users2,
  Settings, LogOut, Camera, X,
} from 'lucide-react';
import { Avatar } from '../ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import Image from 'next/image';
import { BRAND_FAVICON_URL } from '@/lib/brand';
import { getApiBaseUrl, getToken } from '@/lib/api';
import { logoutUser } from '@/services/auth';

export type AdminSection = 'dashboard' | 'users' | 'groups' | 'settings';

const NAV_ITEMS: { id: AdminSection; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard',      icon: LayoutDashboard },
  { id: 'users',     label: 'Team Directory', icon: Users },
  { id: 'groups',    label: 'Managed Groups', icon: Users2 },
];

const SidebarContent: React.FC<{
  activeSection: AdminSection;
  onSectionChange: (s: AdminSection) => void;
  onClose?: () => void;
}> = ({ activeSection, onSectionChange, onClose }) => {
  const { state, dispatch } = useAppContext();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const token = getToken();
      const res = await fetch(`${getApiBaseUrl()}/users/me/avatar`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      dispatch({ type: 'UPDATE_USER', payload: { ...state.currentUser!, avatar: data.avatarKey } });
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Profile picture updated', type: 'success' } });
    } catch {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to update profile picture', type: 'error' } });
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const openLogoutConfirm = () => {
    dispatch({
      type: 'OPEN_MODAL',
      payload: {
        type: 'confirm',
        data: {
          title: 'Confirm Logout',
          body: 'Are you sure you want to log out of your account?',
          confirmLabel: 'Logout',
          confirmStyle: 'danger',
          onConfirm: async () => {
            try { await logoutUser(); } catch {}
            dispatch({ type: 'LOGOUT' });
          },
        },
      },
    });
  };

  return (
    <div className="w-full h-full bg-card text-card-foreground flex flex-col overflow-hidden shadow-xl">

      {/* Header — matches regular Sidebar header */}
      <div className="p-5 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-2xl relative overflow-hidden shrink-0 bg-transparent">
            <Image src={BRAND_FAVICON_URL} alt="Mawby Teams icon" fill className="object-contain p-2" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-bold text-sm font-headline truncate tracking-tight">Mawby Teams</span>
            <Badge variant="default" className="w-fit text-[9px] h-3.5 bg-primary px-1 font-bold rounded-sm mt-0.5">
              WORKSPACE ADMIN
            </Badge>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Nav items */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5 scrollbar-chat bg-card/30">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { onSectionChange(item.id); onClose?.(); }}
              className={cn(
                'w-full flex items-center gap-3 p-2.5 rounded-xl transition-all group border border-transparent',
                isActive
                  ? 'bg-primary/5 text-primary border-primary/10'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
              <span className={cn('text-[13px] font-bold uppercase tracking-wider truncate', isActive ? 'text-primary' : '')}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom bar — same style as regular Sidebar */}
      <div className="p-4 border-t border-border space-y-2 bg-muted/10 shrink-0">
        <div className="flex items-center justify-between p-2.5 rounded-2xl bg-card border border-border shadow-xl ring-1 ring-black/5">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="relative group/avatar cursor-pointer shrink-0"
              onClick={() => avatarInputRef.current?.click()}
              title="Change profile picture"
            >
              <Avatar name={state.currentUser?.name || ''} src={state.currentUser?.avatar} size="sm" status="online" showStatus />
              <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity z-10">
                {uploadingAvatar
                  ? <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera className="h-3 w-3 text-white" />
                }
              </div>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{state.currentUser?.name}</p>
              <p className="text-[9px] text-primary font-bold uppercase tracking-widest">Workspace Admin</p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Settings stays inside admin layout — sidebar remains visible */}
                <button
                  onClick={() => onSectionChange('settings')}
                  className={cn(
                    'p-2 rounded-lg transition-all',
                    activeSection === 'settings'
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  <Settings className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Settings</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={openLogoutConfirm}
                  className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-lg text-muted-foreground transition-all"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Sign Out</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminSidebar: React.FC<{
  activeSection: AdminSection;
  onSectionChange: (s: AdminSection) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}> = ({ activeSection, onSectionChange, mobileOpen, onMobileClose }) => {
  return (
    <>
      {/* Desktop: always visible fixed column */}
      <div className="hidden md:flex w-[280px] shrink-0 border-r border-border h-full">
        <SidebarContent activeSection={activeSection} onSectionChange={onSectionChange} />
      </div>

      {/* Mobile: slide-in overlay drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <div className="relative w-[280px] h-full animate-in slide-in-from-left-full duration-300">
            <SidebarContent
              activeSection={activeSection}
              onSectionChange={onSectionChange}
              onClose={onMobileClose}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default AdminSidebar;
