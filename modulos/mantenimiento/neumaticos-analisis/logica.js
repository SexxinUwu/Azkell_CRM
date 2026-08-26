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

            // 1. Render KPIs con casteo numérico estricto
            const r = data.resumen || {};
            const total = Number(r.total_inspecciones || 0);
            const vig = Number(r.vigentes || 0);
            const novig = Number(r.no_vigentes || 0);
            const crit = Number(r.llantas_criticas || 0);
            const totalUnidadesEnUso = Number(r.unidades_en_uso || 178);
            
            let sinInsp = Number(r.sin_inspeccion || 0);
            if (sinInsp < 0 || (vig + novig + sinInsp) !== totalUnidadesEnUso) {
                sinInsp = Math.max(0, totalUnidadesEnUso - (vig + novig));
            }

            const porcVig = totalUnidadesEnUso > 0 ? Math.round((vig / totalUnidadesEnUso) * 100) : 0;
            const porcNoVig = totalUnidadesEnUso > 0 ? Math.round((novig / totalUnidadesEnUso) * 100) : 0;
            const porcSinInsp = Math.max(0, 100 - porcVig - porcNoVig);

            const kpiTotal = document.getElementById('kpi-neu-total-insp');
            if (kpiTotal) kpiTotal.innerText = total;
            const usoEl = document.getElementById('kpi-neu-unidades-uso');
            if (usoEl) usoEl.innerText = totalUnidadesEnUso.toLocaleString();

            const kpiVig = document.getElementById('kpi-neu-vigentes');
            if (kpiVig) kpiVig.innerText = vig;
            
            const porcEl = document.getElementById('kpi-neu-porc-vigente');
            if (porcEl) porcEl.innerText = `${vig} de ${totalUnidadesEnUso} unidades al día (${porcVig}%)`;

            const kpiCrit = document.getElementById('kpi-neu-criticas');
            if (kpiCrit) kpiCrit.innerText = crit;
            const kpiNovig = document.getElementById('kpi-neu-vencidas');
            if (kpiNovig) kpiNovig.innerText = novig;

            const lblVig = document.getElementById('lbl-vigentes-cnt');
            if (lblVig) lblVig.innerText = `${vig} (${porcVig}%)`;
            const lblNoVig = document.getElementById('lbl-novigentes-cnt');
            if (lblNoVig) lblNoVig.innerText = `${novig} (${porcNoVig}%)`;
            const lblSinInsp = document.getElementById('lbl-sininsp-cnt');
            if (lblSinInsp) lblSinInsp.innerText = `${sinInsp} (${porcSinInsp}%)`;

            // 2. Render Chart Vigencia Donut con 3 segmentos (100% de la flota)
            if (document.getElementById('chartNeuVigencia')) {
                window.neuRenderChartVigencia(vig, novig, sinInsp);
            }

            // 3. Render Tabla
            if (document.getElementById('neu-tbody-inspecciones')) {
                window.neuFiltrarTablaInsp();
            }

        } catch (e) {
            console.error("Error en neuAnalisisCargar:", e);
            const tbody = document.getElementById('neu-tbody-inspecciones');
            if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle"></i> Error al cargar datos: ${e.message}</td></tr>`;
        }
    };

    window.neuRenderChartVigencia = function(vig, novig, sinInsp) {
        const canvas = document.getElementById('chartNeuVigencia');
        if (!canvas) return;

        if (window._neuChartVigencia) {
            window._neuChartVigencia.destroy();
            window._neuChartVigencia = null;
        }

        const ChartConstructor = window.Chart || (typeof Chart !== 'undefined' ? Chart : null);
        if (!ChartConstructor) return;

        const sInsp = sinInsp || 0;
        const total = vig + novig + sInsp;
        const dataVals = total === 0 ? [1, 0, 0] : [vig, novig, sInsp];
        const bgColors = total === 0 ? ['#e2e8f0', '#cbd5e1', '#94a3b8'] : ['#22c55e', '#ef4444', '#94a3b8'];

        window._neuChartVigencia = new ChartConstructor(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Vigente', 'No Vigente', 'Sin Inspección'],
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
                    datalabels: false,
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
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">No se encontraron inspecciones o vehículos en el filtro seleccionado.</td></tr>';
            return;
        }

        tbody.innerHTML = lista.map(i => {
            const idInsp = i.id_inspeccion || '<span class="badge bg-light text-muted border">SIN REGISTRO</span>';
            const f = i.fecha_inspeccion ? String(i.fecha_inspeccion).split('T')[0] : '---';
            const fProx = i.fecha_proxima ? String(i.fecha_proxima).split('T')[0] : '---';
            const dias = i.dias_restantes !== null ? parseInt(i.dias_restantes, 10) : null;
            
            let vigBadge = '';
            let btnAccion = '';

            if (!i.fecha_inspeccion) {
                vigBadge = `<span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 px-2.5 py-1 rounded-pill small"><i class="bi bi-circle-fill me-1"></i>Sin Inspección</span>`;
                btnAccion = `
                    <button class="btn btn-primary btn-sm py-1 px-3 rounded-pill fw-bold" style="font-size:0.72rem;" onclick="window.rotAbrirInspeccionNeumaticosWrapper('${i.placa}')" title="Crear primera inspección para ${i.placa}">
                        <i class="bi bi-plus-lg me-1"></i>Inspeccionar
                    </button>
                `;
            } else if (dias > 5) {
                vigBadge = `<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2.5 py-1 rounded-pill small"><i class="bi bi-check-circle-fill me-1"></i>Vigente (+${dias}d)</span>`;
                btnAccion = `
                    <button class="btn btn-outline-primary btn-sm py-1 px-3 rounded-pill fw-bold" style="font-size:0.72rem;" onclick="window.neuVerDetalleModal('${i.id_inspeccion}')">
                        <i class="bi bi-eye-fill me-1"></i>Ver
                    </button>
                `;
            } else if (dias >= 0) {
                vigBadge = `<span class="badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25 px-2.5 py-1 rounded-pill small"><i class="bi bi-clock-history me-1"></i>Por Vencer (${dias}d)</span>`;
                btnAccion = `
                    <button class="btn btn-outline-primary btn-sm py-1 px-3 rounded-pill fw-bold" style="font-size:0.72rem;" onclick="window.neuVerDetalleModal('${i.id_inspeccion}')">
                        <i class="bi bi-eye-fill me-1"></i>Ver
                    </button>
                `;
            } else {
                vigBadge = `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-2.5 py-1 rounded-pill small"><i class="bi bi-x-circle-fill me-1"></i>Vencida (${dias}d)</span>`;
                btnAccion = `
                    <button class="btn btn-outline-primary btn-sm py-1 px-3 rounded-pill fw-bold" style="font-size:0.72rem;" onclick="window.neuVerDetalleModal('${i.id_inspeccion}')">
                        <i class="bi bi-eye-fill me-1"></i>Ver
                    </button>
                `;
            }

            const critBadge = (i.total_criticas && i.total_criticas > 0)
                ? `<span class="badge bg-danger text-white rounded-pill px-2 py-1 small">${i.total_criticas}</span>`
                : `<span class="badge bg-light text-muted border rounded-pill px-2 py-1 small">0</span>`;

            const kmFmt = i.km_vehiculo ? `${Number(i.km_vehiculo).toLocaleString()} KM` : '---';

            return `
                <tr class="${!i.fecha_inspeccion ? 'bg-light bg-opacity-50' : ''}">
                    <td class="ps-3 fw-bold text-primary">${idInsp}</td>
                    <td>${f}</td>
                    <td><span class="badge bg-dark text-white fw-bold px-2 py-1 font-monospace" style="cursor:pointer;" onclick="window.rotAbrirInspeccionNeumaticosWrapper('${i.placa}')" title="Registrar inspección de ${i.placa}">${i.placa}</span></td>
                    <td class="small text-muted">${i.dueno || '---'}</td>
                    <td>${kmFmt}</td>
                    <td class="text-center fw-bold">${i.total_llantas || 0}</td>
                    <td class="text-center">${critBadge}</td>
                    <td class="text-center small">${fProx}</td>
                    <td class="text-center">${vigBadge}</td>
                    <td class="text-center pe-3">${btnAccion}</td>
                </tr>
            `;
        }).join('');
    };

    window.neuFiltrarTablaInsp = function() {
        const query = (document.getElementById('neu-filtro-tabla-busqueda')?.value || '').toLowerCase().trim();
        const periodo = document.getElementById('neu-filtro-periodo')?.value || 'todos';

        if (!window._neuDataAnalisis || !window._neuDataAnalisis.inspecciones) return;

        const ahora = new Date();
        const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
        
        const diaSemana = ahora.getDay() || 7;
        const inicioSemana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - diaSemana + 1);

        const inicioMesActual = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        const inicioMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
        const finMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59);

        const inicioAnio = new Date(ahora.getFullYear(), 0, 1);

        const filtradas = window._neuDataAnalisis.inspecciones.filter(i => {
            const placa = (i.placa || '').toLowerCase();
            const dueno = (i.dueno || '').toLowerCase();
            const id = (i.id_inspeccion || '').toLowerCase();
            const matchQuery = !query || (placa.includes(query) || dueno.includes(query) || id.includes(query));
            if (!matchQuery) return false;

            if (periodo === 'todos') return true;
            if (periodo === 'sin_inspeccion') return !i.fecha_inspeccion;
            if (periodo === 'vigentes') return i.fecha_inspeccion && i.dias_restantes >= 0;
            if (periodo === 'vencidas') return i.fecha_inspeccion && i.dias_restantes < 0;

            const dateStr = String(i.fecha_inspeccion || '').split('T')[0];
            if (!dateStr) return false;
            const parts = dateStr.split('-');
            const fInsp = new Date(parts[0], parts[1] - 1, parts[2]);

            if (periodo === 'hoy') return fInsp >= inicioHoy;
            if (periodo === 'semana') return fInsp >= inicioSemana;
            if (periodo === 'mes_actual') return fInsp >= inicioMesActual;
            if (periodo === 'mes_anterior') return fInsp >= inicioMesAnterior && fInsp <= finMesAnterior;
            if (periodo === 'anio') return fInsp >= inicioAnio;

            return true;
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
            if (!res.ok) {
                const text = await res.text();
                let errMsg = 'Error del Servidor (HTTP ' + res.status + ')';
                try {
                    const j = JSON.parse(text);
                    if (j.error || j.mensaje) errMsg = j.error || j.mensaje;
                } catch(e) {}
                throw new Error(errMsg);
            }
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
                const isGood = prom > 6;
                const isWarning = prom > 4 && prom <= 6;
                const borderColor = isGood ? '#10b981' : (isWarning ? '#f59e0b' : '#ef4444');
                const badgeBg = isGood ? '#059669' : (isWarning ? '#d97706' : '#dc2626');

                return `
                    <div class="col-6 col-sm-4 col-md-3">
                        <div class="p-2 rounded-3 border bg-white shadow-2xs text-center h-100 position-relative" style="border-left: 5px solid ${borderColor} !important; border-color: #e2e8f0;">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="badge rounded-pill px-2 py-1 fw-bold text-white shadow-xs" style="background: #1e293b !important; color: #ffffff !important; font-size: 0.72rem; letter-spacing: 0.02em;">
                                    Pos ${l.posicion}
                                </span>
                                <span class="badge rounded-pill px-2 py-1 fw-bold text-white shadow-xs" style="background: ${badgeBg} !important; color: #ffffff !important; font-size: 0.75rem; letter-spacing: 0.02em;">
                                    ${prom} mm
                                </span>
                            </div>
                            <div class="fw-bold text-dark text-truncate small mt-1" style="font-size: 0.85rem; color: #0f172a !important;">
                                ${l.marca || '—'}
                            </div>
                            <div class="small fw-medium text-truncate" style="font-size: 0.7rem; color: #64748b !important;">
                                ${l.modelo || '—'} • ${l.medida || '—'}
                            </div>
                            <div class="small fw-bold mt-1 d-inline-block px-2 py-0.5 rounded-pill" style="font-size: 0.74rem; background: #eff6ff; color: #2563eb;">
                                <i class="bi bi-speedometer2 me-1"></i>${l.presion_actual || '0'} PSI
                            </div>
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

            let rows = '';
            if (detalles.length === 0) {
                rows = `<tr><td colspan="6" class="text-center py-5 text-muted">No se encontraron llantas registradas para esta inspección.</td></tr>`;
            } else {
                rows = detalles.map(d => {
                    const pos = String(d.posicion || '-').toUpperCase();
                    const marca = (d.marca || '---').toUpperCase();
                    const medida = (d.medida || '---').toUpperCase();
                    const modelo = (d.modelo || '').toUpperCase();
                    const estadoMat = (d.estado || 'NUEVA').toUpperCase();
                    
                    const r1 = d.r1 !== null && d.r1 !== undefined ? d.r1 : 0;
                    const r2 = d.r2 !== null && d.r2 !== undefined ? d.r2 : 0;
                    const r3 = d.r3 !== null && d.r3 !== undefined ? d.r3 : 0;
                    const r4 = d.r4 !== null && d.r4 !== undefined ? d.r4 : 0;
                    
                    const prom = parseFloat(d.remanente_promedio || 0);
                    let badgeWear = '';
                    if (prom <= 4.0) {
                        badgeWear = `<span class="badge rounded-pill px-2 py-1 fw-bold text-white shadow-2xs" style="background:#dc2626; font-size:0.75rem;"><i class="bi bi-circle-fill me-1" style="font-size:0.5rem;"></i>Crítica (≤4mm)</span>`;
                    } else if (prom <= 6.0) {
                        badgeWear = `<span class="badge rounded-pill px-2 py-1 fw-bold text-dark shadow-2xs" style="background:#fef3c7; color:#b45309 !important; border:1px solid #fde68a; font-size:0.75rem;"><i class="bi bi-circle-fill me-1" style="font-size:0.5rem;"></i>Alerta (4-6mm)</span>`;
                    } else {
                        badgeWear = `<span class="badge rounded-pill px-2 py-1 fw-bold text-dark shadow-2xs" style="background:#ecfdf5; color:#047857 !important; border:1px solid #a7f3d0; font-size:0.75rem;"><i class="bi bi-circle-fill me-1" style="font-size:0.5rem;"></i>Óptima (>6mm)</span>`;
                    }

                    const presAct = d.presion_actual ? `<b>${d.presion_actual} PSI</b>` : '---';
                    const presAnt = d.presion_ant ? `<span class="text-muted d-block" style="font-size:0.7rem;">(Ant: ${d.presion_ant})</span>` : '';
                    const obs = d.observaciones || 'Ninguna';

                    // Fotos
                    const fotos = [d.foto1, d.foto2, d.foto3].filter(f => f && typeof f === 'string' && f.trim() !== '');
                    let fotosHtml = '<span class="text-muted small">—</span>';
                    if (fotos.length > 0) {
                        fotosHtml = `
                            <div class="d-flex align-items-center justify-content-center gap-1">
                                ${fotos.map((url, idx) => `
                                    <img src="${url}" class="rounded-2 border shadow-2xs" 
                                         style="width: 28px; height: 28px; object-fit: cover; cursor: pointer;" 
                                         onclick="window.neuVerFotoModal('${url}')" 
                                         title="Ver Foto ${idx + 1}" alt="Foto ${idx + 1}">
                                `).join('')}
                            </div>
                        `;
                    }

                    return `
                        <tr>
                            <td class="text-center align-middle">
                                <span class="badge rounded-circle p-0 d-inline-flex align-items-center justify-content-center fw-bold shadow-xs text-white" 
                                      style="width: 28px; height: 28px; background: #0f172a; font-size: 0.8rem; letter-spacing: -0.02em;">
                                    ${pos}
                                </span>
                            </td>
                            <td class="align-middle">
                                <div class="fw-bold text-dark font-monospace" style="font-size:0.86rem; line-height: 1.1;">
                                    ${marca} ${modelo ? `(${modelo})` : ''}
                                </div>
                                <div class="text-muted small mt-0.5" style="font-size:0.72rem;">
                                    ${medida} • <span class="fw-semibold text-secondary">${estadoMat}</span>
                                </div>
                            </td>
                            <td class="text-center align-middle font-monospace fw-bold text-dark" style="font-size:0.86rem; letter-spacing: 0.08em;">
                                ${r1} &nbsp;${r2} &nbsp;${r3} &nbsp;<span class="text-muted">${r4}</span>
                            </td>
                            <td class="text-center align-middle" style="font-size:0.82rem;">
                                ${presAct}
                                ${presAnt}
                            </td>
                            <td class="text-center align-middle">
                                ${badgeWear}
                            </td>
                            <td class="text-center align-middle">
                                ${fotosHtml}
                            </td>
                            <td class="align-middle text-muted" style="font-size:0.78rem;">
                                ${obs}
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            // Backdrop
            let backdrop = document.getElementById('neuDetalleBackdrop');
            if (!backdrop) {
                backdrop = document.createElement('div');
                backdrop.id = 'neuDetalleBackdrop';
                backdrop.className = 'neu-drawer-backdrop';
                backdrop.onclick = window.neuCerrarDetalleModal;
                document.body.appendChild(backdrop);
            }

            // Drawer
            let drawerEl = document.getElementById('neu-drawer-visor-detalle');
            if (drawerEl) {
                drawerEl.remove();
            }

            drawerEl = document.createElement('div');
            drawerEl.id = 'neu-drawer-visor-detalle';
            drawerEl.className = 'neu-sub-drawer';
            drawerEl.style.zIndex = '2150';
            drawerEl.innerHTML = `
                <style>
                    #neu-drawer-visor-detalle .neu-detalle-table-wrap::-webkit-scrollbar {
                        display: none !important;
                        height: 0px !important;
                    }
                    #neu-drawer-visor-detalle .neu-detalle-table-wrap {
                        -ms-overflow-style: none !important;
                        scrollbar-width: none !important;
                    }
                </style>
                <!-- HEADER BENTO -->
                <div class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom bg-white" style="height: auto; min-height: 54px; flex-shrink: 0;">
                    <div class="d-flex align-items-center gap-2">
                        <button class="btn btn-sm btn-light border rounded-circle d-flex align-items-center justify-content-center me-1 shadow-2xs" 
                                onclick="window.neuCerrarDetalleModal()" 
                                title="Volver" 
                                style="width: 34px; height: 34px; color: var(--subtext);">
                            <i class="bi bi-arrow-left"></i>
                        </button>
                        <div>
                            <span class="fw-bold text-dark d-flex align-items-center gap-2" style="font-size: 1.05rem;">
                                <i class="bi bi-disc-fill text-primary"></i> Inspección: <span class="text-primary font-monospace">${insp.id_inspeccion}</span>
                                <span class="badge bg-dark rounded-pill px-2.5 py-0.5 fs-6 font-monospace">${insp.placa}</span>
                            </span>
                            <small class="text-muted d-block" style="font-size: 0.72rem;">Reporte integral de remanentes, presiones y estado de llantas</small>
                        </div>
                    </div>
                    <button class="btn btn-sm btn-light border-0 rounded-circle p-1" onclick="window.neuCerrarDetalleModal()" style="color:var(--subtext);" title="Cerrar">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>

                <!-- BODY SCROLL -->
                <div class="p-3 overflow-auto custom-scrollbar flex-grow-1" style="background: #f8fafc; padding-bottom: 30px !important;">
                    
                    <!-- BENTO 1: FICHA RESUMEN DE INSPECCIÓN -->
                    <div class="card border-0 rounded-4 p-3 mb-3 bg-white shadow-2xs" style="border: 1px solid #e2e8f0 !important;">
                        <div class="row g-2" style="font-size: 0.82rem;">
                            <div class="col-6 col-sm-3">
                                <span class="text-muted d-block small fw-bold" style="font-size: 0.7rem; text-transform:uppercase;">Fecha</span>
                                <span class="fw-bold text-dark font-monospace">${(insp.fecha_inspeccion||'').split('T')[0] || '---'}</span>
                            </div>
                            <div class="col-6 col-sm-3">
                                <span class="text-muted d-block small fw-bold" style="font-size: 0.7rem; text-transform:uppercase;">KM Tablero</span>
                                <span class="fw-bold text-dark font-monospace">${Number(insp.km_vehiculo||0).toLocaleString()} KM</span>
                            </div>
                            <div class="col-6 col-sm-3">
                                <span class="text-muted d-block small fw-bold" style="font-size: 0.7rem; text-transform:uppercase;">Días Propuestos</span>
                                <span class="fw-bold text-dark font-monospace">${insp.dias_propuestos||30} días</span>
                            </div>
                            <div class="col-6 col-sm-3">
                                <span class="text-muted d-block small fw-bold" style="font-size: 0.7rem; text-transform:uppercase;">Próxima Inspección</span>
                                <span class="fw-bold text-primary font-monospace">${(insp.fecha_proxima||'').split('T')[0] || '---'}</span>
                            </div>
                            ${insp.observaciones ? `
                                <div class="col-12 mt-2 pt-2 border-top">
                                    <span class="text-muted d-block small fw-bold" style="font-size: 0.7rem; text-transform:uppercase;">Observaciones Generales</span>
                                    <span class="text-secondary fw-medium">${insp.observaciones}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- BENTO 2: TABLA DE LLANTAS EVALUADAS (CON SCROLLBAR INVISIBLE) -->
                    <div class="card border-0 rounded-4 overflow-hidden bg-white shadow-2xs mb-3" style="border: 1px solid #e2e8f0 !important;">
                        <div class="neu-detalle-table-wrap" style="width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;">
                            <table class="table table-hover align-middle mb-0" style="min-width: 720px; width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: #ffffff; border-bottom: 1.5px solid #e2e8f0;">
                                        <th style="width: 45px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; color: #64748b; padding: 10px 12px; text-align: center;">POS</th>
                                        <th style="width: 180px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; color: #64748b; padding: 10px 12px;">MARCA / MEDIDA / MODELO</th>
                                        <th style="width: 125px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; color: #64748b; padding: 10px 12px; text-align: center;">R1 R2 R3 R4 (MM)</th>
                                        <th style="width: 105px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; color: #64748b; padding: 10px 12px; text-align: center;">PRESIÓN PSI</th>
                                        <th style="width: 125px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; color: #64748b; padding: 10px 12px; text-align: center;">ESTADO</th>
                                        <th style="width: 75px; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; color: #64748b; padding: 10px 12px; text-align: center;">FOTOS</th>
                                        <th style="font-size: 0.68rem; font-weight: 800; text-transform: uppercase; color: #64748b; padding: 10px 12px;">OBSERVACIONES</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

                <!-- FOOTER FIJO -->
                <div class="bg-white border-top px-3 py-2.5 d-flex align-items-center justify-content-end" style="position: sticky; bottom: 0; z-index: 10; height: 56px; flex-shrink: 0;">
                    <button type="button" class="btn btn-sm btn-secondary rounded-pill px-4 py-1.5 fw-bold" onclick="window.neuCerrarDetalleModal()">Cerrar</button>
                </div>
            `;
            document.body.appendChild(drawerEl);

            // Apertura con aceleración por hardware
            drawerEl.style.display = 'flex';
            drawerEl.style.visibility = 'visible';
            backdrop.style.display = 'block';
            
            requestAnimationFrame(() => {
                drawerEl.classList.add('open');
                backdrop.classList.add('show');
            });

        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    };

    window.neuCerrarDetalleModal = function() {
        const drawerEl = document.getElementById('neu-drawer-visor-detalle');
        const backdrop = document.getElementById('neuDetalleBackdrop');
        if (drawerEl) {
            drawerEl.classList.remove('open');
            setTimeout(() => {
                if (!drawerEl.classList.contains('open')) {
                    drawerEl.style.visibility = 'hidden';
                    drawerEl.style.display = 'none';
                }
            }, 210);
        }
        if (backdrop) {
            backdrop.classList.remove('show');
            setTimeout(() => {
                if (!backdrop.classList.contains('show')) backdrop.style.display = 'none';
            }, 210);
        }
    };

    window.neuVerFotoModal = function(url) {
        if (!url) return;
        let modalEl = document.getElementById('modalFotoNeumaticoLightbox');
        if (!modalEl) {
            const div = document.createElement('div');
            div.innerHTML = `
                <div class="modal fade" id="modalFotoNeumaticoLightbox" tabindex="-1" style="z-index: 2200 !important;">
                    <div class="modal-dialog modal-dialog-centered modal-lg">
                        <div class="modal-content border-0 rounded-4 shadow-lg overflow-hidden bg-dark">
                            <div class="modal-header border-0 px-4 py-3 bg-dark text-white d-flex justify-content-between align-items-center">
                                <h6 class="modal-title fw-bold m-0 text-white d-flex align-items-center gap-2">
                                    <i class="bi bi-camera-fill text-primary"></i> Fotografía de Neumático
                                </h6>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body p-0 text-center bg-black d-flex align-items-center justify-content-center" style="min-height: 380px; max-height: 75vh; overflow: hidden;">
                                <img id="img-lightbox-neumatico" src="" class="img-fluid" style="max-height: 75vh; width: auto; object-fit: contain;">
                            </div>
                            <div class="modal-footer border-0 bg-dark px-4 py-2.5 d-flex justify-content-between align-items-center">
                                <a id="btn-descargar-foto-neu" href="" target="_blank" download class="btn btn-sm btn-outline-light rounded-pill px-3 fw-bold">
                                    <i class="bi bi-box-arrow-up-right me-1"></i> Abrir Original
                                </a>
                                <button type="button" class="btn btn-sm btn-secondary rounded-pill px-4" data-bs-dismiss="modal">Cerrar</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(div);
            modalEl = document.getElementById('modalFotoNeumaticoLightbox');
        }

        const img = document.getElementById('img-lightbox-neumatico');
        if (img) img.src = url;
        const btnD = document.getElementById('btn-descargar-foto-neu');
        if (btnD) btnD.href = url;

        bootstrap.Modal.getOrCreateInstance(modalEl).show();
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

    // ── GESTOR Y HELPER SHEETJS (XLSX) ──────────────────────────────────
    async function asegurarXLSX() {
        if (typeof XLSX !== 'undefined') return XLSX;
        if (typeof window.loadScript === 'function') {
            await window.loadScript('/libs/xlsx.full.min.js');
        } else {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = '/libs/xlsx.full.min.js';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        return window.XLSX;
    }

    // ── DESCARGAR PLANTILLA EXCEL OFICIAL CON 27 COLUMNAS ─────────────────
    window.neuDescargarPlantillaExcel = async function() {
        try {
            const xlsxLib = await asegurarXLSX();
            const headers = [
                "ID", "F. INSPECCION", "PLACA", "ESTADO LLANT", "KM", "LLANTA", 
                "DUEÑO", "MARCA", "UNIDAD", "Delantera o Traccion", "MARCA DE LLANTA", "MEDIDA", "MODELO", 
                "R1", "R2", "R3", "R4", "PRESION DE AIRE ANT", "PRESION DE AIRE ACTUAL", 
                "ESTADO", "ACCION", "OBS", "ROT", "R Min", "FOTO1", "FOTO2", "FOTO3"
            ];
            
            const sampleData = [
                headers,
                [3, "2024-01-02", "BEQ986", "Activa", 150000, 1, "PROPIO", "VOLVO", "TRACTO", "DELANTERA", "MAXELL", "295/80R22.5", "GAU867", 12, 13, 13, 0, 100, 100, "NUEVA", "INSPECCION", "Ninguna", "NO", 12, "", "", ""],
                [3, "2024-01-02", "BEQ986", "Activa", 150000, 2, "PROPIO", "VOLVO", "TRACTO", "DELANTERA", "MAXELL", "295/80R22.5", "GAU867", 14, 13, 13, 0, 100, 100, "NUEVA", "INSPECCION", "Ninguna", "NO", 13, "", "", ""],
                [3, "2024-01-02", "BEQ986", "Activa", 150000, 3, "PROPIO", "VOLVO", "TRACTO", "TRACCION", "JKTIRE", "295/80R22.5", "GAU867", 6, 6, 10, 0, 100, 100, "NUEVA", "INSPECCION", "Ninguna", "NO", 6, "", "", ""],
                [5, "2024-01-03", "ARW987", "Activa", 180000, 1, "PROPIO", "SCANIA", "TRACTO", "DELANTERA", "STEELMARK", "275/70R22.5", "KT512", 6, 7, 6, 0, 100, 100, "RENCAUCHADA", "INSPECCION", "Ninguna", "NO", 6, "", "", ""]
            ];

            const wb = xlsxLib.utils.book_new();
            const ws = xlsxLib.utils.aoa_to_sheet(sampleData);
            ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 3, 12) }));

            xlsxLib.utils.book_append_sheet(wb, ws, "Plantilla_Neumaticos");
            xlsxLib.writeFile(wb, "Plantilla_Inspeccion_Neumaticos_Azkell.xlsx");
        } catch(e) {
            alert("Error generando plantilla Excel: " + e.message);
        }
    };

    // ── ABRIR MODAL IMPORTACIÓN ──────────────────────────────────────────
    window._neuInspeccionesGroupedImport = [];

    window.neuAbrirModalImportar = function() {
        window._neuInspeccionesGroupedImport = [];
        const fileInput = document.getElementById('neu-file-import-excel');
        if (fileInput) fileInput.value = '';

        const previewWrap = document.getElementById('neu-import-preview-wrap');
        if (previewWrap) previewWrap.style.display = 'none';

        const btnConfirm = document.getElementById('neu-btn-confirm-import');
        if (btnConfirm) btnConfirm.disabled = true;

        const mEl = document.getElementById('modalImportarNeumaticos');
        if (mEl) bootstrap.Modal.getOrCreateInstance(mEl).show();
    };

    // ── PROCESAR ARCHIVO EXCEL/CSV SUBIDO ──────────────────────────────────
    window.neuProcesarArchivoImportar = async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        try {
            const xlsxLib = await asegurarXLSX();
            const reader = new FileReader();

            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = xlsxLib.read(data, { type: 'array', cellDates: true });

                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const rows = xlsxLib.utils.sheet_to_json(worksheet, { defval: "" });

                    if (!rows || rows.length === 0) {
                        alert("El archivo Excel no contiene filas válidas.");
                        return;
                    }

                    // Normalizar columnas y agrupar por (ID o PLACA + FECHA)
                    const grouped = {};
                    let totalLlantasParsed = 0;

                    rows.forEach((r, idx) => {
                        const getVal = (keys) => {
                            for (const k of keys) {
                                const foundKey = Object.keys(r).find(rk => rk.trim().toUpperCase() === k.toUpperCase());
                                if (foundKey && r[foundKey] !== undefined && r[foundKey] !== "") return r[foundKey];
                            }
                            return "";
                        };

                        const idRef = getVal(["ID", "ID INSPECCION", "ID_INSPECCION", "REF"]);
                        const fecha = getVal(["F. INSPECCION", "F_INSPECCION", "FECHA INSPECCION", "FECHA"]) || new Date().toISOString().split('T')[0];
                        const placa = String(getVal(["PLACA", "VEHICULO"])).trim().toUpperCase();
                        const km = parseInt(getVal(["KM", "KM TABLERO", "KM_VEHICULO"]) || 0, 10);

                        if (!placa) return;

                        const groupKey = idRef ? `ID_${idRef}` : `${placa}_${fecha}`;

                        if (!grouped[groupKey]) {
                            grouped[groupKey] = {
                                id_inspeccion: idRef ? String(idRef) : null,
                                placa: placa,
                                fecha_inspeccion: typeof fecha === 'object' && fecha instanceof Date ? fecha.toISOString().split('T')[0] : String(fecha).split('T')[0],
                                km_vehiculo: km,
                                items: []
                            };
                        }

                        const pos = String(getVal(["LLANTA", "POSICION", "POS"]) || (idx + 1)).trim().toUpperCase();
                        const tipoEje = String(getVal(["Delantera o Traccion", "DELANTERA O TRACCION", "TIPO_EJE", "EJE"])).trim();
                        const marca = String(getVal(["MARCA DE LLANTA", "MARCA_LLANTA", "MARCA"])).trim();
                        const medida = String(getVal(["MEDIDA", "TAMANO"])).trim();
                        const modelo = String(getVal(["MODELO"])).trim();
                        const r1 = parseInt(getVal(["R1", "REMANENTE 1"]) || 0, 10);
                        const r2 = parseInt(getVal(["R2", "REMANENTE 2"]) || 0, 10);
                        const r3 = parseInt(getVal(["R3", "REMANENTE 3"]) || 0, 10);
                        const r4 = parseInt(getVal(["R4", "REMANENTE 4"]) || 0, 10);
                        const pAnt = parseInt(getVal(["PRESION DE AIRE ANT", "PRESION_ANT", "PRESION ANTERIOR"]) || 100, 10);
                        const pAct = parseInt(getVal(["PRESION DE AIRE ACTUAL", "PRESION_ACTUAL", "PRESION ACTUAL"]) || 100, 10);
                        const estado = String(getVal(["ESTADO", "ESTADO_LLANTA"]) || "NUEVA").trim().toUpperCase();
                        const accion = String(getVal(["ACCION"]) || "INSPECCION").trim();
                        const obs = String(getVal(["OBS", "OBSERVACIONES"])).trim();
                        const rot = String(getVal(["ROT", "ROTACION"]) || "NO").trim();
                        const foto1 = String(getVal(["FOTO1", "FOTO 1"])).trim();
                        const foto2 = String(getVal(["FOTO2", "FOTO 2"])).trim();
                        const foto3 = String(getVal(["FOTO3", "FOTO 3"])).trim();

                        grouped[groupKey].items.push({
                            posicion: pos,
                            tipo_eje: tipoEje,
                            marca: marca,
                            medida: medida,
                            modelo: modelo,
                            r1: r1,
                            r2: r2,
                            r3: r3,
                            r4: r4,
                            presion_ant: pAnt,
                            presion_actual: pAct,
                            estado: estado,
                            accion: accion,
                            observaciones: obs,
                            rot: rot,
                            foto1: foto1,
                            foto2: foto2,
                            foto3: foto3
                        });
                        totalLlantasParsed++;
                    });

                    window._neuInspeccionesGroupedImport = Object.values(grouped);

                    if (window._neuInspeccionesGroupedImport.length === 0) {
                        alert("No se detectaron placas válidas en el Excel.");
                        return;
                    }

                    // Render Previsualización
                    const tbody = document.getElementById('neu-tbody-preview-import');
                    const countBadge = document.getElementById('neu-import-rows-count');
                    if (countBadge) countBadge.innerText = `${window._neuInspeccionesGroupedImport.length} inspecciones (${totalLlantasParsed} llantas)`;

                    let htmlPrev = '';
                    window._neuInspeccionesGroupedImport.forEach(insp => {
                        insp.items.forEach(it => {
                            htmlPrev += `
                                <tr>
                                    <td class="fw-bold font-monospace text-primary">${insp.id_inspeccion || 'Auto'}</td>
                                    <td>${insp.fecha_inspeccion}</td>
                                    <td><span class="badge bg-light text-dark border fw-bold">${insp.placa}</span></td>
                                    <td class="fw-bold text-center">${it.posicion}</td>
                                    <td>${it.marca || '—'}</td>
                                    <td>${it.medida || '—'}</td>
                                    <td>${it.r1}</td>
                                    <td>${it.r2}</td>
                                    <td>${it.r3}</td>
                                    <td>${it.presion_actual} PSI</td>
                                    <td><span class="badge bg-secondary-subtle text-dark small">${it.estado}</span></td>
                                    <td>${it.accion}</td>
                                </tr>
                            `;
                        });
                    });

                    if (tbody) tbody.innerHTML = htmlPrev;

                    const previewWrap = document.getElementById('neu-import-preview-wrap');
                    if (previewWrap) previewWrap.style.display = 'block';

                    const btnConfirm = document.getElementById('neu-btn-confirm-import');
                    if (btnConfirm) btnConfirm.disabled = false;

                } catch (errEx) {
                    alert("Error al leer el archivo Excel: " + errEx.message);
                }
            };

            reader.readAsArrayBuffer(file);
        } catch(e) {
            alert("Error: " + e.message);
        }
    };

    // ── EJECUTAR IMPORTACIÓN AL BACKEND ────────────────────────────────────
    window.neuEjecutarImportacionBackend = async function() {
        if (!window._neuInspeccionesGroupedImport || window._neuInspeccionesGroupedImport.length === 0) return;

        const btnConfirm = document.getElementById('neu-btn-confirm-import');
        if (btnConfirm) {
            btnConfirm.disabled = true;
            btnConfirm.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Importando...';
        }

        try {
            const res = await fetch('/api/neumaticos/importar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inspecciones: window._neuInspeccionesGroupedImport })
            });

            if (!res.ok) {
                const text = await res.text();
                let errMsg = 'Error del Servidor (HTTP ' + res.status + ')';
                try {
                    const j = JSON.parse(text);
                    if (j.error || j.mensaje) errMsg = j.error || j.mensaje;
                } catch(e) {
                    if (text && text.length < 200) errMsg += ': ' + text;
                }
                throw new Error(errMsg);
            }

            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Error al importar datos');

            alert(`✅ ${data.mensaje}`);

            const mEl = document.getElementById('modalImportarNeumaticos');
            if (mEl) {
                const inst = bootstrap.Modal.getInstance(mEl);
                if (inst) inst.hide();
            }

            // Recargar tabla y KPIs
            if (typeof window.neuAnalisisCargar === 'function') {
                window.neuAnalisisCargar();
            }
        } catch(e) {
            alert("❌ Error al guardar importación: " + e.message);
        } finally {
            if (btnConfirm) {
                btnConfirm.disabled = false;
                btnConfirm.innerHTML = '<i class="bi bi-cloud-upload-fill"></i> Guardar e Importar Inspecciones';
            }
        }
    };

    // ── EXPORTAR EXCEL COMPLETO CON 25 COLUMNAS ────────────────────────────
    window.neuExportarExcel = async function() {
        try {
            const xlsxLib = await asegurarXLSX();
            const res = await fetch('/api/neumaticos/exportar-datos');
            const data = await res.json();

            if (!data.ok || !data.data) throw new Error(data.error || 'No se pudieron obtener datos para exportar');
            const rows = data.data;

            if (rows.length === 0) {
                alert("No hay registros de inspecciones para exportar.");
                return;
            }

            const wb = xlsxLib.utils.book_new();
            const ws = xlsxLib.utils.json_to_sheet(rows);

            if (rows.length > 0) {
                const keys = Object.keys(rows[0]);
                ws['!cols'] = keys.map(k => ({ wch: Math.max(k.length + 3, 14) }));
            }

            xlsxLib.utils.book_append_sheet(wb, ws, "Inspecciones_Neumaticos");
            const fechaStr = new Date().toISOString().split('T')[0];
            xlsxLib.writeFile(wb, `Reporte_Inspecciones_Neumaticos_${fechaStr}.xlsx`);
        } catch(e) {
            alert("Error al exportar Excel: " + e.message);
        }
    };

    // Auto-arranque al cargar vista
    window.neuAnalisisCargar();
})();
