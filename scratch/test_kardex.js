const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: 'azkell_tenant_marsisa'
});

(async () => {
    try {
        const id = 'INV-0119';
        const [inv] = await pool.promise().query("SELECT stock_regularizado, DATE_FORMAT(fecha_regularizacion, '%Y-%m-%d %H:%i:%s') AS fecha_regularizacion FROM inventario WHERE id=?", [id]);
        console.log('Inventario base:', inv);
        const base = parseFloat(inv[0]?.stock_regularizado || 0);

        const [rows] = await pool.promise().query(`
            SELECT 'Entrada' AS tipo, e.fecha, e.created_at, e.id AS doc_id, e.proveedor_nombre AS contraparte, d.cantidad, d.costo_unitario, d.moneda, d.importe
            FROM detalle_entradas_inv d JOIN entradas_inv e ON e.id=d.entrada_id
            WHERE d.inventario_id=? AND (e.estado IS NULL OR e.estado != 'Anulado') AND (e.tipo_orden = 'Entrada directa' OR e.tipo_orden = 'Ajuste')
            UNION ALL
            SELECT 'Recepción OC' AS tipo, DATE(r.fecha_recepcion) AS fecha, r.fecha_recepcion AS created_at, r.oc_id AS doc_id, CONCAT('Recepción OC / ', COALESCE(r.almacen,'ALM CENTRAL'), ' - ', COALESCE(r.usuario,'')) AS contraparte, dr.cantidad_recibida AS cantidad, dr.costo_unitario, dr.moneda, (dr.cantidad_recibida * dr.costo_unitario) AS importe
            FROM detalle_recepciones_oc dr 
            JOIN recepciones_oc r ON r.id=dr.recepcion_id
            JOIN entradas_inv e ON e.id=r.oc_id
            WHERE dr.inventario_id=? AND (e.estado IS NULL OR (e.estado != 'Anulado' AND LOWER(e.estado) NOT LIKE '%anul%' AND LOWER(e.estado) NOT LIKE '%rechaz%'))
            UNION ALL
            SELECT 'Salida' AS tipo, s.fecha, s.created_at, s.id AS doc_id, CONCAT(s.tipo_destino,' / ',COALESCE(s.placa,s.responsable,'—')) AS contraparte, d.cantidad, d.costo_unitario, d.moneda, d.importe
            FROM detalle_salidas_inv d JOIN salidas_inv s ON s.id=d.salida_id
            WHERE d.inventario_id=? AND (s.estado IS NULL OR s.estado = 'Despachado')
            ORDER BY fecha ASC, created_at ASC, doc_id ASC
        `, [id, id, id]);

        console.log('Kardex movements count:', rows.length);
        console.log('Movements:', rows);

        let saldo = base;
        rows.forEach(r => {
            if (r.tipo === 'Entrada' || r.tipo === 'Recepción OC') saldo += parseFloat(r.cantidad || 0);
            else saldo -= parseFloat(r.cantidad || 0);
            r.saldo = parseFloat(saldo.toFixed(4));
        });
        console.log('Final computed saldo:', saldo);
    } catch(e) {
        console.error('Error:', e);
    }
    process.exit(0);
})();
