// =========================================================================
// MÓDULO: GERENCIA - APROBACIÓN DE ÓRDENES DE COMPRA (ERP AZKELL)
// =========================================================================

(function() {
    'use strict';

    // Detección inicial: en móvil inicia en 'cards', en escritorio en 'table'
    const isMobile = window.innerWidth <= 768;
    const modoGuardado = localStorage.getItem('erp_gerencia_oc_vista');
    const modoInicial = modoGuardado || (isMobile ? 'cards' : 'table');

    // Estado local del módulo (Inicia vacío para datos reales del ERP)
    window._gerenciaOC = window._gerenciaOC || {
        tabActivo: 'pendiente',
        modoVista: modoInicial,
        ordenes: [],
        ordenSeleccionada: null,
        tipoAccionModal: null
    };

    // Formateador de fechas para presentación amigable en ERP
    function formatearFechaHora(iso, createdAt) {
        const raw = createdAt || iso;
        if (!raw) return '—';
        try {
            const s = String(raw);
            let d;
            if (s.includes('T') || s.includes(' ')) {
                d = new Date(s.replace(' ', 'T'));
            } else {
                d = new Date(s + 'T00:00:00');
            }
            if (isNaN(d.getTime())) return String(raw);
            const dateStr = d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
            if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
                return dateStr;
            }
            return dateStr + ' ' + timeStr;
        } catch(e) { return String(raw); }
    }

    // Formateador de fechas a formato YYYY-MM-DD para los inputs
    function obtenerFechaHoyISO() {
        const hoy = new Date();
        const yyyy = hoy.getFullYear();
        const mm = String(hoy.getMonth() + 1).padStart(2, '0');
        const dd = String(hoy.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    // Cargar órdenes reales desde la base de datos ERP
    async function cargarDatasetDesdeAPI() {
        try {
            const resp = await fetch('/api/almacen/entradas');
            if (resp.ok) {
                const data = await resp.json();
                window._gerenciaOC.ordenes = (data || []).map(d => {
                    const st = (d.estado || 'REGISTRADA').toLowerCase();
                    let estadoMap = 'pendiente';
                    if (st === 'aprobado' || st === 'aprobada') estadoMap = 'aprobado';
                    else if (st === 'rechazado' || st === 'rechazada' || st === 'anulado' || st === 'anulada') estadoMap = 'rechazado';
                    else if (st === 'observado' || st === 'observada') estadoMap = 'observado';
                    else if (st === 'pagado' || st === 'pagada' || st === 'procesado' || st === 'procesada') estadoMap = 'aprobado';

                    // Extraer RUC de proveedor_ruc o de proveedor_nombre si viene entre paréntesis
                    let ruc = d.proveedor_ruc || '';
                    if (!ruc && d.proveedor_nombre) {
                        const matchRuc = d.proveedor_nombre.match(/\b(10|20)\d{9}\b/);
                        if (matchRuc) ruc = matchRuc[0];
                    }

                    // Extraer nombre de usuario limpio (no correo)
                    let nombreUsuario = d.creador_nombre || d.creado_por || 'SISTEMA';
                    if (nombreUsuario.includes('@')) {
                        nombreUsuario = nombreUsuario.split('@')[0].replace(/[._]/g, ' ').toUpperCase();
                    }

                    // Contacto
                    let contactoArr = [];
                    if (d.proveedor_telefono) contactoArr.push(d.proveedor_telefono);
                    if (d.proveedor_email) contactoArr.push(d.proveedor_email);

                    // Destino
                    let destinoStr = '';
                    if (d.placa) destinoStr += 'Unidad ' + d.placa;
                    if (d.ot_id) destinoStr += (destinoStr ? ' | ' : '') + 'OT: ' + d.ot_id;
                    if (!destinoStr) destinoStr = 'Sede Principal / Almacén';

                    const fechaFmt = formatearFechaHora(d.fecha, d.created_at);

                    // Desglose de ítems con sus datos completos
                    const itemsParsed = (d.items || []).map(it => {
                        const cantVal = it.cantidad != null ? parseFloat(it.cantidad) : (it.cant != null ? parseFloat(it.cant) : 1);
                        const puVal = it.costo_unitario != null ? parseFloat(it.costo_unitario) : (it.pu != null ? parseFloat(it.pu) : 0);
                        const totalVal = it.importe != null ? parseFloat(it.importe) : (it.total != null ? parseFloat(it.total) : (cantVal * puVal));
                        return {
                            codigo: it.codigo_articulo || it.inventario_id || it.codigo || '—',
                            descripcion: it.descripcion || 'Sin descripción',
                            cant: cantVal,
                            um: it.unidad_medida || it.um || 'UND',
                            pu: puVal,
                            total: totalVal
                        };
                    });

                    return {
                        id: d.id,
                        codigo: d.id,
                        fecha: fechaFmt,
                        fecha_raw: d.created_at || d.fecha,
                        usuario: nombreUsuario,
                        solicitante: d.creador_nombre || d.creado_por || 'Almacén / Mantenimiento',
                        proveedor: d.proveedor_nombre || 'PROVEEDOR GENERAL',
                        ruc: ruc || '-',
                        contacto: contactoArr.join(' • ') || 'No especificado',
                        almacen: d.almacen || 'Principal',
                        destino: destinoStr,
                        total: parseFloat(d.total_pen || 0),
                        moneda: d.moneda === 'USD' ? '$' : 'S/',
                        tipo_igv: d.tipo_igv || 'incluido',
                        condicionPago: d.condicion_pago ? (d.condicion_pago + (d.dias_credito && d.condicion_pago.toLowerCase().includes('crédito') ? ` (${d.dias_credito} días)` : '')) : 'Al contado',
                        estado: estadoMap,
                        estado_raw: d.estado || 'REGISTRADA',
                        motivo: d.motivo_entrada || d.observaciones || 'Adquisición de artículos / repuestos',
                        justificacion: d.motivo_entrada || d.observaciones || 'Sin motivo especificado',
                        tipo_orden: d.tipo_orden || 'Orden de compra',
                        items: itemsParsed,
                        url_voucher: d.url_voucher_presigned || d.url_voucher,
                        url_cotizacion: d.url_cotizacion_presigned || d.url_cotizacion,
                        url_factura: d.url_factura_presigned || d.url_factura
                    };
                });
            }
        } catch (e) {
            console.warn('Error cargando órdenes de compra en gerencia:', e);
        }

        actualizarKpisYBadges();
        window.aplicarFiltrosOC();
    }

    // Renderizar Dashboard y Lista
    window.renderizarModuloGerenciaOC = function() {
        window.cambiarModoVista(window._gerenciaOC.modoVista, false);
        cargarDatasetDesdeAPI();
    };

    // Actualizar números de KPIs
    function actualizarKpisYBadges() {
        const ordenes = window._gerenciaOC.ordenes || [];
        
        const pend = ordenes.filter(o => o.estado === 'pendiente');
        const aprob = ordenes.filter(o => o.estado === 'aprobado');
        const obs = ordenes.filter(o => o.estado === 'observado');
        const rech = ordenes.filter(o => o.estado === 'rechazado');
        const urg = ordenes.filter(o => o.prioridad === 'URGENTE' && o.estado === 'pendiente');

        const sumMontoSoles = (arr) => arr.reduce((acc, cur) => acc + (cur.moneda === 'S/' ? (cur.total || 0) : (cur.total || 0) * 3.75), 0);

        // Actualizar contadores Bento
        const elPend = document.getElementById('kpi-count-pendientes');
        if (elPend) elPend.innerText = pend.length;
        const elPendMonto = document.getElementById('kpi-monto-pendientes');
        if (elPendMonto) elPendMonto.innerText = 'S/ ' + sumMontoSoles(pend).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const elAprob = document.getElementById('kpi-count-aprobadas');
        if (elAprob) elAprob.innerText = aprob.length;
        const elAprobMonto = document.getElementById('kpi-monto-aprobadas');
        if (elAprobMonto) elAprobMonto.innerText = 'S/ ' + sumMontoSoles(aprob).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const elObs = document.getElementById('kpi-count-observadas');
        if (elObs) elObs.innerText = obs.length;
        const elObsMonto = document.getElementById('kpi-monto-observadas');
        if (elObsMonto) elObsMonto.innerText = 'S/ ' + sumMontoSoles(obs).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const elRech = document.getElementById('kpi-count-rechazadas');
        if (elRech) elRech.innerText = rech.length;
        const elRechMonto = document.getElementById('kpi-monto-rechazadas');
        if (elRechMonto) elRechMonto.innerText = 'S/ ' + sumMontoSoles(rech).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Actualizar badges en las pestañas
        const bTodos = document.getElementById('tab-badge-todos');
        if (bTodos) bTodos.innerText = ordenes.length;
        const bPend = document.getElementById('tab-badge-pendiente');
        if (bPend) bPend.innerText = pend.length;
        const bAprob = document.getElementById('tab-badge-aprobado');
        if (bAprob) bAprob.innerText = aprob.length;
        const bObs = document.getElementById('tab-badge-observado');
        if (bObs) bObs.innerText = obs.length;
        const bRech = document.getElementById('tab-badge-rechazado');
        if (bRech) bRech.innerText = rech.length;
    }

    // Filtrar por Pestaña
    window.filtrarPorTab = function(tabName) {
        window._gerenciaOC.tabActivo = tabName;
        document.querySelectorAll('.aprob-tab-btn').forEach(btn => {
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        window.aplicarFiltrosOC();
    };

    // Alternar modo de vista (Cards vs Tabla)
    window.cambiarModoVista = function(modo, guardar = true) {
        window._gerenciaOC.modoVista = modo;
        if (guardar) {
            try { localStorage.setItem('erp_gerencia_oc_vista', modo); } catch(e) {}
        }

        const btnCards = document.getElementById('btn-view-cards');
        const btnTable = document.getElementById('btn-view-table');
        const wrapCards = document.getElementById('contenedor-vista-cards');
        const wrapTable = document.getElementById('contenedor-vista-table');

        if (modo === 'cards') {
            if (btnCards) { btnCards.classList.add('active', 'btn-white'); btnCards.classList.remove('btn-transparent', 'text-secondary'); }
            if (btnTable) { btnTable.classList.remove('active', 'btn-white'); btnTable.classList.add('btn-transparent', 'text-secondary'); }
            if (wrapCards) wrapCards.classList.remove('d-none');
            if (wrapTable) wrapTable.classList.add('d-none');
        } else {
            if (btnCards) { btnCards.classList.remove('active', 'btn-white'); btnCards.classList.add('btn-transparent', 'text-secondary'); }
            if (btnTable) { btnTable.classList.add('active', 'btn-white'); btnTable.classList.remove('btn-transparent', 'text-secondary'); }
            if (wrapCards) wrapCards.classList.add('d-none');
            if (wrapTable) wrapTable.classList.remove('d-none');
        }
    };

    // Función auxiliar para parsear fechas a formato ISO (YYYY-MM-DD)
    function normalizarFechaAISO(item) {
        if (!item) return null;
        if (item.fecha_raw) {
            const raw = String(item.fecha_raw);
            if (raw.includes('T')) return raw.split('T')[0];
            if (raw.includes(' ')) return raw.split(' ')[0];
            if (raw.includes('/')) {
                const p = raw.split('/');
                if (p.length === 3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
            }
            return raw;
        }
        return null;
    }

    // Aplicar filtros de búsqueda, fechas y renderizar lista
    window.aplicarFiltrosOC = function() {
        const tab = window._gerenciaOC.tabActivo || 'pendiente';
        const txtBuscar = (document.getElementById('filtro-buscar-oc')?.value || '').toLowerCase().trim();
        const selAlmacen = (document.getElementById('filtro-almacen-oc')?.value || '').toLowerCase();
        const fDesde = document.getElementById('filtro-fecha-desde')?.value || '';
        const fHasta = document.getElementById('filtro-fecha-hasta')?.value || '';

        const ordenes = window._gerenciaOC.ordenes || [];

        let filtradas = ordenes.filter(item => {
            // Filtro por tab
            if (tab === 'pendiente' && item.estado !== 'pendiente') return false;
            if (tab === 'aprobado' && item.estado !== 'aprobado') return false;
            if (tab === 'observado' && item.estado !== 'observado') return false;
            if (tab === 'rechazado' && item.estado !== 'rechazado') return false;

            // Filtro por rango de fechas
            const fechaItemISO = normalizarFechaAISO(item);
            if (fechaItemISO) {
                if (fDesde && fechaItemISO < fDesde) return false;
                if (fHasta && fechaItemISO > fHasta) return false;
            }

            // Filtro por almacén
            if (selAlmacen && item.almacen && !item.almacen.toLowerCase().includes(selAlmacen)) return false;

            // Filtro por texto
            if (txtBuscar) {
                const matchTexto = 
                    (item.id && item.id.toLowerCase().includes(txtBuscar)) ||
                    (item.proveedor && item.proveedor.toLowerCase().includes(txtBuscar)) ||
                    (item.usuario && item.usuario.toLowerCase().includes(txtBuscar)) ||
                    (item.ruc && item.ruc.toLowerCase().includes(txtBuscar)) ||
                    (item.solicitante && item.solicitante.toLowerCase().includes(txtBuscar)) ||
                    (item.destino && item.destino.toLowerCase().includes(txtBuscar)) ||
                    (item.justificacion && item.justificacion.toLowerCase().includes(txtBuscar));
                if (!matchTexto) return false;
            }

            return true;
        });

        const wrapCards = document.getElementById('contenedor-vista-cards');
        const cuerpoTabla = document.getElementById('cuerpo-tabla-aprobaciones');
        const emptyState = document.getElementById('empty-state-aprobaciones');

        if (filtradas.length === 0) {
            if (wrapCards) wrapCards.innerHTML = '';
            if (cuerpoTabla) cuerpoTabla.innerHTML = '';
            if (emptyState) emptyState.classList.remove('d-none');
            return;
        }

        if (emptyState) emptyState.classList.add('d-none');

        // Renderizar Tarjetas (Diseño Móvil / Grid optimizado)
        if (wrapCards) {
            wrapCards.innerHTML = filtradas.map(oc => generarCardHTML(oc)).join('');
        }

        // Renderizar Tabla con columnas cómodas y proporcionales
        if (cuerpoTabla) {
            cuerpoTabla.innerHTML = filtradas.map(oc => generarFilaTablaHTML(oc)).join('');
        }
    };

    // Template para Card Ejecutiva (Mobile First / Grid)
    function generarCardHTML(oc) {
        let badgePrioridad = '';
        if (oc.prioridad === 'URGENTE') {
            badgePrioridad = `<span class="badge bg-danger text-white rounded-pill px-2 py-0.5 fw-bold badge-urgente-pulse" style="font-size:0.7rem;"><i class="bi bi-fire"></i> URGENTE</span>`;
        } else if (oc.prioridad === 'ALTA') {
            badgePrioridad = `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning rounded-pill px-2 py-0.5 fw-bold" style="font-size:0.7rem;">ALTA</span>`;
        } else {
            badgePrioridad = `<span class="badge bg-light text-secondary border rounded-pill px-2 py-0.5" style="font-size:0.7rem;">NORMAL</span>`;
        }

        let badgeEstado = '';
        if (oc.estado === 'pendiente') {
            badgeEstado = `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2 py-0.5 fw-bold" style="font-size:0.7rem;"><i class="bi bi-clock-fill"></i> Pendiente</span>`;
        } else if (oc.estado === 'aprobado') {
            badgeEstado = `<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-0.5 fw-bold" style="font-size:0.7rem;"><i class="bi bi-check-circle-fill"></i> Autorizada</span>`;
        } else if (oc.estado === 'observado') {
            badgeEstado = `<span class="badge rounded-pill px-2 py-0.5 fw-bold" style="background:#e0e7ff; color:#4338ca; font-size:0.7rem;"><i class="bi bi-chat-dots-fill"></i> Observada</span>`;
        } else {
            badgeEstado = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-0.5 fw-bold" style="font-size:0.7rem;"><i class="bi bi-x-circle-fill"></i> Rechazada</span>`;
        }

        return `
        <div class="col-12 col-md-6 col-xl-4">
            <div class="oc-approval-card status-${oc.estado} h-100 d-flex flex-column justify-content-between p-3">
                <div>
                    <!-- Header Card -->
                    <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
                        <div class="d-flex align-items-center gap-1.5 flex-wrap">
                            <span class="btn-oc-code py-1 px-2" onclick="window.verDetalleOC('${oc.id}')" title="Ver Detalle">
                                <i class="bi bi-eye"></i> ${oc.id}
                            </span>
                            ${badgePrioridad}
                        </div>
                        <div class="text-end">
                            <div class="text-secondary fw-bold" style="font-size:0.68rem; text-transform:uppercase;">IMPORTE</div>
                            <div class="fw-black text-dark" style="font-size:1.15rem; letter-spacing:-0.02em;">
                                ${oc.moneda || 'S/'} ${(oc.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>

                    <!-- Meta datos: Fecha, Usuario y Almacén -->
                    <div class="d-flex align-items-center justify-content-between text-muted mb-2 pb-2 border-bottom flex-wrap gap-1" style="font-size:0.75rem;">
                        <span><i class="bi bi-calendar3 text-primary"></i> ${oc.fecha}</span>
                        <span class="fw-bold text-dark"><i class="bi bi-person-circle text-primary"></i> ${oc.usuario || 'SISTEMA'}</span>
                        <span class="badge bg-light text-dark border">Sede ${oc.almacen || 'Principal'}</span>
                    </div>

                    <!-- Proveedor & Solicitante -->
                    <div class="mb-2">
                        <div class="text-secondary fw-bold" style="font-size:0.68rem; text-transform:uppercase;">Proveedor</div>
                        <div class="fw-bold text-dark text-truncate" style="font-size:0.86rem;" title="${oc.proveedor || ''}">${oc.proveedor || 'Sin Proveedor'}</div>
                        ${oc.ruc && oc.ruc !== '-' ? `<div class="text-secondary" style="font-size:0.75rem;">RUC: ${oc.ruc}</div>` : ''}
                    </div>

                    <div class="mb-2">
                        <div class="text-secondary fw-bold" style="font-size:0.68rem; text-transform:uppercase;">Solicitante / Destino</div>
                        <div class="text-dark fw-semibold text-truncate" style="font-size:0.82rem;">${oc.solicitante || 'No especificado'}</div>
                        <div class="text-muted text-truncate" style="font-size:0.75rem;">${oc.destino || ''}</div>
                    </div>

                    <!-- Motivo / Justificación -->
                    <div class="p-2 rounded-2 bg-light border mb-3" style="font-size:0.78rem;">
                        <div class="text-secondary fw-bold text-uppercase" style="font-size:0.68rem;"><i class="bi bi-card-text"></i> Motivo:</div>
                        <div class="text-dark fw-medium text-truncate-2" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;" title="${oc.justificacion || ''}">
                            ${oc.justificacion || 'Sin motivo detallado'}
                        </div>
                    </div>
                </div>

                <!-- Footer Card con Acciones Directas -->
                <div class="pt-2 border-top d-flex align-items-center justify-content-between gap-1 flex-wrap">
                    <div class="d-flex align-items-center gap-1">
                        <button class="btn btn-outline-secondary btn-sm rounded-2 px-2 py-1" onclick="window.verDetalleOC('${oc.id}')" title="Ver Detalle">
                            <i class="bi bi-eye"></i> Detalle
                        </button>
                    </div>
                    <div class="d-flex align-items-center gap-1">
                        ${oc.estado === 'pendiente' ? `
                            <button class="btn-oc-autorizar" onclick="window.abrirAccionRapida('${oc.id}', 'aprobar')">
                                <i class="bi bi-check-lg"></i> AUTORIZAR
                            </button>
                            <button class="btn-oc-denegar" onclick="window.abrirAccionRapida('${oc.id}', 'rechazar')">
                                <i class="bi bi-x-lg"></i> DENEGAR
                            </button>
                        ` : `
                            ${badgeEstado}
                        `}
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    // Template para Fila de Tabla
    function generarFilaTablaHTML(oc) {
        return `
        <tr>
            <!-- Columna ACCIÓN -->
            <td class="text-nowrap" style="width: 1%;">
                ${oc.estado === 'pendiente' ? `
                    <div class="d-inline-flex align-items-center gap-1.5">
                        <button class="btn-oc-autorizar" onclick="window.abrirAccionRapida('${oc.id}', 'aprobar')" title="Autorizar Orden de Compra">
                            <i class="bi bi-check-lg"></i> AUTORIZAR
                        </button>
                        <button class="btn-oc-denegar" onclick="window.abrirAccionRapida('${oc.id}', 'rechazar')" title="Denegar Orden de Compra">
                            <i class="bi bi-x-lg"></i> DENEGAR
                        </button>
                    </div>
                ` : oc.estado === 'aprobado' ? `
                    <span class="badge bg-success text-white rounded-pill px-2.5 py-1 fw-bold" style="font-size:0.72rem;">
                        <i class="bi bi-check-circle-fill"></i> AUTORIZADO
                    </span>
                ` : oc.estado === 'observado' ? `
                    <span class="badge text-indigo rounded-pill px-2.5 py-1 fw-bold" style="background:#e0e7ff; color:#4338ca; font-size:0.72rem;">
                        <i class="bi bi-chat-dots-fill"></i> OBSERVADO
                    </span>
                ` : `
                    <span class="badge bg-danger text-white rounded-pill px-2.5 py-1 fw-bold" style="font-size:0.72rem;">
                        <i class="bi bi-x-circle-fill"></i> DENEGADO
                    </span>
                `}
            </td>

            <!-- Columna FECHA -->
            <td class="text-nowrap fw-semibold text-secondary" style="width: 1%; font-size:0.80rem;">
                <i class="bi bi-calendar3 me-1 text-muted"></i>${oc.fecha || '—'}
            </td>

            <!-- Columna USUARIO -->
            <td class="text-nowrap" style="width: 1%;">
                <div class="fw-bold text-dark" style="font-size:0.82rem;" title="${oc.usuario || 'SISTEMA'}">
                    <i class="bi bi-person-fill text-primary me-1"></i>${oc.usuario || 'SISTEMA'}
                </div>
            </td>

            <!-- Columna ORDEN COMPRA -->
            <td class="text-nowrap" style="width: 1%;">
                <span class="btn-oc-code" onclick="window.verDetalleOC('${oc.id}')" title="Ver Detalle de la Orden">
                    <i class="bi bi-eye"></i> ${String(oc.id || '').replace(/^ENT-/i, '')}
                </span>
            </td>

            <!-- Columna MOTIVO / JUSTIFICACIÓN -->
            <td>
                <div class="text-dark fw-medium" style="font-size:0.82rem;" title="${oc.justificacion || ''}">
                    ${oc.justificacion || 'Sin motivo'}
                </div>
            </td>

            <!-- Columna SOLICITANTE -->
            <td>
                <div class="fw-semibold text-secondary" style="font-size:0.82rem;" title="${oc.solicitante || ''}">
                    ${oc.solicitante || 'No especificado'}
                </div>
            </td>

            <!-- Columna PROVEEDOR -->
            <td>
                <div class="fw-bold text-dark" style="font-size:0.82rem;" title="${oc.proveedor || ''}">
                    ${oc.proveedor || 'Sin Proveedor'}
                </div>
            </td>

            <!-- Columna IMPORTE -->
            <td class="text-end text-nowrap" style="width: 1%;">
                <span class="fw-black text-dark" style="font-size:0.92rem; letter-spacing:-0.01em;">
                    ${oc.moneda || 'S/'} ${(oc.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </td>
        </tr>
        `;
    }

    // Modal de Detalle Completo
    window.verDetalleOC = function(idOC) {
        const oc = window._gerenciaOC.ordenes.find(o => o.id === idOC);
        if (!oc) return;
        window._gerenciaOC.ordenSeleccionada = oc;

        // Inyectar datos en modal
        document.getElementById('det-codigo-oc').innerText = oc.id;
        document.getElementById('det-fecha-emision').innerText = 'Emitido el ' + (oc.fecha || '—');
        document.getElementById('det-proveedor-nombre').innerText = oc.proveedor || 'No especificado';
        document.getElementById('det-proveedor-ruc').innerText = 'RUC: ' + (oc.ruc || '-');
        document.getElementById('det-proveedor-contacto').innerText = 'Contacto: ' + (oc.contacto || 'No especificado');
        document.getElementById('det-destino-almacen').innerText = 'Sede / Almacén: ' + (oc.almacen || 'Principal');
        document.getElementById('det-solicitante').innerText = 'Solicitado por: ' + (oc.solicitante || '-');
        document.getElementById('det-unidad-destino').innerText = 'Destino: ' + (oc.destino || '-');
        document.getElementById('det-justificacion').innerText = oc.justificacion || '-';

        // Cálculo Económico exacto
        const total = oc.total || 0;
        let subtotal = 0;
        let igv = 0;
        const tipoIgv = oc.tipo_igv || 'incluido';

        if (tipoIgv === 'sin_igv') {
            subtotal = total;
            igv = 0;
        } else {
            subtotal = total / 1.18;
            igv = total - subtotal;
        }

        document.getElementById('det-monto-subtotal').innerText = (oc.moneda || 'S/') + ' ' + subtotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('det-monto-igv').innerText = (oc.moneda || 'S/') + ' ' + igv.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('det-condicion-pago').innerText = oc.condicionPago || 'Al contado';
        document.getElementById('det-monto-total').innerText = (oc.moneda || 'S/') + ' ' + total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Badges
        const bPrio = document.getElementById('det-badge-prioridad');
        if (bPrio) {
            bPrio.innerText = oc.prioridad || 'NORMAL';
            bPrio.className = oc.prioridad === 'URGENTE' ? 'badge bg-danger text-white rounded-pill fw-bold' : 
                              oc.prioridad === 'ALTA' ? 'badge bg-warning text-dark rounded-pill fw-bold' : 
                              'badge bg-secondary text-white rounded-pill fw-bold';
        }

        const bEst = document.getElementById('det-badge-estado');
        if (bEst) {
            const estLimp = (oc.estado || 'pendiente').toLowerCase();
            bEst.innerText = estLimp.toUpperCase();
            if (estLimp === 'pendiente' || estLimp === 'registrado' || estLimp === 'registrada') {
                bEst.className = 'badge rounded-pill fw-bold';
                bEst.style.backgroundColor = '#64748b';
                bEst.style.setProperty('color', '#ffffff', 'important');
            } else if (estLimp === 'aprobado' || estLimp === 'aprobada') {
                bEst.className = 'badge rounded-pill fw-bold';
                bEst.style.backgroundColor = '#16a34a';
                bEst.style.setProperty('color', '#ffffff', 'important');
            } else if (estLimp === 'procesado' || estLimp === 'procesada') {
                bEst.className = 'badge rounded-pill fw-bold';
                bEst.style.backgroundColor = '#0284c7';
                bEst.style.setProperty('color', '#ffffff', 'important');
            } else if (estLimp === 'observado' || estLimp === 'observada') {
                bEst.className = 'badge rounded-pill fw-bold';
                bEst.style.backgroundColor = '#f59e0b';
                bEst.style.setProperty('color', '#ffffff', 'important');
            } else {
                bEst.className = 'badge rounded-pill fw-bold';
                bEst.style.backgroundColor = '#dc2626';
                bEst.style.setProperty('color', '#ffffff', 'important');
            }
        }

        // Historial
        const histEl = document.getElementById('det-historial-content');
        if (histEl) {
            histEl.innerText = oc.historial || 'Sin historial registrado.';
        }

        // Items tabla
        const items = oc.items || [];
        const itemsCountEl = document.getElementById('det-items-count');
        if (itemsCountEl) {
            itemsCountEl.innerText = items.length + ' ítem' + (items.length !== 1 ? 's' : '');
        }

        const cuerpoItems = document.getElementById('det-tabla-items-body');
        if (cuerpoItems) {
            if (items.length === 0) {
                cuerpoItems.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">Sin artículos registrados</td></tr>`;
            } else {
                cuerpoItems.innerHTML = items.map(it => `
                    <tr>
                        <td class="fw-bold text-dark font-monospace" style="font-size:0.8rem;">${it.codigo}</td>
                        <td class="text-dark">${it.descripcion}</td>
                        <td class="text-center fw-bold">${it.cant}</td>
                        <td class="text-center text-secondary fw-semibold">${it.um}</td>
                        <td class="text-end">${oc.moneda || 'S/'} ${(it.pu || 0).toFixed(2)}</td>
                        <td class="text-end fw-bold text-dark">${oc.moneda || 'S/'} ${(it.total || 0).toFixed(2)}</td>
                    </tr>
                `).join('');
            }
        }

        // Renderizado dinámico de Documentos Adjuntos (Cotización, Factura, Voucher)
        const docsContainer = document.getElementById('det-documentos-adjuntos');
        const docsCountBadge = document.getElementById('det-docs-count');
        const docs = [];
        if (oc.url_cotizacion) {
            docs.push({ tipo: 'Cotización', url: oc.url_cotizacion, icon: 'bi-file-earmark-text', color: 'text-primary' });
        }
        if (oc.url_factura) {
            docs.push({ tipo: 'Factura / Comprobante', url: oc.url_factura, icon: 'bi-file-earmark-check', color: 'text-success' });
        }
        if (oc.url_voucher) {
            docs.push({ tipo: 'Voucher / Sustento', url: oc.url_voucher, icon: 'bi-file-earmark-pdf', color: 'text-danger' });
        }

        if (docsCountBadge) {
            docsCountBadge.innerText = docs.length + ' Adjunto' + (docs.length !== 1 ? 's' : '');
            docsCountBadge.className = docs.length ? 'badge bg-success-subtle text-success fw-bold' : 'badge bg-secondary-subtle text-secondary fw-bold';
        }

        if (docsContainer) {
            if (docs.length === 0) {
                docsContainer.innerHTML = `
                    <div class="text-center py-3 text-muted" style="font-size:0.82rem;">
                        <i class="bi bi-paperclip fs-5 d-block mb-1 text-secondary opacity-50"></i>
                        Sin documentos adjuntos
                    </div>
                `;
            } else {
                docsContainer.innerHTML = docs.map(d => `
                    <div class="list-group-item px-0 py-2 d-flex justify-content-between align-items-center border-bottom-0">
                        <div class="d-flex align-items-center gap-2 text-truncate">
                            <i class="bi ${d.icon} ${d.color} fs-5 flex-shrink-0"></i>
                            <div class="text-truncate">
                                <div class="fw-bold text-dark text-truncate" style="font-size:0.82rem;">${d.tipo}</div>
                                <div class="text-muted text-truncate" style="font-size:0.72rem;">Documento adjunto a la OC</div>
                            </div>
                        </div>
                        <a href="${d.url}" target="_blank" class="btn btn-sm btn-outline-primary rounded-2 py-1 px-2.5 d-flex align-items-center gap-1 flex-shrink-0" style="font-size:0.75rem;">
                            <i class="bi bi-eye"></i> Ver
                        </a>
                    </div>
                `).join('');
            }
        }

        // Mostrar / ocultar botones de acción en footer si ya no está pendiente
        const actBtns = document.getElementById('det-modal-action-buttons');
        if (actBtns) {
            const estActual = (oc.estado || '').toLowerCase();
            const esPendiente = (estActual === 'pendiente' || estActual === 'registrado' || estActual === 'registrada');
            if (esPendiente) {
                actBtns.style.setProperty('display', 'flex', 'important');
            } else {
                actBtns.style.setProperty('display', 'none', 'important');
            }
        }

        const modalEl = document.getElementById('modalDetalleOC');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    };

    // Acciones Rápidas (Aprobar / Rechazar / Observar)
    window.abrirAccionRapida = function(idOC, tipo) {
        const oc = window._gerenciaOC.ordenes.find(o => o.id === idOC);
        if (!oc) return;
        window._gerenciaOC.ordenSeleccionada = oc;
        window.abrirModalAccion(tipo);
    };

    window.abrirModalAccion = function(tipo) {
        const oc = window._gerenciaOC.ordenSeleccionada;
        if (!oc) return;
        window._gerenciaOC.tipoAccionModal = tipo;

        if (tipo === 'aprobar') {
            const codEl = document.getElementById('modal-autorizar-codigo');
            if (codEl) codEl.innerText = oc.id;
            const montoEl = document.getElementById('modal-autorizar-monto');
            if (montoEl) montoEl.innerText = (oc.moneda || 'S/') + ' ' + (oc.total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const chk = document.getElementById('modal-autorizar-check');
            if (chk) chk.checked = false;
            const com = document.getElementById('modal-autorizar-comentario');
            if (com) com.value = '';

            const modalAutEl = document.getElementById('modalAutorizarOC');
            if (modalAutEl) {
                const modalAut = bootstrap.Modal.getOrCreateInstance(modalAutEl);
                modalAut.show();
            }
            return;
        }

        const iconWrap = document.getElementById('modal-accion-icon-wrap');
        const icon = document.getElementById('modal-accion-icon');
        const titulo = document.getElementById('modal-accion-titulo');
        const subtitulo = document.getElementById('modal-accion-subtitulo');
        const mensaje = document.getElementById('modal-accion-mensaje');
        const labelComentario = document.getElementById('modal-accion-comentario-label');
        const txtComentario = document.getElementById('modal-accion-comentario-txt');
        const btnConfirmar = document.getElementById('modal-accion-btn-confirmar');

        if (txtComentario) txtComentario.value = '';
        subtitulo.innerText = `Orden de Compra: ${oc.id} • ${oc.proveedor} (${oc.moneda || 'S/'} ${(oc.total || 0).toFixed(2)})`;

        if (tipo === 'observar') {
            iconWrap.style.background = '#e0e7ff';
            icon.className = 'bi bi-chat-dots-fill text-primary';
            titulo.innerText = 'Observar y Solicitar Sustento';
            mensaje.innerText = 'La orden quedará en estado de revisión. Indique qué sustento técnico, cotización alternativa o detalle requiere del solicitante.';
            labelComentario.innerText = 'Detalle de la Observación (Requerido):';
            btnConfirmar.className = 'btn btn-primary rounded-3 px-4 fw-bold';
            btnConfirmar.innerText = 'Enviar Observación';
        } else if (tipo === 'rechazar') {
            iconWrap.style.background = '#fee2e2';
            icon.className = 'bi bi-x-circle-fill text-danger';
            titulo.innerText = 'Rechazar / Desestimar Orden de Compra';
            mensaje.innerText = 'Esta acción desestimará la adquisición requerida. Por favor registre el motivo del rechazo para conocimiento del solicitante y auditoría.';
            labelComentario.innerText = 'Motivo de Rechazo (Obligatorio):';
            btnConfirmar.className = 'btn btn-danger rounded-3 px-4 fw-bold';
            btnConfirmar.innerText = 'Rechazar Orden';
        }

        const modalAccionEl = document.getElementById('modalConfirmarAccionOC');
        if (modalAccionEl) {
            const modalAccion = bootstrap.Modal.getOrCreateInstance(modalAccionEl);
            modalAccion.show();
        }
    };

    // Confirmación desde Modal Autorizar (Diseño Solicitado)
    window.confirmarAutorizacionModal = async function() {
        const chk = document.getElementById('modal-autorizar-check');
        if (chk && !chk.checked) {
            alert('Por favor marque la casilla "Confirmo realizar la autorización" para continuar.');
            return;
        }

        const comentario = (document.getElementById('modal-autorizar-comentario')?.value || '').trim();
        const oc = window._gerenciaOC.ordenSeleccionada;
        if (!oc) return;

        const usuarioActual = localStorage.getItem('fleet_nombre_usuario') || localStorage.getItem('fleet_user') || window.usuarioActual || 'Dirección / Gerencia';
        const fechaHora = new Date().toLocaleString('es-PE');

        try {
            // Persistir en Base de Datos MySQL del ERP
            const resp = await fetch(`/api/almacen/entradas/${encodeURIComponent(oc.id)}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    estado: 'Aprobado',
                    comentario: comentario,
                    usuario: usuarioActual
                })
            });

            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                throw new Error(errData.error || 'Error en el servidor al autorizar');
            }

            oc.estado = 'aprobado';
            oc.historial = `Aprobado por ${usuarioActual} el ${fechaHora}. ${comentario ? 'Nota: ' + comentario : ''}`;

            // Cerrar modales
            const modalAutEl = document.getElementById('modalAutorizarOC');
            if (modalAutEl) {
                bootstrap.Modal.getInstance(modalAutEl)?.hide();
            }
            const modalDetalleEl = document.getElementById('modalDetalleOC');
            if (modalDetalleEl) {
                bootstrap.Modal.getInstance(modalDetalleEl)?.hide();
            }

            // Actualizar UI
            actualizarKpisYBadges();
            window.aplicarFiltrosOC();
            if (typeof window.cargarDatasetDesdeAPI === 'function') {
                window.cargarDatasetDesdeAPI();
            }

            mostrarToastGerencia('✅ Orden de Compra Autorizada', `Se autorizó la ${oc.id} correctamente.`);
        } catch(err) {
            alert('❌ Error al autorizar Orden de Compra: ' + err.message);
        }
    };

    // Ejecutar Acción Confirmada (Observar / Rechazar)
    window.ejecutarAccionGerencial = async function() {
        const oc = window._gerenciaOC.ordenSeleccionada;
        const tipo = window._gerenciaOC.tipoAccionModal;
        const comentario = (document.getElementById('modal-accion-comentario-txt')?.value || '').trim();

        if ((tipo === 'rechazar' || tipo === 'observar') && !comentario) {
            alert('Por favor ingrese un comentario u observación antes de continuar.');
            return;
        }

        const usuarioActual = localStorage.getItem('fleet_nombre_usuario') || localStorage.getItem('fleet_user') || window.usuarioActual || 'Dirección / Gerencia';
        const fechaHora = new Date().toLocaleString('es-PE');

        let nuevoEstadoBD = 'Registrado';
        if (tipo === 'aprobar') {
            nuevoEstadoBD = 'Aprobado';
        } else if (tipo === 'observar') {
            nuevoEstadoBD = 'Observado';
        } else if (tipo === 'rechazar') {
            nuevoEstadoBD = 'Rechazado';
        }

        try {
            // Persistir en Base de Datos MySQL del ERP
            const resp = await fetch(`/api/almacen/entradas/${encodeURIComponent(oc.id)}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    estado: nuevoEstadoBD,
                    comentario: comentario,
                    usuario: usuarioActual
                })
            });

            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                throw new Error(errData.error || 'Error en el servidor al procesar la acción');
            }

            if (tipo === 'aprobar') {
                oc.estado = 'aprobado';
                oc.historial = `Aprobado por ${usuarioActual} el ${fechaHora}. ${comentario ? 'Nota: ' + comentario : ''}`;
            } else if (tipo === 'observar') {
                oc.estado = 'observado';
                oc.historial = `Observado por ${usuarioActual} el ${fechaHora}. Observación: ${comentario}`;
            } else if (tipo === 'rechazar') {
                oc.estado = 'rechazado';
                oc.historial = `Rechazado por ${usuarioActual} el ${fechaHora}. Motivo: ${comentario}`;
            }

            // Cerrar modales
            const modalAccionEl = document.getElementById('modalConfirmarAccionOC');
            if (modalAccionEl) {
                bootstrap.Modal.getInstance(modalAccionEl)?.hide();
            }
            const modalDetalleEl = document.getElementById('modalDetalleOC');
            if (modalDetalleEl) {
                bootstrap.Modal.getInstance(modalDetalleEl)?.hide();
            }

            // Actualizar UI
            actualizarKpisYBadges();
            window.aplicarFiltrosOC();
            if (typeof window.cargarDatasetDesdeAPI === 'function') {
                window.cargarDatasetDesdeAPI();
            }

            // Mostrar notificación
            mostrarToastGerencia(
                tipo === 'aprobar' ? '✅ Orden de Compra Aprobada' : 
                tipo === 'observar' ? '💬 Orden de Compra Observada' : '❌ Orden de Compra Rechazada',
                `Se actualizó el estado de la ${oc.id} con éxito.`
            );
        } catch(err) {
            alert('❌ Error al actualizar estado: ' + err.message);
        }
    };

    function mostrarToastGerencia(titulo, mensaje) {
        if (typeof window.showToast === 'function') {
            window.showToast(titulo + ': ' + mensaje);
            return;
        }
        // Fallback visual
        const toast = document.createElement('div');
        toast.className = 'position-fixed bottom-0 end-0 p-3';
        toast.style.zIndex = '9999';
        toast.innerHTML = `
            <div class="toast show bg-dark text-white rounded-3 shadow-lg p-3 border-0" role="alert">
                <div class="d-flex align-items-center gap-2">
                    <i class="bi bi-bell-fill text-warning"></i>
                    <div>
                        <div class="fw-bold" style="font-size:0.85rem;">${titulo}</div>
                        <div class="text-secondary" style="font-size:0.78rem; color:#cbd5e1!important;">${mensaje}</div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    // Restablecer filtros
    window.limpiarFiltrosOC = function() {
        const inp = document.getElementById('filtro-buscar-oc');
        if (inp) inp.value = '';
        const sel = document.getElementById('filtro-almacen-oc');
        if (sel) sel.value = '';
        const fDesde = document.getElementById('filtro-fecha-desde');
        const fHasta = document.getElementById('filtro-fecha-hasta');
        if (fDesde) fDesde.value = '';
        if (fHasta) fHasta.value = '';
        window.filtrarPorTab('pendiente');
    };

    // Recargar dataset
    window.recargarAprobacionesOC = function() {
        window.renderizarModuloGerenciaOC();
        mostrarToastGerencia('🔄 Bandeja Sincronizada', 'Se consultaron las órdenes del ERP.');
    };

    // Exportar acta
    window.exportarResumenAprobaciones = function() {
        alert('Generando Acta Ejecutiva de Aprobaciones de Compra en formato Excel/PDF...');
    };

    // Ejecución inicial automática al cargar la vista
    window.renderizarModuloGerenciaOC();

})();
