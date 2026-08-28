const mysql = require('mysql2/promise');
require('dotenv').config();

const REMOTE_CONFIG = {
    host: process.env.REMOTE_FUEL_HOST || '168.231.98.23',
    user: process.env.REMOTE_FUEL_USER || 'prov_combustible',
    password: process.env.REMOTE_FUEL_PASSWORD || '32f2dc8b2b27fc021c81674c04c2326e',
    database: process.env.REMOTE_FUEL_DATABASE || 'marsisadb_prod',
    connectTimeout: 15000
};

async function main() {
    const conn = await mysql.createConnection(REMOTE_CONFIG);

    // 1. Ver qué viajes en vw_combustible_orden_viaje coinciden con vw_combustible_vale
    const [ovs] = await conn.query("SELECT id_viaje, viaje, fecha_viaje, conductor, placa_vehiculo FROM vw_combustible_orden_viaje ORDER BY fecha_viaje DESC LIMIT 50");
    console.log("Total OVs analizadas:", ovs.length);

    for (const ov of ovs.slice(0, 15)) {
        // Extraer número limpio sin año (ej: '2026-00000952' -> '00000952' o 952)
        const parts = (ov.viaje || '').split('-');
        const numCorrelativo = parts[parts.length - 1];
        const numInt = parseInt(numCorrelativo, 10);

        const [vales] = await conn.query(
            "SELECT id, serie, numero, viaje_numero, viaje_rutas, placa FROM vw_combustible_vale WHERE viaje_numero = ? OR viaje_numero = ? OR viaje_numero = ? OR viaje_rutas LIKE ? LIMIT 3",
            [ov.viaje, numCorrelativo, String(numInt), `%${numCorrelativo}%`]
        );

        console.log(`OV [${ov.viaje}] (${ov.fecha_viaje ? ov.fecha_viaje.toISOString().slice(0,10) : ''} - ${ov.placa_vehiculo}): ${vales.length} vales encontrados. Rutas:`, vales.map(v => `${v.viaje_numero} -> ${v.viaje_rutas}`));
    }

    await conn.end();
}

main().catch(console.error);
