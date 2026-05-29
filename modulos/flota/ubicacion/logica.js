// ============================================================
// 📍 MÓDULO GPS FLOTA — Ubicación en tiempo real (Wialon)
// Cargado dinámicamente por cargarModuloAislado('flota/ubicacion')
// ============================================================

window._datosWialonGPS   = window._datosWialonGPS   || [];
window._filtroGPSActivo  = window._filtroGPSActivo  || '';
window._placaGPSActiva   = window._placaGPSActiva   || null;

// ------------------------------------------------------------
// INIT — llamado por el router SPA
// ------------------------------------------------------------
window.init_ubicacion = function() {
    window._filtroGPSActivo = '';
    window._placaGPSActiva  = null;

    // Usar caché Wialon si ya existe
    let datos = (typeof CACHE !== 'undefined' && Array.isArray(CACHE.wialon) && CACHE.wialon.length > 0)
        ? CACHE.wialon : [];

    if (datos.length > 0) {
        renderListaUnidadesGPS(datos);
    } else {
        // Dispara carga; cuando termine recargarWialon llama renderListaUnidadesGPS
        if (typeof recargarWialon === 'function') recargarWialon(true);
    }
};

// ------------------------------------------------------------
// RENDER LISTA UNIDADES (panel izquierdo)
// ------------------------------------------------------------
window.renderListaUnidadesGPS = function(datos) {
    window._datosWialonGPS = datos || [];

    // Actualizar badge de cantidad
    let badge = document.getElementById('gps-unit-count-badge');
    if (badge) badge.textContent = datos.length + ' unidades';

    let badgeActivo = document.getElementById('badge-wialon-ubicacion');
    if (badgeActivo) badgeActivo.style.display = datos.length > 0 ? '' : 'none';
    
    let badgeActivoMob = document.getElementById('badge-wialon-ubicacion-mob');
    if (badgeActivoMob) badgeActivoMob.style.display = datos.length > 0 ? '' : 'none';

    filtrarListaGPS(window._filtroGPSActivo || '');
};

window.filtrarListaGPS = function(query) {
    window._filtroGPSActivo = query;
    let lista = document.getElementById('listaUnidadesGPS');
    if (!lista) return;

    let datos = window._datosWialonGPS;
    if (!datos || datos.length === 0) {
        lista.innerHTML = '<div class="text-center py-4 text-muted">No hay datos GPS disponibles.</div>';
        return;
    }

    let q = query.trim().toUpperCase();
    let filtrados = q
        ? datos.filter(w => (w.placa||'').toUpperCase().includes(q) || (w.nombre_wialon||'').toUpperCase().includes(q))
        : datos;

    if (filtrados.length === 0) {
        lista.innerHTML = '<div class="text-center py-4 text-muted">Sin resultados para "' + query + '".</div>';
        return;
    }

    lista.innerHTML = filtrados.map(w => {
        let tienePos = w.lat !== 0 && w.lng !== 0;
        let dotColor  = tienePos ? '#10b981' : '#d1d5db'; // green-500 or gray-300
        let isActive  = window._placaGPSActiva === (w.placa || '');
        
        var isMobile = window.innerWidth < 768;
        if (isMobile) {
            return `<button class="gps-unit-btn" onclick="abrirDetalleGPS('${(w.placa||'').replace(/'/g,"\\'")}')">
                <div class="d-flex align-items-center gap-3">
                    <div style="width:8px;height:8px;border-radius:50%;background:${dotColor};"></div>
                    <div>
                        <h3 class="fw-semibold m-0" style="font-size:16px;color:#2563eb;">${w.placa || '—'}</h3>
                        <p class="m-0 mt-1" style="font-size:13px;color:#6b7280;">${w.nombre_wialon || ''}</p>
                    </div>
                </div>
                <div class="text-end">
                    <p class="fw-medium m-0" style="font-size:13px;color:#3b82f6;">${(w.km||0).toLocaleString()} km</p>
                    <p class="fw-medium m-0 mt-1" style="font-size:12px;color:#fb923c;">${(w.horas||0).toLocaleString()} hrs</p>
                </div>
            </button>`;
        } else {
            return `<div class="gps-unit-card${isActive ? ' active' : ''}" onclick="abrirDetalleGPS('${(w.placa||'').replace(/'/g,"\\'")}')">
                <div class="d-flex align-items-center gap-2">
                    <span style="width:9px;height:9px;border-radius:50%;background:${dotColor};flex-shrink:0;margin-top:2px;"></span>
                    <div style="flex:1;min-width:0;">
                        <div class="fw-bold text-primary" style="font-size:0.88rem;">${w.placa || '—'}</div>
                        <div class="text-muted text-truncate" style="font-size:0.76rem;">${w.nombre_wialon || ''}</div>
                    </div>
                    <div class="text-end" style="font-size:0.76rem;flex-shrink:0;">
                        <div style="color:#0ea5e9;">${(w.km||0).toLocaleString()} km</div>
                        <div style="color:#f59e0b;">${(w.horas||0).toLocaleString()} hrs</div>
                    </div>
                </div>
            </div>`;
        }
    }).join('');
};

