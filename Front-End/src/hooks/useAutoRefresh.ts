"use client";

import { useEffect, useState } from 'react';
import { hasActiveDownloads } from '@/services/downloadManager';

export const AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const TYPING_RETRY_MS = 60 * 1000;

// Set once per page load; a reload resets it, which starts the next refresh cycle.
let refreshAt = Date.now() + AUTO_REFRESH_INTERVAL_MS;

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

/** Mount once (while logged in) to reload the app every AUTO_REFRESH_INTERVAL_MS. */
export function useAutoRefreshScheduler() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (isUserTyping() || hasActiveDownloads()) {
          refreshAt = Date.now() + TYPING_RETRY_MS;
          schedule();
          return;
        }
        window.location.reload();
      }, Math.max(0, refreshAt - Date.now()));
    };
    schedule();
    return () => clearTimeout(timer);
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
