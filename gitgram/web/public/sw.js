// Gitgram Service Worker v2
// Cache strategies:
//   - Cache-first:           static assets (JS, CSS, fonts, images)
//   - Network-first:         HTML navigation requests
//   - Stale-while-revalidate: API responses (5-min TTL)
//   - Offline fallback:       /offline.html when network and cache both fail

const CACHE_VERSION = 'v2';
const STATIC_CACHE  = `gitgram-static-${CACHE_VERSION}`;
const API_CACHE     = `gitgram-api-${CACHE_VERSION}`;
const HTML_CACHE    = `gitgram-html-${CACHE_VERSION}`;

const ALL_CACHES = [STATIC_CACHE, API_CACHE, HTML_CACHE];

const STATIC_EXTENSIONS = ['.js', '.css', '.woff2', '.woff', '.ttf', '.otf', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.avif'];

const APP_SHELL_URLS = [
  '/feed',
  '/explore',
  '/offline.html',
];

// IndexedDB helpers for background-sync retry queue
const DB_NAME    = 'gitgram-sync';
const DB_VERSION = 1;
const STORE_NAME = 'pending-requests';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess  = (e) => resolve(e.target.result);
    req.onerror    = (e) => reject(e.target.error);
  });
}

async function enqueueRequest(request) {
  const db   = await openDB();
  const body = await request.clone().text().catch(() => null);
  const entry = {
    url:     request.url,
    method:  request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
    timestamp: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function drainQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const all   = store.getAll();
    all.onsuccess = async () => {
      const entries = all.result;
      for (const entry of entries) {
        try {
          await fetch(entry.url, {
            method:  entry.method,
            headers: entry.headers,
            body:    entry.body || undefined,
          });
          store.delete(entry.id);
        } catch {
          // leave in queue; will retry on next sync
        }
      }
      resolve();
    };
    all.onerror = () => reject(all.error);
  });
}

// --- Helpers -----------------------------------------------------------------

function isStaticAsset(url) {
  return STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

function isFresh(response) {
  if (!response) return false;
  const fetched = response.headers.get('sw-fetched-at');
  if (!fetched) return false;
  const age = Date.now() - Number(fetched);
  return age < 5 * 60 * 1000; // 5-minute TTL
}

function stampResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('sw-fetched-at', String(Date.now()));
  return new Response(response.body, {
    status:     response.status,
    statusText: response.statusText,
    headers,
  });
}

// --- Install -----------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// --- Activate ----------------------------------------------------------------

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !ALL_CACHES.includes(name))
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// --- Fetch -------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip cross-origin and Next.js internals
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_next/')) return;

  // Non-GET: intercept POST for background-sync, pass others through
  if (event.request.method !== 'GET') {
    if (event.request.method === 'POST') {
      event.respondWith(
        fetch(event.request.clone()).catch(async () => {
          await enqueueRequest(event.request.clone());
          return new Response(JSON.stringify({ queued: true }), {
            status:  202,
            headers: { 'Content-Type': 'application/json' },
          });
        })
      );
    }
    return;
  }

  // Strategy 1 — Cache-first for static assets
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(STATIC_CACHE, event.request));
    return;
  }

  // Strategy 2 — Stale-while-revalidate with TTL for API responses
  if (isApiRequest(url)) {
    event.respondWith(staleWhileRevalidate(API_CACHE, event.request));
    return;
  }

  // Strategy 3 — Network-first for HTML navigation (with offline fallback)
  if (isNavigationRequest(event.request)) {
    event.respondWith(networkFirstWithOfflineFallback(HTML_CACHE, event.request));
    return;
  }

  // Default — network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// --- Cache strategies --------------------------------------------------------

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(cacheName, request) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchAndCache = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, stampResponse(response.clone()));
      }
      return response;
    })
    .catch(() => null);

  if (cached && isFresh(cached)) {
    // Revalidate in background, return stale immediately
    fetchAndCache; // fire-and-forget
    return cached;
  }

  // Not fresh or no cache — wait for network
  const fresh = await fetchAndCache;
  return fresh || cached || new Response('Offline', { status: 503 });
}

async function networkFirstWithOfflineFallback(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Serve the offline page
    const offline = await caches.match('/offline.html');
    return offline || new Response('<h1>You are offline</h1>', {
      status:  503,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

// --- Push notifications ------------------------------------------------------

self.addEventListener('push', (event) => {
  let data = { title: 'Gitgram', body: 'You have a new notification', url: '/notifications' };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body:    data.body,
    icon:    '/icons/icon-192x192.png',
    badge:   '/icons/badge-72x72.png',
    tag:     data.tag || 'gitgram-notification',
    data:    { url: data.url || '/notifications' },
    actions: [
      { action: 'view',    title: 'View' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// --- Notification click ------------------------------------------------------

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// --- Background sync ---------------------------------------------------------

self.addEventListener('sync', (event) => {
  if (event.tag === 'gitgram-post-queue') {
    event.waitUntil(drainQueue());
  }
});

// --- Periodic background sync ------------------------------------------------

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'gitgram-feed-refresh') {
    event.waitUntil(
      caches.open(HTML_CACHE).then((cache) => {
        return fetch('/feed').then((response) => {
          if (response.ok) cache.put('/feed', response);
        }).catch(() => {});
      })
    );
  }
});
