'use client';

import { useEffect } from 'react';
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

  useEffect(() => {
    if (!state.isAuthenticated || !state.currentUser) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;

    const subscribe = async () => {
      console.log('[push:1] subscribe() started — user:', state.currentUser?.id, 'platform:', navigator.userAgent.slice(0, 80));

      // STEP 1 — environment checks
      console.log('[push:2] environment check — serviceWorker:', 'serviceWorker' in navigator, '| PushManager:', 'PushManager' in window, '| Notification API:', 'Notification' in window);
      console.log('[push:3] VAPID key present:', !!vapidKey, '| key prefix:', vapidKey?.slice(0, 20));

      try {
        // STEP 2 — permission
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

        // STEP 3 — service worker
        console.log('[push:8] waiting for serviceWorker.ready...');
        const registration = await navigator.serviceWorker.ready;
        console.log('[push:9] service worker ready — scope:', registration.scope, '| state:', registration.active?.state);

        // STEP 4 — existing subscription check
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

        // STEP 5 — create subscription if needed
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

        // STEP 6 — serialize
        const serialized = subscription.toJSON();
        console.log('[push:17] serialized subscription — endpoint:', serialized.endpoint?.slice(0, 80));
        console.log('[push:18] keys present — p256dh:', !!serialized.keys?.p256dh, '| auth:', !!serialized.keys?.auth);

        // STEP 7 — send to backend
        console.log('[push:19] posting to backend /push/subscribe...');
        try {
          const result = await api.post<{ success: boolean }>('/push/subscribe', { subscription: serialized });
          console.log('[push:20] backend responded:', JSON.stringify(result));
        } catch (apiErr: any) {
          console.error('[push:ERR] backend POST failed:', apiErr?.message, '| full error:', apiErr);
          throw apiErr;
        }

        console.log('[push:DONE] subscription registered successfully on this device');
      } catch (err: any) {
        console.error('[push:FATAL] subscribe() failed at step above —', err?.name, ':', err?.message);
        console.error('[push:FATAL] full error object:', err);
      }
    };

    subscribe();
  }, [state.isAuthenticated, state.currentUser?.id]);
}
