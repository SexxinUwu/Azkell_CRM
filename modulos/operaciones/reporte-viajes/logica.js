// =========================================================================
// MÓDULO: REPORTE OPERACIONAL DE VIAJES Y ESTIMACIÓN DE COMBUSTIBLE
// ERP AZKELL — Ida / Retorno y Consolidado Matriz D2
// =========================================================================

(function() {
    'use strict';

    window.dataGlobalReporteViajes = [];
    window.datosFiltradosReporteViajes = [];
    let _rvPaginaActual = 1;
    const _rvItemsPorPagina = 30;
    const _rvExpandedRows = new Set(); // Set de viajes expandidos

    function rvGetFechaHoy() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    window.rvInicializarFechas = function() {
        const elDesde = document.getElementById('rv-filtro-fecha-desde');
        const elHasta = document.getElementById('rv-filtro-fecha-hasta');
        const hoy = rvGetFechaHoy();
        if (elDesde && !elDesde.value) elDesde.value = hoy;
        if (elHasta && !elHasta.value) elHasta.value = hoy;
    };

    window.inicializarModuloReporteViajes = function() {
        window.rvInicializarFechas();
        window.rvCargarDatos();
    };

    window.rvCargarDatos = async function() {
        window.rvInicializarFechas();
        const tbody = document.getElementById('rv-tabla-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center py-5 text-secondary">
                        <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
                        <div class="small fw-semibold">Consultando y calculando reporte de viajes con la Matriz D2...</div>
                    </td>
                </tr>
            `;
        }

        try {
            const token = localStorage.getItem('fleet_token') || sessionStorage.getItem('fleet_token');
            const res = await fetch('/api/operaciones/reporte-viajes', {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'Content-Type': 'application/json'
                }
            });

            const json = await res.json();
            if (json.ok && Array.isArray(json.data)) {
                window.dataGlobalReporteViajes = json.data;
                window.datosFiltradosReporteViajes = [...json.data];
                
                window.rvPoblarFiltros(json.data);
                window.rvActualizarKPIs(json.data);
                window.rvAplicarFiltros();
            } else {
                if (tbody) {
                    tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-danger">${json.error || 'No se pudieron obtener datos'}</td></tr>`;
                }
            }
        } catch (err) {
            console.error('Error cargando reporte de viajes:', err);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-danger">Error de conexión al servidor.</td></tr>`;
            }
        }
    };

    window.rvPoblarFiltros = function(data) {
        const selMotor = document.getElementById('rv-filtro-motor');
        if (selMotor) {
            const currentVal = selMotor.value || 'ALL';
            const motores = [...new Set(data.map(v => (v.modelo_motor || '').trim().toUpperCase()).filter(Boolean))].sort();
            let opts = `<option value="ALL">Todos los Motores</option>`;
            motores.forEach(m => {
                opts += `<option value="${m}" ${currentVal === m ? 'selected' : ''}>${m}</option>`;
            });
            selMotor.innerHTML = opts;
        }

        const selConfig = document.getElementById('rv-filtro-config');
        if (selConfig) {
            const currentVal = selConfig.value || 'ALL';
            const configs = [...new Set(data.map(v => (v.configuracion || v.configuracion_tracto || '').trim().toUpperCase()).filter(Boolean))].sort();
            let opts = `<option value="ALL">Config.</option>`;
            configs.forEach(c => {
                opts += `<option value="${c}" ${currentVal === c ? 'selected' : ''}>${c}</option>`;
            });
            selConfig.innerHTML = opts;
        }
    };

    window.rvActualizarKPIs = function(data) {
        const totalViajes = data.length;
        const totalGalones = data.reduce((s, v) => s + (parseFloat(v.galones_teoricos_total) || 0), 0);
        const totalTn = data.reduce((s, v) => s + (parseFloat(v.peso_total_tn) || 0), 0);
        const promedioGal = totalViajes > 0 ? (totalGalones / totalViajes) : 0;

        const kpiViajes = document.getElementById('rv-kpi-total-viajes');
        const kpiGal = document.getElementById('rv-kpi-total-galones');
        const kpiTn = document.getElementById('rv-kpi-total-toneladas');
        const kpiProm = document.getElementById('rv-kpi-promedio-galones');
        const badgeTotal = document.getElementById('rv-lbl-total-badge');

        if (kpiViajes) kpiViajes.textContent = totalViajes.toLocaleString('es-PE');
        if (kpiGal) kpiGal.innerHTML = `${totalGalones.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span class="fs-6 fw-normal text-muted">GL</span>`;
        if (kpiTn) kpiTn.innerHTML = `${totalTn.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span class="fs-6 fw-normal text-muted">TN</span>`;
        if (kpiProm) kpiProm.innerHTML = `${promedioGal.toFixed(2)} <span class="fs-6 fw-normal text-muted">GL/Viaje</span>`;
        if (badgeTotal) badgeTotal.textContent = `${totalViajes} viajes`;
    };

    let _rvDebounceTimer = null;
    window.rvOnFiltrarDebounced = function() {
        clearTimeout(_rvDebounceTimer);
        _rvDebounceTimer = setTimeout(function() {
            window.rvOnFiltrar();
        }, 250);
    };

    window.rvOnFiltrar = function() {
        _rvPaginaActual = 1;
        window.rvAplicarFiltros();
    };

    window.rvLimpiarFiltros = function() {
        const viajeEl = document.getElementById('rv-filtro-viaje');
        const qEl = document.getElementById('rv-filtro-q');
        const motorEl = document.getElementById('rv-filtro-motor');
        const configEl = document.getElementById('rv-filtro-config');
        const elDesde = document.getElementById('rv-filtro-fecha-desde');
        const elHasta = document.getElementById('rv-filtro-fecha-hasta');
        const hoy = rvGetFechaHoy();

        if (viajeEl) viajeEl.value = '';
        if (qEl) qEl.value = '';
        if (motorEl) motorEl.value = 'ALL';
        if (configEl) configEl.value = 'ALL';
        if (elDesde) elDesde.value = hoy;
        if (elHasta) elHasta.value = hoy;

        window.rvOnFiltrar();
    };

    window.rvAplicarFiltros = function() {
        const fViaje = (document.getElementById('rv-filtro-viaje')?.value || '').trim().toUpperCase();
        const q = (document.getElementById('rv-filtro-q')?.value || '').trim().toUpperCase();
        const fMotor = document.getElementById('rv-filtro-motor')?.value || 'ALL';
        const fConfig = document.getElementById('rv-filtro-config')?.value || 'ALL';
        const fDesde = (document.getElementById('rv-filtro-fecha-desde')?.value || '').trim();
        const fHasta = (document.getElementById('rv-filtro-fecha-hasta')?.value || '').trim();

        const lista = window.dataGlobalReporteViajes || [];
        const filtrados = lista.filter(v => {
            // Filtro exclusivo por N° de Viaje
            if (fViaje && !(v.viaje || '').toUpperCase().includes(fViaje)) return false;

            // Filtro general de texto (Placas, Conductor, Ruta, Configs)
            if (q) {
                const tracto = (v.placa_tracto || '').toUpperCase();
                const carreta = (v.placa_remolque || '').toUpperCase();
                const cond = (v.conductor || '').toUpperCase();
                const ruta = (v.ruta_principal || '').toUpperCase();
                const rIda = (v.ida?.ruta || '').toUpperCase();
                const rRet = (v.retorno?.ruta || '').toUpperCase();
                const confg = (v.configuracion || '').toUpperCase();
                const confgT = (v.configuracion_tracto || '').toUpperCase();
                const confgR = (v.configuracion_remolque || '').toUpperCase();
                const match = tracto.includes(q) || carreta.includes(q) || cond.includes(q) || ruta.includes(q) || rIda.includes(q) || rRet.includes(q) || confg.includes(q) || confgT.includes(q) || confgR.includes(q);
                if (!match) return false;
            }

            // Filtro por Modelo de Motor
            if (fMotor !== 'ALL' && (v.modelo_motor || '').toUpperCase() !== fMotor) return false;

            // Filtro por Configuración
            if (fConfig !== 'ALL') {
                const confg = (v.configuracion || '').toUpperCase();
                const confgT = (v.configuracion_tracto || '').toUpperCase();
                if (confg !== fConfig && confgT !== fConfig) return false;
            }

            // Filtro por Rango de Fechas (Desde - Hasta)
            if (fDesde && v.fecha && v.fecha < fDesde) return false;
            if (fHasta && v.fecha && v.fecha > fHasta) return false;

            return true;
        });

        window.datosFiltradosReporteViajes = filtrados;
        window.rvActualizarKPIs(filtrados);
        window.rvRenderizarTabla();
    };

    window.rvRenderizarTabla = function() {
        const tbody = document.getElementById('rv-tabla-body');
        const infoPaginacion = document.getElementById('rv-info-paginacion');
        const btnPrev = document.getElementById('rv-btn-prev');
        const btnNext = document.getElementById('rv-btn-next');
        if (!tbody) return;

        const total = window.datosFiltradosReporteViajes.length;
        const totalPaginas = Math.ceil(total / _rvItemsPorPagina) || 1;

        if (_rvPaginaActual > totalPaginas) _rvPaginaActual = totalPaginas;
        if (_rvPaginaActual < 1) _rvPaginaActual = 1;

        const inicio = (_rvPaginaActual - 1) * _rvItemsPorPagina;
        const fin = inicio + _rvItemsPorPagina;
        const pageItems = window.datosFiltradosReporteViajes.slice(inicio, fin);

        if (infoPaginacion) infoPaginacion.textContent = `Mostrando ${Math.min(inicio + 1, total)} - ${Math.min(fin, total)} de ${total} viajes`;
        if (btnPrev) btnPrev.disabled = _rvPaginaActual <= 1;
        if (btnNext) btnNext.disabled = _rvPaginaActual >= totalPaginas;

        if (pageItems.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center py-5 text-secondary">
                        <i class="bi bi-inbox fs-3 d-block mb-2 text-muted"></i>
                        <div class="fw-bold">No se encontraron viajes registrados</div>
                        <small class="text-muted">Ajusta los filtros de búsqueda superior.</small>
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        pageItems.forEach(v => {
            const isExpanded = _rvExpandedRows.has(v.viaje);
            const carretaHtml = v.placa_remolque && v.placa_remolque.trim()
                ? `<span class="rv-badge-placa rv-badge-carreta"><i class="bi bi-truck-flatbed me-1"></i>${v.placa_remolque}</span>`
                : `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-1.5 py-0.5" style="font-size:0.68rem;">SOLO TRACTO (-10%)</span>`;

            // Formatear Fecha DD/MM/YYYY
            let fechaFmt = v.fecha || '---';
            if (v.fecha && v.fecha.includes('-')) {
                const parts = v.fecha.split('-');
                if (parts.length === 3) fechaFmt = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }

            // Fila Maestra del Viaje
            html += `
                <tr class="rv-row-master ${isExpanded ? 'is-expanded' : ''}" onclick="window.rvToggleDetalle('${v.viaje}')" title="Clic para ver desglose de Ida y Retorno">
                    <td style="text-align:center;">
                        <span class="rv-exp-btn"><i class="bi bi-chevron-right"></i></span>
                    </td>
                    <td>
                        <span class="rv-badge-viaje" onclick="event.stopPropagation()" title="Seleccionar para copiar">
                            <i class="bi bi-ticket-detailed"></i><span>${v.viaje}</span>
                        </span>
                    </td>
                    <td><div class="fw-bold text-dark font-monospace">${fechaFmt}</div></td>
                    <td><span class="rv-badge-placa rv-badge-tracto"><i class="bi bi-truck me-1"></i>${v.placa_tracto}</span></td>
                    <td>${carretaHtml}</td>
                    <td style="text-align:center;"><span class="rv-badge-confg">${v.configuracion || 'T3'}</span></td>
                    <td><span class="rv-badge-motor"><i class="bi bi-cpu me-1"></i>${v.modelo_motor}</span></td>
                    <td>
                        <div class="fw-bold text-dark text-truncate" style="max-width:210px;" title="${v.ruta_principal}">
                            <i class="bi bi-geo-alt-fill text-danger me-1"></i>${v.ruta_principal}
                        </div>
                    </td>
                    <td>
                        <div class="fw-semibold text-secondary text-truncate" style="max-width:200px; font-size:0.82rem;" title="${v.conductor}">
                            <i class="bi bi-person-fill text-primary me-1"></i>${v.conductor}
                        </div>
                    </td>
                    <td style="text-align:right;">
                        <span class="badge bg-light text-dark border border-secondary-subtle font-monospace fw-bold px-2 py-1" style="font-size:0.84rem;">
                            ${v.peso_total_tn.toFixed(2)} TN
                        </span>
                    </td>
                    <td style="text-align:right;">
                        <span class="rv-badge-galones">
                            ${v.galones_teoricos_total.toFixed(2)} GL
                        </span>
                    </td>
                    <td style="text-align:center;">
                        <span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1" style="font-size:0.72rem; font-weight:700;">${v.estado}</span>
                    </td>
                </tr>
            `;

            // Si está expandido, renderizar los tramos IDA y RETORNO
            if (isExpanded) {
                // Subfila Tramo IDA
                html += `
                    <tr class="rv-subrow-tramo">
                        <td></td>
                        <td colspan="6" class="ps-3">
                            <div class="d-flex align-items-center gap-2">
                                <span class="rv-badge-tramo rv-tramo-ida"><i class="bi bi-arrow-right-circle-fill"></i> TRAMO IDA</span>
                                ${v.ida.ordenes.length > 0 ? `<span class="badge bg-light text-secondary border font-monospace" style="font-size:0.72rem;">O/S: ${v.ida.ordenes.join(', ')}</span>` : '<small class="text-muted fst-italic">Tramo principal</small>'}
                            </div>
                        </td>
                        <td>
                            <div class="d-flex align-items-center gap-1.5">
                                <span class="text-secondary fw-bold small"><i class="bi bi-signpost-2 me-1"></i>Ruta:</span> 
                                <span class="text-dark fw-bold">${v.ida.ruta || 'LIMA - DESTINO'}</span>
                            </div>
                        </td>
                        <td>
                            <div class="text-muted small text-truncate" style="max-width:180px;" title="${v.conductor}">
                                <i class="bi bi-person me-1"></i>${v.conductor}
                            </div>
                        </td>
                        <td style="text-align:right;">
                            <div class="d-flex align-items-center justify-content-end gap-1">
                                <span class="text-muted small">Peso Ida:</span>
                                <span class="font-monospace fw-bold text-dark" style="font-size:0.82rem;">${v.ida.peso_tn.toFixed(2)} TN</span>
                            </div>
                        </td>
                        <td style="text-align:right;">
                            <span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace px-2 py-1 fw-bold" style="font-size:0.82rem;">
                                ${v.ida.galones_estimados.toFixed(2)} GL
                            </span>
                        </td>
                        <td style="text-align:center; color:#94a3b8;">—</td>
                    </tr>
                `;

                // Subfila Tramo RETORNO
                html += `
                    <tr class="rv-subrow-tramo" style="border-bottom: 2px solid #e2e8f0;">
                        <td></td>
                        <td colspan="6" class="ps-3">
                            <div class="d-flex align-items-center gap-2">
                                <span class="rv-badge-tramo rv-tramo-retorno"><i class="bi bi-arrow-left-circle-fill"></i> TRAMO RETORNO</span>
                                ${v.retorno.ordenes.length > 0 ? `<span class="badge bg-light text-secondary border font-monospace" style="font-size:0.72rem;">O/S: ${v.retorno.ordenes.join(', ')}</span>` : '<small class="text-muted fst-italic">Retorno estándar</small>'}
                            </div>
                        </td>
                        <td>
                            <div class="d-flex align-items-center gap-1.5">
                                <span class="text-secondary fw-bold small"><i class="bi bi-signpost-2 me-1"></i>Ruta:</span> 
                                <span class="text-dark fw-bold">${v.retorno.ruta || 'DESTINO - LIMA'}</span>
                            </div>
                        </td>
                        <td>
                            <div class="text-muted small text-truncate" style="max-width:180px;" title="${v.conductor}">
                                <i class="bi bi-person me-1"></i>${v.conductor}
                            </div>
                        </td>
                        <td style="text-align:right;">
                            <div class="d-flex align-items-center justify-content-end gap-1">
                                <span class="text-muted small">Peso Ret:</span>
                                <span class="font-monospace fw-bold ${v.retorno.peso_tn > 0 ? 'text-dark' : 'text-muted'}" style="font-size:0.82rem;">${v.retorno.peso_tn.toFixed(2)} TN</span>
                            </div>
                        </td>
                        <td style="text-align:right;">
                            <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle font-monospace px-2 py-1 fw-bold" style="font-size:0.82rem;">
                                ${v.retorno.galones_estimados.toFixed(2)} GL
                            </span>
                        </td>
                        <td style="text-align:center; color:#94a3b8;">—</td>
                    </tr>
                `;
            }
        });

        tbody.innerHTML = html;
    };

    window.rvToggleDetalle = function(viaje) {
        if (_rvExpandedRows.has(viaje)) {
            _rvExpandedRows.delete(viaje);
        } else {
            _rvExpandedRows.add(viaje);
        }
        window.rvRenderizarTabla();
    };

    window.rvCambiarPagina = function(delta) {
        _rvPaginaActual += delta;
        window.rvRenderizarTabla();
    };

    window.rvExportarExcel = function() {
        const items = window.datosFiltradosReporteViajes || [];
        if (items.length === 0) {
            alert('No hay datos para exportar.');
            return;
        }

        let csv = 'Nro Viaje,Fecha,Tracto,Carreta,Configuracion Combinada,Config Tracto,Config Carreta,Motor,Conductor,Ruta Principal,Peso Ida (TN),Galones Ida (GL),Ruta Retorno,Peso Retorno (TN),Galones Retorno (GL),Peso Total (TN),Galones Totales Programados (GL),Estado\n';

        items.forEach(v => {
            const row = [
                `"${v.viaje}"`,
                `"${v.fecha}"`,
                `"${v.placa_tracto}"`,
                `"${v.placa_remolque || ''}"`,
                `"${v.configuracion || v.configuracion_tracto || 'T3'}"`,
                `"${v.configuracion_tracto || 'T3'}"`,
                `"${v.configuracion_remolque || ''}"`,
                `"${v.modelo_motor}"`,
                `"${(v.conductor || '').replace(/"/g, '""')}"`,
                `"${(v.ruta_principal || '').replace(/"/g, '""')}"`,
                v.ida.peso_tn.toFixed(2),
                v.ida.galones_estimados.toFixed(2),
                `"${(v.retorno.ruta || '').replace(/"/g, '""')}"`,
                v.retorno.peso_tn.toFixed(2),
                v.retorno.galones_estimados.toFixed(2),
                v.peso_total_tn.toFixed(2),
                v.galones_teoricos_total.toFixed(2),
                `"${v.estado}"`
            ];
            csv += row.join(',') + '\n';
        });

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Reporte_Viajes_Combustible_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Auto-inicializar si el módulo se carga directamente
    if (document.getElementById('moduloReporteViajesOperaciones')) {
        window.inicializarModuloReporteViajes();
    }
})();
