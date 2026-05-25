/* PairCare｜陪一刻 — Service Worker v7 */
var CACHE  = 'PairCare-v7';
var ASSETS = [
  '/',
  '/index.html',
  '/app-v6.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', function(e) {
  console.log('[SW PairCare-v7] installing');
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c) { return c.addAll(ASSETS); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  console.log('[SW PairCare-v7] activating — clearing old caches');
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE; })
          .map(function(k) {
            console.log('[SW] deleting cache:', k);
            return caches.delete(k);
          })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING received');
    self.skipWaiting();
  }
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;

  // Network-first: always try network, fall back to cache
  e.respondWith(
    fetch(e.request)
      .then(function(res) {
        if (res && res.status === 200) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return res;
      })
      .catch(function() {
        return caches.match(e.request).then(function(cached) {
          return cached || caches.match('/index.html');
        });
      })
  );
});
