
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { updateSetting } from '@/services/settings';
import { User, Palette, Save, Loader2, Monitor, Moon, Sun, Globe, Camera, Bell, BellOff, CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Avatar } from '../ui/avatar';
import { cn } from '@/lib/utils';

const SettingsPage: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = state.currentUser?.role === 'admin';

  const [profileData, setProfileData] = useState({
    department: state.currentUser?.department || '',
    title: 'Senior Engineer',
  });

  // ── Push notification state ───────────────────────────────────────────────
  type PushStatus = 'checking' | 'unsupported' | 'blocked' | 'idle' | 'subscribed';
  const [pushStatus, setPushStatus] = useState<PushStatus>('checking');
  const [isEnabling, setIsEnabling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined') { setPushStatus('unsupported'); return; }
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setPushStatus('unsupported'); return;
      }
      if (Notification.permission === 'denied') { setPushStatus('blocked'); return; }
      if (Notification.permission === 'granted') {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          setPushStatus(sub ? 'subscribed' : 'idle');
        } catch { setPushStatus('idle'); }
        return;
      }
      setPushStatus('idle'); // 'default' — never asked
    })();
  }, []);

  const handleEnablePush = async () => {
    setIsEnabling(true);
    try {
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') { setPushStatus('blocked'); return; }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error('Push notifications are not configured');

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        // Decode VAPID public key (Base64url → Uint8Array)
        const b64 = (vapidKey + '='.repeat((4 - vapidKey.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
        const key = Uint8Array.from([...atob(b64)].map(c => c.charCodeAt(0)));
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }

      const { api } = await import('@/lib/api');
      await api.post('/push/subscribe', { subscription: sub.toJSON() });
      setPushStatus('subscribed');
      toast({ title: 'Notifications enabled', description: 'You will now receive push notifications on this device.' });
    } catch (err: any) {
      toast({ title: 'Could not enable notifications', description: err?.message || 'Something went wrong.', variant: 'destructive' });
    } finally {
      setIsEnabling(false);
    }
  };

  const handleTestPush = async () => {
    setIsTesting(true);
    try {
      const { api } = await import('@/lib/api');
      await api.post('/push/test', {});
      toast({ title: 'Test notification sent', description: 'You should receive a notification on this device shortly.' });
    } catch (err: any) {
      toast({ title: 'Test failed', description: err?.message || 'Could not send test notification.', variant: 'destructive' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!state.currentUser) return;
    setIsSaving(true);
    try {
      const { user: updated } = await (await import('@/lib/api')).api.put<{ user: any }>(`/users/${state.currentUser.id}`, {
        role: state.currentUser.role,
        department: profileData.department,
        avatar: state.currentUser.avatar || '',
      });
      dispatch({
        type: 'UPDATE_USER',
        payload: { ...state.currentUser, ...updated, id: String(updated.id), isActive: updated.is_active === 1 },
      });
      toast({ title: 'Settings Saved', description: 'Your workspace preferences have been updated.' });
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !state.currentUser) return;
    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const token = typeof window !== 'undefined' ? localStorage.getItem('teams_token') : null;
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${BASE_URL}/users/me/avatar`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      dispatch({ type: 'UPDATE_USER', payload: { ...state.currentUser, avatar: data.avatarKey } });
      toast({ title: 'Profile picture updated', description: 'Your photo is now visible to the team.' });
    } catch {
      toast({ title: 'Upload failed', description: 'Could not update your profile picture.', variant: 'destructive' });
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
    const updatedSettings = updateSetting('theme', theme);
    dispatch({ type: 'LOAD_SETTINGS', payload: updatedSettings });
  };

  return (
    <div className="flex-1 bg-background p-4 md:p-8 overflow-y-auto scrollbar-hide animate-in fade-in duration-500">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold font-headline text-foreground tracking-tight">Workspace Settings</h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">Manage your account preferences and workspace experience.</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-4 md:space-y-6">
          <TabsList className="bg-card border p-1 rounded-xl h-auto w-full md:w-auto overflow-x-auto">
            <TabsTrigger value="profile" className="flex-1 md:flex-none gap-2 px-3 md:px-6 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white transition-all font-bold text-xs uppercase tracking-widest">
              <User className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex-1 md:flex-none gap-2 px-3 md:px-6 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white transition-all font-bold text-xs uppercase tracking-widest">
              <Palette className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Appearance</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex-1 md:flex-none gap-2 px-3 md:px-6 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white transition-all font-bold text-xs uppercase tracking-widest">
              <Bell className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-card rounded-2xl border border-border shadow-sm p-4 md:p-8">
              {/* Profile picture section — stacks on mobile */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-8 mb-8">
                <div className="relative group cursor-pointer shrink-0" onClick={() => !isUploadingPhoto && fileInputRef.current?.click()} title="Change profile picture">
                  <Avatar name={state.currentUser?.name || ''} src={state.currentUser?.avatar} size="xl" />
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {isUploadingPhoto
                      ? <div className="h-7 w-7 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                      : <Camera className="h-8 w-8 text-white" />
                    }
                  </div>
                </div>

                <div className="flex-1 text-center sm:text-left">
                  <h3 className="text-xl font-bold font-headline">Profile Picture</h3>
                  <p className="text-sm text-muted-foreground mb-4 md:mb-6 font-medium leading-relaxed">
                    Upload a clear photo to help your team members recognize you.
                  </p>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoChange} />
                  <Button variant="outline" size="sm" className="rounded-xl h-10 px-6 font-bold border-border hover:bg-primary/5 hover:text-primary transition-all gap-2 w-full sm:w-auto" onClick={() => fileInputRef.current?.click()} disabled={isUploadingPhoto}>
                    <Camera className="h-4 w-4" />
                    {isUploadingPhoto ? 'Uploading...' : 'Change Photo'}
                  </Button>
                </div>
              </div>

              <Separator className="mb-6 md:mb-8" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                <div className="space-y-2.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Full Name</Label>
                  <div className="rounded-xl bg-muted/30 border border-border h-12 px-4 flex items-center text-sm font-medium text-muted-foreground select-none">
                    {state.currentUser?.name}
                  </div>
                </div>
                <div className="space-y-2.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Email Address</Label>
                  <div className="rounded-xl bg-muted/30 border border-border h-12 px-4 flex items-center text-sm font-medium text-muted-foreground select-none truncate">
                    {state.currentUser?.email}
                  </div>
                </div>
                <div className="space-y-2.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Department</Label>
                  {isAdmin ? (
                    <Input
                      value={profileData.department}
                      onChange={(e) => setProfileData({...profileData, department: e.target.value})}
                      className="rounded-xl border-border bg-muted/20 h-12 text-sm font-medium focus:bg-card transition-all"
                    />
                  ) : (
                    <div className="rounded-xl bg-muted/30 border border-border h-12 px-4 flex items-center text-sm font-medium text-foreground">
                      {state.currentUser?.department || '—'}
                    </div>
                  )}
                </div>
                <div className="space-y-2.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Professional Title</Label>
                  <div className="rounded-xl bg-muted/30 border border-border h-12 px-4 flex items-center text-sm font-medium text-foreground">
                    {profileData.title || '—'}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-card rounded-2xl border border-border shadow-sm p-4 md:p-8">
              <h3 className="text-lg font-bold mb-5 md:mb-8 font-headline">Theme Preference</h3>
              <div className="grid grid-cols-3 gap-3 md:gap-6">
                {([
                  { value: 'light', icon: Sun, label: 'Light' },
                  { value: 'dark', icon: Moon, label: 'Dark' },
                  { value: 'system', icon: Monitor, label: 'System' },
                ] as const).map(({ value, icon: Icon, label }) => (
                  <div
                    key={value}
                    onClick={() => handleThemeChange(value)}
                    className={cn(
                      "p-4 md:p-6 border-2 rounded-2xl flex flex-col items-center gap-2 md:gap-4 cursor-pointer transition-all",
                      state.theme === value ? "border-primary bg-primary/5 ring-4 ring-primary/10 shadow-lg" : "hover:border-primary/40 border-border bg-muted/20"
                    )}
                  >
                    <Icon className={cn("h-6 w-6 md:h-8 md:w-8", state.theme === value ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest">{label}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 md:mt-12 space-y-4">
                <h3 className="text-lg font-bold font-headline">Localization</h3>
                <div className="flex items-center justify-between p-4 md:p-5 bg-muted/30 dark:bg-muted/5 rounded-2xl border border-border/50">
                   <div className="flex items-center gap-3 md:gap-4">
                     <div className="p-2 bg-card rounded-lg border shadow-sm">
                       <Globe className="h-5 w-5 text-muted-foreground" />
                     </div>
                     <span className="text-sm font-bold">Workspace Language</span>
                   </div>
                   <Button variant="ghost" size="sm" className="font-bold text-primary hover:bg-primary/5 rounded-lg h-9 px-4">English (US)</Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-card rounded-2xl border border-border shadow-sm p-4 md:p-8">
              <h3 className="text-lg font-bold mb-1 font-headline">Push Notifications</h3>
              <p className="text-sm text-muted-foreground mb-6 font-medium leading-relaxed">
                Receive instant notifications for new messages even when the app is in the background or closed.
              </p>

              <div className="space-y-4">
                {pushStatus === 'checking' && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking notification status…
                  </div>
                )}

                {pushStatus === 'unsupported' && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/40 border border-border text-sm text-muted-foreground font-medium">
                    <BellOff className="h-5 w-5 shrink-0" />
                    Push notifications are not supported on this browser or device.
                  </div>
                )}

                {(pushStatus === 'idle' || pushStatus === 'blocked' || pushStatus === 'subscribed') && (
                  <>
                    {/* Status row */}
                    <div className={cn(
                      'flex items-center gap-3 p-4 rounded-xl border text-sm font-medium',
                      pushStatus === 'subscribed'
                        ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400'
                        : pushStatus === 'blocked'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                        : 'bg-muted/40 border-border text-muted-foreground'
                    )}>
                      {pushStatus === 'subscribed' && <CheckCircle2 className="h-5 w-5 shrink-0" />}
                      {pushStatus === 'blocked'    && <BellOff className="h-5 w-5 shrink-0" />}
                      {pushStatus === 'idle'       && <Bell className="h-5 w-5 shrink-0" />}
                      {pushStatus === 'subscribed' && 'Notifications are enabled on this device.'}
                      {pushStatus === 'blocked'    && 'Notifications are blocked. Open your browser or device settings and allow notifications for this site, then return here.'}
                      {pushStatus === 'idle'       && 'Notifications are not yet enabled on this device.'}
                    </div>

                    {/* Enable button */}
                    {(pushStatus === 'idle' || pushStatus === 'subscribed') && (
                      <Button
                        onClick={pushStatus === 'idle' ? handleEnablePush : undefined}
                        disabled={isEnabling || pushStatus === 'subscribed'}
                        className={cn(
                          'rounded-xl h-11 px-6 font-bold gap-2 transition-all w-full sm:w-auto',
                          pushStatus === 'subscribed'
                            ? 'bg-green-600 hover:bg-green-600 text-white cursor-default'
                            : 'bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20'
                        )}
                      >
                        {isEnabling ? (
                          <><Loader2 className="h-4 w-4 animate-spin" />Enabling…</>
                        ) : pushStatus === 'subscribed' ? (
                          <><CheckCircle2 className="h-4 w-4" />Notifications Enabled</>
                        ) : (
                          <><Bell className="h-4 w-4" />Enable Notifications</>
                        )}
                      </Button>
                    )}
                  </>
                )}

                {/* Send Test Notification — always visible on every device */}
                <Button
                  variant="outline"
                  onClick={handleTestPush}
                  disabled={isTesting}
                  className="rounded-xl h-11 px-6 font-bold gap-2 border-border hover:bg-primary/5 hover:text-primary transition-all w-full sm:w-auto"
                >
                  {isTesting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Sending…</>
                  ) : (
                    <><Send className="h-4 w-4" />Send Test Notification</>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          {isAdmin && (
            <div className="flex justify-end pt-4 md:pt-8">
              <Button
                className="w-full md:w-auto bg-primary hover:bg-primary/90 text-white px-6 md:px-10 h-12 md:h-16 rounded-2xl shadow-xl shadow-primary/20 gap-3 transition-all hover:scale-105 active:scale-95"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                <span className="text-base md:text-xl font-bold">Save Changes</span>
              </Button>
            </div>
          )}
        </Tabs>
      </div>
    </div>
  );
};

export default SettingsPage;
