// ============================================================
// 📍 MÓDULO GPS FLOTA — Centro de Monitoreo Satelital en Vivo (Wialon)
// ============================================================

window._datosWialonGPS       = window._datosWialonGPS       || [];
window._filtroGPSActivo      = window._filtroGPSActivo      || '';
window._segmentoGPSActivo    = window._segmentoGPSActivo    || 'total';
window._placaGPSActiva       = window._placaGPSActiva       || null;

window._gpsMapInstance       = null;
window._gpsMarkersMap        = {}; // { PLACA: L.marker }
window._gpsMapLayers         = {};
window._gpsCurrentLayerType  = 'calle';
window._intervalGpsLivePolling = null;
window._intervalCountdown      = null;
window._gpsCountdownSecs       = 8;
window._gpsFirstBoundsFitted   = false;

const _dispEsc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'));

// ------------------------------------------------------------
// INIT — llamado por el router SPA
// ------------------------------------------------------------
window.init_ubicacion = function() {
    if (!window.checkPerm('gps', 'l')) {
        var wrap = document.getElementById('moduloUbicacionGPS') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }

    window._placaGPSActiva = null;
    window._gpsFirstBoundsFitted = false;

    // Limpiar temporizadores previos
    if (window._intervalGpsLivePolling) {
        clearInterval(window._intervalGpsLivePolling);
        window._intervalGpsLivePolling = null;
    }
    if (window._intervalCountdown) {
        clearInterval(window._intervalCountdown);
        window._intervalCountdown = null;
    }

    // 1. Cargar biblioteca Leaflet y crear mapa interactivo
    var leafletPromise = (typeof L !== 'undefined') ? Promise.resolve() : (window.loadLeaflet ? window.loadLeaflet() : Promise.resolve());

    leafletPromise.then(function() {
        window.gpsInitMap();

        // 2. Usar datos en caché de Wialon si existen
        var datos = (typeof CACHE !== 'undefined' && Array.isArray(CACHE.wialon) && CACHE.wialon.length > 0)
            ? CACHE.wialon : [];

        if (datos.length > 0) {
            window.renderListaUnidadesGPS(datos);
        }

        // 3. Disparar consulta fresca en vivo inmediata
        window._actualizarGpsEnVivo(true);

        // 4. Iniciar ciclo de polling en vivo cada 8 segundos
        window.gpsIniciarCicloPolling();
    }).catch(function(err) {
        console.error("Error al inicializar Leaflet en GPS:", err);
    });
};

// ------------------------------------------------------------
// INICIALIZAR MAPA LEAFLET
// ------------------------------------------------------------
window.gpsInitMap = function() {
    var mapContainer = document.getElementById('gpsFleetMap');
    if (!mapContainer || typeof L === 'undefined') return;

    // Si ya existe instancia previa vinculada al contenedor, removerla limpiamente
    if (window._gpsMapInstance) {
        try {
            window._gpsMapInstance.remove();
        } catch(e) {}
        window._gpsMapInstance = null;
    }
    window._gpsMarkersMap = {};

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

    // Crear mapa centrado en Perú
    var map = L.map('gpsFleetMap', {
        center: [-9.19, -75.015],
        zoom: 6,
        zoomControl: true,
        attributionControl: false,
        layers: [window._gpsCurrentLayerType === 'satelite' ? googleSatLayer : osmLayer]
    });

    // Mover control de zoom a esquina inferior derecha
    map.zoomControl.setPosition('bottomright');

    window._gpsMapInstance = map;

    // Forzar recalculo de dimensiones tras render
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

        if (btnSat) { btnSat.className = 'btn btn-sm btn-primary py-1 px-2 fw-bold'; }
        if (btnStreet) { btnStreet.className = 'btn btn-sm btn-light py-1 px-2 fw-bold text-secondary'; }
    } else {
        if (window._gpsMapInstance.hasLayer(window._gpsMapLayers.satelite)) {
            window._gpsMapInstance.removeLayer(window._gpsMapLayers.satelite);
        }
        window._gpsMapLayers.calle.addTo(window._gpsMapInstance);

        if (btnStreet) { btnStreet.className = 'btn btn-sm btn-primary py-1 px-2 fw-bold'; }
        if (btnSat) { btnSat.className = 'btn btn-sm btn-light py-1 px-2 fw-bold text-secondary'; }
    }
};

