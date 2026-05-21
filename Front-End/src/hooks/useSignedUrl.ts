'use client';

import { useState, useEffect } from 'react';
import { getSignedUrl } from '@/services/fileUrl';

interface SignedUrlState {
  url: string | null;
  loading: boolean;
  error: boolean;
}

/**
 * Resolves a private R2 file key to a short-lived signed URL.
 * Returns null while loading. Automatically refreshes before the URL expires.
 */
export function useSignedUrl(key: string | undefined): SignedUrlState {
  const [state, setState] = useState<SignedUrlState>({ url: null, loading: !!key, error: false });

  useEffect(() => {
    if (!key) {
      setState({ url: null, loading: false, error: false });
      return;
    }

    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function resolve() {
      setState(prev => ({ ...prev, loading: true, error: false }));
      try {
        const url = await getSignedUrl(key!);
        if (cancelled) return;
        setState({ url, loading: false, error: false });

        // Schedule a refresh 30 s before the URL expires (default 5 min - 30 s = 270 s)
        refreshTimer = setTimeout(() => {
          if (!cancelled) resolve();
        }, (300 - 30) * 1000);
      } catch {
        if (!cancelled) setState({ url: null, loading: false, error: true });
      }
    }

    resolve();
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [key]);

  return state;
}
