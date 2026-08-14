const express = require('express');

module.exports = function (db, logAudit) {
    const router = express.Router();

    function getDb(req) { return req.db || db; }

    // Helper auditoría seguro
    function auditar(req, accion, detalle) {
        if (typeof logAudit === 'function') {
            const user = req.user?.correo || req.user?.nombre || req.headers['x-user-email'] || req.body?.creado_por || req.body?.actualizado_por || 'Sistema';
            logAudit(user, 'Disponibilidad Flota', accion, detalle, req.db);
        }
    }

    // ── GET /api/disponibilidad-flota (Listado general con datos enriquecidos) ─────────
    router.get('/', async (req, res) => {
        const tdb = getDb(req);
        try {
            const sql = `
                SELECT 
                    d.*,
                    p.combustible AS placa_combustible,
                    p.modelo_uts AS placa_modelo_uts,
                    p.tipo AS placa_tipo_camion,
                    p.uts AS placa_uts
                FROM flota_disponibilidad d
                LEFT JOIN placas p ON p.placa = d.placa_camion
                ORDER BY d.flota ASC, d.placa_camion ASC
            `;
            const [rows] = await tdb.promise().query(sql);
            res.json(rows);
        } catch (error) {
            console.error('Error al obtener disponibilidad de flota:', error);
            res.status(500).json({ error: 'Error al consultar disponibilidad de flota', detalle: error.message });
        }
    });

    // ── POST /api/disponibilidad-flota (Crear registro de unidad) ────────────────────
    router.post('/', async (req, res) => {
        const tdb = getDb(req);
        const {
            flota,
            conductor_eventual,
            conductor_asignado,
            placa_camion,
            placa_carreta,
            capacidad_tanque,
            marca,
            categoria_conductor,
            tipo_unidad,
            estado_conductor,
            estado_unidad,
            ubicacion_manual,
            observaciones,
            creado_por
        } = req.body;

        if (!placa_camion || !placa_camion.trim()) {
            return res.status(400).json({ error: 'La placa del camión es obligatoria' });
        }

        try {
            const sql = `
                INSERT INTO flota_disponibilidad (
                    flota,
                    conductor_eventual,
                    conductor_asignado,
                    placa_camion,
                    placa_carreta,
                    capacidad_tanque,
                    marca,
                    categoria_conductor,
                    tipo_unidad,
                    estado_conductor,
                    estado_unidad,
                    ubicacion_manual,
                    observaciones,
                    creado_por,
                    actualizado_por
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    flota = VALUES(flota),
                    conductor_eventual = VALUES(conductor_eventual),
                    conductor_asignado = VALUES(conductor_asignado),
                    placa_carreta = VALUES(placa_carreta),
                    capacidad_tanque = VALUES(capacidad_tanque),
                    marca = VALUES(marca),
                    categoria_conductor = VALUES(categoria_conductor),
                    tipo_unidad = VALUES(tipo_unidad),
                    estado_conductor = VALUES(estado_conductor),
                    estado_unidad = VALUES(estado_unidad),
                    ubicacion_manual = VALUES(ubicacion_manual),
                    observaciones = VALUES(observaciones),
                    actualizado_por = VALUES(actualizado_por),
                    fecha_actualizacion = CURRENT_TIMESTAMP
            `;

            const [result] = await tdb.promise().query(sql, [
                (flota || '').trim(),
                (conductor_eventual || '').trim(),
                (conductor_asignado || '').trim(),
                placa_camion.trim().toUpperCase(),
                (placa_carreta || '').trim().toUpperCase(),
                (capacidad_tanque || '').trim(),
                (marca || '').trim().toUpperCase(),
                (categoria_conductor || '').trim(),
                (tipo_unidad || '').trim(),
                (estado_conductor || 'Disponible').trim(),
                (estado_unidad || 'Disponible').trim(),
                (ubicacion_manual || '').trim(),
                (observaciones || '').trim(),
                (creado_por || '').trim(),
                (creado_por || '').trim()
            ]);

            auditar(req, 'CREAR/GUARDAR', `Registro disponibilidad placa: ${placa_camion.toUpperCase()} (ID: ${result.insertId || 'Update'})`);

            res.json({
                success: true,
                message: 'Registro de disponibilidad guardado correctamente',
                id: result.insertId
            });
        } catch (error) {
            console.error('Error al guardar disponibilidad:', error);
            res.status(500).json({ error: 'Error al guardar disponibilidad', detalle: error.message });
        }
    });

    // ── PUT /api/disponibilidad-flota/:id (Actualizar registro) ──────────────────────
    router.put('/:id', async (req, res) => {
        const tdb = getDb(req);
        const { id } = req.params;
        const payload = req.body;

        try {
            const fields = [];
            const values = [];

            const allowedFields = [
                'flota',
                'conductor_eventual',
                'conductor_asignado',
                'placa_camion',
                'placa_carreta',
                'capacidad_tanque',
                'marca',
                'categoria_conductor',
                'tipo_unidad',
                'estado_conductor',
                'estado_unidad',
                'ubicacion_manual',
                'observaciones',
                'actualizado_por'
            ];

            for (const key of allowedFields) {
                if (payload[key] !== undefined) {
                    fields.push(`\`${key}\` = ?`);
                    values.push(typeof payload[key] === 'string' ? payload[key].trim() : payload[key]);
                }
            }

            if (fields.length === 0) {
                return res.status(400).json({ error: 'No se enviaron campos válidos para actualizar' });
            }

            values.push(id);
            const sql = `UPDATE flota_disponibilidad SET ${fields.join(', ')}, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = ?`;
            await tdb.promise().query(sql, values);

            auditar(req, 'ACTUALIZAR', `Actualizada disponibilidad ID: ${id}`);

            res.json({ success: true, message: 'Disponibilidad actualizada exitosamente' });
        } catch (error) {
            console.error('Error al actualizar disponibilidad:', error);
            res.status(500).json({ error: 'Error al actualizar disponibilidad', detalle: error.message });
        }
    });

    // ── DELETE /api/disponibilidad-flota/:id (Eliminar registro) ────────────────────
    router.delete('/:id', async (req, res) => {
        const tdb = getDb(req);
        const { id } = req.params;

        try {
            const [rows] = await tdb.promise().query('SELECT placa_camion FROM flota_disponibilidad WHERE id = ?', [id]);
            const placa = rows[0]?.placa_camion || id;

            await tdb.promise().query('DELETE FROM flota_disponibilidad WHERE id = ?', [id]);
            auditar(req, 'ELIMINAR', `Eliminada disponibilidad ID: ${id} (${placa})`);

            res.json({ success: true, message: 'Registro eliminado correctamente' });
        } catch (error) {
            console.error('Error al eliminar disponibilidad:', error);
            res.status(500).json({ error: 'Error al eliminar registro', detalle: error.message });
        }
    });

    // ── POST /api/disponibilidad-flota/sincronizar (Poblar desde placas activas) ─────
    router.post('/sincronizar', async (req, res) => {
        const tdb = getDb(req);
        const { usuario } = req.body;

        try {
            // Obtener todas las placas activas que sean motora o camiones/tractos
            const [placas] = await tdb.promise().query(`
                SELECT placa, cliente, marca, tipo, combustible, uts, carga_util
                FROM placas 
                WHERE estado = 'Activa' AND (motora = '1' OR tipo IN ('Camion', 'Tracto', 'Volquete', 'Furgon', 'Cisterna', 'Camioneta', 'Tractocamion'))
            `);

            let insertados = 0;
            for (const p of placas) {
                // Calcular capacidad inicial
                let capStr = '';
                if (p.combustible) {
                    const combUpper = p.combustible.toUpperCase();
                    if (combUpper.includes('GAS') || combUpper.includes('GNV') || combUpper.includes('GLP')) {
                        capStr = p.carga_util ? `${p.carga_util} m³` : 'm³';
                    } else {
                        capStr = p.carga_util ? `${p.carga_util} Gln` : 'Gln';
                    }
                }

                // Categoría conductor según UTS
                const utsUpper = (p.uts || '').toUpperCase();
                const catConductor = utsUpper.includes('LOCAL') ? 'Local' : (utsUpper.includes('NACIONAL') ? 'Nacional' : (utsUpper || 'Nacional'));

                const sqlInsert = `
                    INSERT IGNORE INTO flota_disponibilidad (
                        flota,
                        placa_camion,
                        marca,
                        categoria_conductor,
                        tipo_unidad,
                        capacidad_tanque,
                        estado_conductor,
                        estado_unidad,
                        creado_por
                    ) VALUES (?, ?, ?, ?, ?, ?, 'Disponible', 'Disponible', ?)
                `;

                const [resIns] = await tdb.promise().query(sqlInsert, [
                    p.cliente || 'FLOTA PRINCIPAL',
                    p.placa,
                    p.marca || '',
                    catConductor,
                    p.tipo || '',
                    capStr,
                    usuario || 'Sincronizador'
                ]);

                if (resIns.affectedRows > 0) insertados++;
            }

            auditar(req, 'SINCRONIZAR', `Sincronizadas ${insertados} placas a disponibilidad`);

            res.json({
                success: true,
                message: `Sincronización completada. ${insertados} unidades agregadas a disponibilidad.`,
                insertados
            });
        } catch (error) {
            console.error('Error al sincronizar disponibilidad:', error);
            res.status(500).json({ error: 'Error al sincronizar placas', detalle: error.message });
        }
    });

    return router;
};
