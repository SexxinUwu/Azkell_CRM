const { getAllActiveTenants } = require('../services/tenant_master');

(async () => {
    const tenants = await getAllActiveTenants();
    console.log('=== USUARIOS HABILITADOS PARA SEGURIDAD & GARITA ===');
    for (const t of tenants) {
        const [users] = await t.pool.promise().query(
            "SELECT idUsuario, nombre, correo, rol, telefono, dni FROM usuarios WHERE LOWER(rol) LIKE '%seguridad%' OR LOWER(rol) LIKE '%admin%' OR LOWER(correo) = 'admin@azkell.com'"
        );
        if (users.length > 0) {
            console.log(`\n🏢 [EMPRESA: ${t.nombre_empresa}]`);
            console.table(users);
        }
    }
    process.exit(0);
})();
