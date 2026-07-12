const fs = require('fs');
const path = require('path');

const fileRoutes = path.join(__dirname, 'routes', 'almacen.js');
let routes = fs.readFileSync(fileRoutes, 'utf8');

const regexSQL = /const _stockSQL = \`[\s\S]*?ORDER BY i\.id\`;/;
const newSQL = `const _stockSQL = \`
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
      -- Nota: No se puede filtrar fácilmente por i.fecha_regularizacion en una tabla derivada pre-agregada sin JOIN a inventario, 
      -- así que lo incluiremos en el JOIN interno para poder agrupar.
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
      -- Mapear d.inventario_id o, en su defecto, extraer el ID de d.descripcion
      JOIN inventario inv ON (d.inventario_id = inv.id OR (d.inventario_id IS NULL AND SUBSTRING_INDEX(d.descripcion, ' - ', 1) = inv.id))
      WHERE s.estado = 'Despachado'
        AND (inv.fecha_regularizacion IS NULL OR DATE(s.created_at) >= DATE(inv.fecha_regularizacion))
      GROUP BY inv.id
  ) sal ON sal.mapped_id = i.id
  WHERE i.activo=1
  ORDER BY i.id\`;`;

if (regexSQL.test(routes)) {
    routes = routes.replace(regexSQL, newSQL);
    fs.writeFileSync(fileRoutes, routes, 'utf8');
    console.log('Optimized _stockSQL query.');
} else {
    console.log('Could not match _stockSQL regex');
}
