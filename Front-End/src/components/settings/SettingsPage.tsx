
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { updateSetting } from '@/services/settings';
import { User, Palette, Save, Loader2, Monitor, Moon, Sun, Globe, Camera, Bell, BellOff, CheckCircle2, Send, RefreshCw, Timer, UploadCloud, Clock, Copy, Download, FileUp, Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Avatar } from '../ui/avatar';
import { cn } from '@/lib/utils';
import { getApiBaseUrl, getToken } from '@/lib/api';
import { AUTO_REFRESH_INTERVAL_MS, useAutoRefreshCountdown } from '@/hooks/useAutoRefresh';
import { uploadTempFile, fetchTempFileInfo, fetchMyTempFiles, TempFileUploadResult, MyTempFile, TempFileInfo } from '@/services/tempFiles';
import { startDownload } from '@/services/downloadManager';

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function swReady(timeoutMs = 10000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Service worker not ready after ${timeoutMs / 1000}s. Try reloading the app.`)), timeoutMs)
    ),
  ]) as Promise<ServiceWorkerRegistration>;
}

const SettingsPage: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = state.currentUser?.role === 'admin';
  const refreshRemaining = useAutoRefreshCountdown();
  const refreshElapsedPct = Math.min(100, 100 - (refreshRemaining / AUTO_REFRESH_INTERVAL_MS) * 100);

  // ── Max upload size (global, admin-configurable) ──────────────────────────
  const UPLOAD_SIZE_OPTIONS = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500];
  const [maxUploadMb, setMaxUploadMb] = useState<number | null>(null);
  const [savingUploadLimit, setSavingUploadLimit] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { api } = await import('@/lib/api');
        const data = await api.get<{ maxUploadMb: number }>('/settings/system');
        setMaxUploadMb(data.maxUploadMb);
      } catch {
        // Leave it unset — the card just won't render until this succeeds (or a retry via refresh)
      }
    })();
  }, []);

  const handleUploadLimitChange = async (value: string) => {
    const mb = parseInt(value, 10);
    const previous = maxUploadMb;
    setMaxUploadMb(mb); // optimistic
    setSavingUploadLimit(true);
    try {
      const { api } = await import('@/lib/api');
      await api.put<{ maxUploadMb: number }>('/settings/system', { maxUploadMb: mb });
      const { invalidateMaxUploadMbCache } = await import('@/services/appSettings');
      invalidateMaxUploadMbCache();
      toast({ title: 'Upload limit updated', description: `Files can now be up to ${mb} MB.` });
    } catch (err: any) {
      setMaxUploadMb(previous); // revert on failure
      toast({ title: 'Failed to update upload limit', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingUploadLimit(false);
    }
  };

  // ── Temporary file shares (no size limit, expires in up to 3 days, code-protected) ────────
  const EXPIRY_OPTIONS = [
    { label: '5 minutes (testing)', hours: 5 / 60 },
    { label: '1 hour', hours: 1 },
    { label: '6 hours', hours: 6 },
    { label: '12 hours', hours: 12 },
    { label: '1 day', hours: 24 },
    { label: '2 days', hours: 48 },
    { label: '3 days (max)', hours: 72 },
  ];
  const tempFileInputRef = useRef<HTMLInputElement>(null);
  const [tempExpiryHours, setTempExpiryHours] = useState(24);
  const [tempUploading, setTempUploading] = useState(false);
  const [tempUploadProgress, setTempUploadProgress] = useState(0);
  const [tempResult, setTempResult] = useState<TempFileUploadResult | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemedInfo, setRedeemedInfo] = useState<TempFileInfo | null>(null);

  const [myTempFiles, setMyTempFiles] = useState<MyTempFile[]>([]);
  const [loadingMyTempFiles, setLoadingMyTempFiles] = useState(false);

  const loadMyTempFiles = async () => {
    setLoadingMyTempFiles(true);
    try {
      setMyTempFiles(await fetchMyTempFiles());
    } catch {
      // leave list as-is — not worth a toast for a background refresh
    } finally {
      setLoadingMyTempFiles(false);
    }
  };

  useEffect(() => { loadMyTempFiles(); }, []);

  const handleTempFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTempUploading(true);
    setTempUploadProgress(0);
    setTempResult(null);
    try {
      const result = await uploadTempFile(file, tempExpiryHours, (pct) => setTempUploadProgress(pct));
      setTempResult(result);
      toast({ title: 'File uploaded', description: `Share code: ${result.code}` });
      loadMyTempFiles();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message || 'Could not upload file.', variant: 'destructive' });
    } finally {
      setTempUploading(false);
      if (tempFileInputRef.current) tempFileInputRef.current.value = '';
    }
  };

  const handleCopyCode = () => {
    if (!tempResult) return;
    navigator.clipboard.writeText(tempResult.code).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }).catch(() => {});
  };

  const handleFindCode = async () => {
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    setRedeemedInfo(null);
    try {
      setRedeemedInfo(await fetchTempFileInfo(redeemCode));
    } catch (err: any) {
      toast({ title: 'Code not found or expired', description: err?.message, variant: 'destructive' });
    } finally {
      setRedeeming(false);
    }
  };

  const handleDownloadRedeemed = () => {
    if (!redeemedInfo) return;
    // Same download manager chat file downloads use — shows a tracked progress row in
    // the Downloads panel instead of a plain, unmonitored browser download.
    startDownload({ name: redeemedInfo.name, url: redeemedInfo.url });
  };

  const [profileData, setProfileData] = useState({
    department: state.currentUser?.department || '',
    title: 'Senior Engineer',
  });

  // ── Push notification state ───────────────────────────────────────────────
  type PushStatus = 'unsupported' | 'blocked' | 'idle' | 'subscribed';
  const [pushStatus, setPushStatus] = useState<PushStatus>('idle');
  const [isEnabling, setIsEnabling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Detect unsupported/blocked synchronously after mount — no async, no hangs
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushStatus('unsupported');
    } else if (Notification.permission === 'denied') {
      setPushStatus('blocked');
    }
  }, []);

  const handleEnablePush = async () => {
    setIsEnabling(true);
    try {
      console.log('[push] Enable Notifications clicked');

      // Guard — browser support
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        toast({ title: 'Not supported', description: 'Push notifications are not supported on this browser or device.', variant: 'destructive' });
        setPushStatus('unsupported');
        return;
      }

      // Guard — iOS must be in standalone (home screen PWA) mode
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (isIOS && !(window.navigator as any).standalone) {
        toast({
          title: 'Add to home screen first',
          description: 'On iPhone, tap the Share icon in Safari and choose "Add to Home Screen". Then open the app from your home screen and try again.',
          variant: 'destructive',
        });
        return;
      }

      if (!window.isSecureContext) {
        toast({
          title: 'Secure connection required',
          description: 'Push notifications require HTTPS or localhost. Open the app over HTTPS or use a secure tunnel and try again.',
          variant: 'destructive',
        });
        return;
      }

      // Step 1 — Request permission
      console.log('[push] requesting notification permission...');
      const permission = await Notification.requestPermission();
      console.log('[push] permission result:', permission);
      if (permission === 'denied') {
        toast({ title: 'Notifications blocked', description: 'Go to browser or device settings and allow notifications for this site, then try again.', variant: 'destructive' });
        setPushStatus('blocked');
        return;
      }
      if (permission !== 'granted') {
        toast({ title: 'Permission not granted', description: 'You must allow notifications to enable this feature.', variant: 'destructive' });
        return;
      }

      // Step 2 — VAPID key
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      console.log('[push] VAPID key present:', !!vapidKey, vapidKey?.slice(0, 20));
      if (!vapidKey) {
        toast({ title: 'Configuration error', description: 'VAPID public key is missing. Contact support.', variant: 'destructive' });
        return;
      }

      // Step 3 — Service worker  ready
      console.log('[push] waiting for service worker...');
      const registration = await swReady();
      console.log('[push] service worker ready, scope:', registration.scope);

      // Step 4 — Subscribe
      console.log('[push] calling pushManager.subscribe...');
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      console.log('[push] subscription created:', sub.endpoint.slice(0, 80));

      // Step 5 — Save to DB
      console.log('[push] posting to /push/subscribe...');
      const { api } = await import('@/lib/api');
      const result = await api.post('/push/subscribe', { subscription: sub.toJSON() });
      console.log('[push] backend response:', JSON.stringify(result));

      setPushStatus('subscribed');
      toast({ title: 'Notifications enabled', description: 'This device is now registered. You will receive push notifications.' });
      console.log('[push] DONE — device registered in DB');
    } catch (err: any) {
      console.error('[push] FAILED —', err?.name, ':', err?.message, err);
      toast({ title: 'Failed to enable notifications', description: err?.message || 'Something went wrong. Open the debug console for details.', variant: 'destructive' });
    } finally {
      setIsEnabling(false);
    }
  };

  const handleTestPush = async () => {
    setIsTesting(true);
    try {
      console.log('[push:test] Send Test Notification clicked');

      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        toast({ title: 'Not supported', description: 'Push notifications are not supported on this device.', variant: 'destructive' });
        return;
      }

      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      console.log('[push:test] permission:', permission);
      if (permission !== 'granted') {
        toast({ title: 'Permission denied', description: 'Please allow notifications in your browser or device settings.', variant: 'destructive' });
        setPushStatus('blocked');
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error('VAPID public key is missing.');

      if (!window.isSecureContext) {
        toast({
          title: 'Secure connection required',
          description: 'Push notifications require HTTPS or localhost. Open the app over HTTPS or use a secure tunnel and try again.',
          variant: 'destructive',
        });
        return;
      }

      console.log('[push:test] waiting for service worker...');
      const registration = await swReady();
      console.log('[push:test] SW ready, scope:', registration.scope);

      let sub = await registration.pushManager.getSubscription();
      if (!sub) {
        console.log('[push:test] no existing subscription — creating new one...');
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }
      console.log('[push:test] subscription endpoint:', sub.endpoint.slice(0, 80));

      const { api } = await import('@/lib/api');

      console.log('[push:test] saving subscription to DB...');
      await api.post('/push/subscribe', { subscription: sub.toJSON() });
      setPushStatus('subscribed');
      console.log('[push:test] subscription saved');

      console.log('[push:test] sending test notification...');
      await api.post('/push/test', {});
      toast({ title: 'Test notification sent', description: 'You should receive a notification on this device shortly.' });
      console.log('[push:test] DONE');
    } catch (err: any) {
      console.error('[push:test] FAILED —', err?.name, ':', err?.message, err);
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
      const token = getToken();
      const res = await fetch(`${getApiBaseUrl()}/users/me/avatar`, {
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

        <div className="bg-card rounded-2xl border border-border shadow-sm p-4 md:p-6 mb-4 md:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
              <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                <Timer className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold">Auto Refresh</h3>
                <p className="text-xs text-muted-foreground font-medium">
                  The app refreshes every 30 minutes to stay up to date. It waits while you're active and refreshes once you're idle.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xl font-bold tabular-nums text-foreground" aria-live="polite">
                {formatCountdown(refreshRemaining)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
                className="rounded-xl h-9 px-4 font-bold gap-2 border-border hover:bg-primary/5 hover:text-primary"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh now
              </Button>
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${refreshElapsedPct}%` }} />
          </div>
        </div>

        {maxUploadMb !== null && (
          <div className="bg-card rounded-2xl border border-border shadow-sm p-4 md:p-6 mb-4 md:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                  <UploadCloud className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold">Max Upload Size</h3>
                  <p className="text-xs text-muted-foreground font-medium">
                    {isAdmin
                      ? 'Applies to every file sent in chat, for the whole workspace.'
                      : `Files larger than this are rejected. Only admins can change this.`}
                  </p>
                </div>
              </div>
              {isAdmin ? (
                <div className="flex items-center gap-2 shrink-0">
                  {savingUploadLimit && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  <Select value={String(maxUploadMb)} onValueChange={handleUploadLimitChange} disabled={savingUploadLimit}>
                    <SelectTrigger className="w-28 h-10 rounded-xl font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UPLOAD_SIZE_OPTIONS.map(mb => (
                        <SelectItem key={mb} value={String(mb)}>{mb} MB</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <span className="font-mono text-2xl font-bold tabular-nums text-foreground shrink-0">{maxUploadMb} MB</span>
              )}
            </div>
          </div>
        )}

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
            <TabsTrigger value="tempfiles" className="flex-1 md:flex-none gap-2 px-3 md:px-6 py-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white transition-all font-bold text-xs uppercase tracking-widest">
              <Clock className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Temp Files</span>
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

          <TabsContent value="tempfiles" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-card rounded-2xl border border-border shadow-sm p-4 md:p-8">
              <h3 className="text-lg font-bold mb-1 font-headline">Share a Temporary File</h3>
              <p className="text-sm text-muted-foreground mb-6 font-medium leading-relaxed">
                No size limit. Pick how long it should stay available (up to 3 days) — after that it's deleted automatically. Anyone with the code can download it, no login required.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
                <Select value={String(tempExpiryHours)} onValueChange={(v) => setTempExpiryHours(Number(v))} disabled={tempUploading}>
                  <SelectTrigger className="w-full sm:w-44 h-11 rounded-xl font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map(opt => (
                      <SelectItem key={opt.hours} value={String(opt.hours)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <input type="file" ref={tempFileInputRef} className="hidden" onChange={handleTempFileChange} />
                <Button
                  onClick={() => tempFileInputRef.current?.click()}
                  disabled={tempUploading}
                  className="rounded-xl h-11 px-6 font-bold gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 flex-1 sm:flex-none"
                >
                  {tempUploading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Uploading… {tempUploadProgress}%</>
                  ) : (
                    <><FileUp className="h-4 w-4" />Choose File &amp; Upload</>
                  )}
                </Button>
              </div>

              {tempUploading && (
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-6">
                  <div className="h-full bg-primary transition-[width] duration-300 ease-linear" style={{ width: `${tempUploadProgress}%` }} />
                </div>
              )}

              {tempResult && (
                <div className="p-4 md:p-5 rounded-xl bg-primary/5 border border-primary/20 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Share Code</p>
                    <p className="font-mono text-2xl font-bold tracking-widest text-foreground break-all">{tempResult.code}</p>
                    <p className="text-xs text-muted-foreground font-medium mt-1 truncate">
                      {tempResult.name} · {tempResult.size} · expires {new Date(tempResult.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCode}
                    className="rounded-xl h-10 px-4 font-bold gap-2 border-border hover:bg-primary/5 hover:text-primary shrink-0"
                  >
                    {codeCopied ? <><Check className="h-4 w-4" />Copied</> : <><Copy className="h-4 w-4" />Copy Code</>}
                  </Button>
                </div>
              )}
            </div>

            <div className="bg-card rounded-2xl border border-border shadow-sm p-4 md:p-8">
              <h3 className="text-lg font-bold mb-1 font-headline">Have a Code?</h3>
              <p className="text-sm text-muted-foreground mb-6 font-medium leading-relaxed">
                Enter an 8-character share code to look up that file's details.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch gap-3">
                <Input
                  value={redeemCode}
                  onChange={(e) => { setRedeemCode(e.target.value.toUpperCase()); setRedeemedInfo(null); }}
                  placeholder="e.g. 7K4PZ9QX"
                  maxLength={8}
                  className="rounded-xl h-11 font-mono font-bold tracking-widest uppercase flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleFindCode()}
                />
                <Button
                  onClick={handleFindCode}
                  disabled={redeeming || redeemCode.trim().length !== 8}
                  className="rounded-xl h-11 px-6 font-bold gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                >
                  {redeeming ? <><Loader2 className="h-4 w-4 animate-spin" />Finding…</> : <><Search className="h-4 w-4" />Find</>}
                </Button>
              </div>

              {redeemedInfo && (
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4 p-4 md:p-5 rounded-xl bg-primary/5 border border-primary/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{redeemedInfo.name}</p>
                    <p className="text-xs text-muted-foreground font-medium mt-1">
                      {redeemedInfo.size} · shared by {redeemedInfo.sharedBy} · expires {new Date(redeemedInfo.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    onClick={handleDownloadRedeemed}
                    className="rounded-xl h-10 px-5 font-bold gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 shrink-0"
                  >
                    <Download className="h-4 w-4" />Download
                  </Button>
                </div>
              )}
            </div>

            <div className="bg-card rounded-2xl border border-border shadow-sm p-4 md:p-8">
              <h3 className="text-lg font-bold mb-1 font-headline">Your Active Shares</h3>
              <p className="text-sm text-muted-foreground mb-6 font-medium leading-relaxed">
                Files you've shared that haven't expired yet. Once a file expires it's deleted automatically and disappears from this list.
              </p>

              {loadingMyTempFiles ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading…
                </div>
              ) : myTempFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground font-medium py-4">You have no active shared files right now.</p>
              ) : (
                <div className="space-y-3">
                  {myTempFiles.map((f) => (
                    <div key={f.code} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground font-medium mt-0.5">
                          {f.size} · expires {new Date(f.expiresAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-sm font-bold tracking-widest bg-card border border-border rounded-lg px-3 py-1.5">{f.code}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigator.clipboard.writeText(f.code).catch(() => {})}
                          className="rounded-lg h-9 w-9 p-0 border-border hover:bg-primary/5 hover:text-primary"
                          title="Copy code"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
