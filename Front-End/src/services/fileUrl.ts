/**
 * Signed URL cache — module-level so it persists across React re-renders.
 * Each entry is evicted 30 seconds before expiry to guarantee the URL is
 * still valid when the browser actually fetches the file.
 */

const BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || `${window.location.origin}/api`)
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');
const EVICT_BUFFER_MS = 30_000; // evict 30 s before expiry

interface CacheEntry {
  url: string;
  expiresAt: number; // epoch ms
}

const cache = new Map<string, CacheEntry>();

// In-flight request deduplication — prevents multiple components
// requesting a signed URL for the same key at the same time
const inflight = new Map<string, Promise<string>>();

export async function getSignedUrl(key: string): Promise<string> {
  const now = Date.now();

  // Return cached URL if it has more than 30 s left
  const hit = cache.get(key);
  if (hit && hit.expiresAt - now > EVICT_BUFFER_MS) {
    return hit.url;
  }

  // Deduplicate concurrent requests for the same key
  const existing = inflight.get(key);
  if (existing) return existing;

  const request = fetchSignedUrl(key).then((entry) => {
    cache.set(key, entry);
    inflight.delete(key);
    return entry.url;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, request);
  return request;
}

async function fetchSignedUrl(key: string): Promise<CacheEntry> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('teams_token') : null;
  const res = await fetch(`${BASE_URL}/files/url?key=${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Could not get file URL');
  const data = await res.json();
  return { url: data.url, expiresAt: data.expiresAt };
}

export function clearSignedUrlCache() {
  cache.clear();
}

/**
 * Download a private R2 file without blocking the browser — resolves the signed
 * URL, fetches the content as a Blob, then triggers a save-as dialog.
 */
export async function downloadFile(key: string, filename: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('teams_token') : null;
  const url = `${BASE_URL}/files/download?key=${encodeURIComponent(key)}&filename=${encodeURIComponent(filename)}`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}
