// Semáforo único de neumáticos: crítico con menos de 3 mm (3 a 6 ámbar, más de 6 verde)
window.NEU_MM_CRITICO = window.NEU_MM_CRITICO || 3;
/**
 * logica.js — Últimas Inspecciones y Requerimiento de Llantas
 * ERP Azkell Fleet
 */

(function() {
    window._neuDataUltimas = [];
    window._neuDataRequerimientos = [];
    window._neuTabActiva = 'ultimas'; // 'ultimas' | 'requerimientos'
    window._neuFiltroMotora = 'Todos'; // 'Todos' | 'Motora' | 'No Motora'

    // ── Umbral de requerimiento (mm), editable y recordado ────────────────
    // Solo afecta a la pestaña Requerimiento; el semáforo global (NEU_MM_CRITICO) no cambia.
    window.neuUmbralReq = function() {
        let v = NaN;
        try { v = parseFloat(localStorage.getItem('fleet_neu_mm_requerimiento')); } catch (e) {}
        if (isNaN(v)) v = 3;
        return Math.min(10, Math.max(1, Math.round(v * 2) / 2));
    };
    window.neuFmtMm = function(v) {
        return String(v).replace('.', ',');
    };

    // Empresa sin puntos, espacios ni mayúsculas (los datos traen 'MARSISA S.A.C.' y el selector antes decía 'Marsisa SAC')
    window.neuNormEmpresa = function(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };

    // Tipo de llanta según la posición (igual que /app): R = Repuesto; en motora 1-2 Delantera y el resto Tracción; en no motora Arrastre
    window.neuTipoLlanta = function(row) {
        const pos = String(row.posicion || '').trim().toUpperCase();
        if (pos === 'R') return 'Repuesto';
        const mStr = String(row.motora || '').toUpperCase().trim();
        const esMotora = mStr === 'SI' || mStr === '1' || mStr === 'MOTORA' || (row.tipo_unidad || '').toLowerCase().includes('tracto') || (row.tipo_unidad || '').toLowerCase().includes('camion');
        if (!esMotora) return 'Arrastre';
        return (pos === '1' || pos === '2') ? 'Delantera' : 'Tracción';
    };

    // Filtro por columna del cuadro (Delanteras, Tracción, Arrastre, Repuestos)
    window._neuFiltroCatSel = window._neuFiltroCatSel || null;
    window.neuSeleccionarCatFiltro = function(c) {
        window._neuFiltroCatSel = window._neuFiltroCatSel === c ? null : c;
        window.neuFiltrarUltimas();
    };

    // El selector de empresa se llena con las empresas que traen los datos
    window.neuPoblarEmpresas = function() {
        const sel = document.getElementById('neu-sel-empresa-filtro');
        if (!sel) return;
        const actual = sel.value;
        const nombres = [...new Set((window._neuDataUltimas || []).map(r => String(r.dueno || '').trim()).filter(Boolean))].sort();
        sel.innerHTML = '<option value="Todos">Todas las Empresas</option>' + nombres.map(n => '<option value="' + n.replace(/"/g, '&quot;') + '">' + n + '</option>').join('');
        if (nombres.includes(actual)) sel.value = actual;
    };

    // Requiere reposición si el remanente promedio (mismo valor que 'remProm') es <= umbral.
    // Si no hay promedio, se recurre al flag guardado por el servidor (alerta_cambio, calculado con < 3).
    window.neuEsRequerimiento = function(row, umbral) {
        // Sin decimales: el remanente se redondea al entero más cercano (2,9 cuenta como 3)
        const p = (row.remanente_promedio !== null && row.remanente_promedio !== undefined && row.remanente_promedio !== '')
            ? Math.round(parseFloat(row.remanente_promedio)) : NaN;
        if (isNaN(p)) return Number(row.alerta_cambio) === 1;
        return p <= umbral;
    };

    // Recalcula la lista de requerimientos desde las últimas inspecciones (/ultimas trae todas las llantas)
    window.neuRecalcularRequerimientos = function() {
        const u = window.neuUmbralReq();
        window._neuDataRequerimientos = (window._neuDataUltimas || []).filter(r => window.neuEsRequerimiento(r, u));
        window._neuDataRequerimientos.sort((a, b) => (parseFloat(a.remanente_promedio) || 0) - (parseFloat(b.remanente_promedio) || 0));

        const badgeReq = document.getElementById('badge-req-count');
        if (badgeReq) badgeReq.innerText = window._neuDataRequerimientos.length.toLocaleString();
        const lblTab = document.getElementById('neu-tab-umbral');
        if (lblTab) lblTab.innerText = window.neuFmtMm(u);
        const inp = document.getElementById('neu-input-umbral-req');
        if (inp && document.activeElement !== inp) inp.value = u;
    };

    window.neuSetUmbralReq = function(valor) {
        let v = parseFloat(String(valor).replace(',', '.'));
        if (isNaN(v)) v = 3;
        v = Math.min(10, Math.max(1, Math.round(v * 2) / 2));
        try { localStorage.setItem('fleet_neu_mm_requerimiento', String(v)); } catch (e) {}
        const inp = document.getElementById('neu-input-umbral-req');
        if (inp) inp.value = v;
        window._neuFiltroMedidaSel = null;
        window.neuRecalcularRequerimientos();
        window._neuPoblarSelectEmpresas();
        if (window._neuTabActiva === 'requerimientos') {
            const titulo = document.getElementById('neu-ultimas-titulo');
            if (titulo) titulo.innerText = `Requerimiento de Llantas para Recambio (≤ ${window.neuFmtMm(v)} mm)`;
        }
        window.neuFiltrarUltimas();
    };

    window.neuUltimasCargar = async function() {
        const container = document.getElementById('neu-vehiculos-cards-container');
        if (container) container.innerHTML = '<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-secondary me-2"></div> Cargando inspecciones de vehículos...</div>';

        try {
            // /ultimas trae todas las llantas de la última inspección; el requerimiento se calcula aquí con el umbral elegido
            const resUlt = await fetch('/api/neumaticos/ultimas');
            if (!resUlt.ok) throw new Error('HTTP ' + resUlt.status);
            const dataUlt = await resUlt.json();

            window._neuDataUltimas = (dataUlt.ok && Array.isArray(dataUlt.data)) ? dataUlt.data : [];
            window.neuRecalcularRequerimientos();

            // Actualizar badge de conteo de la pestaña
            const badgeUlt = document.getElementById('badge-ultimas-count');
            // Cuenta vehículos (placas únicas), igual que /app; no filas de llantas
            const placasUlt = new Set((window._neuDataUltimas || []).map(r => String(r.placa || '').toUpperCase().trim()));
            if (badgeUlt) badgeUlt.innerText = placasUlt.size.toLocaleString();

            // Extraer lista única de empresas/dueños para el selector
            window._neuPoblarSelectEmpresas();

            // Renderizar la pestaña actual
            window.neuFiltrarUltimas();

        } catch (e) {
            console.error("Error en neuUltimasCargar:", e);
            if (container) container.innerHTML = `<div class="alert alert-danger rounded-4 m-3 p-4 text-center"><i class="bi bi-exclamation-triangle-fill me-2"></i> Error al cargar datos: ${e.message}</div>`;
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
            if (btnUlt) { btnUlt.className = 'neu-main-tab active'; }
            if (btnReq) { btnReq.className = 'neu-main-tab tab-req'; }
            if (titulo) titulo.innerText = 'Últimas Inspecciones de Neumáticos';
        } else {
            if (btnUlt) { btnUlt.className = 'neu-main-tab'; }
            if (btnReq) { btnReq.className = 'neu-main-tab tab-req active'; }
            if (titulo) titulo.innerText = `Requerimiento de Llantas para Recambio (≤ ${window.neuFmtMm(window.neuUmbralReq())} mm)`;
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
        window.neuPoblarEmpresas();
        const query = (document.getElementById('neu-input-busqueda-rapida')?.value || '').toLowerCase().trim();
        const empresa = (document.getElementById('neu-sel-empresa-filtro')?.value || 'Todos');

        let baseList = window._neuTabActiva === 'ultimas' ? window._neuDataUltimas : window._neuDataRequerimientos;

        const filtradas = baseList.filter(row => {
            // Filtro por Empresa
            if (empresa !== 'Todos' && window.neuNormEmpresa(row.dueno) !== window.neuNormEmpresa(empresa)) return false;

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

        if (window._neuFiltroCatSel && window._neuTabActiva === 'requerimientos') {
            listaTabla = listaTabla.filter(row => window.neuTipoLlanta(row) === window._neuFiltroCatSel);
        }
        window._neuListaVisible = listaTabla;
        const btnExcel = document.getElementById('neu-btn-excel-ultimas');
        if (btnExcel) btnExcel.classList.toggle('d-none', window._neuTabActiva !== 'ultimas');
        window.neuRenderTabla(listaTabla);
    };

    // Excel de lo que se ve en Últimas Inspecciones (mismos filtros), una fila por llanta agrupada por placa
    window.neuExportarUltimasExcel = async function() {
        const lista = window._neuListaVisible || [];
        if (!lista.length) { alert('No hay inspecciones para exportar con los filtros actuales.'); return; }
        try {
            if (typeof XLSX === 'undefined') {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = '/libs/xlsx.full.min.js';
                    s.onload = resolve;
                    s.onerror = () => reject(new Error('No se pudo cargar la librería Excel'));
                    document.head.appendChild(s);
                });
            }
            const porPlaca = new Map();
            lista.forEach(l => {
                const k = String(l.placa || 'SIN_PLACA').toUpperCase().trim();
                if (!porPlaca.has(k)) porPlaca.set(k, []);
                porPlaca.get(k).push(l);
            });
            const num = v => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? '' : Number(v));
            const txt = v => (v === null || v === undefined ? '' : String(v));
            const aoa = [['Placa', 'Empresa', 'Tipo de unidad', 'Marca unidad', 'Fecha inspección', 'Posición', 'Tipo de llanta', 'Marca', 'Medida', 'Modelo',
                'R1 (mm)', 'R2 (mm)', 'R3 (mm)', 'R4 (mm)', 'Remanente promedio (mm)', 'Presión ant.', 'Presión actual', 'Estado', 'Observaciones']];
            [...porPlaca.values()].flat().forEach(l => aoa.push([
                txt(l.placa).toUpperCase(), txt(l.dueno), txt(l.tipo_unidad), txt(l.marca_unidad), txt(l.fecha_inspeccion).split('T')[0],
                txt(l.posicion), window.neuTipoLlanta(l), txt(l.marca), txt(l.medida), txt(l.modelo),
                num(l.r1), num(l.r2), num(l.r3), num(l.r4), num(l.remanente_promedio), num(l.presion_ant), num(l.presion_actual),
                txt(l.estado), txt(l.observaciones)]));
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Ultimas inspecciones');
            XLSX.writeFile(wb, 'Ultimas-inspecciones-neumaticos-' + new Date().toISOString().split('T')[0] + '.xlsx');
        } catch (e) {
            console.error('Error exportando Excel:', e);
            alert('No se pudo exportar: ' + e.message);
        }
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

        let txt = `📋 *REQUERIMIENTO DE NEUMÁTICOS PARA COMPRAS* (≤ ${window.neuFmtMm(window.neuUmbralReq())} mm) — ERP Azkell Fleet\n`;
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

    // ── Exportar el cuadro resumen (Excel / PDF) ──────────────────────────
    window._neuResumenDatosExport = function() {
        const lista = window._neuResumenComprasMap || [];
        if (!lista.length) {
            alert('No hay requerimientos activos para exportar.');
            return null;
        }
        const tot = { del: 0, trac: 0, arr: 0, rep: 0, total: 0 };
        lista.forEach(it => { tot.del += it.del; tot.trac += it.trac; tot.arr += it.arr; tot.rep += it.rep; tot.total += it.total; });
        const empSel = document.getElementById('neu-sel-empresa-filtro')?.value || 'Todos';
        const empresa = empSel !== 'Todos' ? empSel : 'Todas las empresas';
        const umbral = window.neuFmtMm(window.neuUmbralReq());
        return { lista, tot, empresa, umbral, fecha: new Date().toLocaleDateString('es-PE') };
    };

    window.neuExportarResumenExcel = async function() {
        const d = window._neuResumenDatosExport();
        if (!d) return;
        try {
            if (typeof XLSX === 'undefined') {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = '/libs/xlsx.full.min.js';
                    s.onload = resolve;
                    s.onerror = () => reject(new Error('No se pudo cargar la librería Excel'));
                    document.head.appendChild(s);
                });
            }
            const aoa = [
                ['Resumen Consolidado para Compras / Reposición'],
                ['Empresa: ' + d.empresa, 'Fecha: ' + d.fecha, 'Remanente ≤ ' + d.umbral + ' mm'],
                [],
                ['MEDIDA LLANTA', 'DELANTERAS', 'TRACCIÓN', 'ARRASTRE', 'REPUESTOS', 'TOTAL REPOSICIÓN']
            ];
            d.lista.forEach(it => aoa.push([it.medida, it.del, it.trac, it.arr, it.rep, it.total]));
            aoa.push(['TOTAL GENERAL A COMPRAR', d.tot.del, d.tot.trac, d.tot.arr, d.tot.rep, d.tot.total]);
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = [{ wch: 28 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 18 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Reposicion');
            const filasDet = [['Placa', 'Empresa', 'Tipo de unidad', 'Fecha inspección', 'Posición', 'Tipo de llanta', 'Medida', 'Marca', 'Modelo', 'R1 (mm)', 'R2 (mm)', 'R3 (mm)', 'R4 (mm)', 'Remanente (mm)', 'Estado']];
            (window._neuListaVisible || []).forEach(l => filasDet.push([String(l.placa || '').toUpperCase(), String(l.dueno || ''), String(l.tipo_unidad || ''), String(l.fecha_inspeccion || '').split('T')[0], String(l.posicion || ''), window.neuTipoLlanta(l), String(l.medida || ''), String(l.marca || ''), String(l.modelo || ''), l.r1 ?? '', l.r2 ?? '', l.r3 ?? '', l.r4 ?? '', l.remanente_promedio ?? '', String(l.estado || '')]));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filasDet), 'Detalle por placa');
            XLSX.writeFile(wb, 'Resumen_Compras_Reposicion_' + new Date().toISOString().split('T')[0] + '.xlsx');
        } catch (e) {
            console.error('Error exportando Excel:', e);
            alert('No se pudo generar el Excel: ' + e.message);
        }
    };

    window.neuExportarResumenPDF = async function() {
        const d = window._neuResumenDatosExport();
        if (!d) return;
        // Se abre la pestaña en el gesto del usuario y luego se carga el PDF (no se descarga)
        const win = window.open('', '_blank');
        try { if (win) { win.document.write('<!doctype html><meta charset="utf-8"><title>Generando PDF…</title><body style="margin:0;height:100vh;display:grid;place-items:center;font:16px system-ui,sans-serif;color:#475569">Generando PDF…</body>'); win.document.close(); } } catch (eAviso) { /* sin acceso a la pestaña */ }
        try {
            if (typeof html2pdf === 'undefined') {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = '/libs/html2pdf.bundle.min.js';
                    s.onload = resolve;
                    s.onerror = () => reject(new Error('No se pudo cargar la librería PDF'));
                    document.head.appendChild(s);
                });
            }
            const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            let logo = '';
            try { logo = localStorage.getItem('fleet_empresa_logo') || localStorage.getItem('empresa_logo') || ''; } catch (e) {}
            const logoHtml = logo ? `<img src="${logo}" style="max-height:48px;max-width:160px;" alt="">` : '';
            const th = 'padding:9px 10px;font-size:12px;font-weight:700;text-align:center;border:1px solid #e2e8f0;';
            const td = 'padding:8px 10px;font-size:13px;font-weight:600;text-align:center;border:1px solid #e2e8f0;color:#1e293b;';

            let filas = '';
            d.lista.forEach(it => {
                filas += `<tr>
                    <td style="${td}text-align:left;font-family:monospace;font-weight:700;">${esc(it.medida)}</td>
                    <td style="${td}">${it.del}</td><td style="${td}">${it.trac}</td><td style="${td}">${it.arr}</td><td style="${td}">${it.rep}</td>
                    <td style="${td}color:#be123c;font-weight:800;">${it.total}</td></tr>`;
            });
            const tdT = 'padding:10px;font-size:13px;font-weight:800;text-align:center;background:#e11d48;color:#fff;border:1px solid #be123c;';

            const html = `
                <div style="font-family:Arial,Helvetica,sans-serif;padding:14px 18px;background:#fff;width:1040px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                        <div>
                            <div style="font-size:20px;font-weight:800;color:#0f172a;">Resumen Consolidado para Compras / Reposición</div>
                            <div style="font-size:12px;color:#64748b;margin-top:4px;">
                                Empresa: <b>${esc(d.empresa)}</b> &nbsp;•&nbsp; Fecha: <b>${d.fecha}</b> &nbsp;•&nbsp; Remanente: <b>≤ ${d.umbral} mm</b> &nbsp;•&nbsp; Total: <b>${d.tot.total} llantas</b>
                            </div>
                        </div>
                        <div>${logoHtml}</div>
                    </div>
                    <table style="width:100%;border-collapse:collapse;">
                        <thead><tr>
                            <th style="${th}background:#1e293b;color:#fff;text-align:left;">MEDIDA LLANTA</th>
                            <th style="${th}background:#e0f2fe;color:#0284c7;">DELANTERAS</th>
                            <th style="${th}background:#fef3c7;color:#b45309;">TRACCIÓN</th>
                            <th style="${th}background:#dcfce7;color:#15803d;">ARRASTRE</th>
                            <th style="${th}background:#f3e8ff;color:#6b21a8;">REPUESTOS</th>
                            <th style="${th}background:#ffe4e6;color:#be123c;">TOTAL REPOSICIÓN</th>
                        </tr></thead>
                        <tbody>${filas}
                            <tr>
                                <td style="${tdT}text-align:left;">TOTAL GENERAL A COMPRAR</td>
                                <td style="${tdT}">${d.tot.del}</td><td style="${tdT}">${d.tot.trac}</td><td style="${tdT}">${d.tot.arr}</td><td style="${tdT}">${d.tot.rep}</td>
                                <td style="${tdT}font-size:15px;">${d.tot.total}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>`;

            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:absolute;left:-9999px;top:0;';
            wrapper.innerHTML = html;
            document.body.appendChild(wrapper);
            let blob;
            try {
                blob = await html2pdf().set({
                    margin: [8, 8, 8, 8],
                    filename: 'Resumen_Compras_Reposicion_' + new Date().toISOString().split('T')[0] + '.pdf',
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 3, useCORS: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
                }).from(wrapper.firstElementChild).outputPdf('blob');
            } finally {
                if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
            }
            const url = URL.createObjectURL(blob);
            if (win) win.location.href = url;
            else { const a = document.createElement('a'); a.href = url; a.download = 'Resumen_Compras_Reposicion.pdf'; document.body.appendChild(a); a.click(); a.remove(); }
            setTimeout(() => URL.revokeObjectURL(url), 120000);
        } catch (e) {
            if (win) win.close();
            console.error('Error exportando PDF:', e);
            alert('No se pudo generar el PDF: ' + e.message);
        }
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
                        <div class="d-flex align-items-center gap-2">
                            <button type="button" class="btn btn-sm btn-outline-dark rounded-pill px-3" onclick="window.neuAbrirHistorialPlaca('${placa}')" title="Ver el historial de inspecciones de ${placa}"><i class="bi bi-clock-history"></i> Historial</button>
                            <span class="badge bg-light text-dark border rounded-pill px-3 py-1.5 fw-bold" style="font-size:0.78rem;">${llantas.length} posición(es)</span>
                        </div>
                    </div>

                    <div class="neu-vehicle-table-wrap custom-scrollbar">
                        <table class="neu-vehicle-table">
                            <thead>
                                <tr>
                                    <th class="text-center" style="width: 48px;">POS</th>
                                    ${window._neuTabActiva === 'requerimientos' ? '<th class="text-center" style="width: 110px;">TIPO</th>' : ''}
                                    <th>MARCA / MEDIDA / MODELO</th>
                                    <th class="text-center" style="width: 44px;">R1</th>
                                    <th class="text-center" style="width: 44px;">R2</th>
                                    <th class="text-center" style="width: 44px;">R3</th>
                                    <th class="text-center" style="width: 95px;">PROM (MM)</th>
                                    <th class="text-center" style="width: 105px;">PRESIÓN PSI</th>
                                    <th class="text-center" style="width: 130px;">ESTADO</th>
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
                                    const remProm = det.remanente_promedio !== null ? parseFloat(det.remanente_promedio) : 10;
                                    const presAct = det.presion_actual ? `${det.presion_actual} PSI` : '---';
                                    const presAnt = det.presion_ant ? `(Ant: ${det.presion_ant})` : '';
                                    const obs = det.observaciones || 'Ninguna';

                                    let badgeEstado = '';
                                    let badgePromStyle = '';
                                    if (det.alerta_cambio === 1 || remProm < window.NEU_MM_CRITICO) {
                                        badgeEstado = `<span class="badge rounded-pill px-2.5 py-1 text-nowrap" style="background:#ffe4e6; color:#be123c; border:1px solid #fecdd3;">● Crítica (≤4mm)</span>`;
                                        badgePromStyle = 'background:#ffe4e6; color:#be123c; border:1px solid #fecdd3;';
                                    } else if (remProm <= 6.0) {
                                        badgeEstado = `<span class="badge rounded-pill px-2.5 py-1 text-nowrap" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a;">● Alerta (4-6mm)</span>`;
                                        badgePromStyle = 'background:#fef3c7; color:#b45309; border:1px solid #fde68a;';
                                    } else {
                                        badgeEstado = `<span class="badge rounded-pill px-2.5 py-1 text-nowrap" style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0;">● Óptima (>6mm)</span>`;
                                        badgePromStyle = 'background:#dcfce7; color:#15803d; border:1px solid #bbf7d0;';
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
                                            ${window._neuTabActiva === 'requerimientos' ? '<td class="text-center"><span class="badge bg-light text-dark border">' + window.neuTipoLlanta(det) + '</span></td>' : ''}
                                            <td>
                                                <div class="fw-bold text-dark font-monospace text-nowrap" style="font-size:0.85rem;">${marcaL} ${modeloL ? '(' + modeloL + ')' : ''}</div>
                                                <div class="text-muted small text-nowrap" style="font-size:0.75rem;">${medidaL} • ${estadoMat}</div>
                                            </td>
                                            <td class="text-center fw-bold font-monospace fs-6 text-dark">${r1}</td>
                                            <td class="text-center fw-bold font-monospace fs-6 text-dark">${r2}</td>
                                            <td class="text-center fw-bold font-monospace fs-6 text-dark">${r3}</td>
                                            <td class="text-center font-monospace fw-bold">
                                                <span class="badge rounded-pill px-2.5 py-1 text-nowrap shadow-2xs" style="${badgePromStyle}">
                                                    ${remProm.toFixed(1)} mm
                                                </span>
                                            </td>
                                            <td class="text-center">
                                                <div class="fw-bold text-dark text-nowrap">${presAct}</div>
                                                ${presAnt ? `<div class="text-muted small text-nowrap" style="font-size:0.7rem;">${presAnt}</div>` : ''}
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

    // ── Historial de inspecciones de una placa: mismo endpoint y mismas dos hojas que la pantalla de React ──
    const neuEscHist = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const neuNum = (v, dec = 1) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(dec));
    const neuKm = v => (v === null || v === undefined ? '—' : Math.round(Number(v)).toLocaleString('es-PE') + ' km');
    const neuFecha = s => (s ? String(s).split('T')[0].split('-').reverse().join('/') : '—');
    const neuFuente = f => (f === 'gps' ? 'GPS' : f === 'inspeccion' ? 'Inspección' : 'Sin dato');

    function neuAsegurarModalHistorial() {
        let modal = document.getElementById('neuModalHistorial');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'neuModalHistorial';
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.innerHTML = `
            <div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">
                <div class="modal-header"><h5 class="modal-title neu-hist-titulo fw-bold"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                <div class="modal-body">
                    <div class="d-flex flex-wrap gap-2 align-items-end mb-3">
                        <label class="small text-muted">Desde<input type="date" class="form-control form-control-sm" data-neu-desde></label>
                        <label class="small text-muted">Hasta<input type="date" class="form-control form-control-sm" data-neu-hasta></label>
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-neu-todo>Todo el historial</button>
                        <button type="button" class="btn btn-sm btn-success ms-auto" data-neu-excel><i class="bi bi-file-earmark-excel"></i> Exportar Excel</button>
                    </div>
                    <div data-neu-contenido></div>
                </div>
            </div></div>`;
        document.body.appendChild(modal);
        const recargar = () => window.neuCargarHistorialPlaca();
        modal.querySelector('[data-neu-desde]').addEventListener('change', recargar);
        modal.querySelector('[data-neu-hasta]').addEventListener('change', recargar);
        modal.querySelector('[data-neu-todo]').addEventListener('click', () => {
            modal.querySelector('[data-neu-desde]').value = '';
            modal.querySelector('[data-neu-hasta]').value = '';
            recargar();
        });
        modal.querySelector('[data-neu-excel]').addEventListener('click', () => window.neuExportarHistorialPlaca());
        return modal;
    }

    window.neuAbrirHistorialPlaca = function (placa) {
        const modal = neuAsegurarModalHistorial();
        modal.dataset.placa = placa;
        modal.querySelector('.neu-hist-titulo').textContent = 'Historial de ' + placa;
        modal.querySelector('[data-neu-desde]').value = '';
        modal.querySelector('[data-neu-hasta]').value = '';
        bootstrap.Modal.getOrCreateInstance(modal).show();
        window.neuCargarHistorialPlaca();
    };

    window.neuCargarHistorialPlaca = async function () {
        const modal = document.getElementById('neuModalHistorial');
        if (!modal) return;
        const cont = modal.querySelector('[data-neu-contenido]');
        const desde = modal.querySelector('[data-neu-desde]').value;
        const hasta = modal.querySelector('[data-neu-hasta]').value;
        const qs = new URLSearchParams();
        if (desde) qs.set('desde', desde);
        if (hasta) qs.set('hasta', hasta);
        cont.innerHTML = '<div class="text-center text-muted py-4">Cargando historial…</div>';
        try {
            const res = await fetch(`/api/neumaticos/historial-placa/${encodeURIComponent(modal.dataset.placa)}${qs.toString() ? '?' + qs.toString() : ''}`);
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo cargar el historial');
            window._neuHistorialPlaca = data.inspecciones || [];
            if (!window._neuHistorialPlaca.length) {
                cont.innerHTML = `<div class="text-center text-muted py-4">${desde || hasta ? 'No hay inspecciones en ese periodo.' : 'Esta placa todavía no tiene inspecciones de neumáticos.'}</div>`;
                return;
            }
            cont.innerHTML = window._neuHistorialPlaca.map(i => `
                <section class="border rounded-3 p-3 mb-3">
                    <div class="d-flex flex-wrap gap-3 align-items-baseline mb-2">
                        <strong>${neuFecha(i.fecha)}</strong>
                        <span>Odómetro: ${neuKm(i.km)} <span class="text-muted">(${neuFuente(i.km_fuente)})</span></span>
                        <span>+${neuKm(i.km_desde_anterior)} desde la anterior</span>
                        <span>Promedio: ${neuNum(i.promedio_general)} mm</span>
                        <span>${i.llantas_cuenta} llanta(s) · ${i.criticas} crítica(s)</span>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm align-middle mb-0">
                            <thead><tr><th>Pos</th><th>Marca / modelo</th><th>Medida</th><th>R1</th><th>R2</th><th>R3</th><th>Promedio</th><th>Anterior</th><th>Δ mm</th><th>Km desde anterior</th><th>mm / 1.000 km</th><th>Estado</th></tr></thead>
                            <tbody>${i.llantas.map(l => `
                                <tr>
                                    <td>${neuEscHist(l.posicion)}</td>
                                    <td>${neuEscHist(l.marca ?? '—')} ${l.modelo ? '· ' + neuEscHist(l.modelo) : ''}</td>
                                    <td>${neuEscHist(l.medida ?? '—')}</td>
                                    <td>${neuNum(l.r1, 0)}</td><td>${neuNum(l.r2, 0)}</td><td>${neuNum(l.r3, 0)}</td>
                                    <td>${neuNum(l.promedio)} mm</td>
                                    <td>${neuNum(l.anterior_mm)} mm</td>
                                    <td>${neuNum(l.delta_mm)}</td>
                                    <td>${neuKm(l.km_desde_anterior)}</td>
                                    <td>${neuNum(l.mm_por_1000km, 2)}</td>
                                    <td>${l.alerta_cambio ? '<span class="text-danger fw-bold">Crítica</span>' : neuEscHist(l.estado ?? '—')}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </section>`).join('');
        } catch (err) {
            cont.innerHTML = `<div class="alert alert-danger mb-0">${neuEscHist(err.message)}</div>`;
        }
    };

    window.neuExportarHistorialPlaca = async function () {
        const data = window._neuHistorialPlaca || [];
        const modal = document.getElementById('neuModalHistorial');
        if (!data.length || !modal) { alert('No hay historial para exportar con las fechas elegidas.'); return; }
        if (typeof XLSX === 'undefined') {
            // La librería se carga aparte (igual que en el Excel de Últimas inspecciones)
            await new Promise((ok, fallo) => { const s = document.createElement('script'); s.src = '/libs/xlsx.full.min.js'; s.onload = ok; s.onerror = fallo; document.head.appendChild(s); });
        }
        const placa = modal.dataset.placa;
        const resumen = [['Fecha', 'Odómetro (km)', 'Fuente km', 'Km desde anterior', 'Llantas', 'Promedio general (mm)', 'Críticas (< 3 mm)']];
        data.forEach(i => resumen.push([neuFecha(i.fecha), i.km, neuFuente(i.km_fuente), i.km_desde_anterior, i.llantas_cuenta, i.promedio_general, i.criticas]));
        const detalle = [['Fecha', 'Odómetro (km)', 'Posición', 'Marca', 'Modelo', 'Medida', 'R1 (mm)', 'R2 (mm)', 'R3 (mm)', 'Promedio (mm)', 'Anterior (mm)', 'Δ mm', 'Km desde anterior', 'mm por 1.000 km', 'Presión anterior', 'Presión actual', 'Estado', 'Crítica', 'Observaciones']];
        data.forEach(i => i.llantas.forEach(l => detalle.push([neuFecha(i.fecha), i.km, l.posicion, l.marca ?? '', l.modelo ?? '', l.medida ?? '', l.r1, l.r2, l.r3, l.promedio, l.anterior_mm, l.delta_mm, l.km_desde_anterior, l.mm_por_1000km, l.presion_ant ?? '', l.presion_actual ?? '', l.estado ?? '', l.alerta_cambio ? 'Sí' : 'No', l.observaciones ?? ''])));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalle), 'Detalle');
        XLSX.writeFile(wb, `Historial-${placa}-${new Date().toISOString().split('T')[0]}.xlsx`);
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
            if (empresa !== 'Todos' && window.neuNormEmpresa(row.dueno) !== window.neuNormEmpresa(empresa)) return false;
            return true;
        });

        // Exact 25 columns in header
        let csv = 'ID,F. INSPECCION,PLACA,ESTADO LLANT,KM,LLANTA,DUEÑO,MARCA (UNI),UNIDAD,MARCA (LLANTA),MEDIDA,MODELO,R1,R2,R3,R4,PRESION DE AIRE ANT,PRESION DE AIRE ACTUAL,ESTADO,ACCION,OBS,ROT,FOTO1,FOTO2,FOTO3\n';
        
        filtradas.forEach(l => {
            const prom = parseFloat(l.remanente_promedio || 0);
            const estLlant = prom < window.NEU_MM_CRITICO ? 'CRITICA' : (prom <= 6.0 ? 'ALERTA' : 'OPTIMA');
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
