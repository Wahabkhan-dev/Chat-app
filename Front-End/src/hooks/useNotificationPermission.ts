'use client';

import { useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { isIOS, subscribePushDevice } from '@/lib/pushSubscribe';

/**
 * Runs once per login/session to ensure the user's push subscription is
 * registered with the backend.
 *
 * Desktop:  auto-requests permission if not yet decided, then subscribes.
 * Mobile:   PushPermissionBanner handles the user-visible prompt — here we
 *           only subscribe silently when permission is already granted.
 * iOS:      only subscribe inside a standalone PWA (browser doesn't support push).
 */
export function useNotificationPermission() {
  const { state } = useAppContext();

  useEffect(() => {
    // Wait until the user is authenticated
    if (!state.isAuthenticated || !state.currentUser?.id) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    const userId = state.currentUser.id;

    const run = async () => {
      // Permission already granted — ensure subscription row exists in DB
      if (Notification.permission === 'granted') {
        await subscribePushDevice(userId, { bypassCache: true }).catch(() => {});
        return;
      }

      // On iOS, push only works in standalone PWA mode.
      // The PushPermissionBanner handles user guidance there.
      if (isIOS()) return;

      // Desktop / Android: auto-request so the user sees the native dialog
      // on first load.  On mobile browsers this shows a quiet UI; tapping
      // the bell in the address bar or the in-app banner completes the flow.
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission().catch(() => 'default' as NotificationPermission);
        if (result === 'granted') {
          await subscribePushDevice(userId, { bypassCache: true }).catch(() => {});
        }
      }
    };

    run();
  }, [state.isAuthenticated, state.currentUser?.id]);
}
