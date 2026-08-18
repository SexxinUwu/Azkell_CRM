const mysql = require('mysql2/promise');

(async () => {
    const pool = mysql.createPool({
        host: '82.39.109.226',
        user: 'root',
        password: 'Is4dkdy56NlL4yn3lE9Ofz2AM8IIwRIgAFxxanm0z2qGtABPkMycX5uRtdalRkNU',
        database: 'azkell_fleet',
        port: 3306
    });

    const inspecciones = [
        {
            id_inspeccion: "INSP-TEST-001",
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
        const migCols = [
            "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN r4 INT DEFAULT 0",
            "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN tipo_eje VARCHAR(50) DEFAULT NULL",
            "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN rot VARCHAR(50) DEFAULT 'NO'",
            "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN foto1 LONGTEXT NULL",
            "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN foto2 LONGTEXT NULL",
            "ALTER TABLE neumaticos_inspecciones_det ADD COLUMN foto3 LONGTEXT NULL"
        ];
        for (const q of migCols) {
            try { await pool.query(q); } catch(e) {}
        }

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
        console.log('IMPORT SUCCESS!');
    } catch(e) {
        await pool.query('ROLLBACK');
        console.error('IMPORT ERROR:', e);
    }
    pool.end();
})();
