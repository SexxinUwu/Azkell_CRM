const mysql = require('mysql2/promise');
require('dotenv').config();
async function test() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'azkell'
    });
    const sql = `
    SELECT i.id, i.descripcion, i.anaquel, i.ubicacion,
           COALESCE(prov.ultimo_proveedor, p_dir.nombre) AS ultimo_proveedor
    FROM inventario i
    LEFT JOIN (
        SELECT 
            d.inventario_id,
            SUBSTRING_INDEX(GROUP_CONCAT(e.proveedor_nombre ORDER BY COALESCE(e.fecha, e.created_at) DESC, d.id DESC SEPARATOR '|||'), '|||', 1) AS ultimo_proveedor
        FROM detalle_entradas_inv d
        JOIN entradas_inv e ON e.id = d.entrada_id
        WHERE (e.estado IS NULL OR e.estado != 'Anulado')
          AND e.proveedor_nombre IS NOT NULL AND e.proveedor_nombre != ''
        GROUP BY d.inventario_id
    ) prov ON prov.inventario_id = i.id
    LEFT JOIN proveedores_inv p_dir ON p_dir.id = i.proveedor_id
    WHERE i.anaquel IS NOT NULL AND i.anaquel != ''
    LIMIT 5
    `;
    const [rows] = await conn.query(sql);
    console.log(rows);
    await conn.end();
}
test().catch(e => console.error(e));
