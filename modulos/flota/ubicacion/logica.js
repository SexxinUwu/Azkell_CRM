// ============================================================
// 📍 MÓDULO GPS FLOTA — Ubicación en tiempo real (Wialon)
// Cargado dinámicamente por cargarModuloAislado('flota/ubicacion')
// ============================================================

window._datosWialonGPS   = window._datosWialonGPS   || [];
window._filtroGPSActivo  = window._filtroGPSActivo  || '';
window._segmentoGPSActivo= window._segmentoGPSActivo|| 'total';
window._placaGPSActiva   = window._placaGPSActiva   || null;

// ------------------------------------------------------------
// INIT — llamado por el router SPA
// ------------------------------------------------------------
window.init_ubicacion = function() {
    if (!window.checkPerm('gps', 'l')) {
        var wrap = document.getElementById('flota-ubicacion-app') || document.querySelector('.container-fluid');
        if (wrap) window.showNoPermMsg(wrap);
        return;
    }
    window._placaGPSActiva = null;

    // Usar caché Wialon si ya existe
    let datos = (typeof CACHE !== 'undefined' && Array.isArray(CACHE.wialon) && CACHE.wialon.length > 0)
        ? CACHE.wialon : [];

    if (datos.length > 0) {
        renderListaUnidadesGPS(datos);
    } else {
        if (typeof recargarWialon === 'function') recargarWialon(true);
    }
};

// ------------------------------------------------------------
// FILTRO SEGMENTADO & KPIS
// ------------------------------------------------------------
window.filtrarSegmentoGPS = function(tipo, btn) {
    window._segmentoGPSActivo = tipo || 'total';

    // Actualizar active state en botones segmented y KPIs
    document.querySelectorAll('#btn-group-gps-filtros .ck-segment-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-filter') === window._segmentoGPSActivo);
    });
    document.querySelectorAll('#moduloUbicacionGPS .ck-kpi-card').forEach(el => {
        el.classList.toggle('active', el.id === 'gps-kpi-' + window._segmentoGPSActivo);
    });

    filtrarListaGPS(window._filtroGPSActivo || '');
};

