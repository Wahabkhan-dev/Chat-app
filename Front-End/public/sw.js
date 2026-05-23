// Mawby Teams — Service Worker
// Strategy: network-first for navigation and API calls; cache-first for static assets.
const CACHE = 'mawby-teams-v1';

const PRECACHE = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Remove old caches on activate
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only intercept GET requests from the same origin (skip cross-origin API calls,
  // socket.io, etc. — let those go straight to the network).
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip non-http(s) schemes (chrome-extension://, etc.)
  if (!url.protocol.startsWith('http')) return;

  // Skip cross-origin requests (Socket.IO backend, R2, external fonts)
  if (url.origin !== self.location.origin) return;

  // Skip Next.js internal routes and API routes — always network
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Navigation (HTML page) — network first, fall back to cached '/'
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/').then((r) => r || Response.error()))
    );
    return;
  }

  // Static assets (images, fonts, manifests) — cache first, then network + update
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      });
      return cached || networkFetch;
    })
  );
});
