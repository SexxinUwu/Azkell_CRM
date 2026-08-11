// Global RBAC Middleware
module.exports = function globalRBAC(req, res, next) {
    const path = req.path;
    // Rutas públicas o helpers que no requieren permisos de módulo
    const ignoredPaths = [
        '/login', '/ping', '/eventos', '/test-s3', '/seguridad/limpiar-plantillas', 
        '/cambiar-password', '/conductores', '/conductores-lista', '/placas-lista', 
        '/clientes-placas', '/marcas-placas', '/proxy/documento', '/proxy/sunat', '/proxy/geocode', '/notificaciones',
        '/script/obtener', '/script/buscar', '/integraciones', '/catalogos_taller'
    ];
    if (ignoredPaths.some(ip => path === ip || path.startsWith(ip))) return next();

    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    // Desactivar bypass global: activar validación estricta de permisos RBAC

    // Datos de referencia globales ampliados: Listas desplegables permitidas para cualquier usuario autenticado
    const globalReferenceGets = [
        '/config-metrica',
        '/km-historico',
        '/almacen/marcas-placas',
        '/almacen/familias',
        '/almacen/marcas',
        '/almacen/sistemas',
        '/almacen/unidades',
        '/almacen/proveedores',
        '/almacen/placas',
        '/catalogos_taller',
        '/almacen/notificaciones/resumen',
        '/tipos-preventivo',
        '/tipos-mantenimiento',
        '/mantenimiento-kits',
        '/taller-rampas',
        '/taller-personal',
        '/roles',
        '/usuarios-v2'
    ];
    if (req.method === 'GET' && globalReferenceGets.some(p => path === p || path.startsWith(p))) {
        return next();
    }

    if (req.user.rol === 'Fundador' || req.user.rol === 'Administrador' || (req.user.rol && req.user.rol.toLowerCase().includes('admin'))) return next();

    let p = {};
    try {
        p = typeof req.user.permisos === 'string' ? JSON.parse(req.user.permisos) : req.user.permisos;
    } catch(e) {}
    if (p.admin === true) return next();

    const methodMap = { GET: 'l', POST: 'c', PUT: 'e', DELETE: 'd' };
    let accion = methodMap[req.method] || 'l';
    let mod = null;

    // Si es un script legacy, forzar la acción según el nombre de la operación
    if (path.startsWith('/script/obtener') || path.startsWith('/script/buscar')) accion = 'l';
    else if (path.startsWith('/script/actualizar') || path.startsWith('/script/editar')) accion = 'e';
    else if (path.startsWith('/script/eliminar')) accion = 'd';

    // SISTEMA
    if (path.startsWith('/roles')) mod = 'roles';
    else if (path.startsWith('/usuarios-v2')) mod = 'usuarios';
    else if (path.startsWith('/integraciones')) mod = 'integraciones';
    else if (path.startsWith('/auditoria')) mod = 'mod_auditoria';
    else if (path.startsWith('/seguridad/asistencia')) mod = 'asist';
    else if (path.startsWith('/seguridad/unidades')) mod = ['checklist', 'unid'];
    else if (path.startsWith('/configuracion-flota')) mod = 'cfg_mant';
    
    // ALMACEN & CONFIGURACION
    else if (path.startsWith('/perfil')) return next();
    else if (path.startsWith('/almacen/inventario')) mod = ['inv'];
    else if (path.startsWith('/clientes')) mod = ['clientes', 'placas'];
    else if (path.startsWith('/almacen/entradas')) mod = ['ent_inv'];
    else if (path.startsWith('/almacen/salidas')) mod = ['sal_inv'];
    else if (path.startsWith('/almacen/proveedores')) {
        mod = (req.method === 'GET') ? ['prov_inv', 'ent_inv', 'sal_inv'] : ['prov_inv'];
    }
    else if (path.startsWith('/almacen/placas') || path.startsWith('/almacen/marcas-placas')) mod = ['placas'];
    else if (path.startsWith('/almacen/kardex')) mod = ['kardex'];
    else if (path.startsWith('/almacen/costos')) mod = ['costos_inv'];
    else if (path.startsWith('/almacen/familias')) mod = ['cfg_familias', 'cfg_almacen', 'inv'];
    else if (path.startsWith('/almacen/marcas')) mod = ['cfg_marcas', 'cfg_almacen', 'inv'];
    else if (path.startsWith('/almacen/sistemas')) mod = ['cfg_sistemas', 'cfg_almacen', 'inv'];
    else if (path.startsWith('/almacen/unidades')) mod = ['cfg_unidades', 'inv', 'ent_inv', 'sal_inv'];
    else if (path.startsWith('/almacen/notificaciones')) mod = ['inv', 'ent_inv', 'sal_inv', 'kardex', 'cfg_almacen'];
    else if (path.startsWith('/almacen/configuracion')) mod = ['inv', 'ent_inv', 'sal_inv', 'cfg_almacen'];

    // MANTENIMIENTO
    else if (path.startsWith('/taller-rampas') || path.startsWith('/taller/entradas') || path.startsWith('/taller/status') || path.startsWith('/taller/kanban')) {
        mod = ['status_rampa', 'ot', 'trabajos_ot', 'fleetrun', 'plan', 'cfg_mant'];
    }
    else if (path.startsWith('/ordenes') || path.startsWith('/taller/generar_ot')) {
        mod = (req.method === 'GET') ? ['ot', 'status_rampa', 'trabajos_ot', 'reportes_ot', 'sal_inv'] : ['ot', 'status_rampa', 'trabajos_ot'];
    }
    else if (path.startsWith('/taller/trabajos') || path.startsWith('/ot-trabajos')) mod = ['trabajos_ot', 'ot', 'status_rampa'];
    else if (path.startsWith('/ot-materiales') || path.startsWith('/taller/repuestos')) mod = ['ot', 'trabajos_ot', 'status_rampa', 'sal_inv', 'inv'];
    else if (path.startsWith('/taller/historial')) mod = ['ot'];
    else if (path.startsWith('/checklist')) mod = ['checklist', 'ot', 'insp', 'status_rampa'];
    else if (path.startsWith('/inspecciones') || path.startsWith('/mantenimiento/inspecciones')) mod = ['insp'];
    else if (path.startsWith('/planificacion')) mod = ['plan'];
    else if (path.startsWith('/mantenimiento-kits') || path.startsWith('/tipos-preventivo') || path.startsWith('/tipos-mantenimiento') || path.startsWith('/config-metrica')) mod = ['cfg_mant'];
    else if (path.startsWith('/backlog') || path.startsWith('/ot-backlog')) mod = ['ot', 'status_rampa'];
    // Legacy & API Endpoints
    else if (path.startsWith('/placas') || path.startsWith('/placa') || path.toLowerCase().includes('placa')) mod = ['placas', 'fleet'];
    else if (path.startsWith('/conductores') || path.startsWith('/conductor') || path.toLowerCase().includes('conductor')) mod = ['cond', 'conductores'];
    else if (path.startsWith('/usuarios') || path.startsWith('/usuario') || path.toLowerCase().includes('usuario')) mod = ['usuarios'];
    else if (path.startsWith('/documentos') || path.startsWith('/documento') || path.toLowerCase().includes('documento')) mod = ['docs_flota', 'placas', 'insp', 'ot'];
    else if (path.startsWith('/inspecciones') || path.toLowerCase().includes('inspeccion')) mod = ['insp'];
    else if (path.toLowerCase().includes('fleetrun')) mod = ['fleetrun', 'fleet', 'cfg_mant', 'plan'];
    else if (path.toLowerCase().includes('statusflota')) mod = ['status_rampa', 'fleet', 'fleetrun', 'ot', 'status'];
    else if (path.toLowerCase().includes('wialon')) mod = ['gps', 'fleet'];
    else if (path.toLowerCase().includes('tiposmantenimiento') || path.toLowerCase().includes('tpmp')) mod = ['cfg_mant', 'fleetrun', 'ot', 'plan'];
    else if (path.startsWith('/script/')) {
        let col = (req.body.coleccion || '').toLowerCase();
        if (col === 'usuarios') mod = ['usuarios'];
        else if (col === 'placas') mod = ['placas'];
        else if (col === 'proveedores') mod = ['prov_inv'];
        else if (col === 'inventario') mod = ['inv'];
        else if (col === 'entradas_almacen') mod = ['ent_inv'];
        else if (col === 'salidas_almacen') mod = ['sal_inv'];
        else if (col === 'ordenes_trabajo' || col === 'ot_actividades') mod = ['ot', 'status_rampa', 'trabajos_ot'];
        else if (col === 'mantenimiento_preventivo') mod = ['cfg_mant', 'fleetrun', 'plan'];
        else if (col === 'planificacion_mps') mod = ['plan'];
        else mod = ['fleetrun', 'ot', 'status_rampa', 'inv', 'placas'];
    }

    if (mod) {
        let mods = Array.isArray(mod) ? mod : [mod];
        let hasAccess = false;
        
        for (let mKey of mods) {
            let m = p[mKey];
            if (m && (m[accion] === 1 || m[accion] === true)) {
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
