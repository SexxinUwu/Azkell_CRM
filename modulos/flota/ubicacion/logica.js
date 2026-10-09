// ============================================================
// 📍 MÓDULO GPS FLOTA — Centro de Monitoreo Satelital & Playback (Wialon)
// ============================================================

window._datosWialonGPS         = window._datosWialonGPS         || [];
window._datosWialonGrupos      = window._datosWialonGrupos      || [];
window._filtroGPSActivo        = '';
window._filtroEmpresaGPS       = 'todas';
window._segmentoGPSActivo      = 'total';
window._placaGPSActiva         = null;
window._gpsModoVista           = window._gpsModoVista           || 'tree'; // 'tree' | 'flat'
window._gpsVisibilidadPlacas   = window._gpsVisibilidadPlacas   || {};     // { [placa]: boolean }
window._gpsGruposColapsados    = window._gpsGruposColapsados    || {};     // { [grpId]: boolean }

window._gpsMapInstance         = null;
window._gpsMarkersMap          = {}; // { PLACA: L.marker }
window._gpsTrailsMap           = {}; // { PLACA: L.polyline }
window._gpsTrailPointsMap      = {}; // { PLACA: [[lat, lng], ...] }
window._gpsAnimationsMap       = {}; // { PLACA: animFrameId }
window._gpsMapLayers           = {};
window._gpsCurrentLayerType    = 'calle';
window._intervalGpsLivePolling = null;
window._intervalCountdown      = null;
window._gpsCountdownSecs       = 4;
window._gpsFirstBoundsFitted   = false;

// ── Variables del Motor de Playback de Historial ────────────
window._gpsPlaybackActive      = false;
window._gpsPlaybackData        = null; // { metricas, paradas, excesos, puntos, placa, unitId }
window._gpsPlaybackIndex       = 0;
window._gpsPlaybackPlaying     = false;
window._gpsPlaybackSpeed       = 1;
window._gpsPlaybackTimer       = null;
window._gpsPlaybackTrackLayer  = null;
window._gpsPlaybackMarker      = null;
window._gpsPlaybackStartMarker = null;
window._gpsPlaybackEndMarker   = null;
window._gpsPlaybackStopMarkers = [];
window._gpsPlaybackOverspeedMarkers = [];

var _gpsEsc = function(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};

// ------------------------------------------------------------
// INIT — llamado por el router SPA
// ------------------------------------------------------------
window.init_ubicacion = function() {
    if (!window.checkPerm('gps', 'l')) {
        var wrap = document.getElementById('moduloUbicacionGPS') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }

    // ── Reseteo estricto de filtros al entrar/re-entrar al módulo ──
    window._filtroGPSActivo = '';
    window._filtroEmpresaGPS = 'todas';
    window._segmentoGPSActivo = 'total';
    window._placaGPSActiva = null;
    window._gpsFirstBoundsFitted = false;
    window._gpsPlaybackActive = false;

    // Limpiar input de búsqueda visualmente
    var inputBus = document.getElementById('busGPSUnidad');
    if (inputBus) inputBus.value = '';
    var btnClear = document.getElementById('btn-clear-search-gps');
    if (btnClear) btnClear.style.display = 'none';

    // Restaurar botones segmentados activos
    document.querySelectorAll('#btn-group-gps-empresa .ck-segment-item').forEach(function(el) {
        el.classList.toggle('active', el.getAttribute('data-empresa') === 'todas');
    });
    document.querySelectorAll('#btn-group-gps-filtros .ck-segment-item').forEach(function(el) {
        el.classList.toggle('active', el.getAttribute('data-filter') === 'total');
    });
    document.querySelectorAll('#moduloUbicacionGPS .ck-kpi-card').forEach(function(el) {
        el.classList.toggle('active', el.id === 'gps-kpi-total');
    });

    // Limpiar temporizadores y animaciones previas
    window.gpsLimpiarTodo();

    // 1. Usar datos en caché de Wialon si existen para renderizado instantáneo
    var rawCache = (typeof CACHE !== 'undefined' && CACHE.wialon) ? CACHE.wialon : null;
    var datosCache = Array.isArray(rawCache) ? rawCache : (rawCache && Array.isArray(rawCache.data) ? rawCache.data : ((window._datosWialonGPS && window._datosWialonGPS.length > 0) ? window._datosWialonGPS : []));

    if (datosCache.length > 0) {
        window.renderListaUnidadesGPS(datosCache, window._datosWialonGrupos || []);
    }

    // 2. Cargar biblioteca Leaflet y crear mapa interactivo
    var leafletPromise = (typeof L !== 'undefined') ? Promise.resolve() : (window.loadLeaflet ? window.loadLeaflet() : Promise.resolve());

    leafletPromise.then(function() {
        window.gpsInitMap();

        if (datosCache.length > 0) {
            window.renderListaUnidadesGPS(datosCache, window._datosWialonGrupos || []);
        }

        // 3. Disparar consulta fresca en vivo inmediata
        window._actualizarGpsEnVivo(true);

        // 4. Iniciar ciclo de polling en vivo cada 4 segundos
        window.gpsIniciarCicloPolling();
    }).catch(function(err) {
        console.error("Error al inicializar Leaflet en GPS:", err);
    });
};

window.init_flota_ubicacion = window.init_ubicacion;

// ------------------------------------------------------------
// LIMPIEZA DE TIMERS Y ANIMACIONES
// ------------------------------------------------------------
window.gpsLimpiarTodo = function() {
    if (window._intervalGpsLivePolling) {
        clearInterval(window._intervalGpsLivePolling);
        window._intervalGpsLivePolling = null;
    }
    if (window._intervalCountdown) {
        clearInterval(window._intervalCountdown);
        window._intervalCountdown = null;
    }
    if (window._gpsPlaybackTimer) {
        clearInterval(window._gpsPlaybackTimer);
        window._gpsPlaybackTimer = null;
    }
    // Cancelar animaciones en curso
    if (window._gpsAnimationsMap) {
        Object.keys(window._gpsAnimationsMap).forEach(function(k) {
            if (window._gpsAnimationsMap[k]) {
                cancelAnimationFrame(window._gpsAnimationsMap[k]);
            }
        });
        window._gpsAnimationsMap = {};
    }
};

// ------------------------------------------------------------
// INICIALIZAR MAPA LEAFLET
// ------------------------------------------------------------
window.gpsInitMap = function() {
    var mapContainer = document.getElementById('gpsFleetMap');
    if (!mapContainer || typeof L === 'undefined') return;

    if (window._gpsMapInstance) {
        try {
            window._gpsMapInstance.remove();
        } catch(e) {}
        window._gpsMapInstance = null;
    }
    window._gpsMarkersMap = {};
    window._gpsTrailsMap = {};
    window._gpsTrailPointsMap = {};

    // Capas Base
    var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    });

    var googleSatLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '© Google Satellite'
    });

    window._gpsMapLayers = {
        calle: osmLayer,
        satelite: googleSatLayer
    };

    var map = L.map('gpsFleetMap', {
        center: [-9.19, -75.015],
        zoom: 6,
        zoomControl: true,
        attributionControl: false,
        layers: [window._gpsCurrentLayerType === 'satelite' ? googleSatLayer : osmLayer]
    });

    map.zoomControl.setPosition('bottomright');
    window._gpsMapInstance = map;

    setTimeout(function() {
        if (window._gpsMapInstance) window._gpsMapInstance.invalidateSize();
    }, 200);
};

// ------------------------------------------------------------
// CAMBIO DE CAPA (Callejero / Satelital)
// ------------------------------------------------------------
window.gpsCambiarCapaMapa = function(tipo) {
    if (!window._gpsMapInstance || !window._gpsMapLayers) return;
    window._gpsCurrentLayerType = tipo;

    var btnStreet = document.getElementById('btnMapStyleStreet');
    var btnSat = document.getElementById('btnMapStyleSat');

    if (tipo === 'satelite') {
        if (window._gpsMapInstance.hasLayer(window._gpsMapLayers.calle)) {
            window._gpsMapInstance.removeLayer(window._gpsMapLayers.calle);
        }
        window._gpsMapLayers.satelite.addTo(window._gpsMapInstance);

        if (btnSat) { btnSat.classList.add('active'); }
        if (btnStreet) { btnStreet.classList.remove('active'); }
    } else {
        if (window._gpsMapInstance.hasLayer(window._gpsMapLayers.satelite)) {
            window._gpsMapInstance.removeLayer(window._gpsMapLayers.satelite);
        }
        window._gpsMapLayers.calle.addTo(window._gpsMapInstance);

        if (btnStreet) { btnStreet.classList.add('active'); }
        if (btnSat) { btnSat.classList.remove('active'); }
    }
};

// ------------------------------------------------------------
// POLLING EN VIVO CADA 4 SEGUNDOS
// ------------------------------------------------------------
window.gpsIniciarCicloPolling = function() {
    window._gpsCountdownSecs = 4;
    
    window._intervalCountdown = setInterval(function() {
        var modEl = document.getElementById('moduloUbicacionGPS');
        if (!modEl || modEl.offsetParent === null) {
            window.gpsLimpiarTodo();
            return;
        }

        window._gpsCountdownSecs--;
        if (window._gpsCountdownSecs <= 0) window._gpsCountdownSecs = 4;
        var el = document.getElementById('gps-timer-countdown');
        if (el) el.textContent = window._gpsCountdownSecs + 's';
    }, 1000);

    window._intervalGpsLivePolling = setInterval(function() {
        var modEl = document.getElementById('moduloUbicacionGPS');
        if (!modEl || modEl.offsetParent === null) {
            window.gpsLimpiarTodo();
            return;
        }
        // Si estamos en modo Playback, no actualizar marcadores en vivo para no interferir
        if (!window._gpsPlaybackActive) {
            window._actualizarGpsEnVivo(false);
        }
    }, 4000);
};

