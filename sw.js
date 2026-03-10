const CACHE_NAME = 'azkell-crm-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/Index.html',
  '/estilos.css',
  '/logica.js'
];

// Instalar el Service Worker y guardar los archivos principales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
});

// Interceptar peticiones para que cargue rápido
self.addEventListener('fetch', event => {
  // Las llamadas a la base de datos (/api/) SIEMPRE deben ir a internet fresco
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(err => console.log('Sin internet para datos de BD', err))
    );
    return;
  }

  // Para el diseño (CSS, JS, HTML), busca primero en internet, si falla usa el caché guardado
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
