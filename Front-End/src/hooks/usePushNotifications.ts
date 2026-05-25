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
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn('[push] notification permission denied');
          return;
        }

        const registration = await navigator.serviceWorker.ready;

        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          console.log('[push] no existing subscription, creating new one');
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          });
        } else {
          console.log('[push] existing browser subscription found, re-sending to backend');
        }

        const serialized = subscription.toJSON();
        console.log('[push] sending subscription to backend:', serialized.endpoint);

        const result = await api.post<{ success: boolean }>('/push/subscribe', { subscription: serialized });
        console.log('[push] backend save result:', result);
      } catch (err) {
        console.warn('[push] subscription setup failed:', err);
      }
    };

    subscribe();
  }, [state.isAuthenticated, state.currentUser?.id]);
}