// ------------------------------------------------------------
// PETICIÓN Y ACTUALIZACIÓN EN VIVO
// ------------------------------------------------------------
window._actualizarGpsEnVivo = function(forzar) {
    if (window._gpsFetchInFlight) return; // Evitar peticiones solapadas
    window._gpsCountdownSecs = 4;
    var elCount = document.getElementById('gps-timer-countdown');
    if (elCount) elCount.textContent = '4s';

    window._gpsFetchInFlight = true;
    fetch('/api/script/obtenerDatosWialon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] })
    })
    .then(function(r) {
        if (!r.ok) {
            var fallback = (typeof CACHE !== 'undefined' && Array.isArray(CACHE.wialon)) ? CACHE.wialon : [];
            return { data: fallback, grupos: window._datosWialonGrupos || [] };
        }
        return r.json().catch(function() { return { data: [], grupos: [] }; });
    })
    .then(function(r) {
        var d = [];
        var grps = [];
        if (r && Array.isArray(r.data)) {
            d = r.data;
            grps = Array.isArray(r.grupos) ? r.grupos : [];
        } else if (r && r.data && Array.isArray(r.data.data)) {
            d = r.data.data;
            grps = Array.isArray(r.data.grupos) ? r.data.grupos : [];
        } else if (Array.isArray(r)) {
            d = r;
        }

        if (d.length > 0) {
            if (typeof CACHE !== 'undefined') CACHE.wialon = d;
            
            // Sincronizar estado en el botón navbar superior
            var btnNav = document.getElementById('btn-wialon-status');
            var txtNav = document.getElementById('wialon-text');
            if (btnNav) { btnNav.className = 'btn btn-sm ms-2 btn-primary rounded-pill px-3 shadow-sm d-none d-md-inline-flex align-items-center gap-1'; }
            if (txtNav) { txtNav.innerText = 'GPS Activo'; }

            window.renderListaUnidadesGPS(d, grps);
            if (!window._gpsPlaybackActive) {
                window.gpsActualizarMarcadoresMapa(d);
            }
        }
    })
    .catch(function(err) {
        // Silenciar advertencias rutinarias de red/timeout
    })
    .finally(function() {
        window._gpsFetchInFlight = false;
    });
};

