// Global RBAC Middleware
module.exports = function globalRBAC(req, res, next) {
    const path = req.path;
    // Rutas públicas o helpers que no requieren permisos de módulo
    const ignoredPaths = [
        '/login', '/ping', '/version', '/eventos', 
        '/cambiar-password', '/conductores', '/conductores-lista', '/placas-lista', '/config-metrica', 
        '/clientes-placas', '/marcas-placas', '/proxy/documento', '/proxy/sunat', '/proxy/geocode', '/push',
        '/script/obtener', '/script/buscar', '/catalogos_taller',
        '/documentos-flota/presign-read', '/mantenimiento/inspecciones/presign-read', '/mantenimiento/checklist/presign-read', '/mantenimiento/presign-read', '/checklist/presign-read',
        '/presign-read', '/operaciones/conductor-portal', '/combustible/vales',
        '/guias-remision/pdf-apisunat', '/guias-remision/pdf',
        '/whatsapp/qr', '/approvals/oc',
        '/herramientas' // Herramientas PDF: las usa cualquier persona con sesión (la ruta exige sesión por su cuenta)
    ];
    // Listas de consulta: exentas solo para leer. Borrar, importar o modificar exige el permiso del módulo
    // (antes, DELETE /conductores/:id o PUT /config-metrica/:placa pasaban sin permiso).
    const soloLectura = new Set(['/conductores', '/conductores-lista', '/placas-lista', '/config-metrica', '/clientes-placas', '/marcas-placas', '/catalogos_taller', '/combustible/vales']);
    if (
        ignoredPaths.some(ip => (path === ip || path.startsWith(ip)) && (!soloLectura.has(ip) || req.method === 'GET')) || 
        path.startsWith('/whatsapp/') ||
        path.startsWith('/approvals/') ||
        path.endsWith('/presign-read') || 
        path.endsWith('/presigned') || 
        path.includes('/pdf-apisunat/') ||
        path.includes('/pdf/') ||
        path.includes('/imprimir/')
    ) return next();

    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    // Desactivar bypass global: activar validación estricta de permisos RBAC

    // Datos de referencia globales ampliados: Listas desplegables permitidas para cualquier usuario autenticado
    const globalReferenceGets = [
        '/configuracion-clave',
        '/nav/indicadores', // cifras del menú (solo lectura, sin datos sensibles)
        '/disponibilidad-flota',
        '/config-metrica',
        '/km-historico',
        '/almacen/marcas-placas',
        '/almacen/detraccion-tipos', // catálogo de tipos de detracción (lectura para el formulario de la orden); editarlo es solo de administradores
        '/almacen/familias',
        '/almacen/marcas',
        '/almacen/sistemas',
        '/almacen/unidades',
        '/almacen/placas',
        '/catalogos_taller',
        '/almacen/notificaciones/resumen',
        '/tipos-preventivo',
        '/tipos-mantenimiento',
        '/mantenimiento-kits',
        '/cat-rampas',
        '/taller/rampas',
        '/taller-rampas',
        '/taller-personal',
        '/taller/personal',
        '/conductores',
        '/conductores-lista',
        '/ot-trabajos',
        '/ot-materiales',
        '/ot-backlog',
        '/inspecciones-por-ot',
        '/neumaticos/catalogos',
        '/neumaticos/analisis',
        '/neumaticos/medida-detalle',
        '/combustible/catalogos',
        '/combustible/rendimiento-teorico',
        '/combustible/rendimiento-flota',
        '/combustible/matriz',
        '/combustible/vales',
        '/seguridad/recursos',
        '/seguridad/template',
        '/seguridad/entrega-vehiculos',
        '/flota/entrega-vehiculos',
        '/vehiculos-flota',
        '/tesoreria/motivos-gastos',
        '/checklist/config-sistemas'
    ];
    if (req.method === 'GET' && globalReferenceGets.some(p => path === p || path.startsWith(p))) {
        return next();
    }

    if (req.user.rol === 'Fundador') return next(); // el acceso total de un rol viene de su marca es_admin (verifyToken pone permisos.admin)

    let p = {};
    try {
        p = typeof req.user.permisos === 'string' ? JSON.parse(req.user.permisos) : req.user.permisos;
    } catch(e) {}
    if (p.admin === true) return next();

    // SOLO ADMINISTRADOR (no se asignan en los roles): usuarios, roles, auditoría, API y desarrolladores, empresa,
    // notificaciones e integraciones. Quien no es administrador recibe 403 aunque su rol tenga el resto de permisos.
    const SOLO_ADMIN = ['/usuario', '/roles', '/audit', '/log-auditoria', '/notificaciones', '/integraciones', '/sire', '/docs-externos', '/empresa', '/sistema/empresa', '/sistema/api-keys', '/sistema/webhooks'];
    if (SOLO_ADMIN.some(ip => path.startsWith(ip))) return res.status(403).json({ error: 'Solo un administrador puede usar esta sección.' });

    const methodMap = { GET: 'l', POST: 'c', PUT: 'e', DELETE: 'd' };
    let accion = methodMap[req.method] || 'l';
    let mod = null;
    // Mantenimiento: cada ruta pide el permiso de su módulo del catálogo (src/modules/sistema/permisosCatalogo.ts).
    // leer(): en GET, las pantallas del taller también leen los datos de las demás; «Otros» (otros_mant) da lectura a sus ventanas.
    // Escribir (POST, PUT, PATCH, DELETE) siempre pide el permiso del módulo de la ruta.
    const leer = (...claves) => (req.method === 'GET' ? [...claves, 'otros_mant'] : []);

    // Si es un script legacy, forzar la acción según el nombre de la operación
    if (path.startsWith('/script/obtener') || path.startsWith('/script/buscar')) accion = 'l';
    else if (path.startsWith('/script/actualizar') || path.startsWith('/script/editar')) accion = 'e';
    else if (path.startsWith('/script/eliminar')) accion = 'd';
    // Guardar un conductor existente (con idConductor) es una edición; darlo de alta sigue siendo crear
    if (path === '/script/guardarConductor' && req.body && Array.isArray(req.body.args) && req.body.args[0] && req.body.args[0].idConductor) accion = 'e';

    // Asistente: cada reporte y cada consulta del chat verifica sus propios permisos (routes/asistente-*.js).
    // Sin esta regla, cualquier usuario que no fuera admin recibía "Ruta no mapeada" al escribir en el chat.
    if (path.startsWith('/asistente')) return next();
    // Rentabilidad de los servicios: solo quien tenga el permiso op_rentabilidad (información sensible)
    if (path.startsWith('/rentabilidad')) { mod = ['op_rentabilidad']; accion = 'l'; }
    // Facturación electrónica: ver comprobantes = leer; emitir factura o nota de crédito = crear (permiso op_facturacion)
    if (path.startsWith('/facturacion')) { mod = ['op_facturacion']; }
    // Solicitudes: cualquier usuario autenticado pide; aprobar lo valida cada ruta con el permiso «Aprobar» de Gerencia › Aprobación de solicitudes
    if (path.startsWith('/solicitudes')) return next();

    // PATCH no está en methodMap y caía en lectura ('l'): el cambio de estado de una cuenta por cobrar es una escritura de edición.
    if (req.method === 'PATCH' && /^\/tesoreria\/cuentas\/[^/]+\/toggle-estado$/.test(path)) accion = 'e';

    // APROBACIONES DE GERENCIA: aprobar o anular lo revisa el permiso de Gerencia (no el de Almacén ni el de Tesorería).
    // O/C: solo Gerencia. Caja: Gerencia, y Tesorería como hasta ahora (su pantalla aprueba y anula caja).
    // Anular una O/C (ya registrada o aprobada) es una decisión de Gerencia, igual que aprobar o rechazar: Almacén ya no puede anularlas.
    const esAprobacionOc = req.method === 'PUT' && /^\/almacen\/entradas\/[^/]+\/(estado|anular)$/.test(path);
    const esAprobacionCaja = req.method === 'POST' && /^\/tesoreria\/caja\/[^/]+\/(aprobar|anular)$/.test(path);
    // CAJA CHICA: asignación, gastos y reposición los aprueban Tesorería y Gerencia; el descuento, cualquiera de los dos
    const aprobGerenciaChica = req.method === 'POST' && /^\/tesoreria\/caja-chica\/.+\/aprobar-gerencia$/.test(path);
    const aprobTesoreriaChica = req.method === 'POST' && /^\/tesoreria\/caja-chica\/.+\/aprobar-tesoreria$/.test(path);
    const descontarChica = req.method === 'POST' && /^\/tesoreria\/caja-chica\/movimientos\/[^/]+\/descontar$/.test(path);
    if (aprobGerenciaChica || aprobTesoreriaChica || descontarChica) {
        const reglasChica = aprobGerenciaChica ? [['gerencia_aprobaciones_caja', ['a']]]
            : descontarChica ? [['gerencia_aprobaciones_caja', ['a']], ['tesoreria_caja', ['c']]]
            : [['tesoreria_caja', ['c']]];
        const tieneChica = reglasChica.some(([modulo, acciones]) => p[modulo] && acciones.some(a => p[modulo][a] === 1 || p[modulo][a] === true));
        if (!tieneChica) return res.status(403).json({ error: 'RBAC: Permiso denegado para aprobar (caja chica)' });
        return next();
    }

    // NOTAS DE CRÉDITO: aprobar, anular y reembolsar exigen la acción «Aprobar» del módulo (registrar y enlazar la devolución, no)
    if (req.method === 'POST' && /^\/compras\/notas-credito\/[^/]+\/(aprobar|anular|reembolso)$/.test(path)) {
        const tieneNc = p.tesoreria_nc && (p.tesoreria_nc.a === 1 || p.tesoreria_nc.a === true);
        if (!tieneNc) return res.status(403).json({ error: 'RBAC: Permiso denegado: aprobar, anular o reembolsar notas de crédito exige la acción «Aprobar» en Notas de crédito' });
        return next();
    }

    if (esAprobacionOc || esAprobacionCaja) {
        const reglas = esAprobacionOc
            ? [['gerencia_aprobaciones_oc', ['a']]]
            : [['gerencia_aprobaciones_caja', ['a']], ['tesoreria_caja', ['c']]];
        const tiene = reglas.some(([modulo, acciones]) => p[modulo] && acciones.some(a => p[modulo][a] === 1 || p[modulo][a] === true));
        if (!tiene) return res.status(403).json({ error: 'RBAC: Permiso denegado para aprobar o anular (Gerencia)' });
        return next();
    }

    // Subir documentos de una persona: el catálogo dice «Crear o Editar»; borrar pide Eliminar (ruta DELETE)
    if (req.method === 'POST' && /^\/rrhh\/personal\/[^/]+\/documentos$/.test(path)) {
        const legajo = p.rrhh_personal || {};
        if (legajo.c === 1 || legajo.c === true || legajo.e === 1 || legajo.e === true) return next();
        return res.status(403).json({ error: 'RBAC: Permiso denegado para subir documentos (pide Crear o Editar en Legajos y contratos)' });
    }

    // FLOTA Y MÓDULOS
    if (path.startsWith('/disponibilidad-flota') || path.toLowerCase().includes('disponibilidad')) { mod = ['disponibilidad']; if (path === '/disponibilidad-flota/pdf') accion = 'l'; /* el PDF no guarda nada */ }
    else if (path.startsWith('/contabilidad')) mod = ['contabilidad_sire'];
    // Asistencia de RRHH (no hay ruta propia de /seguridad/asistencia; la clave es rrhh_asistencia)
    else if (path.startsWith('/seguridad/asistencia')) mod = ['rrhh_asistencia'];
    // Papeletas (Flota): su propio permiso; Tesorería también las ve y registra sus pagos
    // Notas de crédito de proveedores: su propio permiso; quien paga órdenes (Tesorería o Almacén) también las consulta para aplicarlas
    // Consultarlas: también quien paga órdenes. Registrar o enlazar: solo con el permiso de Notas de crédito (Tesorería o Almacén)
    else if (path.startsWith('/compras/notas-credito')) mod = req.method === 'GET' ? ['tesoreria_nc', 'alm_nc', 'tesoreria_pago_req', 'tesoreria_caja', 'ent_inv'] : ['tesoreria_nc', 'alm_nc'];
    else if (path.startsWith('/papeletas')) { mod = ['papeletas', 'tesoreria_papeletas', 'tesoreria_caja']; if (path === '/papeletas/pdf') accion = 'l'; }
    // PDF del acta: el POST solo convierte el documento, no guarda nada; quien ve las actas puede imprimirlas
    else if (path === '/seguridad/entrega-vehiculos/pdf') { mod = ['entrega_vehiculos', 'seguridad_unidades', 'flota', 'placas', 'docs_flota']; accion = 'l'; }
    else if (path.startsWith('/flota/entrega-vehiculos')) mod = ['entrega_vehiculos', 'seguridad_unidades', 'placas', ...(req.method === 'GET' ? ['docs_flota'] : [])];
    else if (path.startsWith('/seguridad/entrega-vehiculos')) mod = ['entrega_vehiculos', 'seguridad_unidades', 'flota', 'placas', ...(req.method === 'GET' ? ['docs_flota'] : [])];
    else if (path.startsWith('/seguridad')) mod = ['seguridad_unidades', 'seguridad', 'checklist', 'placas', 'unid'];
    else if (path.startsWith('/configuracion-flota')) mod = ['cfg_mant', ...leer()];
    // RRHH: cada pantalla con su permiso (antes no estaba mapeado y solo entraban administradores)
    else if (path.startsWith('/rrhh/tareo') || path.startsWith('/rrhh/marcacion') || path.startsWith('/rrhh/horarios')) {
        mod = ['rrhh_asistencia'];
        // Guardar o sincronizar el tareo edita la asistencia ya registrada: pide Editar (como «regularizar técnicos»)
        if (path.startsWith('/rrhh/tareo/') && req.method === 'POST') accion = 'e';
        // Marcar a mano la asistencia de alguien también edita lo registrado (decisión del dueño)
        if (path === '/rrhh/marcacion/manual' && req.method === 'POST') accion = 'e';
    }
    // Justificaciones (licencias y vacaciones) viven en la pantalla de Asistencia
    else if (path.startsWith('/rrhh/licencias')) { mod = ['rrhh_asistencia']; if (req.method === 'POST') accion = 'e'; /* justificar edita la asistencia */ }
    else if (path.startsWith('/rrhh/nomina')) mod = ['rrhh_nomina'];
    else if (path === '/rrhh/directorio') mod = ['rrhh_personal', 'cond'];
    else if (path.startsWith('/rrhh/')) mod = ['rrhh_personal'];
    
    // ALMACEN & CONFIGURACION
    else if (path.startsWith('/perfil')) return next();
    else if (path === '/auth/logout') return next(); // cerrar la propia sesión: cualquier usuario con sesión
    // ALMACÉN (routes/almacen.js): cada ruta exige el módulo de su pantalla y la acción del método (GET l, POST c, PUT e, DELETE d).
    // Las listas que leen otras pantallas (OC, Recepción, Tesorería, Gerencia, Flota, Dashboard) se leen con sus propios permisos.
    // Las ventanas de «Otros» (almacenes, familias, marcas, sistemas, unidades, configuración) las rige almacen_otros; inv es respaldo.
    else if (path.startsWith('/almacen/')) {
        const en = (...bases) => bases.some(b => path === b || path.startsWith(b + '/'));
        const esGet = req.method === 'GET';
        const LEE_OC = ['ent_inv', 'rec_compras', 'gerencia_aprobaciones_oc', 'tesoreria_pago_req', 'tesoreria_caja', 'tesoreria_nc', 'dash_alm'];
        if (en('/almacen/detraccion-tipos')) {
            // Tipos de detracción: solo administradores (la lectura es libre, ver globalReferenceGets)
            return res.status(403).json({ error: 'RBAC: Solo un administrador configura los tipos de detracción' });
        }
        else if (en('/almacen/reset-recepciones')) { mod = ['rec_compras']; accion = 'd'; }
        else if (en('/almacen/configuracion')) mod = esGet ? ['almacen_otros', 'inv', 'ent_inv', 'sal_inv'] : ['almacen_otros', 'inv'];
        else if (en('/almacen/almacenes', '/almacen/almacenes-lista', '/almacen/familias', '/almacen/marcas', '/almacen/sistemas', '/almacen/unidades')) {
            mod = esGet ? ['almacen_otros', 'inv', 'ent_inv', 'sal_inv'] : ['almacen_otros', 'inv'];
        }
        else if (en('/almacen/marcas-placas')) mod = ['placas', 'inv'];
        else if (en('/almacen/notificaciones')) mod = ['inv', 'ent_inv', 'sal_inv', 'kardex'];
        else if (en('/almacen/empresa-cuentas', '/almacen/empresa-documentos')) mod = ['ent_inv', 'inv', 'sal_inv', 'tesoreria', 'tesoreria_pago_req', 'tesoreria_caja'];
        else if (en('/almacen/recepciones-oc')) mod = ['rec_compras', 'ent_inv', 'inv'];
        else if (en('/almacen/inventario')) {
            if (esGet) mod = ['inv', 'ent_inv', 'sal_inv', 'kardex', 'rec_compras', 'dash_alm', 'gerencia_aprobaciones_oc'];
            else {
                mod = ['inv'];
                if (req.method === 'POST' && /\/(bulk-delete)$/.test(path)) accion = 'd';
                else if (req.method === 'POST' && /\/(bulk-estado|bulk-ubicacion|regularizar-todo-cero|regularizar|lotes\/sincronizar|imagen)$/.test(path)) accion = 'e';
            }
        }
        else if (en('/almacen/llantas-disponibles')) mod = ['inv', 'sal_inv', 'neumaticos.mover', 'neumaticos.reencauche', 'neumaticos.baja'];
        else if (en('/almacen/neumaticos-articulo')) mod = esGet ? ['inv', 'ent_inv', 'sal_inv'] : ['inv'];
        else if (en('/almacen/clientes-placas')) mod = ['inv', 'ent_inv', 'sal_inv', 'clientes', 'placas', 'cond'];
        else if (en('/almacen/entradas')) {
            if (en('/almacen/entradas/generar-oc-reencauche')) { mod = ['ent_inv', 'neumaticos.reencauche']; accion = 'c'; }
            else if (esGet) mod = LEE_OC;
            else {
                mod = ['ent_inv'];
                // Adjuntar o reenviar sobre una O/C existente es editarla; quitar un adjunto es eliminar (DELETE)
                if (req.method === 'POST' && (/\/reenviar-whatsapp$/.test(path) || /^\/almacen\/entradas\/[^/]+\/archivos?(\/|$)/.test(path))) accion = 'e';
            }
        }
        else if (en('/almacen/salidas')) mod = esGet ? ['sal_inv', 'dash_alm', 'kardex', 'ent_inv'] : ['sal_inv'];
        else if (en('/almacen/proveedores', '/almacen/importarProveedoresMasivo')) {
            mod = esGet ? ['prov_inv', 'ent_inv', 'sal_inv', 'tesoreria_pago_req', 'tesoreria_caja', 'tesoreria_nc'] : ['prov_inv'];
            if (req.method === 'POST' && /\/bulk-delete$/.test(path)) accion = 'd';
        }
        else if (en('/almacen/kardex')) mod = ['kardex', 'inv'];
        // Cualquier otra ruta de almacén no tiene mapa: queda sin mod y la regla estricta la rechaza
    }
    else if (path.startsWith('/clientes')) mod = ['clientes', 'placas'];

    // MANTENIMIENTO Y OPERACIONES
    // Neumáticos: cada endpoint exige su permiso (GET = neumaticos l, y además insp/ot/fleetrun para las consultas que usan otros módulos).
    // Alta, instalar, retirar, rotar y código de fuego = neumaticos.mover; reencauche = neumaticos.reencauche; baja/descarte = neumaticos.baja.
    // Inspecciones: crear = insp c; eliminar = neumaticos d. Las rutas de routes/neumaticos-ciclo.js vuelven a validar con tienePermiso.
    else if (path.startsWith('/neumaticos')) {
        const sub = path.slice('/neumaticos'.length);
        if (req.method === 'GET') mod = ['neumaticos', 'insp', 'ot', 'fleetrun'];
        else if (sub.startsWith('/inspecciones')) mod = req.method === 'DELETE' ? ['neumaticos'] : ['insp'];
        else if (/^\/(instalar|retirar|rotar|alta-unidad-nueva|rotaciones|devolver-reten|codigo-fuego\/generar|corregir-envio)$/.test(sub)) mod = ['neumaticos.mover'];
        else if (/^\/(marcar-reforma|despachar-reformadora|retorno-reencauche)$/.test(sub)) mod = ['neumaticos.reencauche'];
        else if (/^\/(marcar-descarte|desactivar)$/.test(sub)) mod = ['neumaticos.baja'];
        else mod = ['neumaticos']; // catálogos, importar y letra del código de fuego (PUT = editar)
    }
    else if (path.includes('neumaticos')) {
        mod = ['neumaticos', 'insp', 'ot', 'fleetrun'];
    }
    else if (path.startsWith('/combustible') || path.includes('combustible')) {
        if (req.user && req.user.rol && req.user.rol.toLowerCase().includes('conductor')) {
            return next();
        }
        // Claves del catálogo: vales y estaciones = combustible_vales; análisis, auditoría y matriz = combustible_analisis (urea también en el análisis)
        if (req.method === 'PATCH') accion = 'e'; // PATCH no está en methodMap: un cambio de estado es una edición
        if (path === '/combustible/auditar-viaje') { mod = ['combustible_analisis', 'urea_analisis']; accion = 'e'; }
        else if (path === '/combustible/wialon-telemetria-batch') { mod = ['combustible_analisis', 'urea_analisis']; accion = 'l'; } // consulta, no guarda
        else if (path.startsWith('/combustible/matriz')) mod = ['combustible_analisis'];
        else if (path.startsWith('/combustible/vales') || path.startsWith('/combustible/estaciones-proveedores') || path === '/combustible/sincronizar-remoto' || path === '/combustible/resumen-vales' || path === '/combustible/compras-externas') {
            mod = ['combustible_vales'];
            if (path === '/combustible/vales/eliminar-masivo') accion = 'd'; // POST que borra: exige eliminar
        }
        else mod = ['combustible_analisis', 'urea_analisis'];
    }
    else if (path.startsWith('/operaciones/docs-marsisa')) mod = ['docs_flota'];
    else if (path.startsWith('/operaciones/conduccion-rpm')) {
        mod = ['combustible_analisis'];
        if (/\/(analizar|viaje)$/.test(path)) accion = 'l'; // POST de cálculo: no guarda nada
        if (path === '/operaciones/conduccion-rpm/precalcular') accion = 'e'; // recalcula el resultado guardado
    }
    else if (path.startsWith('/operaciones/hojas-ruta')) {
        mod = ['op_ordenes_viaje', 'op_programacion'];
        if (path === '/operaciones/hojas-ruta/pdf') accion = 'l'; // convierte el documento, no guarda nada
    }
    else if (path.startsWith('/operaciones/vales')) {
        // Vales de viaje: ver con combustible_vales u op_ordenes_viaje; crear, anular y editar exigen combustible_vales
        mod = (req.method === 'GET' || path.endsWith('/leer')) ? ['combustible_vales', 'op_ordenes_viaje'] : ['combustible_vales'];
        if (path.endsWith('/leer')) accion = 'l'; // lee la foto con IA, no guarda nada
        if (/\/anular$/.test(path)) accion = 'd';
    }
    else if (path.startsWith('/operaciones/rentabilidad')) { mod = ['op_rentabilidad']; accion = 'l'; } // información sensible: solo quien tenga Rentabilidad
    else if (path.startsWith('/operaciones/reporte-viajes')) { mod = ['op_reporte_viajes']; accion = 'l'; }
    else if (path.startsWith('/operaciones/documentos-vencidos')) { mod = ['docs_flota', 'op_ordenes_viaje', 'op_programacion']; accion = 'l'; }
    else if (path.startsWith('/operaciones/puntos')) mod = ['op_ordenes_servicio', 'op_ordenes_viaje', 'op_programacion'];
    else if (path.startsWith('/operaciones/ordenes-servicio')) {
        const lectura = req.method === 'GET';
        mod = lectura ? ['op_ordenes_servicio', 'op_ordenes_viaje', 'op_programacion', 'op_guias_remision'] : ['op_ordenes_servicio', 'op_ordenes_viaje'];
        if (/\/asignar-viaje$/.test(path)) accion = 'e'; // asigna un viaje a una orden existente
    }
    else if (path.startsWith('/operaciones/ordenes-viaje') || path.startsWith('/operaciones/marsisa-ordenes-viaje') || path.startsWith('/operaciones/rutas-matriz')) {
        if (req.method === 'PATCH') accion = 'e'; // PATCH de la asignación: edita el viaje, no lo lee
        mod = req.method === 'GET' ? ['op_ordenes_viaje', 'op_programacion', 'op_guias_remision', 'op_ordenes_servicio'] : ['op_ordenes_viaje', 'op_programacion'];
    }
    else if (path.startsWith('/operaciones/gre') || path.startsWith('/guias-remision') || path.startsWith('/guia-transportista') || path.startsWith('/guia-remitente')) {
        // Credenciales y pruebas de SUNAT: solo administrador (no se asignan en la matriz de roles)
        if (/credenciales|\/config\/|\/test-token-sunat$|\/apisunat\/probar$/.test(path)) return res.status(403).json({ error: 'RBAC: Solo el administrador puede ver o cambiar las credenciales de SUNAT' });
        mod = ['op_guias_remision'];
        if (req.method === 'POST' && /\/(leer|parse-xml)$/.test(path)) accion = 'l'; // leen el XML o la foto, no guardan
        if (req.method === 'POST' && /\/(vincular|desvincular|upload-evidencia|sincronizar)$/.test(path)) accion = 'e'; // cambian una guía existente
        if (req.method === 'POST' && /\/anular$/.test(path)) accion = 'd';
    }
    else if (path.startsWith('/operaciones')) mod = ['op_programacion', 'op_guias_remision', 'op_ordenes_viaje'];
    // Rutas fuera de /operaciones que mencionan viajes (p. ej. tesorería): se mantiene su mapeo anterior, sin las claves que no existen
    else if (path.includes('ordenes-viaje') || path.includes('guias-remision') || path.includes('viajes') || path.includes('programacion')) {
        mod = ['op_programacion', 'op_guias_remision', 'op_ordenes_viaje', 'combustible_analisis', 'combustible_vales', 'placas', 'fleet'];
    }
    else if (path.startsWith('/taller-rampas') || path.startsWith('/taller/entradas') || path.startsWith('/taller/status') || path.startsWith('/taller/kanban') || path === '/taller/ingreso') {
        mod = ['status_rampa', ...leer('ot', 'trabajos_ot')];
    }
    else if (path.startsWith('/taller-personal') || path.startsWith('/taller/personal')) mod = ['pers_mant', ...leer()];
    // Órdenes de trabajo: ingreso y OT, sus servicios y su PDF (el POST solo convierte el documento, no guarda nada)
    else if (path.startsWith('/ordenes') || path.startsWith('/taller/generar_ot') || path.startsWith('/ot-servicios') || path.startsWith('/taller/ot-servicios')) {
        mod = ['ot', ...leer('status_rampa', 'trabajos_ot', 'reportes_ot')];
    }
    else if (path === '/ot-pdf') { mod = ['ot', 'trabajos_ot', 'reportes_ot']; accion = 'l'; }
    // Materiales de la OT (y los repuestos de un trabajo)
    else if (path.startsWith('/ot-materiales') || path.startsWith('/taller/ot-materiales') || path.startsWith('/taller/repuestos') || /^\/taller\/trabajos\/[^/]+\/repuestos$/.test(path)) {
        mod = ['ot', ...leer('trabajos_ot', 'status_rampa')];
    }
    // Trabajos de la OT y técnicos; regularizar técnicos es una edición del trabajo
    else if (path.startsWith('/taller/trabajos') || path.startsWith('/ot-trabajos') || path.startsWith('/ot-horas-tecnicos') || path.startsWith('/ot-tecnicos-disponibles') || path.startsWith('/ot-ultimo-dia')) {
        mod = ['trabajos_ot', ...leer('ot', 'status_rampa', 'reportes_ot')];
        if (path.startsWith('/ot-trabajos/regularizar-tecnicos')) accion = 'e';
    }
    else if (path.startsWith('/taller/historial')) mod = ['ot', ...leer('trabajos_ot', 'reportes_ot')];
    else if (path.startsWith('/checklist') || path.startsWith('/mantenimiento/checklist')) {
        if (req.user && req.user.rol && req.user.rol.toLowerCase().includes('conductor')) {
            return next();
        }
        // Generar OT desde el checklist crea órdenes de trabajo: pide el permiso de OT
        if (/\/generar-ots$/.test(path)) mod = ['ot'];
        else {
            mod = ['checklist', ...leer('ot', 'seguridad_unidades')];
            // Quitar una falla o restaurar la configuración es una edición del checklist
            if (/\/(quitar-falla|restaurar)$/.test(path)) accion = 'e';
        }
    }
    else if (path.startsWith('/fallas')) mod = ['fallas', ...leer('checklist')];
    else if (path.startsWith('/2fa')) {
        // 2FA es gestión personal de cuenta: cualquier usuario autenticado puede usar estas rutas
        return next();
    }
    else if (path.startsWith('/mantenimiento/incidencias') || path.startsWith('/incidencias-ruta')) {
        // Marcar una incidencia como solucionada (PATCH) es una edición
        if (req.method === 'PATCH') accion = 'e';
        mod = ['incidencias_ruta', ...leer('ot', 'fleet')];
    }
    else if (path.startsWith('/telemetria')) {
        mod = ['gps'];
    }
    // Detracciones (reportes y cruce): quien ve Caja o Pago de requerimientos las consulta; la configuración la guarda solo un administrador (lo valida la ruta)
    else if (path.startsWith('/tesoreria/detracciones')) mod = req.method === 'GET' ? ['tesoreria_caja', 'tesoreria_pago_req'] : [];
    // TESORERÍA: cada ruta con su módulo del catálogo. La acción la pone el método (GET l, POST c, PUT e, DELETE d).
    // Los cruces con otras áreas (Operaciones, Almacén, Gerencia y el portal del conductor) van listados aquí.
    else if (/^\/tesoreria\/caja\/(siguiente-numero|buscar-ordenes-viaje)$/.test(path)) mod = ['tesoreria_caja', 'op_ordenes_viaje'];
    // Cargo de la cochera del conductor: endpoint propio y estrecho para Operaciones (la ruta solo admite ese cargo). El POST /tesoreria/caja general exige Caja > Crear.
    else if (path === '/tesoreria/caja/cochera' && req.method === 'POST') mod = ['op_ordenes_viaje'];
    else if (path === '/tesoreria/caja' && req.method === 'GET') mod = ['tesoreria_caja', 'gerencia_aprobaciones_caja'];
    else if (/^\/tesoreria\/caja(\/|$)/.test(path)) mod = ['tesoreria_caja'];
    else if (path.startsWith('/tesoreria/caja-chica')) mod = req.method === 'GET' ? ['tesoreria_caja', 'gerencia_aprobaciones_caja'] : ['tesoreria_caja'];
    else if (path.startsWith('/tesoreria/pago-requerimientos')) mod = req.method === 'GET' ? ['tesoreria_pago_req', 'tesoreria_caja', 'gerencia_aprobaciones_oc'] : ['tesoreria_pago_req', 'tesoreria_caja']; // pagar: también Almacén, con el mismo permiso que ve su botón
    else if (path.startsWith('/tesoreria/cuentas-bancarias')) mod = ['tesoreria_bancos', 'tesoreria_caja']; // Cuentas de proveedores y del personal (misma regla que su pantalla)
    else if (path.startsWith('/tesoreria/bancos')) mod = req.method === 'GET' ? ['tesoreria_bancos', 'tesoreria_caja', 'tesoreria_pago_req', 'op_ordenes_viaje'] : ['tesoreria_bancos', 'tesoreria_caja'];
    else if (path.startsWith('/tesoreria/centros-costos')) mod = req.method === 'GET' ? ['tesoreria_centros_costos', 'tesoreria_caja', 'ent_inv', 'tesoreria_pago_req'] : ['tesoreria_centros_costos', 'tesoreria_caja'];
    else if (path.startsWith('/tesoreria/motivos-gastos')) mod = ['tesoreria_centros_costos', 'tesoreria_caja']; // leer es global (catálogo para órdenes, rendición y portal)
    else if (path.startsWith('/tesoreria/movimientos')) mod = ['tesoreria_movimientos', 'tesoreria_caja'];
    else if (path.startsWith('/tesoreria/cuentas')) mod = ['tesoreria_cuentas'];
    else if (path.startsWith('/tesoreria/liquidaciones-gastos') || path.startsWith('/tesoreria/viaje-servicios')) {
        // Portal del conductor (su rendición) y Operaciones (gastos del viaje) entran sin ser de Tesorería
        mod = path.includes('generar-caja-compensacion') ? ['tesoreria_liquidaciones', 'tesoreria_caja'] : ['tesoreria_liquidaciones', 'conductor_portal', 'op_ordenes_viaje'];
    }
    else if (path.startsWith('/tesoreria')) mod = []; // ruta de Tesorería sin módulo asignado: solo administrador
    // PDF de la inspección: el POST solo convierte el documento, no guarda nada; quien ve las inspecciones puede imprimirlas
    else if (path === '/mantenimiento/inspecciones/pdf') { mod = ['insp']; accion = 'l'; }
    else if (path.startsWith('/inspecciones') || path.startsWith('/mantenimiento/inspecciones')) mod = ['insp'];
    // Siniestros y daños (Mantenimiento › Otros): su propio permiso
    else if (path.startsWith('/mantenimiento/siniestros')) mod = ['siniestros', ...leer()];
    // Planificación de mantenimientos, con sus requerimientos, reportes y el envío de alertas
    else if (path.startsWith('/planificacion') || path.toLowerCase().includes('planificacion') || path.startsWith('/requerimientos')) {
        mod = ['plan', ...leer()];
        if (/\/completar$/.test(path)) accion = 'e';   // marcar un mantenimiento como hecho es una edición
    }
    // Configuración de mantenimiento: kits, frecuencias, tipos MP, métricas y destinatarios de alertas
    else if (path.startsWith('/mantenimiento-kits') || path.startsWith('/tipos-preventivo') || path.startsWith('/tipos-mantenimiento') || path.startsWith('/config-metrica') || path.startsWith('/destinatarios-alertas') || path === '/testEmail') {
        mod = ['cfg_mant', ...leer()];
        if (/\/(bulk-delete|eliminarGrupo)$/.test(path)) accion = 'd';   // borrar en lote
        if (path === '/tipos-preventivo/sync-desde-frecuencias') accion = 'e';
    }
    else if (path.startsWith('/backlog') || path.startsWith('/ot-backlog')) mod = ['ot', ...leer('status_rampa', 'trabajos_ot', 'reportes_ot')];
    // Legacy & API Endpoints
    else if (path.startsWith('/placas') || path.startsWith('/placa') || path.toLowerCase().includes('placa')) mod = ['placas', 'fleet'];
    // «conductores» no existe en el catálogo de permisos: la clave es cond
    else if (path.startsWith('/conductores') || path.startsWith('/conductor') || path.toLowerCase().includes('conductor')) mod = ['cond'];
    else if (path.toLowerCase().includes('usuario')) return res.status(403).json({ error: 'Solo un administrador puede usar esta sección.' });
    else if (path.startsWith('/vehiculos-flota') || path.startsWith('/documentos') || path.startsWith('/documento') || path.toLowerCase().includes('documento')) mod = ['docs_flota', 'placas', 'insp', 'ot'];
    else if (path.startsWith('/inspecciones') || path.toLowerCase().includes('inspeccion')) mod = ['insp'];
    // Mantenimiento preventivo (Fleetrun): su pantalla es «Mantenimiento preventivo» (permiso fleet)
    else if (path.toLowerCase().includes('fleetrun')) {
        mod = ['fleet', ...leer('plan', 'cfg_mant')];
        if (path === '/fleetrun-pdf') accion = 'l';   // el PDF no guarda nada
        if (/backfill/i.test(path)) accion = 'e';     // corrige códigos ya registrados
    }
    else if (path.toLowerCase().includes('statusflota')) mod = ['status_rampa', ...leer('fleet')];
    else if (path.toLowerCase().includes('wialon')) mod = ['gps', 'fleet'];
    else if (path.toLowerCase().includes('tiposmantenimiento') || path.toLowerCase().includes('tpmp')) mod = ['cfg_mant', ...leer('fleet', 'plan')];
    else if (path.startsWith('/script/')) {
        let col = (req.body.coleccion || '').toLowerCase();
        if (col === 'usuarios') mod = ['usuarios'];
        else if (col === 'placas') mod = ['placas'];
        else if (col === 'proveedores') mod = ['prov_inv'];
        else if (col === 'inventario') mod = ['inv'];
        else if (col === 'entradas_almacen') mod = ['ent_inv'];
        else if (col === 'salidas_almacen') mod = ['sal_inv'];
        else if (col === 'ordenes_trabajo' || col === 'ot_actividades') mod = ['ot', ...leer('status_rampa', 'trabajos_ot')];
        else if (col === 'mantenimiento_preventivo') mod = ['fleet', 'cfg_mant', 'plan'];
        else if (col === 'planificacion_mps') mod = ['plan'];
        else mod = ['fleet', 'ot', 'status_rampa', 'inv', 'placas'];
    }

    if (mod) {
        let mods = Array.isArray(mod) ? mod : [mod];
        let hasAccess = false;
        
        for (let mKey of mods) {
            let m = p[mKey];
            if (m && (m[accion] === 1 || m[accion] === true || (accion === 'l' && (m.enabled === 1 || m.enabled === true)))) {
                hasAccess = true;
                break;
            }
        }
        
        if (!hasAccess) {
            return res.status(403).json({ error: `RBAC: Permiso denegado para la acción '${accion}' en las áreas [${mods.join(', ')}]` });
        }
        return next();
    }

    // Deny-by-default if no mapping found (Strict mode)
    return res.status(403).json({ error: `RBAC Estricto: Ruta no mapeada (${path})` });
};
