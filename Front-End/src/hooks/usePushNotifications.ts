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
      try {
        // If permission was never asked, ask once. If already granted/denied, read it without prompting.
        const permission = Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission;

        if (permission !== 'granted') {
          console.warn('[push] notification permission not granted:', permission);
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          // Check if the subscription has an expiry and whether it has passed
          const isExpired =
            subscription.expirationTime !== null &&
            subscription.expirationTime !== undefined &&
            subscription.expirationTime < Date.now();

          if (isExpired) {
            console.log('[push] existing subscription is expired — unsubscribing and creating fresh one');
            await subscription.unsubscribe();
            subscription = null;
          } else {
            console.log('[push] valid subscription exists on this device — re-registering with backend');
          }
        } else {
          console.log('[push] no subscription on this device — creating new one');
        }

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          });
          console.log('[push] new subscription created:', subscription.endpoint.slice(0, 80));
        }

        const serialized = subscription.toJSON();
        console.log('[push] registering this device with backend:', serialized.endpoint?.slice(0, 80));

        const result = await api.post<{ success: boolean }>('/push/subscribe', { subscription: serialized });
        console.log('[push] backend registration result:', result);
      } catch (err) {
        console.warn('[push] subscription setup failed:', err);
      }
    };

    subscribe();
  }, [state.isAuthenticated, state.currentUser?.id]);
}
