// ================================================================
// 🚛 MÓDULO: DISPONIBILIDAD DE FLOTA - LÓGICA AISLADA (ERP)
// ================================================================

window.dispDatos = [];
window.dispPlacas = [];
window.dispConductores = [];
window._dispFiltroCard = 'TODOS';
window._dispFiltroEmpresa = 'TODAS';
window._dispItemEliminarId = null;

// ── Cargar Datos del Servidor ─────────────────────────────────────
window.dispCargarDatos = async function (forzarRefresh = false) {
    if (typeof window.checkPerm === 'function' && !window.checkPerm('disponibilidad', 'l')) {
        const tbody = document.getElementById('disp-table-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center py-5 text-danger">
                        <i class="bi bi-shield-lock-fill fs-2 d-block mb-2"></i>
                        No tiene permisos asignados para acceder a Disponibilidad de Flota.
                    </td>
                </tr>
            `;
        }
        return;
    }

    const tbody = document.getElementById('disp-table-body');
    const cardContainer = document.getElementById('dispCardContainer');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-5 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    Cargando disponibilidad de flota...
                </td>
            </tr>
        `;
    }
    if (cardContainer) {
        cardContainer.innerHTML = `
            <div class="text-center py-5 text-muted">
                <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                Cargando unidades...
            </div>
        `;
    }

    try {
        const [resDisp, resPlacas, resCond, resGps] = await Promise.all([
            fetch('/api/disponibilidad-flota').then(r => r.json()).catch(() => []),
            fetch('/api/placas-lista').then(r => r.json()).catch(() => []),
            fetch('/api/conductores-lista').then(r => r.json()).catch(() => []),
            (typeof CACHE !== 'undefined' && Array.isArray(CACHE.wialon) && CACHE.wialon.length > 0)
                ? Promise.resolve({ data: CACHE.wialon })
                : fetch('/api/script/obtenerDatosWialon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [] }) }).then(r => r.json()).catch(() => ({ data: [] }))
        ]);

        window.dispDatos = Array.isArray(resDisp) ? resDisp : (resDisp.data || []);
        window.dispPlacas = Array.isArray(resPlacas) ? resPlacas : (resPlacas.data || []);
        window.dispConductores = Array.isArray(resCond) ? resCond : (resCond.data || []);
        
        window._dispGpsData = (resGps && resGps.data && Array.isArray(resGps.data)) ? resGps.data : [];
        if (typeof CACHE !== 'undefined' && window._dispGpsData.length > 0) {
            CACHE.wialon = window._dispGpsData;
        }

        window._dispGpsMap = {};
        window._dispGpsData.forEach(g => {
            const p = (g.placa || '').replace(/[^A-Z0-9]/g, '');
            if (p) window._dispGpsMap[p] = g;
        });

        window.dispRenderizarSegmentedEmpresas();
        window.dispActualizarKPIs();
        window.dispFiltrar();
    } catch (err) {
        console.error('Error cargando disponibilidad de flota:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" class="text-center py-4 text-danger">
                        <i class="bi bi-exclamation-triangle-fill me-1"></i> Error al cargar datos: ${err.message}
                    </td>
                </tr>
            `;
        }
        if (cardContainer) {
            cardContainer.innerHTML = `
                <div class="text-center py-4 text-danger">
                    <i class="bi bi-exclamation-triangle-fill me-1"></i> Error al cargar datos.
                </div>
            `;
        }
    }
};

// ── Helper: Determinar Estado Unificado de la Unidad / Fila ─────────────
window._dispDeterminarEstadoFila = function (item) {
    if (!item) return 'En Base';
    const est = (item.estado || '').toString().trim().toLowerCase();

    // 1. Mantenimiento / Taller
    if (est.includes('mant') || est.includes('taller')) {
        return 'En Mantenimiento';
    }

    // 2. En Ruta
    if (est.includes('ruta') || est.includes('viaje')) {
        return 'En Ruta';
    }

    // 3. En Base (por defecto)
    return 'En Base';
};

// ── Helper: Extraer Placas Individuales (Consolidación Real de Flota) ────
function _dispExtraerPlacas(lista, aplicarFiltros = false) {
    const q = (document.getElementById('dispBuscador')?.value || '').toLowerCase().trim();
    const filtroCard = window._dispFiltroCard || 'TODOS';
    const filtroEmp = window._dispFiltroEmpresa || 'TODAS';

    const placas = [];

    (lista || []).forEach(d => {
        const empPrincipal = (d.empresa || d.cliente || '').trim();
        const empCarreta = (d.empresa_carreta || d.empresa || d.cliente || '').trim();

        // 1. Unidad Motora (Camión / Tracto)
        if (d.placa_camion) {
            const estCamion = window._dispDeterminarEstadoFila({ estado: d.estado });
            const pCamion = {
                placa: d.placa_camion,
                es_motora: true,
                tipo_unidad: d.tipo_unidad || 'Camión',
                sub_tipo: d.sub_tipo || d.tipo_unidad || 'Camión',
                estado: estCamion,
                empresa: empPrincipal,
                marca: d.marca || '',
                conductor: d.conductor_asignado || '',
                observaciones: d.observaciones || '',
                capacidad_tanque: d.capacidad_tanque || ''
            };

            let include = true;
            if (aplicarFiltros) {
                if (filtroCard !== 'TODOS' && estCamion !== filtroCard) include = false;
                if (filtroEmp !== 'TODAS' && !window._coincideEmpresa(pCamion.empresa, filtroEmp)) include = false;
                if (q) {
                    const matches = [pCamion.placa, pCamion.sub_tipo, pCamion.conductor, pCamion.marca, pCamion.empresa, pCamion.estado, pCamion.observaciones]
                        .some(v => String(v).toLowerCase().includes(q));
                    if (!matches) include = false;
                }
            }
            if (include) placas.push(pCamion);
        }

        // 2. Unidad Carreta / Remolque
        if (d.placa_carreta) {
            const estCarreta = window._dispDeterminarEstadoFila({ estado: d.estado_carreta || d.estado });
            const pCarreta = {
                placa: d.placa_carreta,
                es_motora: false,
                tipo_unidad: d.tipo_unidad_carreta || 'Carreta',
                sub_tipo: d.sub_tipo_carreta || d.sub_tipo || 'Carreta',
                estado: estCarreta,
                empresa: empCarreta,
                marca: d.marca_carreta || d.marca || '',
                conductor: d.conductor_asignado || '',
                observaciones: d.observaciones || '',
                capacidad_tanque: '—'
            };

            let include = true;
            if (aplicarFiltros) {
                if (filtroCard !== 'TODOS' && estCarreta !== filtroCard) include = false;
                if (filtroEmp !== 'TODAS' && !window._coincideEmpresa(pCarreta.empresa, filtroEmp)) include = false;
                if (q) {
                    const matches = [pCarreta.placa, pCarreta.sub_tipo, pCarreta.conductor, pCarreta.marca, pCarreta.empresa, pCarreta.estado, pCarreta.observaciones]
                        .some(v => String(v).toLowerCase().includes(q));
                    if (!matches) include = false;
                }
            }
            if (include) placas.push(pCarreta);
        }
    });

    return placas;
}

window._canonizarNombreEmpresa = window._canonizarNombreEmpresa || function(emp) {
    if (!emp) return '';
    const clean = emp.toString().trim().toUpperCase();
    const raw = clean.replace(/[^A-Z0-9]/g, '');
    if (raw.includes('MARSISA')) return 'MARSISA S.A.C.';
    if (raw.includes('TRAHESA')) return 'TRAHESA S.A.C.';
    if (raw.includes('YOGUI')) return 'YOGUI TRANSPORT S.A.C.';
    if (raw.includes('ROSYMAR')) return 'ROSYMAR PERU S.A.C.';
    return clean;
};

window._coincideEmpresa = window._coincideEmpresa || function(empTarget, empFiltro) {
    if (!empFiltro || empFiltro === 'TODAS') return true;
    const t = window._canonizarNombreEmpresa(empTarget);
    const f = window._canonizarNombreEmpresa(empFiltro);
    if (t === f) return true;
    const rawT = (empTarget || '').toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const rawF = (empFiltro || '').toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return rawT === rawF || rawT.includes(rawF) || rawF.includes(rawT);
};

// ── Renderizar Botones Segmentados de Empresas Dinámicamente ──
window.dispRenderizarSegmentedEmpresas = function () {
    const container = document.getElementById('btn-group-empresas-disp');
    if (!container) return;

    const empresasMap = new Map();
    (window.dispDatos || []).forEach(d => {
        const raw1 = (d.empresa || d.cliente || '').trim();
        if (raw1 && raw1 !== '-' && raw1.toUpperCase() !== 'CLIENTE') {
            const canon = window._canonizarNombreEmpresa(raw1);
            const key = canon.toUpperCase();
            if (!empresasMap.has(key)) {
                empresasMap.set(key, canon);
            }
        }
        const raw2 = (d.empresa_carreta || '').trim();
        if (raw2 && raw2 !== '-' && raw2.toUpperCase() !== 'CLIENTE') {
            const canon = window._canonizarNombreEmpresa(raw2);
            const key = canon.toUpperCase();
            if (!empresasMap.has(key)) {
                empresasMap.set(key, canon);
            }
        }
    });

    const empresas = Array.from(empresasMap.values()).sort();
    const isTodasActive = !window._dispFiltroEmpresa || window._dispFiltroEmpresa === 'TODAS';

    let html = `<button type="button" class="ck-segment-item ${isTodasActive ? 'active' : ''}" data-empresa="TODAS" onclick="window.dispFiltrarPorEmpresa('TODAS', this)">Todas</button>`;

    empresas.forEach(emp => {
        const isActive = !isTodasActive && window._coincideEmpresa(emp, window._dispFiltroEmpresa) ? 'active' : '';
        html += `<button type="button" class="ck-segment-item ${isActive}" data-empresa="${_dispEsc(emp)}" onclick="window.dispFiltrarPorEmpresa('${_dispEsc(emp)}', this)">${_dispEsc(emp)}</button>`;
    });

    container.innerHTML = html;
};

// ── Actualizar Métricas Superiores (Bento KPIs de Flota Real Dinámicos 1:1 con la Tabla) ──
window.dispActualizarKPIs = function () {
    const filtroEmp = window._dispFiltroEmpresa || 'TODAS';
    const q = (document.getElementById('dispBuscador')?.value || '').toLowerCase().trim();

    let total = 0;
    let enBase = 0;
    let enRuta = 0;
    let enMant = 0;

    (window.dispDatos || []).forEach(item => {
        // 1. Unidad Motora (Camión / Tracto)
        if (item.placa_camion) {
            const empCamion = item.empresa || item.cliente || '';
            let includeCamion = true;
            if (filtroEmp !== 'TODAS' && !window._coincideEmpresa(empCamion, filtroEmp)) {
                includeCamion = false;
            }
            if (q) {
                const matches = [
                    item.placa_camion || '',
                    item.conductor_asignado || '',
                    item.marca || '',
                    item.tipo_unidad || '',
                    item.sub_tipo || '',
                    item.estado || '',
                    item.empresa || '',
                    item.cliente || '',
                    item.observaciones || '',
                    item.capacidad_tanque || ''
                ].some(val => String(val).toLowerCase().includes(q));
                if (!matches) includeCamion = false;
            }

            if (includeCamion) {
                total++;
                const estCamion = window._dispDeterminarEstadoFila({ estado: item.estado });
                if (estCamion === 'En Mantenimiento') {
                    enMant++;
                } else if (estCamion === 'En Ruta') {
                    enRuta++;
                } else {
                    enBase++;
                }
            }
        }

        // 2. Unidad No Motora (Carreta / Semirremolque)
        if (item.placa_carreta) {
            const empCarreta = item.empresa_carreta || item.empresa || item.cliente || '';
            let includeCarreta = true;
            if (filtroEmp !== 'TODAS' && !window._coincideEmpresa(empCarreta, filtroEmp)) {
                includeCarreta = false;
            }
            if (q) {
                const matches = [
                    item.placa_carreta || '',
                    item.conductor_asignado || '',
                    item.marca_carreta || item.marca || '',
                    item.sub_tipo_carreta || item.sub_tipo || '',
                    item.tipo_unidad || '',
                    item.estado_carreta || item.estado || '',
                    item.empresa_carreta || item.empresa || '',
                    item.cliente || '',
                    item.observaciones || ''
                ].some(val => String(val).toLowerCase().includes(q));
                if (!matches) includeCarreta = false;
            }

            if (includeCarreta) {
                total++;
                const estCarreta = window._dispDeterminarEstadoFila({ estado: item.estado_carreta || item.estado });
                if (estCarreta === 'En Mantenimiento') {
                    enMant++;
                } else if (estCarreta === 'En Ruta') {
                    enRuta++;
                } else {
                    enBase++;
                }
            }
        }
    });

    const setKpi = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    setKpi('disp-kpi-total', total);
    setKpi('disp-kpi-base', enBase);
    setKpi('disp-kpi-ruta', enRuta);
    setKpi('disp-kpi-mant', enMant);
};

// ── Filtro Nivel 1: Click en Cards Superiores (Estado) ─────────────
window.dispFiltrarPorCard = function (estado, el) {
    if (window._dispFiltroCard === estado && estado !== 'TODOS') {
        window._dispFiltroCard = 'TODOS';
    } else {
        window._dispFiltroCard = estado || 'TODOS';
    }

    const currentCard = window._dispFiltroCard;
    const cardMap = {
        'En Base': 'disp-kpi-card-base',
        'En Ruta': 'disp-kpi-card-ruta',
        'En Mantenimiento': 'disp-kpi-card-mant',
        'TODOS': 'disp-kpi-card-total'
    };
    const targetId = cardMap[currentCard] || 'disp-kpi-card-total';

    // Actualizar clase activa en cards superiores respetando el filtro de empresa actual
    document.querySelectorAll('#disponibilidad-app .ck-kpi-card, #disp-kpi-row .ck-kpi-card').forEach(function(card) {
        card.classList.toggle('active', card.id === targetId);
    });

    window.dispFiltrar();
};

window.dispFiltrarPorEstado = window.dispFiltrarPorCard;

// ── Filtro Nivel 2: Click en Botones Segmentados (Empresa) ────────
window.dispFiltrarPorEmpresa = function (empresa, btn) {
    window._dispFiltroEmpresa = empresa || 'TODAS';

    // Actualizar clase activa en segmented control inferior
    document.querySelectorAll('#btn-group-empresas-disp .ck-segment-item').forEach(function(b) {
        const bEmp = b.getAttribute('data-empresa');
        b.classList.toggle('active', b === btn || bEmp === window._dispFiltroEmpresa);
    });

    window.dispFiltrar();
};

window._dispVistaActiva = 'tablero';
window._dispFiltroSubTipo = 'TODOS';
window._dispChartInstance = null;

// ── Conmutador de Vista (Tablero vs Gráficos) ─────────────────────
window.dispCambiarVista = function (vista, btn) {
    window._dispVistaActiva = vista || 'tablero';

    // Actualizar botones segmentados
    document.querySelectorAll('#disp-view-switcher .ck-segment-item').forEach(function(b) {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
    else {
        const targetBtn = document.getElementById(vista === 'graficos' ? 'disp-tab-graficos' : 'disp-tab-tablero');
        if (targetBtn) targetBtn.classList.add('active');
    }

    const vistaTablero = document.getElementById('disp-vista-tablero');
    const vistaGraficos = document.getElementById('disp-vista-graficos');
    const kpiRow = document.getElementById('disp-kpi-row');
    const isMobile = window.innerWidth < 768;

    if (vista === 'graficos') {
        if (vistaTablero) vistaTablero.style.setProperty('display', 'none', 'important');
        if (vistaGraficos) vistaGraficos.style.setProperty('display', 'flex', 'important');
        if (kpiRow) kpiRow.style.setProperty('display', 'none', 'important');

        const triggerRender = function() {
            window.dispFiltrar();
        };

        if (typeof Chart === 'undefined' && typeof window.loadCharts === 'function') {
            window.loadCharts().then(function() {
                setTimeout(triggerRender, 30);
            });
        } else {
            setTimeout(triggerRender, 30);
        }
    } else {
        if (vistaGraficos) vistaGraficos.style.setProperty('display', 'none', 'important');
        if (vistaTablero) vistaTablero.style.setProperty('display', 'flex', 'important');
        if (kpiRow) kpiRow.style.setProperty('display', 'flex', 'important');
        window.dispFiltrar();
    }
};

// ── Configuración de Colores e Iconos Vectoriales por Sub Tipo ─────
window._dispSubTipoConfigs = {
    'Camión': {
        bg: 'linear-gradient(135deg, #0284c7, #0369a1)',
        color: '#0284c7',
        lightBg: '#eff6ff',
        iconDesktop: `<svg viewBox="0 0 64 36" width="38" height="22" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));"><rect x="3" y="5" width="34" height="22" rx="2" fill="rgba(255,255,255,0.3)" stroke="#ffffff" stroke-width="2.2" /><path d="M37 12 h14 l6 7 v8 h-20 z" fill="rgba(255,255,255,0.4)" stroke="#ffffff" stroke-width="2.2" /><path d="M41 15 h9 l4 4 h-13 z" fill="#ffffff" opacity="0.9" /><circle cx="14" cy="27" r="4.5" fill="#ffffff" stroke="#0284c7" stroke-width="2" /><circle cx="48" cy="27" r="4.5" fill="#ffffff" stroke="#0284c7" stroke-width="2" /></svg>`,
        iconMobile: `<i class="bi bi-truck fs-5" style="color: #0284c7;"></i>`
    },
    'Carreta': {
        bg: 'linear-gradient(135deg, #9333ea, #7e22ce)',
        color: '#9333ea',
        lightBg: '#faf5ff',
        iconDesktop: `<svg viewBox="0 0 64 36" width="38" height="22" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));"><path d="M5 8 h52 v18 h-52 z" fill="rgba(255,255,255,0.25)" stroke="#ffffff" stroke-width="2.2" /><path d="M5 8 h52 v6 h-52 z" fill="rgba(255,255,255,0.65)" stroke="#ffffff" stroke-width="1.5" /><line x1="5" y1="20" x2="57" y2="20" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="3,2" /><circle cx="38" cy="27" r="4.5" fill="#ffffff" stroke="#9333ea" stroke-width="2" /><circle cx="49" cy="27" r="4.5" fill="#ffffff" stroke="#9333ea" stroke-width="2" /><path d="M12 26 v4 M16 26 v4" stroke="#ffffff" stroke-width="2" /></svg>`,
        iconMobile: `<i class="bi bi-link-45deg fs-4" style="color: #9333ea;"></i>`
    },
    'Tracto': {
        bg: 'linear-gradient(135deg, #ea580c, #c2410c)',
        color: '#ea580c',
        lightBg: '#fff7ed',
        iconDesktop: `<svg viewBox="0 0 64 36" width="38" height="22" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));"><path d="M10 6 h20 v8 h16 l9 9 v6 h-45 z" fill="rgba(255,255,255,0.3)" stroke="#ffffff" stroke-width="2.2" /><path d="M30 14 h13 l6 7 h-19 z" fill="#ffffff" opacity="0.9" /><circle cx="18" cy="28" r="4.5" fill="#ffffff" stroke="#ea580c" stroke-width="2" /><circle cx="46" cy="28" r="4.5" fill="#ffffff" stroke="#ea580c" stroke-width="2" /><line x1="10" y1="18" x2="28" y2="18" stroke="#ffffff" stroke-width="1.8" /></svg>`,
        iconMobile: `<i class="bi bi-truck-flatbed fs-5" style="color: #ea580c;"></i>`
    },
    'Remolque': {
        bg: 'linear-gradient(135deg, #15803d, #166534)',
        color: '#15803d',
        lightBg: '#f0fdf4',
        iconDesktop: `<svg viewBox="0 0 64 36" width="38" height="22" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));"><rect x="5" y="6" width="52" height="21" rx="2" fill="rgba(255,255,255,0.3)" stroke="#ffffff" stroke-width="2.2" /><line x1="57" y1="6" x2="57" y2="27" stroke="#ffffff" stroke-width="3" /><circle cx="38" cy="28" r="4.5" fill="#ffffff" stroke="#15803d" stroke-width="2" /><circle cx="49" cy="28" r="4.5" fill="#ffffff" stroke="#15803d" stroke-width="2" /><path d="M12 27 v4 M16 27 v4" stroke="#ffffff" stroke-width="2" /></svg>`,
        iconMobile: `<i class="bi bi-box-seam-fill fs-5" style="color: #15803d;"></i>`
    },
    'Thermo King': {
        bg: 'linear-gradient(135deg, #0891b2, #0e7490)',
        color: '#0891b2',
        lightBg: '#ecfeff',
        iconDesktop: `<i class="bi bi-snow2" style="font-size: 1.85rem; color: #ffffff; text-shadow: 0 2px 4px rgba(0,0,0,0.3);"></i>`,
        iconMobile: `<i class="bi bi-snow2 fs-5" style="color: #0891b2;"></i>`
    },
    'Furgón': {
        bg: 'linear-gradient(135deg, #4f46e5, #4338ca)',
        color: '#4f46e5',
        lightBg: '#eef2ff',
        iconDesktop: `<svg viewBox="0 0 64 36" width="38" height="22" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));"><rect x="5" y="6" width="52" height="21" rx="2" fill="rgba(255,255,255,0.3)" stroke="#ffffff" stroke-width="2.2" /><line x1="28" y1="6" x2="28" y2="27" stroke="#ffffff" stroke-width="1.8" stroke-dasharray="3,2" /><circle cx="38" cy="28" r="4.5" fill="#ffffff" stroke="#4f46e5" stroke-width="2" /><circle cx="49" cy="28" r="4.5" fill="#ffffff" stroke="#4f46e5" stroke-width="2" /><path d="M12 27 v4 M16 27 v4" stroke="#ffffff" stroke-width="2" /></svg>`,
        iconMobile: `<i class="bi bi-box-fill fs-5" style="color: #4f46e5;"></i>`
    },
    'PLATAFORMA': {
        bg: 'linear-gradient(135deg, #d97706, #b45309)',
        color: '#d97706',
        lightBg: '#fffbeb',
        iconDesktop: `<svg viewBox="0 0 64 36" width="38" height="22" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));"><rect x="4" y="18" width="54" height="6" rx="1" fill="rgba(255,255,255,0.4)" stroke="#ffffff" stroke-width="2.2" /><circle cx="38" cy="27" r="4.5" fill="#ffffff" stroke="#d97706" stroke-width="2" /><circle cx="49" cy="27" r="4.5" fill="#ffffff" stroke="#d97706" stroke-width="2" /><path d="M12 24 v5 M16 24 v5" stroke="#ffffff" stroke-width="2" /><path d="M4 18 l4 -6 h4" stroke="#ffffff" stroke-width="2" /></svg>`,
        iconMobile: `<i class="bi bi-layers-fill fs-5" style="color: #d97706;"></i>`
    },
    'Contenedor': {
        bg: 'linear-gradient(135deg, #0d9488, #115e59)',
        color: '#0d9488',
        lightBg: '#f0fdfa',
        iconDesktop: `<svg viewBox="0 0 64 36" width="38" height="22" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));"><rect x="5" y="8" width="54" height="18" rx="2" fill="rgba(255,255,255,0.3)" stroke="#ffffff" stroke-width="2.2" /><line x1="16" y1="8" x2="16" y2="26" stroke="#ffffff" stroke-width="1.8" /><line x1="27" y1="8" x2="27" y2="26" stroke="#ffffff" stroke-width="1.8" /><line x1="38" y1="8" x2="38" y2="26" stroke="#ffffff" stroke-width="1.8" /><line x1="49" y1="8" x2="49" y2="26" stroke="#ffffff" stroke-width="1.8" /></svg>`,
        iconMobile: `<i class="bi bi-archive-fill fs-5" style="color: #0d9488;"></i>`
    }
};

function getSubTipoStyle(st) {
    const norm = String(st || '').trim();
    if (window._dispSubTipoConfigs[norm]) return window._dispSubTipoConfigs[norm];
    const normUpper = norm.toUpperCase();
    if (normUpper.includes('THERMO')) return window._dispSubTipoConfigs['Thermo King'];
    if (normUpper.includes('TRACTO')) return window._dispSubTipoConfigs['Tracto'];
    if (normUpper.includes('CAMION')) return window._dispSubTipoConfigs['Camión'];
    if (normUpper.includes('CARRETA')) return window._dispSubTipoConfigs['Carreta'];
    if (normUpper.includes('REMOLQUE')) return window._dispSubTipoConfigs['Remolque'];
    if (normUpper.includes('FURGON')) return window._dispSubTipoConfigs['Furgón'];
    if (normUpper.includes('CONTENEDOR')) return window._dispSubTipoConfigs['Contenedor'];
    if (normUpper.includes('PLATAFORMA')) return window._dispSubTipoConfigs['PLATAFORMA'];
    
    return {
        bg: 'linear-gradient(135deg, #64748b, #475569)',
        color: '#64748b',
        lightBg: '#f1f5f9',
        iconDesktop: `<svg viewBox="0 0 64 36" width="38" height="22" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="8" width="54" height="18" rx="2" fill="rgba(255,255,255,0.3)" stroke="#ffffff" stroke-width="2" /><circle cx="38" cy="27" r="4" fill="#ffffff" /><circle cx="49" cy="27" r="4" fill="#ffffff" /></svg>`,
        iconMobile: `<i class="bi bi-truck fs-5" style="color: #64748b;"></i>`
    };
}

// ── Filtro por Sub Tipo en Vista Gráficos ─────────────────────────
window.dispFiltrarPorSubTipo = function (subtipo, el) {
    if (window._dispFiltroSubTipo === subtipo) {
        window._dispFiltroSubTipo = 'TODOS';
    } else {
        window._dispFiltroSubTipo = subtipo;
    }

    const badgeFiltro = document.getElementById('disp-graficos-subtipo-filtro-badge');
    if (badgeFiltro) {
        badgeFiltro.innerText = window._dispFiltroSubTipo === 'TODOS' ? 'Todos los Subtipos' : `Subtipo: ${window._dispFiltroSubTipo}`;
    }

    window.dispFiltrar();
};

// ── Filtrado y Render (Desktop + Móvil + Gráficos) ────────────────
window.dispFiltrar = function () {
    const q = (document.getElementById('dispBuscador')?.value || '').toLowerCase().trim();
    const filtroCard = window._dispFiltroCard || 'TODOS';
    const filtroEmp = window._dispFiltroEmpresa || 'TODAS';

    const filtrados = (window.dispDatos || []).filter(item => {
        const empCamion = item.empresa || item.cliente || '';
        const empCarreta = item.empresa_carreta || item.empresa || item.cliente || '';
        const camionPertenece = item.placa_camion && (filtroEmp === 'TODAS' || window._coincideEmpresa(empCamion, filtroEmp));
        const carretaPertenece = item.placa_carreta && (filtroEmp === 'TODAS' || window._coincideEmpresa(empCarreta, filtroEmp));

        // Filtro 1: Empresa Segmentada
        if (filtroEmp !== 'TODAS') {
            if (!camionPertenece && !carretaPertenece) {
                return false;
            }
        }

        // Filtro 2: Card Superior (Estado Consolidado)
        if (filtroCard !== 'TODOS') {
            const estCamion = window._dispDeterminarEstadoFila({ estado: item.estado });
            const estCarreta = window._dispDeterminarEstadoFila({ estado: item.estado_carreta || item.estado });

            let matches = false;
            if (camionPertenece && estCamion === filtroCard) matches = true;
            if (carretaPertenece && estCarreta === filtroCard) matches = true;
            if (!camionPertenece && !carretaPertenece) {
                if (estCamion === filtroCard || estCarreta === filtroCard) matches = true;
            }

            if (!matches) return false;
        }

        // Filtro 3: Buscador Universal
        if (q) {
            const matches = [
                item.placa_camion || '',
                item.placa_carreta || '',
                item.conductor_asignado || '',
                item.marca || '',
                item.tipo_unidad || '',
                item.sub_tipo || '',
                item.sub_tipo_carreta || '',
                item.estado || '',
                item.estado_carreta || '',
                item.empresa || '',
                item.empresa_carreta || '',
                item.cliente || '',
                item.observaciones || '',
                item.capacidad_tanque || ''
            ].some(val => String(val).toLowerCase().includes(q));

            if (!matches) return false;
        }

        return true;
    });

    // Actualizar dinámicamente los KPIs superiores según empresa y filtros
    window.dispActualizarKPIs();

    // Guardar referencia del arreglo filtrado actual
    window._dispFiltrados = filtrados;

    // Renderizar Tablero (Tabla + Mobile Cards)
    window.dispRenderizarTabla(filtrados);
    window.dispRenderizarCardsMobile(filtrados);

    // Renderizar Gráficos y Cards por Sub Tipo (solo cuando la vista activa es Gráficos)
    if (window._dispVistaActiva === 'graficos') {
        window.dispRenderizarGraficosSubTipos(filtrados);
    }
};

// ── Renderizar Gráficos y Métricas por Sub Tipo (Imagen 3) ────────
window.dispRenderizarGraficosSubTipos = function (datosFiltrados) {
    if (window._dispVistaActiva !== 'graficos') return;
    const isMobile = window.innerWidth < 768;

    // Extraer placas individuales respetando los filtros activos (empresa, buscador, etc.)
    const placasList = _dispExtraerPlacas(window.dispDatos || [], true);
    const subTiposMap = {};

    // Agrupar placas por sub_tipo
    placasList.forEach(p => {
        const st = (p.sub_tipo || p.tipo_unidad || 'General').trim();
        if (!subTiposMap[st]) subTiposMap[st] = { total: 0, base: 0, ruta: 0, mant: 0 };
        subTiposMap[st].total++;
        const est = (p.estado || 'En Base').toLowerCase();
        if (est.includes('mant') || est.includes('taller')) subTiposMap[st].mant++;
        else if (est.includes('ruta')) subTiposMap[st].ruta++;
        else subTiposMap[st].base++;
    });

    const subTipos = Object.keys(subTiposMap).sort((a, b) => subTiposMap[b].total - subTiposMap[a].total);

    // Actualizar Título con la Empresa Activa y Total Placas
    const tituloEmp = document.getElementById('disp-graficos-empresa-titulo');
    if (tituloEmp) {
        tituloEmp.innerText = window._dispFiltroEmpresa === 'TODAS' ? 'TOTAL FLOTA' : window._dispFiltroEmpresa;
    }

    // 1. Render Sub Tipos Cards (Desktop: 1 Single Row | Móvil: 2-Col Apple Grid)
    const cardsCont = document.getElementById('disp-subtipos-cards-container');
    if (cardsCont) {
        if (!subTipos.length) {
            cardsCont.innerHTML = '<div class="col-12 text-center text-muted py-4"><i class="bi bi-inbox fs-2 d-block mb-1 text-secondary"></i>No hay sub tipos disponibles para los filtros seleccionados.</div>';
        } else {
            cardsCont.innerHTML = subTipos.map(st => {
                const item = subTiposMap[st];
                const cfg = getSubTipoStyle(st);
                const isActive = window._dispFiltroSubTipo === st ? 'active' : '';

                if (isMobile) {
                    return `
                        <div class="disp-subtipo-item-col">
                            <div class="disp-subtipo-card ${isActive}" onclick="window.dispFiltrarPorSubTipo('${_dispEsc(st)}', this)" title="Filtrar por ${st}">
                                <div>
                                    <span class="disp-card-lbl">${_dispEsc(st)}</span>
                                    <h2 class="disp-card-num">${item.total}</h2>
                                </div>
                                <div class="disp-subtipo-icon-wrapper" style="background: ${cfg.lightBg};">
                                    ${cfg.iconMobile}
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="disp-subtipo-item-col">
                            <div class="disp-subtipo-card ${isActive}" style="background: ${cfg.bg};" onclick="window.dispFiltrarPorSubTipo('${_dispEsc(st)}', this)" title="Filtrar por ${st}">
                                <div>
                                    <h2 class="disp-card-num fw-bolder m-0 text-white" style="font-size: 1.55rem; line-height: 1; text-shadow: 0 2px 4px rgba(0,0,0,0.25);">${item.total}</h2>
                                    <span class="disp-card-lbl fw-bold text-white text-uppercase d-block mt-1 text-truncate" style="font-size:0.68rem; letter-spacing:0.4px;">${_dispEsc(st)}</span>
                                </div>
                                <div class="disp-subtipo-icon-wrapper" style="line-height: 1; opacity: 0.95;">
                                    ${cfg.iconDesktop}
                                </div>
                            </div>
                        </div>
                    `;
                }
            }).join('');
        }
    }

    // 2. Render Tabla Matriz Resumen
    const tbodyMatriz = document.getElementById('disp-cuerpo-matriz-subtipos');
    if (tbodyMatriz) {
        let totGeneral = 0, totBase = 0, totRuta = 0, totMant = 0;
        let htmlMatriz = '';
        subTipos.forEach(st => {
            const item = subTiposMap[st];
            const cfg = getSubTipoStyle(st);
            totGeneral += item.total;
            totBase += item.base;
            totRuta += item.ruta;
            totMant += item.mant;
            htmlMatriz += `
                <tr>
                    <td class="fw-bold ps-3">
                        <span class="d-inline-flex align-items-center gap-2">
                            <span class="p-1 rounded-2 text-white" style="background:${cfg.color}; font-size:0.75rem; min-width:24px; text-align:center;">
                                <i class="bi bi-truck"></i>
                            </span>
                            ${_dispEsc(st)}
                        </span>
                    </td>
                    <td class="text-center fw-bolder text-dark" style="font-size:0.92rem;">${item.total}</td>
                    <td class="text-center text-success fw-bold">${item.base}</td>
                    <td class="text-center text-primary fw-bold">${item.ruta}</td>
                    <td class="text-center text-danger fw-bold">${item.mant}</td>
                </tr>
            `;
        });
        if (subTipos.length > 0) {
            htmlMatriz += `
                <tr class="table-light border-top border-2">
                    <td class="fw-bolder ps-3 text-dark">TOTAL GENERAL</td>
                    <td class="text-center fw-bolder text-dark" style="font-size:1rem;">${totGeneral}</td>
                    <td class="text-center text-success fw-bolder">${totBase}</td>
                    <td class="text-center text-primary fw-bolder">${totRuta}</td>
                    <td class="text-center text-danger fw-bolder">${totMant}</td>
                </tr>
            `;
        }
        tbodyMatriz.innerHTML = htmlMatriz;
    }

    // 3. Render Chart.js Grouped Bar Chart (Horizontal en Móvil para legibilidad perfecta | Vertical en Desktop)
    const canvas = document.getElementById('dispChartSubTipos');
    if (!canvas) return;

    if (typeof Chart === 'undefined') {
        if (typeof window.loadCharts === 'function') {
            window.loadCharts().then(function() {
                if (window._dispVistaActiva === 'graficos') {
                    window.dispRenderizarGraficosSubTipos(datosFiltrados);
                }
            });
        }
        return;
    }

    if (window._dispChartInstance) {
        window._dispChartInstance.destroy();
        window._dispChartInstance = null;
    }

    const chartWrapper = document.getElementById('disp-chart-container-wrapper');
    if (chartWrapper) {
        chartWrapper.style.minHeight = isMobile ? '400px' : '340px';
    }

        const displaySubTipos = window._dispFiltroSubTipo !== 'TODOS' 
            ? subTipos.filter(st => st === window._dispFiltroSubTipo)
            : subTipos;

        const baseData = displaySubTipos.map(st => subTiposMap[st]?.base || 0);
        const rutaData = displaySubTipos.map(st => subTiposMap[st]?.ruta || 0);
        const mantData = displaySubTipos.map(st => subTiposMap[st]?.mant || 0);

        // Plugin inline para dibujar los números con contraste óptimo en cada barra
        const customDataLabelsPlugin = {
            id: 'dispCustomDataLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                chart.data.datasets.forEach((dataset, datasetIndex) => {
                    const meta = chart.getDatasetMeta(datasetIndex);
                    if (meta.hidden) return;
                    meta.data.forEach((bar, index) => {
                        const val = dataset.data[index];
                        if (val > 0) {
                            ctx.save();
                            if (isMobile) {
                                // Horizontal Mode (Móvil)
                                const barWidth = Math.abs(bar.x - bar.base);
                                if (barWidth >= 22) {
                                    ctx.font = 'bold 11px Inter, system-ui, sans-serif';
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillStyle = '#ffffff';
                                    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                                    ctx.shadowBlur = 3;
                                    ctx.fillText(val, bar.base + (barWidth / 2), bar.y);
                                } else {
                                    ctx.font = '800 11px Inter, system-ui, sans-serif';
                                    ctx.textAlign = 'left';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillStyle = '#0f172a';
                                    ctx.shadowBlur = 0;
                                    ctx.fillText(val, bar.x + 4, bar.y);
                                }
                            } else {
                                // Vertical Mode (Desktop)
                                const barHeight = Math.abs(bar.base - bar.y);
                                if (barHeight >= 22) {
                                    ctx.font = 'bold 12px Inter, system-ui, sans-serif';
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillStyle = '#ffffff';
                                    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                                    ctx.shadowBlur = 4;
                                    ctx.shadowOffsetX = 0;
                                    ctx.shadowOffsetY = 1;
                                    ctx.fillText(val, bar.x, bar.y + (barHeight / 2));
                                } else {
                                    ctx.font = '800 11px Inter, system-ui, sans-serif';
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'bottom';
                                    ctx.fillStyle = '#0f172a';
                                    ctx.shadowBlur = 0;
                                    ctx.fillText(val, bar.x, bar.y - 4);
                                }
                            }
                            ctx.restore();
                        }
                    });
                });
            }
        };

        window._dispChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: displaySubTipos,
                datasets: [
                    {
                        label: 'En Base',
                        data: baseData,
                        backgroundColor: '#16a34a',
                        borderColor: '#15803d',
                        borderWidth: 1,
                        borderRadius: 5,
                        barPercentage: isMobile ? 0.85 : 0.85,
                        categoryPercentage: isMobile ? 0.8 : 0.75
                    },
                    {
                        label: 'En Ruta',
                        data: rutaData,
                        backgroundColor: '#0284c7',
                        borderColor: '#0369a1',
                        borderWidth: 1,
                        borderRadius: 5,
                        barPercentage: isMobile ? 0.85 : 0.85,
                        categoryPercentage: isMobile ? 0.8 : 0.75
                    },
                    {
                        label: 'En Mantenimiento',
                        data: mantData,
                        backgroundColor: '#ef4444',
                        borderColor: '#dc2626',
                        borderWidth: 1,
                        borderRadius: 5,
                        barPercentage: isMobile ? 0.85 : 0.85,
                        categoryPercentage: isMobile ? 0.8 : 0.75
                    }
                ]
            },
            plugins: [customDataLabelsPlugin],
            options: {
                indexAxis: isMobile ? 'y' : 'x',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            font: { family: 'inherit', size: isMobile ? 11 : 13, weight: 'bold' },
                            usePointStyle: true,
                            boxWidth: 8,
                            padding: isMobile ? 12 : 18
                        }
                    },
                    tooltip: {
                        backgroundColor: '#0f172a',
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        padding: 10,
                        cornerRadius: 8
                    }
                },
                scales: {
                    x: {
                        grid: { display: isMobile, color: 'rgba(226, 232, 240, 0.8)' },
                        ticks: {
                            font: { family: 'inherit', size: isMobile ? 11 : 12, weight: isMobile ? 'normal' : 'bold' },
                            color: '#334155',
                            precision: 0
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: { family: 'inherit', size: isMobile ? 11 : 11, weight: isMobile ? 'bold' : 'normal' },
                            color: '#334155',
                            precision: 0
                        },
                        grid: { display: !isMobile, color: 'rgba(226, 232, 240, 0.8)' }
                    }
                }
            }
        });
};

