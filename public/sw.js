// Keeps the tool working if the signal drops after it has been opened once.
const CACHE = 'will-it-fit-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Built assets have unique names, so a cached copy is always the right one.
      if (/\/assets\//.test(req.url)) {
        const hit = await cache.match(req, { ignoreVary: true });
        if (hit) return hit;
      }
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
        if (hit) return hit;
        throw err;
      }
    })(),
  );
});
