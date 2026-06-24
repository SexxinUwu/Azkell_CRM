// Global RBAC Middleware
module.exports = function globalRBAC(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (req.user.rol === 'Fundador') return next();

    let p = {};
    try {
        p = typeof req.user.permisos === 'string' ? JSON.parse(req.user.permisos) : req.user.permisos;
    } catch(e) {}
    if (p.admin === true) return next();

    const path = req.path;
    // Rutas públicas o helpers que no requieren permisos de módulo
    const ignoredPaths = ['/login', '/ping', '/eventos', '/test-s3', '/seguridad/limpiar-plantillas', '/cambiar-password', '/conductores', '/conductores-lista', '/placas-lista', '/clientes-placas', '/marcas-placas', '/proxy/documento'];
    if (ignoredPaths.some(ip => path === ip || path.startsWith(ip + '/'))) return next();

    const methodMap = { GET: 'l', POST: 'c', PUT: 'e', DELETE: 'd' };
    const accion = methodMap[req.method] || 'l';
    let mod = null;

    // SISTEMA
    if (path.startsWith('/roles')) mod = 'roles';
    else if (path.startsWith('/usuarios-v2')) mod = 'usuarios';
    else if (path.startsWith('/integraciones')) mod = 'integraciones';
    else if (path.startsWith('/auditoria')) mod = 'mod_auditoria';
    else if (path.startsWith('/seguridad/asistencia')) mod = 'asist';
    else if (path.startsWith('/seguridad/unidades')) mod = 'unid';
    else if (path.startsWith('/configuracion-flota')) mod = 'cfg_mant';
    
    // ALMACEN
    else if (path.startsWith('/inventario')) mod = 'inv';
    else if (path.startsWith('/entradas') && !path.startsWith('/taller')) mod = 'ent_inv';
    else if (path.startsWith('/salidas') && !path.startsWith('/taller')) mod = 'sal_inv';
    else if (path.startsWith('/proveedores')) mod = 'prov_inv';
    else if (path.startsWith('/placas')) mod = 'placas';
    else if (path.startsWith('/kardex')) mod = 'kardex';
    else if (path.startsWith('/costos')) mod = 'costos_inv';
    else if (path.startsWith('/familias') || path.startsWith('/marcas') || path.startsWith('/sistemas')) mod = 'cfg_almacen';

    // MANTENIMIENTO
    else if (path.startsWith('/taller/entradas') || path.startsWith('/taller/status')) mod = 'status_rampa';
    else if (path.startsWith('/ordenes') || path.startsWith('/taller/generar_ot')) mod = 'ot';
    else if (path.startsWith('/taller/trabajos') || path.startsWith('/ot-trabajos')) mod = 'trabajos_ot';
    else if (path.startsWith('/ot-materiales') || path.startsWith('/taller/repuestos')) mod = 'ot';
    else if (path.startsWith('/taller/historial')) mod = 'ot';
    else if (path.startsWith('/inspecciones')) mod = 'insp';
    else if (path.startsWith('/planificacion')) mod = 'plan';
    else if (path.startsWith('/mantenimiento-kits') || path.startsWith('/tipos-preventivo') || path.startsWith('/tipos-mantenimiento') || path.startsWith('/config-metrica')) mod = 'cfg_mant';
    else if (path.startsWith('/backlog') || path.startsWith('/ot-backlog')) mod = 'ot';
    else if (path.startsWith('/fleetrun')) mod = 'fleet';
    
    // Legacy /api/script endpoints that use req.body.coleccion
    else if (path.startsWith('/script/')) {
        let col = (req.body.coleccion || '').toLowerCase();
        if (col === 'usuarios') mod = 'usuarios';
        else if (col === 'placas') mod = 'placas';
        else if (col === 'proveedores') mod = 'prov_inv';
        else if (col === 'inventario') mod = 'inv';
        else if (col === 'entradas_almacen') mod = 'ent_inv';
        else if (col === 'salidas_almacen') mod = 'sal_inv';
        else if (col === 'ordenes_trabajo' || col === 'ot_actividades') mod = 'ot';
        else if (col === 'mantenimiento_preventivo') mod = 'cfg_mant';
        else if (col === 'planificacion_mps') mod = 'plan';
    }

    if (mod) {
        let m = p[mod];
        if (!m) return res.status(403).json({ error: `RBAC: Módulo denegado (${mod})` });
        if (m[accion] !== 1 && m[accion] !== true) {
            return res.status(403).json({ error: `RBAC: Acción '${accion}' denegada en módulo '${mod}'` });
        }
        return next();
    }

    // Deny-by-default if no mapping found (Strict mode)
    return res.status(403).json({ error: `RBAC Estricto: Ruta no mapeada (${path})` });
};
