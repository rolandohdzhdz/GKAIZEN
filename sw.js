/* ═══════════════════════════════════════════════════════════
   Grafikaizen — Service Worker v1.0
   Estrategia: Cache-first para assets estáticos,
               Network-first para actualizaciones del HTML
═══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'grafikaizen-v1';
const ASSETS = [
  './grafikaizen.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // CDN assets (tabler icons)
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/fonts/tabler-icons.woff2',
];

// ── Install: pre-cachea todos los assets ─────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cachear assets locales siempre
      const local = ASSETS.filter(a => a.startsWith('./'));
      return cache.addAll(local).then(() => {
        // CDN con manejo de error (puede fallar offline en primera carga)
        const cdn = ASSETS.filter(a => !a.startsWith('./'));
        return Promise.allSettled(cdn.map(url =>
          fetch(url, { mode: 'cors' })
            .then(r => r.ok ? cache.put(url, r) : null)
            .catch(() => null)
        ));
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: limpia caches viejos ───────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: estrategia por tipo de recurso ────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Solo manejamos GET
  if (event.request.method !== 'GET') return;

  // HTML principal → Network-first (trae actualizaciones si hay red)
  if (url.pathname.endsWith('grafikaizen.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Todo lo demás → Cache-first (rápido y funciona offline)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

// ── Mensaje de versión (para debug desde la app) ─────────────
self.addEventListener('message', event => {
  if (event.data === 'GET_VERSION') {
    event.source.postMessage({ version: CACHE_NAME });
  }
  // Forzar actualización desde la UI
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
