const mysql = require('mysql2/promise');

(async () => {
    const pool = mysql.createPool({
        host: '82.39.109.226',
        user: 'root',
        password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
        database: 'azkell_fleet',
        port: 3306
    });

    try {
        const sql = `
            SELECT 
                i.id_inspeccion AS ID,
                DATE_FORMAT(i.fecha_inspeccion, '%Y-%m-%d') AS 'F. INSPECCION',
                i.placa AS PLACA,
                COALESCE(p.estado, 'Activa') AS 'ESTADO LLANT',
                i.km_vehiculo AS KM,
                d.posicion AS LLANTA,
                COALESCE(p.cliente, 'PROPIO') AS 'DUEÑO',
                COALESCE(p.marca, 'FLOTA') AS MARCA,
                COALESCE(p.tipo, 'UNIDAD') AS UNIDAD,
                COALESCE(d.tipo_eje, '') AS 'Delantera o Traccion',
                d.marca AS 'MARCA DE LLANTA',
                d.medida AS MEDIDA,
                d.modelo AS MODELO,
                d.r1 AS R1,
                d.r2 AS R2,
                d.r3 AS R3,
                d.r4 AS R4,
                d.presion_ant AS 'PRESION DE AIRE ANT',
                d.presion_actual AS 'PRESION DE AIRE ACTUAL',
                d.estado AS ESTADO,
                d.accion AS ACCION,
                d.observaciones AS OBS,
                d.rot AS ROT,
                LEAST(
                    COALESCE(NULLIF(d.r1, 0), 99),
                    COALESCE(NULLIF(d.r2, 0), 99),
                    COALESCE(NULLIF(d.r3, 0), 99),
                    COALESCE(NULLIF(d.r4, 0), 99)
                ) AS 'R Min',
                d.foto1 AS FOTO1,
                d.foto2 AS FOTO2,
                d.foto3 AS FOTO3
            FROM neumaticos_inspecciones_det d
            INNER JOIN neumaticos_inspecciones i ON d.id_inspeccion COLLATE utf8mb4_general_ci = i.id_inspeccion COLLATE utf8mb4_general_ci
            LEFT JOIN placas p ON i.placa COLLATE utf8mb4_general_ci = p.placa COLLATE utf8mb4_general_ci
            ORDER BY i.fecha_inspeccion DESC, i.placa ASC, CAST(d.posicion AS UNSIGNED) ASC
        `;
        const [rows] = await pool.query(sql);
        console.log('EXPORT QUERY SUCCESS! Rows count:', rows.length);
    } catch(e) {
        console.error('EXPORT QUERY ERROR:', e);
    }
    pool.end();
})();
