"use client";

import { useEffect, useState } from 'react';
import { hasActiveDownloads } from '@/services/downloadManager';

export const AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const RETRY_MS = 30 * 1000; // how often to recheck while busy
// Someone actively moving the mouse, typing, or scrolling in the last 2 minutes counts as "working"
const ACTIVE_IDLE_MS = 2 * 60 * 1000;
// Safety net: even if the user never goes idle, don't postpone forever — refresh anyway after
// this much extra time. Keeps the auto-refresh from silently getting "stuck" and never firing.
const MAX_EXTENSION_MS = 20 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

// Set once per page load; a reload resets it, which starts the next refresh cycle.
let refreshAt = Date.now() + AUTO_REFRESH_INTERVAL_MS;
let lastActivityAt = Date.now();

export function getRefreshAt(): number {
  return refreshAt;
}

/** True when the user is in the middle of typing, so a reload would lose their draft. */
function isUserTyping(): boolean {
  const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value.trim().length > 0;
  return el.isContentEditable && (el.textContent || '').trim().length > 0;
}

/** True while the user is actively using the page — refreshing mid-action would be jarring. */
function isUserWorking(): boolean {
  return isUserTyping() || hasActiveDownloads() || Date.now() - lastActivityAt < ACTIVE_IDLE_MS;
}

/** Mount once (while logged in) to reload the app every AUTO_REFRESH_INTERVAL_MS. */
export function useAutoRefreshScheduler() {
  useEffect(() => {
    // Recorded at most once every ~1s (via rAF-style throttling below) — cheap even on mousemove.
    let throttled = false;
    const onActivity = () => {
      lastActivityAt = Date.now();
      if (throttled) return;
      throttled = true;
      setTimeout(() => { throttled = false; }, 1000);
    };
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, onActivity, { passive: true }));

    let timer: ReturnType<typeof setTimeout>;
    // First moment we found the user busy — bounds how long we keep postponing (MAX_EXTENSION_MS).
    let deferredSince: number | null = null;

    const schedule = () => {
      timer = setTimeout(() => {
        const pastHardCap = deferredSince !== null && Date.now() - deferredSince > MAX_EXTENSION_MS;
        if (isUserWorking() && !pastHardCap) {
          deferredSince ??= Date.now();
          refreshAt = Date.now() + RETRY_MS;
          schedule();
          return;
        }
        window.location.reload();
      }, Math.max(0, refreshAt - Date.now()));
    };
    schedule();

    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, onActivity));
    };
  }, []);
}

/** Milliseconds left until the next automatic refresh, updated every second. */
export function useAutoRefreshCountdown(): number {
  const [remaining, setRemaining] = useState(() => Math.max(0, refreshAt - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setRemaining(Math.max(0, refreshAt - Date.now())), 1000);
    return () => clearInterval(id);
  }, []);
  return remaining;
}
