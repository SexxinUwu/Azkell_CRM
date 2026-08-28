// ============================================================
// 🏢 MÓDULO: STATUS "UNIDADES EN BASE" (SEGURIDAD)
// Cargado dinámicamente por cargarModuloAislado('seguridad/unidades-base')
// ============================================================

(function() {
    window._subData = window._subData || [];
    window._subCatalogoPlacas = window._subCatalogoPlacas || { tractos: [], carretas: [], todas: [] };
    window._subCorteActivo = window._subCorteActivo || 'ALL';
    let _subDebounceTimeout = null;

    // ── Obtener Corte Automático según la Hora Actual ─────────────
    // Corte 1: 05:00 a 11:59 (5am en adelante)
    // Corte 2: 12:00 a 16:59 (medio día hasta las 5pm)
    // Corte 3: 17:00 a 04:59 (5pm en adelante hasta las 5am)
    window.subObtenerCorteActual = function() {
        const ahora = new Date();
        const hora = ahora.getHours();
        if (hora >= 5 && hora < 12) {
            return 'Corte 1';
        } else if (hora >= 12 && hora < 17) {
            return 'Corte 2';
        } else {
            return 'Corte 3';
        }
    };

    // ── Inicialización Principal del Módulo ───────────────────────
    window.init_unidades_base = function() {
        console.log('🏢 Módulo Status Unidades en Base inicializado');
        
        // Configurar fecha de hoy por defecto si está vacío
        const filterFecha = document.getElementById('sub-filter-fecha');
        if (filterFecha && !filterFecha.value) {
            const hoy = new Date().toISOString().split('T')[0];
            filterFecha.value = hoy;
        }

        window.subCargarCatalogoPlacas();
        window.subCargarDatos();
    };

    // ── Cargar Catálogo de Placas para Datalists ──────────────────
    window.subCargarCatalogoPlacas = async function() {
        try {
            const res = await fetch('/api/seguridad/unidades-base/catalogo-placas');
            const data = await res.json();
            window._subCatalogoPlacas = data;

            // Llenar datalist de camiones/tractos
            const dlCamion = document.getElementById('list-sub-placas-camion');
            if (dlCamion) {
                const list = (data.tractos && data.tractos.length) ? data.tractos : data.todas || [];
                dlCamion.innerHTML = list.map(p => `<option value="${p.placa || p}">${p.marca ? p.marca + ' - ' + (p.tipo || '') : ''}</option>`).join('');
            }

            // Llenar datalist de carretas
            const dlCarreta = document.getElementById('list-sub-placas-carreta');
            if (dlCarreta) {
                const list = (data.carretas && data.carretas.length) ? data.carretas : data.todas || [];
                dlCarreta.innerHTML = list.map(p => `<option value="${p.placa || p}">${p.marca ? p.marca + ' - ' + (p.tipo || '') : ''}</option>`).join('');
            }
        } catch(e) {
            console.warn('Advertencia cargando catálogo de placas:', e.message);
        }
    };

    // ── Cargar Datos de la Tabla ──────────────────────────────────
    window.subCargarDatos = async function() {
        const tbody = document.getElementById('sub-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-5 text-secondary">
                        <div class="spinner-border spinner-border-sm text-primary me-2"></div> Cargando unidades en base...
                    </td>
                </tr>
            `;
        }

        const fecha = document.getElementById('sub-filter-fecha')?.value || '';
        const corte = window._subCorteActivo || 'ALL';
        const estado = document.getElementById('sub-filter-estado')?.value || 'ALL';
        const search = document.getElementById('sub-filter-search')?.value || '';

        const params = new URLSearchParams();
        if (fecha) params.append('fecha', fecha);
        if (corte && corte !== 'ALL') params.append('corte', corte);
        if (estado && estado !== 'ALL') params.append('estado', estado);
        if (search) params.append('search', search);

        try {
            const res = await fetch(`/api/seguridad/unidades-base?${params.toString()}`);
            const data = await res.json();
            if (data.ok) {
                window._subData = data.data || [];
                window.subRenderTabla(window._subData);
                window.subCalcularKPIs(window._subData);
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Error: ${data.error || 'No se pudieron obtener los datos'}</td></tr>`;
            }
        } catch(err) {
            console.error('Error cargando unidades en base:', err);
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Error de conexión con el servidor.</td></tr>`;
        }
    };

    // ── Debounce de Búsqueda ──────────────────────────────────────
    window.subDebounceBusqueda = function() {
        clearTimeout(_subDebounceTimeout);
        _subDebounceTimeout = setTimeout(() => {
            window.subCargarDatos();
        }, 300);
    };

    // ── Renderizar Tabla de Unidades en Base ──────────────────────
    window.subRenderTabla = function(items = []) {
        const tbody = document.getElementById('sub-tbody');
        if (!tbody) return;

        if (!items || items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-5 text-secondary">
                        <i class="bi bi-inbox fs-3 d-block mb-2 text-muted"></i>
                        No se encontraron unidades registradas en base con los filtros seleccionados.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = items.map(r => {
            // Badge Corte
            let badgeCorte = `<span class="badge-corte-1">${r.corte || 'Corte 1'}</span>`;
            if (r.corte === 'Corte 2') badgeCorte = `<span class="badge-corte-2">Corte 2</span>`;
            if (r.corte === 'Corte 3') badgeCorte = `<span class="badge-corte-3">Corte 3</span>`;

            // Badge Estado
            let badgeEstado = `<span class="badge-estado-disponible">Disponible</span>`;
            if (r.estado === 'En Espera') badgeEstado = `<span class="badge-estado-espera">En Espera</span>`;
            if (r.estado === 'En Taller') badgeEstado = `<span class="badge-estado-taller">En Taller</span>`;
            if (r.estado === 'Cargado') badgeEstado = `<span class="badge-estado-cargado">Cargado</span>`;
            if (r.estado === 'Vacío') badgeEstado = `<span class="badge bg-light text-dark border">Vacío</span>`;

            const placaCarretaHtml = r.placa_carreta 
                ? `<span class="badge bg-light text-dark border border-secondary fw-bold font-monospace">${r.placa_carreta}</span>` 
                : `<span class="text-muted small">—</span>`;

            return `
                <tr>
                    <td>${badgeCorte}</td>
                    <td><span class="badge bg-dark text-white fw-bold font-monospace px-2 py-1">${r.placa_camion}</span></td>
                    <td>${placaCarretaHtml}</td>
                    <td class="fw-semibold text-dark">${r.zona || 'Base Central'}</td>
                    <td>${badgeEstado}</td>
                    <td class="text-secondary small" style="max-width:300px; word-break:break-word;">${r.observacion || '—'}</td>
                    <td class="text-secondary small">${r.usuario || 'Seguridad'}</td>
                    <td class="text-end text-nowrap">
                        <button class="btn btn-sm btn-light border py-1 px-2 me-1 text-dark" title="Editar" onclick='window.subAbrirModalEditar(${JSON.stringify(r)})'>
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-light border border-danger text-danger py-1 px-2" title="Eliminar" onclick="window.subEliminar(${r.id})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    // ── Calcular KPIs Bento ───────────────────────────────────────
    window.subCalcularKPIs = function(items = []) {
        const elTotal = document.getElementById('sub-kpi-total');
        const elC1 = document.getElementById('sub-kpi-c1');
        const elC2 = document.getElementById('sub-kpi-c2');
        const elC3 = document.getElementById('sub-kpi-c3');

        let c1 = 0, c2 = 0, c3 = 0;
        items.forEach(it => {
            if (it.corte === 'Corte 1') c1++;
            else if (it.corte === 'Corte 2') c2++;
            else if (it.corte === 'Corte 3') c3++;
        });

        if (elTotal) elTotal.textContent = items.length;
        if (elC1) elC1.textContent = c1;
        if (elC2) elC2.textContent = c2;
        if (elC3) elC3.textContent = c3;
    };

    // ── Filtrar haciendo clic en los Cards Bento de KPI ──────────
    window.subFiltrarCorteKPI = function(corte) {
        window._subCorteActivo = corte || 'ALL';
        
        // Actualizar active state en cards
        document.querySelectorAll('.sub-kpi-card').forEach(c => c.classList.remove('active'));
        if (corte === 'ALL') document.getElementById('kpi-card-total')?.classList.add('active');
        else if (corte === 'Corte 1') document.getElementById('kpi-card-corte1')?.classList.add('active');
        else if (corte === 'Corte 2') document.getElementById('kpi-card-corte2')?.classList.add('active');
        else if (corte === 'Corte 3') document.getElementById('kpi-card-corte3')?.classList.add('active');

        // Actualizar active state en segmented buttons
        document.querySelectorAll('#sub-segmented-cortes .sub-segment-item').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-corte') === window._subCorteActivo);
        });

        window.subCargarDatos();
    };

    // ── Filtrar haciendo clic en el Segmented Apple Pill ──────────
    window.subFiltrarCorteSegmented = function(corte) {
        window.subFiltrarCorteKPI(corte);
    };

    // ── Abrir Modal en Modo Nuevo ─────────────────────────────────
    window.subAbrirModalNuevo = function() {
        document.getElementById('formSubUnidad')?.reset();
        document.getElementById('sub-form-id').value = '';
        document.getElementById('modalSubTitulo').textContent = 'Nuevo Registro de Unidad en Base';
        document.getElementById('modalSubSubtitulo').textContent = 'Control de permanencia vehicular';

        // Auto-llenar fecha actual y corte según la hora
        const hoy = new Date().toISOString().split('T')[0];
        const corteAuto = window.subObtenerCorteActual();

        const inputFecha = document.getElementById('sub-form-fecha');
        const inputCorte = document.getElementById('sub-form-corte');
        if (inputFecha) inputFecha.value = hoy;
        if (inputCorte) inputCorte.value = corteAuto;

        const modalEl = document.getElementById('modalSubUnidad');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    // ── Abrir Modal en Modo Editar ────────────────────────────────
    window.subAbrirModalEditar = function(r) {
        if (!r) return;
        document.getElementById('sub-form-id').value = r.id || '';
        document.getElementById('modalSubTitulo').textContent = 'Editar Registro de Unidad';
        document.getElementById('modalSubSubtitulo').textContent = `Placa: ${r.placa_camion}`;

        let f = r.fecha ? r.fecha.split('T')[0] : new Date().toISOString().split('T')[0];
        document.getElementById('sub-form-fecha').value = f;
        document.getElementById('sub-form-corte').value = r.corte || 'Corte 1';
        document.getElementById('sub-form-placa-camion').value = r.placa_camion || '';
        document.getElementById('sub-form-placa-carreta').value = r.placa_carreta || '';
        document.getElementById('sub-form-zona').value = r.zona || 'Base Central';
        document.getElementById('sub-form-estado').value = r.estado || 'Disponible';
        document.getElementById('sub-form-obs').value = r.observacion || '';

        const modalEl = document.getElementById('modalSubUnidad');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    };

    // ── Guardar Registro (Crear / Actualizar) ──────────────────────
    window.subGuardarRegistro = async function() {
        const id = document.getElementById('sub-form-id').value;
        const fecha = document.getElementById('sub-form-fecha').value;
        const corte = document.getElementById('sub-form-corte').value;
        const placaCamion = (document.getElementById('sub-form-placa-camion').value || '').trim();
        const placaCarreta = (document.getElementById('sub-form-placa-carreta').value || '').trim();
        const zona = document.getElementById('sub-form-zona').value;
        const estado = document.getElementById('sub-form-estado').value;
        const observacion = document.getElementById('sub-form-obs').value;

        if (!fecha || !corte || !placaCamion) {
            window.mostrarToast('Por favor completa la fecha, corte y placa del camión', 'warning');
            return;
        }

        const btn = document.getElementById('btnSubGuardar');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Guardando...'; }

        const payload = {
            fecha, corte, placa_camion: placaCamion, placa_carreta: placaCarreta,
            zona, estado, observacion
        };

        try {
            const url = id ? `/api/seguridad/unidades-base/${id}` : '/api/seguridad/unidades-base';
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.ok) {
                window.mostrarToast(id ? 'Registro actualizado correctamente' : 'Unidad registrada en base', 'success');
                const modalEl = document.getElementById('modalSubUnidad');
                if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
                window.subCargarDatos();
            } else {
                window.mostrarToast(data.error || 'Error al procesar el registro', 'danger');
            }
        } catch(err) {
            console.error('Error al guardar unidad en base:', err);
            window.mostrarToast('Error de conexión con el servidor', 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-1"></i> Guardar Registro'; }
        }
    };

    // ── Eliminar Registro ─────────────────────────────────────────
    window.subEliminar = async function(id) {
        if (!confirm('¿Estás seguro de eliminar este registro de unidad en base?')) return;

        try {
            const res = await fetch(`/api/seguridad/unidades-base/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.ok) {
                window.mostrarToast('Registro eliminado', 'info');
                window.subCargarDatos();
            } else {
                window.mostrarToast(data.error || 'No se pudo eliminar', 'danger');
            }
        } catch(e) {
            window.mostrarToast('Error al intentar eliminar', 'danger');
        }
    };

    // ── Exportador a PDF Oficial (Hoja A4 Centrada, Cabecera ISO F-SEG-0010) ──
    window.subExportarPDF = function() {
        const fechaFiltro = document.getElementById('sub-filter-fecha')?.value || new Date().toISOString().split('T')[0];
        const corteFiltro = window._subCorteActivo || 'ALL';
        const fParts = fechaFiltro.split('-');
        const fechaFormateada = fParts.length === 3 ? `${fParts[2]}/${fParts[1]}/${fParts[0]}` : fechaFiltro;

        const items = window._subData || [];
        if (items.length === 0) {
            window.mostrarToast('No hay registros para exportar en esta fecha', 'warning');
            return;
        }

        const ventana = window.open('', '_blank');
        if (!ventana) {
            alert('Por favor, permite las ventanas emergentes para generar el PDF.');
            return;
        }

        const empLogoUrl = localStorage.getItem('fleet_empresa_logo') || window._LOGO_BASE64 || 'https://drive.google.com/thumbnail?id=1xIhoa-8y0L_VDbMouOdGEKtOA2eenvjt&sz=w500';

        const filasHtml = items.map((r, i) => `
            <tr>
                <td style="text-align:center; font-weight:bold; width:28px;">${i + 1}</td>
                <td style="text-align:center; font-weight:bold; color:#0f172a; width:65px;">${r.corte || 'Corte 1'}</td>
                <td style="text-align:center; font-family:monospace; font-weight:bold; font-size:11px; width:90px;">${r.placa_camion || '---'}</td>
                <td style="text-align:center; font-family:monospace; font-size:11px; width:90px;">${r.placa_carreta || '---'}</td>
                <td style="width:130px; font-weight:500;">${r.zona || 'Base Central'}</td>
                <td style="text-align:center; font-weight:700; width:85px;">${r.estado || 'Disponible'}</td>
                <td style="font-size:9.5px; word-break:break-word;">${r.observacion || ''}</td>
                <td style="text-align:center; font-size:9px; width:85px;">${r.usuario || 'Seguridad'}</td>
            </tr>
        `).join('');

        ventana.document.write(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Status Unidades en Base — F-SEG-0010</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet">
                <style>
                    * { box-sizing: border-box; }
                    body {
                        background-color: #525659;
                        margin: 0;
                        padding: 20px 10px;
                        font-family: 'Inter', -apple-system, sans-serif;
                        color: #000000;
                        display: flex;
                        justify-content: center;
                    }
                    .btn-print-fixed {
                        position: fixed;
                        top: 16px;
                        right: 20px;
                        z-index: 9999;
                        background: #111827;
                        color: #ffffff;
                        border: 1px solid #374151;
                        border-radius: 6px;
                        padding: 8px 18px;
                        font-weight: 700;
                        font-size: 13px;
                        cursor: pointer;
                        box-shadow: 0 4px 14px rgba(0,0,0,0.3);
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }
                    .btn-print-fixed:hover {
                        background: #1f2937;
                    }
                    
                    /* Hoja A4 Centrada */
                    .page-a4 {
                        width: 210mm;
                        min-height: 297mm;
                        background: #ffffff;
                        padding: 12mm 12mm;
                        margin: 0 auto;
                        box-shadow: 0 4px 25px rgba(0, 0, 0, 0.4);
                        box-sizing: border-box;
                        position: relative;
                        display: flex;
                        flex-direction: column;
                    }

                    /* ENCABEZADO NORMATIVA ISO OFICIAL (EXACTO A OT) */
                    .iso-header { width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 6px; table-layout: fixed; }
                    .iso-header td { border: 1px solid #000; text-align: center; vertical-align: middle; }
                    .logo-cell { width: 22%; padding: 4px; }
                    .title-cell { width: 54%; font-family: 'Oswald', sans-serif; font-size: 20px; font-weight: 700; line-height: 1.1; text-transform: uppercase; color: #000; }
                    .title-cell .sub-title { font-size: 10px; font-weight: 500; color: #333; letter-spacing: 0.5px; display: block; margin-top: 3px; }
                    .qms-item { width: 24%; font-family: 'Oswald', sans-serif; font-size: 9.5px; text-align: left !important; padding: 2px 6px; height: 17px; }
                    
                    /* Barra de Información del Reporte */
                    .info-bar { width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 6px; font-size: 10.5px; font-weight: bold; }
                    .info-bar td { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; }
                    .val-text { font-weight: normal; margin-left: 4px; }

                    /* TABLA DE CONTENIDO */
                    .content-table { width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 8px; font-size: 10px; }
                    .content-table th { 
                        background-color: #333333 !important; 
                        -webkit-print-color-adjust: exact !important; 
                        print-color-adjust: exact !important; 
                        color: #ffffff !important; 
                        text-align: center; 
                        padding: 5px 4px; 
                        border: 1px solid #000; 
                        font-weight: 700; 
                        font-size: 9.5px; 
                        text-transform: uppercase; 
                    }
                    .content-table td { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; }

                    /* Footer */
                    .footer-box { margin-top: auto; border-top: 1px solid #000; padding-top: 6px; display: flex; justify-content: space-between; font-size: 9.5px; color: #333; }

                    @media print {
                        * {
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                            color-adjust: exact !important;
                        }
                        body { background: #ffffff !important; padding: 0 !important; }
                        .btn-print-fixed { display: none !important; }
                        .page-a4 { width: 100% !important; min-height: auto !important; box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
                        .content-table th { 
                            background-color: #333333 !important; 
                            color: #ffffff !important; 
                            -webkit-print-color-adjust: exact !important; 
                            print-color-adjust: exact !important; 
                        }
                        @page { size: A4 portrait; margin: 10mm; }
                    }
                </style>
            </head>
            <body>
                <button class="btn-print-fixed" onclick="window.print()">
                    🖨️ Imprimir / Guardar PDF
                </button>

                <div class="page-a4">
                    <!-- Encabezado ISO Solicitado -->
                    <table class="iso-header">
                        <tr>
                            <td class="logo-cell" rowspan="3">
                                <img src="${empLogoUrl}" alt="Logo Empresa" style="max-height: 46px; max-width: 100%; object-fit: contain;">
                            </td>
                            <td class="title-cell" rowspan="3">
                                STATUS "UNIDADES EN BASE"<br>
                                <span class="sub-title">CONTROL Y SEGURIDAD PATRIMONIAL</span>
                            </td>
                            <td class="qms-item"><b>CÓDIGO:</b> F-SEG-0010</td>
                        </tr>
                        <tr><td class="qms-item"><b>VERSIÓN:</b> 0</td></tr>
                        <tr><td class="qms-item"><b>F. EMISIÓN:</b> ${fechaFormateada}</td></tr>
                    </table>

                    <!-- Barra de Metadatos -->
                    <table class="info-bar">
                        <tr>
                            <td style="width: 35%;">FECHA: <span class="val-text">${fechaFormateada}</span></td>
                            <td style="width: 35%;">FILTRO DE CORTE: <span class="val-text">${corteFiltro === 'ALL' ? 'Todos los Cortes' : corteFiltro}</span></td>
                            <td style="width: 30%;">TOTAL UNIDADES: <span class="val-text" style="font-weight:bold; color:#0284c7;">${items.length}</span></td>
                        </tr>
                    </table>

                    <!-- Tabla de Unidades -->
                    <table class="content-table">
                        <thead>
                            <tr>
                                <th style="width: 28px;">#</th>
                                <th style="width: 65px;">CORTE</th>
                                <th style="width: 90px;">PLACA CAMIÓN</th>
                                <th style="width: 90px;">PLACA CARRETA</th>
                                <th style="width: 130px;">ZONA / PATIO</th>
                                <th style="width: 85px;">ESTADO</th>
                                <th>OBSERVACIONES</th>
                                <th style="width: 85px;">REGISTRADO POR</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filasHtml}
                        </tbody>
                    </table>

                    <!-- Footer -->
                    <div class="footer-box">
                        <div><b>ERP Azkell Fleet</b> — Módulo de Seguridad y Control Patrimonial</div>
                        <div>Generado el: ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE')}</div>
                    </div>
                </div>

                <script>
                    window.onload = function() {
                        setTimeout(function() { window.print(); }, 500);
                    };
                </script>
            </body>
            </html>
        `);
        ventana.document.close();
    };

    // Auto-ejecución inmediata si la vista ya está en el DOM
    if (document.getElementById('moduloSegUnidadesBase')) {
        window.init_unidades_base();
    }
})();
