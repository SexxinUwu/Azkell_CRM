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
            if (allFuels.has(cur)) selFuel.value = cur;
        }

        if (selPlate) {
            const cur = selPlate.value;
            selPlate.innerHTML = '<option value="ALL">Todas las Placas</option>' +
                Array.from(allPlates).sort().map(p => `<option value="${p}">${p}</option>`).join('');
            if (allPlates.has(cur)) selPlate.value = cur;
        }
    };

    // Cambiar filtro por año rápido
    window.caCambiarFiltroAno = function(year) {
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
        const selYear = document.getElementById('ca-filter-year');
        if (selYear) selYear.value = 'ALL';
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
        const selSort = document.getElementById('ca-sort-by');
        if (!selSort) return;
        const cur = selSort.value;

        if (col === 'trip') {
            selSort.value = cur === 'trip_desc' ? 'trip_asc' : 'trip_desc';
        } else if (col === 'date_start') {
            selSort.value = cur === 'date_asc' ? 'date_desc' : 'date_asc';
        } else if (col === 'date_end') {
            selSort.value = cur === 'date_desc' ? 'date_asc' : 'date_desc';
        } else if (col === 'gal') {
            selSort.value = cur === 'gal_desc' ? 'trip_desc' : 'gal_desc';
        } else if (col === 'cost') {
            selSort.value = cur === 'cost_desc' ? 'trip_desc' : 'cost_desc';
        }
        window.caAplicarFiltros(false);
    };

    // Aplicar Filtros y Ordenamiento
    window.caAplicarFiltros = function(resetPage = false) {
        if (resetPage) window._caPaginaActual = 1;

        const dateFrom = document.getElementById('ca-filter-date-from')?.value;
        const dateTo = document.getElementById('ca-filter-date-to')?.value;
        const fuelFilter = document.getElementById('ca-filter-fuel')?.value || 'ALL';
        const plateFilter = document.getElementById('ca-filter-plate')?.value || 'ALL';
        const searchVal = (document.getElementById('ca-search-input')?.value || '').toLowerCase().trim();
        const sortBy = document.getElementById('ca-sort-by')?.value || 'date_desc';

        window._caFilteredTrips = window._caTripGroups.filter(t => {
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

            // Filtro por Placa
            if (plateFilter !== 'ALL' && t.placa !== plateFilter) return false;
            
            // Filtro por Combustible
            if (fuelFilter !== 'ALL') {
                const matchingVouchers = (t.vouchers || []).filter(v => !v.esPuntoPartida && v.producto === fuelFilter);
                if (matchingVouchers.length === 0) return false;
            }

            // Filtro por Búsqueda rápida
            if (searchVal) {
                const matchViaje = (t.viaje || '').toLowerCase().includes(searchVal);
                const matchPlaca = (t.placa || '').toLowerCase().includes(searchVal);
                const matchRuta = (t.ruta || '').toLowerCase().includes(searchVal);
                const matchChofer = (t.vouchers || []).some(v => (v.conductor || '').toLowerCase().includes(searchVal));
                if (!matchViaje && !matchPlaca && !matchRuta && !matchChofer) return false;
            }

            return true;
        });

        // Ordenamiento (N° Viaje Mayor a Menor por defecto)
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

        window.caRenderKPIs();
        window.caRenderTabla();
    };

    // Calcular y Renderizar Métricas Bento (KPIs)
    window.caRenderKPIs = function() {
        const trips = window._caFilteredTrips;
        const totalViajes = trips.length;
        const totalGalones = trips.reduce((s, t) => s + t.totalGalones, 0);
        const totalGasto = trips.reduce((s, t) => s + t.totalGasto, 0);
        const totalKm = trips.reduce((s, t) => s + t.recorridoKm, 0);

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

        if (subV) subV.textContent = `${trips.reduce((s, t) => s + (t.vouchersPropiosCount || t.vouchers.length), 0)} vales individuales`;
        if (subG) subG.textContent = `${promGalViaje.toFixed(1)} Gal/viaje prom.`;
        if (subI) subI.textContent = `S/ ${promPrecioGal.toFixed(2)} / Galón prom.`;
        if (subK) subK.textContent = `${promKmGal.toFixed(2)} Km/Gal promedio`;
    };

    // Helper: Buscar rendimiento teórico esperado para una ruta y tonelaje
    function obtenerRendimientoTeorico(rutaStr, pesoTn) {
        if (!window._caMatrizRendimiento || window._caMatrizRendimiento.length === 0) return null;
        const rNorm = (rutaStr || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        let match = window._caMatrizRendimiento.find(m => {
            const pIni = (m.punto_inicio || '').toUpperCase();
            const pFin = (m.punto_final || '').toUpperCase();
            return (pIni && rNorm.includes(pIni)) && (pFin && rNorm.includes(pFin));
        });

        if (!match && window._caMatrizRendimiento.length > 0) {
            match = window._caMatrizRendimiento[0]; // fallback representativo
        }

        if (!match) return null;

        const p = parseFloat(pesoTn || 0);
        if (p <= 0) return parseFloat(match.km_0 || match.retorno_vacio || 15.0);
        if (p <= 5) return parseFloat(match.km_5 || 14.5);
        if (p <= 10) return parseFloat(match.km_10 || 13.5);
        if (p <= 15) return parseFloat(match.km_15 || 12.5);
        if (p <= 20) return parseFloat(match.km_20 || 11.5);
        if (p <= 25) return parseFloat(match.km_25 || 10.0);
        return parseFloat(match.km_30 || 9.0);
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
                    <td colspan="13" class="text-center py-5 text-muted">
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

            const rTeorico = obtenerRendimientoTeorico(t.ruta, t.pesoMaxTn);
            let semaforoBadge = '—';

            if (rend > 0 && rTeorico > 0) {
                const ratio = rend / rTeorico;
                if (ratio >= 0.95) {
                    semaforoBadge = `<span class="badge bg-success bg-opacity-10 text-success border border-success px-2 py-0.5 rounded-pill fw-bold" title="Óptimo / Eficiente">${rTeorico.toFixed(1)} Km/G</span>`;
                } else if (ratio >= 0.85) {
                    semaforoBadge = `<span class="badge bg-warning bg-opacity-10 text-dark border border-warning px-2 py-0.5 rounded-pill fw-bold" title="Consumo Aceptable">${rTeorico.toFixed(1)} Km/G</span>`;
                } else {
                    semaforoBadge = `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger px-2 py-0.5 rounded-pill fw-bold" title="Sobreconsumo detectado">${rTeorico.toFixed(1)} Km/G ⚠️</span>`;
                }
            } else if (rTeorico > 0) {
                semaforoBadge = `<span class="text-muted font-monospace small">${rTeorico.toFixed(1)} Km/G</span>`;
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

            html += `
                <tr>
                    <td class="font-monospace fw-bold text-dark" style="color: #0f172a !important; font-size: 0.84rem;">
                        #${esc(t.numViaje || t.viaje)}
                    </td>
                    <td class="font-monospace fw-bold text-dark" style="color: #0f172a !important; font-size: 0.84rem;">
                        ${esc(t.placa)}
                    </td>
                    <td class="text-truncate" style="max-width: 180px;" title="${esc(t.ruta)}">
                        <i class="bi bi-geo-alt-fill text-danger me-1 small"></i>
                        <span class="fw-semibold text-dark">${esc(t.ruta)}</span>
                    </td>
                    <td class="text-muted small">${esc(fInicio)}</td>
                    <td class="text-muted small">${esc(fFin)}</td>
                    
                    <!-- Vales Físicos (ERP) -->
                    <td class="text-end font-monospace text-success fw-bold">${kInicio > 0 ? kInicio.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace text-danger fw-bold">${kFin > 0 ? kFin.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace fw-bold text-dark">${semaforoRecorrido}</td>
                    <td class="text-end font-monospace fw-bold text-primary">${totGal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace fw-bold text-success">S/ ${totGasto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace fw-bold ${rend > 0 ? 'text-indigo-600' : 'text-muted'}">
                        ${rend > 0 ? rend.toFixed(2) : '—'}
                    </td>

                    <!-- Telemetría GPS Wialon CAN Bus (Celdas Celestes) -->
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

                    <td class="text-center">
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
            `;
        });

        tbody.innerHTML = html;
        window.caRenderPaginacion(total, page, limit);
    };

    // 🛰️ Consultar Telemetría e Informe 3.2.1 CAN Bus de Wialon para un Viaje
    window.caConsultarGpsViaje = async function(tripIdx) {
        const trip = window._caFilteredTrips[tripIdx];
        if (!trip) return;

        const btn = document.getElementById(`btn-gps-${tripIdx}`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        }

        try {
            const params = new URLSearchParams({
                placa: trip.placa,
                fechaInicio: trip.fechaInicio,
                fechaFin: trip.fechaFin
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

        const exportData = window._caFilteredTrips.map(t => {
            const fs = t.firstSegment;
            const kInicio = fs ? fs.kInicio : t.kmInicio;
            const kFin = fs ? fs.kFin : t.kmFin;
            const recKm = fs ? fs.recorridoKm : t.recorridoKm;
            const totGal = fs ? fs.totalGalones : t.totalGalones;
            const totGasto = fs ? fs.totalGasto : t.totalGasto;
            const rend = fs ? fs.rendimiento : t.rendimiento;
            const valesCount = fs ? fs.vouchers.filter(v => !v.esPuntoPartida).length : (t.vouchersPropiosCount || t.vouchers.length);

            const gps = t.gpsTelemetria || t.wialonGps || null;

            return {
                "N° VIAJE": t.numViaje || t.viaje || '---',
                "PLACA": t.placa || '---',
                "RUTA": t.ruta || '---',
                "FECHA INICIO": t.fechaInicio || '---',
                "FECHA FIN": t.fechaFin || '---',
                "KM INICIO (VALES)": kInicio > 0 ? parseFloat(kInicio.toFixed(1)) : '—',
                "KM FIN (VALES)": kFin > 0 ? parseFloat(kFin.toFixed(1)) : '—',
                "RECORRIDO (VALES)": recKm > 0 ? parseFloat(recKm.toFixed(1)) : '—',
                "TOTAL GALONES": totGal > 0 ? parseFloat(totGal.toFixed(2)) : 0,
                "TOTAL GASTO (S/)": totGasto > 0 ? parseFloat(totGasto.toFixed(2)) : 0,
                "KM / GALÓN (REAL)": rend > 0 ? parseFloat(rend.toFixed(2)) : '—',
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

        const ws = XLSX.utils.json_to_sheet(exportData);

        // Auto-ajuste de ancho de columnas
        const colWidths = [
            { wch: 18 }, // N° VIAJE
            { wch: 12 }, // PLACA
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
