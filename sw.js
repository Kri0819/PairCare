/* PairCare｜陪一刻 — Service Worker v11.16 */
var CACHE  = 'PairCare-v11.16';
var ASSETS = ['/', '/index.html', '/manifest.json',
              '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;
  e.respondWith(fetch(e.request).then(function(res){
    if (res && res.status === 200) {
      var clone = res.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
    }
    return res;
  }).catch(function(){
    return caches.match(e.request).then(function(c){ return c || caches.match('/index.html'); });
  }));
});