// ------------------------------------------------------------
// POLLING EN VIVO CADA 8 SEGUNDOS
// ------------------------------------------------------------
window.gpsIniciarCicloPolling = function() {
    window._gpsCountdownSecs = 8;
    
    // Timer para actualizar contador visual en badge
    window._intervalCountdown = setInterval(function() {
        var modEl = document.getElementById('moduloUbicacionGPS');
        if (!modEl || modEl.offsetParent === null) {
            clearInterval(window._intervalCountdown);
            clearInterval(window._intervalGpsLivePolling);
            window._intervalCountdown = null;
            window._intervalGpsLivePolling = null;
            return;
        }

        window._gpsCountdownSecs--;
        if (window._gpsCountdownSecs <= 0) window._gpsCountdownSecs = 8;
        var el = document.getElementById('gps-timer-countdown');
        if (el) el.textContent = window._gpsCountdownSecs + 's';
    }, 1000);

    // Timer de petición fetch
    window._intervalGpsLivePolling = setInterval(function() {
        var modEl = document.getElementById('moduloUbicacionGPS');
        if (!modEl || modEl.offsetParent === null) {
            clearInterval(window._intervalGpsLivePolling);
            window._intervalGpsLivePolling = null;
            return;
        }
        window._actualizarGpsEnVivo(false);
    }, 8000);
};

// ------------------------------------------------------------
// PETICIÓN Y ACTUALIZACIÓN EN VIVO (SIN PARPADEO)
// ------------------------------------------------------------
window._actualizarGpsEnVivo = function(forzar) {
    window._gpsCountdownSecs = 8;
    var elCount = document.getElementById('gps-timer-countdown');
    if (elCount) elCount.textContent = '8s';

    fetch('/api/script/obtenerDatosWialon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] })
    })
    .then(function(r) { return r.json(); })
    .then(function(r) {
        var d = (r && r.data && Array.isArray(r.data)) ? r.data : [];
        if (d.length > 0) {
            if (typeof CACHE !== 'undefined') CACHE.wialon = d;
            window.renderListaUnidadesGPS(d);
            window.gpsActualizarMarcadoresMapa(d);
        }
    })
    .catch(function(err) {
        console.warn("Aviso polling GPS:", err);
    });
};

