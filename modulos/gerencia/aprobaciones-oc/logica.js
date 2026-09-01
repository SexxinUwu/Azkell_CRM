// =========================================================================
// MÓDULO: GERENCIA - APROBACIÓN DE ÓRDENES DE COMPRA (ERP AZKELL)
// =========================================================================

(function() {
    'use strict';

    // Detección inicial: en móvil inicia en 'cards', en escritorio en 'table'
    const isMobile = window.innerWidth <= 768;
    const modoGuardado = localStorage.getItem('erp_gerencia_oc_vista');
    const modoInicial = modoGuardado || (isMobile ? 'cards' : 'table');

    // Estado local del módulo
    window._gerenciaOC = window._gerenciaOC || {
        tabActivo: 'pendiente',
        modoVista: modoInicial,
        ordenes: [],
        ordenSeleccionada: null,
        tipoAccionModal: null
    };

    // Dataset inicial fiel a las órdenes operativas del ERP (Imagen 1)
    const MOCK_ORDENES_COMPRA = [
        {
            id: '2026-00000374',
            fecha: '31/03/2026',
            usuario: 'CYNTHIA EVELYN',
            proveedor: 'TELEMETRIA PERU E.I.R.L.',
            ruc: '20601248951',
            contacto: 'ventas@telemetriaperu.pe | 987-654-321',
            almacen: 'Lurín',
            solicitante: 'EVELYN CONDE',
            destino: 'Unidad CFT-703',
            prioridad: 'NORMAL',
            estado: 'pendiente',
            moneda: 'S/',
            subtotal: 296.61,
            igv: 53.39,
            total: 350.00,
            condicionPago: 'Crédito 15 Días',
            justificacion: 'INSTALACION VARILLA COMBUSTIBLE CFT-703',
            items: [
                { codigo: 'TELE-VAR-01', descripcion: 'Instalación y calibración de varilla medidora de combustible para unidad CFT-703', cant: 1, um: 'SERV', pu: 350.00, total: 350.00 }
            ],
            historial: 'Registrado por CYNTHIA EVELYN el 31/03/2026. Pendiente de aprobación gerencial.'
        },
        {
            id: '2026-00000565',
            fecha: '08/06/2026',
            usuario: 'STHEFANO',
            proveedor: 'NEUMA PERU CONTRATISTAS GENERALES S.A.C.',
            ruc: '20512894561',
            contacto: 'pedidos@neumaperu.pe | 945-123-889',
            almacen: 'Callao',
            solicitante: 'SAUL ROSAS',
            destino: 'Flota Transporte Pesado',
            prioridad: 'ALTA',
            estado: 'pendiente',
            moneda: 'US$',
            subtotal: 1029.00,
            igv: 185.22,
            total: 1214.22,
            condicionPago: 'Crédito 30 Días',
            justificacion: 'STOCK - REENCAUCHE DE LLANTAS CON FT',
            items: [
                { codigo: 'REC-LLAN-295', descripcion: 'Servicio de Reencauche de Llantas 295/80R22.5 con banda FT', cant: 6, um: 'SRV', pu: 202.37, total: 1214.22 }
            ],
            historial: 'Registrado por STHEFANO. Pendiente de visto bueno gerencial.'
        },
        {
            id: '2026-00000621',
            fecha: '26/06/2026',
            usuario: 'JHONN HAGI',
            proveedor: 'JOSE ALONSO SANCHEZ RIOJA',
            ruc: '10458921034',
            contacto: 'contacto@ferreteriasanchez.pe',
            almacen: 'Lurín',
            solicitante: 'SAUL ROSAS',
            destino: 'Unidad CFR727',
            prioridad: 'NORMAL',
            estado: 'pendiente',
            moneda: 'S/',
            subtotal: 5.93,
            igv: 1.07,
            total: 7.00,
            condicionPago: 'Contado Contraentrega',
            justificacion: 'COMPRA DE ESCOBA PARA LA UNIDAD CFR727',
            items: [
                { codigo: 'ART-ESC-01', descripcion: 'Escoba de cerda dura para limpieza de tolva CFR727', cant: 1, um: 'UND', pu: 7.00, total: 7.00 }
            ],
            historial: 'Registrado por JHONN HAGI. Pendiente de aprobación.'
        },
        {
            id: '2026-00000732',
            fecha: '25/07/2026',
            usuario: 'JOSMAURY AYAHIRI',
            proveedor: 'VANGUARDIA AUTOMOTRIZ S.A.C.',
            ruc: '20489921034',
            contacto: 'ventas@vanguardiaauto.pe | 981-224-411',
            almacen: 'Arequipa',
            solicitante: 'MARCO ROSAS',
            destino: 'Unidad CFR820 / CFR727',
            prioridad: 'URGENTE',
            estado: 'pendiente',
            moneda: 'S/',
            subtotal: 1545.76,
            igv: 278.24,
            total: 1824.00,
            condicionPago: 'Crédito 15 Días',
            justificacion: 'IMPLEMENTACION DE EJE CFR820/CFR727',
            items: [
                { codigo: 'EJE-IMP-HD', descripcion: 'Kit de accesorios y soportes de eje para unidad CFR820/CFR727', cant: 2, um: 'KIT', pu: 912.00, total: 1824.00 }
            ],
            historial: 'Registrado con prioridad por taller. Pendiente de aprobación.'
        },
        {
            id: '2026-00000798',
            fecha: '07/08/2026',
            usuario: 'DANIEL EDWIN',
            proveedor: 'SERVILLANTAS E INVERSIONES SAN JUAN S.A',
            ruc: '20199485712',
            contacto: 'ventas@servillantassanjuan.pe',
            almacen: 'Lurín',
            solicitante: 'ALMACEN',
            destino: 'Stock Central Llantas',
            prioridad: 'URGENTE',
            estado: 'pendiente',
            moneda: 'US$',
            subtotal: 3050.85,
            igv: 549.15,
            total: 3600.00,
            condicionPago: 'Crédito 30 Días',
            justificacion: 'STOCK-COMPRA DE LLANTAS GOOD-YEAR',
            items: [
                { codigo: 'LLAN-GY-295', descripcion: 'Neumático 295/80R22.5 Goodyear Armor Max MSD', cant: 8, um: 'UND', pu: 450.00, total: 3600.00 }
            ],
            historial: 'Requerimiento de reposición de stock. Pendiente de aprobación.'
        },
        {
            id: '2026-00000831',
            fecha: '17/08/2026',
            usuario: 'DANIEL EDWIN',
            proveedor: 'SERVILLANTAS E INVERSIONES SAN JUAN S.A',
            ruc: '20199485712',
            contacto: 'ventas@servillantassanjuan.pe',
            almacen: 'Lurín',
            solicitante: 'AMADOR MERINO',
            destino: 'Flota Cisternas',
            prioridad: 'ALTA',
            estado: 'pendiente',
            moneda: 'US$',
            subtotal: 1830.51,
            igv: 329.49,
            total: 2160.00,
            condicionPago: 'Crédito 30 Días',
            justificacion: 'COMPRA DE 06 LLANTAS 295/ DE LA COTIZACION DE 14 UNIDADES',
            items: [
                { codigo: 'LLAN-GY-295B', descripcion: 'Neumático 295/80R22.5 Dirección', cant: 6, um: 'UND', pu: 360.00, total: 2160.00 }
            ],
            historial: 'Pendiente de aprobación gerencial.'
        },
        {
            id: '2026-00000841',
            fecha: '20/08/2026',
            usuario: 'DANIEL EDWIN',
            proveedor: 'SERVILLANTAS E INVERSIONES SAN JUAN S.A',
            ruc: '20199485712',
            contacto: 'ventas@servillantassanjuan.pe',
            almacen: 'Lurín',
            solicitante: 'AMADOR MARINO',
            destino: 'Flota Plataformas',
            prioridad: 'ALTA',
            estado: 'pendiente',
            moneda: 'US$',
            subtotal: 2440.68,
            igv: 439.32,
            total: 2880.00,
            condicionPago: 'Crédito 30 Días',
            justificacion: 'COMPRA DE 08 LLANTAS 295/ DE LA COTIZACION DE 14 UNIDADES',
            items: [
                { codigo: 'LLAN-GY-295T', descripcion: 'Neumático 295/80R22.5 Tracción', cant: 8, um: 'UND', pu: 360.00, total: 2880.00 }
            ],
            historial: 'Pendiente de aprobación gerencial.'
        },
        {
            id: '2026-00000875',
            fecha: '26/08/2026',
            usuario: 'DANIEL EDWIN',
            proveedor: 'COMERCIAL RC S.A.C.',
            ruc: '20349811234',
            contacto: 'ventas@comercialrc.pe',
            almacen: 'Callao',
            solicitante: 'SAUL ROSAS',
            destino: 'Taller de Soldadura',
            prioridad: 'NORMAL',
            estado: 'pendiente',
            moneda: 'US$',
            subtotal: 308.61,
            igv: 55.55,
            total: 364.16,
            condicionPago: 'Crédito 15 Días',
            justificacion: 'COMPRA DE PRODUCTOS PL. LAC.',
            items: [
                { codigo: 'MET-PL-LAC', descripcion: 'Plancha LAC 3mm x 1200 x 2400 para refuerzos de tolva', cant: 2, um: 'PLN', pu: 182.08, total: 364.16 }
            ],
            historial: 'Pendiente de aprobación.'
        },
        {
            id: '2026-00000877',
            fecha: '26/08/2026',
            usuario: 'DANIEL EDWIN',
            proveedor: 'VANGUARDIA AUTOMOTRIZ S.A.C.',
            ruc: '20489921034',
            contacto: 'ventas@vanguardiaauto.pe',
            almacen: 'Lurín',
            solicitante: 'SAUL ROSAS',
            destino: 'Flota Tractos',
            prioridad: 'NORMAL',
            estado: 'pendiente',
            moneda: 'US$',
            subtotal: 434.03,
            igv: 78.09,
            total: 512.12,
            condicionPago: 'Crédito 30 Días',
            justificacion: 'COMPRA DE 04 AROS',
            items: [
                { codigo: 'ARO-ALUM-225', descripcion: 'Aro de Aluminio 22.5 x 8.25 Heavy Duty', cant: 4, um: 'UND', pu: 128.03, total: 512.12 }
            ],
            historial: 'Pendiente de aprobación.'
        },
        {
            id: '2026-00000895',
            fecha: '31/08/2026',
            usuario: 'DANIEL EDWIN',
            proveedor: 'DIESEL AUTOPARTES DEL PERU S.R.L',
            ruc: '20603412589',
            contacto: 'atencion@dieselautopartes.pe',
            almacen: 'Lurín',
            solicitante: 'AMADOR MERINO',
            destino: 'Unidad Scania R450',
            prioridad: 'URGENTE',
            estado: 'pendiente',
            moneda: 'US$',
            subtotal: 970.91,
            igv: 174.76,
            total: 1145.67,
            condicionPago: 'Contado Contraentrega',
            justificacion: 'REPARACION DE APS- .CAMBIO DE COMPRESOR , ELIMINACION DE FUGA DE ACEITE , ELIMINACION DE FUGA DE COMBUSTIBLE (PENDIENTE NIPLE DE SCANIA)',
            items: [
                { codigo: 'REP-APS-SCN', descripcion: 'Kit Reparación Válvula APS y cambio de compresor', cant: 1, um: 'SERV', pu: 1145.67, total: 1145.67 }
            ],
            historial: 'Requerimiento urgente de mantenimiento correctivo.'
        },
        {
            id: '2026-00000896',
            fecha: '31/08/2026',
            usuario: 'DANIEL EDWIN',
            proveedor: 'DIESEL AUTOPARTES DEL PERU S.R.L',
            ruc: '20603412589',
            contacto: 'atencion@dieselautopartes.pe',
            almacen: 'Lurín',
            solicitante: 'AMADOR MERINO',
            destino: 'Unidad BES829',
            prioridad: 'NORMAL',
            estado: 'pendiente',
            moneda: 'US$',
            subtotal: 84.75,
            igv: 15.25,
            total: 100.00,
            condicionPago: 'Contado',
            justificacion: 'UNIDAD BES829',
            items: [
                { codigo: 'REP-MENOR-BES', descripcion: 'Repuestos menores y abrazaderas para unidad BES829', cant: 1, um: 'GLB', pu: 100.00, total: 100.00 }
            ],
            historial: 'Pendiente de aprobación.'
        },
        {
            id: '2026-00000897',
            fecha: '31/08/2026',
            usuario: 'DANIEL EDWIN',
            proveedor: 'GRUPO QUIÑONES',
            ruc: '20100142981',
            contacto: 'ventas@grupoquinones.pe',
            almacen: 'Lurín',
            solicitante: 'AMADOR MERINO',
            destino: 'Almacén Central',
            prioridad: 'NORMAL',
            estado: 'pendiente',
            moneda: 'S/',
            subtotal: 733.90,
            igv: 132.10,
            total: 866.00,
            condicionPago: 'Crédito 15 Días',
            justificacion: 'COMPRA DE REPUESTOS',
            items: [
                { codigo: 'REP-VAR-QUIN', descripcion: 'Lote de repuestos y filtros varios según requerimiento de taller', cant: 1, um: 'GLB', pu: 866.00, total: 866.00 }
            ],
            historial: 'Pendiente de aprobación.'
        },
        {
            id: '2026-00000138',
            fecha: '26/08/2026',
            usuario: 'ALEJANDRO ZEVALLOS',
            proveedor: 'LUBRICANTES Y COMBUSTIBLES DEL SUR S.A.C.',
            ruc: '20601248951',
            contacto: 'gerencia@lubrisur.pe',
            almacen: 'Lurín',
            solicitante: 'JEFE DE OPERACIONES',
            destino: 'Abastecimiento Taller',
            prioridad: 'NORMAL',
            estado: 'aprobado',
            moneda: 'S/',
            subtotal: 5762.71,
            igv: 1037.29,
            total: 6800.00,
            condicionPago: 'Crédito 30 Días',
            justificacion: 'ABASTECIMIENTO DE GRASA Y REFRIGERANTE PARA TALLER',
            items: [
                { codigo: 'LUB-GRAS-EP2', descripcion: 'Grasa Litio Compleja EP2 para Chasis (Tambor 180 Kg)', cant: 1, um: 'TBR', pu: 3200.00, total: 3200.00 },
                { codigo: 'REF-ORG-5050', descripcion: 'Refrigerante Fleetguard 50/50 (Cilindro 55 Gal)', cant: 2, um: 'CIL', pu: 1800.00, total: 3600.00 }
            ],
            historial: 'Aprobado por Dirección General el 26/08/2026.'
        },
        {
            id: '2026-00000137',
            fecha: '25/08/2026',
            usuario: 'ALEJANDRO ZEVALLOS',
            proveedor: 'TOTAL ENERGIES PERÚ S.A.C.',
            ruc: '20349811234',
            contacto: 'atencion@totalenergies.pe',
            almacen: 'Callao',
            solicitante: 'ALMACEN AUXILIAR CALLAO',
            destino: 'Stock Cajas Eaton',
            prioridad: 'BAJA',
            estado: 'rechazado',
            moneda: 'S/',
            subtotal: 3559.32,
            igv: 640.68,
            total: 4200.00,
            condicionPago: 'Contado',
            justificacion: 'STOCK DE VALVOLINA PARA CAJAS EATON',
            items: [
                { codigo: 'LUB-TOT-80W90', descripcion: 'Aceite Transmisión Total Axle 7 80W90', cant: 10, um: 'BAL', pu: 420.00, total: 4200.00 }
            ],
            historial: 'Rechazado: Hay existencia disponible en Lurín para transferencia.'
        },
        {
            id: '2026-00000136',
            fecha: '24/08/2026',
            usuario: 'CARLOS MENDOZA',
            proveedor: 'CUMMINS PERÚ S.A.',
            ruc: '20100142981',
            contacto: 'repuestos@cummins.pe',
            almacen: 'Lurín',
            solicitante: 'JEFE DE MANTENIMIENTO',
            destino: 'Unidad D3R-780',
            prioridad: 'ALTA',
            estado: 'observado',
            moneda: 'S/',
            subtotal: 7330.51,
            igv: 1319.49,
            total: 8650.00,
            condicionPago: 'Crédito 30 Días',
            justificacion: 'REEMPLAZO PREVENTIVO DE TURBOCARGADOR POR JUEGO AXIAL',
            items: [
                { codigo: 'TURB-HOLSET', descripcion: 'Turbocompresor Holset HE300VG Genuino Cummins', cant: 1, um: 'UND', pu: 8650.00, total: 8650.00 }
            ],
            historial: 'Observado: Solicitar segunda cotización comparativa antes de autorizar.'
        }
    ];

    // Inicialización del dataset
    function inicializarDataset() {
        try {
            const guardado = sessionStorage.getItem('erp_gerencia_oc_mock_v2');
            if (guardado) {
                window._gerenciaOC.ordenes = JSON.parse(guardado);
            } else {
                window._gerenciaOC.ordenes = JSON.parse(JSON.stringify(MOCK_ORDENES_COMPRA));
                sessionStorage.setItem('erp_gerencia_oc_mock_v2', JSON.stringify(window._gerenciaOC.ordenes));
            }
        } catch (e) {
            window._gerenciaOC.ordenes = JSON.parse(JSON.stringify(MOCK_ORDENES_COMPRA));
        }
    }

    function guardarEstadoDataset() {
        try {
            sessionStorage.setItem('erp_gerencia_oc_mock_v2', JSON.stringify(window._gerenciaOC.ordenes));
        } catch(e) {}
    }

    // Renderizar Dashboard y Lista
    window.renderizarModuloGerenciaOC = function() {
        inicializarDataset();
        actualizarKpisYBadges();
        window.cambiarModoVista(window._gerenciaOC.modoVista, false);
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

        // Sumar montos diferenciando o consolidando
        const sumMontoSoles = (arr) => arr.reduce((acc, cur) => acc + (cur.moneda === 'S/' ? cur.total : cur.total * 3.75), 0);

        // Actualizar contadores Bento
        const elPend = document.getElementById('kpi-count-pendientes');
        if (elPend) elPend.innerText = pend.length;
        const elPendMonto = document.getElementById('kpi-monto-pendientes');
        if (elPendMonto) elPendMonto.innerText = 'S/ ' + sumMontoSoles(pend).toLocaleString('es-PE', { minimumFractionDigits: 2 });

        const elAprob = document.getElementById('kpi-count-aprobadas');
        if (elAprob) elAprob.innerText = aprob.length;
        const elAprobMonto = document.getElementById('kpi-monto-aprobadas');
        if (elAprobMonto) elAprobMonto.innerText = 'S/ ' + sumMontoSoles(aprob).toLocaleString('es-PE', { minimumFractionDigits: 2 });

        const elObs = document.getElementById('kpi-count-observadas');
        if (elObs) elObs.innerText = obs.length;
        const elObsMonto = document.getElementById('kpi-monto-observadas');
        if (elObsMonto) elObsMonto.innerText = 'S/ ' + sumMontoSoles(obs).toLocaleString('es-PE', { minimumFractionDigits: 2 });

        const elRech = document.getElementById('kpi-count-rechazadas');
        if (elRech) elRech.innerText = rech.length;
        const elRechMonto = document.getElementById('kpi-monto-rechazadas');
        if (elRechMonto) elRechMonto.innerText = 'S/ ' + sumMontoSoles(rech).toLocaleString('es-PE', { minimumFractionDigits: 2 });

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
                    (item.usuario && item.usuario.toLowerCase().includes(txtBuscar)) ||
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

        // Renderizar Tarjetas (Diseño Móvil / Grid optimizado)
        if (wrapCards) {
            wrapCards.innerHTML = filtradas.map(oc => generarCardHTML(oc)).join('');
        }

        // Renderizar Tabla (Diseño Fiel a Imagen 1 con estilo moderno ERP)
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
                                ${oc.moneda} ${oc.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>

                    <!-- Meta datos: Fecha, Usuario y Almacén -->
                    <div class="d-flex align-items-center justify-content-between text-muted mb-2 pb-2 border-bottom" style="font-size:0.75rem;">
                        <span><i class="bi bi-calendar3"></i> ${oc.fecha}</span>
                        <span><i class="bi bi-person-badge"></i> ${oc.usuario || 'SISTEMA'}</span>
                        <span class="badge bg-light text-dark border">Sede ${oc.almacen}</span>
                    </div>

                    <!-- Proveedor & Solicitante -->
                    <div class="mb-2">
                        <div class="text-secondary fw-bold" style="font-size:0.68rem; text-transform:uppercase;">Proveedor</div>
                        <div class="fw-bold text-dark text-truncate" style="font-size:0.86rem;" title="${oc.proveedor}">${oc.proveedor}</div>
                    </div>

                    <div class="mb-2">
                        <div class="text-secondary fw-bold" style="font-size:0.68rem; text-transform:uppercase;">Solicitante / Destino</div>
                        <div class="text-dark fw-semibold text-truncate" style="font-size:0.82rem;">${oc.solicitante}</div>
                        <div class="text-muted text-truncate" style="font-size:0.75rem;">${oc.destino}</div>
                    </div>

                    <!-- Motivo / Justificación -->
                    <div class="p-2 rounded-2 bg-light border mb-3" style="font-size:0.78rem;">
                        <div class="text-secondary fw-bold text-uppercase" style="font-size:0.68rem;"><i class="bi bi-card-text"></i> Motivo:</div>
                        <div class="text-dark fw-medium text-truncate-2" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;" title="${oc.justificacion}">
                            ${oc.justificacion}
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
                            <button class="btn-oc-denegar" onclick="window.abrirAccionRapida('${oc.id}', 'rechazar')">
                                <i class="bi bi-hand-thumbs-down-fill"></i> DENEGAR
                            </button>
                            <button class="btn-oc-autorizar" onclick="window.abrirAccionRapida('${oc.id}', 'aprobar')">
                                <i class="bi bi-hand-thumbs-up-fill"></i> AUTORIZAR
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

    // Template para Fila de Tabla (Fiel a Imagen 1 con estética premium)
    function generarFilaTablaHTML(oc) {
        return `
        <tr>
            <!-- Columna ACCIÓN (Botones idénticos a Imagen 1) -->
            <td>
                ${oc.estado === 'pendiente' ? `
                    <div class="d-inline-flex align-items-center gap-1">
                        <button class="btn-oc-autorizar" onclick="window.abrirAccionRapida('${oc.id}', 'aprobar')" title="Autorizar Orden de Compra">
                            <i class="bi bi-hand-thumbs-up-fill"></i> AUTORIZAR
                        </button>
                        <button class="btn-oc-denegar" onclick="window.abrirAccionRapida('${oc.id}', 'rechazar')" title="Denegar Orden de Compra">
                            <i class="bi bi-hand-thumbs-down-fill"></i> DENEGAR
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
            <td class="text-nowrap fw-semibold text-secondary" style="font-size:0.82rem;">
                ${oc.fecha}
            </td>

            <!-- Columna USUARIO -->
            <td class="fw-bold text-dark text-truncate" style="max-width:130px; font-size:0.82rem;">
                ${oc.usuario || 'SISTEMA'}
            </td>

            <!-- Columna ORDEN COMPRA (Con icono de ojo/modal) -->
            <td>
                <span class="btn-oc-code" onclick="window.verDetalleOC('${oc.id}')" title="Ver PDF / Detalle">
                    <i class="bi bi-eye"></i> ${oc.id}
                </span>
            </td>

            <!-- Columna MOTIVO / JUSTIFICACIÓN -->
            <td>
                <div class="text-dark fw-medium text-truncate" style="max-width:320px; font-size:0.83rem;" title="${oc.justificacion}">
                    ${oc.justificacion}
                </div>
            </td>

            <!-- Columna SOLICITANTE -->
            <td class="fw-semibold text-secondary text-truncate" style="max-width:160px; font-size:0.82rem;" title="${oc.solicitante}">
                ${oc.solicitante}
            </td>

            <!-- Columna PROVEEDOR -->
            <td class="fw-bold text-dark text-truncate" style="max-width:220px; font-size:0.83rem;" title="${oc.proveedor}">
                ${oc.proveedor}
            </td>

            <!-- Columna IMPORTE -->
            <td class="text-end text-nowrap">
                <span class="fw-black text-dark" style="font-size:0.92rem; letter-spacing:-0.01em;">
                    ${oc.moneda} ${oc.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
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
        sessionStorage.removeItem('erp_gerencia_oc_mock_v2');
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
