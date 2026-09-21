require('dotenv').config();
const { getTenantPool } = require('../services/tenant_master');

async function run() {
    const pool = getTenantPool('azkell_tenant_marsisa').promise();
    
    // Find an item that has past movements
    const [movCheck] = await pool.query(`
        SELECT inventario_id, COUNT(*) as cnt 
        FROM detalle_entradas_inv 
        GROUP BY inventario_id 
        ORDER BY cnt DESC LIMIT 5
    `);
    console.log('Items with past entries:', movCheck);

    if (movCheck.length > 0) {
        const id = movCheck[0].inventario_id;
        const [inv] = await pool.query('SELECT stock_regularizado, fecha_regularizacion FROM inventario WHERE id=?', [id]);
        console.log('Item info:', inv[0]);

        const [rows] = await pool.query(`
            SELECT 'Entrada' AS tipo, e.fecha, e.created_at, e.id AS doc_id, e.proveedor_nombre AS contraparte, d.cantidad, d.costo_unitario, d.moneda, d.importe
            FROM detalle_entradas_inv d JOIN entradas_inv e ON e.id=d.entrada_id
            WHERE d.inventario_id=? AND (e.estado IS NULL OR e.estado != 'Anulado') AND (e.tipo_orden = 'Entrada directa' OR e.tipo_orden = 'Ajuste')
            UNION ALL
            SELECT 'Recepción OC' AS tipo, DATE(r.fecha_recepcion) AS fecha, r.fecha_recepcion AS created_at, r.oc_id AS doc_id, CONCAT('Recepción OC / ', COALESCE(r.almacen,'ALM CENTRAL'), ' - ', COALESCE(r.usuario,'')) AS contraparte, dr.cantidad_recibida AS cantidad, dr.costo_unitario, dr.moneda, (dr.cantidad_recibida * dr.costo_unitario) AS importe
            FROM detalle_recepciones_oc dr JOIN recepciones_oc r ON r.id=dr.recepcion_id
            WHERE dr.inventario_id=?
            UNION ALL
            SELECT 'Salida' AS tipo, s.fecha, s.created_at, s.id AS doc_id, CONCAT(s.tipo_destino,' / ',COALESCE(s.placa,s.responsable,'—')) AS contraparte, d.cantidad, d.costo_unitario, d.moneda, d.importe
            FROM detalle_salidas_inv d JOIN salidas_inv s ON s.id=d.salida_id
            WHERE d.inventario_id=? AND (s.estado IS NULL OR s.estado = 'Despachado')
            ORDER BY fecha ASC, created_at ASC, doc_id ASC
        `, [id, id, id]);

        console.log('Kardex movements count:', rows.length);
        console.log('First 2 movements:', rows.slice(0, 2));
    }

    process.exit(0);
}

run();
