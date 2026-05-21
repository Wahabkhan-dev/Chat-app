
"use client";

import React, { useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import KPICard from '../ui/KPICard';
import { Users, Shield, MessageCircle, Activity, UserPlus, Users2, MoreVertical, Edit2, Ban, CheckCircle, Eye, Search, Trash2, MessageSquare, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar } from '../ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { User } from '@/mock/users';
import { Group } from '@/mock/groups';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import ChangePasswordModal from '../modals/ChangePasswordModal';

const AdminDashboard: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
  const [changePasswordTarget, setChangePasswordTarget] = useState<User | null>(null);

  const totalUsers = state.users.filter(u => u.isActive).length;
  const totalAdmins = state.users.filter(u => u.role === 'admin' && u.isActive).length;
  const onlineUsers = state.users.filter(u => u.status === 'online' && u.isActive).length;
  const totalGroups = state.groups.length;

  const filteredUsers = state.users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => (a.isActive === b.isActive) ? 0 : a.isActive ? -1 : 1);

  const filteredGroups = state.groups.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (g.description && g.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDeactivate = (user: User) => {
    dispatch({
      type: 'OPEN_MODAL',
      payload: {
        type: 'confirm',
        data: {
          title: 'Deactivate User',
          confirmStyle: 'danger',
          requireName: user.name,
          body: `Deactivating ${user.name} will prevent them from logging in. This can be reversed later.`,
          confirmLabel: 'Deactivate Account',
          onConfirm: async () => {
            try {
              await api.put(`/users/${user.id}/deactivate`, {});
              dispatch({ type: 'DEACTIVATE_USER', payload: user.id });
              dispatch({ type: 'ADD_TOAST', payload: { message: `🔴 ${user.name} deactivated`, type: 'info' } });
            } catch {
              dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to deactivate user', type: 'error' } });
            }
          }
        }
      }
    });
  };

  const handleReactivate = (user: User) => {
    dispatch({
      type: 'OPEN_MODAL',
      payload: {
        type: 'confirm',
        data: {
          title: 'Reactivate User',
          body: `Reactivate ${user.name}'s account? They will be able to log in again.`,
          confirmLabel: 'Reactivate',
          onConfirm: async () => {
            try {
              await api.put(`/users/${user.id}/reactivate`, {});
              dispatch({ type: 'REACTIVATE_USER', payload: user.id });
              dispatch({ type: 'ADD_TOAST', payload: { message: `🟢 ${user.name} reactivated`, type: 'success' } });
            } catch {
              dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to reactivate user', type: 'error' } });
            }
          }
        }
      }
    });
  };

  const handleDeleteUser = (user: User) => {
    dispatch({
      type: 'OPEN_MODAL',
      payload: {
        type: 'confirm',
        data: {
          title: 'Permanently Delete User',
          confirmStyle: 'danger',
          requireName: user.name,
          body: `Permanently delete ${user.name}? All their data will be removed. This CANNOT be undone.`,
          confirmLabel: 'Delete Permanently',
          onConfirm: async () => {
            try {
              await api.delete(`/users/${user.id}`);
              dispatch({ type: 'DEACTIVATE_USER', payload: user.id });
              dispatch({ type: 'ADD_TOAST', payload: { message: `🗑 ${user.name} permanently deleted`, type: 'info' } });
            } catch {
              dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to delete user', type: 'error' } });
            }
          }
        }
      }
    });
  };

  const handleDeleteGroup = (group: Group) => {
    dispatch({
      type: 'OPEN_MODAL',
      payload: {
        type: 'confirm',
        data: {
          title: 'Delete Group',
          confirmStyle: 'danger',
          requireName: group.name,
          body: `Are you sure you want to delete "${group.name}"? This will permanently remove all messages and files associated with this group.`,
          confirmLabel: 'Delete Permanently',
          onConfirm: async () => {
            try {
              await api.delete(`/groups/${group.id}`);
              dispatch({ type: 'DELETE_GROUP', payload: group.id });
              dispatch({ type: 'ADD_TOAST', payload: { message: `Group "${group.name}" deleted`, type: 'info' } });
            } catch {
              dispatch({ type: 'ADD_TOAST', payload: { message: 'Failed to delete group', type: 'error' } });
            }
          }
        }
      }
    });
  };

  return (
    <>
    <div className="flex-1 overflow-y-auto bg-background p-8 scrollbar-hide animate-in fade-in duration-500">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold font-headline text-foreground tracking-tight">Workspace Admin</h1>
            <p className="text-muted-foreground mt-1 text-sm font-medium uppercase tracking-wider opacity-70">Member Directory & System Analytics</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="gap-2 border-border hover:bg-muted rounded-xl font-bold h-11" onClick={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'createGroup' } })}>
              <Users2 className="h-4 w-4" />
              <span>Create Group</span>
            </Button>
            <Button className="gap-2 bg-primary text-white hover:bg-primary/90 rounded-xl font-bold h-11 shadow-lg shadow-primary/20" onClick={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'createUser' } })}>
              <UserPlus className="h-4 w-4" />
              <span>Add Member</span>
            </Button>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard title="Active Members" value={totalUsers} icon={Users} color="text-primary" />
          <KPICard title="System Admins" value={totalAdmins} icon={Shield} color="text-secondary" />
          <KPICard title="Workspace Groups" value={totalGroups} icon={MessageCircle} color="text-accent" />
          <KPICard title="Online Now" value={onlineUsers} icon={Activity} color="text-green-500" />
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          <div className="p-6 border-b border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/50">
            <div className="flex gap-1 bg-muted p-1 rounded-xl">
              <button 
                onClick={() => { setActiveTab('users'); setSearchTerm(''); }}
                className={cn("px-4 py-2 text-xs font-bold rounded-lg transition-all", activeTab === 'users' ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
              >
                Team Directory
              </button>
              <button 
                onClick={() => { setActiveTab('groups'); setSearchTerm(''); }}
                className={cn("px-4 py-2 text-xs font-bold rounded-lg transition-all", activeTab === 'groups' ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
              >
                Managed Groups
              </button>
            </div>
            
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder={activeTab === 'users' ? "Search by name or email..." : "Search groups..."} 
                className="pl-9 h-10 rounded-xl border-muted/30 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {activeTab === 'users' ? (
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/30 text-left">
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Member</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Email</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Department</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Role</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map(user => (
                    <tr key={user.id} className={cn('hover:bg-muted/20 transition-all group', !user.isActive && 'bg-muted/10')}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <Avatar name={user.name} src={user.avatar} size="sm" className={!user.isActive ? 'grayscale opacity-50' : ''} />
                          <div className={cn(!user.isActive && 'opacity-60 italic')}>
                            <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{user.name}</p>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">{user.department}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground font-medium">{user.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground font-bold">{user.department}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className={cn('text-[10px] font-bold tracking-wider', user.role === 'admin' ? 'bg-primary/10 text-primary border-none' : 'bg-muted/50 text-muted-foreground border-none')}>
                          {user.role.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className={cn('h-2 w-2 rounded-full ring-2 ring-background', !user.isActive ? 'bg-gray-400' : user.status === 'online' ? 'bg-green-500' : 'bg-gray-300')} />
                          <span className="text-xs text-foreground font-medium capitalize">{!user.isActive ? 'Inactive' : user.status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-2 hover:bg-muted rounded-xl transition-all"><MoreVertical className="h-4 w-4 text-muted-foreground" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border min-w-[180px] rounded-xl shadow-xl z-[var(--z-dropdown)]">
                            <DropdownMenuItem
                              className="gap-2 py-2.5 font-medium cursor-pointer"
                              onClick={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'userProfile', data: { user } } })}
                            >
                              <Eye className="h-4 w-4 text-muted-foreground" /> View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 py-2.5 font-medium cursor-pointer" onClick={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'editUser', data: { user } } })}>
                              <Edit2 className="h-4 w-4 text-primary" /> Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 py-2.5 font-medium cursor-pointer" onClick={() => setChangePasswordTarget(user)}>
                              <KeyRound className="h-4 w-4 text-orange-500" /> Change Password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {user.isActive ? (
                              <DropdownMenuItem
                                className="gap-2 py-2.5 text-destructive font-medium cursor-pointer focus:bg-destructive/10"
                                onClick={() => handleDeactivate(user)}
                                disabled={state.currentUser?.id === user.id}
                              >
                                <Ban className="h-4 w-4" /> Deactivate User
                              </DropdownMenuItem>
                            ) : (
                              <>
                                <DropdownMenuItem
                                  className="gap-2 py-2.5 text-green-600 font-medium cursor-pointer focus:bg-green-500/10"
                                  onClick={() => handleReactivate(user)}
                                >
                                  <CheckCircle className="h-4 w-4" /> Reactivate User
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 py-2.5 text-destructive font-medium cursor-pointer focus:bg-destructive/10"
                                  onClick={() => handleDeleteUser(user)}
                                >
                                  <Trash2 className="h-4 w-4" /> Delete Permanently
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/30 text-left">
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Group</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Description</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Members</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">Admins</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Created</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredGroups.map(group => (
                    <tr key={group.id} className="hover:bg-muted/20 transition-all group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-white font-bold shadow-sm shrink-0">
                            {group.name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{group.name}</p>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">ID: {group.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <p className="text-sm text-muted-foreground truncate">{group.description || 'No description provided.'}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Badge variant="outline" className="text-xs font-bold border-border bg-muted/20">
                          {group.members.length}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Badge variant="secondary" className="text-xs font-bold bg-primary/10 text-primary border-none">
                          {group.admins?.length || 1}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground font-medium">
                        {format(new Date(group.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-2 hover:bg-muted rounded-xl transition-all"><MoreVertical className="h-4 w-4 text-muted-foreground" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border min-w-[180px] rounded-xl shadow-xl z-[var(--z-dropdown)]">
                            <DropdownMenuItem className="gap-2 py-2.5 font-medium cursor-pointer" onClick={() => dispatch({ type: 'OPEN_MODAL', payload: { type: 'editGroup', data: { group } } })}>
                              <Edit2 className="h-4 w-4 text-primary" /> Edit Group
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="gap-2 py-2.5 text-destructive font-medium cursor-pointer focus:bg-destructive/10" onClick={() => handleDeleteGroup(group)}>
                              <Trash2 className="h-4 w-4" /> Delete Group
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {filteredGroups.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-20 text-center">
                        <MessageCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                        <h3 className="text-lg font-bold">No groups found</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-2">Try adjusting your search term or create a new group.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>

    <ChangePasswordModal
      userId={changePasswordTarget?.id || ''}
      userName={changePasswordTarget?.name || ''}
      open={changePasswordTarget !== null}
      onClose={() => setChangePasswordTarget(null)}
    />
    </>
  );
};

export default AdminDashboard;
