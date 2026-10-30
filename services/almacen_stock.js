// Stock actual de cada artículo del inventario: catálogo + entradas + recepciones de OC - salidas despachadas.
// Lo usan el inventario de almacén (routes/almacen.js) y los reportes del asistente: un solo cálculo.
const STOCK_SQL = `SELECT i.*,
DATE_FORMAT(i.fecha_regularizacion, '%Y-%m-%d %H:%i:%s') AS fecha_regularizacion,
COALESCE(prov.ultimo_proveedor, p_dir.nombre) AS ultimo_proveedor,
ROUND(
  COALESCE(i.stock_regularizado, 0)
  + COALESCE(ent.total_entradas, 0)
  + COALESCE(rec.total_recepciones, 0)
  - COALESCE(sal.total_salidas, 0)
, 4) AS stock_actual,
tcu.tc_ultima_oc
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
  JOIN entradas_inv e ON e.id = r.oc_id
  JOIN inventario inv ON inv.id = dr.inventario_id
  WHERE (e.estado IS NULL OR (e.estado != 'Anulado' AND LOWER(e.estado) NOT LIKE '%anul%' AND LOWER(e.estado) NOT LIKE '%rechaz%'))
    AND (inv.fecha_regularizacion IS NULL OR COALESCE(r.created_at, r.fecha_recepcion) > inv.fecha_regularizacion)
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
LEFT JOIN (
  SELECT x.inventario_id, e.tipo_cambio AS tc_ultima_oc
  FROM (
    SELECT d.inventario_id, d.entrada_id,
      ROW_NUMBER() OVER (PARTITION BY d.inventario_id ORDER BY COALESCE(e.fecha, e.created_at) DESC, d.id DESC) AS rn
    FROM detalle_entradas_inv d
    JOIN entradas_inv e ON e.id = d.entrada_id
    WHERE (e.estado IS NULL OR e.estado != 'Anulado')
  ) x
  JOIN entradas_inv e ON e.id = x.entrada_id
  WHERE x.rn = 1
) tcu ON tcu.inventario_id = i.id
WHERE i.activo=1
ORDER BY i.id`;

module.exports = { STOCK_SQL };
