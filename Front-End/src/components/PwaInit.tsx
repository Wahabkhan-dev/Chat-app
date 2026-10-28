'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '@/context/AppContext';

export function PwaInit() {
  const { state, dispatch } = useAppContext();

  useEffect(() => {
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      screen.orientation.lock('portrait').catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) {
      console.warn('[PWA] Service worker registration skipped: secure context required for push notifications');
      return;
    }

    const registerWorker = () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('[PWA] Service worker registered:', registration.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Service worker registration failed:', err);
        });
    };

    if (document.readyState === 'complete') {
      registerWorker();
    } else {
      window.addEventListener('load', registerWorker);
      return () => window.removeEventListener('load', registerWorker);
    }
  }, []);

  // Clicking a push notification only focuses an already-open tab — it doesn't navigate
  // the running SPA anywhere on its own. The service worker (sw.js) either postMessages
  // the focused tab, or (cold start, new tab) opens a URL carrying the conversation in
  // query params. Both land here; the name is left blank so the reducer's own fallback
  // (SET_ACTIVE_CONVERSATION in AppContext) resolves it from state.users/groups.
  const [pendingOpen, setPendingOpen] = useState<{ id: string; type: 'dm' | 'group' } | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('openConversationId');
    const type = params.get('openConversationType');
    if (id && (type === 'dm' || type === 'group')) {
      params.delete('openConversationId');
      params.delete('openConversationType');
      const newUrl = window.location.pathname + (params.toString() ? `?${params}` : '');
      window.history.replaceState({}, '', newUrl);
      return { id, type };
    }
    return null;
  });

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === 'open-conversation' && data.conversationId) {
        setPendingOpen({ id: data.conversationId, type: data.conversationType === 'group' ? 'group' : 'dm' });
      }
    };
    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, []);

  // Deferred until users/groups are actually loaded, so the name-resolution fallback
  // in the reducer has real data to resolve against instead of just echoing the raw id.
  const consumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingOpen) return;
    if (consumedRef.current === pendingOpen.id) return;
    if (!state.currentUser || (pendingOpen.type === 'dm' ? state.users.length === 0 : state.groups.length === 0)) return;
    consumedRef.current = pendingOpen.id;
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: { type: pendingOpen.type, id: pendingOpen.id, name: '', avatar: null } });
  }, [pendingOpen, state.currentUser, state.users.length, state.groups.length, dispatch]);

  return null;
}
