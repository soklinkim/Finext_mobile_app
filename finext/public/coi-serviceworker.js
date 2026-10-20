// Web only: adds the cross-origin isolation headers to every response so expo-sqlite's
// WebAssembly worker can use SharedArrayBuffer. (Native builds ignore this file.)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.cache === 'only-if-cached' && e.request.mode !== 'same-origin') return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.status === 0) return r;
        const h = new Headers(r.headers);
        h.set('Cross-Origin-Embedder-Policy', 'credentialless');
        h.set('Cross-Origin-Opener-Policy', 'same-origin');
        return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
      })
      .catch((err) => console.error(err)),
  );
});
