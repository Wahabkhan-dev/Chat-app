'use client';

import React, { useEffect, useState } from 'react';
import { Bell, BellOff, X, Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { isIOS, isIOSPWAWithPushSupport, subscribePushDevice } from '@/lib/pushSubscribe';

// Bumped key — switches from sessionStorage (old) to localStorage with expiry (new)
const SNOOZE_KEY = 'push_banner_v4';
const SNOOZE_MS  = 3 * 24 * 60 * 60 * 1000; // re-show after 3 days if snoozed

const PushPermissionBanner: React.FC = () => {
  const { state } = useAppContext();
  const [visible, setVisible]   = useState(false);
  const [scenario, setScenario] = useState<'ask' | 'denied' | null>(null);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (!state.isAuthenticated || !state.currentUser) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;

    // iOS only supports push in standalone PWA mode with PushManager available
    if (isIOS() && !isIOSPWAWithPushSupport()) return;

    // Check if snoozed recently
    const snoozedAt = localStorage.getItem(SNOOZE_KEY);
    if (snoozedAt && Date.now() - parseInt(snoozedAt, 10) < SNOOZE_MS) return;

    setScenario(Notification.permission === 'denied' ? 'denied' : 'ask');
    setVisible(true);
  }, [state.isAuthenticated, state.currentUser?.id]);

  const snooze = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setVisible(false);
  };

  const handleEnable = async () => {
    if (!state.currentUser?.id || enabling) return;
    setEnabling(true);
    try {
      // Must be called inside a user-gesture handler so the browser shows the full dialog
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await subscribePushDevice(state.currentUser.id, { bypassCache: true });
        // Remove snooze so we never re-prompt a subscribed user
        localStorage.removeItem(SNOOZE_KEY);
        setVisible(false);
        return;
      }
      if (permission === 'denied') {
        setScenario('denied');
        setEnabling(false);
        return;
      }
    } catch {
      // Browsers may throw if called in a disallowed context — stay visible
    }
    setEnabling(false);
  };

  if (!visible || !scenario) return null;

  // ── Denied: guide user to browser settings ────────────────────────────────
  if (scenario === 'denied') {
    return (
      <>
        {/* Mobile top bar */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-[9998] flex items-center gap-3 py-3 px-4 bg-amber-500 text-white shadow-lg animate-in slide-in-from-top-2 duration-300">
          <BellOff className="h-4 w-4 shrink-0" />
          <p className="flex-1 text-xs font-semibold leading-snug">
            Notifications are blocked. Open your browser settings and allow them for this site.
          </p>
          <button onClick={snooze} aria-label="Dismiss" className="shrink-0 p-1 rounded-full hover:bg-white/20 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Desktop bottom-right card */}
        <div className="hidden md:flex fixed bottom-6 right-6 z-[9998] flex-col gap-3 w-80 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-3 duration-300">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900 flex items-center justify-center shrink-0">
              <BellOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-100">Notifications blocked</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5 leading-snug">
                Go to your browser settings and allow notifications for this site to receive message alerts.
              </p>
            </div>
            <button onClick={snooze} aria-label="Dismiss" className="shrink-0 p-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900 text-amber-600 dark:text-amber-400 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Ask: prompt user to enable ────────────────────────────────────────────
  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-[9998] flex items-center gap-3 py-3 px-4 bg-primary text-white shadow-lg animate-in slide-in-from-top-2 duration-300">
        <Bell className="h-4 w-4 shrink-0" />
        <p className="flex-1 text-xs font-semibold leading-snug">
          Enable notifications to get instant message alerts
        </p>
        <button
          onClick={handleEnable}
          disabled={enabling}
          className="shrink-0 px-3 py-1 bg-white text-primary text-[11px] font-bold rounded-full whitespace-nowrap flex items-center gap-1 hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {enabling ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Enable
        </button>
        <button onClick={snooze} aria-label="Dismiss" className="shrink-0 p-1 rounded-full hover:bg-white/20 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Desktop bottom-right card */}
      <div className="hidden md:flex fixed bottom-6 right-6 z-[9998] flex-col gap-3 w-80 bg-card border border-border rounded-2xl p-4 shadow-2xl ring-1 ring-black/5 animate-in slide-in-from-bottom-3 duration-300">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">Stay in the loop</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Enable push notifications so you never miss a message from your team.
            </p>
          </div>
          <button onClick={snooze} aria-label="Dismiss" className="shrink-0 p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={snooze}
            className="flex-1 py-2 text-xs font-bold border border-border rounded-xl hover:bg-muted transition-colors"
          >
            Not now
          </button>
          <button
            onClick={handleEnable}
            disabled={enabling}
            className="flex-1 py-2 text-xs font-bold bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {enabling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
            Enable Notifications
          </button>
        </div>
      </div>
    </>
  );
};

export default PushPermissionBanner;