// ── Renderizar Filas de la Tabla (Desktop) ────────────────────────
window.dispRenderizarTabla = function (datos) {
    const tbody = document.getElementById('disp-table-body');
    if (!tbody) return;

    if (!datos || datos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-3 d-block mb-2 text-secondary"></i>
                    No se encontraron unidades registradas con los filtros seleccionados.
                </td>
            </tr>
        `;
        return;
    }

    const cleanPlc = str => (str || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');

    let html = '';
    datos.forEach((item, index) => {
        const num = index + 1;
        const estadoFila = window._dispDeterminarEstadoFila(item);

        let estadoBadge = '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle px-3 py-1 fw-bold text-uppercase" style="font-size:0.72rem; border-radius:8px;">En Base</span>';
        if (estadoFila === 'En Mantenimiento') {
            estadoBadge = '<span class="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle px-3 py-1 fw-bold text-uppercase" style="font-size:0.72rem; border-radius:8px;">En Mantenimiento</span>';
        } else if (estadoFila === 'En Ruta') {
            estadoBadge = '<span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle px-3 py-1 fw-bold text-uppercase" style="font-size:0.72rem; border-radius:8px;">En Ruta</span>';
        }

        const capTanque = item.capacidad_tanque || '—';
        const conductor = item.conductor_asignado ? _dispEsc(item.conductor_asignado) : '<span class="text-muted">—</span>';
        const obs = item.observaciones ? _dispEsc(item.observaciones) : '<span class="text-muted">—</span>';

        // Mapeo Telemetría GPS en Vivo y Ubicación Real
        const targetPlaca = cleanPlc(item.placa_camion || item.placa_carreta);
        const gps = (window._dispGpsMap && targetPlaca) ? window._dispGpsMap[targetPlaca] : null;
        let gpsHtml = '<span class="text-muted small" style="font-size:0.75rem;"><i class="bi bi-geo-alt me-1 opacity-50"></i>Sin Señal GPS</span>';

        if (gps && gps.lat && gps.lng) {
            const mapsUrl = `https://maps.google.com/maps?q=${gps.lat},${gps.lng}`;
            const coordsStr = `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}`;
            const ubicacionTexto = gps.ubicacion || `Lat: ${gps.lat.toFixed(4)}, Lng: ${gps.lng.toFixed(4)}`;

            gpsHtml = `
                <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" 
                   class="d-inline-flex align-items-center gap-1 text-decoration-none py-1 px-1.5 rounded-2 transition-all" 
                   title="Ver en Google Maps (${coordsStr}) • ${gps.ubicacion ? _dispEsc(gps.ubicacion) : coordsStr}"
                   style="max-width: 260px; color: #0f172a;">
                    <i class="bi bi-geo-alt-fill text-danger flex-shrink-0" style="font-size:0.85rem;"></i>
                    <span class="text-truncate fw-semibold" style="font-size:0.78rem; border-bottom: 1px dashed #94a3b8;">
                        ${_dispEsc(ubicacionTexto)}
                    </span>
                    <i class="bi bi-box-arrow-up-right ms-1 text-muted opacity-50 flex-shrink-0" style="font-size:0.65rem;"></i>
                </a>
            `;
        }

        html += `
            <tr data-disp-id="${item.id || ''}">
                <td class="ps-4 text-center fw-bold text-muted" style="font-size:0.78rem;">${num}</td>
                <td style="min-width: 110px;">
                    ${item.placa_camion ? `
                        <span class="badge bg-white text-dark border shadow-2xs fw-bolder px-2 py-2 text-center font-monospace" style="min-width: 80px; font-size: 0.82rem; border-radius: 8px; letter-spacing: 0.5px;">
                            ${_dispEsc(item.placa_camion)}
                        </span>
                    ` : '<span class="text-muted small">—</span>'}
                </td>
                <td style="min-width: 110px;">
                    ${item.placa_carreta ? `
                        <span class="badge bg-white text-dark border shadow-2xs fw-bolder px-2 py-2 text-center font-monospace" style="min-width: 80px; font-size: 0.82rem; border-radius: 8px; letter-spacing: 0.5px;">
                            ${_dispEsc(item.placa_carreta)}
                        </span>
                    ` : '<span class="text-muted small">—</span>'}
                </td>
                <td style="min-width: 180px; white-space: nowrap;">
                    <div class="fw-bold text-dark" style="font-size: 0.86rem; white-space: nowrap;">
                        ${conductor}
                    </div>
                </td>
                <td class="text-center" style="min-width: 130px;">
                    ${estadoBadge}
                </td>
                <td style="min-width: 110px;">
                    <span class="fw-bold text-uppercase" style="font-size:0.8rem; color:#334155;">
                        ${_dispEsc(item.marca || '—')}
                    </span>
                </td>
                <td style="min-width: 130px;">
                    <span class="fw-bold" style="font-size:0.8rem; color:#0369a1;">
                        ${_dispEsc(capTanque)}
                    </span>
                </td>
                <td style="min-width: 120px;">
                    <span class="text-secondary fw-semibold" style="font-size:0.8rem;">
                        ${_dispEsc(item.tipo_unidad || '—')}
                    </span>
                </td>
                <td style="min-width: 160px;">
                    <span class="text-truncate d-inline-block" style="max-width:220px; font-size:0.78rem; color:#64748b;" title="${_dispEsc(item.observaciones || '')}">
                        ${obs}
                    </span>
                </td>
                <td style="min-width: 170px; white-space: nowrap;">
                    ${gpsHtml}
                </td>
                <td class="pe-4 text-end" style="min-width: 90px;">
                    <div class="d-inline-flex align-items-center justify-content-end gap-1">
                        <button type="button" class="ck-action-btn ck-btn-edit" onclick="window.dispEditarFila('${_dispEsc(item.placa_camion || '')}', '${_dispEsc(item.placa_carreta || '')}', ${item.id || 'null'})" title="Editar registro">
                            <i class="bi bi-pencil"></i>
                        </button>
                        ${item.id ? `
                            <button type="button" class="ck-action-btn ck-btn-delete" onclick="window.dispAbrirModalEliminar(${item.id}, '${_dispEsc(item.placa_camion || item.placa_carreta || 'Unidad')}')" title="Eliminar registro">
                                <i class="bi bi-trash3 text-danger"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
};

