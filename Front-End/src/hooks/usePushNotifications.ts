'use client';

import { useEffect, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import { isIOS, subscribePushDevice } from '@/lib/pushSubscribe';

export function usePushNotifications() {
  const { state } = useAppContext();

  // Keep latest auth state accessible inside event listeners without re-registering them
  const authRef = useRef({ isAuthenticated: state.isAuthenticated, userId: state.currentUser?.id });
  useEffect(() => {
    authRef.current = { isAuthenticated: state.isAuthenticated, userId: state.currentUser?.id };
  });

  // Core subscribe logic — runs silently, never throws
  const runSubscribe = async () => {
    if (!authRef.current.isAuthenticated || !authRef.current.userId) return;
    if (typeof window === 'undefined') return;

    // iOS requires a user gesture to call Notification.requestPermission().
    // The PushPermissionBanner component handles the iOS flow via a user tap.
    // Here we only proceed if permission is already granted (covers re-opens after iOS grant).
    if (isIOS()) {
      if (Notification.permission === 'granted') {
        console.log('[push] iOS with granted permission — subscribing');
        await subscribePushDevice(authRef.current.userId);
      } else {
        console.log('[push] iOS without granted permission — skipping auto-request (banner handles this)');
      }
      return;
    }

    // Non-iOS: ask for permission if not yet decided
    if (!('Notification' in window)) return;
    console.log('[push] Notification.permission:', Notification.permission, '| platform:', navigator.userAgent.slice(0, 60));

    let permission: NotificationPermission;
    if (Notification.permission === 'default') {
      console.log('[push] requesting permission...');
      permission = await Notification.requestPermission();
      console.log('[push] requestPermission() returned:', permission);
    } else {
      permission = Notification.permission;
    }

    if (permission !== 'granted') {
      console.warn('[push] permission not granted — aborting. value:', permission);
      return;
    }

    await subscribePushDevice(authRef.current.userId);
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
