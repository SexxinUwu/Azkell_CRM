const mysql = require('mysql2/promise');

(async () => {
    const pool = mysql.createPool({
        host: '82.39.109.226',
        user: 'root',
        password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
        database: 'azkell_tenant_rosymarperu',
        port: 3306
    });

    console.log('Testing Export on azkell_tenant_rosymarperu...');
    try {
        const sqlExport = `
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
        const [rows] = await pool.query(sqlExport);
        console.log('Export Query Success on rosymarperu! Rows:', rows.length);
    } catch(e) {
        console.error('Export Error on rosymarperu:', e);
    }

    console.log('\nTesting Import on azkell_tenant_rosymarperu...');
    const inspecciones = [
        {
            id_inspeccion: "INSP-TEST-ROSYMAR",
            placa: "BEQ986",
            fecha_inspeccion: "2024-01-02",
            km_vehiculo: 150000,
            items: [
                {
                    posicion: "1",
                    tipo_eje: "DELANTERA",
                    marca: "MAXELL",
                    medida: "295/80R22.5",
                    modelo: "GAU867",
                    r1: 12,
                    r2: 13,
                    r3: 13,
                    r4: 0,
                    presion_ant: 100,
                    presion_actual: 100,
                    estado: "NUEVA",
                    accion: "INSPECCION",
                    rot: "NO",
                    observaciones: "Test",
                    foto1: "",
                    foto2: "",
                    foto3: ""
                }
            ]
        }
    ];

    try {
        await pool.query('START TRANSACTION');

        for (const insp of inspecciones) {
            const placa = (insp.placa || '').trim().toUpperCase();
            let fecha_inspeccion = (insp.fecha_inspeccion || '').trim();
            if (!fecha_inspeccion || isNaN(new Date(fecha_inspeccion).getTime())) {
                fecha_inspeccion = new Date().toISOString().split('T')[0];
            } else {
                try { fecha_inspeccion = new Date(fecha_inspeccion).toISOString().split('T')[0]; } catch(e) { fecha_inspeccion = new Date().toISOString().split('T')[0]; }
            }

            const km_vehiculo = parseInt(insp.km_vehiculo || 0, 10);
            const items = insp.items || [];
            const id_inspeccion = insp.id_inspeccion;
            let fechaProxima = fecha_inspeccion;

            await pool.query(`
                INSERT INTO neumaticos_inspecciones 
                (id_inspeccion, placa, fecha_inspeccion, km_vehiculo, dias_propuestos, fecha_proxima, observaciones, inspector, total_llantas)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                fecha_inspeccion = VALUES(fecha_inspeccion), km_vehiculo = VALUES(km_vehiculo), total_llantas = VALUES(total_llantas)
            `, [
                id_inspeccion,
                placa,
                fecha_inspeccion,
                km_vehiculo,
                30,
                fechaProxima,
                insp.observaciones || 'Importación Masiva Excel',
                'Importador Excel',
                items.length
            ]);

            await pool.query("DELETE FROM neumaticos_inspecciones_det WHERE id_inspeccion = ?", [id_inspeccion]);

            for (const it of items) {
                const r1 = parseInt(it.r1 || 0, 10);
                const r2 = parseInt(it.r2 || 0, 10);
                const r3 = parseInt(it.r3 || 0, 10);
                const r4 = parseInt(it.r4 || 0, 10);
                const rProm = (r4 > 0) ? (r1 + r2 + r3 + r4) / 4.0 : (r1 + r2 + r3) / 3.0;
                const alertaCambio = rProm <= 4.0 ? 1 : 0;

                await pool.query(`
                    INSERT INTO neumaticos_inspecciones_det
                    (id_inspeccion, posicion, tipo_eje, marca, medida, modelo, r1, r2, r3, r4, presion_ant, presion_actual, estado, accion, rot, observaciones, foto1, foto2, foto3, alerta_cambio)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    id_inspeccion,
                    String(it.posicion || '1').toUpperCase(),
                    (it.tipo_eje || it.eje || '').toUpperCase(),
                    (it.marca || '').toUpperCase(),
                    (it.medida || '').toUpperCase(),
                    (it.modelo || '').toUpperCase(),
                    r1,
                    r2,
                    r3,
                    r4,
                    parseInt(it.presion_ant || 0, 10),
                    parseInt(it.presion_actual || 0, 10),
                    (it.estado || 'NUEVA').toUpperCase(),
                    it.accion || 'INSPECCION',
                    it.rot || 'NO',
                    it.observaciones || '',
                    it.foto1 || null,
                    it.foto2 || null,
                    it.foto3 || null,
                    alertaCambio
                ]);
            }
        }
        await pool.query('COMMIT');
        console.log('Import Query Success on rosymarperu!');
    } catch(e) {
        await pool.query('ROLLBACK');
        console.error('Import Error on rosymarperu:', e);
    }
    pool.end();
})();
