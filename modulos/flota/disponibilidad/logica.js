// ================================================================
// 🚛 MÓDULO: DISPONIBILIDAD DE FLOTA - LÓGICA AISLADA (ERP)
// ================================================================

window.dispDatos = [];
window.dispPlacas = [];
window.dispConductores = [];
window.dispGpsMap = {};
window._dispKpiFiltroActivo = null;

// ── Cargar Datos del Servidor ─────────────────────────────────────
window.dispCargarDatos = async function () {
    if (typeof window.checkPerm === 'function' && !window.checkPerm('disponibilidad', 'l')) {
        const tbody = document.getElementById('disp-table-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="14" class="text-center py-5 text-danger">
                        <i class="bi bi-shield-lock-fill fs-2 d-block mb-2"></i>
                        No tiene permisos asignados para acceder a Disponibilidad de Flota.
                    </td>
                </tr>
            `;
        }
        return;
    }

    const tbody = document.getElementById('disp-table-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" class="text-center py-4 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                    Cargando disponibilidad de flota...
                </td>
            </tr>
        `;
    }

    try {
        // Cargas en paralelo: Disponibilidad, Placas y Conductores
        const [resDisp, resPlacas, resCond] = await Promise.all([
            fetch('/api/disponibilidad-flota').then(r => r.json()).catch(() => []),
            fetch('/api/placas-lista').then(r => r.json()).catch(() => []),
            fetch('/api/conductores-lista').then(r => r.json()).catch(() => [])
        ]);

        window.dispDatos = Array.isArray(resDisp) ? resDisp : (resDisp.data || []);
        window.dispPlacas = Array.isArray(resPlacas) ? resPlacas : (resPlacas.data || []);
        window.dispConductores = Array.isArray(resCond) ? resCond : (resCond.data || []);

        // Cargar datos de GPS/Wialon para autocompletar ubicaciones
        window.dispCargarGpsMap();

        window.dispActualizarKPIs();
        window.dispFiltrar();
    } catch (err) {
        console.error('Error cargando módulo de disponibilidad:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="14" class="text-center py-4 text-danger">
                        <i class="bi bi-exclamation-triangle-fill me-1"></i> Error al cargar datos: ${err.message}
                    </td>
                </tr>
            `;
        }
    }
};

// ── Helper Geocoding / Reverse Geocode GPS ─────────────────────────
window._dispGeoCache = window._dispGeoCache || {};
window.dispObtenerDireccionGeocode = async function (lat, lng) {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return '';
    const key = `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
    if (window._dispGeoCache[key]) return window._dispGeoCache[key];

    try {
        const res = await fetch(`/api/proxy/geocode?lat=${lat}&lon=${lng}`).then(r => r.json()).catch(() => null);
        if (res && res.display_name) {
            window._dispGeoCache[key] = res.display_name;
            return res.display_name;
        }
    } catch (e) {}
    return `Coordenadas (${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)})`;
};

// ── Cargar Mapa GPS / Wialon ───────────────────────────────────────
window.dispCargarGpsMap = async function () {
    try {
        let datos = (typeof CACHE !== 'undefined' && CACHE['wialon'])
            ? CACHE['wialon']
            : (window._datosWialonGPS || []);

        if (!datos || (Array.isArray(datos) && datos.length === 0) || (typeof datos === 'object' && Object.keys(datos).length === 0)) {
            const res = await fetch('/api/script/obtenerDatosWialon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ args: [] })
            }).then(r => r.json()).catch(() => null);

            if (res && res.data && !res.data.error) {
                datos = res.data;
                if (typeof CACHE !== 'undefined') CACHE['wialon'] = datos;
            }
        }

        if (datos && typeof datos === 'object') {
            const lista = Array.isArray(datos) ? datos : Object.values(datos);
            const geocodePromises = [];

            lista.forEach(item => {
                if (!item) return;
                const pl = (item.placa || item.nm || item.nombre || item.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (!pl) return;

                let ubi = item.direccion || item.pos_texto || item.ubicacion || item.posicion || item.address || '';
                const lat = item.lat || item.latitude || (item.pos ? item.pos.y : null);
                const lng = item.lng || item.lon || item.longitude || (item.pos ? item.pos.x : null);

                if (ubi) {
                    window.dispGpsMap[pl] = ubi;
                } else if (lat && lng) {
                    geocodePromises.push(
                        window.dispObtenerDireccionGeocode(lat, lng).then(dir => {
                            if (dir) window.dispGpsMap[pl] = dir;
                        })
                    );
                }
            });

            if (geocodePromises.length > 0) {
                await Promise.all(geocodePromises);
            }

            window.dispFiltrar();
        }
    } catch (e) {
        console.warn('[Disponibilidad] GPS opcional:', e);
    }
};

// ── Toggle Columna Conductor Eventual ─────────────────────────────
window.dispMostrarEventual = false;
window.dispToggleColumnaEventual = function () {
    window.dispMostrarEventual = !window.dispMostrarEventual;
    const btn = document.getElementById('btn-toggle-eventual');
    const th = document.getElementById('th-cond-eventual');

    if (th) th.style.display = window.dispMostrarEventual ? '' : 'none';
    document.querySelectorAll('.td-cond-eventual').forEach(td => {
        td.style.display = window.dispMostrarEventual ? '' : 'none';
    });

    if (btn) {
        btn.innerHTML = window.dispMostrarEventual
            ? '<i class="bi bi-eye text-primary me-1"></i>Cond. Eventual'
            : '<i class="bi bi-eye-slash me-1"></i>Cond. Eventual';
        btn.classList.toggle('btn-outline-primary', window.dispMostrarEventual);
        btn.classList.toggle('btn-outline-secondary', !window.dispMostrarEventual);
    }
};

// ── Actualizar KPIs Superiores ────────────────────────────────────
window.dispActualizarKPIs = function () {
    const total = window.dispDatos.length;
    let operativos = 0;
    let mantenimiento = 0;
    let condDisp = 0;
    let condNoDisp = 0;

    window.dispDatos.forEach(d => {
        const estUni = (d.estado_unidad || '').toLowerCase();
        const estCon = (d.estado_conductor || '').toLowerCase();

        if (estUni === 'disponible' || estUni === 'operativo') operativos++;
        if (estUni === 'mantenimiento' || estUni === 'siniestro') mantenimiento++;

        if (estCon === 'disponible') condDisp++;
        else if (estCon && estCon !== 'vacante' && estCon !== 'sin conductor') condNoDisp++;
    });

    const setKpi = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    setKpi('disp-kpi-total', total);
    setKpi('disp-kpi-operativos', operativos);
    setKpi('disp-kpi-mantenimiento', mantenimiento);
    setKpi('disp-kpi-cond-disp', condDisp);
    setKpi('disp-kpi-cond-nodisp', condNoDisp);
};

// ── Filtrado Interactivo por KPI ──────────────────────────────────
window.dispFiltrarPorKPI = function (tipo) {
    if (window._dispKpiFiltroActivo === tipo) {
        window._dispKpiFiltroActivo = null;
    } else {
        window._dispKpiFiltroActivo = tipo;
    }

    document.querySelectorAll('.disp-kpi-card').forEach(card => {
        card.classList.remove('active-kpi');
    });

    if (window._dispKpiFiltroActivo) {
        const activeCard = document.getElementById(`card-kpi-${window._dispKpiFiltroActivo}`);
        if (activeCard) activeCard.classList.add('active-kpi');
    }

    window.dispFiltrar();
};

// ── Renderizar Tabla ──────────────────────────────────────────────
window.dispRenderTabla = function (lista) {
    const tbody = document.getElementById('disp-table-body');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                    No se encontraron unidades con los filtros seleccionados.
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    lista.forEach((item, index) => {
        const num = index + 1;
        const cleanPlaca = (item.placa_camion || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const gpsUbicacion = (cleanPlaca && window.dispGpsMap[cleanPlaca]) || item.ubicacion_manual || 'Sin ubicación registrada';

        // Badges de Estados
        const estConBadge = window.dispObtenerBadgeEstadoConductor(item.estado_conductor);
        const estUniBadge = window.dispObtenerBadgeEstadoUnidad(item.estado_unidad);

        // Capacidad Tanque Formateada
        let capTxt = item.capacidad_tanque || item.placa_capacidad_tanque || '0';
        if (capTxt === '0' || capTxt === 'Gln' || capTxt === 'm³' || !capTxt) {
            capTxt = '0';
        } else if (!String(capTxt).toUpperCase().includes('GLN') && !String(capTxt).toUpperCase().includes('M³')) {
            capTxt = capTxt + ' Gln';
        }

        html += `
            <tr data-disp-id="${item.id}">
                <td class="text-center fw-bold text-muted" style="font-size:0.75rem;">${num}</td>
                <td>
                    <div class="fw-semibold text-dark" style="font-size:0.82rem;">
                        ${item.conductor_asignado ? `<i class="bi bi-person-badge me-1 text-success"></i>${_dispEsc(item.conductor_asignado)}` : '<span class="text-muted">—</span>'}
                    </div>
                </td>
                <td class="td-cond-eventual" style="${window.dispMostrarEventual ? '' : 'display:none;'}">
                    <div class="fw-semibold text-dark" style="font-size:0.82rem;">
                        ${item.conductor_eventual ? `<i class="bi bi-person me-1 text-primary"></i>${_dispEsc(item.conductor_eventual)}` : '<span class="text-muted">—</span>'}
                    </div>
                </td>
                <td>
                    ${item.placa_camion ? `
                        <span class="disp-placa-badge">
                            <i class="bi bi-truck text-secondary"></i> ${_dispEsc(item.placa_camion)}
                        </span>
                    ` : '<span class="text-muted">—</span>'}
                </td>
                <td>
                    ${item.placa_carreta ? `
                        <span class="disp-placa-badge disp-placa-carreta">
                            <i class="bi bi-link-45deg"></i> ${_dispEsc(item.placa_carreta)}
                        </span>
                    ` : '<span class="text-muted">—</span>'}
                </td>
                <td>
                    <span class="fw-bold" style="font-size:0.8rem; color:#0369a1;">
                        ${_dispEsc(capTxt)}
                    </span>
                </td>
                <td>
                    <span class="fw-bold text-uppercase" style="font-size:0.8rem; color:#334155;">
                        ${_dispEsc(item.marca || '—')}
                    </span>
                </td>
                <td>
                    <span class="badge ${item.categoria_conductor === 'Local' ? 'bg-info-subtle text-info-emphasis border border-info-subtle' : 'bg-primary-subtle text-primary-emphasis border border-primary-subtle'} fw-bold" style="font-size:0.72rem;">
                        ${_dispEsc(item.categoria_conductor || 'Nacional')}
                    </span>
                </td>
                <td>
                    <span class="text-secondary fw-semibold" style="font-size:0.8rem;">
                        ${_dispEsc(item.tipo_unidad || '—')}
                    </span>
                </td>
                <td>
                    ${estConBadge}
                </td>
                <td>
                    ${estUniBadge}
                </td>
                <td>
                    <div class="d-flex align-items-center gap-1" style="max-width:240px; cursor:pointer;" onclick="window.open('https://maps.google.com/?q=' + encodeURIComponent('${_dispEsc(gpsUbicacion)}'), '_blank')" title="Ver ubicación Google Maps: ${_dispEsc(gpsUbicacion)}">
                        <i class="bi bi-geo-alt-fill text-danger flex-shrink-0" style="font-size:0.85rem;"></i>
                        <span class="text-truncate" style="font-size:0.78rem; color:#475569;">
                            ${_dispEsc(gpsUbicacion)}
                        </span>
                    </div>
                </td>
                <td>
                    <span class="text-truncate d-inline-block" style="max-width:180px; font-size:0.78rem; color:#64748b;" title="${_dispEsc(item.observaciones)}">
                        ${_dispEsc(item.observaciones || '—')}
                    </span>
                </td>
                <td class="text-center">
                    <div class="d-flex align-items-center justify-content-center gap-1">
                        <button class="ck-action-btn ck-btn-edit" onclick="window.dispEditar(${item.id})" title="Editar registro">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        <button class="ck-action-btn ck-btn-delete" onclick="window.dispAbrirModalEliminar(${item.id}, '${_dispEsc(item.placa_camion || item.placa_carreta || 'Unidad')}')" title="Eliminar registro">
                            <i class="bi bi-trash3-fill"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
};

// ── Badges de Estado Conductor ────────────────────────────────────
window.dispObtenerBadgeEstadoConductor = function (estado) {
    const est = (estado || 'Disponible').trim();
    const map = {
        'Disponible': { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0', dot: '#10b981' },
        'Sin Conductor': { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', dot: '#94a3b8' },
        'Día Libre': { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', dot: '#3b82f6' },
        'Entra UTS': { bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe', dot: '#8b5cf6' },
        'Vacaciones': { bg: '#fffbeb', text: '#92400e', border: '#fde68a', dot: '#f59e0b' },
        'Vacante': { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', dot: '#94a3b8' },
        'Faltó': { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', dot: '#ef4444' }
    };
    const conf = map[est] || map['Disponible'];
    return `
        <span class="badge-disp" style="background:${conf.bg}; color:${conf.text} !important; border:1px solid ${conf.border}; font-weight:700;">
            <span class="badge-disp-dot" style="background:${conf.dot};"></span>
            ${_dispEsc(est)}
        </span>
    `;
};

// ── Badges de Estado Unidad ───────────────────────────────────────
window.dispObtenerBadgeEstadoUnidad = function (estado) {
    const est = (estado || 'Disponible').trim();
    const map = {
        'Disponible': { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0', dot: '#10b981' },
        'Operativo': { bg: '#f0fdfa', text: '#115e59', border: '#99f6e4', dot: '#14b8a6' },
        'Mantenimiento': { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', dot: '#ef4444' },
        'Programado': { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', dot: '#3b82f6' },
        'Tránsito': { bg: '#fffbeb', text: '#92400e', border: '#fde68a', dot: '#f59e0b' },
        'Solo Placa': { bg: '#f8fafc', text: '#334155', border: '#cbd5e1', dot: '#64748b' },
        'Alquilado': { bg: '#faf5ff', text: '#6b21a8', border: '#e9d5ff', dot: '#a855f7' },
        'Siniestro': { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', dot: '#dc2626' },
        'Modificación': { bg: '#fff1f2', text: '#9f1239', border: '#fecdd3', dot: '#f43f5e' },
        'En Proyecto': { bg: '#eef2ff', text: '#3730a3', border: '#c7d2fe', dot: '#6366f1' }
    };
    const conf = map[est] || map['Disponible'];
    return `
        <span class="badge-disp" style="background:${conf.bg}; color:${conf.text} !important; border:1px solid ${conf.border}; font-weight:700;">
            <span class="badge-disp-dot" style="background:${conf.dot};"></span>
            ${_dispEsc(est)}
        </span>
    `;
};

// ── Buscador Global Multicolumna (Búsqueda Avanzada) ──────────────
window.dispFiltrar = function () {
    const q = (document.getElementById('disp-filtro-search')?.value || '').toLowerCase().trim();
    const fUni = (document.getElementById('disp-filtro-est-uni')?.value || '').toLowerCase().trim();
    const fCon = (document.getElementById('disp-filtro-est-con')?.value || '').toLowerCase().trim();
    const fCat = (document.getElementById('disp-filtro-categoria')?.value || '').toLowerCase().trim();
    const kpiF = window._dispKpiFiltroActivo;

    const filtrados = (window.dispDatos || []).filter(item => {
        const estUni = (item.estado_unidad || '').toLowerCase();
        const estCon = (item.estado_conductor || '').toLowerCase();
        const catCon = (item.categoria_conductor || '').toLowerCase();

        // Filtro KPI activo
        if (kpiF === 'operativos' && !(estUni === 'disponible' || estUni === 'operativo')) return false;
        if (kpiF === 'mantenimiento' && !(estUni === 'mantenimiento' || estUni === 'siniestro')) return false;
        if (kpiF === 'cond-disp' && !(estCon === 'disponible')) return false;
        if (kpiF === 'cond-nodisp' && (estCon === 'disponible' || estCon === 'vacante' || estCon === 'sin conductor')) return false;

        // Filtros desplegables
        if (fUni && estUni !== fUni) return false;
        if (fCon && estCon !== fCon) return false;
        if (fCat && catCon !== fCat) return false;

        // Búsqueda global que abarca TODAS las columnas y detalles
        if (q) {
            const cleanPlaca = (item.placa_camion || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const gpsUbicacion = (cleanPlaca && window.dispGpsMap[cleanPlaca]) || item.ubicacion_manual || '';
            const match = 
                (item.placa_camion || '').toLowerCase().includes(q) ||
                (item.placa_carreta || '').toLowerCase().includes(q) ||
                (item.conductor_asignado || '').toLowerCase().includes(q) ||
                (item.conductor_eventual || '').toLowerCase().includes(q) ||
                (item.flota || '').toLowerCase().includes(q) ||
                (item.marca || '').toLowerCase().includes(q) ||
                (item.capacidad_tanque || '').toLowerCase().includes(q) ||
                (item.categoria_conductor || '').toLowerCase().includes(q) ||
                (item.tipo_unidad || '').toLowerCase().includes(q) ||
                (item.estado_conductor || '').toLowerCase().includes(q) ||
                (item.estado_unidad || '').toLowerCase().includes(q) ||
                (item.observaciones || '').toLowerCase().includes(q) ||
                gpsUbicacion.toLowerCase().includes(q);
            if (!match) return false;
        }
        return true;
    });

    window.dispRenderTabla(filtrados);
};

// ── Autocompletado de Placas y Conductores ─────────────────────────
window.dispBuscarPlacaCamion = function (val) {
    const panel = document.getElementById('disp-panel-camion');
    if (!panel) return;

    const q = (val || '').toUpperCase().trim();
    const match = (window.dispPlacas || []).filter(p => {
        const pl = (p.placa || (Array.isArray(p) ? p[0] : '')).toUpperCase();
        const tipo = (p.tipo || (Array.isArray(p) ? p[5] : '')).toUpperCase();
        const esCarreta = tipo.includes('CARRETA') || tipo.includes('REMOLQUE') || tipo.includes('SEMIRREMOLQUE');
        return !esCarreta && (pl.includes(q) || tipo.includes(q));
    }).slice(0, 30);

    if (!match.length) {
        panel.classList.remove('show');
        return;
    }

    panel.innerHTML = match.map(p => {
        const pl = p.placa || (Array.isArray(p) ? p[0] : '');
        const marca = p.marca || (Array.isArray(p) ? p[3] : '');
        const tipo = p.tipo || (Array.isArray(p) ? p[5] : '');
        const cli = p.cliente || (Array.isArray(p) ? p[1] : '');
        return `
            <div class="disp-combo-opt" onclick="window.dispSeleccionarPlacaCamion('${pl}')">
                <span class="fw-bold text-dark">${pl} &nbsp;<span class="text-primary small">(${marca || 'Camión'})</span></span>
                <span class="disp-combo-sub">${tipo} · ${cli || 'Flota'}</span>
            </div>
        `;
    }).join('');
    panel.classList.add('show');
};

window.dispSeleccionarPlacaCamion = function (placa) {
    const inp = document.getElementById('disp-f-placa-camion');
    if (inp) inp.value = placa;
    document.getElementById('disp-panel-camion')?.classList.remove('show');

    const pObj = (window.dispPlacas || []).find(p => (p.placa || (Array.isArray(p) ? p[0] : '')).toUpperCase() === placa.toUpperCase());
    if (pObj) {
        const marca = pObj.marca || (Array.isArray(pObj) ? pObj[3] : '') || '';
        const combustible = pObj.combustible || (Array.isArray(pObj) ? pObj[14] : '') || '';
        const uts = pObj.uts || (Array.isArray(pObj) ? pObj[19] : '') || '';

        const marcaEl = document.getElementById('disp-f-marca');
        if (marcaEl) marcaEl.value = marca.toUpperCase();

        const capTanque = pObj.capacidad_tanque || pObj.tanque_1 || (Array.isArray(pObj) ? pObj[28] : '') || '';
        const capEl = document.getElementById('disp-f-capacidad-tanque');
        if (capEl && capTanque && capTanque !== '0') capEl.value = capTanque;

        const combUpper = combustible.toUpperCase();
        const isGas = combUpper.includes('GAS') || combUpper.includes('GNV') || combUpper.includes('GLP');
        const unitSpan = document.getElementById('disp-f-capacidad-unit');
        if (unitSpan) unitSpan.innerText = isGas ? '(m³)' : '(Gln)';

        const catEl = document.getElementById('disp-f-categoria');
        if (catEl) {
            const utsUpper = uts.toUpperCase();
            catEl.value = utsUpper.includes('LOCAL') ? 'Local' : 'Nacional';
        }

        window.dispCalcularTipoUnidad();

        const cleanPlaca = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const gpsDir = window.dispGpsMap[cleanPlaca];
        const ubiEl = document.getElementById('disp-f-ubicacion');
        if (ubiEl) {
            ubiEl.value = gpsDir || ubiEl.value || '';
        }
    }
};

window.dispBuscarPlacaCarreta = function (val) {
    const panel = document.getElementById('disp-panel-carreta');
    if (!panel) return;

    const q = (val || '').toUpperCase().trim();
    const match = (window.dispPlacas || []).filter(p => {
        const pl = (p.placa || (Array.isArray(p) ? p[0] : '')).toUpperCase();
        const tipo = (p.tipo || (Array.isArray(p) ? p[5] : '')).toUpperCase();
        return pl.includes(q) || tipo.includes(q);
    }).slice(0, 30);

    if (!match.length) {
        panel.classList.remove('show');
        return;
    }

    panel.innerHTML = match.map(p => {
        const pl = p.placa || (Array.isArray(p) ? p[0] : '');
        const tipo = p.tipo || (Array.isArray(p) ? p[5] : '');
        return `
            <div class="disp-combo-opt" onclick="window.dispSeleccionarPlacaCarreta('${pl}')">
                <span class="fw-bold text-dark">${pl}</span>
                <span class="disp-combo-sub">${tipo || 'Carreta / Remolque'}</span>
            </div>
        `;
    }).join('');
    panel.classList.add('show');
};

window.dispSeleccionarPlacaCarreta = function (placa) {
    const inp = document.getElementById('disp-f-placa-carreta');
    if (inp) inp.value = placa;
    document.getElementById('disp-panel-carreta')?.classList.remove('show');
    window.dispCalcularTipoUnidad();
};

window.dispBuscarConductor = function (val, campo) {
    const panelId = campo === 'asignado' ? 'disp-panel-cond-asignado' : 'disp-panel-cond-eventual';
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const q = (val || '').toUpperCase().trim();
    const match = (window.dispConductores || []).filter(c => {
        const nom = (c.nombre || c.nombres || c.conductor || (Array.isArray(c) ? c[1] : '')).toUpperCase();
        return nom.includes(q);
    }).slice(0, 30);

    if (!match.length) {
        panel.classList.remove('show');
        return;
    }

    panel.innerHTML = match.map(c => {
        const nom = c.nombre || c.nombres || c.conductor || (Array.isArray(c) ? c[1] : '');
        const dni = c.dni || c.doc_numero || (Array.isArray(c) ? c[2] : '');
        return `
            <div class="disp-combo-opt" onclick="window.dispSeleccionarConductor('${nom}', '${campo}')">
                <span class="fw-bold text-dark">${nom}</span>
                ${dni ? `<span class="disp-combo-sub">DNI: ${dni}</span>` : ''}
            </div>
        `;
    }).join('');
    panel.classList.add('show');
};

window.dispSeleccionarConductor = function (nombre, campo) {
    const inpId = campo === 'asignado' ? 'disp-f-conductor-asignado' : 'disp-f-conductor-eventual';
    const panelId = campo === 'asignado' ? 'disp-panel-cond-asignado' : 'disp-panel-cond-eventual';
    const inp = document.getElementById(inpId);
    if (inp) inp.value = nombre;
    document.getElementById(panelId)?.classList.remove('show');
};

// Cerrar paneles combo al hacer click fuera
document.addEventListener('click', function (e) {
    if (!e.target.closest('.disp-combo-wrap')) {
        document.querySelectorAll('.disp-combo-panel').forEach(p => p.classList.remove('show'));
    }
});

// ── Concatenación de Tipo de Unidad ───────────────────────────────
window.dispCalcularTipoUnidad = function () {
    const plCamion = (document.getElementById('disp-f-placa-camion')?.value || '').toUpperCase().trim();
    const plCarreta = (document.getElementById('disp-f-placa-carreta')?.value || '').toUpperCase().trim();
    const tipoEl = document.getElementById('disp-f-tipo-unidad');
    if (!tipoEl) return;

    let tipoCamion = '';
    let tipoCarreta = '';

    if (plCamion) {
        const pCam = (window.dispPlacas || []).find(p => (p.placa || (Array.isArray(p) ? p[0] : '')).toUpperCase() === plCamion);
        if (pCam) tipoCamion = pCam.tipo || (Array.isArray(pCam) ? pCam[5] : '') || 'Camión';
    }

    if (plCarreta) {
        const pCar = (window.dispPlacas || []).find(p => (p.placa || (Array.isArray(p) ? p[0] : '')).toUpperCase() === plCarreta);
        if (pCar) tipoCarreta = pCar.tipo || (Array.isArray(pCar) ? pCar[5] : '') || 'Remolque';
    }

    const homologar = (t) => {
        if (/semirremolque/i.test(t)) return 'Remolque';
        return t;
    };

    tipoCamion = homologar(tipoCamion);
    tipoCarreta = homologar(tipoCarreta);

    let finalTipo = '';
    if (tipoCamion && tipoCarreta) finalTipo = `${tipoCamion} - ${tipoCarreta}`;
    else if (tipoCamion) finalTipo = tipoCamion;
    else if (tipoCarreta) finalTipo = tipoCarreta;

    tipoEl.value = finalTipo;
};

// ── Abrir Modal Nuevo Centrado ─────────────────────────────────────
window.dispAbrirModalNuevo = function () {
    const form = document.getElementById('disp-form');
    if (form) form.reset();
    document.getElementById('disp-f-id').value = '';
    document.getElementById('disp-modal-title').innerText = 'Registrar Unidad en Disponibilidad';

    const modalEl = document.getElementById('modalDisponibilidad');
    if (modalEl) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
};

// ── Abrir Modal Editar Centrado ────────────────────────────────────
window.dispEditar = function (id) {
    const item = (window.dispDatos || []).find(x => Number(x.id) === Number(id));
    if (!item) return;

    const plCamion = item.placa_camion || '';
    const cleanPlaca = plCamion.toUpperCase().replace(/[^A-Z0-9]/g, '');

    document.getElementById('disp-f-id').value = item.id;
    document.getElementById('disp-f-placa-camion').value = plCamion;
    document.getElementById('disp-f-placa-carreta').value = item.placa_carreta || '';
    document.getElementById('disp-f-marca').value = item.marca || '';

    const capNum = String(item.capacidad_tanque || '').replace(/[^0-9.]/g, '');
    document.getElementById('disp-f-capacidad').value = capNum || '0';

    const pObj = (window.dispPlacas || []).find(p => (p.placa || (Array.isArray(p) ? p[0] : '')).toUpperCase() === cleanPlaca);
    const combUpper = (pObj?.combustible || '').toUpperCase();
    const isGas = combUpper.includes('GAS') || combUpper.includes('GNV') || combUpper.includes('GLP');
    const unitSpan = document.getElementById('disp-f-capacidad-unit');
    if (unitSpan) unitSpan.innerText = isGas ? '(m³ - Gas)' : '(Gln - Diésel)';

    document.getElementById('disp-f-categoria').value = item.categoria_conductor || 'Nacional';
    document.getElementById('disp-f-tipo-unidad').value = item.tipo_unidad || '';
    document.getElementById('disp-f-conductor-asignado').value = item.conductor_asignado || '';
    document.getElementById('disp-f-conductor-eventual').value = item.conductor_eventual || '';
    document.getElementById('disp-f-estado-conductor').value = item.estado_conductor || 'Disponible';
    document.getElementById('disp-f-estado-unidad').value = item.estado_unidad || 'Disponible';
    
    const gpsDir = window.dispGpsMap[cleanPlaca];
    document.getElementById('disp-f-ubicacion').value = gpsDir || item.ubicacion_manual || '';
    document.getElementById('disp-f-observaciones').value = item.observaciones || '';

    document.getElementById('disp-modal-title').innerText = `Editar Disponibilidad (${plCamion || item.placa_carreta || 'Unidad'})`;

    const modalEl = document.getElementById('modalDisponibilidad');
    if (modalEl) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
};

// ── Guardar Formulario (POST / PUT) ───────────────────────────────
window.dispGuardarFormulario = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('disp-btn-guardar');
    
    const id = document.getElementById('disp-f-id')?.value;
    const plCamion = (document.getElementById('disp-f-placa-camion')?.value || '').trim();
    const plCarreta = (document.getElementById('disp-f-placa-carreta')?.value || '').trim();

    // Validación flexible: al menos una de las dos placas debe ingresarse
    if (!plCamion && !plCarreta) {
        if (typeof window.mostrarToast === 'function') window.mostrarToast('Debe ingresar al menos la Placa del Camión o la Placa de Carreta', 'warning');
        else alert('Debe ingresar al menos la Placa del Camión o la Placa de Carreta');
        return;
    }

    if (btn) btn.disabled = true;

    const cleanPlaca = plCamion.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const pObj = (window.dispPlacas || []).find(p => (p.placa || (Array.isArray(p) ? p[0] : '')).toUpperCase() === cleanPlaca);
    const combUpper = (pObj?.combustible || '').toUpperCase();
    const isGas = combUpper.includes('GAS') || combUpper.includes('GNV') || combUpper.includes('GLP');
    
    const rawCap = document.getElementById('disp-f-capacidad')?.value || '0';
    const cleanCapNum = rawCap.replace(/[^0-9.]/g, '');
    const capTanque = (!cleanCapNum || Number(cleanCapNum) === 0) ? '0' : `${cleanCapNum} ${isGas ? 'm³' : 'Gln'}`;

    const payload = {
        placa_camion: plCamion,
        placa_carreta: plCarreta,
        marca: document.getElementById('disp-f-marca')?.value || '',
        capacidad_tanque: capTanque,
        categoria_conductor: document.getElementById('disp-f-categoria')?.value || 'Nacional',
        tipo_unidad: document.getElementById('disp-f-tipo-unidad')?.value || '',
        conductor_asignado: document.getElementById('disp-f-conductor-asignado')?.value || '',
        conductor_eventual: document.getElementById('disp-f-conductor-eventual')?.value || '',
        estado_conductor: document.getElementById('disp-f-estado-conductor')?.value || 'Disponible',
        estado_unidad: document.getElementById('disp-f-estado-unidad')?.value || 'Disponible',
        ubicacion_manual: document.getElementById('disp-f-ubicacion')?.value || '',
        observaciones: document.getElementById('disp-f-observaciones')?.value || '',
        actualizado_por: localStorage.getItem('fleet_user') || 'Usuario'
    };

    if (!id) {
        payload.creado_por = localStorage.getItem('fleet_user') || 'Usuario';
    }

    try {
        const url = id ? `/api/disponibilidad-flota/${id}` : '/api/disponibilidad-flota';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Error al guardar');

        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(id ? 'Unidad actualizada correctamente' : 'Unidad registrada en disponibilidad', 'success');
        }

        const modalEl = document.getElementById('modalDisponibilidad');
        if (modalEl) {
            const bsModal = bootstrap.Modal.getInstance(modalEl);
            if (bsModal) bsModal.hide();
        }

        window.dispCargarDatos();
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
};
window.guardarFormularioDisponibilidad = window.dispGuardarFormulario;

// ── Eliminar Registro (Modal Circular 1:1 Reporte de Fallas) ───────
window._dispIdAEliminar = null;

window.dispAbrirModalEliminar = function (id, placa) {
    window._dispIdAEliminar = id;
    const txt = document.getElementById('disp-del-placa-txt');
    if (txt) txt.textContent = placa ? `"${placa}"` : '';

    const modalEl = document.getElementById('modalEliminarDisponibilidadConfirm');
    if (modalEl) {
        const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        bsModal.show();
    }
};
window.dispEliminar = window.dispAbrirModalEliminar;

window._ejecutarEliminarDisponibilidadConfirmado = async function () {
    const id = window._dispIdAEliminar;
    if (!id) return;

    const btn = document.getElementById('btnEjecutarEliminarDisponibilidad');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch(`/api/disponibilidad-flota/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al eliminar');

        const modalEl = document.getElementById('modalEliminarDisponibilidadConfirm');
        if (modalEl) {
            const bsModal = bootstrap.Modal.getInstance(modalEl);
            if (bsModal) bsModal.hide();
        }

        if (typeof window.mostrarToast === 'function') window.mostrarToast('Unidad eliminada correctamente', 'info');
        window.dispCargarDatos();
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        if (btn) btn.disabled = false;
        window._dispIdAEliminar = null;
    }
};

// ── Helper para cargar Chart.js si no está presente ────────────────
function _asegurarChartJS() {
    return new Promise((resolve) => {
        if (typeof Chart !== 'undefined') return resolve();
        const script = document.createElement('script');
        script.src = '/libs/chart.min.js';
        script.onload = () => resolve();
        script.onerror = () => {
            console.warn('No se pudo cargar /libs/chart.min.js');
            resolve();
        };
        document.head.appendChild(script);
    });
}

// ── Modal Cuadro Resumen de Disponibilidad de Flota (Estilo Marsisa) ───────────────
window.dispAbrirModalCuadro = async function () {
    const datos = window.dispDatos || [];
    const total = datos.length;

    // Actualizar badge de total
    const totalBadge = document.getElementById('disp-cuadro-total-badge');
    if (totalBadge) totalBadge.textContent = `${total} Unidades Registradas`;

    // Homologador de Subtipo
    function normalizarSubtipo(sub, tipo, fallback) {
        const raw = String(sub || tipo || fallback || '').trim();
        if (/thermo\s*king/i.test(raw)) return 'Thermoking';
        if (/semirremolque/i.test(raw)) return 'Remolque';
        if (/camion|camión/i.test(raw)) return 'Camión';
        if (/carreta/i.test(raw)) return 'Carreta';
        if (/tracto/i.test(raw)) return 'Tracto';
        if (/furgon|furgón/i.test(raw)) return 'Furgón';
        if (/contenedor/i.test(raw)) return 'Contenedor';
        return raw || 'Otros';
    }

    // Configuración visual de los 6 Subtipos Principales (1:1 Imagen Marsisa)
    const subtiposConfig = [
        {
            key: 'Camión',
            label: 'Camión',
            color: '#0284c7', // Cyan / Sky Blue
            bgGrad: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            iconSvg: `<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`
        },
        {
            key: 'Carreta',
            label: 'Carreta',
            color: '#9333ea', // Purple
            bgGrad: 'linear-gradient(135deg, #9333ea 0%, #7e22ce 100%)',
            iconSvg: `<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M19 5H3c-1.1 0-2 .9-2 2v8h2c0 1.66 1.34 3 3 3s3-1.34 3-3h8c0 1.66 1.34 3 3 3s3-1.34 3-3h2V7c0-1.1-.9-2-2-2zm-13 13c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm14 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`
        },
        {
            key: 'Remolque',
            label: 'Remolque / Furgón',
            color: '#15803d', // Dark Forest Green
            bgGrad: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
            iconSvg: `<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v10h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-14 14c-.83 0-1.5-.67-1.5-1.5S5.17 15 6 15s1.5.67 1.5 1.5S6.83 18 6 18zm12 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`
        },
        {
            key: 'Tracto',
            label: 'Tracto',
            color: '#ea580c', // Bright Orange
            bgGrad: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
            iconSvg: `<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M19 7h-3V4H5c-1.1 0-2 .9-2 2v9h2c0 1.66 1.34 3 3 3s3-1.34 3-3h5c0 1.66 1.34 3 3 3s3-1.34 3-3h1V9l-2-2zm-12 9c-.83 0-1.5-.67-1.5-1.5S6.17 13 7 13s1.5.67 1.5 1.5S7.83 16 7 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`
        },
        {
            key: 'Thermoking',
            label: 'Thermoking',
            color: '#1e40af', // Deep Blue / Refrigerated
            bgGrad: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)',
            iconSvg: `<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v12h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3.5c1.38 0 2.5 1.12 2.5 2.5s-1.12 2.5-2.5 2.5S9.5 10.38 9.5 9 10.62 6.5 12 6.5zm-6 11.5c-.83 0-1.5-.67-1.5-1.5S5.17 15 6 15s1.5.67 1.5 1.5S6.83 18 6 18zm12 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`
        },
        {
            key: 'Contenedor',
            label: 'Contenedor',
            color: '#16a34a', // Bright Green / Container
            bgGrad: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
            iconSvg: `<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M2 4h20v16H2V4zm2 2v12h3V6H4zm5 0v12h6V6H9zm8 0v12h3V6h-3z"/></svg>`
        }
    ];

    // Conteo y Matriz
    const conteos = {
        'Camión': 0,
        'Carreta': 0,
        'Remolque': 0,
        'Tracto': 0,
        'Thermoking': 0,
        'Contenedor': 0
    };

    const estadosList = ['Alquilado', 'Disponible', 'Mantenimiento', 'Operativo', 'Programado', 'Tránsito', 'En Proyecto'];
    const matriz = {};
    subtiposConfig.forEach(s => {
        matriz[s.key] = {
            total: 0,
            operativos: 0,
            transito: 0,
            programados: 0,
            mantenimiento: 0,
            alquilados_otros: 0,
            porEstado: {}
        };
        estadosList.forEach(est => matriz[s.key].porEstado[est] = 0);
    });

    datos.forEach(d => {
        const subCam = d.placa_camion ? normalizarSubtipo(d.placa_sub_tipo_camion, d.placa_tipo_camion, d.tipo_unidad) : '';
        const subCar = d.placa_carreta ? normalizarSubtipo(d.carreta_sub_tipo, d.carreta_tipo, 'Carreta') : '';
        const est = (d.estado_unidad || 'Disponible').trim();

        const subsEnFila = [];
        if (subCam) subsEnFila.push(subCam);
        if (subCar) subsEnFila.push(subCar);
        if (!subsEnFila.length && d.tipo_unidad) subsEnFila.push(normalizarSubtipo(d.tipo_unidad, '', ''));

        subsEnFila.forEach(sName => {
            let keyTarget = sName;
            if (keyTarget === 'Furgón') keyTarget = 'Remolque';
            if (!conteos.hasOwnProperty(keyTarget)) keyTarget = 'Contenedor';

            conteos[keyTarget]++;
            if (matriz[keyTarget]) {
                matriz[keyTarget].total++;
                if (matriz[keyTarget].porEstado.hasOwnProperty(est)) {
                    matriz[keyTarget].porEstado[est]++;
                }
                const estLower = est.toLowerCase();
                if (estLower === 'operativo' || estLower === 'disponible') {
                    matriz[keyTarget].operativos++;
                } else if (estLower === 'tránsito') {
                    matriz[keyTarget].transito++;
                } else if (estLower === 'programado') {
                    matriz[keyTarget].programados++;
                } else if (estLower === 'mantenimiento') {
                    matriz[keyTarget].mantenimiento++;
                } else {
                    matriz[keyTarget].alquilados_otros++;
                }
            }
        });
    });

    // 1. Renderizar Tarjetas Superiores
    const cardsContainer = document.getElementById('disp-cuadro-subtipos-cards');
    if (cardsContainer) {
        cardsContainer.innerHTML = subtiposConfig.map(cfg => {
            const count = conteos[cfg.key] || 0;
            return `
            <div class="col-12 col-sm-6 col-md-4 col-lg-2">
                <div class="disp-subtipo-banner-card" style="background: ${cfg.bgGrad};">
                    <div>
                        <div class="disp-subtipo-num">${count}</div>
                        <div class="disp-subtipo-lbl mt-1">${cfg.label}</div>
                    </div>
                    <div class="disp-subtipo-icon-wrap">
                        ${cfg.iconSvg}
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    // 2. Renderizar Matriz / Tabla Desglosada
    const matrizBody = document.getElementById('disp-cuadro-matriz-body');
    if (matrizBody) {
        matrizBody.innerHTML = subtiposConfig.map(cfg => {
            const row = matriz[cfg.key];
            return `
            <tr>
                <td class="fw-bold text-dark">
                    <span class="d-inline-block rounded-circle me-2" style="width:10px;height:10px;background:${cfg.color};"></span>
                    ${cfg.label}
                </td>
                <td class="text-center fw-bolder fs-6 text-primary">${row.total}</td>
                <td class="text-center"><span class="badge bg-success-subtle text-success-emphasis px-2 py-1">${row.operativos}</span></td>
                <td class="text-center"><span class="badge bg-warning-subtle text-warning-emphasis px-2 py-1">${row.transito}</span></td>
                <td class="text-center"><span class="badge bg-info-subtle text-info-emphasis px-2 py-1">${row.programados}</span></td>
                <td class="text-center"><span class="badge bg-danger-subtle text-danger-emphasis px-2 py-1">${row.mantenimiento}</span></td>
                <td class="text-center"><span class="badge bg-secondary-subtle text-secondary-emphasis px-2 py-1">${row.alquilados_otros}</span></td>
            </tr>
            `;
        }).join('');
    }

    // 3. Renderizar Gráfico de Barras Agrupadas con Chart.js
    await _asegurarChartJS();

    const canvas = document.getElementById('chartDispSubtipos');
    if (canvas && typeof Chart !== 'undefined') {
        if (window._chartDispSubtiposInstance) {
            window._chartDispSubtiposInstance.destroy();
        }

        const datasets = subtiposConfig.map(cfg => {
            return {
                label: cfg.label,
                data: estadosList.map(est => matriz[cfg.key].porEstado[est] || 0),
                backgroundColor: cfg.color,
                borderRadius: 6,
                borderSkipped: false
            };
        });

        window._chartDispSubtiposInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: estadosList,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: { family: "'Plus Jakarta Sans', sans-serif", weight: 'bold', size: 12 },
                            boxWidth: 14,
                            padding: 15
                        }
                    },
                    tooltip: {
                        backgroundColor: '#0f172a',
                        titleFont: { family: "'Plus Jakarta Sans', sans-serif", weight: 'bold' },
                        bodyFont: { family: "'Plus Jakarta Sans', sans-serif" },
                        padding: 12,
                        cornerRadius: 10
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: "'Plus Jakarta Sans', sans-serif", weight: '600' } }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, font: { family: "'Plus Jakarta Sans', sans-serif" } },
                        grid: { color: '#f1f5f9' }
                    }
                }
            }
        });
    }

    // Mostrar Modal
    const modalEl = document.getElementById('modalCuadroTiposUnidad');
    if (modalEl) {
        const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        bsModal.show();
    }
};

// ── Exportar a Excel ──────────────────────────────────────────────
window.dispExportarExcel = function () {
    if (!window.dispDatos || !window.dispDatos.length) {
        alert('No hay datos para exportar');
        return;
    }

    let csvContent = '\uFEFF'; // BOM para tildes
    csvContent += 'N°,CONDUCTOR EVENTUAL,CONDUCTOR ASIGNADO,PLACA CAMION,PLACA CARRETA,CAPACIDAD TANQUE,MARCA,CATEGORIA,TIPO UNIDAD,ESTADO CONDUCTOR,ESTADO UNIDAD,UBICACION,OBSERVACIONES\n';

    window.dispDatos.forEach((d, idx) => {
        const cleanPlaca = (d.placa_camion || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const ubi = (window.dispGpsMap[cleanPlaca] || d.ubicacion_manual || '').replace(/"/g, '""');
        const obs = (d.observaciones || '').replace(/"/g, '""');
        const row = [
            idx + 1,
            `"${d.conductor_eventual || ''}"`,
            `"${d.conductor_asignado || ''}"`,
            `"${d.placa_camion || ''}"`,
            `"${d.placa_carreta || ''}"`,
            `"${d.capacidad_tanque || ''}"`,
            `"${d.marca || ''}"`,
            `"${d.categoria_conductor || ''}"`,
            `"${d.tipo_unidad || ''}"`,
            `"${d.estado_conductor || ''}"`,
            `"${d.estado_unidad || ''}"`,
            `"${ubi}"`,
            `"${obs}"`
        ];
        csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Disponibilidad_Flota_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// ── Helper de Escape HTML ─────────────────────────────────────────
function _dispEsc(txt) {
    if (txt === null || txt === undefined) return '';
    return String(txt)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── Iniciar Carga Inmediata al Montar Módulo ───────────────────────
window.dispCargarDatos();
