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

    // Middleware: asegurar que la tabla flota_disponibilidad existe en el tenant actual
    router.use((req, res, next) => {
        const tdb = getDb(req);
        const sqlCreateTable = `
            CREATE TABLE IF NOT EXISTS flota_disponibilidad (
                id INT AUTO_INCREMENT PRIMARY KEY,
                flota VARCHAR(100) NULL DEFAULT '',
                conductor_eventual VARCHAR(150) NULL DEFAULT '',
                conductor_asignado VARCHAR(150) NULL DEFAULT '',
                placa_camion VARCHAR(20) NOT NULL,
                placa_carreta VARCHAR(20) NULL DEFAULT '',
                capacidad_tanque VARCHAR(50) NULL DEFAULT '',
                marca VARCHAR(50) NULL DEFAULT '',
                categoria_conductor VARCHAR(50) NULL DEFAULT '',
                tipo_unidad VARCHAR(100) NULL DEFAULT '',
                estado_conductor VARCHAR(50) NOT NULL DEFAULT 'Disponible',
                estado_unidad VARCHAR(50) NOT NULL DEFAULT 'Disponible',
                ubicacion_manual TEXT NULL,
                observaciones TEXT NULL,
                creado_por VARCHAR(100) NULL DEFAULT '',
                actualizado_por VARCHAR(100) NULL DEFAULT '',
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_placa_camion (placa_camion),
                INDEX idx_estado_con (estado_conductor),
                INDEX idx_estado_uni (estado_unidad)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        tdb.query(sqlCreateTable, (err) => {
            if (err) console.warn('[Disponibilidad] Error asegurando tabla:', err.message);
            next();
        });
    });

    // ── GET /api/disponibilidad-flota (Listado general) ────────────────────────
    router.get('/', (req, res) => {
        const tdb = getDb(req);
        const sql = `
            SELECT 
                d.*,
                p.combustible AS placa_combustible,
                p.modelo_uts AS placa_modelo_uts,
                p.tipo AS placa_tipo_camion,
                p.uts AS placa_uts
            FROM flota_disponibilidad d
            LEFT JOIN placas p ON p.placa = d.placa_camion
            ORDER BY d.placa_camion ASC
        `;
        tdb.query(sql, (err, rows) => {
            if (err) {
                console.error('Error al obtener disponibilidad de flota:', err);
                return res.status(500).json({ error: 'Error al consultar disponibilidad de flota', detalle: err.message });
            }
            res.json(rows || []);
        });
    });

    // ── POST /api/disponibilidad-flota (Crear / Guardar registro) ───────────────
    router.post('/', (req, res) => {
        const tdb = getDb(req);
        const {
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

        const sql = `
            INSERT INTO flota_disponibilidad (
                conductor_eventual, conductor_asignado, placa_camion, placa_carreta,
                capacidad_tanque, marca, categoria_conductor, tipo_unidad, estado_conductor,
                estado_unidad, ubicacion_manual, observaciones, creado_por, actualizado_por
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
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

        const params = [
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
        ];

        tdb.query(sql, params, (err, result) => {
            if (err) {
                console.error('Error al guardar disponibilidad:', err);
                return res.status(500).json({ error: 'Error al guardar disponibilidad', detalle: err.message });
            }
            auditar(req, 'CREAR/GUARDAR', `Registro disponibilidad placa: ${placa_camion.toUpperCase()}`);
            res.json({ success: true, message: 'Registro de disponibilidad guardado correctamente', id: result.insertId });
        });
    });

    // ── PUT /api/disponibilidad-flota/:id (Actualizar registro) ─────────────────
    router.put('/:id', (req, res) => {
        const tdb = getDb(req);
        const { id } = req.params;
        const payload = req.body;

        const fields = [];
        const values = [];

        const allowedFields = [
            'conductor_eventual', 'conductor_asignado', 'placa_camion',
            'placa_carreta', 'capacidad_tanque', 'marca', 'categoria_conductor',
            'tipo_unidad', 'estado_conductor', 'estado_unidad', 'ubicacion_manual',
            'observaciones', 'actualizado_por'
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

        tdb.query(sql, values, (err) => {
            if (err) {
                console.error('Error al actualizar disponibilidad:', err);
                return res.status(500).json({ error: 'Error al actualizar disponibilidad', detalle: err.message });
            }
            auditar(req, 'ACTUALIZAR', `Actualizada disponibilidad ID: ${id}`);
            res.json({ success: true, message: 'Disponibilidad actualizada exitosamente' });
        });
    });

    // ── DELETE /api/disponibilidad-flota/:id (Eliminar registro) ───────────────
    router.delete('/:id', (req, res) => {
        const tdb = getDb(req);
        const { id } = req.params;

        tdb.query('DELETE FROM flota_disponibilidad WHERE id = ?', [id], (err) => {
            if (err) {
                console.error('Error al eliminar disponibilidad:', err);
                return res.status(500).json({ error: 'Error al eliminar registro', detalle: err.message });
            }
            auditar(req, 'ELIMINAR', `Eliminada disponibilidad ID: ${id}`);
            res.json({ success: true, message: 'Registro eliminado correctamente' });
        });
    });

    // ── POST /api/disponibilidad-flota/sincronizar (Poblar desde placas activas) ──
    router.post('/sincronizar', (req, res) => {
        const tdb = getDb(req);
        const { usuario } = req.body;

        const sqlPlacas = `
            SELECT placa, cliente, marca, tipo, combustible, uts, carga_util
            FROM placas 
            WHERE estado = 'Activa' AND (motora = '1' OR tipo IN ('Camion', 'Tracto', 'Volquete', 'Furgon', 'Cisterna', 'Camioneta', 'Tractocamion'))
        `;

        tdb.query(sqlPlacas, (err, placas) => {
            if (err || !placas) {
                console.error('Error obteniendo placas para sincronizar:', err);
                return res.status(500).json({ error: 'Error al obtener placas para sincronización' });
            }

            if (placas.length === 0) {
                return res.json({ success: true, message: 'No se encontraron placas activas para sincronizar', insertados: 0 });
            }

            let insertados = 0;
            let procesados = 0;

            placas.forEach(p => {
                let capStr = '';
                if (p.combustible) {
                    const combUpper = p.combustible.toUpperCase();
                    if (combUpper.includes('GAS') || combUpper.includes('GNV') || combUpper.includes('GLP')) {
                        capStr = p.carga_util ? `${p.carga_util} m³` : 'm³';
                    } else {
                        capStr = p.carga_util ? `${p.carga_util} Gln` : 'Gln';
                    }
                }

                const utsUpper = (p.uts || '').toUpperCase();
                const catConductor = utsUpper.includes('LOCAL') ? 'Local' : (utsUpper.includes('NACIONAL') ? 'Nacional' : (utsUpper || 'Nacional'));

                const sqlInsert = `
                    INSERT IGNORE INTO flota_disponibilidad (
                        placa_camion, marca, categoria_conductor, tipo_unidad, capacidad_tanque, estado_conductor, estado_unidad, creado_por
                    ) VALUES (?, ?, ?, ?, ?, 'Disponible', 'Disponible', ?)
                `;

                tdb.query(sqlInsert, [
                    p.placa,
                    p.marca || '',
                    catConductor,
                    p.tipo || '',
                    capStr,
                    usuario || 'Sincronizador'
                ], (errIns, resIns) => {
                    procesados++;
                    if (!errIns && resIns && resIns.affectedRows > 0) insertados++;

                    if (procesados === placas.length) {
                        auditar(req, 'SINCRONIZAR', `Sincronizadas ${insertados} placas a disponibilidad`);
                        return res.json({
                            success: true,
                            message: `Sincronización completada. ${insertados} unidades agregadas a disponibilidad.`,
                            insertados
                        });
                    }
                });
            });
        });
    });

    return router;
};
