require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function run() {
    const pool = getTenantPool('azkell_tenant_marsisa').promise();
    const sql = `
  SELECT i.id, i.descripcion, i.stock_regularizado, i.fecha_regularizacion,
    ROUND(
      COALESCE(i.stock_regularizado, 0)
      + COALESCE(ent.total_entradas, 0)
      + COALESCE(rec.total_recepciones, 0)
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
      WHERE (inv.fecha_regularizacion IS NULL OR COALESCE(e.created_at, e.fecha) > inv.fecha_regularizacion)
        AND (e.estado IS NULL OR e.estado != 'Anulado')
        AND (e.tipo_orden = 'Entrada directa' OR e.tipo_orden = 'Ajuste')
      GROUP BY d.inventario_id
  ) ent ON ent.inventario_id = i.id
  LEFT JOIN (
      SELECT 
          dr.inventario_id,
          SUM(dr.cantidad_recibida) AS total_recepciones
      FROM detalle_recepciones_oc dr
      JOIN recepciones_oc r ON r.id = dr.recepcion_id
      JOIN inventario inv ON inv.id = dr.inventario_id
      WHERE (inv.fecha_regularizacion IS NULL OR COALESCE(r.created_at, r.fecha_recepcion) > inv.fecha_regularizacion)
      GROUP BY dr.inventario_id
  ) rec ON rec.inventario_id = i.id
  LEFT JOIN (
      SELECT 
          inv.id AS mapped_id,
          SUM(d.cantidad) AS total_salidas
      FROM detalle_salidas_inv d
      JOIN salidas_inv s ON s.id = d.salida_id
      JOIN inventario inv ON (d.inventario_id = inv.id OR (d.inventario_id IS NULL AND SUBSTRING_INDEX(d.descripcion, ' - ', 1) = inv.id))
      WHERE s.estado = 'Despachado'
        AND (inv.fecha_regularizacion IS NULL OR COALESCE(s.created_at, s.fecha) > inv.fecha_regularizacion)
      GROUP BY inv.id
  ) sal ON sal.mapped_id = i.id
  WHERE i.activo=1
  ORDER BY i.id
  LIMIT 10`;

    const [rows] = await pool.query(sql);
    console.log('Sample stock query results:', rows);
    process.exit(0);
}

run();
