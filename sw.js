const CACHE = 'strammerulle-studio-webxr-v8';
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok && new URL(event.request.url).pathname.startsWith(new URL('./', self.location).pathname)) await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      let saved = await cache.match(event.request);
      if (!saved && ['/app.js', '/interactionMath.js', '/guidedTour.js'].some(name => new URL(event.request.url).pathname.endsWith(name))) saved = await cache.match(event.request, { ignoreSearch: true });
      if (saved) return saved;
      if (event.request.mode === 'navigate') { const index = await cache.match(new URL('./index.html', self.location)); if (index) return index; }
      throw error;
    }
  })());
});
self.addEventListener('message', event => {
  if (event.data.type !== 'CACHE_ALL') return;
  event.waitUntil((async () => {
    try {
      const response = await fetch(new URL('./offline-files.json', self.location), { cache: 'no-store' });
      if (!response.ok) throw new Error('Offline file list unavailable');
      const files = await response.json(), cache = await caches.open(CACHE);
      for (let index = 0; index < files.length; index++) {
        await cache.add(new URL(files[index], self.location));
        event.source?.postMessage({ type: 'CACHE_PROGRESS', done: index + 1, total: files.length });
      }
      event.source?.postMessage({ type: 'CACHE_READY' });
    } catch (error) { event.source?.postMessage({ type: 'CACHE_ERROR', message: error.message }); }
  })());
});
