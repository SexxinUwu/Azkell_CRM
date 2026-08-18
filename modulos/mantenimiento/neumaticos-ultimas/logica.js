/**
 * logica.js — Últimas Inspecciones y Requerimiento de Llantas
 * ERP Azkell Fleet
 */

(function() {
    window._neuDataUltimas = [];
    window._neuDataRequerimientos = [];
    window._neuTabActiva = 'ultimas'; // 'ultimas' | 'requerimientos'
    window._neuFiltroMotora = 'Todos'; // 'Todos' | 'Motora' | 'No Motora'

    window.neuUltimasCargar = async function() {
        const tbody = document.getElementById('neu-tbody-ultimas');
        if (tbody) tbody.innerHTML = '<tr><td colspan="16" class="text-center text-muted py-5"><div class="spinner-border spinner-border-sm text-secondary"></div> Cargando datos...</td></tr>';

        try {
            const [resUlt, resReq] = await Promise.all([
                fetch('/api/neumaticos/ultimas'),
                fetch('/api/neumaticos/requerimientos')
            ]);
            const dataUlt = await resUlt.json();
            const dataReq = await resReq.json();

            window._neuDataUltimas = (dataUlt.ok && Array.isArray(dataUlt.data)) ? dataUlt.data : [];
            window._neuDataRequerimientos = (dataReq.ok && Array.isArray(dataReq.data)) ? dataReq.data : [];

            // Actualizar badge de requerimientos
            const badgeReq = document.getElementById('badge-req-count');
            if (badgeReq) badgeReq.innerText = window._neuDataRequerimientos.length;

            // Extraer lista única de empresas/dueños para el selector
            window._neuPoblarSelectEmpresas();

            // Renderizar la pestaña actual
            window.neuFiltrarUltimas();

        } catch (e) {
            console.error("Error en neuUltimasCargar:", e);
            if (tbody) tbody.innerHTML = `<tr><td colspan="16" class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle"></i> Error al cargar datos: ${e.message}</td></tr>`;
        }
    };

    window._neuPoblarSelectEmpresas = function() {
        const sel = document.getElementById('neu-sel-empresa-filtro');
        if (!sel) return;

        const setEmpresas = new Set();
        (window._neuDataUltimas || []).forEach(it => {
            if (it.dueno && it.dueno.trim()) setEmpresas.add(it.dueno.trim());
        });
        (window._neuDataRequerimientos || []).forEach(it => {
            if (it.dueno && it.dueno.trim()) setEmpresas.add(it.dueno.trim());
        });

        const valActual = sel.value || 'Todos';
        let html = '<option value="Todos">Todas las Empresas</option>';
        setEmpresas.forEach(emp => {
            html += `<option value="${emp}">${emp}</option>`;
        });
        sel.innerHTML = html;
        sel.value = valActual;
    };

    window.neuCambiarTab = function(tab) {
        window._neuTabActiva = tab;

        const btnUlt = document.getElementById('tab-btn-ultimas');
        const btnReq = document.getElementById('tab-btn-requerimientos');
        const motoraGroup = document.getElementById('neu-filtro-motora-group');
        const titulo = document.getElementById('neu-ultimas-titulo');

        if (tab === 'ultimas') {
            if (btnUlt) { btnUlt.className = 'nav-link active rounded-pill px-4 py-1 fw-bold small'; }
            if (btnReq) { btnReq.className = 'nav-link rounded-pill px-4 py-1 fw-bold small text-danger'; }
            if (motoraGroup) motoraGroup.classList.add('d-none');
            if (titulo) titulo.innerText = 'Últimas Inspecciones de Neumáticos';
        } else {
            if (btnUlt) { btnUlt.className = 'nav-link rounded-pill px-4 py-1 fw-bold small'; }
            if (btnReq) { btnReq.className = 'nav-link active rounded-pill px-4 py-1 fw-bold small bg-danger text-white'; }
            if (motoraGroup) motoraGroup.classList.remove('d-none');
            if (titulo) titulo.innerText = 'Requerimiento de Llantas para Recambio (≤ 4.0 mm)';
        }

        window.neuFiltrarUltimas();
    };

    window.neuSetFiltroMotora = function(tipo) {
        window._neuFiltroMotora = tipo;
        ['todos', 'motora', 'nomotora'].forEach(k => {
            const btn = document.getElementById(`btn-filtro-${k}`);
            if (btn) btn.className = 'btn btn-light px-3 fw-bold';
        });
        const key = tipo === 'Todos' ? 'todos' : (tipo === 'Motora' ? 'motora' : 'nomotora');
        const activeBtn = document.getElementById(`btn-filtro-${key}`);
        if (activeBtn) activeBtn.className = 'btn btn-primary active text-white px-3 fw-bold';

        window.neuFiltrarUltimas();
    };

    window.neuFiltrarUltimas = function() {
        const query = (document.getElementById('neu-input-busqueda-rapida')?.value || '').toLowerCase().trim();
        const empresa = (document.getElementById('neu-sel-empresa-filtro')?.value || 'Todos');

        let baseList = window._neuTabActiva === 'ultimas' ? window._neuDataUltimas : window._neuDataRequerimientos;

        const filtradas = baseList.filter(row => {
            // Filtro por Empresa
            if (empresa !== 'Todos' && row.dueno !== empresa) return false;

            // Filtro Motora / No Motora en pestaña de Requerimientos
            if (window._neuTabActiva === 'requerimientos' && window._neuFiltroMotora !== 'Todos') {
                const esMotora = row.motora === 'SI' || row.motora === '1' || (row.tipo_unidad || '').toLowerCase().includes('tracto') || (row.tipo_unidad || '').toLowerCase().includes('camion');
                if (window._neuFiltroMotora === 'Motora' && !esMotora) return false;
                if (window._neuFiltroMotora === 'No Motora' && esMotora) return false;
            }

            // Filtro por texto
            if (query) {
                const placa = (row.placa || '').toLowerCase();
                const pos = String(row.posicion || '').toLowerCase();
                const marca = (row.marca || '').toLowerCase();
                const modelo = (row.modelo || '').toLowerCase();
                const medida = (row.medida || '').toLowerCase();
                const obs = (row.observaciones || '').toLowerCase();
                const match = placa.includes(query) || pos.includes(query) || marca.includes(query) || modelo.includes(query) || medida.includes(query) || obs.includes(query);
                if (!match) return false;
            }

            return true;
        });

        window.neuRenderTabla(filtradas);
    };

    window.neuRenderTabla = function(items) {
        const tbody = document.getElementById('neu-tbody-ultimas');
        const footerCount = document.getElementById('neu-footer-registros-count');
        if (footerCount) footerCount.innerText = items.length;
        if (!tbody) return;

        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="25" class="text-center text-muted py-5">No se encontraron registros que coincidan con los filtros aplicados.</td></tr>';
            return;
        }

        // Agrupar ítems por Placa para crear encabezados separados (Estilo AppSheet)
        const gruposPorPlaca = new Map();
        items.forEach(l => {
            const pl = (l.placa || 'SIN_PLACA').toUpperCase().trim();
            if (!gruposPorPlaca.has(pl)) gruposPorPlaca.set(pl, []);
            gruposPorPlaca.get(pl).push(l);
        });

        let html = '';

        gruposPorPlaca.forEach((grupo, placa) => {
            const primerItem = grupo[0] || {};
            const fechaFmt = String(primerItem.fecha_inspeccion || '').split('T')[0];

            // Fila Encabezado de Agrupación por Placa estilo AppSheet
            html += `
                <tr style="background:#f1f5f9; border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1;">
                    <td colspan="25" class="py-2 ps-3 pe-3 bg-light">
                        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge bg-dark text-white font-monospace fs-6 px-3 py-1 shadow-2xs" style="cursor:pointer; letter-spacing:0.5px;" onclick="window.rotAbrirInspeccionNeumaticosWrapper('${placa}', '', ${primerItem.km||0})" title="Hacer click para registrar nueva inspección de esta placa">
                                    <i class="bi bi-truck me-1"></i>${placa}
                                </span>
                                <span class="text-dark small fw-bold">
                                    ${primerItem.dueno || 'Sin empresa'} 
                                    <span class="text-muted fw-normal">(${primerItem.marca_unidad || ''} ${primerItem.tipo_unidad || ''})</span>
                                </span>
                            </div>
                            <div class="text-secondary small">
                                <span><i class="bi bi-calendar3 me-1"></i>Última Inspección: <strong class="text-dark">${fechaFmt}</strong></span>
                                <span class="mx-2">·</span>
                                <span><i class="bi bi-speedometer2 me-1"></i>KM: <strong class="text-dark">${Number(primerItem.km||0).toLocaleString()}</strong></span>
                                <span class="mx-2">·</span>
                                <span><i class="bi bi-disc me-1"></i>Posiciones: <strong class="text-primary">${grupo.length} llantas</strong></span>
                            </div>
                        </div>
                    </td>
                </tr>
            `;

            // Filas de Posiciones de Neumáticos para la Placa
            grupo.forEach(l => {
                const f = String(l.fecha_inspeccion || '').split('T')[0];
                const prom = parseFloat(l.remanente_promedio || 0);
                
                let estadoLlant = '🟢 Óptima';
                let badgeClass = 'bg-success bg-opacity-10 text-success border border-success border-opacity-25';
                if (prom <= 4.0) {
                    estadoLlant = '🔴 Crítica (≤4mm)';
                    badgeClass = 'bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 fw-bold';
                } else if (prom <= 6.0) {
                    estadoLlant = '🟡 Alerta (4-6mm)';
                    badgeClass = 'bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25';
                }

                const renderFotoCell = (foto, num) => {
                    if (!foto) return '<span class="text-muted small">-</span>';
                    return `<button type="button" class="btn btn-xs btn-outline-primary py-0 px-1 rounded-pill" onclick="window.neuVerFotoModal('${foto}')" title="Ver Foto ${num}"><i class="bi bi-image"></i> Foto ${num}</button>`;
                };

                html += `
                    <tr>
                        <td class="ps-3 text-muted small fw-semibold">${l.id || l.id_inspeccion || '---'}</td>
                        <td class="text-muted small">${f}</td>
                        <td>
                            <span class="badge bg-secondary bg-opacity-10 text-dark fw-bold px-2 py-1">${l.placa}</span>
                        </td>
                        <td class="text-center"><span class="badge ${badgeClass} px-2 py-1">${estadoLlant}</span></td>
                        <td class="small fw-semibold">${Number(l.km || 0).toLocaleString()}</td>
                        <td class="text-center"><span class="badge bg-primary rounded-pill px-2">${l.posicion}</span></td>
                        <td class="small fw-semibold text-truncate" style="max-width:120px;" title="${l.dueno||''}">${l.dueno || '---'}</td>
                        <td class="small text-truncate" style="max-width:110px;" title="${l.marca_unidad||''}">${l.marca_unidad || '---'}</td>
                        <td class="small text-truncate" style="max-width:110px;" title="${l.tipo_unidad||''}">${l.tipo_unidad || '---'}</td>
                        <td class="small fw-bold">${l.marca || '---'}</td>
                        <td class="small">${l.medida || '---'}</td>
                        <td class="small"><span class="badge bg-light text-dark border">${l.modelo || '---'}</span></td>
                        <td class="text-center fw-semibold">${l.r1}</td>
                        <td class="text-center fw-semibold">${l.r2}</td>
                        <td class="text-center fw-semibold">${l.r3}</td>
                        <td class="text-center text-muted small">${l.r4 || 0}</td>
                        <td class="text-center small text-muted">${l.presion_ant || 0}</td>
                        <td class="text-center small fw-bold">${l.presion_actual || 0} PSI</td>
                        <td><span class="badge bg-secondary bg-opacity-10 text-secondary">${l.estado || 'NUEVA'}</span></td>
                        <td><span class="badge bg-info bg-opacity-10 text-info">${l.accion || 'Inspeccion'}</span></td>
                        <td class="text-truncate text-muted small" style="max-width:140px;" title="${l.observaciones || ''}">${l.observaciones || 'Ninguna'}</td>
                        <td class="text-center"><span class="badge ${l.rot !== 'NO' ? 'bg-warning text-dark' : 'bg-light text-muted border'}">${l.rot || 'NO'}</span></td>
                        <td class="text-center">${renderFotoCell(l.foto1, 1)}</td>
                        <td class="text-center">${renderFotoCell(l.foto2, 2)}</td>
                        <td class="text-center pe-3">${renderFotoCell(l.foto3, 3)}</td>
                    </tr>
                `;
            });
        });

        tbody.innerHTML = html;
    };

    window.neuVerFotoModal = function(src) {
        let m = document.getElementById('modalPreviewFotoNeu');
        if (!m) {
            const div = document.createElement('div');
            div.id = 'modalPreviewFotoNeu';
            div.className = 'modal fade';
            div.tabIndex = -1;
            div.style.zIndex = '2100';
            div.innerHTML = `
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content rounded-4 border-0 shadow-lg overflow-hidden">
                        <div class="modal-header bg-dark text-white py-2 px-3">
                            <h6 class="m-0 fw-bold"><i class="bi bi-camera me-2"></i>Evidencia Fotográfica de la Llanta</h6>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-0 text-center bg-black d-flex align-items-center justify-content-center" style="min-height:350px;">
                            <img id="imgPreviewNeu" src="" class="img-fluid" style="max-height:75vh; object-fit:contain;" alt="Foto Llanta">
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(div);
            m = div;
        }
        document.getElementById('imgPreviewNeu').src = src;
        const bsModal = bootstrap.Modal.getInstance(m) || new bootstrap.Modal(m);
        bsModal.show();
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

    window.neuUltimasNuevaInspeccion = function() {
        const placa = prompt("Ingresa la placa de la unidad:");
        if (placa && placa.trim()) {
            window.abrirModalInspeccionNeumaticos(placa.trim().toUpperCase(), '', 0);
        }
    };

    window.neuUltimasExportarCSV = function() {
        const query = (document.getElementById('neu-input-busqueda-rapida')?.value || '').toLowerCase().trim();
        const empresa = (document.getElementById('neu-sel-empresa-filtro')?.value || 'Todos');
        let baseList = window._neuTabActiva === 'ultimas' ? window._neuDataUltimas : window._neuDataRequerimientos;

        const filtradas = baseList.filter(row => {
            if (empresa !== 'Todos' && row.dueno !== empresa) return false;
            return true;
        });

        // Exact 25 columns in header
        let csv = 'ID,F. INSPECCION,PLACA,ESTADO LLANT,KM,LLANTA,DUEÑO,MARCA (UNI),UNIDAD,MARCA (LLANTA),MEDIDA,MODELO,R1,R2,R3,R4,PRESION DE AIRE ANT,PRESION DE AIRE ACTUAL,ESTADO,ACCION,OBS,ROT,FOTO1,FOTO2,FOTO3\n';
        
        filtradas.forEach(l => {
            const prom = parseFloat(l.remanente_promedio || 0);
            const estLlant = prom <= 4.0 ? 'CRITICA' : (prom <= 6.0 ? 'ALERTA' : 'OPTIMA');
            csv += `"${l.id || l.id_inspeccion || ''}","${(l.fecha_inspeccion||'').split('T')[0]}","${l.placa}","${estLlant}","${l.km||0}","${l.posicion}","${l.dueno||''}","${l.marca_unidad||''}","${l.tipo_unidad||''}","${l.marca||''}","${l.medida||''}","${l.modelo||''}","${l.r1||0}","${l.r2||0}","${l.r3||0}","${l.r4||0}","${l.presion_ant||0}","${l.presion_actual||0}","${l.estado||'NUEVA'}","${l.accion||'Inspeccion'}","${(l.observaciones||'').replace(/"/g, '""')}","${l.rot||'NO'}","${l.foto1 ? 'SI' : 'NO'}","${l.foto2 ? 'SI' : 'NO'}","${l.foto3 ? 'SI' : 'NO'}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `historial_inspecciones_neumaticos_${window._neuTabActiva}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    // Auto-arranque al cargar
    window.neuUltimasCargar();
})();
