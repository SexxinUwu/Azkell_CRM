// ══════════════════════════════════════════════════════════
// Azkell Fleet — Lazy Library Loader
// Phase 1: Page loads instantly (NO heavy libs)
// Phase 2: After 2s idle, pre-loads libs in background
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
            .then(function() { return loadScript('/libs/chartjs-plugin-datalabels.min.js'); })
            .then(function() { if(typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels); });
    };

    window.loadLeaflet = function() {
        loadCSS('/libs/leaflet.css');
        return loadScript('/libs/leaflet.js');
    };

    // ── Phase 2: Background Pre-load ──
    // After 2 seconds of idle time, silently download ALL libs
    // so they're cached and ready when the user actually needs them.
    // This does NOT block the initial render at all.
    function preloadInBackground() {
        var queue = [
            '/libs/chart.min.js',
            '/libs/chartjs-plugin-datalabels.min.js',
            '/libs/xlsx.full.min.js',
            '/libs/html2pdf.bundle.min.js',
            '/libs/jspdf.umd.min.js',
            '/libs/jspdf.plugin.autotable.min.js',
            '/libs/qrcode.min.js',
            '/libs/html5-qrcode.min.js',
            '/libs/leaflet.js'
        ];

        function loadNext() {
            if (queue.length === 0) return;
            var src = queue.shift();
            loadScript(src).then(function() {
                // If it was chartjs plugin, register it
                if(src === '/libs/chartjs-plugin-datalabels.min.js' && typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
                    Chart.register(ChartDataLabels);
                }
                loadNext();
            }).catch(loadNext);
        }

        // Cargar secuencialmente para respetar dependencias
        loadNext();
    }

    // Wait 2 seconds after page is interactive, then start background pre-loading
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(function() { preloadInBackground(); }, { timeout: 3000 });
    } else {
        setTimeout(preloadInBackground, 2000);
    }
})();
