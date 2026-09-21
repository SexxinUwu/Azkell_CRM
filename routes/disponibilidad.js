const express = require('express');

module.exports = function (db, logAudit) {
    const router = express.Router();

    function getDb(req) { return req.db || db; }

    // Helper auditoría seguro
    function auditar(req, accion, detalle) {
        if (typeof logAudit === 'function') {
            const user = req.user?.correo || req.user?.nombre || req.headers['x-user-email'] || req.body?.creado_por || req.body?.actualizado_por || 'Sistema';
            logAudit(user, 'Disponibilidad Flota', accion, String(detalle || ''));
        }
    }

    // Asegurar tabla una sola vez al cargar el módulo
    const sqlCreateTable = `
        CREATE TABLE IF NOT EXISTS flota_disponibilidad (
            id INT AUTO_INCREMENT PRIMARY KEY,
            flota VARCHAR(100) NULL DEFAULT '',
            conductor_eventual VARCHAR(150) NULL DEFAULT '',
            conductor_asignado VARCHAR(150) NULL DEFAULT '',
            placa_camion VARCHAR(50) NULL DEFAULT '',
            placa_carreta VARCHAR(50) NULL DEFAULT '',
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
            INDEX idx_estado_con (estado_conductor),
            INDEX idx_estado_uni (estado_unidad)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    db.query(sqlCreateTable, (err) => {
        if (err) console.warn('[Disponibilidad] Error asegurando tabla:', err.message);
    });

    // ── GET /api/disponibilidad-flota (Listado general consolidado en tiempo real) ──
    router.get('/', (req, res) => {
        const tdb = getDb(req);
        const clean = str => (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

        // 1. Placas maestras
        const sqlPlacas = `
            SELECT placa, cliente, marca, tipo, sub_tipo, combustible, uts, carga_util, capacidad_tanque, motora 
            FROM placas 
            WHERE (estado = 'Activa' OR estado IS NULL OR estado = '')
            ORDER BY placa ASC
        `;

        // 2. Unidades en ruta desde Checklist / Seguridad
        const sqlEnRuta = `
            SELECT id, placa_tracto, placa_carreta, conductor, destino, salida_fecha, salida_hora, estado, salida_observaciones
            FROM seg_unidades_registros
            WHERE estado = 'en_ruta'
        `;

        // 3. OTs activas en taller / mantenimiento
        const sqlOTs = `
            SELECT placa, id_ot, ticket_entrada, estado, fecha_ingreso
            FROM ordenes_trabajo
            WHERE estado NOT IN ('Finalizado', 'Finalizada', 'Anulado', 'Anulada', 'Cerrado', 'Cerrada')
        `;

        // 4. Últimos registros en Base desde Seguridad
        const sqlBase = `
            SELECT placa_camion, placa_carreta, conductor, observacion
            FROM seg_unidades_base
            ORDER BY fecha DESC, id DESC
        `;

        // 5. Registros guardados en flota_disponibilidad
        const sqlDisp = `SELECT * FROM flota_disponibilidad`;

        tdb.query(sqlPlacas, (errP, placas) => {
            if (errP) return res.status(500).json({ error: 'Error consultando placas', detalle: errP.message });

            tdb.query(sqlEnRuta, (errR, enRutaRows) => {
                if (errR) return res.status(500).json({ error: 'Error consultando unidades en ruta', detalle: errR.message });

                tdb.query(sqlOTs, (errOT, otRows) => {
                    if (errOT) return res.status(500).json({ error: 'Error consultando OTs de mantenimiento', detalle: errOT.message });

                    tdb.query(sqlBase, (errB, baseRows) => {
                        if (errB) return res.status(500).json({ error: 'Error consultando unidades en base', detalle: errB.message });

                        tdb.query(sqlDisp, (errD, dispRows) => {
                            if (errD) return res.status(500).json({ error: 'Error consultando disponibilidad', detalle: errD.message });

                            // Indexar OTs activas por placa limpia
                            const otSet = new Set();
                            (otRows || []).forEach(ot => {
                                const p = clean(ot.placa);
                                if (p) otSet.add(p);
                            });

                            // Indexar unidades en ruta
                            const rutaCamionMap = {};
                            const rutaCarretaSet = new Set();
                            (enRutaRows || []).forEach(r => {
                                const pt = clean(r.placa_tracto);
                                const pc = clean(r.placa_carreta);
                                if (pt) rutaCamionMap[pt] = r;
                                if (pc) rutaCarretaSet.add(pc);
                            });

                            // Indexar base
                            const baseCamionMap = {};
                            const baseCarretaSet = new Set();
                            (baseRows || []).forEach(b => {
                                const pc = clean(b.placa_camion);
                                const pcar = clean(b.placa_carreta);
                                if (pc && !baseCamionMap[pc]) baseCamionMap[pc] = b;
                                if (pcar) baseCarretaSet.add(pcar);
                            });

                            // Indexar disponibilidad manual
                            const dispMap = {};
                            (dispRows || []).forEach(d => {
                                const pc = clean(d.placa_camion);
                                const pcar = clean(d.placa_carreta);
                                if (pc) dispMap[pc] = d;
                                else if (pcar) dispMap[pcar] = d;
                            });

                            const resultado = [];
                            const carretasAcopladas = new Set();

                            const motoras = [];
                            const remolques = [];

                            (placas || []).forEach(p => {
                                const tipoUpper = (p.tipo || '').toUpperCase();
                                const isMotora = p.motora === '1' || p.motora === 1 || 
                                    ['CAMION', 'TRACTO', 'TRACTOCAMION', 'VOLQUETE', 'FURGON', 'CISTERNA', 'CAMIONETA', 'TRACTO CAMION'].some(t => tipoUpper.includes(t));
                                
                                if (isMotora) motoras.push(p);
                                else remolques.push(p);
                            });

                            // Procesar motoras (Camiones / Tractos)
                            motoras.forEach(p => {
                                const cPlaca = clean(p.placa);
                                const enRuta = rutaCamionMap[cPlaca];
                                const enBase = baseCamionMap[cPlaca];
                                const disp = dispMap[cPlaca];
                                const hasOT = otSet.has(cPlaca);

                                let carreta = '';
                                let conductor = '';
                                let estado = 'En Base';
                                let observaciones = '';

                                if (hasOT) {
                                    estado = 'En Mantenimiento';
                                    if (disp) {
                                        carreta = disp.placa_carreta || '';
                                        conductor = disp.conductor_asignado || '';
                                        observaciones = disp.observaciones || 'En Taller / OT Activa';
                                    } else {
                                        observaciones = 'En Taller / OT Activa';
                                    }
                                } else if (enRuta) {
                                    estado = 'En Ruta';
                                    carreta = enRuta.placa_carreta || (disp ? disp.placa_carreta : '') || '';
                                    conductor = enRuta.conductor || (disp ? disp.conductor_asignado : '') || '';
                                    observaciones = enRuta.destino ? `Destino: ${enRuta.destino}` : (enRuta.salida_observaciones || (disp ? disp.observaciones : ''));
                                } else if (enBase) {
                                    estado = 'En Base';
                                    carreta = enBase.placa_carreta || (disp ? disp.placa_carreta : '') || '';
                                    conductor = enBase.conductor || (disp ? disp.conductor_asignado : '') || '';
                                    observaciones = enBase.observacion || (disp ? disp.observaciones : '');
                                } else if (disp) {
                                    carreta = disp.placa_carreta || '';
                                    conductor = disp.conductor_asignado || '';
                                    observaciones = disp.observaciones || '';
                                }

                                if (carreta) carretasAcopladas.add(clean(carreta));

                                let capTanque = p.capacidad_tanque || (disp ? disp.capacidad_tanque : '') || '0';
                                if (capTanque && !String(capTanque).toUpperCase().includes('GLN') && !String(capTanque).toUpperCase().includes('M³') && capTanque !== '0') {
                                    capTanque = capTanque + ' Gln';
                                }

                                resultado.push({
                                    id: disp ? disp.id : null,
                                    placa_camion: p.placa,
                                    placa_carreta: carreta,
                                    conductor_asignado: conductor,
                                    estado: estado,
                                    marca: p.marca || (disp ? disp.marca : '') || '',
                                    capacidad_tanque: capTanque,
                                    tipo_unidad: p.tipo || 'Tracto Camión',
                                    observaciones: observaciones,
                                    is_motora: true
                                });
                            });

                            // Procesar carretas/remolques que no están acopladas
                            remolques.forEach(p => {
                                const cPlaca = clean(p.placa);
                                if (carretasAcopladas.has(cPlaca)) return; // Ya está emparejada con un camión

                                const disp = dispMap[cPlaca];
                                const hasOT = otSet.has(cPlaca);
                                const enRuta = rutaCarretaSet.has(cPlaca);

                                let estado = 'En Base';
                                if (hasOT) estado = 'En Mantenimiento';
                                else if (enRuta) estado = 'En Ruta';

                                resultado.push({
                                    id: disp ? disp.id : null,
                                    placa_camion: '',
                                    placa_carreta: p.placa,
                                    conductor_asignado: disp ? disp.conductor_asignado : '',
                                    estado: estado,
                                    marca: p.marca || (disp ? disp.marca : '') || '',
                                    capacidad_tanque: '—',
                                    tipo_unidad: p.tipo || 'Carreta / Remolque',
                                    observaciones: disp ? disp.observaciones : '',
                                    is_motora: false
                                });
                            });

                            const stats = {
                                total_flota: resultado.length,
                                total_camiones: motoras.length,
                                total_carretas: resultado.filter(r => !r.is_motora || r.placa_carreta).length,
                                en_base: resultado.filter(r => r.estado === 'En Base').length,
                                en_ruta: resultado.filter(r => r.estado === 'En Ruta').length,
                                en_mantenimiento: resultado.filter(r => r.estado === 'En Mantenimiento').length
                            };

                            res.json(resultado);
                        });
                    });
                });
            });
        });
    });

    // ── POST /api/disponibilidad-flota (Crear / Guardar registro) ───────────────
    router.post('/', (req, res) => {
        const tdb = getDb(req);
        const {
            conductor_asignado,
            placa_camion,
            placa_carreta,
            capacidad_tanque,
            marca,
            tipo_unidad,
            estado,
            observaciones,
            creado_por
        } = req.body;

        const cam = (placa_camion || '').trim().toUpperCase();
        const car = (placa_carreta || '').trim().toUpperCase();

        if (!cam && !car) {
            return res.status(400).json({ error: 'Debe ingresar al menos la Placa de Camión o la Placa de Carreta' });
        }

        let checkSql = `SELECT id FROM flota_disponibilidad WHERE placa_camion = ? AND placa_camion != ''`;
        let checkParams = [cam];

        if (!cam && car) {
            checkSql = `SELECT id FROM flota_disponibilidad WHERE placa_carreta = ? AND (placa_camion = '' OR placa_camion IS NULL)`;
            checkParams = [car];
        }

        tdb.query(checkSql, checkParams, (errCheck, existingRows) => {
            if (!errCheck && existingRows && existingRows.length > 0) {
                const existId = existingRows[0].id;
                const updateSql = `
                    UPDATE flota_disponibilidad SET
                        conductor_asignado = ?, placa_camion = ?, placa_carreta = ?,
                        capacidad_tanque = ?, marca = ?, tipo_unidad = ?,
                        estado_unidad = ?, observaciones = ?,
                        actualizado_por = ?, fecha_actualizacion = CURRENT_TIMESTAMP
                    WHERE id = ?
                `;
                const updateParams = [
                    (conductor_asignado || '').trim(),
                    cam,
                    car,
                    (capacidad_tanque || '').trim(),
                    (marca || '').trim().toUpperCase(),
                    (tipo_unidad || '').trim(),
                    (estado || 'Disponible').trim(),
                    (observaciones || '').trim(),
                    (creado_por || '').trim(),
                    existId
                ];
                tdb.query(updateSql, updateParams, (errUpd) => {
                    if (errUpd) return res.status(500).json({ error: 'Error actualizando registro', detalle: errUpd.message });
                    auditar(req, 'ACTUALIZAR', `Disponibilidad actualizada: ${cam || car}`);
                    return res.json({ success: true, message: 'Registro actualizado correctamente', id: existId });
                });
            } else {
                const insertSql = `
                    INSERT INTO flota_disponibilidad (
                        conductor_asignado, placa_camion, placa_carreta,
                        capacidad_tanque, marca, tipo_unidad, estado_unidad, observaciones, creado_por, actualizado_por
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                const insertParams = [
                    (conductor_asignado || '').trim(),
                    cam,
                    car,
                    (capacidad_tanque || '').trim(),
                    (marca || '').trim().toUpperCase(),
                    (tipo_unidad || '').trim(),
                    (estado || 'Disponible').trim(),
                    (observaciones || '').trim(),
                    (creado_por || '').trim(),
                    (creado_por || '').trim()
                ];
                tdb.query(insertSql, insertParams, (errIns, result) => {
                    if (errIns) return res.status(500).json({ error: 'Error al guardar disponibilidad', detalle: errIns.message });
                    auditar(req, 'CREAR/GUARDAR', `Registro disponibilidad: ${cam || car}`);
                    return res.json({ success: true, message: 'Registro guardado correctamente', id: result.insertId });
                });
            }
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
            'conductor_asignado', 'placa_camion',
            'placa_carreta', 'capacidad_tanque', 'marca',
            'tipo_unidad', 'estado_unidad',
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

    return router;
};
