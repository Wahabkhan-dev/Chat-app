'use client';

import { api } from '@/lib/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
}

export function isPWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

// iOS only supports push from iOS 16.4+ in standalone PWA mode with PushManager available
export function isIOSPWAWithPushSupport(): boolean {
  return isIOS() && isPWA() && typeof window !== 'undefined' && 'PushManager' in window;
}

/**
 * Subscribes this device to push notifications and registers it with the backend.
 * Returns true on success, false on any failure (never throws).
 *
 * Prerequisites the caller must ensure:
 *  - User is authenticated (userId provided)
 *  - Notification.permission === 'granted' (caller must have obtained permission first)
 */
export async function subscribePushDevice(
  userId: string | number,
  options?: { bypassCache?: boolean }
): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false;
    if (!window.isSecureContext) {
      console.warn('[push] secure context required for push notifications');
      return false;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[push] PushManager not available on this device');
      return false;
    }
    if (!('Notification' in window)) {
      console.warn('[push] Notification API not available');
      return false;
    }

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey || !vapidKey.startsWith('B')) {
      console.warn('[push] VAPID key missing or invalid');
      return false;
    }

    if (Notification.permission !== 'granted') {
      console.warn('[push] subscribePushDevice called without granted permission — aborting');
      return false;
    }

    console.log('[push:SW] waiting for serviceWorker.ready...');
    const registration = await navigator.serviceWorker.ready;
    console.log('[push:SW] ready — scope:', registration.scope);

    let subscription = await registration.pushManager.getSubscription();
    console.log('[push:sub] existing subscription:', subscription ? subscription.endpoint.slice(0, 60) + '...' : 'none');

    if (subscription) {
      const exp = subscription.expirationTime;
      const isExpired = exp !== null && exp !== undefined && exp < Date.now();
      if (isExpired) {
        console.log('[push:sub] expired — unsubscribing');
        await subscription.unsubscribe();
        subscription = null;
      }
    }

    if (!subscription) {
      console.log('[push:sub] subscribing...');
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        console.log('[push:sub] created — endpoint:', subscription.endpoint.slice(0, 60) + '...');
      } catch (subErr: any) {
        console.error('[push:sub] pushManager.subscribe() failed:', subErr?.name, subErr?.message);
        return false;
      }
    }

    const serialized = subscription.toJSON();
    if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) {
      console.error('[push:sub] serialized subscription is missing required fields');
      return false;
    }

    // Skip backend POST if this exact endpoint is already confirmed for this user.
    // bypassCache forces a POST regardless (used on login and app-load to guarantee DB row exists).
    const cacheKey = `push_ep_${userId}`;
    const cachedEndpoint = localStorage.getItem(cacheKey);
    if (!options?.bypassCache && cachedEndpoint && cachedEndpoint === serialized.endpoint) {
      console.log('[push:sub] endpoint cached for this user — skipping backend POST');
      return true;
    }

    console.log('[push:api] posting to /push/subscribe...');
    const result = await api.post<{ success: boolean }>('/push/subscribe', { subscription: serialized });
    console.log('[push:api] backend responded:', JSON.stringify(result));

    if ((result as any)?.success) {
      localStorage.setItem(cacheKey, serialized.endpoint ?? '');
      console.log('[push:DONE] device registered successfully');
      return true;
    }

    console.warn('[push:api] backend returned non-success response');
    return false;
  } catch (err: any) {
    console.error('[push:FATAL] subscribePushDevice failed —', err?.name, ':', err?.message);
    return false;
  }
}

/**
 * Dead-simple push subscription for login and app-load.
 * Always runs the full flow: request permission → subscribe → POST to backend.
 * No cache, no duplicate checks, no early-exit conditions.
 * Backend uses ON DUPLICATE KEY UPDATE so duplicate POSTs are always safe.
 * Never throws — login flow must never be interrupted by push errors.
 */
export async function pushOnLogin(userId: string | number): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;

    // Request permission if the browser hasn't asked yet
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return;

    // Wait for the active service worker
    const registration = await navigator.serviceWorker.ready;

    // Get existing subscription or create a new one
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    // Always POST — backend handles duplicates with ON DUPLICATE KEY UPDATE
    await api.post('/push/subscribe', { subscription: subscription.toJSON() });
    console.log('[push] pushOnLogin: device registered for user', userId);
  } catch (err: any) {
    // Silent — push failure must never interrupt the login or page-load flow
    console.warn('[push] pushOnLogin failed (non-fatal):', err?.message);
  }
}
