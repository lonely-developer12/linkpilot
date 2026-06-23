/**
 * LinkPilot – Service Worker
 * ============================================================
 * Enables offline capability and makes the application fully
 * installable as a Progressive Web App (PWA).
 *
 * Cache strategy: Cache-First
 * Revalidates assets when cache version changes.
 */

const CACHE_NAME = 'linkpilot-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/services/shortener.js',
  '/services/history.js',
  '/services/clipboard.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install Event – Cache all local static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event – Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event – Serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Only handle local requests, ignore API calls (TinyURL, is.gd)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
