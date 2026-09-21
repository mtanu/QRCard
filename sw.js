// Cache-first app shell. Bump CACHE_VERSION on every deploy that changes a shipped file,
// otherwise returning visitors keep the old one until they clear site data.
const CACHE_VERSION = 'qrcard-v4';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/vcard.js',
  './js/qr.js',
  './js/share.js',
  './js/theme.js',
  './js/views/display.js',
  './js/views/editor.js',
  './js/views/cards.js',
  './js/views/settings.js',
  './js/views/present.js',
  './vendor/qr-code-styling.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // addAll is all-or-nothing, so one missing file would leave the app with no cache
      // at all. Cache each file on its own and let a stray 404 pass.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      // Offline and not cached: for a navigation, fall back to the shell so the app
      // still opens instead of showing the browser's dinosaur.
      .catch(() => (request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
