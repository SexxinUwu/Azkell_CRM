// ── LÓGICA DE ANÁLISIS DE COMBUSTIBLE POR VIAJE — ERP AZKELL FLEET ─────────────────
(function() {
    let rawVouchers = [];
    let groupedTrips = [];
    let currentSortField = 'trip';
    let currentSortDir = 'desc';

    window.inicializarModuloCombustibleAnalisis = function() {
        window.caCargarDatosDesdeERP();
    };

    // 1. Cargar datos consolidados desde la Base de Datos del ERP
    window.caCargarDatosDesdeERP = async function() {
        const tbody = document.getElementById('ca-trip-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center py-5 text-muted">
                        <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                        Cargando análisis dinámico desde la base de datos...
                    </td>
                </tr>
            `;
        }

        try {
            // Traer todos los vales de combustible para consolidar localmente
            const res = await fetch('/api/combustible/vales?limit=10000');
            const data = await res.json();

            if (data.ok && data.data && data.data.length > 0) {
                const parsedRows = data.data.map(r => ({
                    viaje: (r.viaje || 'SIN-VIAJE').trim(),
                    placa: (r.vehiculo || 'SIN-PLACA').toUpperCase().trim(),
                    ruta: r.ruta || 'Sin Ruta',
                    fecha: r.fecha ? new Date(r.fecha).toISOString().replace('T', ' ').slice(0, 19) : '',
                    galones: parseFloat(r.galones || 0),
                    importe: parseFloat(r.importe || 0),
                    producto: (r.tipo_combustible || 'D2').toUpperCase().trim(),
                    odometro: parseFloat(r.kilometraje || 0),
                    conductor: r.conductor || 'Sin Especificar',
                    grifo: r.estacion || r.proveedor || 'Estación'
                }));

                window.caProcesarDataset(parsedRows, "Base de Datos del ERP (Datos Reales)");
            } else {
                // Si la BD está vacía, usar datos de demostración
                const mockData = [
                    { viaje: '2026-00000876', placa: 'BEQ701', ruta: 'LIMA - HUANCAYO', fecha: '2026-08-18 08:30', galones: 45.5, importe: 819.00, producto: 'DIESEL B5', odometro: 120500, conductor: 'EINE CARRASCO', grifo: 'GRIFO PRIMAX ATE' },
                    { viaje: '2026-00000876', placa: 'BEQ701', ruta: 'LIMA - HUANCAYO', fecha: '2026-08-19 16:45', galones: 42.0, importe: 756.00, producto: 'DIESEL B5', odometro: 120980, conductor: 'EINE CARRASCO', grifo: 'GRIFO PECSA HUANCAYO' },
                    { viaje: '2026-00000866', placa: 'CFC738', ruta: 'LIMA - AREQUIPA', fecha: '2026-08-15 06:10', galones: 60.0, importe: 1080.00, producto: 'D2', odometro: 245100, conductor: 'NELSON CALDERON', grifo: 'GRIFO REPSOL CHORRILLOS' },
                    { viaje: '2026-00000866', placa: 'CFC738', ruta: 'LIMA - AREQUIPA', fecha: '2026-08-16 20:30', galones: 58.5, importe: 1053.00, producto: 'D2', odometro: 246120, conductor: 'NELSON CALDERON', grifo: 'GRIFO REPSOL ICA' },
                    { viaje: '2026-00000826', placa: 'BEQ844', ruta: 'LIMA - TRUJILLO', fecha: '2026-08-10 10:00', galones: 50.0, importe: 900.00, producto: 'D2', odometro: 485763, conductor: 'MIGUEL ROSAS', grifo: 'GRIFO PETROPERU' },
                    { viaje: '2026-00000818', placa: 'BEQ844', ruta: 'LIMA - AREQUIPA', fecha: '2026-08-08 07:15', galones: 194.54, importe: 4134.00, producto: 'D2', odometro: 487964, conductor: 'JUAN SANCHEZ', grifo: 'BASE' }
                ];
                window.caProcesarDataset(mockData, "Modo Demostración (Sin vales registrados aún en ERP)");
            }
        } catch (e) {
            console.error('Error al cargar datos para análisis:', e);
            if (tbody) tbody.innerHTML = `<tr><td colspan="12" class="text-center text-danger py-4">Error de conexión con el servidor.</td></tr>`;
        }
    };

    // 2. Procesar archivo Excel / CSV cargado en caliente
    window.caProcesarArchivoExcel = function(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (typeof XLSX === 'undefined') {
            alert('La librería SheetJS no está disponible.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                if (rows.length === 0) {
                    alert('El archivo Excel está vacío o no contiene filas de datos.');
                    return;
                }

                const parsedRows = window.caParseExcelRows(rows);
                window.caProcesarDataset(parsedRows, file.name);
            } catch (err) {
                console.error(err);
                alert('Ocurrió un error al leer el archivo Excel.');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // Analizador estricto de columnas MarsisaSoft
    window.caParseExcelRows = function(rows) {
        const parseNum = (v) => {
            if (typeof v === 'number') return v;
            if (!v) return 0;
            const clean = String(v).replace(/\s/g, '').replace(',', '.');
            const n = parseFloat(clean);
            return isNaN(n) ? 0 : n;
        };

        return rows.map(r => {
            const keys = Object.keys(r);

            const findVal = (terms) => {
                const key = keys.find(k => {
                    const cleanK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    return terms.some(t => cleanK.includes(t));
                });
                return key ? r[key] : "";
            };

            const findPlacaVal = () => {
                const exactMatch = keys.find(k => {
                    const ck = k.trim().toLowerCase();
                    return ck === "vehiculo" || ck === "placa" || ck === "unidad" || ck === "plate";
                });
                if (exactMatch && r[exactMatch]) return r[exactMatch];

                const filteredKeys = keys.filter(k => {
                    const ck = k.toLowerCase();
                    return !ck.includes("clase") && !ck.includes("tipo") && !ck.includes("cat") && !ck.includes("desc");
                });

                const matchedKey = filteredKeys.find(k => {
                    const cleanK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    return ["placa", "vehiculo", "unidad", "plate", "tracto", "carreta", "movil"].some(t => cleanK.includes(t));
                });

                return matchedKey ? r[matchedKey] : (exactMatch ? r[exactMatch] : "");
            };

            let viaje = findVal(["viaje", "nro_viaje", "num_viaje", "nro viaje", "n° viaje", "nº viaje", "codigo_viaje", "orden", "flete"]);
            const placa = (findPlacaVal() || "SIN-PLACA").toString().toUpperCase().trim();
            const ruta = findVal(["ruta", "origen", "destino", "tramo", "trayecto", "servicio", "itinerario"]) || "Sin Ruta";
            const fecha = findVal(["fecha", "date", "f_abast", "fecha_abast", "f. abastecimiento", "despacho"]) || "";
            const galones = parseNum(findVal(["galones", "galon", "cant", "cantidad", "volumen", "litros"]));
            const importe = parseNum(findVal(["importe", "monto", "total", "costo", "precio_total", "valor"]));
            const producto = (findVal(["combustible", "producto", "prod", "tipo_comb", "articulo"]) || "D2").toString().toUpperCase().trim();
            const odometro = parseNum(findVal(["km", "kilometraje", "odometro", "odo", "lectura"]));
            const conductor = (findVal(["conductor", "chofer", "operador", "driver"]) || "Sin Especificar").toString().toUpperCase().trim();
            const grifo = (findVal(["grifo", "estacion", "proveedor", "e/s", "pos"]) || "Estación").toString().toUpperCase().trim();

            if (!viaje) viaje = "SIN-VIAJE";

            return { viaje, placa, ruta, fecha: fecha ? fecha.toString() : "", galones, importe, producto, odometro, conductor, grifo };
        });
    };

    // Procesar dataset completo y armar selectores
    window.caProcesarDataset = function(data, sourceName) {
        rawVouchers = data;

        const sourceEl = document.getElementById('ca-loaded-source');
        const countInfo = document.getElementById('ca-record-count-info');

        if (sourceEl) sourceEl.textContent = sourceName;
        if (countInfo) countInfo.textContent = `(${data.length.toLocaleString()} vales procesados)`;

        // Select de tipos de combustible
        const fuels = [...new Set(data.map(d => d.producto))].filter(Boolean).sort();
        const fuelSelect = document.getElementById('ca-filter-fuel');
        if (fuelSelect) {
            fuelSelect.innerHTML = '<option value="ALL">Todos los Combustibles</option>' +
                fuels.map(f => `<option value="${f}">Combustible: ${f}</option>`).join('');
            fuelSelect.value = "ALL";
        }

        // Select de Placas
        const plates = [...new Set(data.map(d => d.placa))].filter(b => b && b !== "SIN-PLACA").sort();
        const plateSelect = document.getElementById('ca-filter-plate');
        if (plateSelect) {
            plateSelect.innerHTML = '<option value="ALL">Todas las Placas (Mostrar Todos)</option>' +
                plates.map(p => `<option value="${p}">Placa: ${p}</option>`).join('');
            plateSelect.value = "ALL";
        }

        window.caAplicarFiltros();
    };

    // Aplicar filtros y agrupar por N° Viaje
    window.caAplicarFiltros = function() {
        const selectedFuel = document.getElementById('ca-filter-fuel')?.value || 'ALL';
        const selectedPlate = document.getElementById('ca-filter-plate')?.value || 'ALL';
        const sortBy = document.getElementById('ca-sort-by')?.value || 'trip_desc';
        const searchText = (document.getElementById('ca-search-input')?.value || '').toLowerCase().trim();

        // 1. Filtrar vales individuales
        const filteredVouchers = rawVouchers.filter(v => {
            const matchFuel = (selectedFuel === "ALL" || v.producto === selectedFuel);
            const matchPlate = (selectedPlate === "ALL" || v.placa === selectedPlate);
            const matchSearch = !searchText || 
                v.viaje.toLowerCase().includes(searchText) || 
                v.placa.toLowerCase().includes(searchText) || 
                v.ruta.toLowerCase().includes(searchText) ||
                v.conductor.toLowerCase().includes(searchText);

            return matchFuel && matchPlate && matchSearch;
        });

        // 2. Agrupar por Número de Viaje
        const tripMap = {};

        filteredVouchers.forEach(v => {
            const tripKey = v.viaje || 'SIN-VIAJE';
            if (!tripMap[tripKey]) {
                tripMap[tripKey] = {
                    viaje: tripKey,
                    placa: v.placa,
                    ruta: v.ruta,
                    vouchers: []
                };
            }
            tripMap[tripKey].vouchers.push(v);
        });

        // 3. Consolidar métricas de cada viaje
        groupedTrips = Object.values(tripMap).map(t => {
            t.vouchers.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

            const firstV = t.vouchers[0] || {};
            const lastV = t.vouchers[t.vouchers.length - 1] || {};

            const totalGal = t.vouchers.reduce((sum, x) => sum + x.galones, 0);
            const totalCost = t.vouchers.reduce((sum, x) => sum + x.importe, 0);

            const validOdos = t.vouchers.map(x => x.odometro).filter(o => o > 0);
            const kmInicio = validOdos.length > 0 ? Math.min(...validOdos) : 0;
            const kmFin = validOdos.length > 0 ? Math.max(...validOdos) : 0;
            const recorridoKm = (kmFin > kmInicio) ? (kmFin - kmInicio) : 0;
            const rendimientoKmGal = (totalGal > 0 && recorridoKm > 0) ? (recorridoKm / totalGal) : 0;

            return {
                viaje: t.viaje,
                placa: t.placa || firstV.placa,
                ruta: t.ruta || firstV.ruta,
                fechaInicio: firstV.fecha || 'N/D',
                fechaFin: lastV.fecha || 'N/D',
                kmInicio,
                kmFin,
                recorridoKm,
                totalGalones: totalGal,
                totalGasto: totalCost,
                rendimiento: rendimientoKmGal,
                vouchers: t.vouchers
            };
        });

        // 4. Ordenar viajes
        window.caSortTrips(sortBy);

        // 5. Renderizar vista
        window.caRenderTabla();
        window.caRenderKPIs();
    };

    // Ordenar viajes
    window.caSortTrips = function(sortBy) {
        groupedTrips.sort((a, b) => {
            if (sortBy === 'trip_desc') {
                return b.viaje.localeCompare(a.viaje, undefined, { numeric: true, sensitivity: 'base' });
            } else if (sortBy === 'trip_asc') {
                return a.viaje.localeCompare(b.viaje, undefined, { numeric: true, sensitivity: 'base' });
            } else if (sortBy === 'date_desc') {
                return (b.fechaFin || '').localeCompare(a.fechaFin || '');
            } else if (sortBy === 'date_asc') {
                return (a.fechaInicio || '').localeCompare(b.fechaInicio || '');
            } else if (sortBy === 'gal_desc') {
                return b.totalGalones - a.totalGalones;
            } else if (sortBy === 'cost_desc') {
                return b.totalGasto - a.totalGasto;
            }
            return 0;
        });
    };

    // Toggle de orden al hacer clic en las cabeceras
    window.caToggleSort = function(field) {
        currentSortDir = (currentSortDir === 'asc') ? 'desc' : 'asc';
        const sortSelect = document.getElementById('ca-sort-by');

        if (field === 'trip') sortSelect.value = (currentSortDir === 'desc') ? 'trip_desc' : 'trip_asc';
        if (field === 'date_start') sortSelect.value = 'date_asc';
        if (field === 'date_end') sortSelect.value = 'date_desc';
        if (field === 'gal') sortSelect.value = 'gal_desc';
        if (field === 'cost') sortSelect.value = 'cost_desc';

        window.caAplicarFiltros();
    };

    // Renderizar Tabla
    window.caRenderTabla = function() {
        const tbody = document.getElementById('ca-trip-tbody');
        const counter = document.getElementById('ca-filtered-results-counter');

        if (counter) counter.textContent = `Mostrando ${groupedTrips.length.toLocaleString()} viajes`;
        if (!tbody) return;

        if (groupedTrips.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center py-5 text-muted">
                        <i class="bi bi-folder2-open fs-2 d-block mb-2"></i>
                        No se encontraron viajes con los filtros seleccionados.
                    </td>
                </tr>
            `;
            return;
        }

        const esc = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        let html = '';
        groupedTrips.forEach((t, idx) => {
            html += `
                <tr>
                    <td><strong class="text-primary font-monospace">${esc(t.viaje)}</strong></td>
                    <td>
                        <span class="badge bg-light text-dark border font-monospace px-2 py-1" style="font-size:0.75rem;">
                            ${esc(t.placa)}
                        </span>
                    </td>
                    <td class="text-truncate" style="max-width: 180px;" title="${esc(t.ruta)}">${esc(t.ruta)}</td>
                    <td class="text-muted small">${esc(t.fechaInicio)}</td>
                    <td class="text-muted small">${esc(t.fechaFin)}</td>
                    <td class="text-end font-monospace">${t.kmInicio > 0 ? t.kmInicio.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace">${t.kmFin > 0 ? t.kmFin.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                    <td class="text-end font-monospace fw-semibold">${t.recorridoKm > 0 ? t.recorridoKm.toLocaleString('es-PE', { minimumFractionDigits: 1 }) + ' Km' : '—'}</td>
                    <td class="text-end font-monospace fw-bold text-primary">${t.totalGalones.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace fw-bold text-success">S/ ${t.totalGasto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                    <td class="text-end font-monospace fw-semibold ${t.rendimiento > 0 ? 'text-dark' : 'text-muted'}">${t.rendimiento > 0 ? t.rendimiento.toFixed(2) : '—'}</td>
                    <td class="text-center">
                        <button onclick="window.caAbrirModalDetalle(${idx})" class="btn btn-outline-primary btn-sm rounded-pill px-2.5 py-0.5 fw-semibold shadow-2xs" style="font-size:0.75rem;">
                            <i class="bi bi-eye-fill me-1"></i> ${t.vouchers.length} Vales
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    };

    // Renderizar Tarjetas Resumen (KPIs)
    window.caRenderKPIs = function() {
        const totalViajes = groupedTrips.length;
        const totalGal = groupedTrips.reduce((s, t) => s + t.totalGalones, 0);
        const totalGasto = groupedTrips.reduce((s, t) => s + t.totalGasto, 0);
        const totalKm = groupedTrips.reduce((s, t) => s + t.recorridoKm, 0);

        const elV = document.getElementById('ca-kpi-total-viajes');
        const elG = document.getElementById('ca-kpi-total-galones');
        const elI = document.getElementById('ca-kpi-total-gasto');
        const elK = document.getElementById('ca-kpi-total-km');

        if (elV) elV.textContent = totalViajes.toLocaleString();
        if (elG) elG.textContent = totalGal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Gal';
        if (elI) elI.textContent = 'S/ ' + totalGasto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (elK) elK.textContent = totalKm.toLocaleString('es-PE', { minimumFractionDigits: 1 }) + ' Km';

        const promGalViaje = totalViajes > 0 ? (totalGal / totalViajes) : 0;
        const promPrecioGal = totalGal > 0 ? (totalGasto / totalGal) : 0;
        const promKmGal = (totalGal > 0 && totalKm > 0) ? (totalKm / totalGal) : 0;

        const subG = document.getElementById('ca-kpi-galones-sub');
        const subI = document.getElementById('ca-kpi-gasto-sub');
        const subK = document.getElementById('ca-kpi-km-sub');

        if (subG) subG.textContent = `${promGalViaje.toFixed(1)} Gal / viaje prom.`;
        if (subI) subI.textContent = `S/ ${promPrecioGal.toFixed(2)} / Galón prom.`;
        if (subK) subK.textContent = `${promKmGal.toFixed(2)} Km/Gal promedio`;
    };

    // Abrir Modal de Detalle de Vales
    window.caAbrirModalDetalle = function(tripIdx) {
        const trip = groupedTrips[tripIdx];
        if (!trip) return;

        const titleEl = document.getElementById('ca-modal-title');
        const subEl = document.getElementById('ca-modal-sub-header');
        const tbody = document.getElementById('ca-modal-table-body');

        if (titleEl) titleEl.textContent = `Detalle del Viaje N° ${trip.viaje} (${trip.placa})`;
        if (subEl) {
            subEl.innerHTML = `
                <div><strong>Placa:</strong> <span class="badge bg-primary font-monospace">${trip.placa}</span></div>
                <div><strong>Ruta:</strong> ${trip.ruta}</div>
                <div><strong>Galones Totales:</strong> <span class="text-primary fw-bold font-monospace">${trip.totalGalones.toFixed(2)} Gal</span></div>
                <div><strong>Gasto Total:</strong> <span class="text-success fw-bold font-monospace">S/ ${trip.totalGasto.toFixed(2)}</span></div>
            `;
        }

        if (tbody) {
            tbody.innerHTML = trip.vouchers.map(v => {
                const precioGal = v.galones > 0 ? (v.importe / v.galones) : 0;
                return `
                    <tr>
                        <td class="font-monospace">${v.fecha || 'N/D'}</td>
                        <td><span class="badge bg-info bg-opacity-10 text-info border fw-bold">${v.producto}</span></td>
                        <td>${v.grifo}</td>
                        <td class="text-end font-monospace">${v.odometro > 0 ? v.odometro.toLocaleString('es-PE', { minimumFractionDigits: 1 }) : '—'}</td>
                        <td class="text-end font-monospace fw-bold text-primary">${v.galones.toFixed(2)}</td>
                        <td class="text-end font-monospace">S/ ${precioGal.toFixed(2)}</td>
                        <td class="text-end font-monospace fw-bold text-success">S/ ${v.importe.toFixed(2)}</td>
                        <td class="text-truncate" style="max-width: 160px;">${v.conductor}</td>
                    </tr>
                `;
            }).join('');
        }

        const modalEl = document.getElementById('caVouchersModal');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    // Exportar a Excel
    window.caExportarResumenExcel = function() {
        if (groupedTrips.length === 0) {
            alert('No hay datos para exportar.');
            return;
        }

        if (typeof XLSX === 'undefined') {
            alert('Librería SheetJS no disponible.');
            return;
        }

        const exportData = groupedTrips.map(t => ({
            "N° VIAJE": t.viaje,
            "PLACA": t.placa,
            "RUTA": t.ruta,
            "FECHA PRIMER ABASTECIMIENTO": t.fechaInicio,
            "FECHA ULTIMO ABASTECIMIENTO": t.fechaFin,
            "KM INICIAL": t.kmInicio,
            "KM FINAL": t.kmFin,
            "RECORRIDO (KM)": t.recorridoKm,
            "TOTAL GALONES": t.totalGalones,
            "TOTAL GASTO (S/)": t.totalGasto,
            "RENDIMIENTO (KM/GAL)": t.rendimiento > 0 ? Number(t.rendimiento.toFixed(2)) : 0,
            "CANTIDAD VALES": t.vouchers.length
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Resumen_Viajes");
        XLSX.writeFile(wb, `Resumen_Combustible_Por_Viaje_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // Auto-inicializar
    window.inicializarModuloCombustibleAnalisis();
})();
