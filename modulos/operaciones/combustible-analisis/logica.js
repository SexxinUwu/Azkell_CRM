// ── LÓGICA DE ANÁLISIS DE COMBUSTIBLE — ERP AZKELL FLEET (OPERACIONES) ───────────
(function() {
    const esc = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    window._caRawData = [];
    window._caTripGroups = [];
    window._caFilteredTrips = [];
    window._caMatrizRendimiento = [];
    window._caPaginaActual = 1;
    window._caLimitePorPagina = 50;

    // Inicializador del módulo
    window.inicializarModuloCombustibleAnalisis = function() {
        window.caCargarMatrizRendimiento();
        window.caCargarDatosDesdeERP();
    };

    // Cargar Matriz de Rendimiento Teórico desde el Backend (vw_combustible_rendimiento)
    window.caCargarMatrizRendimiento = async function() {
        try {
            const res = await fetch('/api/combustible/rendimiento-teorico');
            const data = await res.json();
            if (data.ok && Array.isArray(data.data)) {
                window._caMatrizRendimiento = data.data;
            }
        } catch (e) {
            console.error('Error cargando matriz de rendimiento teórico:', e);
        }
    };

    // Cargar Datos Consolidados desde la BD del ERP
    window.caCargarDatosDesdeERP = async function() {
        const tbody = document.getElementById('ca-trip-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" class="text-center py-5 text-muted">
                        <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                        Consultando análisis dinámico desde la Base de Datos...
                    </td>
                </tr>
            `;
        }

        try {
            const res = await fetch('/api/combustible/analisis-viajes');
            const data = await res.json();

            if (data.ok && Array.isArray(data.trips)) {
                window._caTripGroups = data.trips;
                
                const bannerCount = document.getElementById('ca-record-count-info');
                if (bannerCount) bannerCount.textContent = `${data.trips.length.toLocaleString()} viajes`;

                window.caPoblarFiltros();
                window.caAplicarFiltros(true);
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="13" class="text-center text-muted py-4">No hay vales registrados para analizar.</td></tr>`;
            }
        } catch (e) {
            console.error('Error cargando análisis de combustible:', e);
            if (tbody) tbody.innerHTML = `<tr><td colspan="13" class="text-center text-danger py-4">Error de conexión al cargar análisis.</td></tr>`;
        }
    };

    // Poblar selects de filtros dinámicamente
    window.caPoblarFiltros = function() {
        const selYear = document.getElementById('ca-filter-year');
        const selFuel = document.getElementById('ca-filter-fuel');
        const selPlate = document.getElementById('ca-filter-plate');

        const allYears = new Set();
        const allFuels = new Set();
        const allPlates = new Set();

        window._caTripGroups.forEach(t => {
            // Extraer año de serie de viaje o fecha
            if (t.viaje && t.viaje !== 'SIN-VIAJE') {
                const yMatch = t.viaje.match(/^(\d{4})/);
                if (yMatch) allYears.add(yMatch[1]);
            }
            if (t.fechaFin && t.fechaFin !== 'N/D') {
                const yDate = t.fechaFin.slice(0, 4);
                if (yDate.match(/^\d{4}$/)) allYears.add(yDate);
            }

            if (t.placa && t.placa !== 'SIN-PLACA') allPlates.add(t.placa);
            if (t.vouchers) {
                t.vouchers.forEach(v => {
                    if (v.producto) allFuels.add(v.producto);
                });
            }
        });

        // Poblar Años (ordenados DESC: 2026, 2025, 2024...)
        if (selYear) {
            const sortedYears = Array.from(allYears).sort((a, b) => b.localeCompare(a));
            selYear.innerHTML = `<option value="ALL">Todos</option>` +
                sortedYears.map(y => `<option value="${y}">${y}</option>`).join('');
            selYear.value = 'ALL';
        }

        // Helper fecha de hoy en hora local de Perú (America/Lima UTC-5)
        const getTodayPeru = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

        // Por defecto: Fecha de hoy en ambos inputs
        const today = getTodayPeru();
        const inpFrom = document.getElementById('ca-filter-date-from');
        const inpTo = document.getElementById('ca-filter-date-to');
        if (inpFrom && !inpFrom.value) inpFrom.value = today;
        if (inpTo && !inpTo.value) inpTo.value = today;

        if (selFuel) {
            const cur = selFuel.value;
            selFuel.innerHTML = '<option value="ALL">Todos</option>' +
                Array.from(allFuels).sort().map(f => `<option value="${f}">${f}</option>`).join('');
            if (cur && allFuels.has(cur)) {
                selFuel.value = cur;
            } else if (allFuels.has('D2')) {
                selFuel.value = 'D2';
            }
        }

        if (selPlate) {
            const cur = selPlate.value;
            selPlate.innerHTML = '<option value="ALL">Todas las Placas</option>' +
                Array.from(allPlates).sort().map(p => `<option value="${p}">${p}</option>`).join('');
            if (allPlates.has(cur)) selPlate.value = cur;
        }
    };

    // ── ESTADO GLOBAL DE MULTI-FILTROS AVANZADOS ───────────────────────
    window._caFiltrosState = {
        placas: new Set(),
        carretas: new Set(),
        rutas: new Set(),
        choferes: new Set(),
        motores: new Set(),
        pesos: new Set(),
        combustible: 'ALL',
        anio: 'ALL',
        orden: 'date_desc'
    };

    // Cambiar filtro por año rápido
    window.caCambiarFiltroAno = function(year) {
        window._caFiltrosState.anio = year;
        const inpFrom = document.getElementById('ca-filter-date-from');
        const inpTo = document.getElementById('ca-filter-date-to');
        if (year === 'ALL') {
            if (inpFrom) inpFrom.value = '';
            if (inpTo) inpTo.value = '';
        } else {
            if (inpFrom) inpFrom.value = `${year}-01-01`;
            if (inpTo) inpTo.value = `${year}-12-31`;
        }
        window.caAplicarFiltros(true);
    };

    // Restablecer rango de fechas a hoy
    window.caLimpiarFiltrosFechas = function() {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const inpFrom = document.getElementById('ca-filter-date-from');
        const inpTo = document.getElementById('ca-filter-date-to');
        if (inpFrom) inpFrom.value = today;
        if (inpTo) inpTo.value = today;
        window.caAplicarFiltros(true);
    };

    // Cambiar página
    window.caCambiarPagina = function(p) {
        window._caPaginaActual = p;
        window.caRenderTabla();
    };

    // Cambiar tamaño de página
    window.caCambiarTamanoPagina = function(val) {
        window._caLimitePorPagina = val === 'ALL' ? 'ALL' : parseInt(val, 10);
        window._caPaginaActual = 1;
        window.caRenderTabla();
    };

    // Alternar Ordenamiento
    window.caToggleSort = function(col) {
        let cur = window._caFiltrosState.orden || 'date_desc';
        if (col === 'trip') {
            window._caFiltrosState.orden = cur === 'trip_desc' ? 'trip_asc' : 'trip_desc';
        } else if (col === 'date_start') {
            window._caFiltrosState.orden = cur === 'date_asc' ? 'date_desc' : 'date_asc';
        } else if (col === 'date_end') {
            window._caFiltrosState.orden = cur === 'date_desc' ? 'date_asc' : 'date_desc';
        } else if (col === 'gal') {
            window._caFiltrosState.orden = cur === 'gal_desc' ? 'trip_desc' : 'gal_desc';
        } else if (col === 'cost') {
            window._caFiltrosState.orden = cur === 'cost_desc' ? 'trip_desc' : 'cost_desc';
        }
        window.caAplicarFiltros(false);
    };

    // ── DRAWER DE FILTROS AVANZADOS JERÁRQUICO ESTILO iOS / REPORTE DE FALLAS ──
    window._caCategoriaActivaFiltro = '';

    const CA_CATEGORIAS = [
        { key: 'placas', title: 'Placa / Tracto', icon: 'bi-truck', color: '#2563eb', bg: '#eff6ff', desc: 'Unidades motrices' },
        { key: 'carretas', title: 'Carreta / Remolque', icon: 'bi-trailers', color: '#d97706', bg: '#fffbeb', desc: 'Semirremolques y cisternas' },
        { key: 'rutas', title: 'Ruta / Destino', icon: 'bi-signpost-2', color: '#0d9488', bg: '#f0fdfa', desc: 'Trayectos y destinos' },
        { key: 'choferes', title: 'Conductor / Chofer', icon: 'bi-person-badge', color: '#7c3aed', bg: '#f5f3ff', desc: 'Operadores asignados' },
        { key: 'motores', title: 'Modelo de Motor', icon: 'bi-cpu', color: '#ea580c', bg: '#fff7ed', desc: 'Motor y calibración' },
        { key: 'pesos', title: 'Peso / Carga (Tn)', icon: 'bi-speedometer2', color: '#0284c7', bg: '#f0f9ff', desc: 'Tonelaje transportado' },
        { key: 'combustible', title: 'Tipo de Combustible', icon: 'bi-fuel-pump', color: '#16a34a', bg: '#f0fdf4', desc: 'D2 Diésel o UREA' },
        { key: 'anio', title: 'Año de Registro', icon: 'bi-calendar3', color: '#475569', bg: '#f1f5f9', desc: 'Año de los viajes' },
        { key: 'orden', title: 'Criterio de Orden', icon: 'bi-arrow-down-up', color: '#64748b', bg: '#f8fafc', desc: 'Criterio de clasificación' }
    ];

    window.caAbrirDrawerFiltros = function() {
        const modalEl = document.getElementById('caModalFiltros');
        if (!modalEl) return;

        window.caRenderListaCategoriasFiltro();

        // Reset vista al abrir (Vista 1 Principal)
        const slider = document.getElementById('ca-filtros-slider');
        if (slider) slider.style.transform = 'translateX(0)';

        document.getElementById('header-ca-flt-main')?.classList.remove('d-none');
        document.getElementById('footer-ca-flt-main')?.classList.remove('d-none');
        document.getElementById('header-ca-flt-detail')?.classList.add('d-none');

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
        window.caActualizarContadorPreviaFiltros();
    };

    window.caRenderListaCategoriasFiltro = function() {
        const cont = document.getElementById('ca-lista-categorias-filtro');
        if (!cont) return;

        const fState = window._caFiltrosState;

        let html = '';
        CA_CATEGORIAS.forEach((cat, idx) => {
            let badgeTxt = '';
            let isActivo = false;

            if (cat.key === 'placas') {
                const s = fState.placas.size;
                badgeTxt = s > 0 ? `${s} sel.` : 'Todas';
                isActivo = s > 0;
            } else if (cat.key === 'carretas') {
                const s = fState.carretas.size;
                badgeTxt = s > 0 ? `${s} sel.` : 'Todas';
                isActivo = s > 0;
            } else if (cat.key === 'rutas') {
                const s = fState.rutas.size;
                badgeTxt = s > 0 ? `${s} sel.` : 'Todas';
                isActivo = s > 0;
            } else if (cat.key === 'choferes') {
                const s = fState.choferes.size;
                badgeTxt = s > 0 ? `${s} sel.` : 'Todos';
                isActivo = s > 0;
            } else if (cat.key === 'motores') {
                const s = fState.motores.size;
                badgeTxt = s > 0 ? `${s} sel.` : 'Todos';
                isActivo = s > 0;
            } else if (cat.key === 'pesos') {
                const s = fState.pesos.size;
                badgeTxt = s > 0 ? `${s} sel.` : 'Todos';
                isActivo = s > 0;
            } else if (cat.key === 'combustible') {
                badgeTxt = fState.combustible !== 'ALL' ? fState.combustible : 'Todos';
                isActivo = fState.combustible !== 'ALL';
            } else if (cat.key === 'anio') {
                badgeTxt = fState.anio !== 'ALL' ? `Año ${fState.anio}` : 'Todos';
                isActivo = fState.anio !== 'ALL';
            } else if (cat.key === 'orden') {
                const mapOrd = {
                    date_desc: 'Fecha Reciente ▼',
                    date_asc: 'Fecha Antigua ▲',
                    trip_desc: 'N° Viaje Mayor ▼',
                    trip_asc: 'N° Viaje Menor ▲',
                    gal_desc: 'Mayor Galones ▼',
                    cost_desc: 'Mayor Gasto ▼'
                };
                badgeTxt = mapOrd[fState.orden] || 'Fecha Reciente ▼';
                isActivo = false;
            }

            const borderBottom = idx < CA_CATEGORIAS.length - 1 ? 'border-bottom' : '';
            const badgeClass = isActivo ? 'bg-primary text-white shadow-2xs' : 'text-muted';
            const badgeBg = isActivo ? '' : 'background: #f1f5f9;';

            html += `
                <div class="d-flex align-items-center justify-content-between p-3 ${borderBottom}" style="cursor: pointer; transition: background 0.12s ease;" onclick="window.caEntrarFiltroDetalle('${cat.key}', '${cat.title}')" onmouseenter="this.style.background='#f8fafc'" onmouseleave="this.style.background='#ffffff'">
                    <div class="d-flex align-items-center gap-3">
                        <div class="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0" style="width:36px; height:36px; background:${cat.bg}; color:${cat.color}; font-size:1.1rem;">
                            <i class="bi ${cat.icon}"></i>
                        </div>
                        <div>
                            <div class="fw-semibold text-dark" style="font-size:0.94rem; letter-spacing: -0.01em;">${cat.title}</div>
                            <small class="text-muted" style="font-size:0.75rem;">${cat.desc || ''}</small>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge rounded-pill ${badgeClass} font-monospace fw-semibold px-2.5 py-1" style="${badgeBg} font-size:0.75rem;">${badgeTxt}</span>
                        <i class="bi bi-chevron-right text-muted opacity-50" style="font-size:0.75rem;"></i>
                    </div>
                </div>
            `;
        });

        cont.innerHTML = html;
    };

    window.caEntrarFiltroDetalle = function(catKey, catTitle) {
        window._caCategoriaActivaFiltro = catKey;

        const tituloEl = document.getElementById('ca-titulo-categoria-filtro');
        const searchInp = document.getElementById('ca-buscador-opciones-filtro');
        const clearBtn = document.getElementById('ca-btn-clear-search');
        const quickActions = document.getElementById('ca-detail-quick-actions');
        const listaDetalle = document.getElementById('ca-lista-opciones-detalle');
        const emptyEl = document.getElementById('ca-filtro-empty-search');

        if (tituloEl) tituloEl.innerText = catTitle;
        if (searchInp) {
            searchInp.value = '';
            searchInp.placeholder = `Buscar en ${catTitle.toLowerCase()}...`;
        }
        if (clearBtn) clearBtn.classList.add('d-none');
        if (emptyEl) emptyEl.classList.add('d-none');

        const trips = window._caTripGroups || [];
        const fState = window._caFiltrosState;

        let html = '';

        if (catKey === 'placas' || catKey === 'carretas' || catKey === 'rutas' || catKey === 'choferes' || catKey === 'motores' || catKey === 'pesos') {
            if (quickActions) quickActions.style.setProperty('display', 'flex', 'important');

            const mapCounts = {};
            trips.forEach(t => {
                if (catKey === 'placas' && t.placa) mapCounts[t.placa] = (mapCounts[t.placa] || 0) + 1;
                if (catKey === 'carretas') {
                    if (t.carreta && t.carreta !== '—') mapCounts[t.carreta] = (mapCounts[t.carreta] || 0) + 1;
                    (t.vouchers || []).forEach(v => { if (v.carreta && v.carreta !== '—') mapCounts[v.carreta] = (mapCounts[v.carreta] || 0) + 1; });
                }
                if (catKey === 'rutas' && t.ruta && t.ruta !== '—') mapCounts[t.ruta] = (mapCounts[t.ruta] || 0) + 1;
                if (catKey === 'choferes') {
                    (t.vouchers || []).forEach(v => { if (v.conductor && v.conductor !== '—') mapCounts[v.conductor] = (mapCounts[v.conductor] || 0) + 1; });
                }
                if (catKey === 'motores') {
                    const mot = (t.motor && t.motor.trim()) ? t.motor.trim() : 'SIN MOTOR';
                    mapCounts[mot] = (mapCounts[mot] || 0) + 1;
                }
                if (catKey === 'pesos') {
                    const pLabel = (t.pesoMaxTn !== undefined && t.pesoMaxTn > 0) ? `${Number(t.pesoMaxTn).toFixed(2)} Tn` : '0.00 Tn (Vacío)';
                    mapCounts[pLabel] = (mapCounts[pLabel] || 0) + 1;
                }
            });

            const keys = Object.keys(mapCounts).sort((a, b) => {
                if (catKey === 'pesos') {
                    const numA = parseFloat(a) || 0;
                    const numB = parseFloat(b) || 0;
                    return numB - numA;
                }
                return a.localeCompare(b, undefined, { numeric: true });
            });

            if (keys.length === 0) {
                html = '<div class="text-center py-5 text-muted small"><i class="bi bi-info-circle fs-4 d-block mb-1 opacity-50"></i>Sin opciones en el período.</div>';
            } else {
                const selSet = fState[catKey];
                html = keys.map((k, idx) => {
                    const checked = selSet.has(k);
                    const kEscaped = k.replace(/'/g, "\\'");
                    const checkClass = checked ? 'bi-check-square-fill text-primary' : 'bi-square text-muted opacity-40';
                    const bgClass = checked ? 'background: #f0f7ff;' : 'background: #ffffff;';

                    return `
                        <div class="opt-ca-filtro-item d-flex align-items-center justify-content-between px-3 py-2.5 border-bottom" data-search="${k.toLowerCase()}" onclick="window.caToggleFiltroFila(this, '${catKey}', '${kEscaped}')" style="${bgClass} cursor: pointer; transition: background 0.12s ease;">
                            <div class="d-flex align-items-center gap-2.5 text-truncate pe-2">
                                <i class="bi ${checkClass} fs-5 flex-shrink-0 ca-chk-icon"></i>
                                <span class="text-dark font-monospace fw-semibold text-truncate" style="font-size:0.88rem;">${k}</span>
                            </div>
                            <span class="badge rounded-pill text-muted font-monospace" style="background: #f1f5f9; font-size:0.75rem; padding: 3px 8px;">${mapCounts[k]}</span>
                        </div>
                    `;
                }).join('');
            }
        } else if (catKey === 'combustible') {
            if (quickActions) quickActions.style.setProperty('display', 'none', 'important');
            const curFuel = fState.combustible || 'ALL';
            const fuels = [
                { val: 'ALL', label: 'Todos los Combustibles' },
                { val: 'D2', label: 'D2 (Diésel)' },
                { val: 'UREA', label: 'UREA' }
            ];
            html = fuels.map(f => {
                const checked = curFuel === f.val;
                const iconCheck = checked ? 'bi-check-circle-fill text-primary' : 'bi-circle text-muted opacity-40';
                return `
                    <div class="opt-ca-filtro-item d-flex align-items-center justify-content-between px-3 py-3 border-bottom" data-search="${f.label.toLowerCase()}" style="cursor: pointer; background:#ffffff;" onclick="window.caSetFiltroSimple('combustible', '${f.val}')">
                        <span class="text-dark fw-bold" style="font-size:0.9rem;">${f.label}</span>
                        <i class="bi ${iconCheck} fs-5"></i>
                    </div>
                `;
            }).join('');
        } else if (catKey === 'anio') {
            if (quickActions) quickActions.style.setProperty('display', 'none', 'important');
            const curYear = fState.anio || 'ALL';
            const yearSet = new Set();
            trips.forEach(t => {
                if (t.fechaInicio && t.fechaInicio.length >= 4) yearSet.add(t.fechaInicio.slice(0, 4));
                if (t.fechaFin && t.fechaFin.length >= 4) yearSet.add(t.fechaFin.slice(0, 4));
            });
            const years = ['ALL', ...Array.from(yearSet).sort().reverse()];
            html = years.map(y => {
                const checked = String(curYear) === String(y);
                const label = y === 'ALL' ? 'Todos los Años' : `Año ${y}`;
                const iconCheck = checked ? 'bi-check-circle-fill text-primary' : 'bi-circle text-muted opacity-40';
                return `
                    <div class="opt-ca-filtro-item d-flex align-items-center justify-content-between px-3 py-3 border-bottom" data-search="${label.toLowerCase()}" style="cursor: pointer; background:#ffffff;" onclick="window.caSetFiltroSimple('anio', '${y}')">
                        <span class="text-dark fw-bold font-monospace" style="font-size:0.9rem;">${label}</span>
                        <i class="bi ${iconCheck} fs-5"></i>
                    </div>
                `;
            }).join('');
        } else if (catKey === 'orden') {
            if (quickActions) quickActions.style.setProperty('display', 'none', 'important');
            const curOrd = fState.orden || 'date_desc';
            const ords = [
                { val: 'date_desc', label: 'Fecha ▼ (Más Recientes Primero)' },
                { val: 'date_asc', label: 'Fecha ▲ (Más Antiguos Primero)' },
                { val: 'trip_desc', label: 'N° Viaje ▼ (Mayor a Menor)' },
                { val: 'trip_asc', label: 'N° Viaje ▲ (Menor a Mayor)' },
                { val: 'gal_desc', label: 'Galones ▼ (Mayor Consumo)' },
                { val: 'cost_desc', label: 'Gasto ▼ (Mayor Costo S/)' }
            ];
            html = ords.map(o => {
                const checked = curOrd === o.val;
                const iconCheck = checked ? 'bi-check-circle-fill text-primary' : 'bi-circle text-muted opacity-40';
                return `
                    <div class="opt-ca-filtro-item d-flex align-items-center justify-content-between px-3 py-3 border-bottom" data-search="${o.label.toLowerCase()}" style="cursor: pointer; background:#ffffff;" onclick="window.caSetFiltroSimple('orden', '${o.val}')">
                        <span class="text-dark fw-semibold" style="font-size:0.88rem;">${o.label}</span>
                        <i class="bi ${iconCheck} fs-5"></i>
                    </div>
                `;
            }).join('');
        }

        if (listaDetalle) listaDetalle.innerHTML = html;

        // Animar slider hacia la izquierda (Vista 2 Detalle)
        document.getElementById('header-ca-flt-main')?.classList.add('d-none');
        document.getElementById('footer-ca-flt-main')?.classList.add('d-none');
        document.getElementById('header-ca-flt-detail')?.classList.remove('d-none');

        const slider = document.getElementById('ca-filtros-slider');
        if (slider) slider.style.transform = 'translateX(-100%)';

        setTimeout(() => {
            if (searchInp && (catKey === 'placas' || catKey === 'carretas' || catKey === 'rutas' || catKey === 'choferes' || catKey === 'pesos')) {
                searchInp.focus();
            }
        }, 150);
    };

    window.caFiltrosNavAtras = function() {
        window.caRenderListaCategoriasFiltro();
        window.caActualizarContadorPreviaFiltros();

        document.getElementById('header-ca-flt-main')?.classList.remove('d-none');
        document.getElementById('footer-ca-flt-main')?.classList.remove('d-none');
        document.getElementById('header-ca-flt-detail')?.classList.add('d-none');

        const slider = document.getElementById('ca-filtros-slider');
        if (slider) slider.style.transform = 'translateX(0)';
    };

    // Buscador instantáneo en tiempo real (Corregido para iOS / Bootstrap)
    window.caBuscarEnFiltroOpciones = function(txt) {
        const raw = (txt || '').toLowerCase().trim();
        const clean = raw.replace(/[\s\-_/]/g, '');
        const clearBtn = document.getElementById('ca-btn-clear-search');
        if (clearBtn) clearBtn.classList.toggle('d-none', raw.length === 0);

        const items = document.querySelectorAll('.opt-ca-filtro-item');
        let visibleCount = 0;

        items.forEach(item => {
            const val = (item.getAttribute('data-search') || item.textContent || '').toLowerCase();
            const valClean = val.replace(/[\s\-_/]/g, '');

            const match = !clean || val.includes(raw) || valClean.includes(clean);
            if (match) {
                item.classList.remove('d-none');
                item.style.setProperty('display', 'flex', 'important');
                visibleCount++;
            } else {
                item.classList.add('d-none');
                item.style.setProperty('display', 'none', 'important');
            }
        });

        const emptyEl = document.getElementById('ca-filtro-empty-search');
        if (emptyEl) {
            if (visibleCount === 0 && raw.length > 0) {
                emptyEl.classList.remove('d-none');
            } else {
                emptyEl.classList.add('d-none');
            }
        }
    };

    window.caLimpiarInputBuscador = function() {
        const inp = document.getElementById('ca-buscador-opciones-filtro');
        if (inp) {
            inp.value = '';
            inp.focus();
        }
        window.caBuscarEnFiltroOpciones('');
    };

    // Alternar selección al hacer clic en cualquier parte de la fila
    window.caToggleFiltroFila = function(rowEl, catKey, val) {
        if (!window._caFiltrosState[catKey]) window._caFiltrosState[catKey] = new Set();
        const setRef = window._caFiltrosState[catKey];
        const isCurrentlyChecked = setRef.has(val);

        if (isCurrentlyChecked) {
            setRef.delete(val);
        } else {
            setRef.add(val);
        }

        const newChecked = !isCurrentlyChecked;
        const icon = rowEl.querySelector('.ca-chk-icon');
        if (icon) {
            if (newChecked) {
                icon.className = 'bi bi-check-square-fill text-primary fs-5 flex-shrink-0 ca-chk-icon';
                rowEl.style.background = '#f0f7ff';
            } else {
                icon.className = 'bi bi-square text-muted opacity-40 fs-5 flex-shrink-0 ca-chk-icon';
                rowEl.style.background = '#ffffff';
            }
        }

        window.caActualizarContadorPreviaFiltros();
    };

    window.caSetFiltroSimple = function(catKey, val) {
        window._caFiltrosState[catKey] = val;
        if (catKey === 'anio') {
            window.caCambiarFiltroAno(val);
        }
        window.caFiltrosNavAtras();
    };

    window.caMarcarTodasDetalle = function(checked) {
        const catKey = window._caCategoriaActivaFiltro;
        if (!catKey || !window._caFiltrosState[catKey]) return;

        const items = document.querySelectorAll('.opt-ca-filtro-item');
        items.forEach(item => {
            if (!item.classList.contains('d-none') && item.style.display !== 'none') {
                const searchVal = item.querySelector('span')?.innerText?.trim();
                if (searchVal) {
                    if (checked) {
                        window._caFiltrosState[catKey].add(searchVal);
                        const icon = item.querySelector('.ca-chk-icon');
                        if (icon) icon.className = 'bi bi-check-square-fill text-primary fs-5 flex-shrink-0 ca-chk-icon';
                        item.style.background = '#f0f7ff';
                    } else {
                        window._caFiltrosState[catKey].delete(searchVal);
                        const icon = item.querySelector('.ca-chk-icon');
                        if (icon) icon.className = 'bi bi-square text-muted opacity-40 fs-5 flex-shrink-0 ca-chk-icon';
                        item.style.background = '#ffffff';
                    }
                }
            }
        });
        window.caActualizarContadorPreviaFiltros();
    };

    window.caLimpiarFiltroCategoriaActual = function() {
        const catKey = window._caCategoriaActivaFiltro;
        if (!catKey) return;
        if (window._caFiltrosState[catKey] instanceof Set) {
            window._caFiltrosState[catKey].clear();
        } else {
            window._caFiltrosState[catKey] = (catKey === 'orden' ? 'date_desc' : 'ALL');
        }

        document.querySelectorAll('.opt-ca-filtro-item').forEach(item => {
            const icon = item.querySelector('.ca-chk-icon');
            if (icon) icon.className = 'bi bi-square text-muted opacity-40 fs-5 flex-shrink-0 ca-chk-icon';
            item.style.background = '#ffffff';
        });

        window.caActualizarContadorPreviaFiltros();
        window.caFiltrosNavAtras();
    };

    window.caActualizarContadorPreviaFiltros = function() {
        const trips = window._caTripGroups || [];
        const dateFrom = document.getElementById('ca-filter-date-from')?.value;
        const dateTo = document.getElementById('ca-filter-date-to')?.value;
        const searchVal = (document.getElementById('ca-search-input')?.value || '').toLowerCase().trim();
        const fState = window._caFiltrosState;

        let count = 0;
        trips.forEach(t => {
            if (dateFrom || dateTo) {
                const dInicio = (t.fechaInicio && t.fechaInicio !== 'N/D') ? t.fechaInicio.slice(0, 10) : '';
                const dFin = (t.fechaFin && t.fechaFin !== 'N/D') ? t.fechaFin.slice(0, 10) : '';
                const tripMin = dInicio || dFin;
                const tripMax = dFin || dInicio;
                if (!tripMin && !tripMax) return;
                if (dateFrom && dateTo && (tripMax < dateFrom || tripMin > dateTo)) return;
                if (dateFrom && !dateTo && tripMax < dateFrom) return;
                if (!dateFrom && dateTo && tripMin > dateTo) return;
            }

            if (fState.placas.size > 0 && !fState.placas.has(t.placa)) return;
            if (fState.carretas.size > 0 && !fState.carretas.has(t.carreta) && !(t.vouchers || []).some(v => fState.carretas.has(v.carreta))) return;
            if (fState.rutas.size > 0 && !fState.rutas.has(t.ruta)) return;
            if (fState.choferes.size > 0 && !(t.vouchers || []).some(v => fState.choferes.has(v.conductor))) return;

            if (fState.motores.size > 0) {
                const mot = (t.motor && t.motor.trim()) ? t.motor.trim() : 'SIN MOTOR';
                if (!fState.motores.has(mot)) return;
            }

            if (fState.pesos.size > 0) {
                const pLabel = (t.pesoMaxTn !== undefined && t.pesoMaxTn > 0) ? `${Number(t.pesoMaxTn).toFixed(2)} Tn` : '0.00 Tn (Vacío)';
                if (!fState.pesos.has(pLabel)) return;
            }

            if (fState.combustible !== 'ALL') {
                const hasFuel = (t.vouchers || []).some(v => !v.esPuntoPartida && v.producto === fState.combustible);
                if (!hasFuel) return;
            }

            if (searchVal) {
                const matchViaje = (t.viaje || '').toLowerCase().includes(searchVal);
                const matchPlaca = (t.placa || '').toLowerCase().includes(searchVal);
                const matchCarreta = (t.carreta || '').toLowerCase().includes(searchVal) || (t.vouchers || []).some(v => (v.carreta || '').toLowerCase().includes(searchVal));
                const matchRuta = (t.ruta || '').toLowerCase().includes(searchVal);
                const matchChofer = (t.vouchers || []).some(v => (v.conductor || '').toLowerCase().includes(searchVal));
                const matchMotor = (t.motor || '').toLowerCase().includes(searchVal);
                if (!matchViaje && !matchPlaca && !matchCarreta && !matchRuta && !matchChofer && !matchMotor) return;
            }

            count++;
        });

        const btnCount = document.getElementById('ca-btn-aplicar-count');
        if (btnCount) btnCount.innerText = `${count} ${count === 1 ? 'viaje' : 'viajes'}`;
    };

    window.caLimpiarTodosFiltrosDrawer = function() {
        window._caFiltrosState = {
            placas: new Set(),
            carretas: new Set(),
            rutas: new Set(),
            choferes: new Set(),
            motores: new Set(),
            pesos: new Set(),
            combustible: 'ALL',
            anio: 'ALL',
            orden: 'date_desc'
        };
        window.caRenderListaCategoriasFiltro();
        window.caActualizarContadorPreviaFiltros();
        window.caAplicarFiltros(true);
    };

    window.caLimpiarTodosFiltros = function() {
        window._caFiltrosState = {
            placas: new Set(),
            carretas: new Set(),
            rutas: new Set(),
            choferes: new Set(),
            motores: new Set(),
            pesos: new Set(),
            combustible: 'ALL',
            anio: 'ALL',
            orden: 'date_desc'
        };
        const searchInput = document.getElementById('ca-search-input');
        if (searchInput) searchInput.value = '';

        window.caLimpiarFiltrosFechas();
    };

    window.caEliminarChipFiltro = function(tipo, valor) {
        if (tipo === 'placa') window._caFiltrosState.placas.delete(valor);
        else if (tipo === 'carreta') window._caFiltrosState.carretas.delete(valor);
        else if (tipo === 'ruta') window._caFiltrosState.rutas.delete(valor);
        else if (tipo === 'chofer') window._caFiltrosState.choferes.delete(valor);
        else if (tipo === 'motor') window._caFiltrosState.motores.delete(valor);
        else if (tipo === 'peso') window._caFiltrosState.pesos.delete(valor);
        else if (tipo === 'combustible') window._caFiltrosState.combustible = 'ALL';
        else if (tipo === 'anio') window._caFiltrosState.anio = 'ALL';

        window.caAplicarFiltros(true);
    };

    // Renderizar Chips y Badges de Filtros Activos
    window.caRenderChipsFiltros = function() {
        const container = document.getElementById('ca-chips-filtros-container');
        const list = document.getElementById('ca-chips-filtros-list');
        const badgeBtn = document.getElementById('ca-badge-filtros-activos');
        if (!container || !list) return;

        const chips = [];

        window._caFiltrosState.placas.forEach(p => {
            chips.push(`<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2.5 py-1 rounded-pill d-flex align-items-center gap-1 font-monospace fw-semibold"><i class="bi bi-truck"></i> ${p} <i class="bi bi-x-circle-fill ms-1" style="cursor:pointer;" onclick="window.caEliminarChipFiltro('placa', '${p}')"></i></span>`);
        });
        window._caFiltrosState.carretas.forEach(c => {
            chips.push(`<span class="badge bg-secondary bg-opacity-10 text-dark border px-2.5 py-1 rounded-pill d-flex align-items-center gap-1 font-monospace fw-semibold"><i class="bi bi-trailers"></i> ${c} <i class="bi bi-x-circle-fill ms-1 text-muted" style="cursor:pointer;" onclick="window.caEliminarChipFiltro('carreta', '${c}')"></i></span>`);
        });
        window._caFiltrosState.rutas.forEach(r => {
            chips.push(`<span class="badge bg-info bg-opacity-10 text-dark border px-2.5 py-1 rounded-pill d-flex align-items-center gap-1 fw-semibold"><i class="bi bi-signpost-2"></i> ${r} <i class="bi bi-x-circle-fill ms-1 text-muted" style="cursor:pointer;" onclick="window.caEliminarChipFiltro('ruta', '${r}')"></i></span>`);
        });
        window._caFiltrosState.choferes.forEach(ch => {
            chips.push(`<span class="badge bg-warning bg-opacity-10 text-dark border px-2.5 py-1 rounded-pill d-flex align-items-center gap-1 fw-semibold"><i class="bi bi-person"></i> ${ch} <i class="bi bi-x-circle-fill ms-1 text-muted" style="cursor:pointer;" onclick="window.caEliminarChipFiltro('chofer', '${ch}')"></i></span>`);
        });
        window._caFiltrosState.motores.forEach(m => {
            chips.push(`<span class="badge bg-warning bg-opacity-10 text-dark border px-2.5 py-1 rounded-pill d-flex align-items-center gap-1 font-monospace fw-semibold"><i class="bi bi-cpu"></i> ${m} <i class="bi bi-x-circle-fill ms-1 text-muted" style="cursor:pointer;" onclick="window.caEliminarChipFiltro('motor', '${m}')"></i></span>`);
        });
        window._caFiltrosState.pesos.forEach(pe => {
            chips.push(`<span class="badge bg-secondary bg-opacity-10 text-dark border px-2.5 py-1 rounded-pill d-flex align-items-center gap-1 font-monospace fw-semibold"><i class="bi bi-speedometer2"></i> ${pe} <i class="bi bi-x-circle-fill ms-1 text-muted" style="cursor:pointer;" onclick="window.caEliminarChipFiltro('peso', '${pe}')"></i></span>`);
        });
        if (window._caFiltrosState.combustible !== 'ALL') {
            chips.push(`<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2.5 py-1 rounded-pill d-flex align-items-center gap-1 fw-semibold"><i class="bi bi-fuel-pump"></i> ${window._caFiltrosState.combustible} <i class="bi bi-x-circle-fill ms-1" style="cursor:pointer;" onclick="window.caEliminarChipFiltro('combustible', '')"></i></span>`);
        }
        if (window._caFiltrosState.anio !== 'ALL') {
            chips.push(`<span class="badge bg-dark text-white px-2.5 py-1 rounded-pill d-flex align-items-center gap-1 fw-semibold"><i class="bi bi-calendar3"></i> Año ${window._caFiltrosState.anio} <i class="bi bi-x-circle-fill ms-1" style="cursor:pointer;" onclick="window.caEliminarChipFiltro('anio', '')"></i></span>`);
        }

        const totalActivos = chips.length;
        if (badgeBtn) {
            badgeBtn.innerText = totalActivos;
            badgeBtn.style.display = totalActivos > 0 ? 'inline-block' : 'none';
        }

        if (totalActivos > 0) {
            container.style.removeProperty('display');
            container.style.display = 'flex';
            list.innerHTML = chips.join('');
        } else {
            container.style.display = 'none';
            list.innerHTML = '';
        }
    };

    // ── APLICAR FILTROS Y ORDENAMIENTO PRINCIPAL ───────────────────────
    window.caAplicarFiltros = function(resetPage = false) {
        if (resetPage) window._caPaginaActual = 1;

        const dateFrom = document.getElementById('ca-filter-date-from')?.value;
        const dateTo = document.getElementById('ca-filter-date-to')?.value;
        const searchVal = (document.getElementById('ca-search-input')?.value || '').toLowerCase().trim();
        const fState = window._caFiltrosState;

        window._caFilteredTrips = (window._caTripGroups || []).filter(t => {
            // Filtro Rango de Fechas (Solapamiento con período del viaje)
            if (dateFrom || dateTo) {
                const dInicio = (t.fechaInicio && t.fechaInicio !== 'N/D') ? t.fechaInicio.slice(0, 10) : '';
                const dFin = (t.fechaFin && t.fechaFin !== 'N/D') ? t.fechaFin.slice(0, 10) : '';
                const tripMin = dInicio || dFin;
                const tripMax = dFin || dInicio;

                if (!tripMin && !tripMax) return false;

                if (dateFrom && dateTo) {
                    if (tripMax < dateFrom || tripMin > dateTo) return false;
                } else if (dateFrom) {
                    if (tripMax < dateFrom) return false;
                } else if (dateTo) {
                    if (tripMin > dateTo) return false;
                }
            }

            // Multi-Filtro por Placa
            if (fState.placas.size > 0 && !fState.placas.has(t.placa)) return false;

            // Multi-Filtro por Carreta
            if (fState.carretas.size > 0) {
                const matchCarreta = fState.carretas.has(t.carreta) || (t.vouchers || []).some(v => fState.carretas.has(v.carreta));
                if (!matchCarreta) return false;
            }

            // Multi-Filtro por Ruta
            if (fState.rutas.size > 0 && !fState.rutas.has(t.ruta)) return false;

            // Multi-Filtro por Conductor
            if (fState.choferes.size > 0) {
                const matchChofer = (t.vouchers || []).some(v => fState.choferes.has(v.conductor));
                if (!matchChofer) return false;
            }

            // Multi-Filtro por Modelo de Motor
            if (fState.motores.size > 0) {
                const mot = (t.motor && t.motor.trim()) ? t.motor.trim() : 'SIN MOTOR';
                if (!fState.motores.has(mot)) return false;
            }

            // Multi-Filtro por Peso (Tn)
            if (fState.pesos.size > 0) {
                const pLabel = (t.pesoMaxTn !== undefined && t.pesoMaxTn > 0) ? `${Number(t.pesoMaxTn).toFixed(2)} Tn` : '0.00 Tn (Vacío)';
                if (!fState.pesos.has(pLabel)) return false;
            }
            
            // Filtro por Combustible
            if (fState.combustible !== 'ALL') {
                const matchingVouchers = (t.vouchers || []).filter(v => !v.esPuntoPartida && v.producto === fState.combustible);
                if (matchingVouchers.length === 0) return false;
            }

            // Filtro por Búsqueda rápida
            if (searchVal) {
                const matchViaje = (t.viaje || '').toLowerCase().includes(searchVal);
                const matchPlaca = (t.placa || '').toLowerCase().includes(searchVal);
                const matchCarreta = (t.carreta || '').toLowerCase().includes(searchVal) || (t.vouchers || []).some(v => (v.carreta || '').toLowerCase().includes(searchVal));
                const matchRuta = (t.ruta || '').toLowerCase().includes(searchVal);
                const matchChofer = (t.vouchers || []).some(v => (v.conductor || '').toLowerCase().includes(searchVal));
                if (!matchViaje && !matchPlaca && !matchCarreta && !matchRuta && !matchChofer) return false;
            }

            return true;
        });

        // Ordenamiento
        const sortBy = fState.orden || 'date_desc';
        window._caFilteredTrips.sort((a, b) => {
            switch (sortBy) {
                case 'trip_asc': {
                    if (a.viaje === 'SIN-VIAJE') return 1;
                    if (b.viaje === 'SIN-VIAJE') return -1;
                    return (a.viaje || '').localeCompare(b.viaje || '', undefined, { numeric: true });
                }
                case 'trip_desc': {
                    if (a.viaje === 'SIN-VIAJE') return 1;
                    if (b.viaje === 'SIN-VIAJE') return -1;
                    return (b.viaje || '').localeCompare(a.viaje || '', undefined, { numeric: true });
                }
                case 'date_asc': return (a.fechaInicio || '').localeCompare(b.fechaInicio || '');
                case 'date_desc': return (b.fechaFin || '').localeCompare(a.fechaFin || '');
                case 'gal_desc': return b.totalGalones - a.totalGalones;
                case 'cost_desc': return b.totalGasto - a.totalGasto;
                default: {
                    if (a.viaje === 'SIN-VIAJE') return 1;
                    if (b.viaje === 'SIN-VIAJE') return -1;
                    return (b.viaje || '').localeCompare(a.viaje || '', undefined, { numeric: true });
                }
            }
        });

        window.caRenderChipsFiltros();
        window.caRenderKPIs();
        window.caRenderTabla();
    };

    // Calcular y Renderizar Métricas Bento (KPIs)
    window.caRenderKPIs = function() {
        const fuelFilter = document.getElementById('ca-filter-fuel')?.value || 'ALL';
        const trips = window._caFilteredTrips;
        const totalViajes = trips.length;

        let totalGalones = 0;
        let totalGasto = 0;
        let totalKm = 0;
        let totalValesCount = 0;

        trips.forEach(t => {
            const fs = (fuelFilter !== 'ALL' && t.fuelStats && t.fuelStats[fuelFilter]) ? t.fuelStats[fuelFilter] : null;
            const totGal = fs ? fs.totalGalones : t.totalGalones;
            const totGas = fs ? fs.totalGasto : t.totalGasto;
            const recKm = fs ? fs.recorridoKm : t.recorridoKm;
            const vales = fs ? fs.vouchers.filter(v => !v.esPuntoPartida).length : (t.vouchersPropiosCount || t.vouchers.length);

            totalGalones += totGal;
            totalGasto += totGas;
            totalKm += recKm;
            totalValesCount += vales;
        });

        const promGalViaje = totalViajes > 0 ? (totalGalones / totalViajes) : 0;
        const promPrecioGal = totalGalones > 0 ? (totalGasto / totalGalones) : 0;
        const promKmGal = (totalGalones > 0 && totalKm > 0) ? (totalKm / totalGalones) : 0;

        const elV = document.getElementById('ca-kpi-total-viajes');
        const elG = document.getElementById('ca-kpi-total-galones');
        const elI = document.getElementById('ca-kpi-total-gasto');
        const elK = document.getElementById('ca-kpi-total-km');

        if (elV) elV.textContent = totalViajes.toLocaleString();
        if (elG) elG.textContent = totalGalones.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (elI) elI.textContent = 'S/ ' + totalGasto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (elK) elK.textContent = totalKm.toLocaleString('es-PE', { minimumFractionDigits: 1 }) + ' Km';

        const subV = document.getElementById('ca-kpi-viajes-sub');
        const subG = document.getElementById('ca-kpi-galones-sub');
        const subI = document.getElementById('ca-kpi-gasto-sub');
        const subK = document.getElementById('ca-kpi-km-sub');

        if (subV) subV.textContent = `${totalValesCount} vales individuales${fuelFilter !== 'ALL' ? ' (' + fuelFilter + ')' : ''}`;
        if (subG) subG.textContent = `${promGalViaje.toFixed(1)} Gal/viaje prom.`;
        if (subI) subI.textContent = `S/ ${promPrecioGal.toFixed(2)} / Galón prom.`;
        if (subK) subK.textContent = `${promKmGal.toFixed(2)} Km/Gal promedio`;
    };

    // Helper: Buscar consumo teórico en Galones según Sentido (IDA / RETORNO), Ruta, Peso (Regla de Techo) y Motor (BÚSQUEDA ESTRICTA)
    function obtenerConsumoTeoricoGalones(rutaStr, sentidoStr, pesoTn, motorStr) {
        if (!window._caMatrizRendimiento || window._caMatrizRendimiento.length === 0) return 0;
        const rNorm = (rutaStr || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const sNorm = (sentidoStr || 'IDA').toUpperCase().trim();
        const mNorm = (motorStr || '').toUpperCase().trim();
        
        // 1. Búsqueda con Motor: Sentido + Ruta + Motor coincidentes
        let match = window._caMatrizRendimiento.find(m => {
            const mSentido = (m.sentido || 'IDA').toUpperCase().trim();
            if (mSentido !== sNorm) return false;
            const mRuta = (m.ruta || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const mMotor = (m.motor || '').toUpperCase().trim();
            const rutaCoincide = mRuta && (rNorm.includes(mRuta) || mRuta.includes(rNorm));
            
            // Si la unidad tiene motor especificado y la matriz tiene motor -> DEBEN coincidir
            if (mNorm && mMotor) {
                return rutaCoincide && (mNorm.includes(mMotor) || mMotor.includes(mNorm));
            }
            // Si ninguno especifica motor -> coincide
            if (!mNorm && !mMotor) {
                return rutaCoincide;
            }
            // Si uno tiene motor y el otro no -> NO coincide (evita cruces incorrectos)
            return false;
        });

        // Si no existe la combinación de esa ruta para ese motor específico, retornar 0 (debe quedar en blanco)
        if (!match) return 0;

        // Regla de Techo: Si el peso está entre dos rangos, toma la columna superior
        const p = parseFloat(pesoTn || 0);
        let consumo = 0;
        if (p <= 0) consumo = parseFloat(match.km_0 || match.retorno_vacio || 0);
        else if (p <= 5) consumo = parseFloat(match.km_5 || 0);
        else if (p <= 10) consumo = parseFloat(match.km_10 || 0);
        else if (p <= 15) consumo = parseFloat(match.km_15 || 0);
        else if (p <= 20) consumo = parseFloat(match.km_20 || 0);
        else if (p <= 25) consumo = parseFloat(match.km_25 || 0);
        else consumo = parseFloat(match.km_30 || 0);

        return consumo > 0 ? consumo : 0;
    }

    // Helper: Buscar Km Teórico según Sentido (IDA / RETORNO), Ruta y Motor
    function obtenerKmTeorico(rutaStr, sentidoStr, motorStr) {
        if (!window._caMatrizRendimiento || window._caMatrizRendimiento.length === 0) return 0;
        const rNorm = (rutaStr || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const sNorm = (sentidoStr || 'IDA').toUpperCase().trim();
        const mNorm = (motorStr || '').toUpperCase().trim();
        
        let match = window._caMatrizRendimiento.find(m => {
            const mSentido = (m.sentido || 'IDA').toUpperCase().trim();
            if (mSentido !== sNorm) return false;
            const mRuta = (m.ruta || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const mMotor = (m.motor || '').toUpperCase().trim();
            const rutaCoincide = mRuta && (rNorm.includes(mRuta) || mRuta.includes(rNorm));
            
            if (mNorm && mMotor) {
                return rutaCoincide && (mNorm.includes(mMotor) || mMotor.includes(mNorm));
            }
            if (!mNorm && !mMotor) {
                return rutaCoincide;
            }
            return false;
        });

        if (!match) return 0;
        const distKm = parseFloat(match.km || 0);
        return distKm > 0 ? distKm : 0;
    }

    // Helper: Rendimiento teórico Km/Galón
    function obtenerRendimientoTeorico(rutaStr, pesoTn, motorStr) {
        if (!window._caMatrizRendimiento || window._caMatrizRendimiento.length === 0) return null;
        const consumoGal = obtenerConsumoTeoricoGalones(rutaStr, 'IDA', pesoTn, motorStr);
        const match = window._caMatrizRendimiento.find(m => (rutaStr || '').toUpperCase().includes((m.ruta || '').toUpperCase()));
        const distKm = match ? parseFloat(match.km || 0) : 0;
        if (distKm > 0 && consumoGal > 0) return distKm / consumoGal;
        return null;
    }

    // Renderizar Tabla Consolidada con Paginación de 50 registros
    window.caRenderTabla = function() {
        const tbody = document.getElementById('ca-trip-tbody');
        const counter = document.getElementById('ca-filtered-results-counter');
        const total = window._caFilteredTrips.length;

        if (counter) counter.textContent = `Mostrando ${total.toLocaleString()} viajes`;
        if (!tbody) return;

        if (total === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="16" class="text-center py-5 text-muted">
                        <i class="bi bi-inbox fs-2 d-block mb-2"></i>
                        No se encontraron viajes con los filtros seleccionados.
                    </td>
                </tr>
            `;
            window.caRenderPaginacion(0, 1, 50);
            return;
        }

        const limit = window._caLimitePorPagina;
        const totalPages = limit === 'ALL' ? 1 : Math.ceil(total / limit) || 1;
        if (window._caPaginaActual > totalPages) window._caPaginaActual = totalPages;
        if (window._caPaginaActual < 1) window._caPaginaActual = 1;
        const page = window._caPaginaActual;

        const startIdx = limit === 'ALL' ? 0 : (page - 1) * limit;
        const endIdx = limit === 'ALL' ? total : Math.min(startIdx + limit, total);
        const pagedTrips = window._caFilteredTrips.slice(startIdx, endIdx);

        const esc = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const fuelFilter = document.getElementById('ca-filter-fuel')?.value || 'ALL';

        let html = '';
        pagedTrips.forEach((t, i) => {
            const globalIdx = startIdx + i;
            
            // Si hay filtro de combustible activo, usar estadísticas específicas de ese combustible
            const fs = (fuelFilter !== 'ALL' && t.fuelStats && t.fuelStats[fuelFilter]) ? t.fuelStats[fuelFilter] : null;

            const fInicio = fs ? fs.fechaInicio : t.fechaInicio;
            const fFin = fs ? fs.fechaFin : t.fechaFin;
            const kInicio = fs ? fs.kmInicio : t.kmInicio;
            const kFin = fs ? fs.kmFin : t.kmFin;
            const recKm = fs ? fs.recorridoKm : t.recorridoKm;
            const totGal = fs ? fs.totalGalones : t.totalGalones;
            const totGasto = fs ? fs.totalGasto : t.totalGasto;
            const rend = fs ? fs.rendimiento : t.rendimiento;

            // ── Vales y métricas específicas por tramo (IDA vs RETORNO) ──
            const vouchersList = fs ? fs.vouchers : (t.vouchers || []);
            // Solo los vales marcados explícitamente como RETORNO o VUELTA van a retorno; el resto (o vales de servicio/recarga) van a IDA
            const vRet = vouchersList.filter(v => !v.esPuntoPartida && ((v.tipo || '').toUpperCase().includes('VUELTA') || (v.tipo || '').toUpperCase().includes('RETORNO')));
            const vIda = vouchersList.filter(v => !v.esPuntoPartida && !((v.tipo || '').toUpperCase().includes('VUELTA') || (v.tipo || '').toUpperCase().includes('RETORNO')));

            const galRealIda = vIda.reduce((s, x) => s + (x.galones || 0), 0);
            const galRealRet = vRet.reduce((s, x) => s + (x.galones || 0), 0);
            const gastoRealIda = vIda.reduce((s, x) => s + (x.importe || 0), 0);
            const gastoRealRet = vRet.reduce((s, x) => s + (x.importe || 0), 0);

            const rawPesoIda = Math.max(0, ...vIda.map(x => parseFloat(x.peso || 0)));
            let pesoIdaVal = rawPesoIda > 0 ? (rawPesoIda > 50 ? +(rawPesoIda / 1000).toFixed(2) : +rawPesoIda.toFixed(2)) : (t.pesoIda || 0);

            // Regla Operativa ERP: La IDA siempre lleva la carga del viaje y el RETORNO siempre va vacío (0.00 Tn)
            if (pesoIdaVal === 0 && (t.pesoMaxTn || 0) > 0) {
                pesoIdaVal = (t.pesoMaxTn || 0);
            }
            let pesoRetVal = 0; // El tramo de Retorno es siempre Vacío (0.00 Tn)

            // Odómetros por tramo
            const minOdoIda = kInicio > 0 ? kInicio : (vIda.length > 0 ? Math.min(...vIda.map(x => x.odometro || 0).filter(Boolean)) : 0);
            const maxOdoIda = vIda.length > 0 ? Math.max(...vIda.map(x => x.odometro || 0).filter(Boolean)) : (vRet.length > 0 ? Math.min(...vRet.map(x => x.odometro || 0).filter(Boolean)) : kFin);
            const recKmIda = (maxOdoIda > minOdoIda && minOdoIda > 0) ? (maxOdoIda - minOdoIda) : 0;
            const rendIda = (galRealIda > 0 && recKmIda > 0) ? (recKmIda / galRealIda) : 0;

            const minOdoRet = vRet.length > 0 ? (maxOdoIda || Math.min(...vRet.map(x => x.odometro || 0).filter(Boolean))) : 0;
            const maxOdoRet = vRet.length > 0 ? Math.max(...vRet.map(x => x.odometro || 0).filter(Boolean), kFin) : 0;
            const recKmRet = (maxOdoRet > minOdoRet && minOdoRet > 0) ? (maxOdoRet - minOdoRet) : 0;
            const rendRet = (galRealRet > 0 && recKmRet > 0) ? (recKmRet / galRealRet) : 0;

            // ── Cálculo Teórico Matriz Estricto (Ida + Retorno con Motor y Regla de Techo) ──
            const galTeoricoIda = obtenerConsumoTeoricoGalones(t.ruta, 'IDA', pesoIdaVal, t.motor);
            const galTeoricoRetorno = obtenerConsumoTeoricoGalones(t.ruta, 'RETORNO', pesoRetVal, t.motor);
            const galTeoricoBase = (galTeoricoIda > 0 || galTeoricoRetorno > 0) ? (galTeoricoIda + galTeoricoRetorno) : 0;

            // Regla Operativa: Si la unidad rueda sin carreta (solo tracto), se le descuenta el 10% del teórico consolidado (Ida + Retorno)
            const esSinCarreta = !t.carreta || t.carreta === '—' || t.carreta === '-' || (typeof t.carreta === 'string' && (t.carreta.trim() === '' || t.carreta.toUpperCase().includes('SIN CARRETA') || t.carreta.toUpperCase().includes('SOLO TRACTO')));
            const galTeoricoTotal = (esSinCarreta && galTeoricoBase > 0) ? (galTeoricoBase * 0.90) : galTeoricoBase;
            const galDescontado = (esSinCarreta && galTeoricoBase > 0) ? (galTeoricoBase * 0.10) : 0;

            const kmTeoricoIda = obtenerKmTeorico(t.ruta, 'IDA', t.motor);
            const kmTeoricoRetorno = obtenerKmTeorico(t.ruta, 'RETORNO', t.motor);
            const kmTeoricoTotal = (kmTeoricoIda > 0 || kmTeoricoRetorno > 0) ? (kmTeoricoIda + kmTeoricoRetorno) : 0;

            const rendTeoricoIda = (galTeoricoIda > 0 && kmTeoricoIda > 0) ? (kmTeoricoIda / galTeoricoIda) : 0;
            const rendTeoricoRet = (galTeoricoRetorno > 0 && kmTeoricoRetorno > 0) ? (kmTeoricoRetorno / galTeoricoRetorno) : 0;
            const rendTeoricoTotal = (galTeoricoTotal > 0 && kmTeoricoTotal > 0) ? (kmTeoricoTotal / galTeoricoTotal) : 0;

            let galTeoricoHtml = '<span class="text-muted opacity-50">—</span>';
            let difBadgeHtml = '<span class="text-muted opacity-50">—</span>';

            if (galTeoricoTotal > 0 && totGal > 0) {
                const descBadge = esSinCarreta ? `<span class="badge bg-warning bg-opacity-25 text-dark border border-warning px-1 py-0 ms-1 fw-bold font-monospace" style="font-size:0.65rem;" title="Descuento -10% por rodar sin carreta (solo camión): -${galDescontado.toFixed(2)} gal">-10%</span>` : '';
                galTeoricoHtml = `<span class="fw-bold font-monospace text-dark" title="Ida: ${galTeoricoIda.toFixed(1)}g | Retorno: ${galTeoricoRetorno.toFixed(1)}g | Base: ${galTeoricoBase.toFixed(2)}g${esSinCarreta ? ` | -10% Solo Camión (-${galDescontado.toFixed(2)}g) => Final: ${galTeoricoTotal.toFixed(2)}g` : ''} | Motor: ${t.motor || 'Estándar'}">${galTeoricoTotal.toFixed(2)}</span>${descBadge}`;
                const dif = totGal - galTeoricoTotal;
                if (dif > 0) {
                    difBadgeHtml = `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger fw-bold font-monospace px-1.5 py-0.5" title="Sobreconsumo sobre la matriz: +${dif.toFixed(2)} gal">+${dif.toFixed(2)} ⚠️</span>`;
                } else {
                    difBadgeHtml = `<span class="badge bg-success bg-opacity-10 text-success border border-success fw-bold font-monospace px-1.5 py-0.5" title="Ahorro de combustible frente a la matriz: ${dif.toFixed(2)} gal">${dif.toFixed(2)} ✅</span>`;
                }
            }

            const tieneAlertaOdo = (kInicio > 0 && kFin > 0 && kFin < kInicio);
            const semaforoRecorrido = tieneAlertaOdo 
                ? `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger px-2 py-0.5" title="Odómetro final menor al inicial"><i class="bi bi-exclamation-triangle-fill me-1"></i>Revisar Odo</span>` 
                : (recKm > 0 ? recKm.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—');

            const valesCount = fs ? fs.vouchers.filter(v => !v.esPuntoPartida).length : (t.vouchersPropiosCount || t.vouchers.length);

            // Telemetría GPS Wialon CAN Bus
            const gpsData = t.gpsTelemetria;
            const gpsRecKm = (gpsData && gpsData.recorridoKmGps !== null && gpsData.recorridoKmGps !== undefined)
                ? `${Number(gpsData.recorridoKmGps).toLocaleString('es-PE', { minimumFractionDigits: 1 })} km`
                : '<span class="text-muted opacity-50">—</span>';
            const gpsComb = (gpsData && gpsData.combustibleConsumidoGps !== null && gpsData.combustibleConsumidoGps !== undefined)
                ? `${Number(gpsData.combustibleConsumidoGps).toLocaleString('es-PE', { minimumFractionDigits: 2 })} gal`
                : '<span class="text-muted opacity-50">—</span>';
            const gpsRend = (gpsData && gpsData.rendimientoGps !== null && gpsData.rendimientoGps !== undefined)
                ? `${Number(gpsData.rendimientoGps).toFixed(2)} km/g`
                : '<span class="text-muted opacity-50">—</span>';
            const gpsVelMax = (gpsData && gpsData.velocidadMaxGps !== null && gpsData.velocidadMaxGps !== undefined)
                ? `${Number(gpsData.velocidadMaxGps).toLocaleString('es-PE', { minimumFractionDigits: 0 })} km/h`
                : '<span class="text-muted opacity-50">—</span>';
            const gpsRalenti = (gpsData && gpsData.consumoRalentiGps !== null && gpsData.consumoRalentiGps !== undefined)
                ? `${Number(gpsData.consumoRalentiGps).toLocaleString('es-PE', { minimumFractionDigits: 2 })} gal/h`
                : '<span class="text-muted opacity-50">—</span>';
            const gpsHorasMotor = (gpsData && gpsData.horasMotorGps)
                ? `${gpsData.horasMotorGps}`
                : '<span class="text-muted opacity-50">—</span>';

            // Badges Teóricos Tramo Ida
            const difIda = (galTeoricoIda > 0 && galRealIda > 0) ? (galRealIda - galTeoricoIda) : null;
            const difIdaHtml = difIda !== null 
                ? (difIda > 0 ? `<span class="text-danger fw-bold">+${difIda.toFixed(2)}</span>` : `<span class="text-success fw-bold">${difIda.toFixed(2)}</span>`)
                : '—';

            // Badges Teóricos Tramo Retorno
            const difRet = (galTeoricoRetorno > 0 && galRealRet > 0) ? (galRealRet - galTeoricoRetorno) : null;
            const difRetHtml = difRet !== null 
                ? (difRet > 0 ? `<span class="text-danger fw-bold">+${difRet.toFixed(2)}</span>` : `<span class="text-success fw-bold">${difRet.toFixed(2)}</span>`)
                : '—';

            html += `
                <!-- Fila Principal Consolidada -->
                <tr class="ca-row-main" id="ca-row-${globalIdx}" onclick="window.caToggleDetalleTramo(${globalIdx})">
                    <td class="font-monospace fw-bold text-dark" style="color: #0f172a !important; font-size: 0.84rem;">
                        <i class="bi bi-chevron-right ca-expand-icon text-muted me-1" id="ca-ico-exp-${globalIdx}"></i>#${esc(t.numViaje || t.viaje)}
                    </td>
                    <td class="font-monospace fw-bold text-dark" style="color: #0f172a !important; font-size: 0.84rem;">
                        ${esc(t.placa)}
                    </td>
                    <td class="font-monospace fw-bold text-secondary" style="font-size: 0.82rem;">
                        ${t.carreta ? `<span class="badge bg-light text-dark border px-2 py-0.5 fw-semibold" style="font-size:0.75rem;">${esc(t.carreta)}</span>` : '<span class="text-muted opacity-50">—</span>'}
                    </td>
                    <td class="small font-monospace">
                        ${t.motor ? `<span class="badge bg-light text-dark border px-2 py-0.5 fw-semibold" style="font-size:0.75rem;">${esc(t.motor)}</span>` : '<span class="text-muted opacity-50">—</span>'}
                    </td>
                    <td class="text-truncate" style="max-width: 180px;" title="${esc(t.ruta)}">
                        <i class="bi bi-geo-alt-fill text-danger me-1 small"></i>
                        <span class="fw-semibold text-dark">${esc(t.ruta)}</span>
                    </td>
                    <td class="text-end font-monospace fw-bold text-dark">
                        ${(t.pesoMaxTn !== undefined && t.pesoMaxTn > 0) ? `${t.pesoMaxTn.toLocaleString('es-PE', { minimumFractionDigits: 2 })} <span class="small text-muted font-sans" style="font-size:0.72rem;">Tn</span>` : '<span class="text-muted opacity-50">—</span>'}
                    </td>
                    <td class="text-muted small">${esc(fInicio)}</td>
                    <td class="text-muted small">${esc(fFin)}</td>
                    
                    <!-- Bloque 1: Vales Físicos (ERP / Real) -->
                    <td class="text-end font-monospace text-success fw-bold">${kInicio > 0 ? kInicio.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace text-danger fw-bold">${kFin > 0 ? kFin.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace fw-bold text-dark">${semaforoRecorrido}</td>
                    <td class="text-end font-monospace fw-bold text-primary">${totGal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace fw-bold ${rend > 0 ? 'text-indigo-600' : 'text-muted'}">
                        ${rend > 0 ? `${rend.toFixed(2)} <span class="small text-muted font-sans" style="font-size:0.72rem;">km/g</span>` : '—'}
                    </td>
                    <td class="text-end font-monospace fw-bold text-success">S/ ${totGasto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>

                    <!-- Bloque 2: Matriz Teórica Estándar (Celdas Naranjas) -->
                    <td class="text-end font-monospace fw-bold" style="background:rgba(234, 88, 12, 0.04); color:#ea580c; border-left: 2px solid #fdba74;" title="Ida: ${kmTeoricoIda.toFixed(1)} km | Retorno: ${kmTeoricoRetorno.toFixed(1)} km">
                        ${kmTeoricoTotal > 0 ? `${kmTeoricoTotal.toLocaleString('es-PE', { minimumFractionDigits: 1 })}` : '<span class="text-muted opacity-50">—</span>'}
                    </td>
                    <td class="text-end font-monospace fw-bold" style="background:rgba(234, 88, 12, 0.04); color:#ea580c;" title="Ida: ${galTeoricoIda.toFixed(1)}g | Retorno: ${galTeoricoRetorno.toFixed(1)}g">
                        ${galTeoricoHtml}
                    </td>
                    <td class="text-end font-monospace fw-bold" style="background:rgba(234, 88, 12, 0.07); color:#c2410c;" title="Ida: ${rendTeoricoIda > 0 ? rendTeoricoIda.toFixed(2) : '—'} km/g | Retorno: ${rendTeoricoRet > 0 ? rendTeoricoRet.toFixed(2) : '—'} km/g">
                        ${rendTeoricoTotal > 0 ? `${rendTeoricoTotal.toFixed(2)} <span class="small font-sans" style="font-size:0.72rem; color:#ea580c;">km/g</span>` : '<span class="text-muted opacity-50">—</span>'}
                    </td>
                    <td class="text-end font-monospace" style="background:rgba(234, 88, 12, 0.04); border-right: 2px solid #fdba74;">
                        ${difBadgeHtml}
                    </td>

                    <!-- Bloque 3: Telemetría GPS Wialon CAN Bus (Celdas Celestes) -->
                    <td class="text-end font-monospace fw-bold" style="background:rgba(2, 132, 199, 0.05); color:#0284c7; border-left: 2px solid #bae6fd;">
                        ${gpsRecKm}
                    </td>
                    <td class="text-end font-monospace fw-bold" style="background:rgba(2, 132, 199, 0.05); color:#0284c7;">
                        ${gpsComb}
                    </td>
                    <td class="text-end font-monospace fw-bold" style="background:rgba(2, 132, 199, 0.08); color:#0369a1;">
                        ${gpsRend}
                    </td>
                    <td class="text-end font-monospace fw-bold" style="background:rgba(2, 132, 199, 0.05); color:#0284c7;">
                        ${gpsVelMax}
                    </td>
                    <td class="text-end font-monospace fw-bold" style="background:rgba(2, 132, 199, 0.05); color:#0284c7;">
                        ${gpsRalenti}
                    </td>
                    <td class="text-end font-monospace fw-bold" style="background:rgba(2, 132, 199, 0.08); color:#0369a1; border-right: 2px solid #bae6fd;">
                        ${gpsHorasMotor}
                    </td>

                    <td class="text-center" onclick="event.stopPropagation()">
                        <div class="d-inline-flex align-items-center gap-1">
                            <button class="btn btn-outline-primary btn-sm rounded-pill py-0 px-2 d-inline-flex align-items-center gap-1" onclick="window.caAbrirModalVales(${globalIdx})" style="font-size:0.72rem;" title="Ver vales físicos">
                                <i class="bi bi-receipt"></i> ${valesCount}
                            </button>
                            <button class="btn btn-outline-info btn-sm rounded-pill py-0 px-2 d-inline-flex align-items-center gap-1" id="btn-gps-${globalIdx}" onclick="window.caConsultarGpsViaje(${globalIdx})" style="font-size:0.72rem; color:#0284c7; border-color:#0284c7;" title="Consultar Telemetría CAN Bus Wialon">
                                <i class="bi bi-broadcast"></i> CAN
                            </button>
                        </div>
                    </td>
                </tr>

                <!-- Sub-Fila Desglose: TRAMO IDA -->
                <tr class="ca-tramo-subrow d-none" id="ca-subrow-ida-${globalIdx}">
                    <td class="ps-4 font-monospace text-muted small">
                        <span class="ca-tramo-tag ca-tramo-ida"><i class="bi bi-arrow-right-circle-fill"></i> IDA</span>
                    </td>
                    <td class="text-muted small">${esc(t.placa)}</td>
                    <td class="text-muted small font-monospace">${t.carreta ? `<span class="badge bg-light text-dark border px-2 py-0.5" style="font-size:0.72rem;">${esc(t.carreta)}</span>` : '—'}</td>
                    <td class="text-muted small">${esc(t.motor || '—')}</td>
                    <td class="text-muted small"><span class="fw-semibold text-secondary">Ida: ${esc(t.ruta)}</span></td>
                    <td class="text-end font-monospace fw-bold text-success">
                        ${pesoIdaVal > 0 ? `${pesoIdaVal.toFixed(2)} Tn` : '<span class="text-muted opacity-50">0.00 Tn (Vacío)</span>'}
                    </td>
                    <td class="text-center text-muted opacity-50">—</td>
                    <td class="text-center text-muted opacity-50">—</td>
                    <td class="text-end font-monospace text-muted">${minOdoIda > 0 ? minOdoIda.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace text-muted">${maxOdoIda > 0 ? maxOdoIda.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace text-muted">${recKmIda > 0 ? recKmIda.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace fw-bold text-primary">${galRealIda > 0 ? galRealIda.toFixed(2) : '0.00'}</td>
                    <td class="text-end font-monospace text-muted">${rendIda > 0 ? `${rendIda.toFixed(2)} <span class="small text-muted font-sans" style="font-size:0.72rem;">km/g</span>` : '—'}</td>
                    <td class="text-end font-monospace text-muted">S/ ${gastoRealIda.toFixed(2)}</td>

                    <!-- Teórico Tramo IDA (Celdas Naranjas) -->
                    <td class="text-end font-monospace fw-bold" style="background:rgba(234, 88, 12, 0.04); color:#ea580c; border-left: 2px solid #fdba74;">
                        ${kmTeoricoIda > 0 ? kmTeoricoIda.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}
                    </td>
                    <td class="text-end font-monospace text-secondary" style="background:rgba(234, 88, 12, 0.04);">
                        ${galTeoricoIda > 0 ? galTeoricoIda.toFixed(2) : '—'}
                    </td>
                    <td class="text-end font-monospace fw-bold" style="background:rgba(234, 88, 12, 0.07); color:#c2410c;">
                        ${rendTeoricoIda > 0 ? `${rendTeoricoIda.toFixed(2)} <span class="small font-sans" style="font-size:0.72rem; color:#ea580c;">km/g</span>` : '—'}
                    </td>
                    <td class="text-end font-monospace" style="background:rgba(234, 88, 12, 0.04); border-right: 2px solid #fdba74;">
                        ${difIdaHtml}
                    </td>

                    <td colspan="7" class="text-muted small fst-italic ps-3">
                        <i class="bi bi-info-circle me-1"></i>${vIda.length} vale(s) de recarga en tramo de ida
                    </td>
                </tr>

                <!-- Sub-Fila Desglose: TRAMO RETORNO -->
                <tr class="ca-tramo-subrow d-none" id="ca-subrow-ret-${globalIdx}">
                    <td class="ps-4 font-monospace text-muted small">
                        <span class="ca-tramo-tag ca-tramo-retorno"><i class="bi bi-arrow-left-circle-fill"></i> RETORNO</span>
                    </td>
                    <td class="text-muted small">${esc(t.placa)}</td>
                    <td class="text-muted small font-monospace">${t.carreta ? `<span class="badge bg-light text-dark border px-2 py-0.5" style="font-size:0.72rem;">${esc(t.carreta)}</span>` : '—'}</td>
                    <td class="text-muted small">${esc(t.motor || '—')}</td>
                    <td class="text-muted small"><span class="fw-semibold text-secondary">Retorno: ${esc(t.ruta)}</span></td>
                    <td class="text-end font-monospace fw-bold text-primary">
                        ${pesoRetVal > 0 ? `${pesoRetVal.toFixed(2)} Tn` : '<span class="text-muted opacity-50">0.00 Tn (Vacío)</span>'}
                    </td>
                    <td class="text-center text-muted opacity-50">—</td>
                    <td class="text-center text-muted opacity-50">—</td>
                    <td class="text-end font-monospace text-muted">${minOdoRet > 0 ? minOdoRet.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace text-muted">${maxOdoRet > 0 ? maxOdoRet.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace text-muted">${recKmRet > 0 ? recKmRet.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace fw-bold text-primary">${galRealRet > 0 ? galRealRet.toFixed(2) : '0.00'}</td>
                    <td class="text-end font-monospace text-muted">${rendRet > 0 ? `${rendRet.toFixed(2)} <span class="small text-muted font-sans" style="font-size:0.72rem;">km/g</span>` : '—'}</td>
                    <td class="text-end font-monospace text-muted">S/ ${gastoRealRet.toFixed(2)}</td>

                    <!-- Teórico Tramo RETORNO (Celdas Naranjas) -->
                    <td class="text-end font-monospace fw-bold" style="background:rgba(234, 88, 12, 0.04); color:#ea580c; border-left: 2px solid #fdba74;">
                        ${kmTeoricoRetorno > 0 ? kmTeoricoRetorno.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}
                    </td>
                    <td class="text-end font-monospace text-secondary" style="background:rgba(234, 88, 12, 0.04);">
                        ${galTeoricoRetorno > 0 ? galTeoricoRetorno.toFixed(2) : '—'}
                    </td>
                    <td class="text-end font-monospace fw-bold" style="background:rgba(234, 88, 12, 0.07); color:#c2410c;">
                        ${rendTeoricoRet > 0 ? `${rendTeoricoRet.toFixed(2)} <span class="small font-sans" style="font-size:0.72rem; color:#ea580c;">km/g</span>` : '—'}
                    </td>
                    <td class="text-end font-monospace" style="background:rgba(234, 88, 12, 0.04); border-right: 2px solid #fdba74;">
                        ${difRetHtml}
                    </td>

                    <td colspan="7" class="text-muted small fst-italic ps-3">
                        <i class="bi bi-info-circle me-1"></i>${vRet.length} vale(s) de recarga en tramo de retorno
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // ── Renderizar Fila de TOTAL en el Footer de la Tabla ──
        const tfoot = document.getElementById('ca-trip-tfoot');
        if (tfoot) {
            let totalSumVales = 0;
            let totalSumGps = 0;
            let totalSumTeorico = 0;
            let totalSumKmTeorico = 0;
            let totalSumKmReal = 0;

            window._caFilteredTrips.forEach(t => {
                const fs = (fuelFilter !== 'ALL' && t.fuelStats && t.fuelStats[fuelFilter]) ? t.fuelStats[fuelFilter] : null;
                const totGal = fs ? fs.totalGalones : t.totalGalones;
                totalSumVales += (totGal || 0);
                totalSumKmReal += (fs ? fs.recorridoKm : (t.recorridoKm || 0));

                const gIda = obtenerConsumoTeoricoGalones(t.ruta, 'IDA', t.pesoIda || 0, t.motor);
                const gRet = obtenerConsumoTeoricoGalones(t.ruta, 'RETORNO', t.pesoRetorno || 0, t.motor);
                const gBase = (gIda + gRet);
                const esSinCarreta = !t.carreta || t.carreta === '—' || t.carreta === '-' || (typeof t.carreta === 'string' && (t.carreta.trim() === '' || t.carreta.toUpperCase().includes('SIN CARRETA') || t.carreta.toUpperCase().includes('SOLO TRACTO')));
                const gFinal = (esSinCarreta && gBase > 0) ? (gBase * 0.90) : gBase;
                totalSumTeorico += gFinal;

                const kIda = obtenerKmTeorico(t.ruta, 'IDA', t.motor);
                const kRet = obtenerKmTeorico(t.ruta, 'RETORNO', t.motor);
                totalSumKmTeorico += (kIda + kRet);

                const gps = t.gpsTelemetria || t.wialonGps;
                if (gps && gps.combustibleConsumidoGps !== null && gps.combustibleConsumidoGps !== undefined && !isNaN(gps.combustibleConsumidoGps)) {
                    totalSumGps += parseFloat(gps.combustibleConsumidoGps);
                }
            });

            const totalSumRendTeorico = (totalSumTeorico > 0 && totalSumKmTeorico > 0) ? (totalSumKmTeorico / totalSumTeorico) : 0;
            const totalSumRendReal = (totalSumVales > 0 && totalSumKmReal > 0) ? (totalSumKmReal / totalSumVales) : 0;

            let difTotalHtml = '—';
            if (totalSumTeorico > 0 && totalSumVales > 0) {
                const diffGal = totalSumVales - totalSumTeorico;
                const isExceso = diffGal > 0;
                const color = isExceso ? '#dc2626' : '#16a34a';
                const sign = isExceso ? '+' : '';
                difTotalHtml = `<span class="fw-bold" style="color:${color};">${sign}${diffGal.toFixed(2)} G</span>`;
            }

            tfoot.innerHTML = `
                <tr style="background:#f8fafc; border-top: 2px solid #cbd5e1; font-weight: bold;">
                    <td class="ps-3 py-3 font-monospace fw-bolder text-dark" style="font-size:0.88rem;">TOTAL</td>
                    <td class="text-center text-muted small">—</td>
                    <td class="text-center text-muted small">—</td>
                    <td class="text-center text-muted small">—</td>
                    <td class="text-center text-muted small">—</td>
                    <td class="text-center text-muted small">—</td>
                    <td class="text-center text-muted small">—</td>
                    <td class="text-center text-muted small">—</td>
                    <td class="text-end text-muted small">—</td>
                    <td class="text-end text-muted small">—</td>
                    <td class="text-end font-monospace fw-bold text-dark">${totalSumKmReal > 0 ? totalSumKmReal.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace fw-bolder text-primary fs-6 py-3" style="background: rgba(2, 132, 199, 0.08);">
                        ${totalSumVales.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td class="text-end font-monospace fw-bold text-indigo-600">${totalSumRendReal > 0 ? `${totalSumRendReal.toFixed(2)} km/g` : '—'}</td>
                    <td class="text-end text-muted small">—</td>
                    
                    <!-- Teórico Totales (Celdas Naranjas) -->
                    <td class="text-end font-monospace fw-bold" style="background:rgba(234, 88, 12, 0.08); color:#ea580c; border-left: 2px solid #fdba74;">
                        ${totalSumKmTeorico > 0 ? totalSumKmTeorico.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}
                    </td>
                    <td class="text-end font-monospace fw-bold" style="background:rgba(234, 88, 12, 0.08); color:#ea580c;">
                        ${totalSumTeorico > 0 ? totalSumTeorico.toFixed(2) : '—'}
                    </td>
                    <td class="text-end font-monospace fw-bold" style="background:rgba(234, 88, 12, 0.12); color:#c2410c;">
                        ${totalSumRendTeorico > 0 ? `${totalSumRendTeorico.toFixed(2)} km/g` : '—'}
                    </td>
                    <td class="text-end font-monospace" style="background:rgba(234, 88, 12, 0.08); border-right: 2px solid #fdba74;">
                        ${difTotalHtml}
                    </td>

                    <!-- GPS Totales (Celdas Celestes) -->
                    <td class="text-end text-muted small" style="background:rgba(2, 132, 199, 0.05); border-left: 2px solid #bae6fd;">—</td>
                    <td class="text-end font-monospace fw-bolder fs-6 py-3" style="background: rgba(2, 132, 199, 0.12); color:#0369a1;">
                        ${totalSumGps > 0 ? totalSumGps.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                    </td>
                    <td class="text-end text-muted small" style="background:rgba(2, 132, 199, 0.05);">—</td>
                    <td class="text-end text-muted small" style="background:rgba(2, 132, 199, 0.05);">—</td>
                    <td class="text-end text-muted small" style="background:rgba(2, 132, 199, 0.05);">—</td>
                    <td class="text-end text-muted small" style="background:rgba(2, 132, 199, 0.05); border-right: 2px solid #bae6fd;">—</td>
                    <td class="text-center text-muted small">—</td>
                </tr>
            `;
        }

        window.caRenderPaginacion(total, page, limit);
    };

    // Función interactiva para expandir/colapsar el desglose de tramos (Ida / Retorno)
    window.caToggleDetalleTramo = function(tripIdx) {
        const rowMain = document.getElementById(`ca-row-${tripIdx}`);
        const subIda = document.getElementById(`ca-subrow-ida-${tripIdx}`);
        const subRet = document.getElementById(`ca-subrow-ret-${tripIdx}`);
        const ico = document.getElementById(`ca-ico-exp-${tripIdx}`);

        if (!rowMain) return;

        const isExpanded = rowMain.classList.contains('expanded');

        if (isExpanded) {
            rowMain.classList.remove('expanded');
            if (subIda) subIda.classList.add('d-none');
            if (subRet) subRet.classList.add('d-none');
            if (ico) ico.classList.replace('bi-chevron-down', 'bi-chevron-right');
        } else {
            rowMain.classList.add('expanded');
            if (subIda) subIda.classList.remove('d-none');
            if (subRet) subRet.classList.remove('d-none');
            if (ico) ico.classList.replace('bi-chevron-right', 'bi-chevron-down');
        }
    };

    function _caGetTripDates(trip) {
        const fuelFilter = (document.getElementById('ca-filtro-combustible') || {}).value || 'ALL';
        const fs = (fuelFilter !== 'ALL' && trip.fuelStats && trip.fuelStats[fuelFilter]) ? trip.fuelStats[fuelFilter] : null;
        let fIni = fs ? fs.fechaInicio : trip.fechaInicio;
        let fFin = fs ? fs.fechaFin : trip.fechaFin;

        if ((!fIni || fIni === 'N/D' || fIni === '---') && trip.vouchers && trip.vouchers.length > 0) {
            const sorted = [...trip.vouchers].filter(v => v.fecha).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            if (sorted.length > 0) {
                fIni = sorted[0].fecha;
                fFin = sorted[sorted.length - 1].fecha;
            }
        }
        return { fIni: fIni || trip.fechaInicio, fFin: fFin || trip.fechaFin };
    }

    // 🛰️ Consultar Telemetría e Informe 3.2.1 CAN Bus de Wialon para un Viaje
    window.caConsultarGpsViaje = async function(tripIdx) {
        const trip = window._caFilteredTrips[tripIdx];
        if (!trip) return;

        const { fIni, fFin } = _caGetTripDates(trip);

        const btn = document.getElementById(`btn-gps-${tripIdx}`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        }

        try {
            const params = new URLSearchParams({
                placa: trip.placa,
                fechaInicio: fIni,
                fechaFin: fFin
            });

            const resp = await fetch(`/api/combustible/wialon-telemetria?${params.toString()}`);
            const result = await resp.json();

            if (result.ok && result.data) {
                trip.gpsTelemetria = result.data;
                trip.wialonGps = result.data;
                if (typeof window.mostrarAlerta === 'function') {
                    window.mostrarAlerta(`✓ Telemetría CAN Bus sincronizada para viaje ${trip.viaje || trip.numViaje} (${trip.placa})`, 'success');
                }
                window.caRenderTabla();
            } else {
                const msg = result.error || result.message || 'No se obtuvieron datos de GPS CAN para este viaje';
                if (typeof window.mostrarAlerta === 'function') {
                    window.mostrarAlerta(`⚠️ ${msg}`, 'warning');
                }
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-broadcast"></i> CAN';
                }
            }
        } catch (err) {
            console.error("Error consultando GPS CAN:", err);
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta(`Error al consultar Wialon CAN: ${err.message}`, 'danger');
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-broadcast"></i> CAN';
            }
        }
    };

    // 📡 Consultar Telemetría CAN Bus para todos los viajes visibles en la página actual (Ultra Rápido por Batch)
    window.caConsultarGpsPaginaActual = async function() {
        const total = window._caFilteredTrips.length;
        if (total === 0) {
            if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta('No hay viajes visibles en la tabla.', 'warning');
            return;
        }

        const limit = window._caLimitePorPagina;
        const page = window._caPaginaActual || 1;
        const startIdx = limit === 'ALL' ? 0 : (page - 1) * limit;
        const endIdx = limit === 'ALL' ? total : Math.min(startIdx + limit, total);
        const pagedTrips = window._caFilteredTrips.slice(startIdx, endIdx);

        const btnSync = document.getElementById('ca-btn-sync-can-page');
        const origHtml = btnSync ? btnSync.innerHTML : '';
        if (btnSync) {
            btnSync.disabled = true;
            btnSync.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Consultando CAN (${pagedTrips.length} viajes)...`;
        }

        const t0 = performance.now();

        try {
            const batchPayload = pagedTrips.map((t, idx) => {
                const { fIni, fFin } = _caGetTripDates(t);
                return {
                    index: idx,
                    id: `${t.numViaje || t.viaje || 'idx'}_${t.placa || ''}_${idx}`,
                    placa: t.placa,
                    fechaInicio: fIni,
                    fechaFin: fFin
                };
            });

            const resp = await fetch('/api/combustible/wialon-telemetria-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trips: batchPayload })
            });
            const result = await resp.json();

            let syncedCount = 0;
            if (result.ok && Array.isArray(result.results)) {
                result.results.forEach(resItem => {
                    const idx = (resItem.index !== undefined && resItem.index !== null) ? resItem.index : -1;
                    const trip = (idx >= 0 && idx < pagedTrips.length) ? pagedTrips[idx] : pagedTrips.find(t => t.placa === resItem.placa);
                    if (trip && resItem.data) {
                        trip.gpsTelemetria = resItem.data;
                        trip.wialonGps = resItem.data;
                        if (resItem.data.recorridoKmGps !== null || resItem.data.combustibleConsumidoGps !== null || resItem.data.velocidadMaxGps !== null) {
                            syncedCount++;
                        }
                    }
                });
            }

            const elapsedSec = ((performance.now() - t0) / 1000).toFixed(1);
            window.caRenderTabla();

            if (typeof window.mostrarAlerta === 'function') {
                if (syncedCount > 0) {
                    window.mostrarAlerta(`✓ Sincronizados ${syncedCount} viajes con telemetría CAN Bus en ${elapsedSec}s.`, 'success');
                } else {
                    window.mostrarAlerta(`No se encontraron registros CAN para los viajes consultados (${elapsedSec}s).`, 'warning');
                }
            }
        } catch (err) {
            console.error("Error en consulta batch GPS:", err);
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta(`Error al consultar telemetría Wialon: ${err.message}`, 'danger');
            }
        } finally {
            if (btnSync) {
                btnSync.disabled = false;
                btnSync.innerHTML = origHtml || '<i class="bi bi-broadcast"></i> <span>Consultar CAN (GPS)</span>';
            }
        }
    };

    // Renderizar Paginación
    window.caRenderPaginacion = function(total, page, limit) {
        const infoEl = document.getElementById('ca-pagination-info');
        const btnsEl = document.getElementById('ca-pagination-buttons');
        if (!infoEl || !btnsEl) return;

        if (total === 0) {
            infoEl.textContent = 'Mostrando 0 de 0 viajes';
            btnsEl.innerHTML = '';
            return;
        }

        const totalPages = limit === 'ALL' ? 1 : Math.ceil(total / limit);
        const start = limit === 'ALL' ? 1 : (page - 1) * limit + 1;
        const end = limit === 'ALL' ? total : Math.min(page * limit, total);

        infoEl.innerHTML = `Mostrando <strong>${start}</strong> a <strong>${end}</strong> de <strong>${total.toLocaleString()}</strong> viajes`;

        if (totalPages <= 1) {
            btnsEl.innerHTML = '';
            return;
        }

        let btns = `
            <button class="btn btn-outline-secondary btn-sm rounded-pill py-0 px-2" style="font-size:0.75rem;" ${page === 1 ? 'disabled' : ''} onclick="window.caCambiarPagina(${page - 1})">
                <i class="bi bi-chevron-left"></i>
            </button>
        `;

        // Generar botones de páginas alrededor de la página actual
        let startPage = Math.max(1, page - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

        if (startPage > 1) {
            btns += `<button class="btn btn-outline-secondary btn-sm rounded-pill py-0 px-2" style="font-size:0.75rem;" onclick="window.caCambiarPagina(1)">1</button>`;
            if (startPage > 2) btns += `<span class="px-1 text-muted small">...</span>`;
        }

        for (let p = startPage; p <= endPage; p++) {
            btns += `<button class="btn btn-sm rounded-pill py-0 px-2.5 ${p === page ? 'btn-primary text-white fw-bold' : 'btn-outline-secondary'}" style="font-size:0.75rem;" onclick="window.caCambiarPagina(${p})">${p}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) btns += `<span class="px-1 text-muted small">...</span>`;
            btns += `<button class="btn btn-outline-secondary btn-sm rounded-pill py-0 px-2" style="font-size:0.75rem;" onclick="window.caCambiarPagina(${totalPages})">${totalPages}</button>`;
        }

        btns += `
            <button class="btn btn-outline-secondary btn-sm rounded-pill py-0 px-2" style="font-size:0.75rem;" ${page === totalPages ? 'disabled' : ''} onclick="window.caCambiarPagina(${page + 1})">
                <i class="bi bi-chevron-right"></i>
            </button>
        `;

        btnsEl.innerHTML = btns;
    };

    // Modal de Vales de un Viaje
    window.caAbrirModalVales = function(idx) {
        const trip = window._caFilteredTrips[idx];
        if (!trip) return;

        const fuelFilter = document.getElementById('ca-filter-fuel')?.value || 'ALL';
        const fs = (fuelFilter !== 'ALL' && trip.fuelStats && trip.fuelStats[fuelFilter]) ? trip.fuelStats[fuelFilter] : null;

        const kInicio = fs ? fs.kmInicio : trip.kmInicio;
        const kFin = fs ? fs.kmFin : trip.kmFin;
        const recKm = fs ? fs.recorridoKm : trip.recorridoKm;
        const totGal = fs ? fs.totalGalones : trip.totalGalones;
        const totGasto = fs ? fs.totalGasto : trip.totalGasto;
        const rend = fs ? fs.rendimiento : trip.rendimiento;
        const vouchersList = fs ? fs.vouchers : (trip.vouchers || []);

        const title = document.getElementById('ca-modal-title');
        const sub = document.getElementById('ca-modal-sub-header');
        const tbody = document.getElementById('ca-modal-table-body');

        if (title) title.textContent = `Detalle de Vales ${fuelFilter !== 'ALL' ? '(' + fuelFilter + ')' : ''} — Viaje ${trip.viaje} (${trip.placa})`;

        if (sub) {
            sub.innerHTML = `
                <div><span class="text-muted">Ruta:</span> <strong class="text-dark">${trip.ruta}</strong></div>
                <div><span class="text-muted">Km Inicial (${fuelFilter !== 'ALL' ? fuelFilter : 'Partida'}):</span> <strong class="text-success font-monospace">${kInicio > 0 ? kInicio.toLocaleString('es-PE', { minimumFractionDigits: 1 }) + ' Km' : 'N/D'}</strong></div>
                <div><span class="text-muted">Km Final (${fuelFilter !== 'ALL' ? fuelFilter : 'Cierre'}):</span> <strong class="text-danger font-monospace">${kFin > 0 ? kFin.toLocaleString('es-PE', { minimumFractionDigits: 1 }) + ' Km' : 'N/D'}</strong></div>
                <div><span class="text-muted">Recorrido:</span> <strong class="text-dark font-monospace">${recKm > 0 ? recKm.toLocaleString('es-PE', { minimumFractionDigits: 1 }) + ' Km' : 'N/D'}</strong></div>
                <div><span class="text-muted">Total Galones ${fuelFilter !== 'ALL' ? '(' + fuelFilter + ')' : ''}:</span> <strong class="text-primary">${totGal.toFixed(2)} Gln</strong></div>
                <div><span class="text-muted">Total Gasto ${fuelFilter !== 'ALL' ? '(' + fuelFilter + ')' : ''}:</span> <strong class="text-success">S/ ${totGasto.toFixed(2)}</strong></div>
                <div><span class="text-muted">Rendimiento:</span> <strong class="text-indigo-600 font-monospace">${rend > 0 ? rend.toFixed(2) + ' Km/Gal' : 'N/D'}</strong></div>
            `;
        }

        if (tbody) {
            tbody.innerHTML = vouchersList.map(v => {
                if (v.esPuntoPartida) {
                    return `
                        <tr style="background: #f0fdf4 !important;">
                            <td class="py-2.5 px-3">
                                <span class="fw-bold text-success">${v.fecha || '—'}</span>
                                <br>
                                <span class="badge bg-success bg-opacity-15 text-success border border-success fw-bold mt-1" style="font-size:0.68rem;">
                                    <i class="bi bi-flag-fill me-1"></i> PUNTO DE PARTIDA ${v.producto} (Cierre Viaje ${esc(v.viajeOriginal || '')})
                                </span>
                            </td>
                            <td class="py-2.5 px-3"><span class="badge bg-info bg-opacity-10 text-info border">${v.producto}</span></td>
                            <td class="py-2.5 px-3 fw-semibold">${v.grifo}</td>
                            <td class="py-2.5 px-3 text-end font-monospace"><strong class="text-success">${v.odometro > 0 ? v.odometro.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'} Km</strong></td>
                            <td class="py-2.5 px-3 text-end font-monospace fw-bold text-primary">${v.galones > 0 ? v.galones.toFixed(2) : '0.00'}</td>
                            <td class="py-2.5 px-3 text-end font-monospace">S/ ${(v.galones > 0 ? (v.importe / v.galones) : 0).toFixed(2)}</td>
                            <td class="py-2.5 px-3 text-end font-monospace fw-bold text-success">S/ ${(v.importe || 0).toFixed(2)}</td>
                            <td class="py-2.5 px-3 text-truncate" style="max-width:180px;" title="${v.conductor}">${v.conductor}</td>
                        </tr>
                    `;
                }

                if (v.esPuntoCierre) {
                    return `
                        <tr style="background: #fef2f2 !important;">
                            <td class="py-2.5 px-3">
                                <span class="fw-bold text-danger">${v.fecha || '—'}</span>
                                <br>
                                <span class="badge bg-danger bg-opacity-15 text-danger border border-danger fw-bold mt-1" style="font-size:0.68rem;">
                                    <i class="bi bi-check-circle-fill me-1"></i> CIERRE DE VIAJE (${v.producto})
                                </span>
                            </td>
                            <td class="py-2.5 px-3"><span class="badge bg-info bg-opacity-10 text-info border">${v.producto}</span></td>
                            <td class="py-2.5 px-3 fw-semibold">${v.grifo}</td>
                            <td class="py-2.5 px-3 text-end font-monospace"><strong class="text-danger">${v.odometro > 0 ? v.odometro.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'} Km</strong></td>
                            <td class="py-2.5 px-3 text-end font-monospace fw-bold text-primary">${v.galones.toFixed(2)}</td>
                            <td class="py-2.5 px-3 text-end font-monospace">S/ ${(v.galones > 0 ? (v.importe / v.galones) : 0).toFixed(2)}</td>
                            <td class="py-2.5 px-3 text-end font-monospace fw-bold text-success">S/ ${v.importe.toFixed(2)}</td>
                            <td class="py-2.5 px-3 text-truncate" style="max-width:180px;" title="${v.conductor}">${v.conductor}</td>
                        </tr>
                    `;
                }

                return `
                    <tr>
                        <td class="py-2 px-3">${v.fecha || '—'}</td>
                        <td class="py-2 px-3"><span class="badge bg-info bg-opacity-10 text-info border">${v.producto}</span></td>
                        <td class="py-2 px-3 fw-semibold">${v.grifo}</td>
                        <td class="py-2 px-3 text-end font-monospace">${v.odometro > 0 ? v.odometro.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                        <td class="py-2 px-3 text-end font-monospace fw-bold text-primary">${v.galones.toFixed(2)}</td>
                        <td class="py-2 px-3 text-end font-monospace">S/ ${(v.galones > 0 ? (v.importe / v.galones) : 0).toFixed(2)}</td>
                        <td class="py-2 px-3 text-end font-monospace fw-bold text-success">S/ ${v.importe.toFixed(2)}</td>
                        <td class="py-2 px-3 text-truncate" style="max-width:180px;" title="${v.conductor}">${v.conductor}</td>
                    </tr>
                `;
            }).join('');
        }

        const modalEl = document.getElementById('caVouchersModal');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    // Modal de la Matriz de Rendimiento Teórico
    window.caAbrirModalMatrizRendimiento = function() {
        const tbody = document.getElementById('ca-matriz-tbody');
        if (tbody) {
            if (window._caMatrizRendimiento.length === 0) {
                tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-muted">No se pudo cargar la matriz de rendimiento remoto.</td></tr>`;
            } else {
                tbody.innerHTML = window._caMatrizRendimiento.map(m => `
                    <tr>
                        <td class="fw-bold text-dark">${m.punto_inicio || '—'}</td>
                        <td class="fw-bold text-dark">${m.punto_final || '—'}</td>
                        <td class="text-end font-monospace">${m.ruta_distancia_km ? parseFloat(m.ruta_distancia_km).toLocaleString() : '—'}</td>
                        <td><span class="badge bg-primary font-monospace">${m.configuracion_vehicular || 'T3S3'}</span></td>
                        <td class="text-end font-monospace fw-bold text-success">${m.km_0 || '—'}</td>
                        <td class="text-end font-monospace">${m.km_5 || '—'}</td>
                        <td class="text-end font-monospace">${m.km_10 || '—'}</td>
                        <td class="text-end font-monospace">${m.km_15 || '—'}</td>
                        <td class="text-end font-monospace">${m.km_20 || '—'}</td>
                        <td class="text-end font-monospace">${m.km_25 || '—'}</td>
                        <td class="text-end font-monospace fw-bold text-danger">${m.km_30 || '—'}</td>
                        <td class="text-end font-monospace text-primary">${m.retorno_vacio || '—'}</td>
                    </tr>
                `).join('');
            }
        }

        const modalEl = document.getElementById('caMatrizRendimientoModal');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    // Exportar Resumen Consolidado a Excel (con Telemetría GPS CAN Bus)
    window.caExportarResumenExcel = function() {
        if (typeof XLSX === 'undefined') {
            alert('Librería SheetJS no disponible.');
            return;
        }

        if (!window._caFilteredTrips || window._caFilteredTrips.length === 0) {
            alert('No hay viajes para exportar.');
            return;
        }

        const fuelFilter = document.getElementById('ca-filter-fuel')?.value || 'ALL';

        const exportData = window._caFilteredTrips.map(t => {
            const fs = (fuelFilter !== 'ALL' && t.fuelStats && t.fuelStats[fuelFilter]) ? t.fuelStats[fuelFilter] : null;
            const fInicio = fs ? fs.fechaInicio : t.fechaInicio;
            const fFin = fs ? fs.fechaFin : t.fechaFin;
            const kInicio = fs ? fs.kmInicio : t.kmInicio;
            const kFin = fs ? fs.kmFin : t.kmFin;
            const recKm = fs ? fs.recorridoKm : t.recorridoKm;
            const totGal = fs ? fs.totalGalones : t.totalGalones;
            const totGasto = fs ? fs.totalGasto : t.totalGasto;
            const rend = fs ? fs.rendimiento : t.rendimiento;
            const valesCount = fs ? fs.vouchers.filter(v => !v.esPuntoPartida).length : (t.vouchersPropiosCount || t.vouchers.length);

            const gIda = obtenerConsumoTeoricoGalones(t.ruta, 'IDA', t.pesoIda || 0, t.motor);
            const gRet = obtenerConsumoTeoricoGalones(t.ruta, 'RETORNO', t.pesoRetorno || 0, t.motor);
            const gTeoricoTotal = (gIda > 0 || gRet > 0) ? (gIda + gRet) : 0;
            const difGalones = gTeoricoTotal > 0 ? parseFloat((totGal - gTeoricoTotal).toFixed(2)) : null;

            const kIda = obtenerKmTeorico(t.ruta, 'IDA', t.motor);
            const kRet = obtenerKmTeorico(t.ruta, 'RETORNO', t.motor);
            const kTeoricoTotal = (kIda > 0 || kRet > 0) ? (kIda + kRet) : 0;
            const rendTeoricoTotal = (gTeoricoTotal > 0 && kTeoricoTotal > 0) ? parseFloat((kTeoricoTotal / gTeoricoTotal).toFixed(2)) : '—';

            return {
                "N° VIAJE": t.numViaje || t.viaje || '---',
                "PLACA": t.placa || '---',
                "CARRETA": t.carreta || '---',
                "MOTOR": t.motor || '---',
                "RUTA": t.ruta || '---',
                "PESO (Tn)": (t.pesoMaxTn !== undefined && t.pesoMaxTn > 0) ? parseFloat(t.pesoMaxTn.toFixed(2)) : 0,
                "FECHA INICIO": fInicio || '---',
                "FECHA FIN": fFin || '---',
                "KM INICIO (VALES)": kInicio > 0 ? parseFloat(kInicio.toFixed(1)) : '—',
                "KM FIN (VALES)": kFin > 0 ? parseFloat(kFin.toFixed(1)) : '—',
                "RECORRIDO (VALES)": recKm > 0 ? parseFloat(recKm.toFixed(1)) : '—',
                "TOTAL GALONES (REAL)": totGal > 0 ? parseFloat(totGal.toFixed(2)) : 0,
                "KM / GALÓN (REAL)": rend > 0 ? parseFloat(rend.toFixed(2)) : '—',
                "TOTAL GASTO (S/)": totGasto > 0 ? parseFloat(totGasto.toFixed(2)) : 0,
                "KM TEÓRICO (MATRIZ)": kTeoricoTotal > 0 ? parseFloat(kTeoricoTotal.toFixed(1)) : '—',
                "GALONES TEÓRICOS (MATRIZ)": gTeoricoTotal > 0 ? parseFloat(gTeoricoTotal.toFixed(2)) : 0,
                "KM / GALÓN (TEÓRICO MATRIZ)": rendTeoricoTotal,
                "DIFERENCIA (GALONES)": difGalones !== null ? difGalones : '—',
                "ESTADO CONSUMO": difGalones !== null ? (difGalones > 0 ? 'SOBRECONSUMO' : 'AHORRO') : '—',
                "GALONES IDA": t.galonesIda || 0,
                "GALONES RETORNO": t.galonesRetorno || 0,
                "RECORRIDO (GPS CAN)": (gps && gps.recorridoKmGps !== null && gps.recorridoKmGps !== undefined) ? parseFloat(Number(gps.recorridoKmGps).toFixed(2)) : '—',
                "COMB. CONSUMIDO (GPS CAN)": (gps && gps.combustibleConsumidoGps !== null && gps.combustibleConsumidoGps !== undefined) ? parseFloat(Number(gps.combustibleConsumidoGps).toFixed(2)) : '—',
                "RENDIMIENTO (GPS CAN)": (gps && gps.rendimientoGps !== null && gps.rendimientoGps !== undefined) ? parseFloat(Number(gps.rendimientoGps).toFixed(2)) : '—',
                "VELOCIDAD MÁXIMA (GPS)": (gps && gps.velocidadMaxGps !== null && gps.velocidadMaxGps !== undefined) ? parseFloat(Number(gps.velocidadMaxGps).toFixed(0)) : '—',
                "CONSUMO PROMEDIO EN RALENTÍ (GAL/H)": (gps && gps.consumoRalentiGps !== null && gps.consumoRalentiGps !== undefined) ? parseFloat(Number(gps.consumoRalentiGps).toFixed(2)) : '—',
                "RPM MEDIA (RPM)": (gps && gps.rpmMediaGps !== null && gps.rpmMediaGps !== undefined) ? parseFloat(Number(gps.rpmMediaGps).toFixed(0)) : '—',
                "RPM MEDIA (MÁXIMA RPM)": (gps && gps.rpmMediaMaxGps !== null && gps.rpmMediaMaxGps !== undefined) ? parseFloat(Number(gps.rpmMediaMaxGps).toFixed(0)) : '—',
                "RPM MÁXIMA (RPM)": (gps && gps.rpmMaxGps !== null && gps.rpmMaxGps !== undefined) ? parseFloat(Number(gps.rpmMaxGps).toFixed(0)) : '—',
                "RPM MÁXIMA (MÁXIMA RPM)": (gps && gps.rpmMaxMaxGps !== null && gps.rpmMaxMaxGps !== undefined) ? parseFloat(Number(gps.rpmMaxMaxGps).toFixed(0)) : '—',
                "HORAS DE MOTOR": (gps && gps.horasMotorGps) ? gps.horasMotorGps : '—',
                "CANTIDAD VALES": valesCount
            };
        });

        // Calcular fila de Totales para el Excel
        let sumTotalGalonesVales = 0;
        let sumTotalGalonesGps = 0;

        window._caFilteredTrips.forEach(t => {
            const fs = (fuelFilter !== 'ALL' && t.fuelStats && t.fuelStats[fuelFilter]) ? t.fuelStats[fuelFilter] : null;
            const totGal = fs ? fs.totalGalones : t.totalGalones;
            sumTotalGalonesVales += (totGal || 0);

            const gps = t.gpsTelemetria || t.wialonGps;
            if (gps && gps.combustibleConsumidoGps !== null && gps.combustibleConsumidoGps !== undefined && !isNaN(gps.combustibleConsumidoGps)) {
                sumTotalGalonesGps += parseFloat(gps.combustibleConsumidoGps);
            }
        });

        // Fila de TOTAL al final del reporte
        exportData.push({
            "N° VIAJE": "TOTAL",
            "PLACA": "",
            "CARRETA": "",
            "MOTOR": "",
            "RUTA": "",
            "PESO (Tn)": "",
            "FECHA INICIO": "",
            "FECHA FIN": "",
            "KM INICIO (VALES)": "",
            "KM FIN (VALES)": "",
            "RECORRIDO (VALES)": "",
            "TOTAL GALONES (REAL)": parseFloat(sumTotalGalonesVales.toFixed(2)),
            "KM / GALÓN (REAL)": "",
            "TOTAL GASTO (S/)": "",
            "KM TEÓRICO (MATRIZ)": "",
            "GALONES TEÓRICOS (MATRIZ)": "",
            "KM / GALÓN (TEÓRICO MATRIZ)": "",
            "DIFERENCIA (GALONES)": "",
            "ESTADO CONSUMO": "",
            "GALONES IDA": "",
            "GALONES RETORNO": "",
            "RECORRIDO (GPS CAN)": "",
            "COMB. CONSUMIDO (GPS CAN)": sumTotalGalonesGps > 0 ? parseFloat(sumTotalGalonesGps.toFixed(2)) : "—",
            "RENDIMIENTO (GPS CAN)": "",
            "VELOCIDAD MÁXIMA (GPS)": "",
            "CONSUMO PROMEDIO EN RALENTÍ (GAL/H)": "",
            "RPM MEDIA (RPM)": "",
            "RPM MEDIA (MÁXIMA RPM)": "",
            "RPM MÁXIMA (RPM)": "",
            "RPM MÁXIMA (MÁXIMA RPM)": "",
            "HORAS DE MOTOR": "",
            "CANTIDAD VALES": ""
        });

        const ws = XLSX.utils.json_to_sheet(exportData);

        // Auto-ajuste de ancho de columnas
        const colWidths = [
            { wch: 18 }, // N° VIAJE
            { wch: 12 }, // PLACA
            { wch: 12 }, // CARRETA
            { wch: 25 }, // RUTA
            { wch: 20 }, // FECHA INICIO
            { wch: 20 }, // FECHA FIN
            { wch: 18 }, // KM INICIO (VALES)
            { wch: 18 }, // KM FIN (VALES)
            { wch: 18 }, // RECORRIDO (VALES)
            { wch: 15 }, // TOTAL GALONES
            { wch: 16 }, // TOTAL GASTO (S/)
            { wch: 18 }, // KM / GALÓN (REAL)
            { wch: 22 }, // RECORRIDO (GPS CAN)
            { wch: 26 }, // COMB. CONSUMIDO (GPS CAN)
            { wch: 22 }, // RENDIMIENTO (GPS CAN)
            { wch: 22 }, // VELOCIDAD MÁXIMA (GPS)
            { wch: 32 }, // CONSUMO PROMEDIO EN RALENTÍ (GAL/H)
            { wch: 18 }, // RPM MEDIA (RPM)
            { wch: 25 }, // RPM MEDIA (MÁXIMA RPM)
            { wch: 18 }, // RPM MÁXIMA (RPM)
            { wch: 25 }, // RPM MÁXIMA (MÁXIMA RPM)
            { wch: 18 }, // HORAS DE MOTOR
            { wch: 15 }  // CANTIDAD VALES
        ];
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Consolidado_Viajes");
        XLSX.writeFile(wb, `Analisis_Combustible_CAN_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // Auto-inicializar
    window.inicializarModuloCombustibleAnalisis();
})();
