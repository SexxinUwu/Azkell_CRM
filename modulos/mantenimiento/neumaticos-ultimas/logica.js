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
            tbody.innerHTML = '<tr><td colspan="16" class="text-center text-muted py-5">No se encontraron registros que coincidan con los filtros aplicados.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(l => {
            const f = String(l.fecha_inspeccion || '').split('T')[0];
            const prom = parseFloat(l.remanente_promedio || 0);
            
            let colorProm = '#16a34a';
            let badgeClass = 'bg-success bg-opacity-10 text-success border border-success border-opacity-25';
            if (prom <= 4.0) {
                colorProm = '#dc2626';
                badgeClass = 'bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 fw-bold';
            } else if (prom <= 6.0) {
                colorProm = '#d97706';
                badgeClass = 'bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25';
            }

            const alertIcon = (prom <= 4.0) ? '<i class="bi bi-exclamation-triangle-fill text-danger me-1"></i>' : '';

            return `
                <tr>
                    <td class="ps-3 text-muted small">${f}</td>
                    <td>
                        <span class="badge bg-dark text-white fw-bold px-2 py-1" style="cursor:pointer;" onclick="window.rotAbrirInspeccionNeumaticosWrapper('${l.placa}', '', ${l.km||0})" title="Hacer click para nueva inspección">${l.placa}</span>
                    </td>
                    <td class="small">${Number(l.km || 0).toLocaleString()}</td>
                    <td class="text-center"><span class="badge bg-primary rounded-pill px-2">${l.posicion}</span></td>
                    <td class="small fw-semibold text-truncate" style="max-width:120px;" title="${l.marca_unidad||''}">${l.marca_unidad || '---'}</td>
                    <td class="small">${l.medida}</td>
                    <td class="small fw-bold"><span class="badge bg-light text-dark border">${l.modelo}</span></td>
                    <td class="text-center fw-semibold">${l.r1}</td>
                    <td class="text-center fw-semibold">${l.r2}</td>
                    <td class="text-center fw-semibold">${l.r3}</td>
                    <td class="text-center"><span class="badge ${badgeClass} px-2 py-1">${alertIcon}${prom} mm</span></td>
                    <td class="text-center small text-muted">${l.presion_ant || 0}</td>
                    <td class="text-center small fw-bold">${l.presion_actual || 0} PSI</td>
                    <td><span class="badge bg-secondary bg-opacity-10 text-secondary">${l.estado || 'NUEVA'}</span></td>
                    <td><span class="badge bg-info bg-opacity-10 text-info">${l.accion || 'Inspeccion'}</span></td>
                    <td class="text-truncate text-muted small pe-3" style="max-width:160px;" title="${l.observaciones || ''}">${l.observaciones || 'Ninguna'}</td>
                </tr>
            `;
        }).join('');
    };

    window.neuUltimasNuevaInspeccion = function() {
        const placa = prompt("Ingresa la placa de la unidad:");
        if (placa && placa.trim()) {
            window.rotAbrirInspeccionNeumaticosWrapper(placa.trim().toUpperCase(), '', 0);
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

        let csv = 'Fecha,Placa,Dueno,KM,Posicion,Marca Unidad,Marca Llanta,Medida,Modelo,R1,R2,R3,Promedio,Presion Ant,Presion Act,Estado,Accion,Observaciones\n';
        filtradas.forEach(l => {
            csv += `"${(l.fecha_inspeccion||'').split('T')[0]}","${l.placa}","${l.dueno||''}","${l.km||0}","${l.posicion}","${l.marca_unidad||''}","${l.marca}","${l.medida}","${l.modelo}","${l.r1}","${l.r2}","${l.r3}","${l.remanente_promedio}","${l.presion_ant||0}","${l.presion_actual||0}","${l.estado}","${l.accion}","${(l.observaciones||'').replace(/"/g, '""')}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_neumaticos_${window._neuTabActiva}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    // Auto-arranque al cargar
    window.neuUltimasCargar();
})();
