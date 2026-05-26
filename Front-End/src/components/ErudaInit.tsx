'use client';

// ⚠️ TESTING ONLY — Remove this component and its usage in layout.tsx before final release.
// Purpose: mobile debugger for inspecting push subscription logs, SW errors, and network requests.

import { useEffect } from 'react';

function loadEruda() {
  if (typeof window === 'undefined') return;
  if ((window as any).__eruda_loaded__) return;
  (window as any).__eruda_loaded__ = true;

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/eruda';
  script.onload = () => {
    (window as any).eruda?.init();
    console.log('[Eruda] mobile debugger ready');
  };
  document.head.appendChild(script);
}

export function ErudaInit() {
  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      // Auto-load in development
      loadEruda();
      return;
    }

    // Production: load after 5 taps within 3 seconds on the top-left corner area
    let taps = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onTap = (e: TouchEvent) => {
      // Only count taps in the top-left 80x80px area (hidden trigger zone)
      const t = e.touches[0] || e.changedTouches[0];
      if (!t || t.clientX > 80 || t.clientY > 80) return;

      taps++;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { taps = 0; }, 3000);

      if (taps >= 5) {
        taps = 0;
        if (timer) clearTimeout(timer);
        loadEruda();
      }
    };

    document.addEventListener('touchstart', onTap, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTap);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