// ── Renderizar Cards (Vista Móvil) ────────────────────────────────
window.dispRenderizarCardsMobile = function (datos) {
    const cardContainer = document.getElementById('dispCardContainer');
    if (!cardContainer) return;

    if (!datos || datos.length === 0) {
        cardContainer.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
                No se encontraron unidades registradas.
            </div>
        `;
        return;
    }

    const cleanPlc = str => (str || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');

    let html = '';
    datos.forEach((item, index) => {
        const estadoFila = window._dispDeterminarEstadoFila(item);

        let badgeEstadoMobile = '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle px-2 py-1 fw-bold text-uppercase" style="font-size:0.68rem; border-radius:6px;">En Base</span>';
        if (estadoFila === 'En Mantenimiento') {
            badgeEstadoMobile = '<span class="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle px-2 py-1 fw-bold text-uppercase" style="font-size:0.68rem; border-radius:6px;">En Mantenimiento</span>';
        } else if (estadoFila === 'En Ruta') {
            badgeEstadoMobile = '<span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle px-2 py-1 fw-bold text-uppercase" style="font-size:0.68rem; border-radius:6px;">En Ruta</span>';
        }

        // GPS status para móvil
        const targetPlaca = cleanPlc(item.placa_camion || item.placa_carreta);
        const gps = (window._dispGpsMap && targetPlaca) ? window._dispGpsMap[targetPlaca] : null;
        let gpsMobileBadge = '';

        if (gps && gps.lat && gps.lng) {
            const mapsUrl = `https://maps.google.com/maps?q=${gps.lat},${gps.lng}`;
            const coordsStr = `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}`;
            const ubicacionTexto = gps.ubicacion || `Lat: ${gps.lat.toFixed(4)}, Lng: ${gps.lng.toFixed(4)}`;
            gpsMobileBadge = `
                <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" 
                   class="badge bg-light text-dark border text-decoration-none px-2.5 py-1.5 d-inline-flex align-items-center gap-1.5 w-100 text-start" 
                   style="font-size:0.75rem; border-radius:8px;"
                   title="Ver en Google Maps (${coordsStr})">
                    <i class="bi bi-geo-alt-fill text-danger flex-shrink-0"></i>
                    <span class="text-truncate fw-semibold text-secondary flex-grow-1">${_dispEsc(ubicacionTexto)}</span>
                    <i class="bi bi-box-arrow-up-right ms-auto text-muted flex-shrink-0" style="font-size:0.65rem;"></i>
                </a>
            `;
        }

        html += `
            <div class="ck-mobile-card">
                <!-- Header Card: Placas + Estado -->
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <div class="d-flex align-items-center gap-2">
                        ${item.placa_camion ? `<span class="badge bg-white text-dark border shadow-2xs fw-bolder px-2 py-1 font-monospace" style="font-size:0.82rem; border-radius:6px;">🚛 ${item.placa_camion}</span>` : ''}
                        ${item.placa_carreta ? `<span class="badge bg-white text-dark border shadow-2xs fw-bolder px-2 py-1 font-monospace" style="font-size:0.82rem; border-radius:6px;">🔗 ${item.placa_carreta}</span>` : ''}
                        ${!item.placa_camion && !item.placa_carreta ? `<span class="text-muted small">Sin Placa</span>` : ''}
                    </div>
                    <div>${badgeEstadoMobile}</div>
                </div>

                <!-- Conductor -->
                <div class="mb-2">
                    <div class="fw-bold text-dark" style="font-size:0.88rem;">${item.conductor_asignado || 'Sin Conductor Asignado'}</div>
                    <div class="text-muted small" style="font-size:0.75rem;">
                        ${item.marca ? `<span>${item.marca}</span>` : ''} 
                        ${item.tipo_unidad ? `<span>• ${item.tipo_unidad}</span>` : ''}
                        ${item.capacidad_tanque ? `<span>• Tanque: ${item.capacidad_tanque}</span>` : ''}
                    </div>
                </div>

                <!-- Ubicación GPS Móvil si está disponible -->
                ${gpsMobileBadge ? `<div class="mb-2">${gpsMobileBadge}</div>` : ''}

                ${item.observaciones ? `
                    <div class="p-2 bg-light rounded-3 text-secondary small mb-2" style="font-size:0.75rem;">
                        <i class="bi bi-chat-left-text me-1"></i>${_dispEsc(item.observaciones)}
                    </div>
                ` : ''}

                <!-- Botones de Acción Móvil -->
                <div class="d-flex align-items-center justify-content-end gap-2 pt-2 border-top">
                    <button type="button" class="btn btn-sm btn-outline-secondary fw-bold px-3 py-1 d-flex align-items-center gap-1" onclick="window.dispEditarFila('${_dispEsc(item.placa_camion || '')}', '${_dispEsc(item.placa_carreta || '')}', ${item.id || 'null'})" style="border-radius:8px; font-size:0.78rem;">
                        <i class="bi bi-pencil"></i> Editar
                    </button>
                    ${item.id ? `
                        <button type="button" class="btn btn-sm btn-outline-danger fw-semibold px-2 py-1 d-flex align-items-center gap-1" onclick="window.dispAbrirModalEliminar(${item.id}, '${_dispEsc(item.placa_camion || item.placa_carreta || 'Unidad')}')" style="border-radius:8px; font-size:0.78rem;">
                            <i class="bi bi-trash3"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    });

    cardContainer.innerHTML = html;
};

