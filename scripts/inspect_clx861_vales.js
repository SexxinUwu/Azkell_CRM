const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: 'azkell_tenant_marsisa'
    });

    const [vales] = await conn.query(
        "SELECT id, viaje, vehiculo, fecha, kilometraje, galones, importe, tipo_combustible, tipo, estacion, proveedor, conductor FROM combustible_vales WHERE vehiculo = 'CLX861' ORDER BY fecha ASC, id ASC"
    );

    console.log(`Total vales para CLX861: ${vales.length}`);
    vales.forEach(v => {
        const fStr = v.fecha ? new Date(v.fecha).toISOString().replace('T', ' ').slice(0, 19) : 'SIN_FECHA';
        console.log(`ID: ${v.id} | Viaje: ${v.viaje} | Fecha: ${fStr} | Km: ${v.kilometraje} | Gal: ${v.galones} | Prod: ${v.tipo_combustible} | Est: ${v.estacion}`);
    });

    await conn.end();
}

main().catch(console.error);
