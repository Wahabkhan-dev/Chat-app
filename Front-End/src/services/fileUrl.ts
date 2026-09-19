/**
 * Signed URL cache — module-level so it persists across React re-renders.
 * Each entry is evicted 30 seconds before expiry to guarantee the URL is
 * still valid when the browser actually fetches the file.
 */

const _rawFileApiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const BASE_URL = _rawFileApiUrl.startsWith('http')
  ? _rawFileApiUrl
  : 'https://chat-app-dzn1.onrender.com/api';
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
 * Returns a backend-proxied URL for a file key.
 * Use this for operations that need the raw file bytes (e.g. copying to clipboard)
 * because the direct R2 signed URL is cross-origin and will fail CORS checks.
 * The /serve endpoint proxies through our Express server which has the correct
 * CORS + auth headers.
 */
export function getServeUrl(key: string): string {
  const token = typeof window !== 'undefined' ? localStorage.getItem('teams_token') : null;
  return `${BASE_URL}/files/serve?key=${encodeURIComponent(key)}${token ? `&t=${encodeURIComponent(token)}` : ''}`;
}

// PNG versions of images, cached so repeat copies are instant. Keyed by fetch URL.
const PNG_CACHE_LIMIT = 30;
const pngCache = new Map<string, Promise<Blob>>();

/** Decode any browser-supported image blob and re-encode it as PNG (the only image type clipboards accept). */
function convertToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      URL.revokeObjectURL(objectUrl);
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob);
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image decode failed'));
    };
    img.src = objectUrl;
  });
}

function getPngBlob(fetchUrl: string): Promise<Blob> {
  const hit = pngCache.get(fetchUrl);
  if (hit) return hit;

  const promise = (async () => {
    const res = await fetch(fetchUrl, { mode: 'cors', credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return blob.type === 'image/png' ? blob : convertToPng(blob);
  })();
  promise.catch(() => pngCache.delete(fetchUrl));

  pngCache.set(fetchUrl, promise);
  if (pngCache.size > PNG_CACHE_LIMIT) {
    pngCache.delete(pngCache.keys().next().value!);
  }
  return promise;
}

/**
 * Start fetching/converting an image in the background (e.g. when its context
 * menu opens or it is shown in the preview) so a following copy is instant.
 */
export function prepareImageCopy(fetchUrl: string): void {
  if (!fetchUrl) return;
  getPngBlob(fetchUrl).catch(() => {});
}

/**
 * Copy an image to the clipboard. Call it directly from the click/key handler:
 * the clipboard write is started immediately (with the PNG still loading), so the
 * browser keeps the user gesture — this is what makes it work in Safari and keeps
 * Chrome from rejecting slow copies.
 */
export async function copyImageToClipboard(fetchUrl: string): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Copying images is not supported in this browser');
  }
  const pngPromise = getPngBlob(fetchUrl);
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngPromise })]);
  } catch (err) {
    // Older browsers don't accept a promise inside ClipboardItem — retry with the finished blob.
    if (err instanceof TypeError) {
      const png = await pngPromise;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      return;
    }
    throw err;
  }
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
