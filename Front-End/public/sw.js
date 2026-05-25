// Mawby Teams — Service Worker
// Strategy: network-first for navigation and API calls; cache-first for static assets.
const CACHE = 'mawby-teams-v2';

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

// ── Push notification received ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { return; }

  const title = data.title || 'Mawby Teams';
  const options = {
    body: data.body || '',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: data.conversationId || 'mawby-teams-msg',
    renotify: true,
    data: {
      url: data.url || '/',
      conversationId: data.conversationId,
      conversationType: data.conversationType,
    },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click — open or focus the app ────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If the app is already open in a tab, focus it
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new tab
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
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
