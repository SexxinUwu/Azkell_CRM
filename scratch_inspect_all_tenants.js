const mysql = require('mysql2/promise');
require('dotenv').config();

const dbs = ['azkell_fleet', 'azkell_tenant_marsisa', 'azkell_tenant_rosymarperu', 'azkell_tenant_yoguitransport'];

async function inspectAll() {
    for (const dbName of dbs) {
        console.log(`\n================== CHECKING DB: ${dbName} ==================`);
        try {
            const conn = await mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: dbName,
                port: process.env.DB_PORT || 3306
            });

            // Check OS
            const [hasOS] = await conn.query("SHOW TABLES LIKE 'operaciones_ordenes_servicio'");
            if (hasOS.length > 0) {
                const [os] = await conn.query("SELECT id, codigo_orden, fecha, viaje_asignado, cliente_nombre, estado_servicio FROM operaciones_ordenes_servicio");
                console.log(`[${dbName}] operaciones_ordenes_servicio:`, os.length);
                if (os.length > 0) console.table(os);
            }

            // Check OV
            const [hasOV] = await conn.query("SHOW TABLES LIKE 'operaciones_ordenes_viaje'");
            if (hasOV.length > 0) {
                const [ov] = await conn.query("SELECT id, viaje, fecha_viaje, conductor, tracto, estado FROM operaciones_ordenes_viaje");
                console.log(`[${dbName}] operaciones_ordenes_viaje:`, ov.length);
                if (ov.length > 0) console.table(ov);
            }

            // Check tesoreria_cuentas
            const [hasTc] = await conn.query("SHOW TABLES LIKE 'tesoreria_cuentas'");
            if (hasTc.length > 0) {
                const [tc] = await conn.query("SELECT id, orden_servicio, numero_viaje, cliente, flete, estado_servicio FROM tesoreria_cuentas WHERE orden_servicio IN ('2026-00000002', '2026-00000003', '2026-00000004') OR numero_viaje IN ('2026-00000001', '2026-00000002')");
                console.log(`[${dbName}] tesoreria_cuentas matches:`, tc.length);
                if (tc.length > 0) console.table(tc);
            }

            // Check tesoreria_caja
            const [hasCaja] = await conn.query("SHOW TABLES LIKE 'tesoreria_caja'");
            if (hasCaja.length > 0) {
                const [caja] = await conn.query("SELECT id, codigo, orden_viaje, tipo_movimiento, importe_total, estado FROM tesoreria_caja WHERE orden_viaje IN ('2026-00000001', '2026-00000002') OR detalle LIKE '%2026-0000000%'");
                console.log(`[${dbName}] tesoreria_caja matches:`, caja.length);
                if (caja.length > 0) console.table(caja);
            }

            // Check tesoreria_liquidaciones_gastos
            const [hasLiq] = await conn.query("SHOW TABLES LIKE 'tesoreria_liquidaciones_gastos'");
            if (hasLiq.length > 0) {
                const [liq] = await conn.query("SELECT id, orden_viaje, fecha, conductor, tipo_gasto, importe FROM tesoreria_liquidaciones_gastos WHERE orden_viaje IN ('2026-00000001', '2026-00000002')");
                console.log(`[${dbName}] tesoreria_liquidaciones_gastos matches:`, liq.length);
                if (liq.length > 0) console.table(liq);
            }

            await conn.end();
        } catch(e) {
            console.error(`[${dbName}] Error:`, e.message);
        }
    }
}

inspectAll();