// ------------------------------------------------------------
// RENDER LISTA UNIDADES (panel izquierdo)
// ------------------------------------------------------------
window.renderListaUnidadesGPS = function(datos) {
    window._datosWialonGPS = datos || [];

    // Calcular KPIs
    let total = datos.length;
    let online = 0;
    let movimiento = 0;
    let offline = 0;

    datos.forEach(w => {
        let tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
        let speed = (w.velocidad != null ? Number(w.velocidad) : (w.pos && w.pos.s != null ? Number(w.pos.s) : 0)) || 0;
        
        if (tienePos) {
            online++;
            if (speed > 3) movimiento++;
        } else {
            offline++;
        }
    });

    const setKpi = (id, val) => {
        let el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setKpi('kpi-gps-total', total);
    setKpi('kpi-gps-online', online);
    setKpi('kpi-gps-movimiento', movimiento);
    setKpi('kpi-gps-offline', offline);

    // Actualizar badge de cantidad y estado en vivo
    let badge = document.getElementById('gps-unit-count-badge');
    if (badge) badge.textContent = total + ' unidades';

    let badgeActivo = document.getElementById('badge-wialon-ubicacion');
    if (badgeActivo) badgeActivo.style.display = total > 0 ? 'inline-flex' : 'none';

    filtrarListaGPS(window._filtroGPSActivo || '');
};

window.filtrarListaGPS = function(query) {
    window._filtroGPSActivo = query;
    let lista = document.getElementById('listaUnidadesGPS');
    if (!lista) return;

    let datos = window._datosWialonGPS;
    if (!datos || datos.length === 0) {
        lista.innerHTML = '<div class="text-center py-5 text-muted" style="font-size:0.85rem;">No hay datos GPS disponibles.</div>';
        return;
    }

    let q = (query || '').trim().toUpperCase();
    let filtrados = datos.filter(w => {
        let matchText = !q || (w.placa || '').toUpperCase().includes(q) || (w.nombre_wialon || '').toUpperCase().includes(q);
        
        let tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
        let speed = (w.velocidad != null ? Number(w.velocidad) : (w.pos && w.pos.s != null ? Number(w.pos.s) : 0)) || 0;

        let matchSeg = true;
        if (window._segmentoGPSActivo === 'online') matchSeg = tienePos;
        else if (window._segmentoGPSActivo === 'movimiento') matchSeg = (tienePos && speed > 3);
        else if (window._segmentoGPSActivo === 'offline') matchSeg = !tienePos;

        return matchText && matchSeg;
    });

    if (filtrados.length === 0) {
        lista.innerHTML = '<div class="text-center py-5 text-muted" style="font-size:0.85rem;">Sin resultados.</div>';
        return;
    }

    lista.innerHTML = filtrados.map(w => {
        let tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
        let speed = (w.velocidad != null ? Number(w.velocidad) : (w.pos && w.pos.s != null ? Number(w.pos.s) : 0)) || 0;
        let isMoving = tienePos && speed > 3;

        let dotColor = tienePos ? (isMoving ? '#0284c7' : '#10b981') : '#94a3b8';
        let statusBadge = tienePos 
            ? (isMoving ? '<span class="badge bg-primary-subtle text-primary border border-primary-subtle" style="font-size:0.65rem; border-radius:6px;">' + speed + ' km/h</span>' 
                        : '<span class="badge bg-success-subtle text-success border border-success-subtle" style="font-size:0.65rem; border-radius:6px;">Detenido</span>')
            : '<span class="badge bg-light text-secondary border" style="font-size:0.65rem; border-radius:6px;">Sin Señal</span>';

        let isActive = window._placaGPSActiva === (w.placa || '');
        let safePlc = (w.placa || '').replace(/'/g, "\\'");

        return `
        <div class="gps-unit-card${isActive ? ' active' : ''}" onclick="abrirDetalleGPS('${safePlc}')">
            <div class="d-flex align-items-center gap-2" style="min-width: 0;">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: ${dotColor}; flex-shrink: 0;"></div>
                <div style="min-width: 0;">
                    <div class="d-flex align-items-center gap-2">
                        <span class="gps-unit-plate">${w.placa || '—'}</span>
                        ${statusBadge}
                    </div>
                    <div class="gps-unit-model">${w.nombre_wialon || ''}</div>
                </div>
            </div>
            <div class="text-end" style="flex-shrink: 0;">
                <div class="gps-unit-stat text-primary" style="font-size:0.75rem;">${(w.km || 0).toLocaleString()} km</div>
                <div class="gps-unit-stat text-secondary" style="font-size:0.68rem;">${(w.horas || 0).toLocaleString()} hrs</div>
            </div>
        </div>`;
    }).join('');
};

// ------------------------------------------------------------
// DETALLE UNIDAD (panel desktop | offcanvas móvil)
// ------------------------------------------------------------
window.abrirDetalleGPS = function(placa) {
    let w = window._datosWialonGPS.find(x => (x.placa || '') === placa);
    if (!w) return;

    window._placaGPSActiva = placa;

    // Re-render lista para marcar activa
    filtrarListaGPS(window._filtroGPSActivo || '');

    let tienePos = w.lat && w.lat !== 0 && w.lng && w.lng !== 0;
    let speed = (w.velocidad != null ? Number(w.velocidad) : (w.pos && w.pos.s != null ? Number(w.pos.s) : 0)) || 0;
    let isMoving = tienePos && speed > 3;

    let dirId = 'gps-dir-' + Date.now();
    let btnDirId = dirId + '-btn';

    // Mapa embebido con diseño Apple
    let mapHTML = tienePos
        ? `<div style="position:relative; width:100%; height:320px; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
               <iframe src="https://maps.google.com/maps?q=${w.lat},${w.lng}&z=16&output=embed"
                   style="width:100%; height:100%; border:0;" loading="lazy" allowfullscreen></iframe>
               <a href="https://maps.google.com/maps?q=${w.lat},${w.lng}" target="_blank" class="btn btn-sm btn-light border fw-bold position-absolute bottom-0 end-0 m-3 shadow-sm rounded-3 d-flex align-items-center gap-1" style="font-size:0.78rem;">
                   <i class="bi bi-box-arrow-up-right"></i> Abrir en Google Maps
               </a>
           </div>`
        : `<div class="d-flex align-items-center justify-content-center"
               style="height:260px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:16px; color:#94a3b8;">
               <div class="text-center">
                   <i class="bi bi-geo-alt-slash fs-1 text-secondary opacity-50"></i>
                   <h6 class="fw-bold mt-2 mb-1 text-dark">Unidad sin señal GPS</h6>
                   <p class="small text-secondary m-0">El dispositivo se encuentra apagado o fuera de cobertura satelital.</p>
               </div>
           </div>`;

    let safeNombre = (w.nombre_wialon || '').replace(/'/g, "\\'");
    let coordsTxt = tienePos ? (w.lat.toFixed(5) + ', ' + w.lng.toFixed(5)) : '—';

    let contentHTML = `
        <!-- Header Bento de la Unidad -->
        <div class="card border-0 shadow-2xs rounded-4 p-3 mb-3 bg-white" style="border: 1px solid #e2e8f0 !important;">
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
                <div class="d-flex align-items-center gap-3">
                    <div style="width: 52px; height: 52px; background: #0f172a; color: #ffffff; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.4rem;">
                        <i class="bi bi-truck"></i>
                    </div>
                    <div>
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <h4 class="fw-bolder m-0 text-dark" style="letter-spacing: -0.02em;">${w.placa || '—'}</h4>
                            <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1 fw-bold rounded-2 text-uppercase" style="font-size:0.72rem;">
                                ${w.tipo || 'UNIDAD'}
                            </span>
                            ${tienePos ? (isMoving 
                                ? '<span class="badge bg-primary px-2 py-1 fw-bold rounded-2" style="font-size:0.72rem;"><i class="bi bi-speedometer2 me-1"></i>En Ruta: ' + speed + ' km/h</span>'
                                : '<span class="badge bg-success px-2 py-1 fw-bold rounded-2" style="font-size:0.72rem;"><i class="bi bi-pause-circle me-1"></i>Detenido</span>')
                                : '<span class="badge bg-secondary px-2 py-1 fw-bold rounded-2" style="font-size:0.72rem;">Offline</span>'}
                        </div>
                        <span class="text-secondary small fw-medium">${w.nombre_wialon || 'Unidad de Flota'}</span>
                    </div>
                </div>

                <div class="d-flex align-items-center gap-2">
                    ${tienePos ? `
                    <button class="btn btn-success btn-sm fw-bold px-3 py-2 rounded-3 shadow-sm d-flex align-items-center gap-2"
                        onclick="window.compartirUbicacion('${safeNombre}', ${w.lat}, ${w.lng})">
                        <i class="bi bi-whatsapp"></i> Compartir Ubicación
                    </button>` : ''}
                </div>
            </div>
        </div>

        <!-- Mapa Satelital Interactivo -->
        <div class="mb-3">
            ${mapHTML}
        </div>

        <!-- Bento Grid de Telemetría -->
        <div class="gps-telemetry-grid">
            <div class="gps-telemetry-box">
                <div style="width:40px;height:40px;border-radius:10px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">
                    <i class="bi bi-speedometer"></i>
                </div>
                <div>
                    <span class="text-secondary small fw-bold text-uppercase d-block" style="font-size:0.68rem;">Odómetro</span>
                    <h6 class="fw-bolder m-0 text-dark" style="font-size:1.05rem;">${(w.km || 0).toLocaleString()} km</h6>
                </div>
            </div>

            <div class="gps-telemetry-box">
                <div style="width:40px;height:40px;border-radius:10px;background:#fefce8;color:#ca8a04;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">
                    <i class="bi bi-clock-history"></i>
                </div>
                <div>
                    <span class="text-secondary small fw-bold text-uppercase d-block" style="font-size:0.68rem;">Horas de Motor</span>
                    <h6 class="fw-bolder m-0 text-dark" style="font-size:1.05rem;">${(w.horas || 0).toLocaleString()} hrs</h6>
                </div>
            </div>

            <div class="gps-telemetry-box">
                <div style="width:40px;height:40px;border-radius:10px;background:#f0fdf4;color:#16a34a;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">
                    <i class="bi bi-compass"></i>
                </div>
                <div style="min-width:0; flex:1;">
                    <span class="text-secondary small fw-bold text-uppercase d-block" style="font-size:0.68rem;">Coordenadas</span>
                    <div class="d-flex align-items-center justify-content-between gap-1">
                        <h6 class="fw-bolder m-0 text-dark text-truncate" style="font-size:0.92rem;">${coordsTxt}</h6>
                        ${tienePos ? `<button class="btn btn-sm p-0 text-secondary" title="Copiar coordenadas" onclick="navigator.clipboard.writeText('${coordsTxt}').then(()=>{ alert('Coordenadas copiadas'); })"><i class="bi bi-clipboard"></i></button>` : ''}
                    </div>
                </div>
            </div>

            <div class="gps-telemetry-box" style="grid-column: span 1 / -1;">
                <div style="width:40px;height:40px;border-radius:10px;background:#f1f5f9;color:#475569;display:flex;align-items:center;justify-content:center;font-size:1.2rem; flex-shrink:0;">
                    <i class="bi bi-pin-map"></i>
                </div>
                <div style="min-width:0; flex:1;">
                    <span class="text-secondary small fw-bold text-uppercase d-block" style="font-size:0.68rem;">Dirección Satelital</span>
                    <div class="d-flex align-items-center justify-content-between gap-2">
                        <h6 class="fw-bold m-0 text-dark text-truncate" id="${dirId}" style="font-size:0.92rem;">
                            ${tienePos ? '<span class="spinner-border spinner-border-sm text-primary"></span> Obteniendo dirección...' : '<span class="text-secondary fw-normal">Sin señal</span>'}
                        </h6>
                        ${tienePos ? `<button class="btn btn-sm p-0 text-secondary" id="${btnDirId}" title="Copiar"><i class="bi bi-clipboard"></i></button>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;

    var isMobile = window.innerWidth < 768;
    if (isMobile) {
        var titleEl = document.getElementById('gpsDetalleOffcanvasTitle');
        var subtitleEl = document.getElementById('gpsDetalleOffcanvasSubtitle');
        var bodyEl = document.getElementById('gpsDetalleOffcanvasBody');
        if (titleEl) titleEl.textContent = w.placa || '—';
        if (subtitleEl) subtitleEl.textContent = w.nombre_wialon || '';
        if (bodyEl) bodyEl.innerHTML = contentHTML;
        var oc = document.getElementById('gpsDetalleOffcanvas');
        if (oc) bootstrap.Offcanvas.getOrCreateInstance(oc).show();
    } else {
        let pane = document.getElementById('paneDetalleGPS');
        if (!pane) return;
        pane.innerHTML = contentHTML;
    }

    // Geocodificación asíncrona
    if (tienePos) {
        (async () => {
            let dirEl = document.getElementById(dirId);
            let btnEl = document.getElementById(btnDirId);
            let dirTxt = w.lat.toFixed(5) + ', ' + w.lng.toFixed(5);
            try {
                const res = await fetch(`/api/proxy/geocode?lat=${w.lat}&lon=${w.lng}`);
                const data = await res.json();
                if (data && data.display_name) {
                    let d = data.display_name.replace(/^Sin nombre,\s*/i, '');
                    dirTxt = d || dirTxt;
                }
            } catch(e) {}

            if (dirEl) dirEl.textContent = dirTxt;
            if (btnEl) {
                btnEl.onclick = function() {
                    navigator.clipboard.writeText(dirTxt).then(() => {
                        btnEl.innerHTML = '<i class="bi bi-check2 text-success"></i>';
                        setTimeout(() => { btnEl.innerHTML = '<i class="bi bi-clipboard"></i>'; }, 2000);
                    });
                };
            }
        })();
    }
};

window.compartirUbicacion = function(nombre, lat, lng) {
    let mapsUrl = `https://maps.google.com/maps?q=${lat},${lng}`;
    let texto = `📍 *Ubicación GPS — ${nombre}*\nCoordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}\nVer en Google Maps: ${mapsUrl}`;
    let wUrl = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(wUrl, '_blank');
};
