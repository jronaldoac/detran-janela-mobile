const CACHE = 'detran-janela-v0.4.0';
const FILES = [
  './', './index.html', './vazao.html', './manifest.webmanifest',
  './assets/app.css?v=0.4.0', './assets/app.js?v=0.4.0', './assets/vazao.js?v=0.4.0',
  './assets/icon-192.png', './assets/icon-512.png',
  './data/edital.js?v=0.4.0', './data/qc-catalog.js?v=0.4.0'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