// ------------------------------------------------------------
// DETALLE UNIDAD (panel desktop | offcanvas móvil)
// ------------------------------------------------------------
window.abrirDetalleGPS = function(placa) {
    let w = window._datosWialonGPS.find(x => (x.placa||'') === placa);
    if (!w) return;

    window._placaGPSActiva = placa;

    // Re-render lista para marcar activa
    filtrarListaGPS(window._filtroGPSActivo || '');

    let tienePos = w.lat !== 0 && w.lng !== 0;

    // Mapa embebido
    let mapHTML = tienePos
        ? `<iframe src="https://maps.google.com/maps?q=${w.lat},${w.lng}&z=16&output=embed"
               style="width:100%;height:260px;border:0;border-radius:10px;" loading="lazy" allowfullscreen></iframe>`
        : `<div class="d-flex align-items-center justify-content-center rounded"
               style="height:200px;background:var(--bg);border:1px dashed var(--border);color:var(--subtext);">
               <div class="text-center">
                   <i class="bi bi-geo-alt-slash fs-1 opacity-40"></i>
                   <p class="mt-2 mb-0">Sin señal GPS</p>
               </div>
           </div>`;

    // Fila de dato con botón copiar
    function campoCopia(label, valor, valorCopia) {
        let id = 'copy-gps-' + Math.random().toString(36).substr(2,6);
        let vc = (valorCopia||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');
        return `<div class="d-flex align-items-center justify-content-between py-2" style="border-bottom:1px solid var(--border);">
            <span class="text-muted" style="font-size:0.81rem;">${label}</span>
            <div class="d-flex align-items-center gap-2">
                <span class="fw-bold" style="font-size:0.88rem;">${valor}</span>
                <button class="btn p-0 px-1 btn-gps-copy" id="${id}" title="Copiar"
                    onclick="navigator.clipboard.writeText('${vc}').then(()=>{let b=document.getElementById('${id}');if(b){b.innerHTML='<i class=\\'bi bi-check2 text-success\\'></i>';setTimeout(()=>{if(b)b.innerHTML='<i class=\\'bi bi-clipboard\\'></i>';},2000);}})">
                    <i class="bi bi-clipboard"></i>
                </button>
            </div>
        </div>`;
    }

    let dirId    = 'gps-dir-' + Date.now();
    let btnDirId = dirId + '-btn';

    var isMobile = window.innerWidth < 768;

    let contentHTML = '';

    if (isMobile) {
        // Estilo Nativo Edge-to-Edge para Móvil
        let mapMobHTML = tienePos
            ? `<div style="width:100%;height:260px;position:relative;overflow:hidden;border-bottom:1px solid #e5e7eb;">
                   <iframe src="https://maps.google.com/maps?q=${w.lat},${w.lng}&z=16&output=embed" style="width:100%;height:100%;border:0;" loading="lazy" allowfullscreen></iframe>
                   <div style="position:absolute;bottom:16px;right:16px;width:40px;height:40px;background:#fff;border-radius:8px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);display:flex;align-items:center;justify-content:center;color:#4b5563;" onclick="window.open('https://maps.google.com/maps?q=${w.lat},${w.lng}','_blank')">
                       <i class="bi bi-compass-fill fs-5"></i>
                   </div>
               </div>`
            : `<div style="width:100%;height:260px;background:#d5f0d6;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;border-bottom:1px solid #e5e7eb;">
                   <div class="text-center" style="color:rgba(0,0,0,0.3);">
                       <i class="bi bi-geo-alt-slash fs-1"></i>
                       <p class="mt-2 mb-0 fw-bold">Sin señal GPS</p>
                   </div>
               </div>`;

        function campoMob(label, valor) {
            let id = 'copy-gps-' + Math.random().toString(36).substr(2,6);
            let vc = (valor||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');
            return `<div class="d-flex align-items-center justify-content-between px-4 py-3" style="border-bottom:1px solid #f3f4f6;">
                <span style="font-size:15px;color:#6b7280;font-weight:500;width:33%;">${label}</span>
                <div class="d-flex align-items-center gap-2 justify-content-end text-end" style="width:66%;">
                    <span class="fw-bold" style="font-size:15px;color:#111827;word-break:break-word;">${valor}</span>
                    <button class="btn p-0 text-muted" id="${id}" onclick="navigator.clipboard.writeText('${vc}').then(()=>{let b=document.getElementById('${id}');if(b){b.innerHTML='<i class=\\'bi bi-check-lg text-success\\'></i>';setTimeout(()=>{if(b)b.innerHTML='<i class=\\'bi bi-files\\'></i>';},2000);}})">
                        <i class="bi bi-files" style="font-size:14px;"></i>
                    </button>
                </div>
            </div>`;
        }

        contentHTML = `
            ${mapMobHTML}
            <div class="d-flex flex-column pt-2 bg-white">
                ${campoMob('Kilometraje', (w.km||0).toLocaleString() + ' km')}
                ${campoMob('Horas Motor', (w.horas||0).toLocaleString() + ' hrs')}
                ${tienePos ? campoMob('Coordenadas', w.lat.toFixed(5) + ', ' + w.lng.toFixed(5)) : ''}
                
                <div class="d-flex align-items-center justify-content-between px-4 py-3" style="border-bottom:1px solid #f3f4f6;">
                    <span style="font-size:15px;color:#6b7280;font-weight:500;width:33%;">Dirección</span>
                    <div class="d-flex align-items-center gap-2 justify-content-end text-end" style="width:66%;">
                        <span class="fw-bold" id="${dirId}" style="font-size:15px;color:#111827;word-break:break-word;">
                            ${tienePos ? '<span class="spinner-border spinner-border-sm text-primary"></span>' : '<span class="text-muted fw-normal">Sin señal</span>'}
                        </span>
                        ${tienePos ? `<button class="btn p-0 text-muted" id="${btnDirId}">
                            <i class="bi bi-files" style="font-size:14px;"></i>
                        </button>` : ''}
                    </div>
                </div>
            </div>
        `;

        // Update Mobile Header Buttons
        let btnComp = document.getElementById('btn-gps-compartir-mob');
        if (btnComp) {
            if (tienePos) {
                btnComp.style.display = 'inline-block';
                btnComp.onclick = function() { compartirUbicacion((w.nombre_wialon||'').replace(/'/g,"\\'"), w.lat, w.lng); };
            } else {
                btnComp.style.display = 'none';
            }
        }

    } else {
        // Estilo Desktop clásico
        let mapHTML = tienePos
            ? `<iframe src="https://maps.google.com/maps?q=${w.lat},${w.lng}&z=16&output=embed"
                   style="width:100%;height:260px;border:0;border-radius:10px;" loading="lazy" allowfullscreen></iframe>`
            : `<div class="d-flex align-items-center justify-content-center rounded"
                   style="height:200px;background:var(--bg);border:1px dashed var(--border);color:var(--subtext);">
                   <div class="text-center">
                       <i class="bi bi-geo-alt-slash fs-1 opacity-40"></i>
                       <p class="mt-2 mb-0">Sin señal GPS</p>
                   </div>
               </div>`;

        function campoCopia(label, valor, valorCopia) {
            let id = 'copy-gps-' + Math.random().toString(36).substr(2,6);
            let vc = (valorCopia||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');
            return `<div class="d-flex align-items-center justify-content-between py-2" style="border-bottom:1px solid var(--border);">
                <span class="text-muted" style="font-size:0.81rem;">${label}</span>
                <div class="d-flex align-items-center gap-2">
                    <span class="fw-bold" style="font-size:0.88rem;">${valor}</span>
                    <button class="btn p-0 px-1 btn-gps-copy" id="${id}" title="Copiar"
                        onclick="navigator.clipboard.writeText('${vc}').then(()=>{let b=document.getElementById('${id}');if(b){b.innerHTML='<i class=\\'bi bi-check2 text-success\\'></i>';setTimeout(()=>{if(b)b.innerHTML='<i class=\\'bi bi-clipboard\\'></i>';},2000);}})">
                        <i class="bi bi-clipboard"></i>
                    </button>
                </div>
            </div>`;
        }

        contentHTML = `
            <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
                <div>
                    <h5 class="fw-bold mb-0 text-primary">${w.placa || '—'}</h5>
                    <small class="text-muted">${w.nombre_wialon || ''}</small>
                </div>
                ${tienePos ? `
                <button class="btn btn-success btn-sm fw-bold shadow-sm"
                    onclick="compartirUbicacion('${(w.nombre_wialon||'').replace(/'/g,"\\'")}', ${w.lat}, ${w.lng})">
                    <i class="bi bi-whatsapp"></i> Compartir
                </button>` : ''}
            </div>
            ${mapHTML}
            <div class="mt-3">
                ${campoCopia('Kilometraje', (w.km||0).toLocaleString() + ' km', (w.km||0) + ' km')}
                ${campoCopia('Horas Motor', (w.horas||0).toLocaleString() + ' hrs', (w.horas||0) + ' hrs')}
                ${tienePos ? campoCopia('Coordenadas', w.lat.toFixed(5) + ', ' + w.lng.toFixed(5), w.lat + ', ' + w.lng) : ''}
                <!-- Fila dirección (asíncrona) -->
                <div class="d-flex align-items-center justify-content-between py-2" style="border-bottom:1px solid var(--border);">
                    <span class="text-muted" style="font-size:0.81rem;">Dirección</span>
                    <div class="d-flex align-items-center gap-2">
                        <span class="fw-bold" id="${dirId}" style="font-size:0.88rem;">
                            ${tienePos ? '<span class="spinner-border spinner-border-sm text-primary"></span>' : '<span class="text-muted">Sin señal GPS</span>'}
                        </span>
                        ${tienePos ? `<button class="btn p-0 px-1 btn-gps-copy" id="${btnDirId}" title="Copiar dirección">
                            <i class="bi bi-clipboard"></i>
                        </button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // Detectar móvil y escribir en el contenedor correcto
    var isMobile = window.innerWidth < 768;
    if (isMobile) {
        var titleEl    = document.getElementById('gpsDetalleOffcanvasTitle');
        var subtitleEl = document.getElementById('gpsDetalleOffcanvasSubtitle');
        var bodyEl     = document.getElementById('gpsDetalleOffcanvasBody');
        if (titleEl)    titleEl.textContent    = w.placa || '—';
        if (subtitleEl) subtitleEl.textContent = w.nombre_wialon || '';
        if (bodyEl)     bodyEl.innerHTML       = contentHTML;
        var oc = document.getElementById('gpsDetalleOffcanvas');
        if (oc) bootstrap.Offcanvas.getOrCreateInstance(oc).show();
    } else {
        let pane = document.getElementById('paneDetalleGPS');
        if (!pane) return;
        pane.innerHTML = contentHTML;
    }

    // Geocodificación asíncrona (Nominatim)
    if (tienePos) {
        (async () => {
            let dirEl  = document.getElementById(dirId);
            let btnEl  = document.getElementById(btnDirId);
            let dirTxt = w.lat.toFixed(5) + ', ' + w.lng.toFixed(5);
            try {
                const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${w.lat}&lon=${w.lng}`);
                const data = await res.json();
                const calle  = data.address?.road || data.address?.suburb || data.address?.neighbourhood || 'Sin nombre';
                const ciudad = data.address?.city  || data.address?.town  || data.address?.county || '';
                dirTxt = ciudad ? `${calle}, ${ciudad}` : calle;
            } catch(e) {}

            if (dirEl) dirEl.textContent = dirTxt;
            if (btnEl) {
                let vc = dirTxt.replace(/'/g,"\\'");
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
