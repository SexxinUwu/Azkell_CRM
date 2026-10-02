const CACHE_NAME = 'azkell-fleet-v51';
const STATIC_CACHE = 'azkell-libs-v2';

// Archivos de la app
const APP_ASSETS = [
  '/',
  '/Index.html',
  '/estilos.css',
  '/logica.js',
  '/lazy-libs.js',
  '/utils.js'
];

// Librerías pesadas
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

// Instalar: cachear de forma segura sin romper la instalación si un archivo falla
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    Promise.allSettled([
      caches.open(CACHE_NAME).then(c => {
        return Promise.allSettled(APP_ASSETS.map(url => c.add(url).catch(() => {})));
      }),
      caches.open(STATIC_CACHE).then(c => {
        return Promise.allSettled(LIB_ASSETS.map(url => c.add(url).catch(() => {})));
      })
    ])
  );
});

// Activar: tomar control inmediato y limpiar versiones viejas
self.addEventListener('activate', event => {
  const keep = [CACHE_NAME, STATIC_CACHE];
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.map(n => keep.includes(n) ? undefined : caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Helper de timeout para evitar pantallas en blanco bloqueadas en red
function fetchWithTimeout(request, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('NetworkTimeout')), timeoutMs);
    fetch(request).then(response => {
      clearTimeout(timer);
      resolve(response);
    }).catch(err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Fetch: estrategia optimizada y blindada contra NetworkError
self.addEventListener('fetch', event => {
  // Solo interceptar peticiones GET del mismo origen
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // 1. API → siempre red directa (nunca cachear)
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

  // 2. Librerías estáticas (/libs/) → Cache First
  if (url.pathname.startsWith('/libs/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(STATIC_CACHE).then(c => c.put(event.request, clone)).catch(() => {});
          }
          return resp;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 3. Navegación principal (HTML) → Stale-While-Revalidate con timeout rápido (Cero pantallas en blanco)
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/Index.html') {
    event.respondWith(
      fetchWithTimeout(event.request, 2000)
        .then(resp => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone)).catch(() => {});
          }
          return resp;
        })
        .catch(() => {
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            return caches.match('/Index.html').then(idx => idx || caches.match('/'));
          });
        })
    );
    return;
  }

  // 4. Otros recursos de la App (CSS, JS, iconos, modulos HTML) → Network First con timeout
  event.respondWith(
    fetchWithTimeout(event.request, 3000)
      .then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone)).catch(() => {});
        }
        return resp;
      })
      .catch(() => {
        return caches.match(event.request).then(cached => {
          return cached || new Response('Offline', { status: 503, statusText: 'Sin conexión' });
        });
      })
  );
});
