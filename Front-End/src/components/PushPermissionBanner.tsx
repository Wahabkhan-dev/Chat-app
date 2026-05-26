'use client';

import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { isIOS, isAndroid, isIOSPWAWithPushSupport, subscribePushDevice } from '@/lib/pushSubscribe';

// Bump the key if the banner logic changes so users see it again
const DISMISSED_KEY = 'push_banner_dismissed_v3';

const PushPermissionBanner: React.FC = () => {
  const { state } = useAppContext();
  const [visible, setVisible] = useState(false);
  // 'ask'    — permission not yet requested; tapping will trigger the browser dialog
  // 'denied' — user previously denied; guide them to browser settings
  const [scenario, setScenario] = useState<'ask' | 'denied' | null>(null);

  useEffect(() => {
    if (!state.isAuthenticated || !state.currentUser) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (sessionStorage.getItem(DISMISSED_KEY)) return;
    if (Notification.permission === 'granted') return;

    const onMobile = isIOS() || isAndroid();
    if (!onMobile) return;

    // iOS requires standalone PWA mode and PushManager support
    if (isIOS() && !isIOSPWAWithPushSupport()) return;

    setScenario(Notification.permission === 'denied' ? 'denied' : 'ask');
    setVisible(true);
  }, [state.isAuthenticated, state.currentUser?.id]);

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  const handleEnable = async () => {
    if (!state.currentUser?.id) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        subscribePushDevice(state.currentUser.id); // fire-and-forget
      } else if (permission === 'denied') {
        // Browser denied — switch to the settings-guidance variant
        setScenario('denied');
        return;
      }
    } catch {
      // iOS may throw if called outside a user gesture; shouldn't happen here
    }
    dismiss();
  };

  if (!visible || !scenario) return null;

  if (scenario === 'denied') {
    return (
      <div className="md:hidden fixed top-0 left-0 right-0 z-[9998] flex items-center gap-3 py-2.5 px-4 bg-amber-500 text-white shadow-md">
        <Bell className="h-4 w-4 shrink-0" />
        <p className="flex-1 text-[11px] font-semibold leading-snug">
          Notifications blocked — go to browser settings and allow notifications for this site
        </p>
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 p-1 rounded-full hover:bg-white/20 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-[9998] flex items-center gap-3 py-2.5 px-4 bg-primary text-white shadow-md">
      <Bell className="h-4 w-4 shrink-0" />
      <p className="flex-1 text-[11px] font-semibold leading-snug">
        Enable notifications to receive messages instantly
      </p>
      <button
        onClick={handleEnable}
        className="shrink-0 px-3 py-1 bg-white text-primary text-[11px] font-bold rounded-full whitespace-nowrap transition-opacity hover:opacity-90"
      >
        Enable
      </button>
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 p-1 rounded-full hover:bg-white/20 transition-colors">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default PushPermissionBanner;
