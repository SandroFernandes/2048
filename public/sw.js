/*
 * Tessera service worker.
 *
 * Precaches every local asset so the game works fully offline after the first
 * load. The phone opens that saved copy immediately, so the Mac and Docker can
 * be off. A short background check refreshes the copy only when NetBird
 * actually answers. Bump VERSION whenever a cached file changes; old caches
 * are deleted on activation. Saved games live in localStorage, which is never
 * touched here.
 */
const VERSION = '1.0.5';
const CACHE_PREFIX = 'tessera-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const REFRESH_MS = 2500;

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

  event.respondWith(fromCache(request));
  event.waitUntil(refreshIfCached(request));
});

async function fromCache(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    await remember(cache, request, response);
    return response;
  } catch {
    if (request.mode !== 'navigate') return Response.error();
    const shell = await cache.match('./index.html');
    if (shell) return shell;
    return Response.redirect(new URL('offline.html', self.registration.scope).href, 302);
  }
}

async function refreshIfCached(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) await refresh(cache, request);
}

/** Asks the Mac for a newer copy, but gives up quickly when it is off. */
function refresh(cache, request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_MS);
  return fetch(request, { cache: 'no-store', signal: controller.signal })
    .then((response) => remember(cache, request, response))
    .catch(() => {})
    .finally(() => clearTimeout(timer));
}

/**
 * Stores a response only when it is the real app. A NetBird login page is a
 * successful HTML response too, and must not replace the cached game.
 */
async function remember(cache, request, response) {
  if (!response || !response.ok || response.type !== 'basic' || response.redirected) return;
  const type = (response.headers.get('content-type') || '').toLowerCase();
  const path = new URL(request.url).pathname;
  if (path.endsWith('.js') && !type.includes('javascript')) return;
  if (path.endsWith('.css') && !type.includes('css')) return;
  if ((path.endsWith('.png') || path.endsWith('.svg')) && !type.includes('image/')) return;
  if (path.endsWith('.webmanifest') && !type.includes('json') && !type.includes('manifest')) return;
  if (request.mode === 'navigate' || path.endsWith('.html') || path.endsWith('/')) {
    if (!type.includes('text/html')) return;
    const text = await response.clone().text();
    if (!text.includes('id="board"') && !text.includes('offline-page')) return;
  }
  try {
    await cache.put(request, response.clone());
  } catch {
    /* A redirected or opaque response cannot be stored. */
  }
}
