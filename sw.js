const CACHE_NAME = 'azkell-fleet-v47';
const STATIC_CACHE = 'azkell-libs-v1';

// Archivos de la app (cambian frecuentemente)
const APP_ASSETS = [
  '/',
  '/Index.html',
  '/estilos.css',
  '/logica.js',
  '/lazy-libs.js',
  '/utils.js'
];

// Librerías pesadas (NUNCA cambian → cachear permanentemente)
const LIB_ASSETS = [
  '/libs/bootstrap.min.css',
  '/libs/bootstrap-icons.css',
  '/libs/bootstrap.bundle.min.js',
  '/libs/xlsx.full.min.js',
  '/libs/html2pdf.bundle.min.js',
  '/libs/jspdf.umd.min.js',
  '/libs/jspdf.plugin.autotable.min.js',
  '/libs/qrcode.min.js',
  '/libs/html5-qrcode.min.js',
  '/libs/chart.min.js',
  '/libs/chartjs-plugin-datalabels.min.js',
  '/libs/leaflet.js',
  '/libs/leaflet.css'
];

// Instalar: cachear todo de una vez
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(c => c.addAll(APP_ASSETS)),
      caches.open(STATIC_CACHE).then(c => c.addAll(LIB_ASSETS))
    ])
  );
  self.skipWaiting();
});

// Activar: borrar cachés viejas
self.addEventListener('activate', event => {
  const keep = [CACHE_NAME, STATIC_CACHE];
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.map(n => keep.includes(n) ? undefined : caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: estrategia inteligente
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // API → siempre red
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexión a internet' }), {
          status: 503, headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Librerías → Cache First (instantáneo, nunca cambian)
  if (url.pathname.startsWith('/libs/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          if (resp.ok) {
            var clone = resp.clone();
            caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
          }
          return resp;
        });
      })
    );
    return;
  }

  // App files → Network First (con fallback a caché offline)
  event.respondWith(
    fetch(event.request).then(resp => {
      if (resp.ok) {
        var clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      }
      return resp;
    }).catch(() =>
      caches.match(event.request).then(cached =>
        cached || new Response('Offline', { status: 503, statusText: 'Sin conexión' })
      )
    )
  );
});
