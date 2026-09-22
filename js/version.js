// The app version: shown in Settings → About, and used by sw.js to name its cache
// (qrcard-v<N>). Bump it on every deploy that changes a shipped file.
//
// A plain script rather than an ES module so the service worker can load it with
// importScripts(); the page imports it for the side effect and reads self.APP_VERSION.
self.APP_VERSION = 6;
