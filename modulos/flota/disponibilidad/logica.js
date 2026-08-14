// ================================================================
// 🚛 MÓDULO: DISPONIBILIDAD DE FLOTA - LÓGICA AISLADA (ERP)
// ================================================================

window.dispDatos = [];
window.dispPlacas = [];
window.dispConductores = [];
window.dispGpsMap = {};

// ── Cargar Datos del Servidor ─────────────────────────────────────
window.dispCargarDatos = async function () {
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

        // Si la tabla de disponibilidad está vacía pero hay placas registradas, sincronizar automáticamente (máximo 1 intento)
        if (window.dispDatos.length === 0 && window.dispPlacas.length > 0 && !window._dispAutoSyncAttempted) {
            window._dispAutoSyncAttempted = true;
            console.log('📌 Tabla disponibilidad vacía. Sincronizando placas activas automáticamente...');
            await window.dispSincronizarPlacas(true);
            return;
        }

        // Cargar datos de GPS/Wialon para autocompletar ubicaciones
        window.dispCargarGpsMap();

        window.dispActualizarKPIs();
        window.dispFiltrar();
    } catch (err) {
        console.error('Error cargando módulo de disponibilidad:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" class="text-center py-4 text-danger">
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
        else if (estCon && estCon !== 'vacante') condNoDisp++;
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
        const gpsUbicacion = window.dispGpsMap[cleanPlaca] || item.ubicacion_manual || item.ubicacion_manual || 'Sin ubicación GPS';

        // Badge de Estado Conductor
        const estConBadge = window.dispObtenerBadgeEstadoConductor(item.estado_conductor);
        // Badge de Estado Unidad
        const estUniBadge = window.dispObtenerBadgeEstadoUnidad(item.estado_unidad);

        // Capacidad Tanque Formateada (0 por defecto)
        let capTxt = item.capacidad_tanque || '0';
        if (capTxt === '0' || capTxt === 'Gln' || capTxt === 'm³' || !capTxt) capTxt = '0';

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
                    <span class="disp-placa-badge">
                        <i class="bi bi-truck text-secondary"></i> ${_dispEsc(item.placa_camion)}
                    </span>
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
                    <div class="d-flex align-items-center gap-1" style="max-width:280px;" title="${_dispEsc(gpsUbicacion)}">
                        <i class="bi bi-geo-alt-fill text-danger flex-shrink-0" style="font-size:0.85rem;"></i>
                        <span class="text-truncate" style="font-size:0.78rem; color:#475569;">
                            ${_dispEsc(gpsUbicacion)}
                        </span>
                    </div>
                </td>
                <td class="text-center">
                    <div class="d-flex align-items-center justify-content-center gap-1">
                        <button class="btn btn-sm btn-light border p-1 rounded-2 text-primary" onclick="window.dispEditar(${item.id})" title="Editar registro">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                        <button class="btn btn-sm btn-light border p-1 rounded-2 text-danger" onclick="window.dispEliminar(${item.id})" title="Eliminar registro">
                            <i class="bi bi-trash3"></i>
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
        'Día Libre': { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', dot: '#3b82f6' },
        'Entra UTS': { bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe', dot: '#8b5cf6' },
        'Vacaciones': { bg: '#fffbeb', text: '#92400e', border: '#fde68a', dot: '#f59e0b' },
        'Vacante': { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', dot: '#94a3b8' },
        'Faltó': { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', dot: '#ef4444' }
    };
    const conf = map[est] || map['Disponible'];
    return `
        <span class="badge-disp" style="background:${conf.bg}; color:${conf.text}; border:1px solid ${conf.border};">
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
        'Siniestro': { bg: '#450a0a', text: '#fef2f2', border: '#7f1d1d', dot: '#dc2626' },
        'Modificación': { bg: '#fff1f2', text: '#9f1239', border: '#fecdd3', dot: '#f43f5e' },
        'En Proyecto': { bg: '#eef2ff', text: '#3730a3', border: '#c7d2fe', dot: '#6366f1' }
    };
    const conf = map[est] || map['Disponible'];
    return `
        <span class="badge-disp" style="background:${conf.bg}; color:${conf.text}; border:1px solid ${conf.border};">
            <span class="badge-disp-dot" style="background:${conf.dot};"></span>
            ${_dispEsc(est)}
        </span>
    `;
};

// ── Filtrar Tabla ─────────────────────────────────────────────────
window.dispFiltrar = function () {
    const q = (document.getElementById('disp-filtro-search')?.value || '').toLowerCase().trim();
    const fUni = (document.getElementById('disp-filtro-est-uni')?.value || '').toLowerCase().trim();
    const fCon = (document.getElementById('disp-filtro-est-con')?.value || '').toLowerCase().trim();
    const fCat = (document.getElementById('disp-filtro-categoria')?.value || '').toLowerCase().trim();

    const filtrados = (window.dispDatos || []).filter(item => {
        if (fUni && (item.estado_unidad || '').toLowerCase() !== fUni) return false;
        if (fCon && (item.estado_conductor || '').toLowerCase() !== fCon) return false;
        if (fCat && (item.categoria_conductor || '').toLowerCase() !== fCat) return false;

        if (q) {
            const cleanPlaca = (item.placa_camion || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const gpsUbicacion = window.dispGpsMap[cleanPlaca] || item.ubicacion_manual || '';
            const match = 
                (item.placa_camion || '').toLowerCase().includes(q) ||
                (item.placa_carreta || '').toLowerCase().includes(q) ||
                (item.conductor_asignado || '').toLowerCase().includes(q) ||
                (item.conductor_eventual || '').toLowerCase().includes(q) ||
                (item.flota || '').toLowerCase().includes(q) ||
                (item.marca || '').toLowerCase().includes(q) ||
                (item.tipo_unidad || '').toLowerCase().includes(q) ||
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
    // Filtra placas que sean motora o camiones/tractos
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

    // Autocalcular datos derivados
    const pObj = (window.dispPlacas || []).find(p => (p.placa || (Array.isArray(p) ? p[0] : '')).toUpperCase() === placa.toUpperCase());
    if (pObj) {
        const marca = pObj.marca || (Array.isArray(pObj) ? pObj[3] : '') || '';
        const combustible = pObj.combustible || (Array.isArray(pObj) ? pObj[14] : '') || '';
        const uts = pObj.uts || (Array.isArray(pObj) ? pObj[19] : '') || '';

        // Marca
        const marcaEl = document.getElementById('disp-f-marca');
        if (marcaEl) marcaEl.value = marca.toUpperCase();

        // Capacidad Tanque (Unidad según combustible: Gln si Diésel, m³ si Gas)
        const combUpper = combustible.toUpperCase();
        const isGas = combUpper.includes('GAS') || combUpper.includes('GNV') || combUpper.includes('GLP');
        const unitSpan = document.getElementById('disp-f-capacidad-unit');
        if (unitSpan) unitSpan.innerText = isGas ? '(m³ - Gas)' : '(Gln - Diésel)';

        // Categoría Conductor (Local o Nacional según UTS)
        const catEl = document.getElementById('disp-f-categoria');
        if (catEl) {
            const utsUpper = uts.toUpperCase();
            catEl.value = utsUpper.includes('LOCAL') ? 'Local' : 'Nacional';
        }

        // Recalcular Tipo de Unidad Concatenado
        window.dispCalcularTipoUnidad();

        // Ubicación GPS si existe en tiempo real
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

// ── Concatenación de Tipo de Unidad (Semirremolque -> Remolque) ───
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

    // Regla: si dice semirremolque, mostrar "Remolque"
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

// ── Abrir Modal Nuevo ─────────────────────────────────────────────
window.dispAbrirModalNuevo = function () {
    const form = document.getElementById('disp-form');
    if (form) form.reset();
    document.getElementById('disp-f-id').value = '';
    document.getElementById('disp-modal-title').innerText = 'Registrar Unidad en Disponibilidad';

    const offcanvasEl = document.getElementById('offcanvasDisponibilidad');
    if (offcanvasEl) {
        const bsOffcanvas = new bootstrap.Offcanvas(offcanvasEl);
        bsOffcanvas.show();
    }
};

// ── Abrir Modal Editar ────────────────────────────────────────────
window.dispEditar = function (id) {
    const item = (window.dispDatos || []).find(x => Number(x.id) === Number(id));
    if (!item) return;

    const plCamion = item.placa_camion || '';
    const cleanPlaca = plCamion.toUpperCase().replace(/[^A-Z0-9]/g, '');

    document.getElementById('disp-f-id').value = item.id;
    document.getElementById('disp-f-placa-camion').value = plCamion;
    document.getElementById('disp-f-placa-carreta').value = item.placa_carreta || '';
    document.getElementById('disp-f-marca').value = item.marca || '';

    // Extraer sólo el número para el campo de capacidad
    const capNum = String(item.capacidad_tanque || '').replace(/[^0-9.]/g, '');
    document.getElementById('disp-f-capacidad').value = capNum || '0';

    // Detectar unidad de combustible
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
    
    // Ubicación GPS en tiempo real o manual
    const gpsDir = window.dispGpsMap[cleanPlaca];
    document.getElementById('disp-f-ubicacion').value = gpsDir || item.ubicacion_manual || '';
    document.getElementById('disp-f-observaciones').value = item.observaciones || '';

    document.getElementById('disp-modal-title').innerText = `Editar Disponibilidad (${plCamion})`;

    const offcanvasEl = document.getElementById('offcanvasDisponibilidad');
    if (offcanvasEl) {
        const bsOffcanvas = new bootstrap.Offcanvas(offcanvasEl);
        bsOffcanvas.show();
    }
};

// ── Guardar Formulario (POST / PUT) ───────────────────────────────
window.dispGuardarFormulario = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('disp-btn-guardar');
    if (btn) btn.disabled = true;

    const id = document.getElementById('disp-f-id')?.value;
    const plCamion = (document.getElementById('disp-f-placa-camion')?.value || '').trim();
    const cleanPlaca = plCamion.toUpperCase().replace(/[^A-Z0-9]/g, '');

    const pObj = (window.dispPlacas || []).find(p => (p.placa || (Array.isArray(p) ? p[0] : '')).toUpperCase() === cleanPlaca);
    const combUpper = (pObj?.combustible || '').toUpperCase();
    const isGas = combUpper.includes('GAS') || combUpper.includes('GNV') || combUpper.includes('GLP');
    
    const rawCap = document.getElementById('disp-f-capacidad')?.value || '0';
    const cleanCapNum = rawCap.replace(/[^0-9.]/g, '');
    const capTanque = (!cleanCapNum || Number(cleanCapNum) === 0) ? '0' : `${cleanCapNum} ${isGas ? 'm³' : 'Gln'}`;

    const payload = {
        placa_camion: plCamion,
        placa_carreta: document.getElementById('disp-f-placa-carreta')?.value || '',
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

        window.mostrarToast(id ? 'Unidad actualizada correctamente' : 'Unidad registrada en disponibilidad', 'success');

        const offcanvasEl = document.getElementById('offcanvasDisponibilidad');
        if (offcanvasEl) {
            const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
            if (bsOffcanvas) bsOffcanvas.hide();
        }

        window.dispCargarDatos();
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
};

// ── Eliminar Registro ─────────────────────────────────────────────
window.dispEliminar = async function (id) {
    if (!confirm('¿Está seguro de eliminar esta unidad del módulo de disponibilidad?')) return;

    try {
        const res = await fetch(`/api/disponibilidad-flota/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al eliminar');

        window.mostrarToast('Registro eliminado', 'info');
        window.dispCargarDatos();
    } catch (err) {
        alert('Error: ' + err.message);
    }
};

// ── Sincronizar Placas Activas ────────────────────────────────────
window.dispSincronizarPlacas = async function (silencioso) {
    try {
        const res = await fetch('/api/disponibilidad-flota/sincronizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: localStorage.getItem('fleet_user') || 'Sistema' })
        });
        const data = await res.json();
        if (!silencioso && data.message) {
            window.mostrarToast(data.message, 'success');
        }
        window.dispCargarDatos();
    } catch (e) {
        if (!silencioso) alert('Error al sincronizar: ' + e.message);
    }
};

// ── Exportar a Excel ──────────────────────────────────────────────
window.dispExportarExcel = function () {
    if (!window.dispDatos || !window.dispDatos.length) {
        alert('No hay datos para exportar');
        return;
    }

    let csvContent = '\uFEFF'; // BOM para tildes
    csvContent += 'N°,CONDUCTOR EVENTUAL,CONDUCTOR ASIGNADO,PLACA CAMION,PLACA CARRETA,CAPACIDAD TANQUE,MARCA,CATEGORIA,TIPO UNIDAD,ESTADO CONDUCTOR,ESTADO UNIDAD,UBICACION\n';

    window.dispDatos.forEach((d, idx) => {
        const cleanPlaca = (d.placa_camion || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const ubi = (window.dispGpsMap[cleanPlaca] || d.ubicacion_manual || '').replace(/"/g, '""');
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
            `"${ubi}"`
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

