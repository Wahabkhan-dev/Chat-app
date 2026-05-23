'use client';

import { useEffect } from 'react';

export function PwaInit() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.warn('[PWA] Service worker registration failed:', err);
        });
      });
    }
  }, []);

  return null;
}
