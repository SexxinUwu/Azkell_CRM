const mysql = require('mysql2');
const pool = mysql.createPool({
    host: '82.39.109.226',
    user: 'root',
    password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
    database: 'azkell_tenant_marsisa',
    port: 3306
});

console.time('Query entradas');
let q = `SELECT e.*, 
            COALESCE(rec.total_recibido, 0) AS total_recibido,
            COALESCE(rec.cant_recepciones, 0) AS cant_recepciones,
            GROUP_CONCAT(CONCAT(COALESCE(i.descripcion, d.descripcion, ''),'|',COALESCE(d.cantidad,0),'|',COALESCE(d.costo_unitario,0),'|',COALESCE(d.moneda,'PEN'),'|',COALESCE(d.inventario_id,''),'|',COALESCE(d.importe,0)) SEPARATOR ';;') AS items_raw
     FROM entradas_inv e
     LEFT JOIN detalle_entradas_inv d ON d.entrada_id=e.id
     LEFT JOIN inventario i ON d.inventario_id = i.id
     LEFT JOIN (
         SELECT r.oc_id, SUM(dr.cantidad_recibida) AS total_recibido, COUNT(DISTINCT r.id) AS cant_recepciones
         FROM recepciones_oc r
         JOIN detalle_recepciones_oc dr ON dr.recepcion_id = r.id
         GROUP BY r.oc_id
     ) rec ON rec.oc_id = e.id
     GROUP BY e.id ORDER BY e.fecha DESC, e.id DESC LIMIT 300`;

pool.query(q, (err, rows) => {
    console.timeEnd('Query entradas');
    if (err) console.error('Error:', err);
    else console.log('Rows returned:', rows.length);
    pool.end();
});
