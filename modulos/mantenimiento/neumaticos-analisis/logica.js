/**
 * logica.js — Análisis de Neumáticos
 * ERP Azkell Fleet
 */

(function() {
    window._neuDataAnalisis = null;
    window._neuChartVigencia = null;

    window.neuAnalisisCargar = async function() {
        try {
            const res = await fetch('/api/neumaticos/analisis');
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Error al obtener análisis');

            window._neuDataAnalisis = data;

            // 1. Render KPIs
            const r = data.resumen || {};
            const total = r.total_inspecciones || 0;
            const vig = r.vigentes || 0;
            const novig = r.no_vigentes || 0;
            const crit = r.llantas_criticas || 0;
            const porcVig = (vig + novig) > 0 ? Math.round((vig / (vig + novig)) * 100) : 100;

            document.getElementById('kpi-neu-total-insp').innerText = total;
            document.getElementById('kpi-neu-vigentes').innerText = vig;
            document.getElementById('kpi-neu-porc-vigente').innerText = `${porcVig}%`;
            document.getElementById('kpi-neu-criticas').innerText = crit;
            document.getElementById('kpi-neu-vencidas').innerText = novig;

            document.getElementById('lbl-vigentes-cnt').innerText = vig;
            document.getElementById('lbl-novigentes-cnt').innerText = novig;

            // 2. Render Chart Vigencia Donut
            window.neuRenderChartVigencia(vig, novig);

            // 3. Render Tabla
            window.neuRenderTablaInsp(data.inspecciones || []);

        } catch (e) {
            console.error("Error en neuAnalisisCargar:", e);
            const tbody = document.getElementById('neu-tbody-inspecciones');
            if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle"></i> Error al cargar datos: ${e.message}</td></tr>`;
        }
    };

    window.neuRenderChartVigencia = function(vig, novig) {
        const canvas = document.getElementById('chartNeuVigencia');
        if (!canvas) return;

        if (window._neuChartVigencia) {
            window._neuChartVigencia.destroy();
            window._neuChartVigencia = null;
        }

        const ChartConstructor = window.Chart || (typeof Chart !== 'undefined' ? Chart : null);
        if (!ChartConstructor) return;

        const total = vig + novig;
        const dataVals = total === 0 ? [1, 0] : [vig, novig];
        const bgColors = total === 0 ? ['#e2e8f0', '#cbd5e1'] : ['#22c55e', '#ef4444'];

        window._neuChartVigencia = new ChartConstructor(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Vigente', 'No Vigente'],
                datasets: [{
                    data: dataVals,
                    backgroundColor: bgColors,
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ` ${ctx.label}: ${ctx.raw} unidades`;
                            }
                        }
                    }
                }
            }
        });
    };

    window.neuRenderTablaInsp = function(lista) {
        const tbody = document.getElementById('neu-tbody-inspecciones');
        const countBadge = document.getElementById('neu-tabla-insp-count');
        if (countBadge) countBadge.innerText = lista.length;
        if (!tbody) return;

        if (!lista.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">No se encontraron inspecciones de neumáticos.</td></tr>';
            return;
        }

        tbody.innerHTML = lista.map(i => {
            const f = String(i.fecha_inspeccion || '').split('T')[0];
            const fProx = String(i.fecha_proxima || '').split('T')[0] || '---';
            const dias = i.dias_restantes !== null ? parseInt(i.dias_restantes, 10) : 0;
            
            let vigBadge = '';
            if (dias > 5) {
                vigBadge = `<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1 rounded-pill small"><i class="bi bi-check-circle-fill me-1"></i>Vigente (+${dias}d)</span>`;
            } else if (dias >= 0) {
                vigBadge = `<span class="badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25 px-2 py-1 rounded-pill small"><i class="bi bi-clock-history me-1"></i>Por Vencer (${dias}d)</span>`;
            } else {
                vigBadge = `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2 py-1 rounded-pill small"><i class="bi bi-x-circle-fill me-1"></i>Vencida (${dias}d)</span>`;
            }

            const critBadge = i.total_criticas > 0 
                ? `<span class="badge bg-danger text-white rounded-pill px-2 py-1 small">${i.total_criticas}</span>`
                : `<span class="badge bg-light text-muted border rounded-pill px-2 py-1 small">0</span>`;

            return `
                <tr>
                    <td class="ps-3 fw-bold text-primary">${i.id_inspeccion}</td>
                    <td>${f}</td>
                    <td><span class="badge bg-dark text-white fw-bold px-2 py-1">${i.placa}</span></td>
                    <td class="small text-muted">${i.dueno || '---'}</td>
                    <td>${Number(i.km_vehiculo||0).toLocaleString()} KM</td>
                    <td class="text-center fw-bold">${i.total_llantas || 0}</td>
                    <td class="text-center">${critBadge}</td>
                    <td class="text-center small">${fProx}</td>
                    <td class="text-center">${vigBadge}</td>
                    <td class="text-center pe-3">
                        <button class="btn btn-outline-primary btn-sm py-1 px-3 rounded-pill fw-bold" style="font-size:0.72rem;" onclick="window.neuVerDetalleModal('${i.id_inspeccion}')">
                            <i class="bi bi-eye-fill me-1"></i>Ver
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    window.neuFiltrarTablaInsp = function() {
        const query = (document.getElementById('neu-filtro-tabla-busqueda')?.value || '').toLowerCase().trim();
        if (!window._neuDataAnalisis || !window._neuDataAnalisis.inspecciones) return;

        const filtradas = window._neuDataAnalisis.inspecciones.filter(i => {
            const placa = (i.placa || '').toLowerCase();
            const dueno = (i.dueno || '').toLowerCase();
            const id = (i.id_inspeccion || '').toLowerCase();
            return placa.includes(query) || dueno.includes(query) || id.includes(query);
        });

        window.neuRenderTablaInsp(filtradas);
    };

    // Consultar chasis por placa
    window.neuConsultarChasisPlaca = async function() {
        const placa = (document.getElementById('neu-quick-search-placa')?.value || '').trim().toUpperCase();
        if (!placa) {
            alert('Por favor, ingresa una placa.');
            return;
        }

        const container = document.getElementById('neu-visor-placa-content');
        container.innerHTML = '<div class="text-center py-5"><div class="spinner-border spinner-border-sm text-primary"></div> Cargando datos de la unidad...</div>';

        try {
            const res = await fetch(`/api/neumaticos/estado-actual/${encodeURIComponent(placa)}`);
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Error al obtener estado');

            const llantas = data.posiciones || [];
            const unidad = data.unidad || {};
            const lastInsp = data.ultima_inspeccion || {};

            if (llantas.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-4">
                        <div class="badge bg-secondary mb-2">${placa}</div>
                        <p class="text-muted small mb-3">No se encontraron inspecciones de neumáticos registradas para esta placa.</p>
                        <button class="btn btn-primary btn-sm rounded-pill px-3 fw-bold" onclick="window.rotAbrirInspeccionNeumaticosWrapper('${placa}', '', 0)">
                            <i class="bi bi-plus-lg me-1"></i> Crear Primera Inspección
                        </button>
                    </div>
                `;
                return;
            }

            // Renderizar datos de la unidad y visor interactivo
            let cardsHtml = llantas.map(l => {
                const prom = parseFloat(l.remanente_promedio || 0);
                const color = prom > 6 ? '#16a34a' : (prom > 4 ? '#d97706' : '#dc2626');
                const badgeClass = prom > 6 ? 'bg-success' : (prom > 4 ? 'bg-warning text-dark' : 'bg-danger');
                return `
                    <div class="col-6 col-sm-4 col-md-3">
                        <div class="p-2 rounded-3 border bg-light text-center h-100" style="border-left: 4px solid ${color} !important;">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="badge bg-dark rounded-pill px-2" style="font-size:0.65rem;">Pos ${l.posicion}</span>
                                <span class="badge ${badgeClass}" style="font-size:0.65rem;">${prom} mm</span>
                            </div>
                            <div class="fw-bold text-dark text-truncate small">${l.marca}</div>
                            <div class="text-muted small" style="font-size:0.68rem;">${l.modelo} • ${l.medida}</div>
                            <div class="small fw-semibold mt-1 text-primary" style="font-size:0.7rem;">${l.presion_actual} PSI</div>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-3 bg-light p-2 rounded-3 border">
                    <div>
                        <span class="badge bg-primary px-3 py-1 rounded-pill fw-bold">${placa}</span>
                        <span class="text-muted small ms-2">${unidad.marca || ''} ${unidad.modelo_uts || ''} (${unidad.tipo || 'Unidad'})</span>
                    </div>
                    <div class="text-muted small">
                        <i class="bi bi-calendar3 me-1"></i> Última: <b>${(lastInsp.fecha_inspeccion||'').split('T')[0]}</b>
                    </div>
                </div>
                <div class="row g-2 overflow-auto" style="max-height: 260px;">
                    ${cardsHtml}
                </div>
                <div class="mt-3 text-end">
                    <button class="btn btn-outline-primary btn-sm rounded-pill px-3 fw-bold" onclick="window.rotAbrirInspeccionNeumaticosWrapper('${placa}', '', ${lastInsp.km_vehiculo||0})">
                        <i class="bi bi-plus-lg me-1"></i> Nueva Inspección para ${placa}
                    </button>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="text-center py-4 text-danger small"><i class="bi bi-exclamation-triangle"></i> Error: ${e.message}</div>`;
        }
    };

    window.neuVerDetalleModal = async function(idInsp) {
        try {
            const res = await fetch(`/api/neumaticos/inspecciones/${encodeURIComponent(idInsp)}`);
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Error cargando detalle');

            const insp = data.data;
            const detalles = insp.detalles || [];

            let rows = detalles.map(d => {
                const prom = parseFloat(d.remanente_promedio || 0);
                const badge = prom <= 4 ? 'bg-danger' : (prom <= 6 ? 'bg-warning text-dark' : 'bg-success');
                return `
                    <tr>
                        <td class="ps-3"><span class="badge bg-primary rounded-pill px-2">${d.posicion}</span></td>
                        <td class="fw-bold">${d.marca}</td>
                        <td>${d.medida}</td>
                        <td>${d.modelo}</td>
                        <td class="text-center">${d.r1}</td>
                        <td class="text-center">${d.r2}</td>
                        <td class="text-center">${d.r3}</td>
                        <td class="text-center"><span class="badge ${badge} px-2 py-1">${prom} mm</span></td>
                        <td class="text-center">${d.presion_actual} PSI</td>
                        <td><span class="badge bg-secondary bg-opacity-10 text-secondary">${d.estado}</span></td>
                        <td><span class="badge bg-info bg-opacity-10 text-info">${d.accion}</span></td>
                        <td class="small text-muted">${d.observaciones || '---'}</td>
                    </tr>
                `;
            }).join('');

            let mEl = document.getElementById('modalVerDetalleNeumaticos');
            if (!mEl) {
                const div = document.createElement('div');
                div.innerHTML = `
                    <div class="modal fade" id="modalVerDetalleNeumaticos" tabindex="-1" aria-hidden="true" style="z-index: 2050 !important;">
                        <div class="modal-dialog modal-lg modal-fullscreen-md-down modal-dialog-centered modal-dialog-scrollable" style="z-index: 2051;">
                            <div class="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                                <div class="modal-header border-bottom bg-light px-4 py-3">
                                    <h6 class="modal-title fw-bold text-dark d-flex align-items-center gap-2 m-0" id="mvd-title">Detalle de Inspección</h6>
                                    <button type="button" class="btn-close shadow-none" data-bs-dismiss="modal"></button>
                                </div>
                                <div class="modal-body p-4" id="mvd-body"></div>
                                <div class="modal-footer border-top bg-light px-4 py-3">
                                    <button type="button" class="btn btn-secondary rounded-pill px-4" data-bs-dismiss="modal">Cerrar</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(div);
                mEl = document.getElementById('modalVerDetalleNeumaticos');
            }

            document.getElementById('mvd-title').innerHTML = `<i class="bi bi-disc-fill text-primary"></i> Inspección: <span class="text-primary">${insp.id_inspeccion}</span> — <span class="badge bg-dark">${insp.placa}</span>`;
            document.getElementById('mvd-body').innerHTML = `
                <div class="row g-2 mb-3 p-3 bg-light rounded-3 border">
                    <div class="col-md-3"><strong>Fecha:</strong> ${(insp.fecha_inspeccion||'').split('T')[0]}</div>
                    <div class="col-md-3"><strong>KM:</strong> ${Number(insp.km_vehiculo||0).toLocaleString()} KM</div>
                    <div class="col-md-3"><strong>Días Prop.:</strong> ${insp.dias_propuestos||30}</div>
                    <div class="col-md-3"><strong>Próxima:</strong> ${(insp.fecha_proxima||'').split('T')[0]}</div>
                    ${insp.observaciones ? `<div class="col-12 mt-2"><strong>Obs:</strong> ${insp.observaciones}</div>` : ''}
                </div>
                <div class="table-responsive">
                    <table class="table table-hover table-sm align-middle mb-0" style="font-size:0.78rem;">
                        <thead class="table-light text-muted fw-bold">
                            <tr>
                                <th class="ps-3">Pos</th><th>Marca</th><th>Medida</th><th>Modelo</th>
                                <th class="text-center">R1</th><th class="text-center">R2</th><th class="text-center">R3</th>
                                <th class="text-center">Prom</th><th class="text-center">Presión</th><th>Estado</th><th>Acción</th><th>Obs</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;

            new bootstrap.Modal(mEl).show();
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    };

    window.abrirModalInspeccionNeumaticos = function(placa, idOT, km) {
        if (typeof window.rotAbrirInspeccionNeumaticos === 'function') {
            window.rotAbrirInspeccionNeumaticos(placa, idOT, km);
        } else {
            const script = document.createElement('script');
            script.src = '/modulos/mantenimiento/neumaticos/modal_inspeccion.js?v=' + Date.now();
            script.onload = function() {
                if (typeof window.rotAbrirInspeccionNeumaticos === 'function') {
                    window.rotAbrirInspeccionNeumaticos(placa, idOT, km);
                }
            };
            document.body.appendChild(script);
        }
    };
    window.rotAbrirInspeccionNeumaticosWrapper = window.abrirModalInspeccionNeumaticos;

    window.neuAnalisisNuevaInspeccion = function() {
        const placa = prompt("Ingresa la placa del vehículo a inspeccionar:");
        if (placa && placa.trim()) {
            window.abrirModalInspeccionNeumaticos(placa.trim().toUpperCase(), '', 0);
        }
    };

    window.neuExportarCSV = function() {
        if (!window._neuDataAnalisis || !window._neuDataAnalisis.inspecciones) return;
        const items = window._neuDataAnalisis.inspecciones;
        let csv = 'ID Inspeccion,Fecha,Placa,Dueno,KM,Total Llantas,Criticas,Proxima Fecha\n';
        items.forEach(i => {
            csv += `"${i.id_inspeccion}","${(i.fecha_inspeccion||'').split('T')[0]}","${i.placa}","${i.dueno||''}","${i.km_vehiculo||0}","${i.total_llantas||0}","${i.total_criticas||0}","${(i.fecha_proxima||'').split('T')[0]}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inspecciones_neumaticos_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    // Auto-arranque al cargar vista
    window.neuAnalisisCargar();
})();
