'use client';

import { useEffect } from 'react';

export function PwaInit() {
  useEffect(() => {
    // Respect device auto-rotate setting — lock to 'natural' so the browser
    // does not force its own rotation independent of the OS preference.
    // Falls back silently on browsers that do not support the API or that
    // require fullscreen before allowing an orientation lock (e.g. desktop).
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      screen.orientation.lock('natural').catch(() => {});
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

  return null;
}
