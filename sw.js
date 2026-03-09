// Este es el "motor en segundo plano" de la App
self.addEventListener('install', (e) => {
    console.log('[Azkell App] Instalada correctamente');
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    console.log('[Azkell App] Activada y lista');
});

self.addEventListener('fetch', (e) => {
    // Por ahora dejamos que siempre consulte a internet (para que reciba tus actualizaciones)
    e.respondWith(fetch(e.request).catch(() => console.log('Sin internet')));
});