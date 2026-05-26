'use client';

/*
 * ============================================================
 * TESTING ONLY — REMOVE BEFORE PRODUCTION
 * ============================================================
 * Eruda mobile debugger — lets you inspect console logs,
 * network requests, and JS errors directly on mobile.
 *
 * HOW TO ACTIVATE on any device:
 *   Option A — URL param (easiest):
 *     Open the app with ?debug=true in the URL, e.g.:
 *     https://yourapp.com/?debug=true
 *     This sets the localStorage flag automatically.
 *
 *   Option B — Browser console (one-time):
 *     localStorage.setItem('eruda', 'true')
 *     then reload the page.
 *
 * HOW TO DEACTIVATE:
 *   localStorage.removeItem('eruda')  then reload.
 *
 * TO REMOVE: delete this file and remove the import +
 *   <ErudaInit /> from layout.tsx.
 * ============================================================
 */

import { useEffect } from 'react';

export function ErudaInit() {
  useEffect(() => {
    // Inject Eruda from CDN — always active for testing
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/eruda';
    script.onload = () => {
      (window as any).eruda?.init();
    };
    document.head.appendChild(script);
  }, []);

  return null;
}
