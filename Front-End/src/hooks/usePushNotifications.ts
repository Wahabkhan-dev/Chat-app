'use client';

import { useEffect, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import { isIOS, isAndroid, subscribePushDevice } from '@/lib/pushSubscribe';

export function usePushNotifications() {
  const { state } = useAppContext();

  // Keep latest auth state accessible inside event listeners without stale closures
  const authRef = useRef({ isAuthenticated: state.isAuthenticated, userId: state.currentUser?.id });
  useEffect(() => {
    authRef.current = { isAuthenticated: state.isAuthenticated, userId: state.currentUser?.id };
  });

  const runSubscribe = async () => {
    if (!authRef.current.isAuthenticated || !authRef.current.userId) return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    const isMobile = isIOS() || isAndroid();

    if (isMobile) {
      // Mobile: the PushPermissionBanner handles the user-facing prompt.
      // Here we only subscribe silently when permission is already granted
      // (covers app re-open after user previously enabled notifications).
      if (Notification.permission !== 'granted') return;
      console.log('[push] mobile — permission already granted, subscribing silently');
    } else {
      // Desktop: auto-request if not yet decided so desktop users don't miss notifications
      if (Notification.permission === 'denied') return;
      if (Notification.permission === 'default') {
        console.log('[push] desktop — requesting permission');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
      }
    }

    await subscribePushDevice(authRef.current.userId);
  };

  // TRIGGER 1: user logs in or page loads with an existing session
  useEffect(() => {
    if (!state.isAuthenticated || !state.currentUser) return;
    runSubscribe();
  }, [state.isAuthenticated, state.currentUser?.id]);

  // TRIGGER 2: app comes back to foreground (covers Android PWA background → foreground)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && authRef.current.isAuthenticated) {
        runSubscribe();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []); // registered once; reads latest auth from authRef
}