// ------------------------------------------------------------
// RENDER LISTA UNIDADES (panel izquierdo) Y KPIS
// ------------------------------------------------------------
window.renderListaUnidadesGPS = function(datos) {
    window._datosWialonGPS = datos || [];

    // Calcular KPIs
    var total = datos.length;
    var online = 0;
    var movimiento = 0;
    var offline = 0;

    datos.forEach(function(w) {
        var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
        var speed = (w.velocidad != null ? Number(w.velocidad) : (w.pos && w.pos.s != null ? Number(w.pos.s) : 0)) || 0;
        
        if (tienePos) {
            online++;
            if (speed > 3) movimiento++;
        } else {
            offline++;
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

    filtrarListaGPS(window._filtroGPSActivo || '');
};

// ------------------------------------------------------------
// FILTRADO SEGMENTADO & BÚSQUEDA
// ------------------------------------------------------------
window.filtrarSegmentoGPS = function(tipo, btn) {
    window._segmentoGPSActivo = tipo || 'total';

    document.querySelectorAll('#btn-group-gps-filtros .ck-segment-item').forEach(function(el) {
        el.classList.toggle('active', el.getAttribute('data-filter') === window._segmentoGPSActivo);
    });
    document.querySelectorAll('#moduloUbicacionGPS .ck-kpi-card').forEach(function(el) {
        el.classList.toggle('active', el.id === 'gps-kpi-' + window._segmentoGPSActivo);
    });

    filtrarListaGPS(window._filtroGPSActivo || '');
};

window.filtrarListaGPS = function(query) {
    window._filtroGPSActivo = query;
    var lista = document.getElementById('listaUnidadesGPS');
    if (!lista) return;

    var datos = window._datosWialonGPS;
    if (!datos || datos.length === 0) {
        lista.innerHTML = '<div class="text-center py-5 text-muted" style="font-size:0.85rem;">No hay datos GPS disponibles.</div>';
        return;
    }

    var q = (query || '').trim().toUpperCase();
    var filtrados = datos.filter(function(w) {
        var matchText = !q || (w.placa || '').toUpperCase().includes(q) || (w.nombre_wialon || '').toUpperCase().includes(q);
        var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
        var speed = (w.velocidad != null ? Number(w.velocidad) : (w.pos && w.pos.s != null ? Number(w.pos.s) : 0)) || 0;

        var matchSeg = true;
        if (window._segmentoGPSActivo === 'online') matchSeg = tienePos;
        else if (window._segmentoGPSActivo === 'movimiento') matchSeg = (tienePos && speed > 3);
        else if (window._segmentoGPSActivo === 'offline') matchSeg = !tienePos;

        return matchText && matchSeg;
    });

    if (filtrados.length === 0) {
        lista.innerHTML = '<div class="text-center py-5 text-muted" style="font-size:0.85rem;">Sin resultados.</div>';
        return;
    }

    lista.innerHTML = filtrados.map(function(w) {
        var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
        var speed = (w.velocidad != null ? Number(w.velocidad) : (w.pos && w.pos.s != null ? Number(w.pos.s) : 0)) || 0;
        var isMoving = tienePos && speed > 3;

        var dotColor = tienePos ? (isMoving ? '#0284c7' : '#10b981') : '#94a3b8';
        var statusBadge = tienePos 
            ? (isMoving ? '<span class="badge bg-primary-subtle text-primary border border-primary-subtle fw-bold" style="font-size:0.65rem; border-radius:6px;"><i class="bi bi-speedometer2 me-1"></i>' + speed + ' km/h</span>' 
                        : '<span class="badge bg-success-subtle text-success border border-success-subtle fw-bold" style="font-size:0.65rem; border-radius:6px;"><i class="bi bi-pause-circle me-1"></i>Detenido</span>')
            : '<span class="badge bg-light text-secondary border" style="font-size:0.65rem; border-radius:6px;">Sin Señal</span>';

        var isActive = window._placaGPSActiva === (w.placa || '');
        var safePlc = (w.placa || '').replace(/'/g, "\\'");
        var dirTextLista = w.ubicacion || w.nombre_wialon || '';

        return `
        <div class="gps-unit-card${isActive ? ' active' : ''}" id="gps-list-card-${w.placa || ''}" onclick="window.abrirDetalleGPS('${safePlc}')">
            <div class="d-flex align-items-center gap-2" style="min-width: 0; flex: 1;">
                <div style="width: 9px; height: 9px; border-radius: 50%; background: ${dotColor}; flex-shrink: 0;"></div>
                <div style="min-width: 0; flex: 1;">
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <span class="gps-unit-plate">${w.placa || '—'}</span>
                        ${statusBadge}
                    </div>
                    <div class="gps-unit-model text-truncate" title="${_dispEsc(dirTextLista)}" style="max-width: 200px; font-size: 0.72rem;">
                        ${w.ubicacion ? `<i class="bi bi-geo-alt-fill text-danger me-1"></i>${_dispEsc(w.ubicacion)}` : _dispEsc(w.nombre_wialon || '')}
                    </div>
                </div>
            </div>
            <div class="text-end" style="flex-shrink: 0;">
                <div class="gps-unit-stat text-primary fw-bold" style="font-size:0.75rem;">${(w.km || 0).toLocaleString()} km</div>
                <div class="gps-unit-stat text-secondary" style="font-size:0.68rem;">${(w.horas || 0).toLocaleString()} hrs</div>
            </div>
        </div>`;
    }).join('');
};

// ------------------------------------------------------------
// GESTIÓN DE MARCADORES EN VIVO EN EL MAPA LEAFLET
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
            // Si la unidad no tiene coordenadas pero tenía marcador previo, retirarlo
            if (window._gpsMarkersMap[placa]) {
                map.removeLayer(window._gpsMarkersMap[placa]);
                delete window._gpsMarkersMap[placa];
            }
            return;
        }

        var latLng = [w.lat, w.lng];
        validCoords.push(latLng);

        var speed = (w.velocidad != null ? Number(w.velocidad) : (w.pos && w.pos.s != null ? Number(w.pos.s) : 0)) || 0;
        var isMoving = speed > 3;
        var statusClass = isMoving ? 'moving' : 'stopped';
        var speedBadgeHTML = isMoving ? `<span class="wialon-speed-tag">${speed}k</span>` : '';

        var htmlPin = `
            <div class="wialon-truck-pin ${statusClass}" title="${_dispEsc(w.placa)} - ${isMoving ? speed + ' km/h' : 'Detenido'}">
                <div class="wialon-truck-icon-circle">
                    <i class="bi bi-truck"></i>
                </div>
                <span>${_dispEsc(w.placa)}</span>
                ${speedBadgeHTML}
            </div>
        `;

        var customIcon = L.divIcon({
            className: 'wialon-truck-marker',
            html: htmlPin,
            iconSize: [85, 30],
            iconAnchor: [42, 15]
        });

        // Contenido del Popup al hacer clic
        var safeNombre = (w.nombre_wialon || w.placa || '').replace(/'/g, "\\'");
        var safePlaca = (w.placa || '').replace(/'/g, "\\'");
        var safeUbicacion = (w.ubicacion || '').replace(/'/g, "\\'");

        var popupHTML = `
            <div style="font-family:'Plus Jakarta Sans',sans-serif; min-width:210px; padding:4px;">
                <div class="d-flex align-items-center justify-content-between gap-2 border-bottom pb-1 mb-2">
                    <div class="d-flex align-items-center gap-2">
                        <strong style="font-size:0.95rem; color:#0f172a;">${_dispEsc(w.placa)}</strong>
                        <span class="badge ${isMoving ? 'bg-primary' : 'bg-success'}" style="font-size:0.65rem;">
                            ${isMoving ? speed + ' km/h' : 'Detenido'}
                        </span>
                    </div>
                </div>
                <div class="small text-secondary mb-1">
                    <i class="bi bi-speedometer text-primary me-1"></i> Odómetro: <strong>${(w.km || 0).toLocaleString()} km</strong>
                </div>
                <div class="small text-secondary mb-1">
                    <i class="bi bi-clock-history text-warning me-1"></i> Horómetro: <strong>${(w.horas || 0).toLocaleString()} hrs</strong>
                </div>
                ${w.ubicacion ? `<div class="small text-dark mt-2 mb-2 p-1 bg-light rounded" style="font-size:0.73rem; line-height:1.2;">
                    <i class="bi bi-geo-alt-fill text-danger me-1"></i>${_dispEsc(w.ubicacion)}
                </div>` : ''}
                <div class="d-flex gap-1 mt-2">
                    <button class="btn btn-xs btn-primary w-100 py-1 fw-bold" style="font-size:0.75rem; border-radius:6px;" onclick="window.abrirDetalleGPS('${safePlaca}')">
                        <i class="bi bi-info-circle me-1"></i> Ver Ficha
                    </button>
                    <button class="btn btn-xs btn-success py-1 px-2" style="font-size:0.75rem; border-radius:6px;" title="Compartir WhatsApp" onclick="window.compartirUbicacion('${safeNombre}', ${w.lat}, ${w.lng}, '${safeUbicacion}')">
                        <i class="bi bi-whatsapp"></i>
                    </button>
                </div>
            </div>
        `;

        if (window._gpsMarkersMap[placa]) {
            // Actualizar marcador existente suavemente
            var marker = window._gpsMarkersMap[placa];
            marker.setLatLng(latLng);
            marker.setIcon(customIcon);
            marker.setPopupContent(popupHTML);
        } else {
            // Crear nuevo marcador
            var newMarker = L.marker(latLng, { icon: customIcon }).addTo(map);
            newMarker.bindPopup(popupHTML);
            newMarker.on('click', function() {
                window.abrirDetalleGPS(placa);
            });
            window._gpsMarkersMap[placa] = newMarker;
        }
    });

    // Ajustar vista a toda la flota en la primera carga
    if (!window._gpsFirstBoundsFitted && validCoords.length > 0) {
        window._gpsFirstBoundsFitted = true;
        try {
            map.fitBounds(validCoords, { padding: [40, 40], maxZoom: 14 });
        } catch(e) {}
    }

    // Si hay una unidad seleccionada, actualizar su telemetría en tiempo real
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

    // Resaltar en la lista lateral
    document.querySelectorAll('.gps-unit-card').forEach(function(card) {
        card.classList.remove('active');
    });
    var activeCard = document.getElementById('gps-list-card-' + placa);
    if (activeCard) {
        activeCard.classList.add('active');
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Mostrar botón de centrar selección en barra superior
    var btnCentrar = document.getElementById('btnGpsCentrarSeleccion');
    if (btnCentrar) btnCentrar.style.display = 'inline-flex';

    var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;

    // Si tiene coordenadas y el mapa está listo, viajar a la posición del camión
    if (tienePos && window._gpsMapInstance) {
        window._gpsMapInstance.flyTo([w.lat, w.lng], 15, {
            duration: 1.0,
            easeLinearity: 0.25
        });

        if (window._gpsMarkersMap[placa]) {
            setTimeout(function() {
                window._gpsMarkersMap[placa].openPopup();
            }, 500);
        }
    }

    // Actualizar Ficha Bento Flotante
    window.gpsActualizarFichaFlotante(w);

    // En móvil (<768px), mostrar en el Offcanvas inferior
    if (window.innerWidth < 768) {
        window.gpsAbrirDetalleMovil(w);
    }
};

// ------------------------------------------------------------
// ACTUALIZAR FICHA FLOTANTE DE TELEMETRÍA
// ------------------------------------------------------------
window.gpsActualizarFichaFlotante = function(w) {
    var card = document.getElementById('gpsFloatingTelemetryCard');
    if (!card) return;

    var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
    var speed = (w.velocidad != null ? Number(w.velocidad) : (w.pos && w.pos.s != null ? Number(w.pos.s) : 0)) || 0;
    var isMoving = tienePos && speed > 3;

    var setTxt = function(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setTxt('gps-card-placa', w.placa || '—');
    setTxt('gps-card-nombre', w.nombre_wialon || 'Unidad de Flota');
    setTxt('gps-card-km', (w.km || 0).toLocaleString() + ' km');
    setTxt('gps-card-horas', (w.horas || 0).toLocaleString() + ' hrs');
    setTxt('gps-card-coords', tienePos ? (w.lat.toFixed(5) + ', ' + w.lng.toFixed(5)) : 'Sin señal');
    
    var dirEl = document.getElementById('gps-card-direccion');
    if (dirEl) {
        dirEl.innerHTML = tienePos 
            ? (w.ubicacion ? `<i class="bi bi-geo-alt-fill text-danger me-1"></i>${_dispEsc(w.ubicacion)}` : `${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}`)
            : '<span class="text-secondary fw-normal">Dispositivo apagado o fuera de cobertura</span>';
    }

    var speedBadge = document.getElementById('gps-card-speed-badge');
    if (speedBadge) {
        if (!tienePos) {
            speedBadge.className = 'badge bg-secondary px-2 py-1 fw-bold rounded-2';
            speedBadge.innerHTML = 'Offline';
        } else if (isMoving) {
            speedBadge.className = 'badge bg-primary px-2 py-1 fw-bold rounded-2';
            speedBadge.innerHTML = `<i class="bi bi-speedometer2 me-1"></i>En Ruta: ${speed} km/h`;
        } else {
            speedBadge.className = 'badge bg-success px-2 py-1 fw-bold rounded-2';
            speedBadge.innerHTML = `<i class="bi bi-pause-circle me-1"></i>Detenido`;
        }
    }

    // Botón WhatsApp
    var btnWa = document.getElementById('gps-card-btn-whatsapp');
    if (btnWa) {
        var safeNombre = (w.nombre_wialon || w.placa || '').replace(/'/g, "\\'");
        var safeUbicacion = (w.ubicacion || '').replace(/'/g, "\\'");
        btnWa.onclick = function() {
            window.compartirUbicacion(safeNombre, w.lat || 0, w.lng || 0, safeUbicacion);
        };
    }

    // Botón Google Maps
    var btnGmaps = document.getElementById('gps-card-btn-gmaps');
    if (btnGmaps) {
        if (tienePos) {
            btnGmaps.href = `https://maps.google.com/maps?q=${w.lat},${w.lng}`;
            btnGmaps.style.display = 'inline-flex';
        } else {
            btnGmaps.style.display = 'none';
        }
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
        window._gpsMapInstance.flyTo([w.lat, w.lng], 16, { duration: 0.8 });
    }
};

window.gpsCerrarFichaSeleccionada = function() {
    window._placaGPSActiva = null;
    var card = document.getElementById('gpsFloatingTelemetryCard');
    if (card) card.style.display = 'none';

    var btnCentrar = document.getElementById('btnGpsCentrarSeleccion');
    if (btnCentrar) btnCentrar.style.display = 'none';

    document.querySelectorAll('.gps-unit-card').forEach(function(c) {
        c.classList.remove('active');
    });
};

// ------------------------------------------------------------
// OFFCANVAS MÓVIL
// ------------------------------------------------------------
window.gpsAbrirDetalleMovil = function(w) {
    var titleEl = document.getElementById('gpsDetalleOffcanvasTitle');
    var subtitleEl = document.getElementById('gpsDetalleOffcanvasSubtitle');
    var bodyEl = document.getElementById('gpsDetalleOffcanvasBody');
    if (titleEl) titleEl.textContent = w.placa || '—';
    if (subtitleEl) subtitleEl.textContent = w.nombre_wialon || '';

    var tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
    var speed = (w.velocidad != null ? Number(w.velocidad) : (w.pos && w.pos.s != null ? Number(w.pos.s) : 0)) || 0;
    var isMoving = tienePos && speed > 3;

    var safeNombre = (w.nombre_wialon || w.placa || '').replace(/'/g, "\\'");
    var safeUbicacion = (w.ubicacion || '').replace(/'/g, "\\'");

    var content = `
        <div class="d-flex align-items-center justify-content-between mb-3">
            <span class="badge ${tienePos ? (isMoving ? 'bg-primary' : 'bg-success') : 'bg-secondary'} px-3 py-2 fw-bold" style="font-size:0.8rem;">
                ${tienePos ? (isMoving ? speed + ' km/h' : 'Detenido') : 'Sin Señal'}
            </span>
            ${tienePos ? `
            <button class="btn btn-success btn-sm fw-bold px-3 py-2 rounded-3" onclick="window.compartirUbicacion('${safeNombre}', ${w.lat}, ${w.lng}, '${safeUbicacion}')">
                <i class="bi bi-whatsapp me-1"></i> WhatsApp
            </button>` : ''}
        </div>

        <div class="row g-2 mb-3">
            <div class="col-6">
                <div class="p-3 bg-light rounded-3 border">
                    <span class="small text-secondary d-block fw-bold text-uppercase" style="font-size:0.65rem;">Odómetro</span>
                    <h5 class="fw-bold m-0 text-dark">${(w.km || 0).toLocaleString()} km</h5>
                </div>
            </div>
            <div class="col-6">
                <div class="p-3 bg-light rounded-3 border">
                    <span class="small text-secondary d-block fw-bold text-uppercase" style="font-size:0.65rem;">Horas Motor</span>
                    <h5 class="fw-bold m-0 text-dark">${(w.horas || 0).toLocaleString()} hrs</h5>
                </div>
            </div>
        </div>

        <div class="p-3 bg-light rounded-3 border mb-3">
            <span class="small text-secondary d-block fw-bold text-uppercase mb-1" style="font-size:0.65rem;">Dirección Satelital</span>
            <div class="small fw-bold text-dark">
                ${tienePos ? (w.ubicacion ? `<i class="bi bi-geo-alt-fill text-danger me-1"></i>${_dispEsc(w.ubicacion)}` : `${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}`) : 'Sin señal'}
            </div>
        </div>

        ${tienePos ? `
        <a href="https://maps.google.com/maps?q=${w.lat},${w.lng}" target="_blank" class="btn btn-outline-primary w-100 py-2 fw-bold rounded-3">
            <i class="bi bi-box-arrow-up-right me-1"></i> Abrir en Google Maps
        </a>` : ''}
    `;

    if (bodyEl) bodyEl.innerHTML = content;
    var oc = document.getElementById('gpsDetalleOffcanvas');
    if (oc && typeof bootstrap !== 'undefined' && bootstrap.Offcanvas) {
        bootstrap.Offcanvas.getOrCreateInstance(oc).show();
    }
};

// ------------------------------------------------------------
// COMPARTIR UBICACIÓN POR WHATSAPP
// ------------------------------------------------------------
window.compartirUbicacion = function(nombre, lat, lng, dir) {
    var mapsUrl = `https://maps.google.com/maps?q=${lat},${lng}`;
    var dirTxt = dir ? `\n📍 *Dirección:* ${dir}` : '';
    var texto = `📍 *Ubicación GPS — ${nombre}*${dirTxt}\nCoordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}\nVer en Google Maps: ${mapsUrl}`;
    var wUrl = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(wUrl, '_blank');
};
