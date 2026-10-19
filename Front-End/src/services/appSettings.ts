"use client";

/**
 * Global (not per-user) app config fetched from the backend — currently just the
 * admin-configurable max upload size. Single source of truth so every place that validates
 * file size (MessageInput, ChatArea's drag-and-drop, …) agrees, instead of each hardcoding its
 * own number.
 */

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export const DEFAULT_MAX_UPLOAD_MB = 150;

let cached: number | null = null;
let inflight: Promise<number> | null = null;

async function fetchMaxUploadMb(): Promise<number> {
  if (cached !== null) return cached;
  if (inflight) return inflight;
  inflight = api.get<{ maxUploadMb: number }>('/settings/system')
    .then((data) => {
      cached = data.maxUploadMb;
      return cached;
    })
    .catch(() => DEFAULT_MAX_UPLOAD_MB) // not logged in yet / request failed — fall back quietly
    .finally(() => { inflight = null; });
  return inflight;
}

/** Called once an admin changes it, so every open tab's next read picks up the new value. */
export function invalidateMaxUploadMbCache() {
  cached = null;
}

/** Current max upload size in MB. Starts at the default and updates once the real value loads. */
export function useMaxUploadMb(): number {
  const [mb, setMb] = useState(cached ?? DEFAULT_MAX_UPLOAD_MB);

  useEffect(() => {
    let cancelled = false;
    fetchMaxUploadMb().then((value) => { if (!cancelled) setMb(value); });
    return () => { cancelled = true; };
  }, []);

  return mb;
}
