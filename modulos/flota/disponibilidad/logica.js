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
        const [resDisp, resPlacas, resCond] = await Promise.all([
            fetch('/api/disponibilidad-flota').then(r => r.json()).catch(() => []),
            fetch('/api/placas-lista').then(r => r.json()).catch(() => []),
            fetch('/api/conductores-lista').then(r => r.json()).catch(() => [])
        ]);

        window.dispDatos = Array.isArray(resDisp) ? resDisp : (resDisp.data || []);
        window.dispPlacas = Array.isArray(resPlacas) ? resPlacas : (resPlacas.data || []);
        window.dispConductores = Array.isArray(resCond) ? resCond : (resCond.data || []);

        window.dispRenderizarSegmentedEmpresas();
        window.dispActualizarKPIs();
        window.dispFiltrar();
    } catch (err) {
        console.error('Error cargando disponibilidad de flota:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center py-4 text-danger">
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

// ── Helper: Extraer Placas Individuales (Consolidación Real de Flota) ────
function _dispExtraerPlacas(lista, aplicarFiltros = false) {
    const q = (document.getElementById('dispBuscador')?.value || '').toLowerCase().trim();
    const filtroCard = window._dispFiltroCard || 'TODOS';
    const filtroEmp = window._dispFiltroEmpresa || 'TODAS';

    const placas = [];

    (lista || []).forEach(d => {
        const empPrincipal = (d.empresa || d.cliente || '').trim();

        // 1. Unidad Motora (Camión / Tracto) - Es la que manda la empresa
        if (d.placa_camion) {
            const pCamion = {
                placa: d.placa_camion,
                es_motora: true,
                tipo_unidad: d.tipo_unidad || 'Camión',
                sub_tipo: d.sub_tipo || d.tipo_unidad || 'Camión',
                estado: d.estado || 'En Base',
                empresa: empPrincipal,
                marca: d.marca || '',
                conductor: d.conductor_asignado || '',
                observaciones: d.observaciones || '',
                capacidad_tanque: d.capacidad_tanque || ''
            };

            let include = true;
            if (aplicarFiltros) {
                if (filtroCard !== 'TODOS' && pCamion.estado !== filtroCard) include = false;
                if (filtroEmp !== 'TODAS') {
                    const empU = pCamion.empresa.toUpperCase();
                    if (empU !== filtroEmp.toUpperCase() && !empU.includes(filtroEmp.toUpperCase())) include = false;
                }
                if (q) {
                    const matches = [pCamion.placa, pCamion.sub_tipo, pCamion.conductor, pCamion.marca, pCamion.empresa, pCamion.estado, pCamion.observaciones]
                        .some(v => String(v).toLowerCase().includes(q));
                    if (!matches) include = false;
                }
            }
            if (include) placas.push(pCamion);
        }

        // 2. Unidad Carreta / Remolque (Hereda la empresa de la unidad motora a la que pertenece)
        if (d.placa_carreta) {
            const pCarreta = {
                placa: d.placa_carreta,
                es_motora: false,
                tipo_unidad: d.tipo_unidad_carreta || 'Carreta',
                sub_tipo: d.sub_tipo_carreta || d.sub_tipo || 'Carreta',
                estado: d.estado_carreta || d.estado || 'En Base',
                empresa: empPrincipal, // La motora es la que manda
                marca: d.marca_carreta || d.marca || '',
                conductor: d.conductor_asignado || '',
                observaciones: d.observaciones || '',
                capacidad_tanque: '—'
            };

            let include = true;
            if (aplicarFiltros) {
                if (filtroCard !== 'TODOS' && pCarreta.estado !== filtroCard) include = false;
                if (filtroEmp !== 'TODAS') {
                    const empU = pCarreta.empresa.toUpperCase();
                    if (empU !== filtroEmp.toUpperCase() && !empU.includes(filtroEmp.toUpperCase())) include = false;
                }
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

// ── Renderizar Botones Segmentados de Empresas Dinámicamente (Solo Unidades Motoras) ──
window.dispRenderizarSegmentedEmpresas = function () {
    const container = document.getElementById('btn-group-empresas-disp');
    if (!container) return;

    const empresasSet = new Set();
    (window.dispDatos || []).forEach(d => {
        // Solo extraer empresas de unidades motoras (Camión / Tracto)
        if (d.placa_camion) {
            const emp = (d.empresa || d.cliente || '').trim();
            if (emp) empresasSet.add(emp);
        }
    });

    const empresas = Array.from(empresasSet).sort();

    let html = `<button type="button" class="ck-segment-item ${window._dispFiltroEmpresa === 'TODAS' ? 'active' : ''}" data-empresa="TODAS" onclick="window.dispFiltrarPorEmpresa('TODAS', this)">Todas</button>`;

    empresas.forEach(emp => {
        let shortName = emp.replace(/S\.A\.C\.?/i, '').replace(/S\.A\.?/i, '').trim();
        if (!shortName) shortName = emp;
        const isActive = window._dispFiltroEmpresa === emp ? 'active' : '';
        html += `<button type="button" class="ck-segment-item ${isActive}" data-empresa="${_dispEsc(emp)}" onclick="window.dispFiltrarPorEmpresa('${_dispEsc(emp)}', this)">${_dispEsc(shortName)}</button>`;
    });

    container.innerHTML = html;
};

// ── Actualizar Métricas Superiores (Bento KPIs de Flota Real Dinámicos) ──
window.dispActualizarKPIs = function () {
    const filtroEmp = window._dispFiltroEmpresa || 'TODAS';
    const q = (document.getElementById('dispBuscador')?.value || '').toLowerCase().trim();

    const placas = [];
    (window.dispDatos || []).forEach(d => {
        const empPrincipal = (d.empresa || d.cliente || '').trim();

        // 1. Unidad Motora
        if (d.placa_camion) {
            const pCamion = {
                placa: d.placa_camion,
                es_motora: true,
                estado: d.estado || 'En Base',
                empresa: empPrincipal,
                marca: d.marca || '',
                conductor: d.conductor_asignado || '',
                observaciones: d.observaciones || '',
                sub_tipo: d.sub_tipo || d.tipo_unidad || 'Camión'
            };
            let include = true;
            if (filtroEmp !== 'TODAS') {
                const empU = pCamion.empresa.toUpperCase();
                if (empU !== filtroEmp.toUpperCase() && !empU.includes(filtroEmp.toUpperCase())) include = false;
            }
            if (q) {
                const matches = [pCamion.placa, pCamion.sub_tipo, pCamion.conductor, pCamion.marca, pCamion.empresa, pCamion.estado, pCamion.observaciones]
                    .some(v => String(v).toLowerCase().includes(q));
                if (!matches) include = false;
            }
            if (include) placas.push(pCamion);
        }

        // 2. Unidad Carreta / Remolque (hereda la empresa de la unidad motora)
        if (d.placa_carreta) {
            const pCarreta = {
                placa: d.placa_carreta,
                es_motora: false,
                estado: d.estado_carreta || d.estado || 'En Base',
                empresa: empPrincipal,
                marca: d.marca_carreta || d.marca || '',
                conductor: d.conductor_asignado || '',
                observaciones: d.observaciones || '',
                sub_tipo: d.sub_tipo_carreta || d.sub_tipo || 'Carreta'
            };
            let include = true;
            if (filtroEmp !== 'TODAS') {
                const empU = pCarreta.empresa.toUpperCase();
                if (empU !== filtroEmp.toUpperCase() && !empU.includes(filtroEmp.toUpperCase())) include = false;
            }
            if (q) {
                const matches = [pCarreta.placa, pCarreta.sub_tipo, pCarreta.conductor, pCarreta.marca, pCarreta.empresa, pCarreta.estado, pCarreta.observaciones]
                    .some(v => String(v).toLowerCase().includes(q));
                if (!matches) include = false;
            }
            if (include) placas.push(pCarreta);
        }
    });

    const total = placas.length;
    let enBase = 0;
    let enRuta = 0;
    let enMant = 0;

    placas.forEach(p => {
        const est = (p.estado || 'En Base').toLowerCase();
        if (est.includes('mant') || est.includes('taller')) enMant++;
        else if (est.includes('ruta')) enRuta++;
        else enBase++;
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
        // Filtro 1: Card Superior (Estado)
        if (filtroCard !== 'TODOS') {
            if (filtroCard === 'En Base' && item.estado !== 'En Base') return false;
            if (filtroCard === 'En Ruta' && item.estado !== 'En Ruta') return false;
            if (filtroCard === 'En Mantenimiento' && item.estado !== 'En Mantenimiento') return false;
        }

        // Filtro 2: Empresa Segmentada (Aplica exclusivamente sobre la empresa de la unidad motora)
        if (filtroEmp !== 'TODAS') {
            const itemEmp = (item.empresa || item.cliente || '').trim().toUpperCase();
            const empTarget = filtroEmp.toUpperCase();
            if (itemEmp !== empTarget && !itemEmp.includes(empTarget)) return false;
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
                item.empresa || '',
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
                <td colspan="10" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-3 d-block mb-2 text-secondary"></i>
                    No se encontraron unidades registradas con los filtros seleccionados.
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    datos.forEach((item, index) => {
        const num = index + 1;
        const est = item.estado || 'En Base';

        let estadoBadge = '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle px-3 py-1 fw-bold text-uppercase" style="font-size:0.72rem; border-radius:8px;">En Base</span>';
        if (est === 'En Mantenimiento') {
            estadoBadge = '<span class="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle px-3 py-1 fw-bold text-uppercase" style="font-size:0.72rem; border-radius:8px;">En Mantenimiento</span>';
        } else if (est === 'En Ruta') {
            estadoBadge = '<span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle px-3 py-1 fw-bold text-uppercase" style="font-size:0.72rem; border-radius:8px;">En Ruta</span>';
        }

        const capTanque = item.capacidad_tanque || '—';
        const conductor = item.conductor_asignado ? _dispEsc(item.conductor_asignado) : '<span class="text-muted">—</span>';
        const obs = item.observaciones ? _dispEsc(item.observaciones) : '<span class="text-muted">—</span>';

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
                <td class="pe-4 text-end" style="min-width: 90px;">
                    <div class="d-inline-flex align-items-center justify-content-end gap-1">
                        <button type="button" class="ck-action-btn ck-btn-edit" onclick="window.dispEditarFila(${index})" title="Editar registro">
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

    let html = '';
    datos.forEach((item, index) => {
        const est = item.estado || 'En Base';

        let badgeEstadoMobile = '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle px-2 py-1 fw-bold text-uppercase" style="font-size:0.68rem; border-radius:6px;">En Base</span>';
        if (est === 'En Mantenimiento') {
            badgeEstadoMobile = '<span class="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle px-2 py-1 fw-bold text-uppercase" style="font-size:0.68rem; border-radius:6px;">En Mantenimiento</span>';
        } else if (est === 'En Ruta') {
            badgeEstadoMobile = '<span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle px-2 py-1 fw-bold text-uppercase" style="font-size:0.68rem; border-radius:6px;">En Ruta</span>';
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

                ${item.observaciones ? `
                    <div class="p-2 bg-light rounded-3 text-secondary small mb-2" style="font-size:0.75rem;">
                        <i class="bi bi-chat-left-text me-1"></i>${_dispEsc(item.observaciones)}
                    </div>
                ` : ''}

                <!-- Botones de Acción Móvil -->
                <div class="d-flex align-items-center justify-content-end gap-2 pt-2 border-top">
                    <button type="button" class="btn btn-sm btn-outline-secondary fw-bold px-3 py-1 d-flex align-items-center gap-1" onclick="window.dispEditarFila(${index})" style="border-radius:8px; font-size:0.78rem;">
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

window.dispEditarFila = function (index) {
    const item = (window.dispDatos || [])[index];
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

    const payload = {
        placa_camion: cam,
        placa_carreta: car,
        conductor_asignado: (document.getElementById('disp-f-conductor-asignado').value || '').trim(),
        marca: (document.getElementById('disp-f-marca').value || '').trim().toUpperCase(),
        capacidad_tanque: (document.getElementById('disp-f-capacidad').value || '').trim(),
        tipo_unidad: (document.getElementById('disp-f-tipo-unidad').value || '').trim(),
        estado: (document.getElementById('disp-f-estado').value || 'En Base').trim(),
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

// ── Exportar Excel ────────────────────────────────────────────────
window.dispExportarExcel = function () {
    if (typeof XLSX === 'undefined') {
        alert('Librería XLSX no disponible');
        return;
    }

    const rows = (window.dispDatos || []).map((d, i) => ({
        '#': i + 1,
        'CAMIÓN': d.placa_camion || '—',
        'CARRETA': d.placa_carreta || '—',
        'CONDUCTOR': d.conductor_asignado || '—',
        'ESTADO': d.estado || 'En Base',
        'MARCA': d.marca || '—',
        'CAPACIDAD DE TANQUE': d.capacidad_tanque || '—',
        'TIPO UNIDAD': d.tipo_unidad || '—',
        'OBSERVACIONES': d.observaciones || '—'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Disponibilidad Flota');
    XLSX.writeFile(wb, `Disponibilidad_Flota_${new Date().toISOString().split('T')[0]}.xlsx`);
};

// ── Modal Cuadro Resumen ──────────────────────────────────────────
window.dispAbrirModalCuadro = function () {
    const modalEl = document.getElementById('modalDisponibilidadCuadro');
    const bodyEl = document.getElementById('disp-cuadro-body');
    if (!modalEl || !bodyEl) return;

    const datos = window.dispDatos || [];
    const tipos = {};

    datos.forEach(d => {
        const t = d.tipo_unidad || 'Otros';
        if (!tipos[t]) tipos[t] = { total: 0, base: 0, ruta: 0, mant: 0 };
        tipos[t].total++;
        if (d.estado === 'En Mantenimiento') tipos[t].mant++;
        else if (d.estado === 'En Ruta') tipos[t].ruta++;
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
