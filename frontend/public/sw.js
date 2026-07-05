/**
 * Aethera Service Worker
 * Handles caching for PWA offline support, push notifications,
 * background sync placeholder, and update messaging.
 */

const SW_VERSION = 'v5';
const CACHE_NAME = `aethera-${SW_VERSION}`;
const STATIC_CACHE = `aethera-static-${SW_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Assets to cache on install (app shell)
const PRECACHE_URLS = [
  '/',
  '/dashboard',
  '/login',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Cache satu per satu agar satu URL gagal tidak invalidate semua.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache
            .add(new Request(url, { cache: 'reload' }))
            .catch((err) => console.warn('[SW] precache miss', url, err))
        )
      );
    })()
  );
  self.skipWaiting();
});

// Activate: clean old caches + claim
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n !== CACHE_NAME && n !== STATIC_CACHE)
          .map((n) => caches.delete(n))
      );
      // Enable navigation preload kalau didukung — speed up fetch
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (_) {}
      }
      await self.clients.claim();
    })()
  );
});

// Allow page to ask SW to skip waiting (for in-app update prompt)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Background Sync ────────────────────────────────────────────────────────
// Saat user offline kirim request (chat / mood check-in / dst), client
// tinggal panggil: registration.sync.register('aethera-replay-queue').
// Saat online lagi, browser otomatis fire 'sync' event di bawah ini.
self.addEventListener('sync', (event) => {
  if (event.tag === 'aethera-replay-queue') {
    event.waitUntil(replayQueuedRequests());
  }
});

async function replayQueuedRequests() {
  // Placeholder: di v1 kita hanya kirim ping ke client supaya halaman aktif
  // bisa flush queue-nya sendiri (chat queue, mood queue, dll).
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: 'replay-queue' }));
}

// ─── Periodic Background Sync ───────────────────────────────────────────────
// Browser akan fire 'periodicsync' tiap interval yang di-set client.
// Kita pakai untuk pre-fetch notifikasi terbaru di latar belakang
// supaya saat user buka app, list notif sudah fresh.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'aethera-refresh-notifications') {
    event.waitUntil(refreshNotificationsCache());
  }
});

async function refreshNotificationsCache() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const url = '/v1/notifications/unread-count';
    // Tidak push notifikasi langsung — cuma siapin cache + ping client.
    const res = await fetch(url, { credentials: 'include' });
    if (res && res.ok) await cache.put(url, res.clone());
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: 'periodic-refresh' }));
  } catch (_) {}
}

// Fetch: network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API requests — always go to network
  if (url.pathname.startsWith('/v1/') || url.port === '8001') return;

  // Skip chrome-extension and other non-http
  if (!url.protocol.startsWith('http')) return;

  // For navigation requests (HTML pages): network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Use preload kalau ada
          const preload = await event.preloadResponse;
          if (preload) return preload;
          const network = await fetch(request);
          if (network && network.ok) {
            const clone = network.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, clone).catch(() => {});
          }
          return network;
        } catch (_) {
          const cached = await caches.match(request);
          if (cached) return cached;
          const home = await caches.match('/');
          if (home) return home;
          return (
            (await caches.match(OFFLINE_URL)) ||
            new Response('Anda sedang offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
      })()
    );
    return;
  }

  // For static assets (_next/static): cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // For images and icons: cache-first
  if (
    request.destination === 'image' ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/snapshots/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 404 }));
      })
    );
    return;
  }
});

// Handle push notifications
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (_) {
      data = { title: 'Aethera', body: event.data.text() };
    }
  }
  const title = data.title || 'Aethera';

  // Tag unique per notif → tiap notif baru muncul sendiri-sendiri.
  // Kalau pakai tag generic (e.g. "default"), notif kedua akan replace yg pertama
  // dan user kira tidak ada notif baru.
  const tag = (data.category || 'aethera') + '-' + (data.ts || Date.now());

  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag,
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200],
    requireInteraction: false,
    timestamp: Date.now(),
    data: { url: data.url || '/notifications', category: data.category || 'system' },
  };

  // Best-effort: kirim ping ke client supaya bell badge auto-refresh meski
  // halaman terbuka.
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ includeUncontrolled: true }).then((cs) =>
        cs.forEach((c) => c.postMessage({ type: 'push-received', payload: data }))
      ),
    ])
  );
});

// Handle notification click — fokus tab yang sudah ada atau buka baru
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const win of windows) {
        if ('focus' in win) {
          win.navigate(targetUrl).catch(() => {});
          return win.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
