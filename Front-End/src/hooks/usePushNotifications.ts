'use client';

import { useEffect, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import { api } from '@/lib/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const { state } = useAppContext();

  // Keep latest auth state accessible inside event listeners without re-registering them
  const authRef = useRef({ isAuthenticated: state.isAuthenticated, userId: state.currentUser?.id });
  useEffect(() => {
    authRef.current = { isAuthenticated: state.isAuthenticated, userId: state.currentUser?.id };
  });

  // Core subscribe logic — runs silently, never throws
  const runSubscribe = async () => {
    try {
      if (!authRef.current.isAuthenticated || !authRef.current.userId) return;
      if (typeof window === 'undefined') return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (!('Notification' in window)) return;

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey || !vapidKey.startsWith('B')) return; // VAPID keys always start with B

      console.log('[push:1] subscribe() started — user:', authRef.current.userId, 'platform:', navigator.userAgent.slice(0, 80));
      console.log('[push:2] environment check — serviceWorker:', 'serviceWorker' in navigator, '| PushManager:', 'PushManager' in window, '| Notification API:', 'Notification' in window);
      console.log('[push:3] VAPID key present:', !!vapidKey, '| key prefix:', vapidKey?.slice(0, 20));

      // Permission — ask once, read silently after
      console.log('[push:4] current Notification.permission:', Notification.permission);
      let permission: NotificationPermission;
      if (Notification.permission === 'default') {
        console.log('[push:5] permission not yet asked — requesting now');
        permission = await Notification.requestPermission();
        console.log('[push:6] requestPermission() returned:', permission);
      } else {
        permission = Notification.permission;
        console.log('[push:5] permission already set, skipping prompt:', permission);
      }

      if (permission !== 'granted') {
        console.warn('[push:ERR] permission not granted — aborting. value:', permission);
        return;
      }
      console.log('[push:7] permission granted — continuing');

      // Service worker
      console.log('[push:8] waiting for serviceWorker.ready...');
      const registration = await navigator.serviceWorker.ready;
      console.log('[push:9] service worker ready — scope:', registration.scope, '| state:', registration.active?.state);

      // Existing subscription check
      console.log('[push:10] calling pushManager.getSubscription()...');
      let subscription = await registration.pushManager.getSubscription();
      console.log('[push:11] existing subscription:', subscription ? subscription.endpoint.slice(0, 80) : 'none');

      if (subscription) {
        const exp = subscription.expirationTime;
        console.log('[push:12] expirationTime:', exp, '| now:', Date.now(), '| expired:', exp !== null && exp !== undefined && exp < Date.now());
        const isExpired = exp !== null && exp !== undefined && exp < Date.now();
        if (isExpired) {
          console.log('[push:13] subscription expired — unsubscribing');
          const ok = await subscription.unsubscribe();
          console.log('[push:14] unsubscribe() result:', ok);
          subscription = null;
        } else {
          console.log('[push:13] subscription is valid — will re-register with backend');
        }
      }

      // Create if needed
      if (!subscription) {
        console.log('[push:15] calling pushManager.subscribe()...');
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          });
          console.log('[push:16] subscribe() succeeded — endpoint:', subscription.endpoint.slice(0, 80));
        } catch (subErr: any) {
          console.error('[push:ERR] pushManager.subscribe() threw:', subErr?.name, subErr?.message);
          throw subErr;
        }
      }

      // Serialize
      const serialized = subscription.toJSON();
      console.log('[push:17] serialized subscription — endpoint:', serialized.endpoint?.slice(0, 80));
      console.log('[push:18] keys present — p256dh:', !!serialized.keys?.p256dh, '| auth:', !!serialized.keys?.auth);

      // Skip backend POST if this exact endpoint is already confirmed registered for this user.
      // Cache key is per-user so switching accounts on the same device still registers correctly.
      const cacheKey = `push_ep_${authRef.current.userId}`;
      const cachedEndpoint = localStorage.getItem(cacheKey);
      if (cachedEndpoint && cachedEndpoint === serialized.endpoint) {
        console.log('[push:19] endpoint already registered for this user — skipping backend POST');
        return;
      }

      console.log('[push:19] posting to backend /push/subscribe...');
      try {
        const result = await api.post<{ success: boolean }>('/push/subscribe', { subscription: serialized });
        console.log('[push:20] backend responded:', JSON.stringify(result));
        // Cache only after confirmed success so a failed POST is retried next time
        if ((result as any)?.success) {
          localStorage.setItem(cacheKey, serialized.endpoint ?? '');
        }
      } catch (apiErr: any) {
        console.error('[push:ERR] backend POST failed:', apiErr?.message, '| full error:', apiErr);
        throw apiErr;
      }

      console.log('[push:DONE] subscription registered successfully on this device');
    } catch (err: any) {
      console.error('[push:FATAL] subscribe() failed —', err?.name, ':', err?.message);
    }
  };

  // TRIGGER 1: runs when user logs in or page loads with existing session
  useEffect(() => {
    if (!state.isAuthenticated || !state.currentUser) return;
    runSubscribe();
  }, [state.isAuthenticated, state.currentUser?.id]);

  // TRIGGER 2: runs when the app comes back to foreground (Android PWA background → foreground)
  // This covers the case where React state is preserved in memory and TRIGGER 1 never fires again
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && authRef.current.isAuthenticated) {
        console.log('[push] app came to foreground — re-checking subscription');
        runSubscribe();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []); // empty — listener is registered once, reads latest auth from authRef
}
