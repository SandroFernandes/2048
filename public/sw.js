/*
 * Tessera service worker.
 *
 * Precaches every local asset so the game works fully offline after the first
 * load. Bump VERSION whenever a cached file changes; the new worker installs
 * alongside the old one and old caches are deleted on activation. Saved games
 * live in localStorage, which is never touched here.
 */
const VERSION = '1.0.4';
const CACHE_PREFIX = 'tessera-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/feedback.js',
  './js/game.js',
  './js/input.js',
  './js/pwa.js',
  './js/render.js',
  './js/storage.js',
  './icons/icon.svg',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
  // Activate immediately so nobody gets stuck on an old version. Safe because
  // saved games live in localStorage and every move is saved as it happens.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network first so a running copy never gets stuck on stale code while online;
  // the cache (kept fresh with every successful response) serves offline play.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        const scope = new URL(self.registration.scope);
        if (url.pathname === scope.pathname) {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        // Redirect (rather than serve in place) so the fallback's relative asset URLs resolve.
        return Response.redirect(new URL('offline.html', scope).href, 302);
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      throw error;
    }
  })());
});