// ------------------------------------------------------------
// RENDER LISTA UNIDADES & ARBOL DE GRUPOS WIALON
// ------------------------------------------------------------
window.renderListaUnidadesGPS = function(datos, grupos) {
    var arrDatos = Array.isArray(datos) ? datos : (datos && Array.isArray(datos.data) ? datos.data : []);
    var arrGrupos = Array.isArray(grupos) ? grupos : (datos && Array.isArray(datos.grupos) ? datos.grupos : (window._datosWialonGrupos || []));

    window._datosWialonGPS = arrDatos;
    if (arrGrupos && arrGrupos.length > 0) {
        window._datosWialonGrupos = arrGrupos;
    }

    var total = arrDatos.length;
    var online = 0;
    var movimiento = 0;
    var offline = 0;

    arrDatos.forEach(function(w) {
        var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
        var speed = (w.velocidad != null ? Number(w.velocidad) : 0) || 0;
        
        if (tienePos) {
            online++;
            if (speed > 3) movimiento++;
        } else {
            offline++;
        }

        // Inicializar visibilidad por defecto en true para cada placa
        if (w.placa && typeof window._gpsVisibilidadPlacas[w.placa] === 'undefined') {
            window._gpsVisibilidadPlacas[w.placa] = true;
        }
    });

    var setKpi = function(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setKpi('kpi-gps-total', total);
    setKpi('kpi-gps-online', online);
    setKpi('kpi-gps-movimiento', movimiento);
    setKpi('kpi-gps-offline', offline);

    var badge = document.getElementById('gps-unit-count-badge');
    if (badge) badge.textContent = total + ' unidades';

    var badgeActivo = document.getElementById('badge-wialon-ubicacion');
    if (badgeActivo) badgeActivo.style.display = total > 0 ? 'inline-flex' : 'none';

    window.filtrarListaGPS(window._filtroGPSActivo || '');
};

// ------------------------------------------------------------
// FILTRADO SEGMENTADO POR EMPRESA, ESTADO & BÚSQUEDA MULTI-CRITERIO
// ------------------------------------------------------------
window.filtrarEmpresaGPS = function(empresa, btn) {
    window._filtroEmpresaGPS = empresa || 'todas';

    document.querySelectorAll('#btn-group-gps-empresa .ck-segment-item').forEach(function(el) {
        el.classList.toggle('active', el.getAttribute('data-empresa') === window._filtroEmpresaGPS);
    });

    window.filtrarListaGPS(window._filtroGPSActivo || '');
};

window.filtrarSegmentoGPS = function(tipo, btn) {
    window._segmentoGPSActivo = tipo || 'total';

    document.querySelectorAll('#btn-group-gps-filtros .ck-segment-item').forEach(function(el) {
        el.classList.toggle('active', el.getAttribute('data-filter') === window._segmentoGPSActivo);
    });
    document.querySelectorAll('#moduloUbicacionGPS .ck-kpi-card').forEach(function(el) {
        el.classList.toggle('active', el.id === 'gps-kpi-' + window._segmentoGPSActivo);
    });

    window.filtrarListaGPS(window._filtroGPSActivo || '');
};

window.gpsLimpiarBusqueda = function() {
    var input = document.getElementById('busGPSUnidad');
    if (input) input.value = '';
    var btnClear = document.getElementById('btn-clear-search-gps');
    if (btnClear) btnClear.style.display = 'none';
    window.filtrarListaGPS('');
};

window.gpsCambiarModoVista = function(modo) {
    window._gpsModoVista = modo || 'tree';

    var btnTree = document.getElementById('btnGpsViewTree');
    var btnFlat = document.getElementById('btnGpsViewFlat');
    if (btnTree) btnTree.classList.toggle('active', window._gpsModoVista === 'tree');
    if (btnFlat) btnFlat.classList.toggle('active', window._gpsModoVista === 'flat');

    window.filtrarListaGPS(window._filtroGPSActivo || '');
};

window.gpsToggleColapsoGrupo = function(grpKey, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    window._gpsGruposColapsados[grpKey] = !window._gpsGruposColapsados[grpKey];
    var card = document.getElementById('gps-group-card-' + grpKey);
    if (card) {
        card.classList.toggle('is-collapsed', Boolean(window._gpsGruposColapsados[grpKey]));
    }
};

window.gpsToggleColapsoTodosGrupos = function() {
    var cards = document.querySelectorAll('.gps-group-card');
    if (cards.length === 0) return;

    var anyExpanded = Array.from(cards).some(function(c) { return !c.classList.contains('is-collapsed'); });
    var icon = document.getElementById('iconGpsToggleExpandAll');

    cards.forEach(function(c) {
        var grpKey = c.getAttribute('data-group-key');
        if (anyExpanded) {
            c.classList.add('is-collapsed');
            if (grpKey) window._gpsGruposColapsados[grpKey] = true;
        } else {
            c.classList.remove('is-collapsed');
            if (grpKey) window._gpsGruposColapsados[grpKey] = false;
        }
    });

    if (icon) {
        icon.className = anyExpanded ? 'bi bi-arrows-expand' : 'bi bi-arrows-collapse';
    }
};

// ------------------------------------------------------------
// TOGGLES DE VISIBILIDAD EN MAPA CON CHECKBOXES MODERNOS
// ------------------------------------------------------------
window.gpsToggleVisibilidadPlaca = function(placa, checked, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    window._gpsVisibilidadPlacas[placa] = Boolean(checked);

    // Actualizar marcador Leaflet
    if (window._gpsMapInstance && window._gpsMarkersMap[placa]) {
        var marker = window._gpsMarkersMap[placa];
        if (checked) {
            if (!window._gpsMapInstance.hasLayer(marker)) marker.addTo(window._gpsMapInstance);
        } else {
            if (window._gpsMapInstance.hasLayer(marker)) window._gpsMapInstance.removeLayer(marker);
        }
    }

    // Actualizar estilos visuales de filas / tarjetas de esa unidad
    document.querySelectorAll(`[data-placa-unit="${placa}"]`).forEach(function(el) {
        el.classList.toggle('is-hidden-map', !checked);
        var chk = el.querySelector('.gps-check-custom');
        if (chk && chk.checked !== checked) chk.checked = checked;
    });

    window.gpsActualizarEstadosCheckboxesGrupos();
    window.gpsActualizarMasterCheckbox();
};

window.gpsToggleVisibilidadGrupo = function(grpKey, checked, e) {
    if (e && e.stopPropagation) e.stopPropagation();

    var grpCard = document.getElementById('gps-group-card-' + grpKey);
    if (!grpCard) return;

    var unitCheckboxes = grpCard.querySelectorAll('.gps-unit-checkbox');
    unitCheckboxes.forEach(function(chk) {
        var placa = chk.getAttribute('data-placa');
        if (placa) {
            window._gpsVisibilidadPlacas[placa] = Boolean(checked);
            chk.checked = checked;

            // Actualizar marcador Leaflet
            if (window._gpsMapInstance && window._gpsMarkersMap[placa]) {
                var marker = window._gpsMarkersMap[placa];
                if (checked) {
                    if (!window._gpsMapInstance.hasLayer(marker)) marker.addTo(window._gpsMapInstance);
                } else {
                    if (window._gpsMapInstance.hasLayer(marker)) window._gpsMapInstance.removeLayer(marker);
                }
            }

            document.querySelectorAll(`[data-placa-unit="${placa}"]`).forEach(function(el) {
                el.classList.toggle('is-hidden-map', !checked);
            });
        }
    });

    window.gpsActualizarEstadosCheckboxesGrupos();
    window.gpsActualizarMasterCheckbox();
};

window.gpsToggleVisibilidadTodos = function(checked) {
    (window._datosWialonGPS || []).forEach(function(w) {
        if (!w.placa) return;
        window._gpsVisibilidadPlacas[w.placa] = Boolean(checked);

        if (window._gpsMapInstance && window._gpsMarkersMap[w.placa]) {
            var marker = window._gpsMarkersMap[w.placa];
            if (checked) {
                if (!window._gpsMapInstance.hasLayer(marker)) marker.addTo(window._gpsMapInstance);
            } else {
                if (window._gpsMapInstance.hasLayer(marker)) window._gpsMapInstance.removeLayer(marker);
            }
        }
    });

    document.querySelectorAll('.gps-check-custom').forEach(function(chk) {
        chk.checked = checked;
        chk.indeterminate = false;
    });

    document.querySelectorAll('.gps-unit-row, .gps-unit-card').forEach(function(el) {
        el.classList.toggle('is-hidden-map', !checked);
    });

    window.gpsActualizarMasterCheckbox();
};

window.gpsActualizarEstadosCheckboxesGrupos = function() {
    document.querySelectorAll('.gps-group-card').forEach(function(card) {
        var grpChk = card.querySelector('.gps-group-checkbox');
        if (!grpChk) return;

        var unitChks = Array.from(card.querySelectorAll('.gps-unit-checkbox'));
        if (unitChks.length === 0) return;

        var checkedCount = unitChks.filter(function(c) { return c.checked; }).length;
        if (checkedCount === 0) {
            grpChk.checked = false;
            grpChk.indeterminate = false;
        } else if (checkedCount === unitChks.length) {
            grpChk.checked = true;
            grpChk.indeterminate = false;
        } else {
            grpChk.checked = false;
            grpChk.indeterminate = true;
        }

        var countBadge = card.querySelector('.gps-group-badge-count');
        if (countBadge) {
            countBadge.textContent = `${checkedCount}/${unitChks.length}`;
        }
    });
};

window.gpsActualizarMasterCheckbox = function() {
    var masterChk = document.getElementById('gpsMasterCheckbox');
    var countCheckedEl = document.getElementById('gpsCheckedUnitsCount');
    var countTotalEl = document.getElementById('gpsTotalUnitsCount');

    var datos = window._datosWialonGPS || [];
    var totalUnits = datos.length;
    var checkedCount = datos.filter(function(w) { return w.placa && window._gpsVisibilidadPlacas[w.placa] !== false; }).length;

    if (countCheckedEl) countCheckedEl.textContent = checkedCount;
    if (countTotalEl) countTotalEl.textContent = totalUnits;

    if (masterChk) {
        if (totalUnits === 0 || checkedCount === 0) {
            masterChk.checked = false;
            masterChk.indeterminate = false;
        } else if (checkedCount === totalUnits) {
            masterChk.checked = true;
            masterChk.indeterminate = false;
        } else {
            masterChk.checked = false;
            masterChk.indeterminate = true;
        }
    }
};

// ------------------------------------------------------------
// MOTOR PRINCIPAL DE FILTRADO Y RENDERIZADO DEL SIDEBAR
// ------------------------------------------------------------
window.filtrarListaGPS = function(query) {
    window._filtroGPSActivo = query || '';
    var lista = document.getElementById('listaUnidadesGPS');
    if (!lista) return;

    var btnClear = document.getElementById('btn-clear-search-gps');
    if (btnClear) {
        btnClear.style.display = (query && query.trim().length > 0) ? 'block' : 'none';
    }

    var datos = window._datosWialonGPS || [];
    if (datos.length === 0) {
        lista.innerHTML = '<div class="text-center py-5 text-muted" style="font-size:0.85rem;"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Sincronizando telemetría GPS...</div>';
        return;
    }

    var q = (query || '').trim().toUpperCase();

    // Función de validación de unidad contra filtros activos
    var testUnidad = function(w) {
        var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
        var speed = (w.velocidad != null ? Number(w.velocidad) : 0) || 0;
        var isIgnition = Boolean(w.ignicion);
        var estadoMot = w.estado_motor || (speed > 3 ? 'en_marcha' : (isIgnition ? 'ralenti' : (tienePos ? 'detenido' : 'offline')));

        // Filtro por Búsqueda Multi-criterio (Placa, Nombre, Empresa, Ciudad/Dirección, Tipo)
        var matchText = !q ||
            (w.placa || '').toUpperCase().includes(q) ||
            (w.nombre_wialon || '').toUpperCase().includes(q) ||
            (w.empresa || '').toUpperCase().includes(q) ||
            (w.ubicacion || '').toUpperCase().includes(q) ||
            (w.tipo_vehiculo || '').toUpperCase().includes(q);

        // Filtro por Empresa
        var matchEmpresa = true;
        if (window._filtroEmpresaGPS && window._filtroEmpresaGPS !== 'todas') {
            matchEmpresa = (w.empresa || '').toUpperCase().includes(window._filtroEmpresaGPS.toUpperCase()) ||
                           (w.nombre_wialon || '').toUpperCase().includes(window._filtroEmpresaGPS.toUpperCase());
        }

        // Filtro por Estado de Telemetría
        var matchSeg = true;
        if (window._segmentoGPSActivo === 'online') {
            matchSeg = tienePos;
        } else if (window._segmentoGPSActivo === 'movimiento') {
            matchSeg = (tienePos && speed > 3);
        } else if (window._segmentoGPSActivo === 'ralenti') {
            matchSeg = (tienePos && speed <= 3 && (isIgnition || estadoMot === 'ralenti'));
        } else if (window._segmentoGPSActivo === 'detenido') {
            matchSeg = (tienePos && speed <= 3 && !isIgnition && estadoMot !== 'ralenti');
        } else if (window._segmentoGPSActivo === 'offline') {
            matchSeg = !tienePos;
        }

        return matchText && matchEmpresa && matchSeg;
    };

    var filtradosTotales = datos.filter(testUnidad);

    if (filtradosTotales.length === 0) {
        lista.innerHTML = '<div class="text-center py-5 text-muted" style="font-size:0.85rem;"><i class="bi bi-search me-1"></i> Sin unidades encontradas con estos filtros.</div>';
        window.gpsActualizarMasterCheckbox();
        return;
    }

    // Helper para generar el badge de estado
    var generarStatusBadge = function(w) {
        var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
        var speed = (w.velocidad != null ? Number(w.velocidad) : 0) || 0;
        var isMoving = tienePos && speed > 3;
        var isIgnition = Boolean(w.ignicion);
        var isRalenti = tienePos && speed <= 3 && isIgnition;

        if (!tienePos) {
            return '<span class="badge bg-light text-secondary border" style="font-size:0.62rem; border-radius:5px; padding:2px 5px;">Sin Señal</span>';
        } else if (isMoving) {
            return `<span class="badge bg-primary-subtle text-primary border border-primary-subtle fw-bold" style="font-size:0.62rem; border-radius:5px; padding:2px 5px;"><i class="bi bi-speedometer2 me-1"></i>${speed} km/h</span>`;
        } else if (isRalenti) {
            return '<span class="badge bg-warning-subtle text-warning border border-warning-subtle fw-bold" style="font-size:0.62rem; border-radius:5px; padding:2px 5px; color:#c2410c !important;"><i class="bi bi-fire me-1"></i>Ralentí</span>';
        } else {
            return '<span class="badge bg-success-subtle text-success border border-success-subtle fw-bold" style="font-size:0.62rem; border-radius:5px; padding:2px 5px;"><i class="bi bi-pause-circle me-1"></i>Detenido</span>';
        }
    };

    // Helper para renderizar una fila de unidad (estilo más grueso y nítido dentro de grupo)
    var renderFilaUnidad = function(w) {
        var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
        var speed = (w.velocidad != null ? Number(w.velocidad) : 0) || 0;
        var isMoving = tienePos && speed > 3;
        var isIgnition = Boolean(w.ignicion);
        var isRalenti = tienePos && speed <= 3 && isIgnition;

        var dotColor = tienePos ? (isMoving ? '#0284c7' : (isRalenti ? '#ea580c' : '#10b981')) : '#94a3b8';
        var isActive = window._placaGPSActiva === (w.placa || '');
        var isVisible = window._gpsVisibilidadPlacas[w.placa] !== false;
        var safePlc = (w.placa || '').replace(/'/g, "\\'");
        var dirText = w.ubicacion || w.nombre_wialon || '';

        return `
        <div class="gps-unit-row${isActive ? ' active' : ''}${!isVisible ? ' is-hidden-map' : ''}" data-placa-unit="${w.placa || ''}" onclick="window.abrirDetalleGPS('${safePlc}')">
            <div class="d-flex align-items-center gap-2.5" style="min-width: 0; flex: 1;">
                <input type="checkbox" class="gps-check-custom gps-unit-checkbox" data-placa="${w.placa || ''}" ${isVisible ? 'checked' : ''} onclick="event.stopPropagation()" onchange="window.gpsToggleVisibilidadPlaca('${safePlc}', this.checked, event)" title="Ver en mapa">
                <div style="width: 10px; height: 10px; border-radius: 50%; background: ${dotColor}; flex-shrink: 0; box-shadow:0 0 6px ${dotColor};"></div>
                <div style="min-width: 0; flex: 1;">
                    <div class="d-flex align-items-center gap-2 mb-0.5 flex-wrap">
                        <span class="font-monospace fw-bold text-dark" style="font-size:0.88rem; letter-spacing: -0.01em;">${w.placa || '—'}</span>
                        ${generarStatusBadge(w)}
                    </div>
                    <div class="text-truncate text-secondary" title="${_gpsEsc(dirText)}" style="font-size: 0.72rem; line-height: 1.35; max-width: 190px;">
                        ${w.ubicacion ? `<i class="bi bi-geo-alt-fill text-danger me-1"></i>${_gpsEsc(w.ubicacion)}` : _gpsEsc(w.nombre_wialon || '')}
                    </div>
                </div>
            </div>
            <div class="text-end font-monospace" style="flex-shrink: 0;">
                <div class="text-primary fw-bold" style="font-size:0.76rem;">${(w.km || 0).toLocaleString()} km</div>
                <div class="text-secondary" style="font-size:0.68rem;">${(w.horas || 0).toLocaleString()} hrs</div>
            </div>
        </div>`;
    };

    // ── MODO 1: VISTA EN ÁRBOL / GRUPOS EMPRESARIALES LIMPIOS ───────
    if (window._gpsModoVista === 'tree') {
        var wialonGrupos = window._datosWialonGrupos || [];

        // 1. Filtrar grupos técnicos / de consulta no deseados (UND TEMPERATURA, UNIDADES-TEMP-CONSULTA, etc.)
        var wialonGruposLimpios = (wialonGrupos || []).filter(function(g) {
            var nm = (g.nombre || '').toUpperCase().trim();
            return !nm.includes('TEMP') && !nm.includes('CONSULTA');
        });

        // 2. Mapeo de unidades por ID y Placa
        var unitIdMap = {};
        datos.forEach(function(u) {
            unitIdMap[u.id] = u;
        });

        // 3. Crear los grupos de negocio principales ordenados
        var gruposAProcesar = [];

        // Grupo A: Flota Total (Todas las unidades monitoreadas)
        gruposAProcesar.push({
            id: 'flota_total',
            nombre: 'Flota Total',
            units: datos
        });

        // Grupo B: Marsisa SAC
        var marsisaGrp = wialonGruposLimpios.find(function(g) { return (g.nombre || '').toUpperCase().includes('MARSISA'); });
        var marsisaUnitIds = new Set(marsisaGrp ? (marsisaGrp.unitIds || []) : []);
        var marsisaUnits = datos.filter(function(u) {
            return marsisaUnitIds.has(u.id) || (u.empresa || '').toUpperCase().includes('MARSISA') || (u.nombre_wialon || '').toUpperCase().includes('MARSISA');
        });
        gruposAProcesar.push({
            id: 'marsisa_sac',
            nombre: 'Marsisa SAC',
            units: marsisaUnits
        });

        // Grupo C: Trahesa SAC (Incluye todas las unidades de Trahesa como F7E861 y V53776 / V5J776)
        var trahesaGrp = wialonGruposLimpios.find(function(g) { return (g.nombre || '').toUpperCase().includes('TRAHESA'); });
        var trahesaUnitIds = new Set(trahesaGrp ? (trahesaGrp.unitIds || []) : []);
        var trahesaUnits = datos.filter(function(u) {
            var plc = (u.placa || '').toUpperCase();
            var emp = (u.empresa || '').toUpperCase();
            var nom = (u.nombre_wialon || '').toUpperCase();
            return trahesaUnitIds.has(u.id) || emp.includes('TRAHESA') || nom.includes('TRAHESA') || plc.startsWith('F7E') || plc.startsWith('V53') || plc.startsWith('V5J');
        });
        gruposAProcesar.push({
            id: 'trahesa_sac',
            nombre: 'Trahesa SAC',
            units: trahesaUnits
        });

        // Grupo D: Yogui Transport
        var yoguiGrp = wialonGruposLimpios.find(function(g) { return (g.nombre || '').toUpperCase().includes('YOGUI'); });
        var yoguiUnitIds = new Set(yoguiGrp ? (yoguiGrp.unitIds || []) : []);
        var yoguiUnits = datos.filter(function(u) {
            var emp = (u.empresa || '').toUpperCase();
            var nom = (u.nombre_wialon || '').toUpperCase();
            return yoguiUnitIds.has(u.id) || emp.includes('YOGUI') || nom.includes('YOGUI');
        });
        if (yoguiUnits.length > 0) {
            gruposAProcesar.push({
                id: 'yogui_transport',
                nombre: 'Yogui Transport',
                units: yoguiUnits
            });
        }

        // Grupo E: ThermoKing
        var thermoGrp = wialonGruposLimpios.find(function(g) { return (g.nombre || '').toUpperCase().includes('THERMO'); });
        if (thermoGrp && Array.isArray(thermoGrp.unitIds) && thermoGrp.unitIds.length > 0) {
            var thermoUnits = thermoGrp.unitIds.map(function(uid) { return unitIdMap[uid]; }).filter(Boolean);
            if (thermoUnits.length > 0) {
                gruposAProcesar.push({
                    id: 'thermo_king',
                    nombre: 'ThermoKing',
                    units: thermoUnits
                });
            }
        }

        // Grupo F: Otras Unidades (Solo si quedan unidades verdaderamente no categorizadas)
        var allCategorizedPlacas = new Set();
        [marsisaUnits, trahesaUnits, yoguiUnits].forEach(function(arr) {
            (arr || []).forEach(function(u) { if (u && u.placa) allCategorizedPlacas.add(u.placa.toUpperCase()); });
        });
        var trueOutsideUnits = datos.filter(function(u) { return u.placa && !allCategorizedPlacas.has(u.placa.toUpperCase()); });
        if (trueOutsideUnits.length > 0) {
            gruposAProcesar.push({
                id: 'outside_groups',
                nombre: 'Otras Unidades',
                units: trueOutsideUnits
            });
        }

        // Renderizar Grupos
        var htmlGrupos = gruposAProcesar.map(function(grp, gIdx) {
            var matchingUnits = grp.units.filter(testUnidad);
            if (matchingUnits.length === 0) return ''; // Ocultar grupos vacíos bajo este filtro

            var grpKey = 'grp_' + (grp.id || gIdx).toString().replace(/[^a-zA-Z0-9_]/g, '_');
            
            // Si el usuario está buscando texto, auto-expandir grupos que tienen coincidencias
            var isAutoExpandedBySearch = q.length > 0;
            var isCollapsed = isAutoExpandedBySearch ? false : Boolean(window._gpsGruposColapsados[grpKey]);

            var checkedCount = matchingUnits.filter(function(u) { return window._gpsVisibilidadPlacas[u.placa] !== false; }).length;
            var isAllChecked = checkedCount === matchingUnits.length;
            var isNoneChecked = checkedCount === 0;
            var isIndeterminate = !isAllChecked && !isNoneChecked;

            // Icono alusivo según el nombre del grupo
            var grpIcon = 'bi-truck';
            var grpNameUpper = (grp.nombre || '').toUpperCase();
            if (grpNameUpper.includes('THERMO') || grpNameUpper.includes('TEMP')) {
                grpIcon = 'bi-thermometer-half text-info';
            } else if (grpNameUpper.includes('FLOTA TOTAL')) {
                grpIcon = 'bi-collection-fill text-primary';
            } else if (grpNameUpper.includes('MARSISA')) {
                grpIcon = 'bi-building text-primary';
            } else if (grpNameUpper.includes('TRAHESA')) {
                grpIcon = 'bi-building text-warning';
            } else if (grpNameUpper.includes('YOGUI')) {
                grpIcon = 'bi-truck text-success';
            }

            var rowsHtml = matchingUnits.map(renderFilaUnidad).join('');

            return `
            <div class="gps-group-card${isCollapsed ? ' is-collapsed' : ''}" id="gps-group-card-${grpKey}" data-group-key="${grpKey}">
                <div class="gps-group-header" onclick="window.gpsToggleColapsoGrupo('${grpKey}', event)">
                    <div class="d-flex align-items-center gap-2" style="min-width:0; flex:1;">
                        <span class="gps-group-chevron"><i class="bi bi-chevron-right"></i></span>
                        <input type="checkbox" class="gps-check-custom gps-group-checkbox" ${isAllChecked ? 'checked' : ''} ${isIndeterminate ? 'data-indeterminate="true"' : ''} onclick="event.stopPropagation()" onchange="window.gpsToggleVisibilidadGrupo('${grpKey}', this.checked, event)" title="Mostrar/Ocultar todo el grupo">
                        <i class="bi ${grpIcon}" style="font-size:0.85rem;"></i>
                        <span class="gps-group-title" title="${_gpsEsc(grp.nombre)}">
                            (${grp.units.length}) ${_gpsEsc(grp.nombre)}
                        </span>
                    </div>
                    <div class="d-flex align-items-center gap-1.5 flex-shrink-0">
                        <span class="gps-group-badge-count">${checkedCount}/${matchingUnits.length}</span>
                    </div>
                </div>
                <div class="gps-group-units">
                    ${rowsHtml}
                </div>
            </div>`;
        }).filter(Boolean).join('');

        lista.innerHTML = htmlGrupos || '<div class="text-center py-5 text-muted" style="font-size:0.85rem;"><i class="bi bi-search me-1"></i> Sin unidades encontradas en grupos.</div>';

        // Aplicar estado indeterminado a checkboxes de grupo en DOM
        document.querySelectorAll('.gps-group-card input[data-indeterminate="true"]').forEach(function(chk) {
            chk.indeterminate = true;
        });

    } else {
        // ── MODO 2: VISTA LISTA PLANA ──────────────────────────────
        lista.innerHTML = filtradosTotales.map(function(w) {
            var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
            var speed = (w.velocidad != null ? Number(w.velocidad) : 0) || 0;
            var isMoving = tienePos && speed > 3;
            var isIgnition = Boolean(w.ignicion);
            var isRalenti = tienePos && speed <= 3 && isIgnition;

            var dotColor = tienePos ? (isMoving ? '#0284c7' : (isRalenti ? '#ea580c' : '#10b981')) : '#94a3b8';
            var isActive = window._placaGPSActiva === (w.placa || '');
            var isVisible = window._gpsVisibilidadPlacas[w.placa] !== false;
            var safePlc = (w.placa || '').replace(/'/g, "\\'");
            var dirTextLista = w.ubicacion || w.nombre_wialon || '';
            var empText = w.empresa ? (w.empresa.includes('TRAHESA') ? 'TRAHESA' : 'MARSISA') : 'MARSISA';

            return `
            <div class="gps-unit-card${isActive ? ' active' : ''}${!isVisible ? ' is-hidden-map' : ''}" data-placa-unit="${w.placa || ''}" id="gps-list-card-${w.placa || ''}" onclick="window.abrirDetalleGPS('${safePlc}')">
                <div class="d-flex align-items-center gap-2" style="min-width: 0; flex: 1;">
                    <input type="checkbox" class="gps-check-custom gps-unit-checkbox" data-placa="${w.placa || ''}" ${isVisible ? 'checked' : ''} onclick="event.stopPropagation()" onchange="window.gpsToggleVisibilidadPlaca('${safePlc}', this.checked, event)" title="Ver en mapa">
                    <div style="width: 10px; height: 10px; border-radius: 50%; background: ${dotColor}; flex-shrink: 0; box-shadow:0 0 6px ${dotColor};"></div>
                    <div style="min-width: 0; flex: 1;">
                        <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
                            <span class="gps-unit-plate font-monospace">${w.placa || '—'}</span>
                            <span class="badge bg-light text-secondary border" style="font-size:0.62rem; padding:2px 5px;">${empText}</span>
                            ${generarStatusBadge(w)}
                        </div>
                        <div class="gps-unit-model text-truncate" title="${_gpsEsc(dirTextLista)}" style="max-width: 200px; font-size: 0.72rem;">
                            ${w.ubicacion ? `<i class="bi bi-geo-alt-fill text-danger me-1"></i>${_gpsEsc(w.ubicacion)}` : _gpsEsc(w.nombre_wialon || '')}
                        </div>
                    </div>
                </div>
                <div class="text-end font-monospace" style="flex-shrink: 0;">
                    <div class="gps-unit-stat text-primary fw-bold" style="font-size:0.75rem;">${(w.km || 0).toLocaleString()} km</div>
                    <div class="gps-unit-stat text-secondary" style="font-size:0.68rem;">${(w.horas || 0).toLocaleString()} hrs</div>
                </div>
            </div>`;
        }).join('');
    }

    window.gpsActualizarMasterCheckbox();
};

// ------------------------------------------------------------
// GENERADOR DE ÍCONO WIALON: CAMIONCITO 3D + FLECHA DE RUMBO
// ------------------------------------------------------------
window.gpsGenerarIconoCamion = function(w, isMoving, speed, course) {
    var isIgnition = Boolean(w.ignicion);
    var isRalenti = !isMoving && isIgnition;

    var truckFill = isMoving ? '#f8fafc' : '#f1f5f9';
    var cabFill = isMoving ? '#ffffff' : (isRalenti ? '#ffedd5' : '#e2e8f0');
    var arrowColor = isMoving ? '#0284c7' : (isRalenti ? '#ea580c' : '#64748b');
    var arrowStroke = isMoving ? '#0369a1' : (isRalenti ? '#9a3412' : '#334155');
    var plateBorder = isMoving ? '#0284c7' : (isRalenti ? '#ea580c' : '#10b981');

    var html = `
        <div class="wialon-truck-unit-wrap" style="position:relative; width:64px; height:50px; display:flex; flex-direction:column; align-items:center; cursor:pointer;">
            
            <!-- Flecha de Rumbo / Orientación Wialon (360°) -->
            <div class="wialon-heading-pointer" style="position:absolute; top:-6px; left:50%; margin-left:-7px; width:14px; height:14px; transform: rotate(${course}deg); transform-origin:center center; transition: transform 0.8s ease; z-index:2;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${arrowColor}" stroke="${arrowStroke}" stroke-width="2">
                    <polygon points="12,2 22,22 12,17 2,22" />
                </svg>
            </div>

            <!-- Camión 3D Isométrico de Carga Pesada con Tráiler -->
            <div class="wialon-truck-graphic" style="position:relative; z-index:1; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.25)); transition: transform 0.3s ease;">
                <svg width="40" height="26" viewBox="0 0 48 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <!-- Furgón / Carreta -->
                    <path d="M4 8 L30 8 L30 24 L4 24 Z" fill="${truckFill}" stroke="#334155" stroke-width="1.6" stroke-linejoin="round" />
                    <path d="M4 8 L10 3 L36 3 L30 8 Z" fill="#cbd5e1" stroke="#334155" stroke-width="1.4" stroke-linejoin="round" />
                    <path d="M30 8 L36 3 L36 19 L30 24 Z" fill="#94a3b8" stroke="#334155" stroke-width="1.4" stroke-linejoin="round" />
                    
                    <!-- Cabina del Tracto -->
                    <path d="M30 11 L43 11 L43 24 L30 24 Z" fill="${cabFill}" stroke="#1e293b" stroke-width="1.6" stroke-linejoin="round" />
                    <path d="M30 11 L36 6 L45 6 L43 11 Z" fill="#e2e8f0" stroke="#1e293b" stroke-width="1.4" stroke-linejoin="round" />
                    <path d="M43 11 L45 6 L45 19 L43 24 Z" fill="#94a3b8" stroke="#1e293b" stroke-width="1.4" stroke-linejoin="round" />
                    
                    <!-- Parabrisas con tinte satelital -->
                    <path d="M39 12.5 L42.5 12.5 L42.5 17 L39 17 Z" fill="#0284c7" />
                    
                    <!-- Ruedas dobles y simples -->
                    <circle cx="9" cy="25" r="3.5" fill="#0f172a" stroke="#64748b" stroke-width="1.2" />
                    <circle cx="18" cy="25" r="3.5" fill="#0f172a" stroke="#64748b" stroke-width="1.2" />
                    <circle cx="37" cy="25" r="3.5" fill="#0f172a" stroke="#64748b" stroke-width="1.2" />
                </svg>
            </div>

            <!-- Placa & Velocidad Integrada estilo Wialon -->
            <div class="wialon-plate-tag font-monospace" style="background:#ffffff; border:1.5px solid ${plateBorder}; border-radius:6px; padding:1px 5px; font-size:0.68rem; font-weight:800; color:#0f172a; box-shadow:0 2px 6px rgba(0,0,0,0.18); margin-top:-2px; white-space:nowrap; z-index:3;">
                ${_gpsEsc(w.placa || '—')} ${isMoving ? `<span style="color:#0284c7; font-weight:800; margin-left:2px;">${speed}k</span>` : (isRalenti ? '<span style="color:#ea580c; font-weight:800; margin-left:2px;">ON</span>' : '')}
            </div>

        </div>
    `;

    return L.divIcon({
        className: 'wialon-truck-divicon',
        html: html,
        iconSize: [64, 50],
        iconAnchor: [32, 25],
        popupAnchor: [0, -22]
    });
};

// ------------------------------------------------------------
// INTERPOLACIÓN Y ANIMACIÓN CONTINUA DE MOVIMIENTO SUAVE (60 FPS)
// ------------------------------------------------------------
window.gpsAnimarMovimientoSuave = function(placa, marker, startLatLng, endLatLng, durationMs) {
    if (window._gpsAnimationsMap[placa]) {
        cancelAnimationFrame(window._gpsAnimationsMap[placa]);
        delete window._gpsAnimationsMap[placa];
    }

    var startTime = performance.now();
    var latDiff = endLatLng[0] - startLatLng[0];
    var lngDiff = endLatLng[1] - startLatLng[1];

    if (Math.abs(latDiff) < 0.00001 && Math.abs(lngDiff) < 0.00001) {
        marker.setLatLng(endLatLng);
        return;
    }

    function step(now) {
        var elapsed = now - startTime;
        var progress = Math.min(elapsed / durationMs, 1);

        var curLat = startLatLng[0] + (latDiff * progress);
        var curLng = startLatLng[1] + (lngDiff * progress);
        var curPos = [curLat, curLng];

        marker.setLatLng(curPos);

        if (progress < 1) {
            window._gpsAnimationsMap[placa] = requestAnimationFrame(step);
        } else {
            delete window._gpsAnimationsMap[placa];
        }
    }

    window._gpsAnimationsMap[placa] = requestAnimationFrame(step);
};

// ------------------------------------------------------------
// ACTUALIZACIÓN DE MARCADORES EN EL MAPA LEAFLET
// ------------------------------------------------------------
window.gpsActualizarMarcadoresMapa = function(datos) {
    if (!window._gpsMapInstance || typeof L === 'undefined') return;

    var validCoords = [];
    var map = window._gpsMapInstance;

    datos.forEach(function(w) {
        var placa = w.placa;
        if (!placa) return;

        var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
        if (!tienePos) {
            if (window._gpsMarkersMap[placa]) {
                map.removeLayer(window._gpsMarkersMap[placa]);
                delete window._gpsMarkersMap[placa];
            }
            return;
        }

        var targetLatLng = [w.lat, w.lng];
        var isVisible = window._gpsVisibilidadPlacas[placa] !== false;
        if (isVisible) {
            validCoords.push(targetLatLng);
        }

        var speed = (w.velocidad != null ? Number(w.velocidad) : 0) || 0;
        var isMoving = speed > 3;
        var course = (w.curso != null ? Number(w.curso) : 0) || 0;

        var customIcon = window.gpsGenerarIconoCamion(w, isMoving, speed, course);

        if (window._gpsMarkersMap[placa]) {
            var marker = window._gpsMarkersMap[placa];
            var startPos = marker.getLatLng();
            window.gpsAnimarMovimientoSuave(placa, marker, [startPos.lat, startPos.lng], targetLatLng, 3800);
            marker.setIcon(customIcon);
            if (isVisible) {
                if (!map.hasLayer(marker)) marker.addTo(map);
            } else {
                if (map.hasLayer(marker)) map.removeLayer(marker);
            }
        } else {
            // Crear marcador satelital interactivo (sin popup superpuesto duplicado)
            var newMarker = L.marker(targetLatLng, { icon: customIcon });
            newMarker.on('click', function(e) {
                if (L.DomEvent) L.DomEvent.stopPropagation(e);
                window.abrirDetalleGPS(placa);
            });
            window._gpsMarkersMap[placa] = newMarker;
            if (isVisible) {
                newMarker.addTo(map);
            }
        }
    });

    if (!window._gpsFirstBoundsFitted && validCoords.length > 0) {
        window._gpsFirstBoundsFitted = true;
        try {
            map.fitBounds(validCoords, { padding: [40, 40], maxZoom: 14 });
        } catch(e) {}
    }

    if (window._placaGPSActiva) {
        var activeUnit = datos.find(function(x) { return (x.placa || '') === window._placaGPSActiva; });
        if (activeUnit) {
            window.gpsActualizarFichaFlotante(activeUnit);
        }
    }
};

// ------------------------------------------------------------
// SELECCIÓN Y APERTURA DE DETALLE DE UNIDAD
// ------------------------------------------------------------
window.abrirDetalleGPS = function(placa) {
    var w = window._datosWialonGPS.find(function(x) { return (x.placa || '') === placa; });
    if (!w) return;

    window._placaGPSActiva = placa;

    document.querySelectorAll('.gps-unit-card').forEach(function(card) {
        card.classList.remove('active');
    });
    var activeCard = document.getElementById('gps-list-card-' + placa);
    if (activeCard) {
        activeCard.classList.add('active');
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    var btnCentrar = document.getElementById('btnGpsCentrarSeleccion');
    if (btnCentrar) btnCentrar.style.display = 'inline-flex';

    var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;

    // Transición en móvil
    if (window.innerWidth <= 768) {
        var splitEl = document.querySelector('.gps-main-split');
        var modEl = document.getElementById('moduloUbicacionGPS');
        if (splitEl) splitEl.classList.add('show-detail');
        if (modEl) modEl.classList.add('in-detail-mobile');

        if (window._gpsMapInstance) {
            setTimeout(function() {
                window._gpsMapInstance.invalidateSize();
                if (tienePos) {
                    // Compensación latitudinal hacia el sur (-0.0022) para que el camión quede perfectamente visible en la zona superior libre del mapa
                    window._gpsMapInstance.flyTo([w.lat - 0.0022, w.lng], 16, { duration: 0.5 });
                }
            }, 180);
        }
    } else {
        if (tienePos && window._gpsMapInstance) {
            window._gpsMapInstance.flyTo([w.lat, w.lng], 16, {
                duration: 0.8,
                easeLinearity: 0.25
            });
        }
    }

    window.gpsActualizarFichaFlotante(w);
};

// ------------------------------------------------------------
// NAVEGACIÓN MÓVIL (VOLVER A LISTA DE UNIDADES & VER MAPA GENERAL)
// ------------------------------------------------------------
window.gpsVolverListaMovil = function() {
    var splitEl = document.querySelector('.gps-main-split');
    var modEl = document.getElementById('moduloUbicacionGPS');
    if (splitEl) splitEl.classList.remove('show-detail');
    if (modEl) modEl.classList.remove('in-detail-mobile');
    window._placaGPSActiva = null;
    
    var card = document.getElementById('gpsFloatingTelemetryCard');
    if (card) {
        card.style.display = 'none';
        card.classList.remove('is-expanded');
    }
    
    document.querySelectorAll('.gps-unit-card').forEach(function(c) {
        c.classList.remove('active');
    });
};

window.gpsVerMapaGeneralMovil = function() {
    var splitEl = document.querySelector('.gps-main-split');
    var modEl = document.getElementById('moduloUbicacionGPS');
    if (splitEl) splitEl.classList.add('show-detail');
    if (modEl) modEl.classList.add('in-detail-mobile');
    if (window._gpsMapInstance) {
        setTimeout(function() {
            window._gpsMapInstance.invalidateSize();
            window.gpsVerTodaLaFlota();
        }, 180);
    }
};

// ------------------------------------------------------------
// ACTUALIZAR FICHA FLOTANTE DE TELEMETRÍA (BENTO ERP)
// ------------------------------------------------------------
window.gpsActualizarFichaFlotante = function(w) {
    var card = document.getElementById('gpsFloatingTelemetryCard');
    if (!card) return;

    var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
    var speed = (w.velocidad != null ? Number(w.velocidad) : 0) || 0;
    var isMoving = tienePos && speed > 3;
    var isIgn = Boolean(w.ignicion);
    var isRalenti = tienePos && speed <= 3 && isIgn;
    var course = (w.curso != null ? Number(w.curso) : 0) || 0;

    var setTxt = function(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setTxt('gps-card-placa', w.placa || '—');
    setTxt('gps-card-nombre', w.nombre_wialon || 'Unidad de Flota');
    setTxt('gps-card-km', (w.km || 0).toLocaleString() + ' km');
    setTxt('gps-card-horas', (w.horas || 0).toLocaleString() + ' hrs');
    setTxt('gps-card-tipo', w.tipo_vehiculo || 'UNIDAD');

    var empBadge = document.getElementById('gps-card-empresa-badge');
    if (empBadge) {
        empBadge.textContent = w.empresa ? (w.empresa.includes('TRAHESA') ? 'TRAHESA' : 'MARSISA') : 'MARSISA';
    }

    var voltEl = document.getElementById('gps-card-voltaje');
    if (voltEl) {
        var ignText = isIgn ? '<span class="text-success fw-bold">Motor ON</span>' : '<span class="text-secondary fw-semibold">Motor OFF</span>';
        var voltText = w.voltaje ? ` • ${w.voltaje} V` : '';
        voltEl.innerHTML = `${ignText}${voltText}`;
    }

    var satEl = document.getElementById('gps-card-satelites');
    if (satEl) {
        satEl.textContent = tienePos ? `${w.satelites || 0} sat • ${w.altitud || 0} msnm` : 'Sin satélites';
    }

    // Velocidad & Rumbo cardinal
    var velRumboEl = document.getElementById('gps-card-velocidad-rumbo');
    if (velRumboEl) {
        if (!tienePos) {
            velRumboEl.textContent = '0 km/h • Sin señal';
        } else {
            var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO', 'N'];
            var cardDir = dirs[Math.round((course % 360) / 45)] || '';
            velRumboEl.textContent = `${speed} km/h • ${cardDir} (${course}°)`;
        }
    }

    // Conductor
    var condEl = document.getElementById('gps-card-conductor');
    if (condEl) {
        condEl.textContent = w.conductor || w.conductor_asignado || w.nombre_wialon || 'Sin conductor asignado';
    }

    // Coordenadas badge
    var coordsBadge = document.getElementById('gps-card-coords-badge');
    if (coordsBadge) {
        coordsBadge.textContent = tienePos ? `${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}` : 'Wialon GPS';
    }

    // Dirección completa
    var dirEl = document.getElementById('gps-card-direccion');
    if (dirEl) {
        dirEl.innerHTML = tienePos 
            ? (w.ubicacion ? `<i class="bi bi-geo-alt-fill text-danger me-1"></i>${_gpsEsc(w.ubicacion)}` : `<i class="bi bi-geo-alt-fill text-danger me-1"></i>Coordenadas: ${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}`)
            : '<span class="text-secondary fw-normal">Dispositivo apagado o fuera de cobertura</span>';
    }

    var speedBadge = document.getElementById('gps-card-speed-badge');
    if (speedBadge) {
        if (!tienePos) {
            speedBadge.className = 'badge bg-secondary px-2 py-0.5 fw-bold rounded-2';
            speedBadge.innerHTML = 'Offline';
        } else if (isMoving) {
            speedBadge.className = 'badge bg-primary px-2 py-0.5 fw-bold rounded-2';
            speedBadge.innerHTML = `<i class="bi bi-speedometer2 me-1"></i>En Ruta: ${speed} km/h`;
        } else if (isRalenti) {
            speedBadge.className = 'badge bg-warning px-2 py-0.5 fw-bold rounded-2 text-dark';
            speedBadge.innerHTML = `<i class="bi bi-fire me-1"></i>Ralentí (Motor ON)`;
        } else {
            speedBadge.className = 'badge bg-success px-2 py-0.5 fw-bold rounded-2';
            speedBadge.innerHTML = `<i class="bi bi-pause-circle me-1"></i>Detenido (OFF)`;
        }
    }

    // Botones de Navegación Rápida Directa (Waze, Google Maps, WhatsApp)
    var btnWaze = document.getElementById('gps-card-btn-waze');
    if (btnWaze) {
        if (tienePos) {
            btnWaze.href = `https://waze.com/ul?ll=${w.lat},${w.lng}&navigate=yes`;
            btnWaze.style.display = 'inline-flex';
        } else {
            btnWaze.style.display = 'none';
        }
    }

    var btnGmaps = document.getElementById('gps-card-btn-gmaps');
    if (btnGmaps) {
        if (tienePos) {
            btnGmaps.href = `https://www.google.com/maps/dir/?api=1&destination=${w.lat},${w.lng}`;
            btnGmaps.style.display = 'inline-flex';
        } else {
            btnGmaps.style.display = 'none';
        }
    }

    var btnWa = document.getElementById('gps-card-btn-whatsapp');
    if (btnWa) {
        var safeNombre = (w.nombre_wialon || w.placa || '').replace(/'/g, "\\'");
        var safeUbicacion = (w.ubicacion || '').replace(/'/g, "\\'");
        btnWa.onclick = function() {
            window.compartirUbicacion(safeNombre, w.lat || 0, w.lng || 0, safeUbicacion, speed, w.voltaje, w.empresa);
        };
    }

    card.style.display = 'block';
};

// ------------------------------------------------------------
// CENTRAR Y VISTAS DE CÁMARA
// ------------------------------------------------------------
window.gpsVerTodaLaFlota = function() {
    if (!window._gpsMapInstance) return;
    var coords = [];
    window._datosWialonGPS.forEach(function(w) {
        if (w.lat && w.lat !== 0 && w.lng && w.lng !== 0) {
            coords.push([w.lat, w.lng]);
        }
    });
    if (coords.length > 0) {
        window._gpsMapInstance.fitBounds(coords, { padding: [40, 40], maxZoom: 14 });
    }
};

window.gpsCentrarSeleccion = function() {
    if (!window._placaGPSActiva || !window._gpsMapInstance) return;
    var w = window._datosWialonGPS.find(function(x) { return (x.placa || '') === window._placaGPSActiva; });
    if (w && w.lat && w.lng) {
        var offsetLat = (window.innerWidth <= 768) ? 0.0022 : 0;
        window._gpsMapInstance.flyTo([w.lat - offsetLat, w.lng], 16, { duration: 0.8 });
    }
};

window.gpsToggleExpandFicha = function(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    var card = document.getElementById('gpsFloatingTelemetryCard');
    if (!card) return;
    
    var icon = document.getElementById('iconGpsToggleExpand');
    if (card.classList.contains('is-expanded')) {
        card.classList.remove('is-expanded');
        if (icon) {
            icon.className = 'bi bi-arrows-expand text-secondary';
        }
    } else {
        card.classList.add('is-expanded');
        if (icon) {
            icon.className = 'bi bi-arrows-collapse text-primary';
        }
    }
};

window.gpsCerrarFichaSeleccionada = function() {
    window._placaGPSActiva = null;
    var card = document.getElementById('gpsFloatingTelemetryCard');
    if (card) {
        card.style.display = 'none';
        card.classList.remove('is-expanded');
    }

    var btnCentrar = document.getElementById('btnGpsCentrarSeleccion');
    if (btnCentrar) btnCentrar.style.display = 'none';

    document.querySelectorAll('.gps-unit-card').forEach(function(c) {
        c.classList.remove('active');
    });
};

// ------------------------------------------------------------
// ⏱️ MOTOR DE REPRODUCCIÓN / PLAYBACK DE RECORRIDO (HISTORIAL)
// ------------------------------------------------------------
window.gpsAbrirPlaybackDesdeFicha = function() {
    if (!window._placaGPSActiva) return;
    window.gpsCargarHistorial(24);
};

window.gpsCargarHistorial = function(horas) {
    var placa = window._placaGPSActiva;
    if (!placa) return;

    var unit = window._datosWialonGPS.find(function(x) { return (x.placa || '') === placa; });
    var unitId = unit ? unit.id : null;

    var playbackContainer = document.getElementById('gpsPlaybackContainer');
    var floatingCard = document.getElementById('gpsFloatingTelemetryCard');

    if (floatingCard) floatingCard.style.display = 'none';
    if (playbackContainer) playbackContainer.style.display = 'block';

    var placaEl = document.getElementById('gps-playback-placa');
    if (placaEl) placaEl.textContent = placa;

    var badgeRango = document.getElementById('gps-playback-rango-badge');
    if (badgeRango) badgeRango.textContent = `ÚLTIMAS ${horas} HORAS`;

    var subEl = document.getElementById('gps-playback-subtitulo');
    if (subEl) subEl.textContent = 'Cargando telemetría satelital...';

    // Desactivar temporalmente marcadores en vivo
    window._gpsPlaybackActive = true;
    window.gpsLimpiarCapasPlayback();

    fetch('/api/script/obtenerHistorialGPS', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [{ placa: placa, unitId: unitId, horas: horas }] })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        var data = (res && res.data) ? res.data : null;
        if (!data || !data.puntos || data.puntos.length === 0) {
            if (subEl) subEl.textContent = 'Sin historial de recorrido en el rango seleccionado.';
            return;
        }

        window._gpsPlaybackData = data;
        window._gpsPlaybackIndex = 0;
        window._gpsPlaybackPlaying = false;
        window._gpsPlaybackSpeed = 1;

        // Renderizar Métricas
        var m = data.metricas || {};
        var setTxt = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
        setTxt('gps-playback-km', (m.totalKm || 0) + ' km');
        setTxt('gps-playback-vmax', (m.maxSpeed || 0) + ' km/h');
        setTxt('gps-playback-vprom', (m.avgSpeed || 0) + ' km/h');
        setTxt('gps-playback-tiempo', (m.tiempoMovMin || 0) + 'm en ruta');
        setTxt('gps-playback-paradas', (m.paradasTotal || 0) + ' paradas');

        if (subEl) subEl.textContent = `${data.puntos.length} puntos satelitales procesados`;

        // Configurar Scrubber Slider
        var scrubber = document.getElementById('gpsPlaybackScrubber');
        if (scrubber) {
            scrubber.min = 0;
            scrubber.max = data.puntos.length - 1;
            scrubber.value = 0;
        }

        // Dibujar Trazo de Ruta y Marcadores en el Mapa Leaflet
        window.gpsDibujarTrazoPlayback(data);
    })
    .catch(function(err) {
        console.error("Error al cargar historial GPS:", err);
        if (subEl) subEl.textContent = 'Error al consultar historial: ' + err.message;
    });
};

window.gpsDibujarTrazoPlayback = function(data) {
    if (!window._gpsMapInstance || typeof L === 'undefined') return;
    var map = window._gpsMapInstance;

    window.gpsLimpiarCapasPlayback();

    var puntos = data.puntos || [];
    if (puntos.length === 0) return;

    var latLngs = puntos.map(function(p) { return [p.lat, p.lng]; });

    // Polyline de Ruta con Sombra y Color Cían Satelital
    window._gpsPlaybackTrackLayer = L.polyline(latLngs, {
        color: '#0284c7',
        weight: 5,
        opacity: 0.9,
        lineJoin: 'round'
    }).addTo(map);

    // Marcador Punto de Inicio (Bandera Verde)
    var startPt = puntos[0];
    var startIcon = L.divIcon({
        className: 'gps-start-marker',
        html: '<div style="background:#16a34a; color:#fff; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; font-size:0.8rem; border:2px solid #fff; box-shadow:0 3px 8px rgba(0,0,0,0.3);"><i class="bi bi-flag-fill"></i></div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
    });
    window._gpsPlaybackStartMarker = L.marker([startPt.lat, startPt.lng], { icon: startIcon })
        .bindPopup(`<strong>Inicio de Recorrido</strong><br>${new Date(startPt.tiempo * 1000).toLocaleTimeString()}`)
        .addTo(map);

    // Marcador Punto Final / Actual (Bandera a Cuadros)
    var endPt = puntos[puntos.length - 1];
    var endIcon = L.divIcon({
        className: 'gps-end-marker',
        html: '<div style="background:#0f172a; color:#fff; border-radius:50%; width:26px; height:26px; display:flex; align-items:center; justify-content:center; font-size:0.8rem; border:2px solid #fff; box-shadow:0 3px 8px rgba(0,0,0,0.3);"><i class="bi bi-geo-alt-fill"></i></div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
    });
    window._gpsPlaybackEndMarker = L.marker([endPt.lat, endPt.lng], { icon: endIcon })
        .bindPopup(`<strong>Fin de Recorrido</strong><br>${new Date(endPt.tiempo * 1000).toLocaleTimeString()}`)
        .addTo(map);

    // Marcadores de Paradas (Pines Naranjas 🛑)
    window._gpsPlaybackStopMarkers = [];
    (data.paradas || []).forEach(function(s, idx) {
        var stopIcon = L.divIcon({
            className: 'gps-stop-marker',
            html: `<div class="gps-stop-pin" title="Parada de ${s.durMin} min"><i class="bi bi-pause-fill"></i></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        var stopM = L.marker([s.lat, s.lng], { icon: stopIcon })
            .bindPopup(`<strong>Parada #${idx+1}</strong><br>Duración: <strong>${s.durMin} minutos</strong><br>Desde: ${new Date(s.startT * 1000).toLocaleTimeString()}<br>Hasta: ${new Date(s.endT * 1000).toLocaleTimeString()}`)
            .addTo(map);
        window._gpsPlaybackStopMarkers.push(stopM);
    });

    // Marcadores de Excesos de Velocidad (Pines Rojos ⚠️ >80 km/h)
    window._gpsPlaybackOverspeedMarkers = [];
    (data.excesos || []).forEach(function(e) {
        var overIcon = L.divIcon({
            className: 'gps-overspeed-marker',
            html: `<div class="gps-overspeed-pin" title="Exceso: ${e.velocidad} km/h"><i class="bi bi-exclamation-triangle-fill"></i></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        var overM = L.marker([e.lat, e.lng], { icon: overIcon })
            .bindPopup(`<strong class="text-danger">⚠️ Exceso de Velocidad</strong><br>Velocidad: <strong>${e.velocidad} km/h</strong><br>Hora: ${new Date(e.tiempo * 1000).toLocaleTimeString()}`)
            .addTo(map);
        window._gpsPlaybackOverspeedMarkers.push(overM);
    });

    // Marcador Móvil del Camión para Playback
    var customTruck = window.gpsGenerarIconoCamion({ placa: data.placa, ignicion: 1 }, false, 0, startPt.curso || 0);
    window._gpsPlaybackMarker = L.marker([startPt.lat, startPt.lng], { icon: customTruck, zIndexOffset: 2000 }).addTo(map);

    // Ajustar zoom a toda la ruta
    map.fitBounds(latLngs, { padding: [50, 50] });

    // Actualizar HUD en punto 0
    window.gpsActualizarPuntoPlayback(0);
};

window.gpsLimpiarCapasPlayback = function() {
    if (!window._gpsMapInstance) return;
    var map = window._gpsMapInstance;

    if (window._gpsPlaybackTrackLayer) { map.removeLayer(window._gpsPlaybackTrackLayer); window._gpsPlaybackTrackLayer = null; }
    if (window._gpsPlaybackMarker) { map.removeLayer(window._gpsPlaybackMarker); window._gpsPlaybackMarker = null; }
    if (window._gpsPlaybackStartMarker) { map.removeLayer(window._gpsPlaybackStartMarker); window._gpsPlaybackStartMarker = null; }
    if (window._gpsPlaybackEndMarker) { map.removeLayer(window._gpsPlaybackEndMarker); window._gpsPlaybackEndMarker = null; }

    (window._gpsPlaybackStopMarkers || []).forEach(function(m) { map.removeLayer(m); });
    window._gpsPlaybackStopMarkers = [];

    (window._gpsPlaybackOverspeedMarkers || []).forEach(function(m) { map.removeLayer(m); });
    window._gpsPlaybackOverspeedMarkers = [];
};

window.gpsActualizarPuntoPlayback = function(index) {
    if (!window._gpsPlaybackData || !window._gpsPlaybackData.puntos) return;
    var puntos = window._gpsPlaybackData.puntos;
    var p = puntos[index];
    if (!p) return;

    window._gpsPlaybackIndex = index;

    // Actualizar Scrubber Slider
    var scrubber = document.getElementById('gpsPlaybackScrubber');
    if (scrubber && Number(scrubber.value) !== index) {
        scrubber.value = index;
    }

    // Actualizar HUD de hora y velocidad
    var dateObj = new Date(p.tiempo * 1000);
    var timeStr = dateObj.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit' }) + ' ' + dateObj.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    var timeLabel = document.getElementById('gps-playback-time-label');
    if (timeLabel) timeLabel.textContent = timeStr;

    var speedLabel = document.getElementById('gps-playback-point-speed');
    if (speedLabel) {
        var isMoving = p.velocidad > 3;
        var ignText = p.ignicion ? 'ON' : 'OFF';
        speedLabel.innerHTML = `⚡ <strong>${p.velocidad} km/h</strong> • 🔑 Ignición: <strong>${ignText}</strong> • 🏔️ ${p.altitud || 0} m`;
    }

    // Mover Camión
    if (window._gpsPlaybackMarker && window._gpsMapInstance) {
        window._gpsPlaybackMarker.setLatLng([p.lat, p.lng]);
        var icon = window.gpsGenerarIconoCamion({ placa: window._gpsPlaybackData.placa, ignicion: p.ignicion }, p.velocidad > 3, p.velocidad, p.curso || 0);
        window._gpsPlaybackMarker.setIcon(icon);
    }
};

window.gpsTogglePlayPause = function() {
    if (!window._gpsPlaybackData || !window._gpsPlaybackData.puntos) return;
    
    window._gpsPlaybackPlaying = !window._gpsPlaybackPlaying;
    var icon = document.getElementById('iconGpsPlayPause');
    if (icon) {
        icon.className = window._gpsPlaybackPlaying ? 'bi bi-pause-fill fs-5' : 'bi bi-play-fill fs-5';
    }

    if (window._gpsPlaybackPlaying) {
        window.gpsIniciarTimerPlayback();
    } else {
        if (window._gpsPlaybackTimer) {
            clearInterval(window._gpsPlaybackTimer);
            window._gpsPlaybackTimer = null;
        }
    }
};

window.gpsIniciarTimerPlayback = function() {
    if (window._gpsPlaybackTimer) clearInterval(window._gpsPlaybackTimer);

    var stepMs = Math.max(20, Math.round(300 / (window._gpsPlaybackSpeed || 1)));

    window._gpsPlaybackTimer = setInterval(function() {
        if (!window._gpsPlaybackPlaying || !window._gpsPlaybackData) return;

        var puntos = window._gpsPlaybackData.puntos;
        if (window._gpsPlaybackIndex >= puntos.length - 1) {
            // Llegó al final del playback
            window.gpsTogglePlayPause();
            return;
        }

        window._gpsPlaybackIndex++;
        window.gpsActualizarPuntoPlayback(window._gpsPlaybackIndex);
    }, stepMs);
};

window.gpsSetVelocidadPlayback = function(speed) {
    window._gpsPlaybackSpeed = speed;
    ['btnSpeed1x', 'btnSpeed2x', 'btnSpeed5x', 'btnSpeed10x'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('active', 'btn-light');
    });
    var activeBtn = document.getElementById('btnSpeed' + speed + 'x');
    if (activeBtn) activeBtn.classList.add('active', 'btn-light');

    if (window._gpsPlaybackPlaying) {
        window.gpsIniciarTimerPlayback();
    }
};

window.gpsSeekPlayback = function(val) {
    var idx = parseInt(val, 10);
    window.gpsActualizarPuntoPlayback(idx);
};

window.gpsReiniciarPlayback = function() {
    window.gpsActualizarPuntoPlayback(0);
};

window.gpsSalirPlayback = function() {
    window._gpsPlaybackActive = false;
    window._gpsPlaybackPlaying = false;
    if (window._gpsPlaybackTimer) {
        clearInterval(window._gpsPlaybackTimer);
        window._gpsPlaybackTimer = null;
    }

    window.gpsLimpiarCapasPlayback();

    var playbackContainer = document.getElementById('gpsPlaybackContainer');
    if (playbackContainer) playbackContainer.style.display = 'none';

    // Restaurar Ficha Flotante y marcadores en vivo
    if (window._placaGPSActiva) {
        var w = window._datosWialonGPS.find(function(x) { return (x.placa || '') === window._placaGPSActiva; });
        if (w) window.gpsActualizarFichaFlotante(w);
    }
    window.gpsActualizarMarcadoresMapa(window._datosWialonGPS);
};

// ------------------------------------------------------------
// OFFCANVAS MÓVIL (COMPLETO PARA SMARTPHONES)
// ------------------------------------------------------------
window.gpsAbrirDetalleMovil = function(w) {
    var titleEl = document.getElementById('gpsDetalleOffcanvasTitle');
    var subtitleEl = document.getElementById('gpsDetalleOffcanvasSubtitle');
    var bodyEl = document.getElementById('gpsDetalleOffcanvasBody');
    if (titleEl) titleEl.textContent = w.placa || '—';
    if (subtitleEl) subtitleEl.textContent = `${w.empresa || 'MARSISA S.A.C.'} • ${w.tipo_vehiculo || 'TRACTO'}`;

    var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
    var speed = (w.velocidad != null ? Number(w.velocidad) : 0) || 0;
    var isMoving = tienePos && speed > 3;
    var isIgn = Boolean(w.ignicion);
    var isRal = tienePos && speed <= 3 && isIgn;

    var safeNombre = (w.nombre_wialon || w.placa || '').replace(/'/g, "\\'");
    var safeUbicacion = (w.ubicacion || '').replace(/'/g, "\\'");
    var safePlaca = (w.placa || '').replace(/'/g, "\\'");

    var content = `
        <div class="d-flex align-items-center justify-content-between mb-3">
            <span class="badge ${tienePos ? (isMoving ? 'bg-primary' : (isRal ? 'bg-warning text-dark' : 'bg-success')) : 'bg-secondary'} px-3 py-2 fw-bold" style="font-size:0.8rem;">
                ${tienePos ? (isMoving ? `<i class="bi bi-speedometer2 me-1"></i>En Ruta: ${speed} km/h` : (isRal ? '<i class="bi bi-fire me-1"></i>Ralentí (Motor ON)' : '<i class="bi bi-pause-circle me-1"></i>Detenido')) : 'Sin Señal'}
            </span>
            <button class="btn btn-primary btn-sm fw-bold px-3 py-2 rounded-3 shadow-2xs d-flex align-items-center gap-1" onclick="bootstrap.Offcanvas.getInstance(document.getElementById('gpsDetalleOffcanvas')).hide(); window.abrirDetalleGPS('${safePlaca}'); window.gpsAbrirPlaybackDesdeFicha();">
                <i class="bi bi-clock-history"></i> Historial / Playback
            </button>
        </div>

        <div class="row g-2 mb-3">
            <div class="col-6">
                <div class="p-3 bg-light rounded-3 border">
                    <span class="small text-secondary d-block fw-bold text-uppercase" style="font-size:0.65rem;">Odómetro</span>
                    <h5 class="fw-bold m-0 text-dark font-monospace">${(w.km || 0).toLocaleString()} km</h5>
                </div>
            </div>
            <div class="col-6">
                <div class="p-3 bg-light rounded-3 border">
                    <span class="small text-secondary d-block fw-bold text-uppercase" style="font-size:0.65rem;">Horómetro</span>
                    <h5 class="fw-bold m-0 text-dark font-monospace">${(w.horas || 0).toLocaleString()} hrs</h5>
                </div>
            </div>
            <div class="col-6">
                <div class="p-3 bg-light rounded-3 border">
                    <span class="small text-secondary d-block fw-bold text-uppercase" style="font-size:0.65rem;">Batería / Ignición</span>
                    <h6 class="fw-bold m-0 text-dark font-monospace">${isIgn ? '🟢 Motor ON' : '⚪ Motor OFF'} ${w.voltaje ? `• ${w.voltaje}V` : ''}</h6>
                </div>
            </div>
            <div class="col-6">
                <div class="p-3 bg-light rounded-3 border">
                    <span class="small text-secondary d-block fw-bold text-uppercase" style="font-size:0.65rem;">Satélites</span>
                    <h6 class="fw-bold m-0 text-dark font-monospace">${w.satelites || 0} sat • ${w.altitud || 0} m</h6>
                </div>
            </div>
        </div>

        <div class="p-3 bg-light rounded-3 border mb-3">
            <span class="small text-secondary d-block fw-bold text-uppercase mb-1" style="font-size:0.65rem;">Dirección Satelital</span>
            <div class="small fw-bold text-dark">
                ${tienePos ? (w.ubicacion ? `<i class="bi bi-geo-alt-fill text-danger me-1"></i>${_gpsEsc(w.ubicacion)}` : `${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}`) : 'Sin señal'}
            </div>
        </div>

        <!-- Botones de Navegación Móvil Directa -->
        ${tienePos ? `
        <div class="d-flex flex-column gap-2 mb-2">
            <div class="d-flex align-items-center gap-2">
                <a href="https://waze.com/ul?ll=${w.lat},${w.lng}&navigate=yes" target="_blank" class="btn btn-outline-success flex-grow-1 py-2 fw-bold rounded-3 d-flex align-items-center justify-content-center gap-1">
                    <i class="bi bi-cursor-fill"></i> Navegar en Waze
                </a>
                <a href="https://www.google.com/maps/dir/?api=1&destination=${w.lat},${w.lng}" target="_blank" class="btn btn-outline-primary flex-grow-1 py-2 fw-bold rounded-3 d-flex align-items-center justify-content-center gap-1">
                    <i class="bi bi-geo-alt-fill"></i> Google Maps
                </a>
            </div>
            <button class="btn btn-success w-100 py-2 fw-bold rounded-3 d-flex align-items-center justify-content-center gap-1" onclick="window.compartirUbicacion('${safeNombre}', ${w.lat}, ${w.lng}, '${safeUbicacion}', ${speed}, '${w.voltaje || ''}', '${_gpsEsc(w.empresa || '')}')">
                <i class="bi bi-whatsapp"></i> Compartir Ubicación por WhatsApp
            </button>
        </div>` : ''}
    `;

    if (bodyEl) bodyEl.innerHTML = content;
    var oc = document.getElementById('gpsDetalleOffcanvas');
    if (oc && typeof bootstrap !== 'undefined' && bootstrap.Offcanvas) {
        bootstrap.Offcanvas.getOrCreateInstance(oc).show();
    }
};

// ------------------------------------------------------------
// COMPARTIR UBICACIÓN FORMATEADA POR WHATSAPP
// ------------------------------------------------------------
window.compartirUbicacion = function(nombre, lat, lng, dir, speed, volt, empresa) {
    var mapsUrl = `https://maps.google.com/maps?q=${lat},${lng}`;
    var wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    var dirTxt = dir ? `\n📍 *Ubicación:* ${dir}` : '';
    var speedTxt = speed > 3 ? `\n⚡ *Velocidad:* ${speed} km/h` : `\n⏸ *Estado:* Detenido`;
    var empTxt = empresa ? `\n🏢 *Empresa:* ${empresa}` : '';
    var voltTxt = volt ? `\n🔋 *Batería:* ${volt} V` : '';

    var texto = `🏢 *[${empresa || 'MARSISA S.A.C.'}]*\n📍 *MONITOREO GPS EN VIVO*\n\n🚛 *Unidad:* ${nombre}${empTxt}${speedTxt}${voltTxt}${dirTxt}\n🌐 *Coordenadas:* ${lat.toFixed(5)}, ${lng.toFixed(5)}\n\n👉 *Ver en Google Maps:* ${mapsUrl}\n👉 *Navegar en Waze:* ${wazeUrl}`;
    var wUrl = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(wUrl, '_blank');
};
