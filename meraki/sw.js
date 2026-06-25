/* MerakiScope service worker — offline shell caching for installability.
 * Caches the app shell so the tool opens instantly and works offline in Demo
 * mode. Live API calls always go to the network (never cached). */
const CACHE = 'merakiscope-v1';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/mock.js',
  './js/api.js',
  './js/insights.js',
  './js/ui.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never intercept API/proxy traffic — always fresh from the network.
  if (url.hostname.includes('meraki.com') || url.search.includes('url=')) return;
  if (e.request.method !== 'GET') return;

  // Cache-first for the local app shell, network fallback.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res && res.status === 200 && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
