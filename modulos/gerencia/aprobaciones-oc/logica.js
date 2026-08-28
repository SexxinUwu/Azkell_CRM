// =========================================================================
// MÓDULO: GERENCIA - APROBACIÓN DE ÓRDENES DE COMPRA
// =========================================================================

(function() {
    'use strict';

    // Estado local del módulo
    window._gerenciaOC = window._gerenciaOC || {
        tabActivo: 'pendiente',
        modoVista: 'cards',
        ordenes: [],
        ordenSeleccionada: null,
        tipoAccionModal: null
    };

    // Dataset mockup inicial con datos de negocio realistas del ERP
    const MOCK_ORDENES_COMPRA = [
        {
            id: 'OC-2026-0142',
            fecha: '2026-08-28 10:30 AM',
            proveedor: 'FERREYROS S.A.',
            ruc: '20100035123',
            contacto: 'ventas@ferreyros.com.pe | 987-654-321',
            almacen: 'Lurín',
            solicitante: 'Ing. Carlos Mendoza (Jefe de Taller)',
            destino: 'Volvo FH540 (Placa: B9Z-841) | OT #OT-8492',
            prioridad: 'URGENTE',
            estado: 'pendiente',
            moneda: 'S/',
            subtotal: 12584.75,
            igv: 2265.25,
            total: 14850.00,
            condicionPago: 'Crédito 30 Días',
            justificacion: 'Se requiere la compra inmediata del Kit de filtros originales CAT y baldes de aceite 15W40 para cumplir con el Mantenimiento Preventivo de 500 horas programado de la unidad tracto B9Z-841 que tiene salida prioritaria a ruta minera el fin de semana.',
            items: [
                { codigo: 'FLT-CAT-1R0716', descripcion: 'Filtro de Aceite de Motor CAT 1R-0716', cant: 4, um: 'UND', pu: 185.00, total: 740.00 },
                { codigo: 'FLT-CAT-1R0749', descripcion: 'Filtro Secundario de Combustible CAT', cant: 4, um: 'UND', pu: 220.00, total: 880.00 },
                { codigo: 'LUB-CAT-15W40', descripcion: 'Aceite de Motor CAT DEO 15W40 (Balde 5 Gal)', cant: 12, um: 'BAL', pu: 910.00, total: 10920.00 },
                { codigo: 'SERV-ANAL-ACEITE', descripcion: 'Kit Análisis de Aceite SOS Cat', cant: 2, um: 'SERV', pu: 22.37, total: 44.75 }
            ],
            historial: 'Registrado por Almacén Lurín el 28/08/2026 10:30 AM. Pendiente de aprobación por Dirección.'
        },
        {
            id: 'OC-2026-0141',
            fecha: '2026-08-28 09:15 AM',
            proveedor: 'LLANTAS Y RECAUCHES DEL PERÚ S.A.C.',
            ruc: '20512894561',
            contacto: 'pedidos@recalperu.pe | 945-123-889',
            almacen: 'Callao',
            solicitante: 'Marcos Alva (Sup. Neumáticos)',
            destino: 'Flota Cisternas (Renovación de Eje de Tracción)',
            prioridad: 'ALTA',
            estado: 'pendiente',
            moneda: 'S/',
            subtotal: 15423.73,
            igv: 2776.27,
            total: 18200.00,
            condicionPago: 'Crédito 45 Días',
            justificacion: 'Reemplazo de 8 llantas que alcanzaron el límite de seguridad de 3mm de remanente según el último reporte de inspección de neumáticos.',
            items: [
                { codigo: 'LLAN-MICH-295', descripcion: 'Neumático 295/80R22.5 Michelin X MultiWay 3D XZE', cant: 8, um: 'UND', pu: 1928.00, total: 15424.00 }
            ],
            historial: 'Registrado por Sup. Neumáticos. Pendiente de visto bueno gerencial.'
        },
        {
            id: 'OC-2026-0140',
            fecha: '2026-08-27 04:45 PM',
            proveedor: 'DISTRIBUIDORA INDUSTRIAL DIESEL E.I.R.L.',
            ruc: '20489921034',
            contacto: 'ventas@dieseldist.pe | 981-224-411',
            almacen: 'Arequipa',
            solicitante: 'Roberto Salas (Mecánico Senior)',
            destino: 'Unidad Freightliner Cascadia (Placa: V8T-910)',
            prioridad: 'MEDIA',
            estado: 'pendiente',
            moneda: 'S/',
            subtotal: 3305.08,
            igv: 594.92,
            total: 3900.00,
            condicionPago: 'Contado Contraentrega',
            justificacion: 'Falla en inyector N° 3 y sensor de presión de riel común detectado en diagnóstico electrónico por escáner Cummins.',
            items: [
                { codigo: 'INJ-BOSCH-CR', descripcion: 'Inyector Common Rail Bosch Reconstruido Certificado', cant: 1, um: 'UND', pu: 2800.00, total: 2800.00 },
                { codigo: 'SENS-PRESS-RAIL', descripcion: 'Sensor de Presión de Riel Common Rail Cummins ISX', cant: 1, um: 'UND', pu: 505.08, total: 505.08 }
            ],
            historial: 'Pendiente de aprobación de Gerencia.'
        },
        {
            id: 'OC-2026-0139',
            fecha: '2026-08-27 02:20 PM',
            proveedor: 'IMPEX REPUESTOS AUTOMOTRICES S.A.',
            ruc: '20199485712',
            contacto: 'ventas@impex.com.pe | 993-412-005',
            almacen: 'Lurín',
            solicitante: 'Almacén Central',
            destino: 'Reposición Stock Crítico Taller',
            prioridad: 'NORMAL',
            estado: 'pendiente',
            moneda: 'S/',
            subtotal: 1271.19,
            igv: 228.81,
            total: 1500.00,
            condicionPago: 'Crédito 15 Días',
            justificacion: 'Reposición de zapatas y kits de resortes de freno que alcanzaron el stock mínimo de seguridad en almacén central.',
            items: [
                { codigo: 'FRN-ZAP-BENDIX', descripcion: 'Juego de Zapatas de Freno Tipo Q-Plus 4515Q', cant: 4, um: 'JGO', pu: 240.00, total: 960.00 },
                { codigo: 'FRN-KIT-RES', descripcion: 'Kit de Resortes y Pines de Freno Bendix Heavy Duty', cant: 4, um: 'KIT', pu: 77.80, total: 311.20 }
            ],
            historial: 'Solicitud estándar de almacén. En espera de aprobación.'
        },
        {
            id: 'OC-2026-0138',
            fecha: '2026-08-26 11:00 AM',
            proveedor: 'LUBRICANTES Y COMBUSTIBLES DEL SUR S.A.C.',
            ruc: '20601248951',
            contacto: 'gerencia@lubrisur.pe | 954-112-990',
            almacen: 'Lurín',
            solicitante: 'Jefe de Operaciones',
            destino: 'Abastecimiento de Grasa y Refrigerante para Taller',
            prioridad: 'NORMAL',
            estado: 'aprobado',
            moneda: 'S/',
            subtotal: 5762.71,
            igv: 1037.29,
            total: 6800.00,
            condicionPago: 'Crédito 30 Días',
            justificacion: 'Compra programada mensual de tambor de grasa de litio para chasis y cilindros de refrigerante orgánico 50/50.',
            items: [
                { codigo: 'LUB-GRAS-EP2', descripcion: 'Grasa Litio Compleja EP2 para Chasis (Tambor 180 Kg)', cant: 1, um: 'TBR', pu: 3200.00, total: 3200.00 },
                { codigo: 'REF-ORG-5050', descripcion: 'Refrigerante Fleetguard Compleat EG 50/50 (Cilindro 55 Gal)', cant: 2, um: 'CIL', pu: 1281.35, total: 2562.71 }
            ],
            historial: 'Aprobado por Gerencia General (Ing. Alejandro Zevallos) el 26/08/2026 03:15 PM.'
        },
        {
            id: 'OC-2026-0137',
            fecha: '2026-08-25 03:30 PM',
            proveedor: 'TOTAL ENERGIES PERÚ S.A.C.',
            ruc: '20349811234',
            contacto: 'atencion@totalenergies.pe | 988-771-224',
            almacen: 'Callao',
            solicitante: 'Almacén Auxiliar Callao',
            destino: 'Stock de Valvolina para Cajas Eaton',
            prioridad: 'BAJA',
            estado: 'rechazado',
            moneda: 'S/',
            subtotal: 3559.32,
            igv: 640.68,
            total: 4200.00,
            condicionPago: 'Contado',
            justificacion: 'Requerimiento de 10 baldes de aceite de transmisión 80W90.',
            items: [
                { codigo: 'LUB-TOT-80W90', descripcion: 'Aceite Transmisión Total Transmission Axle 7 80W90', cant: 10, um: 'BAL', pu: 355.93, total: 3559.32 }
            ],
            historial: 'Desestimado por Gerencia el 25/08/2026. Motivo: Se constató existencia de 14 baldes en sede Lurín disponibles para transferencia interna.'
        },
        {
            id: 'OC-2026-0136',
            fecha: '2026-08-24 09:00 AM',
            proveedor: 'CUMMINS PERÚ S.A.',
            ruc: '20100142981',
            contacto: 'repuestos@cummins.pe | 991-002-334',
            almacen: 'Lurín',
            solicitante: 'Jefe de Mantenimiento',
            destino: 'Tracto Kenworth T800 (Placa: D3R-780)',
            prioridad: 'ALTA',
            estado: 'observado',
            moneda: 'S/',
            subtotal: 7330.51,
            igv: 1319.49,
            total: 8650.00,
            condicionPago: 'Crédito 30 Días',
            justificacion: 'Reemplazo preventivo de turbocargador por juego axial excesivo detectado en banco de prueba.',
            items: [
                { codigo: 'TURB-HOLSET-HE300', descripcion: 'Turbocompresor Holset HE300VG Genuino Cummins', cant: 1, um: 'UND', pu: 7330.51, total: 7330.51 }
            ],
            historial: 'Observado por Gerencia el 24/08/2026. Observación: Solicitar segunda cotización comparativa antes de autorizar.'
        }
    ];

    // Inicialización del dataset (guardar o cargar de sessionStorage para persistir cambios en sesión)
    function inicializarDataset() {
        try {
            const guardado = sessionStorage.getItem('erp_gerencia_oc_mock');
            if (guardado) {
                window._gerenciaOC.ordenes = JSON.parse(guardado);
            } else {
                window._gerenciaOC.ordenes = JSON.parse(JSON.stringify(MOCK_ORDENES_COMPRA));
                sessionStorage.setItem('erp_gerencia_oc_mock', JSON.stringify(window._gerenciaOC.ordenes));
            }
        } catch (e) {
            window._gerenciaOC.ordenes = JSON.parse(JSON.stringify(MOCK_ORDENES_COMPRA));
        }
    }

    function guardarEstadoDataset() {
        try {
            sessionStorage.setItem('erp_gerencia_oc_mock', JSON.stringify(window._gerenciaOC.ordenes));
        } catch(e) {}
    }

    // Renderizar Dashboard y Lista
    window.renderizarModuloGerenciaOC = function() {
        inicializarDataset();
        actualizarKpisYBadges();
        window.aplicarFiltrosOC();
    };

    // Actualizar números de KPIs
    function actualizarKpisYBadges() {
        const ordenes = window._gerenciaOC.ordenes;
        
        const pend = ordenes.filter(o => o.estado === 'pendiente');
        const aprob = ordenes.filter(o => o.estado === 'aprobado');
        const obs = ordenes.filter(o => o.estado === 'observado');
        const rech = ordenes.filter(o => o.estado === 'rechazado');
        const urg = ordenes.filter(o => o.prioridad === 'URGENTE' && o.estado === 'pendiente');

        const sumMonto = (arr) => arr.reduce((acc, cur) => acc + (cur.total || 0), 0);

        // Actualizar contadores Bento
        const elPend = document.getElementById('kpi-count-pendientes');
        if (elPend) elPend.innerText = pend.length;
        const elPendMonto = document.getElementById('kpi-monto-pendientes');
        if (elPendMonto) elPendMonto.innerText = 'S/ ' + sumMonto(pend).toLocaleString('es-PE', { minimumFractionDigits: 2 });

        const elAprob = document.getElementById('kpi-count-aprobadas');
        if (elAprob) elAprob.innerText = aprob.length;
        const elAprobMonto = document.getElementById('kpi-monto-aprobadas');
        if (elAprobMonto) elAprobMonto.innerText = 'S/ ' + sumMonto(aprob).toLocaleString('es-PE', { minimumFractionDigits: 2 });

        const elObs = document.getElementById('kpi-count-observadas');
        if (elObs) elObs.innerText = obs.length;
        const elObsMonto = document.getElementById('kpi-monto-observadas');
        if (elObsMonto) elObsMonto.innerText = 'S/ ' + sumMonto(obs).toLocaleString('es-PE', { minimumFractionDigits: 2 });

        const elRech = document.getElementById('kpi-count-rechazadas');
        if (elRech) elRech.innerText = rech.length;
        const elRechMonto = document.getElementById('kpi-monto-rechazadas');
        if (elRechMonto) elRechMonto.innerText = 'S/ ' + sumMonto(rech).toLocaleString('es-PE', { minimumFractionDigits: 2 });

        // Actualizar badges en las pestañas
        const bTodos = document.getElementById('tab-badge-todos');
        if (bTodos) bTodos.innerText = ordenes.length;
        const bPend = document.getElementById('tab-badge-pendiente');
        if (bPend) bPend.innerText = pend.length;
        const bUrg = document.getElementById('tab-badge-urgente');
        if (bUrg) bUrg.innerText = urg.length;
        const bAprob = document.getElementById('tab-badge-aprobado');
        if (bAprob) bAprob.innerText = aprob.length;
        const bObs = document.getElementById('tab-badge-observado');
        if (bObs) bObs.innerText = obs.length;
        const bRech = document.getElementById('tab-badge-rechazado');
        if (bRech) bRech.innerText = rech.length;

        // Actualizar badge lateral en el menú si existe
        const sideBadge = document.getElementById('badge-count-gerencia');
        if (sideBadge) {
            sideBadge.innerText = pend.length > 0 ? pend.length : '0';
            sideBadge.className = pend.length > 0 ? 'section-badge bg-warning text-dark fw-bold' : 'section-badge';
        }
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
    window.cambiarModoVista = function(modo) {
        window._gerenciaOC.modoVista = modo;
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

    // Aplicar filtros de búsqueda y renderizar lista
    window.aplicarFiltrosOC = function() {
        const tab = window._gerenciaOC.tabActivo || 'pendiente';
        const txtBuscar = (document.getElementById('filtro-buscar-oc')?.value || '').toLowerCase().trim();
        const selAlmacen = (document.getElementById('filtro-almacen-oc')?.value || '').toLowerCase();

        let filtradas = window._gerenciaOC.ordenes.filter(item => {
            // Filtro por tab
            if (tab === 'pendiente' && item.estado !== 'pendiente') return false;
            if (tab === 'urgente' && (item.prioridad !== 'URGENTE' || item.estado !== 'pendiente')) return false;
            if (tab === 'aprobado' && item.estado !== 'aprobado') return false;
            if (tab === 'observado' && item.estado !== 'observado') return false;
            if (tab === 'rechazado' && item.estado !== 'rechazado') return false;

            // Filtro por almacén
            if (selAlmacen && !item.almacen.toLowerCase().includes(selAlmacen)) return false;

            // Filtro por texto
            if (txtBuscar) {
                const matchTexto = 
                    item.id.toLowerCase().includes(txtBuscar) ||
                    item.proveedor.toLowerCase().includes(txtBuscar) ||
                    item.ruc.toLowerCase().includes(txtBuscar) ||
                    item.solicitante.toLowerCase().includes(txtBuscar) ||
                    item.destino.toLowerCase().includes(txtBuscar) ||
                    item.justificacion.toLowerCase().includes(txtBuscar);
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

        // Renderizar Tarjetas
        if (wrapCards) {
            wrapCards.innerHTML = filtradas.map(oc => generarCardHTML(oc)).join('');
        }

        // Renderizar Tabla
        if (cuerpoTabla) {
            cuerpoTabla.innerHTML = filtradas.map(oc => generarFilaTablaHTML(oc)).join('');
        }
    };

    // Template para Card Ejecutiva
    function generarCardHTML(oc) {
        let badgePrioridad = '';
        if (oc.prioridad === 'URGENTE') {
            badgePrioridad = `<span class="badge bg-danger text-white rounded-pill px-2.5 py-1 fw-bold badge-urgente-pulse" style="font-size:0.72rem;"><i class="bi bi-fire"></i> URGENTE</span>`;
        } else if (oc.prioridad === 'ALTA') {
            badgePrioridad = `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning rounded-pill px-2 py-1 fw-bold" style="font-size:0.72rem;"><i class="bi bi-arrow-up-circle"></i> ALTA</span>`;
        } else {
            badgePrioridad = `<span class="badge bg-light text-secondary border rounded-pill px-2 py-1 fw-semibold" style="font-size:0.72rem;">NORMAL</span>`;
        }

        let badgeEstado = '';
        if (oc.estado === 'pendiente') {
            badgeEstado = `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2.5 py-1 fw-bold" style="font-size:0.72rem;"><i class="bi bi-clock-fill"></i> Pendiente Aprobación</span>`;
        } else if (oc.estado === 'aprobado') {
            badgeEstado = `<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-1 fw-bold" style="font-size:0.72rem;"><i class="bi bi-check-circle-fill"></i> Aprobada</span>`;
        } else if (oc.estado === 'observado') {
            badgeEstado = `<span class="badge text-indigo rounded-pill px-2.5 py-1 fw-bold" style="background:#e0e7ff; color:#4338ca; font-size:0.72rem;"><i class="bi bi-chat-left-text-fill"></i> Observada</span>`;
        } else {
            badgeEstado = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2.5 py-1 fw-bold" style="font-size:0.72rem;"><i class="bi bi-x-circle-fill"></i> Rechazada</span>`;
        }

        const primerItem = oc.items[0] ? `${oc.items[0].cant} ${oc.items[0].um} - ${oc.items[0].descripcion}` : '';
        const masItems = oc.items.length > 1 ? ` <span class="text-primary fw-semibold" style="font-size:0.75rem;">(+${oc.items.length - 1} ítem${oc.items.length > 2 ? 's' : ''})</span>` : '';

        return `
        <div class="col-12 col-xl-6">
            <div class="oc-approval-card status-${oc.estado} h-100 d-flex flex-column justify-content-between">
                <div>
                    <!-- Header Card -->
                    <div class="d-flex align-items-start justify-content-between gap-2 mb-2.5 flex-wrap">
                        <div class="d-flex align-items-center gap-2">
                            <h5 class="fw-black text-dark m-0" style="letter-spacing:-0.02em;">${oc.id}</h5>
                            ${badgePrioridad}
                            ${badgeEstado}
                        </div>
                        <span class="text-secondary fw-semibold" style="font-size:0.78rem;"><i class="bi bi-calendar3"></i> ${oc.fecha}</span>
                    </div>

                    <!-- Datos Principales -->
                    <div class="row g-2 mb-3">
                        <div class="col-12 col-sm-7">
                            <div class="text-secondary fw-bold" style="font-size:0.72rem; text-transform:uppercase;">Proveedor</div>
                            <div class="fw-bold text-dark text-truncate" style="font-size:0.9rem;">${oc.proveedor}</div>
                            <div class="text-muted" style="font-size:0.78rem;">RUC: ${oc.ruc}</div>
                        </div>
                        <div class="col-12 col-sm-5 text-sm-end">
                            <div class="text-secondary fw-bold" style="font-size:0.72rem; text-transform:uppercase;">Sede / Almacén</div>
                            <span class="badge bg-light text-dark border fw-bold" style="font-size:0.78rem;">Sede ${oc.almacen}</span>
                            <div class="text-muted text-truncate" style="font-size:0.76rem;">${oc.solicitante.split('(')[0]}</div>
                        </div>
                    </div>

                    <!-- Desglose Rápido / Justificación -->
                    <div class="p-2.5 rounded-3 bg-light border mb-3">
                        <div class="d-flex align-items-center justify-content-between mb-1" style="font-size:0.76rem;">
                            <span class="fw-bold text-secondary text-uppercase"><i class="bi bi-boxes"></i> Contenido Requerido:</span>
                            <span class="badge bg-white border text-secondary fw-bold">${oc.items.length} ítem${oc.items.length > 1 ? 's' : ''}</span>
                        </div>
                        <div class="text-dark fw-semibold text-truncate" style="font-size:0.83rem;">
                            ${primerItem}${masItems}
                        </div>
                        <div class="text-secondary text-truncate mt-1" style="font-size:0.78rem;" title="${oc.justificacion}">
                            <i class="bi bi-pin-angle text-primary"></i> ${oc.justificacion}
                        </div>
                    </div>
                </div>

                <!-- Footer Card con Montos y Botones de Acción -->
                <div class="pt-2 border-top d-flex align-items-center justify-content-between gap-2 flex-wrap">
                    <div>
                        <span class="text-secondary fw-bold" style="font-size:0.72rem; text-transform:uppercase;">Monto Total</span>
                        <h4 class="fw-black text-dark m-0" style="font-size:1.3rem; letter-spacing:-0.03em;">
                            ${oc.moneda} ${oc.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </h4>
                    </div>
                    <div class="d-flex align-items-center gap-1.5 flex-wrap">
                        <button class="btn btn-outline-secondary btn-sm rounded-3 px-2.5 py-1.5 fw-semibold" onclick="window.verDetalleOC('${oc.id}')" title="Ver Detalle Completo">
                            <i class="bi bi-eye-fill"></i> Detalle
                        </button>
                        ${oc.estado === 'pendiente' ? `
                            <button class="btn btn-action-obs btn-sm rounded-3 px-2.5 py-1.5" onclick="window.abrirAccionRapida('${oc.id}', 'observar')" title="Observar / Sustento">
                                <i class="bi bi-chat-dots"></i>
                            </button>
                            <button class="btn btn-action-reject btn-sm rounded-3 px-2.5 py-1.5" onclick="window.abrirAccionRapida('${oc.id}', 'rechazar')" title="Rechazar">
                                <i class="bi bi-x-lg"></i>
                            </button>
                            <button class="btn btn-action-approve btn-sm rounded-3 px-3 py-1.5 shadow-2xs" onclick="window.abrirAccionRapida('${oc.id}', 'aprobar')">
                                <i class="bi bi-check2-circle"></i> Aprobar
                            </button>
                        ` : `
                            <button class="btn btn-light border btn-sm rounded-3 px-3 py-1.5 text-secondary fw-semibold" onclick="window.verDetalleOC('${oc.id}')">
                                <i class="bi bi-journal-text"></i> Ver Dictamen
                            </button>
                        `}
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    // Template para Fila de Tabla
    function generarFilaTablaHTML(oc) {
        let badgeEstado = '';
        if (oc.estado === 'pendiente') {
            badgeEstado = `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2 py-1 fw-bold" style="font-size:0.72rem;">Pendiente</span>`;
        } else if (oc.estado === 'aprobado') {
            badgeEstado = `<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1 fw-bold" style="font-size:0.72rem;">Aprobada</span>`;
        } else if (oc.estado === 'observado') {
            badgeEstado = `<span class="badge rounded-pill px-2 py-1 fw-bold" style="background:#e0e7ff; color:#4338ca; font-size:0.72rem;">Observada</span>`;
        } else {
            badgeEstado = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1 fw-bold" style="font-size:0.72rem;">Rechazada</span>`;
        }

        return `
        <tr>
            <td>
                <div class="fw-black text-dark" style="font-size:0.9rem;">${oc.id}</div>
                <span class="text-muted" style="font-size:0.75rem;">${oc.fecha}</span>
            </td>
            <td>
                ${oc.prioridad === 'URGENTE' ? '<span class="badge bg-danger rounded-pill fw-bold" style="font-size:0.7rem;">URGENTE</span>' : 
                  oc.prioridad === 'ALTA' ? '<span class="badge bg-warning text-dark rounded-pill fw-bold" style="font-size:0.7rem;">ALTA</span>' : 
                  '<span class="badge bg-light text-secondary border rounded-pill" style="font-size:0.7rem;">NORMAL</span>'}
            </td>
            <td>
                <div class="fw-bold text-dark text-truncate" style="max-width:200px;">${oc.proveedor}</div>
                <span class="text-muted" style="font-size:0.76rem;">RUC: ${oc.ruc}</span>
            </td>
            <td>
                <div class="fw-semibold text-dark">Sede ${oc.almacen}</div>
                <span class="text-muted" style="font-size:0.76rem;">${oc.solicitante.split('(')[0]}</span>
            </td>
            <td>
                <div class="text-dark text-truncate" style="max-width:250px; font-size:0.82rem;" title="${oc.items.map(i=>i.descripcion).join(', ')}">
                    <strong>${oc.items.length} ítems:</strong> ${oc.items[0]?.descripcion || ''}
                </div>
                <div class="text-muted text-truncate" style="max-width:250px; font-size:0.75rem;">
                    ${oc.destino}
                </div>
            </td>
            <td class="text-end">
                <div class="fw-black text-dark" style="font-size:0.95rem;">${oc.moneda} ${oc.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div>
                <span class="text-muted" style="font-size:0.72rem;">${oc.condicionPago}</span>
            </td>
            <td class="text-center">
                ${badgeEstado}
            </td>
            <td class="text-end">
                <div class="d-inline-flex gap-1">
                    <button class="btn btn-outline-secondary btn-sm rounded-2 py-1 px-2" onclick="window.verDetalleOC('${oc.id}')" title="Ver Detalle">
                        <i class="bi bi-eye"></i>
                    </button>
                    ${oc.estado === 'pendiente' ? `
                        <button class="btn btn-action-approve btn-sm rounded-2 py-1 px-2" onclick="window.abrirAccionRapida('${oc.id}', 'aprobar')" title="Aprobar">
                            <i class="bi bi-check-lg"></i>
                        </button>
                    ` : ''}
                </div>
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
        document.getElementById('det-fecha-emision').innerText = 'Emitido el ' + oc.fecha;
        document.getElementById('det-proveedor-nombre').innerText = oc.proveedor;
        document.getElementById('det-proveedor-ruc').innerText = 'RUC: ' + oc.ruc;
        document.getElementById('det-proveedor-contacto').innerText = 'Contacto: ' + (oc.contacto || 'No especificado');
        document.getElementById('det-destino-almacen').innerText = 'Sede / Almacén: ' + oc.almacen;
        document.getElementById('det-solicitante').innerText = 'Solicitado por: ' + oc.solicitante;
        document.getElementById('det-unidad-destino').innerText = 'Destino: ' + oc.destino;
        document.getElementById('det-justificacion').innerText = oc.justificacion;

        document.getElementById('det-monto-subtotal').innerText = oc.moneda + ' ' + oc.subtotal.toLocaleString('es-PE', { minimumFractionDigits: 2 });
        document.getElementById('det-monto-igv').innerText = oc.moneda + ' ' + oc.igv.toLocaleString('es-PE', { minimumFractionDigits: 2 });
        document.getElementById('det-condicion-pago').innerText = oc.condicionPago;
        document.getElementById('det-monto-total').innerText = oc.moneda + ' ' + oc.total.toLocaleString('es-PE', { minimumFractionDigits: 2 });

        // Badges
        const bPrio = document.getElementById('det-badge-prioridad');
        bPrio.innerText = oc.prioridad;
        bPrio.className = oc.prioridad === 'URGENTE' ? 'badge bg-danger text-white rounded-pill fw-bold' : 
                          oc.prioridad === 'ALTA' ? 'badge bg-warning text-dark rounded-pill fw-bold' : 
                          'badge bg-secondary text-white rounded-pill fw-bold';

        const bEst = document.getElementById('det-badge-estado');
        bEst.innerText = oc.estado.toUpperCase();
        bEst.className = oc.estado === 'pendiente' ? 'badge bg-warning text-dark rounded-pill fw-bold' : 
                         oc.estado === 'aprobado' ? 'badge bg-success text-white rounded-pill fw-bold' : 
                         oc.estado === 'observado' ? 'badge bg-primary text-white rounded-pill fw-bold' : 
                         'badge bg-danger text-white rounded-pill fw-bold';

        // Historial
        document.getElementById('det-historial-content').innerText = oc.historial;

        // Items tabla
        document.getElementById('det-items-count').innerText = oc.items.length + ' ítem' + (oc.items.length > 1 ? 's' : '');
        const cuerpoItems = document.getElementById('det-tabla-items-body');
        if (cuerpoItems) {
            cuerpoItems.innerHTML = oc.items.map(it => `
                <tr>
                    <td class="fw-bold text-dark">${it.codigo}</td>
                    <td>${it.descripcion}</td>
                    <td class="text-center fw-bold">${it.cant}</td>
                    <td class="text-center text-muted">${it.um}</td>
                    <td class="text-end">${oc.moneda} ${it.pu.toFixed(2)}</td>
                    <td class="text-end fw-bold text-dark">${oc.moneda} ${it.total.toFixed(2)}</td>
                </tr>
            `).join('');
        }

        // Mostrar / ocultar botones de acción en footer si ya no está pendiente
        const actBtns = document.getElementById('det-modal-action-buttons');
        if (actBtns) {
            actBtns.style.display = (oc.estado === 'pendiente') ? 'flex' : 'none';
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

        const iconWrap = document.getElementById('modal-accion-icon-wrap');
        const icon = document.getElementById('modal-accion-icon');
        const titulo = document.getElementById('modal-accion-titulo');
        const subtitulo = document.getElementById('modal-accion-subtitulo');
        const mensaje = document.getElementById('modal-accion-mensaje');
        const labelComentario = document.getElementById('modal-accion-comentario-label');
        const txtComentario = document.getElementById('modal-accion-comentario-txt');
        const btnConfirmar = document.getElementById('modal-accion-btn-confirmar');

        if (txtComentario) txtComentario.value = '';
        subtitulo.innerText = `Orden de Compra: ${oc.id} • ${oc.proveedor} (${oc.moneda} ${oc.total.toFixed(2)})`;

        if (tipo === 'aprobar') {
            iconWrap.style.background = '#dcfce7';
            icon.className = 'bi bi-check-circle-fill text-success';
            titulo.innerText = 'Autorizar Orden de Compra';
            mensaje.innerText = `¿Confirma la aprobación ejecutiva de la orden por un importe de ${oc.moneda} ${oc.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}? El departamento de compras procederá con la emisión y despacho.`;
            labelComentario.innerText = 'Instrucciones / Notas de Aprobación (Opcional):';
            btnConfirmar.className = 'btn btn-success rounded-3 px-4 fw-bold';
            btnConfirmar.innerText = 'Aprobar Orden';
        } else if (tipo === 'observar') {
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

    // Ejecutar Acción Confirmada
    window.ejecutarAccionGerencial = function() {
        const oc = window._gerenciaOC.ordenSeleccionada;
        const tipo = window._gerenciaOC.tipoAccionModal;
        const comentario = (document.getElementById('modal-accion-comentario-txt')?.value || '').trim();

        if ((tipo === 'rechazar' || tipo === 'observar') && !comentario) {
            alert('Por favor ingrese un comentario u observación antes de continuar.');
            return;
        }

        const usuarioActual = localStorage.getItem('fleet_user') || 'Dirección General';
        const fechaHora = new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });

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

        guardarEstadoDataset();

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

        // Mostrar notificación
        mostrarToastGerencia(
            tipo === 'aprobar' ? '✅ Orden de Compra Aprobada' : 
            tipo === 'observar' ? '💬 Orden de Compra Observada' : '❌ Orden de Compra Rechazada',
            `Se actualizó el estado de la ${oc.id} con éxito.`
        );
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
        window.filtrarPorTab('todos');
    };

    // Recargar dataset inicial
    window.recargarAprobacionesOC = function() {
        sessionStorage.removeItem('erp_gerencia_oc_mock');
        window.renderizarModuloGerenciaOC();
        mostrarToastGerencia('🔄 Bandeja Actualizada', 'Se sincronizaron las órdenes de compra pendientes.');
    };

    // Exportar acta
    window.exportarResumenAprobaciones = function() {
        alert('Generando Acta Ejecutiva de Aprobaciones de Compra en formato Excel/PDF...');
    };

    // Ejecución inicial automática al cargar la vista
    window.renderizarModuloGerenciaOC();

})();
