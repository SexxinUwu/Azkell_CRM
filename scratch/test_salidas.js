const mysql = require('mysql2');

const pool = mysql.createPool({
    host: '82.39.109.226',
    user: 'root',
    password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
    database: 'azkell_fleet',
    port: 3306
});

const SEP_FIELD = '\x1F', SEP_ROW = '\x1E';
const query = `SELECT s.*,
    COALESCE(MAX(NULLIF(TRIM(u.nombre),'')), MAX(s.creado_por)) AS solicitante_nombre,
    GROUP_CONCAT(CONCAT_WS('\x1F',
    COALESCE(d.inventario_id,''),
    COALESCE(i.descripcion, d.descripcion,''),
    COALESCE(d.cantidad,0),
    COALESCE(d.costo_unitario,0),
    COALESCE(d.moneda,'PEN'),
    COALESCE(d.importe, d.cantidad*d.costo_unitario, 0)
    ) SEPARATOR '\x1E') AS items_raw
    FROM salidas_inv s
    LEFT JOIN detalle_salidas_inv d ON d.salida_id=s.id
    LEFT JOIN inventario i ON d.inventario_id = i.id
    LEFT JOIN usuarios u ON (TRIM(LOWER(s.creado_por)) = TRIM(LOWER(u.correo)) OR s.creado_por = u.idUsuario)
    GROUP BY s.id ORDER BY s.fecha DESC, s.id DESC LIMIT 10`;

pool.query(query, (err, rows) => {
    if (err) {
        console.error('SQL ERROR:', err);
    } else {
        console.log('ROWS SUCCESS:', rows.length);
    }
    pool.end();
});
