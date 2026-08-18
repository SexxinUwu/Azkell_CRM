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

            // Actualizar badges de conteo de pestañas
            const badgeUlt = document.getElementById('badge-ultimas-count');
            if (badgeUlt) badgeUlt.innerText = window._neuDataUltimas.length.toLocaleString();

            const badgeReq = document.getElementById('badge-req-count');
            if (badgeReq) badgeReq.innerText = window._neuDataRequerimientos.length.toLocaleString();

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
        const titulo = document.getElementById('neu-ultimas-titulo');

        if (tab === 'ultimas') {
            if (btnUlt) { btnUlt.className = 'neu-tab-item active'; }
            if (btnReq) { btnReq.className = 'neu-tab-item text-danger'; }
            if (titulo) titulo.innerText = 'Últimas Inspecciones de Neumáticos';
        } else {
            if (btnUlt) { btnUlt.className = 'neu-tab-item'; }
            if (btnReq) { btnReq.className = 'neu-tab-item active text-danger'; }
            if (titulo) titulo.innerText = 'Requerimiento de Llantas para Recambio (≤ 4.0 mm)';
        }

        window.neuFiltrarUltimas();
    };

    window.neuSetFiltroMotora = function(tipo) {
        window._neuFiltroMotora = tipo;
        ['todos', 'motora', 'nomotora'].forEach(k => {
            const btn = document.getElementById(`btn-filtro-${k}`);
            if (btn) btn.classList.remove('active');
        });
        const key = tipo === 'Todos' ? 'todos' : (tipo === 'Motora' ? 'motora' : 'nomotora');
        const activeBtn = document.getElementById(`btn-filtro-${key}`);
        if (activeBtn) activeBtn.classList.add('active');

        window.neuFiltrarUltimas();
    };

    window.neuFiltrarUltimas = function() {
        const query = (document.getElementById('neu-input-busqueda-rapida')?.value || '').toLowerCase().trim();
        const empresa = (document.getElementById('neu-sel-empresa-filtro')?.value || 'Todos');

        let baseList = window._neuTabActiva === 'ultimas' ? window._neuDataUltimas : window._neuDataRequerimientos;

        const filtradas = baseList.filter(row => {
            // Filtro por Empresa
            if (empresa !== 'Todos' && row.dueno !== empresa) return false;

            // Filtro Motora / No Motora (aplica SIEMPRE en ambas pestañas)
            if (window._neuFiltroMotora !== 'Todos') {
                const mStr = String(row.motora || '').toUpperCase().trim();
                const tipoStr = (row.tipo_unidad || '').toLowerCase();
                const esMotora = mStr === 'SI' || mStr === '1' || mStr === 'MOTORA' || 
                                 tipoStr.includes('tracto') || tipoStr.includes('camion') || tipoStr.includes('auto');
                
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

        // Renderizar o Biswas panel de resumen de requerimientos
        const panelResumen = document.getElementById('panel-resumen-requerimientos');
        if (window._neuTabActiva === 'requerimientos') {
            if (panelResumen) panelResumen.classList.remove('d-none');
            window.neuRenderResumenMedidas(filtradas);
        } else {
            if (panelResumen) panelResumen.classList.add('d-none');
        }

        // Si hay una medida seleccionada en el cuadro, filtrar las filas para la tabla principal
        let listaTabla = filtradas;
        if (window._neuFiltroMedidaSel && window._neuTabActiva === 'requerimientos') {
            listaTabla = filtradas.filter(row => String(row.medida || '').toUpperCase().trim() === window._neuFiltroMedidaSel.toUpperCase().trim());
        }

        window.neuRenderTabla(listaTabla);
    };

    // ── Selección Interactiva de Medida en el Cuadro Resumen ──────────
    window.neuSeleccionarMedidaFiltro = function(medida) {
        if (!medida || window._neuFiltroMedidaSel === medida) {
            window._neuFiltroMedidaSel = null; // Alternar deselección
        } else {
            window._neuFiltroMedidaSel = medida;
        }
        window.neuFiltrarUltimas();
    };

    // ── Resumen Consolidado de Requerimientos por Medida para Compras ────
    window.neuRenderResumenMedidas = function(items) {
        const tbody = document.getElementById('tbody-resumen-medidas-req');
        const subTitleEl = document.getElementById('neu-resumen-subtitulo');
        if (!tbody) return;

        if (!items || !items.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">No hay requerimientos de llantas para los filtros seleccionados.</td></tr>';
            if (subTitleEl) subTitleEl.innerText = 'Total a reposición por medida (0 Llantas requeridas)';
            window._neuResumenComprasMap = [];
            return;
        }

        const mapaMedidas = new Map();

        items.forEach(row => {
            const medida = (row.medida || 'SIN ESPECIFICAR').toUpperCase().trim();
            if (!mapaMedidas.has(medida)) {
                mapaMedidas.set(medida, { del: 0, trac: 0, arr: 0, rep: 0, total: 0 });
            }
            const obj = mapaMedidas.get(medida);
            
            const mStr = String(row.motora || '').toUpperCase().trim();
            const esMotora = mStr === 'SI' || mStr === '1' || mStr === 'MOTORA' || (row.tipo_unidad || '').toLowerCase().includes('tracto') || (row.tipo_unidad || '').toLowerCase().includes('camion');
            const posStr = String(row.posicion || '').trim().toUpperCase();

            if (posStr === 'R') {
                obj.rep++;
            } else if (esMotora) {
                if (posStr === '1' || posStr === '2') {
                    obj.del++;
                } else {
                    obj.trac++;
                }
            } else {
                obj.arr++;
            }
            obj.total++;
        });

        let html = '';
        let totDel = 0, totTrac = 0, totArr = 0, totRep = 0, totGral = 0;

        const arrayResumen = [];
        mapaMedidas.forEach((val, medida) => {
            totDel += val.del;
            totTrac += val.trac;
            totArr += val.arr;
            totRep += val.rep;
            totGral += val.total;

            arrayResumen.push({ medida, ...val });

            const isSelected = window._neuFiltroMedidaSel === medida;
            const bgClass = isSelected ? 'selected-row' : '';
            const activeBadge = isSelected ? `<span class="badge bg-primary rounded-pill ms-2" style="font-size:0.68rem;"><i class="bi bi-check-circle-fill me-1"></i>Filtrando</span>` : '';

            html += `
                <tr class="${bgClass}" style="cursor:pointer;" onclick="window.neuSeleccionarMedidaFiltro('${medida}')" title="Haz clic para filtrar por la medida ${medida}">
                    <td class="ps-3 fw-bold text-dark font-monospace text-start">${medida} ${activeBadge}</td>
                    <td class="fw-bold ${val.del > 0 ? 'text-primary' : 'text-muted'}">${val.del || 0}</td>
                    <td class="fw-bold ${val.trac > 0 ? 'text-dark' : 'text-muted'}">${val.trac || 0}</td>
                    <td class="fw-bold ${val.arr > 0 ? 'text-dark' : 'text-muted'}">${val.arr || 0}</td>
                    <td class="fw-bold ${val.rep > 0 ? 'text-dark' : 'text-muted'}">${val.rep || 0}</td>
                    <td class="fw-bold text-danger fs-6">${val.total}</td>
                </tr>
            `;
        });

        if (subTitleEl) subTitleEl.innerText = `Total a reposición por medida (${totGral} Llantas requeridas)`;

        html += `
            <tr class="footer-total-row" style="cursor:pointer;" onclick="window.neuSeleccionarMedidaFiltro(null)">
                <td class="ps-3 text-start">TOTAL GENERAL A COMPRAR</td>
                <td>${totDel}</td>
                <td>${totTrac}</td>
                <td>${totArr}</td>
                <td>${totRep}</td>
                <td class="td-grand-total">${totGral}</td>
            </tr>
        `;

        tbody.innerHTML = html;
        window._neuResumenComprasMap = arrayResumen;

        // Actualizar banner de medida activa 1:1
        const bannerEl = document.getElementById('neu-active-medida-filter-banner');
        const labelVal = document.getElementById('lbl-active-medida-val');
        if (bannerEl && labelVal) {
            if (window._neuFiltroMedidaSel) {
                bannerEl.classList.remove('d-none');
                labelVal.innerText = window._neuFiltroMedidaSel;
            } else {
                bannerEl.classList.add('d-none');
            }
        }
    };

    window.neuCopiarPedidoCompras = function() {
        if (!window._neuResumenComprasMap || !window._neuResumenComprasMap.length) {
            alert("No hay requerimientos activos para copiar.");
            return;
        }

        let txt = `📋 *REQUERIMIENTO DE NEUMÁTICOS PARA COMPRAS* — ERP Azkell Fleet\n`;
        txt += `📅 *Fecha:* ${new Date().toLocaleDateString()}\n\n`;

        let totalGral = 0;
        window._neuResumenComprasMap.forEach(it => {
            txt += `📌 *MEDIDA: ${it.medida}*\n`;
            if (it.del > 0) txt += `  - Delanteras (Motora 1-2): ${it.del}\n`;
            if (it.trac > 0) txt += `  - Tracción (Posterior Motora): ${it.trac}\n`;
            if (it.arr > 0) txt += `  - Arrastre (Carretas/Remolque): ${it.arr}\n`;
            if (it.rep > 0) txt += `  - Repuestos: ${it.rep}\n`;
            txt += `  👉 *TOTAL MEDIDA:* ${it.total} llantas\n\n`;
            totalGral += it.total;
        });

        txt += `🔴 *TOTAL GENERAL A ADQUIRIR:* ${totalGral} llantas\n`;

        navigator.clipboard.writeText(txt).then(() => {
            if (typeof window.mostrarToast === 'function') window.mostrarToast('Resumen de compra copiado al portapapeles', 'success');
            else alert('Resumen de compra copiado al portapapeles.');
        });
    };

    window.neuRenderTabla = function(items) {
        const container = document.getElementById('neu-vehiculos-cards-container');
        if (!container) return;

        if (!items || !items.length) {
            container.innerHTML = '<div class="card border-0 rounded-4 p-5 text-center text-muted bg-white shadow-2xs">No se encontraron registros que coincidan con los filtros aplicados.</div>';
            return;
        }

        // Agrupar por Placa manteniendo el orden
        const gruposPorPlaca = new Map();
        items.forEach(l => {
            const pl = (l.placa || 'SIN_PLACA').toUpperCase().trim();
            if (!gruposPorPlaca.has(pl)) gruposPorPlaca.set(pl, []);
            gruposPorPlaca.get(pl).push(l);
        });

        let html = '';

        gruposPorPlaca.forEach((llantas, placa) => {
            const primerItem = llantas[0] || {};
            const fechaFmt = String(primerItem.fecha_inspeccion || '').split('T')[0] || '---';
            const empresa = primerItem.dueno || 'EMPRESA NO REGISTRADA';
            const marcaUni = primerItem.marca_unidad || '';
            const tipoUni = primerItem.tipo_unidad || '';
            let subUni = `${marcaUni} (${tipoUni})`.trim();
            if (!marcaUni && !tipoUni) subUni = '';

            html += `
                <div class="neu-vehicle-card">
                    <div class="neu-vehicle-header">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-black text-white fw-bold px-2.5 py-1.5 fs-6 font-monospace" style="border-radius:8px; cursor:pointer;" onclick="window.rotAbrirInspeccionNeumaticosWrapper('${placa}', '', ${primerItem.km||0})" title="Hacer clic para registrar nueva inspección de ${placa}">${placa}</span>
                            <div>
                                <div class="fw-bold text-dark fs-6" style="line-height:1.1;">${empresa}</div>
                                <small class="text-muted" style="font-size:0.75rem;">${subUni} ${subUni ? '•' : ''} Última Inspex: <b>${fechaFmt}</b></small>
                            </div>
                        </div>
                        <div>
                            <span class="badge bg-light text-dark border rounded-pill px-3 py-1.5 fw-bold" style="font-size:0.78rem;">${llantas.length} posición(es)</span>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="neu-vehicle-table">
                            <thead>
                                <tr>
                                    <th style="width: 50px;" class="text-center">POS</th>
                                    <th>MARCA / MEDIDA / MODELO</th>
                                    <th class="text-center">R1 R2 R3 R4 (MM)</th>
                                    <th class="text-center">PRESIÓN PSI</th>
                                    <th class="text-center">ESTADO</th>
                                    <th>OBSERVACIONES</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${llantas.map(det => {
                                    const pos = String(det.posicion || '-').toUpperCase();
                                    const marcaL = (det.marca || '---').toUpperCase();
                                    const medidaL = (det.medida || '---').toUpperCase();
                                    const modeloL = (det.modelo || '').toUpperCase();
                                    const estadoMat = (det.estado || 'NUEVA').toUpperCase();
                                    const r1 = det.r1 !== null ? det.r1 : '-';
                                    const r2 = det.r2 !== null ? det.r2 : '-';
                                    const r3 = det.r3 !== null ? det.r3 : '-';
                                    const r4 = det.r4 !== null ? det.r4 : '-';
                                    const remProm = det.remanente_promedio !== null ? parseFloat(det.remanente_promedio) : 10;
                                    const presAct = det.presion_actual ? `${det.presion_actual} PSI` : '---';
                                    const presAnt = det.presion_ant ? `(Ant: ${det.presion_ant})` : '';
                                    const obs = det.observaciones || 'Ninguna';

                                    let badgeEstado = '';
                                    if (det.alerta_cambio === 1 || remProm <= 4.0) {
                                        badgeEstado = `<span class="badge rounded-pill px-2.5 py-1" style="background:#ffe4e6; color:#be123c; border:1px solid #fecdd3;">● Crítica (≤4mm)</span>`;
                                    } else if (remProm <= 6.0) {
                                        badgeEstado = `<span class="badge rounded-pill px-2.5 py-1" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a;">● Alerta (4-6mm)</span>`;
                                    } else {
                                        badgeEstado = `<span class="badge rounded-pill px-2.5 py-1" style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0;">● Óptima (>6mm)</span>`;
                                    }

                                    let obsContent = obs;
                                    if (obs !== 'Ninguna' && obs.trim() !== '') {
                                        obsContent = `<span class="text-danger fw-bold"><i class="bi bi-exclamation-triangle-fill me-1"></i>${obs}</span>`;
                                    } else {
                                        obsContent = `<span class="text-muted">Ninguna</span>`;
                                    }

                                    return `
                                        <tr>
                                            <td class="text-center">
                                                <span class="rounded-circle bg-dark text-white fw-bold d-inline-flex align-items-center justify-content-center" style="width:26px;height:26px;font-size:0.75rem;">${pos}</span>
                                            </td>
                                            <td>
                                                <div class="fw-bold text-dark font-monospace" style="font-size:0.85rem;">${marcaL} ${modeloL ? '(' + modeloL + ')' : ''}</div>
                                                <div class="text-muted small" style="font-size:0.75rem;">${medidaL} • ${estadoMat}</div>
                                            </td>
                                            <td class="text-center fw-bold font-monospace fs-6 text-dark">${r1} &nbsp;${r2} &nbsp;${r3} &nbsp;${r4}</td>
                                            <td class="text-center">
                                                <div class="fw-bold text-dark">${presAct}</div>
                                                ${presAnt ? `<div class="text-muted small" style="font-size:0.7rem;">${presAnt}</div>` : ''}
                                            </td>
                                            <td class="text-center">${badgeEstado}</td>
                                            <td class="small">${obsContent}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
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
