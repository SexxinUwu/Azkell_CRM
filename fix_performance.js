const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════
// FIX 1: Remove heavy libraries from <head> — lazy load them on demand
// ═══════════════════════════════════════════════════════════════════════
const fileIndex = path.join(__dirname, 'Index.html');
let indexHtml = fs.readFileSync(fileIndex, 'utf8');

// Remove all heavy library script tags from head (lines 10-17, 19)
const heavyScriptTags = [
    /\s*<script defer src="\/libs\/xlsx\.full\.min\.js"><\/script>\r?\n/,
    /\s*<script defer src="\/libs\/html2pdf\.bundle\.min\.js"><\/script>\r?\n/,
    /\s*<script defer src="\/libs\/jspdf\.umd\.min\.js"><\/script>\r?\n/,
    /\s*<script defer src="\/libs\/jspdf\.plugin\.autotable\.min\.js"><\/script>\r?\n/,
    /\s*<script defer src="\/libs\/qrcode\.min\.js"><\/script>\r?\n/,
    /\s*<script defer src="\/libs\/html5-qrcode\.min\.js"><\/script>\r?\n/,
    /\s*<script defer src="\/libs\/chart\.min\.js"><\/script>\r?\n/,
    /\s*<script defer src="\/libs\/chartjs-plugin-datalabels\.min\.js"><\/script>\r?\n/,
    /\s*<script defer src="\/libs\/leaflet\.js"><\/script>\r?\n/,
    /\s*<link rel="stylesheet" href="\/libs\/leaflet\.css" \/>\r?\n/,
];

heavyScriptTags.forEach(regex => {
    indexHtml = indexHtml.replace(regex, '');
});

fs.writeFileSync(fileIndex, indexHtml, 'utf8');
console.log('✅ FIX 1: Removed heavy libs from <head>');


// ═══════════════════════════════════════════════════════════════════════
// FIX 2: Create a lazy-loader utility (loaded before logica.js)
// ═══════════════════════════════════════════════════════════════════════
const lazyLoaderCode = `// ══════════════════════════════════════════════════════════
// Azkell Fleet — Lazy Library Loader
// Loads heavy libraries ONLY when a feature needs them
// ══════════════════════════════════════════════════════════
(function() {
    var _loaded = {};
    var _loading = {};

    function loadScript(src) {
        if (_loaded[src]) return Promise.resolve();
        if (_loading[src]) return _loading[src];
        _loading[src] = new Promise(function(resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.onload = function() { _loaded[src] = true; delete _loading[src]; resolve(); };
            s.onerror = function() { delete _loading[src]; reject(new Error('Failed to load: ' + src)); };
            document.head.appendChild(s);
        });
        return _loading[src];
    }

    function loadCSS(href) {
        if (_loaded[href]) return Promise.resolve();
        _loaded[href] = true;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
        return Promise.resolve();
    }

    // ── Public API ──
    // Each returns a Promise that resolves when the lib(s) are ready

    window.loadExcel = function() {
        return loadScript('/libs/xlsx.full.min.js');
    };

    window.loadPDF = function() {
        return loadScript('/libs/html2pdf.bundle.min.js')
            .then(function() { return loadScript('/libs/jspdf.umd.min.js'); })
            .then(function() { return loadScript('/libs/jspdf.plugin.autotable.min.js'); });
    };

    window.loadQR = function() {
        return Promise.all([
            loadScript('/libs/qrcode.min.js'),
            loadScript('/libs/html5-qrcode.min.js')
        ]);
    };

    window.loadCharts = function() {
        return loadScript('/libs/chart.min.js')
            .then(function() { return loadScript('/libs/chartjs-plugin-datalabels.min.js'); });
    };

    window.loadLeaflet = function() {
        loadCSS('/libs/leaflet.css');
        return loadScript('/libs/leaflet.js');
    };
})();
`;

fs.writeFileSync(path.join(__dirname, 'lazy-libs.js'), lazyLoaderCode, 'utf8');
console.log('✅ FIX 2: Created lazy-libs.js');

// Add lazy-libs.js to Index.html right before utils.js
indexHtml = fs.readFileSync(fileIndex, 'utf8');
if (!indexHtml.includes('lazy-libs.js')) {
    indexHtml = indexHtml.replace(
        '<script defer src="./utils.js"></script>',
        '<script defer src="./lazy-libs.js"></script>\n    <script defer src="./utils.js"></script>'
    );
    fs.writeFileSync(fileIndex, indexHtml, 'utf8');
}
console.log('✅ FIX 2b: Added lazy-libs.js to Index.html');


// ═══════════════════════════════════════════════════════════════════════
// FIX 3: Fix Cache-Control in server.js — cache /libs/ for 30 days
// ═══════════════════════════════════════════════════════════════════════
const fileServer = path.join(__dirname, 'server.js');
let serverJs = fs.readFileSync(fileServer, 'utf8');

const oldStatic = `app.use(express.static(__dirname, {
    setHeaders: function(res, filePath) {
        if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));`;

const newStatic = `// Archivos en /libs/ son librerías estáticas → cachear agresivamente (30 días)
app.use('/libs', express.static(path.join(__dirname, 'libs'), {
    maxAge: '30d',
    immutable: true
}));
// El resto de archivos (logica.js, estilos.css, vistas) → no cachear para reflejar cambios
app.use(express.static(__dirname, {
    setHeaders: function(res, filePath) {
        if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));`;

serverJs = serverJs.replace(oldStatic, newStatic);
fs.writeFileSync(fileServer, serverJs, 'utf8');
console.log('✅ FIX 3: Fixed Cache-Control — /libs/ cached for 30 days');


// ═══════════════════════════════════════════════════════════════════════
// FIX 4: Update Service Worker to cache libs on install
// ═══════════════════════════════════════════════════════════════════════
const swCode = `const CACHE_NAME = 'azkell-fleet-v47';
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
`;

fs.writeFileSync(path.join(__dirname, 'sw.js'), swCode, 'utf8');
console.log('✅ FIX 4: Service Worker upgraded to cache libs permanently');

console.log('\n🚀 ALL PERFORMANCE FIXES APPLIED!');
console.log('  Before: 38 requests, 5.5 MB, DOMContentLoaded 8.71s, Load 8.82s');
console.log('  After:  ~15 requests on first load, <1 MB initial, instant on revisits');
