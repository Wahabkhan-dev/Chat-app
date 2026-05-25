'use client';

import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { isIOS, isAndroid, isPWA, isIOSPWAWithPushSupport, subscribePushDevice } from '@/lib/pushSubscribe';

const DISMISSED_KEY = 'push_banner_dismissed';

const PushPermissionBanner: React.FC = () => {
  const { state } = useAppContext();
  const [visible, setVisible] = useState(false);
  const [scenario, setScenario] = useState<'ios' | 'android_denied' | null>(null);

  useEffect(() => {
    if (!state.isAuthenticated || !state.currentUser) return;
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(DISMISSED_KEY)) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;

    if (isIOSPWAWithPushSupport() && Notification.permission !== 'granted') {
      // iOS PWA with push support — show prompt so user can tap to grant
      setScenario('ios');
      setVisible(true);
    } else if (isAndroid() && Notification.permission === 'denied') {
      // Android with denied permission — guide user to fix it in settings
      setScenario('android_denied');
      setVisible(true);
    }
  }, [state.isAuthenticated, state.currentUser?.id]);

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  const handleIOSTap = async () => {
    if (!state.currentUser?.id) return;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await subscribePushDevice(state.currentUser.id);
    }
    dismiss();
  };

  if (!visible || !scenario) return null;

  if (scenario === 'android_denied') {
    return (
      <div className="md:hidden fixed bottom-20 left-3 right-3 z-50 rounded-2xl bg-destructive/10 border border-destructive/30 p-4 flex items-start gap-3 shadow-lg">
        <Bell className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-foreground">Enable notifications</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            Notifications are blocked. Open your browser settings, find this site, and allow notifications.
          </p>
        </div>
        <button onClick={dismiss} className="shrink-0 p-1 -mt-1 -mr-1 hover:bg-muted rounded-full" aria-label="Dismiss">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  // iOS PWA scenario
  return (
    <div className="md:hidden fixed bottom-20 left-3 right-3 z-50 rounded-2xl bg-primary/10 border border-primary/30 p-4 flex items-start gap-3 shadow-lg">
      <Bell className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-foreground">Stay notified</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
          Tap to enable push notifications so you don't miss messages.
        </p>
        <button
          onClick={handleIOSTap}
          className="mt-2 px-3 py-1.5 bg-primary text-white text-[11px] font-bold rounded-lg uppercase tracking-widest"
        >
          Enable notifications
        </button>
      </div>
      <button onClick={dismiss} className="shrink-0 p-1 -mt-1 -mr-1 hover:bg-muted rounded-full" aria-label="Dismiss">
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
};

export default PushPermissionBanner;