// ── Modal Formulario (Nuevo / Editar) ─────────────────────────────
window.dispAbrirModalNuevo = function () {
    const modalEl = document.getElementById('modalDisponibilidad');
    if (!modalEl) return;

    document.getElementById('disp-f-id').value = '';
    document.getElementById('disp-f-placa-camion').value = '';
    document.getElementById('disp-f-placa-carreta').value = '';
    document.getElementById('disp-f-conductor-asignado').value = '';
    document.getElementById('disp-f-marca').value = '';
    document.getElementById('disp-f-capacidad').value = '';
    document.getElementById('disp-f-tipo-unidad').value = '';
    document.getElementById('disp-f-estado').value = 'En Base';
    document.getElementById('disp-f-observaciones').value = '';

    document.getElementById('disp-modal-title').innerText = 'Registrar Unidad en Disponibilidad';
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.dispEditarFila = function (placaCamion, placaCarreta, id) {
    let item = null;

    // 1. Buscar por ID de BD si existe
    if (id) {
        item = (window.dispDatos || []).find(d => d.id == id);
    }
    // 2. Buscar por Placa de Camión
    if (!item && placaCamion && typeof placaCamion === 'string') {
        const pCamUpper = placaCamion.trim().toUpperCase();
        item = (window.dispDatos || []).find(d => d.placa_camion && d.placa_camion.trim().toUpperCase() === pCamUpper);
    }
    // 3. Buscar por Placa de Carreta
    if (!item && placaCarreta && typeof placaCarreta === 'string') {
        const pCarUpper = placaCarreta.trim().toUpperCase();
        item = (window.dispDatos || []).find(d => d.placa_carreta && d.placa_carreta.trim().toUpperCase() === pCarUpper);
    }
    // 4. Fallback si se pasa un índice
    if (!item && typeof placaCamion === 'number') {
        item = (window._dispFiltrados || window.dispDatos || [])[placaCamion];
    }

    if (!item) return;

    const modalEl = document.getElementById('modalDisponibilidad');
    if (!modalEl) return;

    document.getElementById('disp-f-id').value = item.id || '';
    document.getElementById('disp-f-placa-camion').value = item.placa_camion || '';
    document.getElementById('disp-f-placa-carreta').value = item.placa_carreta || '';
    document.getElementById('disp-f-conductor-asignado').value = item.conductor_asignado || '';
    document.getElementById('disp-f-marca').value = item.marca || '';
    document.getElementById('disp-f-capacidad').value = item.capacidad_tanque || '';
    document.getElementById('disp-f-tipo-unidad').value = item.tipo_unidad || '';
    document.getElementById('disp-f-estado').value = item.estado || 'En Base';
    document.getElementById('disp-f-observaciones').value = item.observaciones || '';

    const labelPlaca = item.placa_camion || item.placa_carreta || 'Unidad';
    document.getElementById('disp-modal-title').innerText = `Editar Disponibilidad (${labelPlaca})`;
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window.guardarFormularioDisponibilidad = async function (e) {
    if (e) e.preventDefault();

    const id = document.getElementById('disp-f-id').value;
    const cam = (document.getElementById('disp-f-placa-camion').value || '').trim().toUpperCase();
    const car = (document.getElementById('disp-f-placa-carreta').value || '').trim().toUpperCase();

    if (!cam && !car) {
        alert('Ingresa al menos la Placa de Camión o la Placa de Carreta.');
        return;
    }

    const estadoVal = (document.getElementById('disp-f-estado').value || 'En Base').trim();
    const payload = {
        placa_camion: cam,
        placa_carreta: car,
        conductor_asignado: (document.getElementById('disp-f-conductor-asignado').value || '').trim(),
        marca: (document.getElementById('disp-f-marca').value || '').trim().toUpperCase(),
        capacidad_tanque: (document.getElementById('disp-f-capacidad').value || '').trim(),
        tipo_unidad: (document.getElementById('disp-f-tipo-unidad').value || '').trim(),
        estado: estadoVal,
        estado_unidad: estadoVal,
        observaciones: (document.getElementById('disp-f-observaciones').value || '').trim(),
        actualizado_por: localStorage.getItem('fleet_user') || 'Sistema',
        creado_por: localStorage.getItem('fleet_user') || 'Sistema'
    };

    const btn = document.getElementById('disp-btn-guardar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...'; }

    try {
        const url = id ? `/api/disponibilidad-flota/${id}` : '/api/disponibilidad-flota';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        if (res.error) throw new Error(res.error);

        const modalEl = document.getElementById('modalDisponibilidad');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('Disponibilidad actualizada exitosamente', 'success');
        } else {
            alert('✅ Registro guardado correctamente');
        }

        await window.dispCargarDatos(true);
    } catch (err) {
        alert('Error al guardar: ' + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i>Guardar Registro'; }
    }
};

// ── Modal Eliminar ────────────────────────────────────────────────
window.dispAbrirModalEliminar = function (id, nombre) {
    window._dispItemEliminarId = id;
    const modalEl = document.getElementById('modalEliminarDisponibilidadConfirm');
    const lbl = document.getElementById('disp-eliminar-nombre');
    if (lbl) lbl.innerText = nombre;
    if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

window._ejecutarEliminarDisponibilidadConfirmado = async function () {
    const id = window._dispItemEliminarId;
    if (!id) return;

    try {
        const res = await fetch(`/api/disponibilidad-flota/${id}`, { method: 'DELETE' }).then(r => r.json());
        if (res.error) throw new Error(res.error);

        const modalEl = document.getElementById('modalEliminarDisponibilidadConfirm');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('Registro eliminado', 'info');
        }
        await window.dispCargarDatos(true);
    } catch (err) {
        alert('Error al eliminar: ' + err.message);
    }
};

// ── Autocomplete Placa Camión ─────────────────────────────────────
window.dispBuscarPlacaCamion = function (val) {
    const panel = document.getElementById('disp-panel-camion');
    if (!panel) return;

    const q = (val || '').toUpperCase().trim();
    const matches = (window.dispPlacas || []).filter(p => {
        const pl = (p.placa || '').toUpperCase();
        const motoraStr = String(p.motora || '').toLowerCase();
        const tipoNorm = String(p.tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        
        const isMotora = motoraStr === 'motora' || motoraStr === '1' || motoraStr === 'true' ||
            ['CAMION', 'TRACTO', 'VOLQUETE', 'FURGON', 'CISTERNA'].some(t => tipoNorm.includes(t));
        return isMotora && (!q || pl.includes(q));
    }).slice(0, 15);

    if (!matches.length) {
        panel.style.display = 'none';
        return;
    }

    panel.innerHTML = matches.map(p => `
        <div class="disp-combo-item d-flex justify-content-between align-items-center" onclick="window.dispSeleccionarPlacaCamion('${_dispEsc(p.placa)}')">
            <span class="fw-bold">${_dispEsc(p.placa)}</span>
            <span class="text-muted small">${_dispEsc(p.marca || '')} • ${_dispEsc(p.tipo || '')}</span>
        </div>
    `).join('');

    panel.style.display = 'block';
};

window.dispSeleccionarPlacaCamion = function (placa) {
    const p = (window.dispPlacas || []).find(x => (x.placa || '').toUpperCase() === placa.toUpperCase());
    document.getElementById('disp-f-placa-camion').value = placa;
    if (p) {
        if (p.marca) document.getElementById('disp-f-marca').value = p.marca;
        if (p.tipo) document.getElementById('disp-f-tipo-unidad').value = p.tipo;
        if (p.capacidad_tanque) document.getElementById('disp-f-capacidad').value = p.capacidad_tanque;
    }
    const panel = document.getElementById('disp-panel-camion');
    if (panel) panel.style.display = 'none';
};

// ── Autocomplete Placa Carreta ────────────────────────────────────
window.dispBuscarPlacaCarreta = function (val) {
    const panel = document.getElementById('disp-panel-carreta');
    if (!panel) return;

    const q = (val || '').toUpperCase().trim();
    const matches = (window.dispPlacas || []).filter(p => {
        const pl = (p.placa || '').toUpperCase();
        const motoraStr = String(p.motora || '').toLowerCase();
        const tipoNorm = String(p.tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        
        const isCarreta = motoraStr === 'no motora' || motoraStr === '0' || motoraStr === 'false' ||
            tipoNorm.includes('CARRETA') || tipoNorm.includes('REMOLQUE') || tipoNorm.includes('SEMI');
        return isCarreta && (!q || pl.includes(q));
    }).slice(0, 15);

    if (!matches.length) {
        panel.style.display = 'none';
        return;
    }

    panel.innerHTML = matches.map(p => `
        <div class="disp-combo-item d-flex justify-content-between align-items-center" onclick="window.dispSeleccionarPlacaCarreta('${_dispEsc(p.placa)}')">
            <span class="fw-bold">${_dispEsc(p.placa)}</span>
            <span class="text-muted small">${_dispEsc(p.tipo || 'Carreta')}</span>
        </div>
    `).join('');

    panel.style.display = 'block';
};

window.dispSeleccionarPlacaCarreta = function (placa) {
    document.getElementById('disp-f-placa-carreta').value = placa;
    const panel = document.getElementById('disp-panel-carreta');
    if (panel) panel.style.display = 'none';
};

// ── Autocomplete Conductor ────────────────────────────────────────
window.dispBuscarConductor = function (val) {
    const panel = document.getElementById('disp-panel-cond-asignado');
    if (!panel) return;

    const q = (val || '').toLowerCase().trim();
    const matches = (window.dispConductores || []).filter(c => {
        const nom = (c.nombre || c.nombres || c.conductor || '').toLowerCase();
        return !q || nom.includes(q);
    }).slice(0, 15);

    if (!matches.length) {
        panel.style.display = 'none';
        return;
    }

    panel.innerHTML = matches.map(c => {
        const nombre = c.nombre || c.nombres || c.conductor || '';
        return `
            <div class="disp-combo-item" onclick="window.dispSeleccionarConductor('${_dispEsc(nombre)}')">
                <span class="fw-bold">${_dispEsc(nombre)}</span>
            </div>
        `;
    }).join('');

    panel.style.display = 'block';
};

window.dispSeleccionarConductor = function (nombre) {
    document.getElementById('disp-f-conductor-asignado').value = nombre;
    const panel = document.getElementById('disp-panel-cond-asignado');
    if (panel) panel.style.display = 'none';
};

// ── Exportar Excel (Respetando Filtros Activos) ───────────────────
window.dispExportarExcel = function () {
    if (typeof XLSX === 'undefined') {
        alert('Librería XLSX no disponible');
        return;
    }

    const cleanPlc = str => (str || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const items = (window._dispFiltrados && window._dispFiltrados.length > 0) ? window._dispFiltrados : (window.dispDatos || []);
    const empresaFiltro = window._dispFiltroEmpresa || 'TODAS';

    const rows = items.map((d, i) => {
        const targetPlaca = cleanPlc(d.placa_camion || d.placa_carreta);
        const gps = (window._dispGpsMap && targetPlaca) ? window._dispGpsMap[targetPlaca] : null;
        let gpsText = 'Sin Señal';
        if (gps && gps.lat && gps.lng) {
            const speed = (gps.velocidad != null ? Number(gps.velocidad) : (gps.pos && gps.pos.s != null ? Number(gps.pos.s) : 0)) || 0;
            gpsText = (speed > 3 ? `En Ruta (${speed} km/h)` : 'Detenido') + ` [${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}]`;
        }

        const estadoFila = window._dispDeterminarEstadoFila ? window._dispDeterminarEstadoFila(d) : (d.estado || 'En Base');
        return {
            '#': i + 1,
            'CAMIÓN': d.placa_camion || '—',
            'CARRETA': d.placa_carreta || '—',
            'CONDUCTOR': d.conductor_asignado || '—',
            'ESTADO': estadoFila,
            'EMPRESA': d.empresa || d.cliente || '—',
            'MARCA': d.marca || '—',
            'CAPACIDAD DE TANQUE': d.capacidad_tanque || '—',
            'TIPO UNIDAD': d.tipo_unidad || '—',
            'OBSERVACIONES': d.observaciones || '—',
            'UBICACIÓN GPS': gpsText
        };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Disponibilidad Flota');
    const sufijoEmpresa = empresaFiltro !== 'TODAS' ? `_${empresaFiltro.replace(/[^A-Z0-9]/g, '_')}` : '';
    XLSX.writeFile(wb, `Disponibilidad_Flota_${new Date().toISOString().split('T')[0]}${sufijoEmpresa}.xlsx`);
};

// ── Modal Cuadro Resumen ──────────────────────────────────────────
window.dispAbrirModalCuadro = function () {
    const modalEl = document.getElementById('modalDisponibilidadCuadro');
    const bodyEl = document.getElementById('disp-cuadro-body');
    if (!modalEl || !bodyEl) return;

    const datos = (window._dispFiltrados && window._dispFiltrados.length > 0) ? window._dispFiltrados : (window.dispDatos || []);
    const tipos = {};

    datos.forEach(d => {
        const t = d.tipo_unidad || 'Otros';
        if (!tipos[t]) tipos[t] = { total: 0, base: 0, ruta: 0, mant: 0 };
        tipos[t].total++;
        const estadoFila = window._dispDeterminarEstadoFila ? window._dispDeterminarEstadoFila(d) : (d.estado || 'En Base');
        if (estadoFila === 'En Mantenimiento') tipos[t].mant++;
        else if (estadoFila === 'En Ruta') tipos[t].ruta++;
        else tipos[t].base++;
    });

    let html = `
        <div class="table-responsive">
            <table class="table table-bordered align-middle">
                <thead class="table-light">
                    <tr>
                        <th class="fw-bold">TIPO DE UNIDAD</th>
                        <th class="text-center fw-bold">TOTAL</th>
                        <th class="text-center fw-bold text-success">EN BASE</th>
                        <th class="text-center fw-bold text-primary">EN RUTA</th>
                        <th class="text-center fw-bold text-danger">EN MANTENIMIENTO</th>
                    </tr>
                </thead>
                <tbody>
    `;

    Object.keys(tipos).forEach(k => {
        const item = tipos[k];
        html += `
            <tr>
                <td class="fw-bold">${_dispEsc(k)}</td>
                <td class="text-center fw-bold">${item.total}</td>
                <td class="text-center text-success fw-bold">${item.base}</td>
                <td class="text-center text-primary fw-bold">${item.ruta}</td>
                <td class="text-center text-danger fw-bold">${item.mant}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    bodyEl.innerHTML = html;
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

// ── Helper Escapar HTML ───────────────────────────────────────────
function _dispEsc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── Generador y Exportador de Reporte PDF Oficial (F-FLOT-0004) ──
function _dispNormalizarEstado(d) {
    const estadoFila = window._dispDeterminarEstadoFila ? window._dispDeterminarEstadoFila(d) : 'En Base';
    if (estadoFila === 'En Mantenimiento') {
        return 'EN MANTENIMIENTO';
    }
    if (estadoFila === 'En Ruta') {
        return 'EN RUTA';
    }
    return 'EN BASE';
}

function _dispFormatNombreConductor(nom) {
    if (!nom || nom.trim() === '' || nom.trim() === '-' || nom.trim() === '—' || nom.trim().toLowerCase() === 'sin asignar') return 'Sin asignar';
    const partes = nom.trim().split(/\s+/);
    if (partes.length === 1) return partes[0];
    return partes.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

function _dispBuildPdfHtml() {
    const items = (window._dispFiltrados && window._dispFiltrados.length > 0) ? window._dispFiltrados : (window.dispDatos || []);
    const empresaFiltro = window._dispFiltroEmpresa || 'TODAS';
    const hoy = new Date();
    const fechaFormateada = hoy.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaFormateada = hoy.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const empLogoUrl = localStorage.getItem('fleet_empresa_logo') || window._LOGO_BASE64 || 'https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500';

    const grupos = {
        'EN BASE (CAMIÓN - CARRETA)': [],
        'EN BASE (SOLO CAMIÓN / TRACTO)': [],
        'EN BASE (SOLO CARRETA / REMOLQUE)': [],
        'EN RUTA (EN OPERACIÓN)': [],
        'EN MANTENIMIENTO / TALLER': []
    };

    items.forEach(d => {
        const estNorm = _dispNormalizarEstado(d);
        if (estNorm === 'EN MANTENIMIENTO') {
            grupos['EN MANTENIMIENTO / TALLER'].push(d);
        } else if (estNorm === 'EN RUTA') {
            grupos['EN RUTA (EN OPERACIÓN)'].push(d);
        } else {
            const hasCamion = d.placa_camion && d.placa_camion.trim() && d.placa_camion.trim() !== '—' && d.placa_camion.trim() !== '---';
            const hasCarreta = d.placa_carreta && d.placa_carreta.trim() && d.placa_carreta.trim() !== '—' && d.placa_carreta.trim() !== '---';
            if (hasCamion && hasCarreta) grupos['EN BASE (CAMIÓN - CARRETA)'].push(d);
            else if (hasCamion && !hasCarreta) grupos['EN BASE (SOLO CAMIÓN / TRACTO)'].push(d);
            else if (!hasCamion && hasCarreta) grupos['EN BASE (SOLO CARRETA / REMOLQUE)'].push(d);
            else grupos['EN BASE (CAMIÓN - CARRETA)'].push(d);
        }
    });

    const ordenGrupos = [
        'EN BASE (CAMIÓN - CARRETA)',
        'EN BASE (SOLO CAMIÓN / TRACTO)',
        'EN BASE (SOLO CARRETA / REMOLQUE)',
        'EN RUTA (EN OPERACIÓN)',
        'EN MANTENIMIENTO / TALLER'
    ];

    const cleanPlc = str => (str || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');

    let filasHtml = '';
    let itemIndex = 1;

    ordenGrupos.forEach(gKey => {
        const list = grupos[gKey];
        if (!list || list.length === 0) return;

        filasHtml += `
            <tr style="background:#e2e8f0 !important; font-weight:bold; -webkit-print-color-adjust:exact; page-break-after:avoid;">
                <td colspan="9" style="padding: 4px 6px; font-weight:800; font-size:9.5px; text-transform:uppercase; letter-spacing:0.5px; border: 1.5px solid #000; background-color:#e2e8f0 !important; color:#000000;">
                    ■ ${gKey} (${list.length} ${list.length === 1 ? 'UNIDAD' : 'UNIDADES'})
                </td>
            </tr>
        `;

        list.forEach(r => {
            const camionStr = (r.placa_camion && r.placa_camion.trim() && r.placa_camion.trim() !== '—' && r.placa_camion.trim() !== '---') ? r.placa_camion : '—';
            const carretaStr = (r.placa_carreta && r.placa_carreta.trim() && r.placa_carreta.trim() !== '—' && r.placa_carreta.trim() !== '---') ? r.placa_carreta : '—';
            const conductorFormateado = _dispFormatNombreConductor(r.conductor_asignado);
            const marcaStr = r.marca || '—';
            const tipoStr = r.tipo_unidad || r.sub_tipo || '—';
            const galonesStr = (r.capacidad_tanque && r.capacidad_tanque !== '0' && r.capacidad_tanque !== '—') ? r.capacidad_tanque : '—';
            const obsStr = (r.observaciones && r.observaciones !== '—') ? r.observaciones.trim() : '—';

            // GPS Telemetría
            const targetPlaca = cleanPlc(r.placa_camion || r.placa_carreta);
            const gps = (window._dispGpsMap && targetPlaca) ? window._dispGpsMap[targetPlaca] : null;
            let gpsStr = 'Sin Señal';
            if (gps && gps.lat && gps.lng) {
                gpsStr = gps.ubicacion || `Lat: ${gps.lat.toFixed(4)}, Lng: ${gps.lng.toFixed(4)}`;
            }

            filasHtml += `
                <tr style="page-break-inside:avoid;">
                    <td style="text-align:center; font-weight:bold; width:24px; padding:3px 2px; border:1px solid #000; font-size:8.5px;">${itemIndex++}</td>
                    <td style="text-align:center; font-family:monospace; font-weight:bold; font-size:9px; width:58px; padding:3px 2px; border:1px solid #000;">${_dispEsc(camionStr)}</td>
                    <td style="text-align:center; font-family:monospace; font-size:9px; width:58px; padding:3px 2px; border:1px solid #000;">${_dispEsc(carretaStr)}</td>
                    <td style="width:125px; font-size:8.5px; padding:3px 4px; border:1px solid #000; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600;">${_dispEsc(conductorFormateado)}</td>
                    <td style="text-align:center; width:60px; font-size:8.5px; padding:3px 2px; border:1px solid #000; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${_dispEsc(marcaStr)}</td>
                    <td style="text-align:center; width:55px; font-size:8.5px; padding:3px 2px; border:1px solid #000; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${_dispEsc(tipoStr)}</td>
                    <td style="text-align:center; width:48px; font-size:8.5px; font-weight:600; padding:3px 2px; border:1px solid #000;">${_dispEsc(galonesStr)}</td>
                    <td style="width:120px; font-size:8px; padding:3px 4px; border:1px solid #000; word-break:normal; overflow-wrap:break-word; white-space:normal; line-height:1.2;">${_dispEsc(obsStr)}</td>
                    <td style="font-size:8px; padding:3px 4px; border:1px solid #000; word-break:normal; overflow-wrap:break-word; white-space:normal; line-height:1.2; color:#334155;">${_dispEsc(gpsStr)}</td>
                </tr>
            `;
        });
    });

    return `
        <div style="width:210mm; min-height:297mm; background:#ffffff; padding:8mm 8mm; margin:0 auto; box-sizing:border-box; font-family:'Inter', system-ui, sans-serif; color:#000000; display:flex; flex-direction:column;">
            
            <!-- 1. Encabezado Oficial -->
            <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-bottom:6px; table-layout:fixed;">
                <tr>
                    <td style="width:22%; padding:4px; border:1px solid #000; text-align:center; vertical-align:middle;" rowspan="3">
                        <img src="${empLogoUrl}" alt="Logo Empresa" style="max-height:46px; max-width:100%; object-fit:contain;">
                    </td>
                    <td style="width:54%; border:1px solid #000; text-align:center; vertical-align:middle; font-size:18px; font-weight:700; line-height:1.1; text-transform:uppercase;" rowspan="3">
                        DISPONIBILIDAD OPERATIVA DE FLOTA<br>
                        <span style="font-size:10px; font-weight:500; color:#333; letter-spacing:0.5px; display:block; margin-top:3px;">CONTROL Y GESTIÓN DE DISPONIBILIDAD DE UNIDADES</span>
                    </td>
                    <td style="width:24%; border:1px solid #000; font-size:9.5px; text-align:left; padding:2px 6px; height:17px;"><b>CÓDIGO:</b> F-FLOT-0004</td>
                </tr>
                <tr><td style="border:1px solid #000; font-size:9.5px; text-align:left; padding:2px 6px; height:17px;"><b>VERSIÓN:</b> 01</td></tr>
                <tr><td style="border:1px solid #000; font-size:9.5px; text-align:left; padding:2px 6px; height:17px;"><b>F. EMISIÓN:</b> ${fechaFormateada}</td></tr>
            </table>

            <!-- 2. Metadatos y Filtros Aplicados -->
            <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-bottom:6px; font-size:10.5px; font-weight:bold;">
                <tr>
                    <td style="width:30%; border:1px solid #000; padding:4px 6px;">FECHA: <span style="font-weight:normal; margin-left:4px;">${fechaFormateada}</span></td>
                    <td style="width:35%; border:1px solid #000; padding:4px 6px;">EMPRESA: <span style="font-weight:normal; margin-left:4px;">${empresaFiltro === 'TODAS' ? 'TODAS LAS EMPRESAS' : _dispEsc(empresaFiltro)}</span></td>
                    <td style="width:35%; border:1px solid #000; padding:4px 6px;">TOTAL REGISTRADAS: <span style="font-weight:bold; color:#0284c7; margin-left:4px;">${items.length}</span></td>
                </tr>
            </table>

            <!-- 3. Tabla Principal de Unidades -->
            <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-bottom:8px; font-size:8.5px; table-layout:fixed;">
                <thead>
                    <tr style="background-color:#333333; color:#ffffff; -webkit-print-color-adjust:exact;">
                        <th style="width:24px; text-align:center; padding:4px 2px; border:1px solid #000; font-size:8.5px;">#</th>
                        <th style="width:58px; text-align:center; padding:4px 2px; border:1px solid #000; font-size:8.5px;">SOLO CAMIÓN</th>
                        <th style="width:58px; text-align:center; padding:4px 2px; border:1px solid #000; font-size:8.5px;">CARRETA</th>
                        <th style="width:125px; text-align:center; padding:4px 4px; border:1px solid #000; font-size:8.5px;">CONDUCTOR</th>
                        <th style="width:60px; text-align:center; padding:4px 2px; border:1px solid #000; font-size:8.5px;">MARCA</th>
                        <th style="width:55px; text-align:center; padding:4px 2px; border:1px solid #000; font-size:8.5px;">TIPO</th>
                        <th style="width:48px; text-align:center; padding:4px 2px; border:1px solid #000; font-size:8.5px;">GALONES</th>
                        <th style="width:120px; text-align:center; padding:4px 4px; border:1px solid #000; font-size:8.5px;">OBSERVACIONES</th>
                        <th style="text-align:center; padding:4px 4px; border:1px solid #000; font-size:8.5px;">UBICACIÓN GPS</th>
                    </tr>
                </thead>
                <tbody>
                    ${filasHtml || '<tr><td colspan="9" style="text-align:center; padding:15px; border:1px solid #000; color:#64748b;">No hay unidades para los filtros seleccionados.</td></tr>'}
                </tbody>
            </table>

            <!-- 4. Pie de Página -->
            <div style="margin-top:auto; border-top:1px solid #000; padding-top:6px; display:flex; justify-content:space-between; font-size:9px; color:#333;">
                <div><b>ERP Azkell Fleet</b> — Módulo de Disponibilidad de Flota</div>
                <div>Generado el: ${fechaFormateada} ${horaFormateada}</div>
            </div>
        </div>
    `;
}

// ── Renderizador de Blob PDF en Iframe Aislado ───────────────────
async function _dispRenderPdfBlob(htmlBody, filename) {
    return new Promise(function (resolve, reject) {
        var iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed; top:-10000px; left:-10000px; width:840px; height:1200px; border:none; z-index:-999;';
        document.body.appendChild(iframe);

        var doc = iframe.contentWindow.document;
        doc.open();
        doc.write('<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n'
            + '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n'
            + '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></scr' + 'ipt>\n'
            + '<style>\n'
            + '* { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }\n'
            + 'body { background-color:#FFFFFF; color:#000000; margin:0; padding:0; font-family:"Inter", sans-serif; }\n'
            + '</style>\n</head>\n<body>\n'
            + '<div id="disp-pdf-render-root">' + htmlBody + '</div>\n'
            + '</body>\n</html>');
        doc.close();

        iframe.onload = async function () {
            try {
                await new Promise(function (r) { setTimeout(r, 400); });
                var targetEl = doc.getElementById('disp-pdf-render-root');
                var opt = {
                    margin: 0,
                    filename: filename,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2.2, useCORS: true, logging: false, scrollX: 0, scrollY: 0, windowWidth: 840 },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };

                var pdfBlob = await iframe.contentWindow.html2pdf().set(opt).from(targetEl).outputPdf('blob');
                iframe.remove();
                resolve(pdfBlob);
            } catch (e) {
                iframe.remove();
                reject(e);
            }
        };
    });
}

// ── 📲 Compartir Reporte PDF por WhatsApp ────────────────────────
window.dispCompartirWhatsAppPDF = async function () {
    const empresaFiltro = window._dispFiltroEmpresa || 'TODAS';
    const hoy = new Date().toISOString().split('T')[0];
    const filename = `${hoy} - Disponibilidad Flota ${empresaFiltro !== 'TODAS' ? '(' + empresaFiltro + ')' : ''}.pdf`;

    const btn = document.getElementById('disp-btn-share-pdf');
    if (btn) {
        btn.innerHTML = '<span class="spinner-border spinner-border-sm text-success"></span>';
        btn.style.pointerEvents = 'none';
    }

    if (typeof window.mostrarToast === 'function') {
        window.mostrarToast('Preparando PDF de Disponibilidad para WhatsApp...', 'info');
    }

    try {
        const htmlFinal = _dispBuildPdfHtml();
        const pdfBlob = await _dispRenderPdfBlob(htmlFinal, filename);
        const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

        // 1. Compartir nativo en móviles o navegadores compatibles
        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
            try {
                await navigator.share({
                    files: [pdfFile],
                    title: filename
                });
                return;
            } catch (shareErr) {
                if (shareErr.name === 'AbortError') return;
                console.warn('Error en navigator.share:', shareErr);

                if (shareErr.name === 'NotAllowedError') {
                    window._dispPendingPdfFile = pdfFile;
                    window._dispPendingPdfFilename = filename;
                    _dispMostrarBotonReintentarShare();
                    return;
                }
            }
        }

        // 2. Fallback WhatsApp app directo
        window.location.href = 'whatsapp://';
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('Abriendo aplicación WhatsApp...', 'success');
        }
    } catch (err) {
        console.error('Error al compartir PDF por WhatsApp:', err);
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('Error al generar PDF: ' + err.message, 'danger');
        } else {
            alert('Error al generar PDF: ' + err.message);
        }
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="bi bi-whatsapp text-success fs-5"></i>';
            btn.style.pointerEvents = 'auto';
        }
    }
};

function _dispMostrarBotonReintentarShare() {
    var existing = document.getElementById('disp-reintentar-share-overlay');
    if (existing) existing.remove();

    var div = document.createElement('div');
    div.id = 'disp-reintentar-share-overlay';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';
    div.innerHTML = '<div style="background:#fff;border-radius:24px;padding:26px 20px;text-align:center;max-width:320px;width:88%;box-shadow:0 20px 40px rgba(0,0,0,0.25);">' +
        '<div style="width:58px;height:58px;background:#25D366;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 16px;">' +
        '<i class="bi bi-whatsapp"></i>' +
        '</div>' +
        '<h5 style="font-weight:800;color:#0f172a;margin-bottom:8px;font-size:1.1rem;">PDF de Flota Listo</h5>' +
        '<p style="color:#64748b;font-size:0.83rem;margin-bottom:20px;">Toca el botón para abrir WhatsApp y seleccionar el destinatario.</p>' +
        '<button id="disp-btn-touch-share" style="background:#25D366;color:#fff;font-weight:700;border:none;padding:12px 24px;border-radius:14px;width:100%;font-size:0.95rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 12px rgba(37,211,102,0.35);">' +
        '<i class="bi bi-share-fill"></i> Enviar por WhatsApp' +
        '</button>' +
        '<button onclick="document.getElementById(\'disp-reintentar-share-overlay\').remove()" style="background:transparent;color:#94a3b8;font-weight:600;border:none;margin-top:12px;font-size:0.8rem;cursor:pointer;">Cancelar</button>' +
        '</div>';
    document.body.appendChild(div);

    document.getElementById('disp-btn-touch-share').onclick = async function () {
        div.remove();
        if (window._dispPendingPdfFile && navigator.canShare && navigator.canShare({ files: [window._dispPendingPdfFile] })) {
            try {
                await navigator.share({
                    files: [window._dispPendingPdfFile],
                    title: window._dispPendingPdfFilename || 'Disponibilidad_Flota.pdf'
                });
            } catch (e) {
                if (e.name !== 'AbortError') {
                    window.location.href = 'whatsapp://';
                }
            }
        } else {
            window.location.href = 'whatsapp://';
        }
    };
}

// ── 📄 Exportar / Imprimir PDF Oficial (F-FLOT-0004) ──────────────
window.dispExportarPDF = function () {
    const items = (window._dispFiltrados && window._dispFiltrados.length > 0) ? window._dispFiltrados : (window.dispDatos || []);
    if (!items || items.length === 0) {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast('No hay unidades registradas para exportar en este filtro.', 'warning');
        } else {
            alert('No hay unidades para exportar');
        }
        return;
    }

    const ventana = window.open('', '_blank');
    if (!ventana) {
        alert('Por favor permite las ventanas emergentes para generar el PDF.');
        return;
    }

    const htmlFinal = _dispBuildPdfHtml();

    ventana.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Disponibilidad de Flota — F-FLOT-0004</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
            <style>
                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    color-adjust: exact !important;
                }
                @page { size: A4 portrait; margin: 0; }
                body { margin: 0; padding: 0; background: #525659; font-family: 'Inter', system-ui, sans-serif; }
                .no-print-bar {
                    background: #1e293b;
                    padding: 10px 20px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    color: #fff;
                    position: sticky;
                    top: 0;
                    z-index: 1000;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                }
                .btn-print {
                    background: #0284c7;
                    color: white;
                    border: none;
                    padding: 8px 18px;
                    border-radius: 8px;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 13px;
                }
                @media print {
                    .no-print-bar { display: none !important; }
                    body { background: white !important; }
                }
            </style>
        </head>
        <body>
            <div class="no-print-bar">
                <span style="font-weight:700; font-size:14px;">Vista Previa de Impresión — Disponibilidad de Flota (F-FLOT-0004)</span>
                <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
            </div>
            ${htmlFinal}
            <script>
                setTimeout(function() {
                    window.print();
                }, 600);
            </script>
        </body>
        </html>
    `);
    ventana.document.close();
};

// ── Inicializador del Módulo ──────────────────────────────────────
window.init_disponibilidad = function () {
    window.dispCargarDatos(true);

    // Listener reactivo a cambios de tamaño de pantalla (Móvil vs Desktop)
    if (!window._dispResizeListenerAttached) {
        window._dispResizeListenerAttached = true;
        let resizeTimer = null;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                if (window._dispVistaActiva === 'graficos') {
                    window.dispFiltrar();
                }
            }, 250);
        });
    }
};
