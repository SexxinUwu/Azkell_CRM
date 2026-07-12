const fs = require('fs');
const mysql = require('mysql2');
require('dotenv').config({ path: './.env' }); // Assuming there's a .env

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'azkell',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const _stockSQL = `
  SELECT i.*,
    ROUND(
      COALESCE(i.stock_regularizado, 0)
      + COALESCE(ent.total_entradas, 0)
      - COALESCE(sal.total_salidas, 0)
    , 4) AS stock_actual
  FROM inventario i
  LEFT JOIN (
      SELECT 
          d.inventario_id, 
          SUM(d.cantidad) AS total_entradas
      FROM detalle_entradas_inv d
      JOIN entradas_inv e ON e.id = d.entrada_id
      JOIN inventario inv ON inv.id = d.inventario_id
      WHERE (inv.fecha_regularizacion IS NULL OR DATE(e.created_at) >= DATE(inv.fecha_regularizacion))
      GROUP BY d.inventario_id
  ) ent ON ent.inventario_id = i.id
  LEFT JOIN (
      SELECT 
          inv.id AS mapped_id,
          SUM(d.cantidad) AS total_salidas
      FROM detalle_salidas_inv d
      JOIN salidas_inv s ON s.id = d.salida_id
      JOIN inventario inv ON (d.inventario_id = inv.id OR (d.inventario_id IS NULL AND SUBSTRING_INDEX(d.descripcion, ' - ', 1) = inv.id))
      WHERE s.estado = 'Despachado'
        AND (inv.fecha_regularizacion IS NULL OR DATE(s.created_at) >= DATE(inv.fecha_regularizacion))
      GROUP BY inv.id
  ) sal ON sal.mapped_id = i.id
  WHERE i.activo=1
  ORDER BY i.id`;

const salidasSQL = `SELECT s.*,
              GROUP_CONCAT(CONCAT_WS('\x1F',
                COALESCE(d.inventario_id,''),
                COALESCE(d.descripcion,''),
                COALESCE(d.cantidad,0),
                COALESCE(d.costo_unitario,0),
                COALESCE(d.moneda,'PEN'),
                COALESCE(d.importe, d.cantidad*d.costo_unitario, 0)
              ) SEPARATOR '\x1E') AS items_raw
              FROM salidas_inv s
              LEFT JOIN detalle_salidas_inv d ON d.salida_id=s.id
              GROUP BY s.id ORDER BY s.fecha DESC, s.id DESC LIMIT 300`;

async function test() {
    console.time('Inventario (stockSQL)');
    try {
        const [rows1] = await pool.promise().query(_stockSQL);
        console.log('Inventario rows:', rows1.length);
    } catch(e) { console.error('Error inventario:', e.message); }
    console.timeEnd('Inventario (stockSQL)');

    console.time('Salidas (salidasSQL)');
    try {
        const [rows2] = await pool.promise().query(salidasSQL);
        console.log('Salidas rows:', rows2.length);
    } catch(e) { console.error('Error salidas:', e.message); }
    console.timeEnd('Salidas (salidasSQL)');

    process.exit(0);
}

test();
