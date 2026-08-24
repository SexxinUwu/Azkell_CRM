// ── LÓGICA DE ANÁLISIS DE COMBUSTIBLE — ERP AZKELL FLEET (OPERACIONES) ───────────
(function() {
    window._caRawData = [];
    window._caTripGroups = [];
    window._caFilteredTrips = [];
    window._caMatrizRendimiento = [];

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
                
                const bannerSource = document.getElementById('ca-loaded-source');
                const bannerCount = document.getElementById('ca-record-count-info');
                if (bannerSource) bannerSource.textContent = 'Base de Datos de Combustible (ERP)';
                if (bannerCount) bannerCount.textContent = `(${data.trips.length} viajes consolidados)`;

                window.caPoblarFiltros();
                window.caAplicarFiltros();
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="13" class="text-center text-muted py-4">No hay vales registrados para analizar.</td></tr>`;
            }
        } catch (e) {
            console.error('Error cargando análisis de combustible:', e);
            if (tbody) tbody.innerHTML = `<tr><td colspan="13" class="text-center text-danger py-4">Error de conexión al cargar análisis.</td></tr>`;
        }
    };

    // Poblar selects de filtros
    window.caPoblarFiltros = function() {
        const selFuel = document.getElementById('ca-filter-fuel');
        const selPlate = document.getElementById('ca-filter-plate');

        const allFuels = new Set();
        const allPlates = new Set();

        window._caTripGroups.forEach(t => {
            if (t.placa && t.placa !== 'SIN-PLACA') allPlates.add(t.placa);
            if (t.vouchers) {
                t.vouchers.forEach(v => {
                    if (v.producto) allFuels.add(v.producto);
                });
            }
        });

        if (selFuel) {
            const cur = selFuel.value;
            selFuel.innerHTML = '<option value="ALL">Todos los Combustibles</option>' +
                Array.from(allFuels).sort().map(f => `<option value="${f}">${f}</option>`).join('');
            if (allFuels.has(cur)) selFuel.value = cur;
        }

        if (selPlate) {
            const cur = selPlate.value;
            selPlate.innerHTML = '<option value="ALL">Todas las Placas (Mostrar Todos)</option>' +
                Array.from(allPlates).sort().map(p => `<option value="${p}">${p}</option>`).join('');
            if (allPlates.has(cur)) selPlate.value = cur;
        }
    };

    // Aplicar Filtros y Ordenamiento
    window.caAplicarFiltros = function() {
        const fuelFilter = document.getElementById('ca-filter-fuel')?.value || 'ALL';
        const plateFilter = document.getElementById('ca-filter-plate')?.value || 'ALL';
        const searchVal = (document.getElementById('ca-search-input')?.value || '').toLowerCase().trim();
        const sortBy = document.getElementById('ca-sort-by')?.value || 'trip_desc';

        window._caFilteredTrips = window._caTripGroups.filter(t => {
            if (plateFilter !== 'ALL' && t.placa !== plateFilter) return false;
            
            if (fuelFilter !== 'ALL') {
                const hasFuel = (t.vouchers || []).some(v => v.producto === fuelFilter);
                if (!hasFuel) return false;
            }

            if (searchVal) {
                const matchViaje = (t.viaje || '').toLowerCase().includes(searchVal);
                const matchPlaca = (t.placa || '').toLowerCase().includes(searchVal);
                const matchRuta = (t.ruta || '').toLowerCase().includes(searchVal);
                const matchChofer = (t.vouchers || []).some(v => (v.conductor || '').toLowerCase().includes(searchVal));
                if (!matchViaje && !matchPlaca && !matchRuta && !matchChofer) return false;
            }

            return true;
        });

        // Ordenamiento
        window._caFilteredTrips.sort((a, b) => {
            switch (sortBy) {
                case 'trip_asc': return (a.viaje || '').localeCompare(b.viaje || '', undefined, { numeric: true });
                case 'trip_desc': return (b.viaje || '').localeCompare(a.viaje || '', undefined, { numeric: true });
                case 'date_asc': return (a.fechaInicio || '').localeCompare(b.fechaInicio || '');
                case 'date_desc': return (b.fechaFin || '').localeCompare(a.fechaFin || '');
                case 'gal_desc': return b.totalGalones - a.totalGalones;
                case 'cost_desc': return b.totalGasto - a.totalGasto;
                default: return (b.viaje || '').localeCompare(a.viaje || '', undefined, { numeric: true });
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

        if (subV) subV.textContent = `${trips.reduce((s, t) => s + t.vouchers.length, 0)} vales individuales`;
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

    // Renderizar Tabla Consolidada
    window.caRenderTabla = function() {
        const tbody = document.getElementById('ca-trip-tbody');
        const counter = document.getElementById('ca-filtered-results-counter');

        if (counter) counter.textContent = `Mostrando ${window._caFilteredTrips.length.toLocaleString()} viajes`;
        if (!tbody) return;

        if (window._caFilteredTrips.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" class="text-center py-5 text-muted">
                        <i class="bi bi-inbox fs-2 d-block mb-2"></i>
                        No se encontraron viajes con los filtros seleccionados.
                    </td>
                </tr>
            `;
            return;
        }

        const esc = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        let html = '';
        window._caFilteredTrips.forEach((t, idx) => {
            const rTeorico = obtenerRendimientoTeorico(t.ruta, t.pesoMaxTn);
            let semaforoBadge = '—';

            if (t.rendimiento > 0 && rTeorico > 0) {
                const ratio = t.rendimiento / rTeorico;
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

            const tieneAlertaOdo = t.odometroInconsistente;
            const semaforoRecorrido = tieneAlertaOdo 
                ? `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger px-2 py-0.5" title="Odómetro final menor al inicial"><i class="bi bi-exclamation-triangle-fill me-1"></i>Revisar Odo</span>` 
                : (t.recorridoKm > 0 ? t.recorridoKm.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—');

            html += `
                <tr>
                    <td>
                        <span class="badge bg-slate-900 text-white font-monospace px-2.5 py-1" style="background:#0f172a; font-size:0.75rem;">
                            ${esc(t.viaje)}
                        </span>
                    </td>
                    <td>
                        <span class="badge bg-primary bg-opacity-10 text-primary border font-monospace px-2 py-1 fw-bold" style="font-size:0.75rem;">
                            ${esc(t.placa)}
                        </span>
                    </td>
                    <td class="text-truncate" style="max-width: 180px;" title="${esc(t.ruta)}">
                        <i class="bi bi-geo-alt-fill text-danger me-1 small"></i>
                        <span class="fw-semibold text-dark">${esc(t.ruta)}</span>
                    </td>
                    <td class="text-muted small">${esc(t.fechaInicio)}</td>
                    <td class="text-muted small">${esc(t.fechaFin)}</td>
                    <td class="text-end font-monospace text-success fw-bold">${t.kmInicio > 0 ? t.kmInicio.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace text-danger fw-bold">${t.kmFin > 0 ? t.kmFin.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace fw-bold text-dark">${semaforoRecorrido}</td>
                    <td class="text-end font-monospace fw-bold text-primary">${t.totalGalones.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace fw-bold text-success">S/ ${t.totalGasto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace fw-bold ${t.rendimiento > 0 ? 'text-indigo-600' : 'text-muted'}">
                        ${t.rendimiento > 0 ? t.rendimiento.toFixed(2) : '—'}
                    </td>
                    <td class="text-end font-monospace">${semaforoBadge}</td>
                    <td class="text-center">
                        <button class="btn btn-outline-primary btn-sm rounded-pill py-0 px-2.5 d-inline-flex align-items-center gap-1" onclick="window.caAbrirModalVales(${idx})" style="font-size:0.72rem;">
                            <i class="bi bi-receipt"></i> ${t.vouchersPropiosCount || t.vouchers.length} vales
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    };

    // Modal de Vales de un Viaje
    window.caAbrirModalVales = function(idx) {
        const trip = window._caFilteredTrips[idx];
        if (!trip) return;

        const title = document.getElementById('ca-modal-title');
        const sub = document.getElementById('ca-modal-sub-header');
        const tbody = document.getElementById('ca-modal-table-body');

        if (title) title.textContent = `Detalle de Vales — Viaje ${trip.viaje} (${trip.placa})`;

        if (sub) {
            sub.innerHTML = `
                <div><span class="text-muted">Ruta:</span> <strong class="text-dark">${trip.ruta}</strong></div>
                <div><span class="text-muted">Km Inicial (Partida):</span> <strong class="text-success font-monospace">${trip.kmInicio > 0 ? trip.kmInicio.toLocaleString('es-PE', { minimumFractionDigits: 1 }) + ' Km' : 'N/D'}</strong></div>
                <div><span class="text-muted">Km Final (Cierre):</span> <strong class="text-danger font-monospace">${trip.kmFin > 0 ? trip.kmFin.toLocaleString('es-PE', { minimumFractionDigits: 1 }) + ' Km' : 'N/D'}</strong></div>
                <div><span class="text-muted">Recorrido:</span> <strong class="text-dark font-monospace">${trip.recorridoKm > 0 ? trip.recorridoKm.toLocaleString('es-PE', { minimumFractionDigits: 1 }) + ' Km' : 'N/D'}</strong></div>
                <div><span class="text-muted">Total Galones:</span> <strong class="text-primary">${trip.totalGalones.toFixed(2)} Gln</strong></div>
                <div><span class="text-muted">Total Gasto:</span> <strong class="text-success">S/ ${trip.totalGasto.toFixed(2)}</strong></div>
                <div><span class="text-muted">Rendimiento:</span> <strong class="text-indigo-600 font-monospace">${trip.rendimiento > 0 ? trip.rendimiento.toFixed(2) + ' Km/Gal' : 'N/D'}</strong></div>
            `;
        }

        if (tbody) {
            tbody.innerHTML = trip.vouchers.map(v => {
                if (v.esPuntoPartida) {
                    return `
                        <tr style="background: #f0fdf4 !important;">
                            <td class="py-2.5 px-3">
                                <span class="fw-bold text-success">${v.fecha || '—'}</span>
                                <br>
                                <span class="badge bg-success bg-opacity-15 text-success border border-success fw-bold mt-1" style="font-size:0.68rem;">
                                    <i class="bi bi-flag-fill me-1"></i> PUNTO DE PARTIDA (Cierre Viaje ${esc(v.viajeOriginal || '')})
                                </span>
                            </td>
                            <td class="py-2.5 px-3"><span class="badge bg-info bg-opacity-10 text-info border">${v.producto}</span></td>
                            <td class="py-2.5 px-3 fw-semibold">${v.grifo}</td>
                            <td class="py-2.5 px-3 text-end font-monospace"><strong class="text-success">${v.odometro > 0 ? v.odometro.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'} Km</strong></td>
                            <td class="py-2.5 px-3 text-end font-monospace text-muted fst-italic small">— Ref. Base —</td>
                            <td class="py-2.5 px-3 text-end font-monospace text-muted fst-italic small">— Ref. —</td>
                            <td class="py-2.5 px-3 text-end font-monospace text-muted fst-italic small">— Ref. —</td>
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
                                    <i class="bi bi-check-circle-fill me-1"></i> CIERRE DE VIAJE (Último Abastecimiento)
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

    // Exportar Resumen Consolidado a Excel
    window.caExportarResumenExcel = function() {
        if (typeof XLSX === 'undefined') {
            alert('Librería SheetJS no disponible.');
            return;
        }

        if (window._caFilteredTrips.length === 0) {
            alert('No hay viajes para exportar.');
            return;
        }

        const exportData = window._caFilteredTrips.map(t => ({
            "N° VIAJE": t.viaje,
            "PLACA": t.placa,
            "RUTA": t.ruta,
            "FECHA INICIO": t.fechaInicio,
            "FECHA FIN": t.fechaFin,
            "KM INICIAL": t.kmInicio,
            "KM FINAL": t.kmFin,
            "RECORRIDO (KM)": t.recorridoKm,
            "TOTAL GALONES": t.totalGalones,
            "TOTAL GASTO (S/)": t.totalGasto,
            "KM / GALÓN REAL": t.rendimiento > 0 ? parseFloat(t.rendimiento.toFixed(2)) : 'N/D',
            "CANTIDAD VALES": t.vouchers.length
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Consolidado_Viajes");
        XLSX.writeFile(wb, `Analisis_Combustible_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // Auto-inicializar
    window.inicializarModuloCombustibleAnalisis();
})();
