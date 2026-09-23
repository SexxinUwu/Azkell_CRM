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

    async function ensureTableDisponibilidad(tdb) {
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
        try {
            await (tdb.promise ? tdb.promise() : tdb).query(sqlCreateTable);
        } catch (e) {}
    }

    // ── GET /api/disponibilidad-flota (Listado general consolidado en vivo) ───────
    router.get('/', async (req, res) => {
        try {
            const tdb = getDb(req);
            const pDb = (tdb.promise ? tdb.promise() : tdb);
            await ensureTableDisponibilidad(tdb);

            const clean = str => (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const norm = str => (str || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

            const safeQuery = async (sql, params = []) => {
                try {
                    const [rows] = await pDb.query(sql, params);
                    return rows || [];
                } catch (err) {
                    return [];
                }
            };

            // 1. Placas maestras
            const placas = await safeQuery(`
                SELECT placa, cliente, marca, tipo, sub_tipo, combustible, uts, carga_util, capacidad_tanque, motora 
                FROM placas 
                WHERE (estado = 'Activa' OR estado IS NULL OR estado = '')
                ORDER BY placa ASC
            `);

            // 2. Reportes de fallas activos
            const fallasRows = await safeQuery(`
                SELECT id, folio, fecha_reporte, placa_tracto, placa_remolque, conductor, estado, ots_generadas_json
                FROM reportes_fallas
                WHERE estado != 'Finalizado'
                ORDER BY id DESC
            `);

            // 3. OTs activas directas
            const otRows = await safeQuery(`
                SELECT placa, id_ot, ticket_entrada, estado, fecha_ingreso
                FROM ordenes_trabajo
                WHERE estado NOT IN ('Finalizado', 'Finalizada', 'Anulado', 'Anulada', 'Cerrado', 'Cerrada')
            `);

            // 4. Unidades en ruta
            const enRutaRows = await safeQuery(`
                SELECT id, placa_tracto, placa_carreta, conductor, destino, salida_fecha, salida_hora, estado, salida_observaciones
                FROM seg_unidades_registros
                WHERE estado = 'en_ruta'
                ORDER BY id DESC
            `);

            // 5. Unidades en base
            const baseRows = await safeQuery(`
                SELECT placa_camion, placa_carreta, conductor, observacion
                FROM seg_unidades_base
                ORDER BY fecha DESC, id DESC
            `);

            // 6. Disponibilidad manual
            const dispRows = await safeQuery(`SELECT * FROM flota_disponibilidad`);

                                const otSet = new Set();
                                (otRows || []).forEach(ot => {
                                    const p = clean(ot.placa);
                                    if (p) otSet.add(p);
                                });

                                // Mapeo de fallas activas (Taller)
                                const fallasTractoMap = {};
                                const fallasRemolqueSet = new Set();
                                (fallasRows || []).forEach(f => {
                                    const pt = clean(f.placa_tracto);
                                    const pr = clean(f.placa_remolque);
                                    if (pt && !fallasTractoMap[pt]) {
                                        fallasTractoMap[pt] = f;
                                        if (pr) fallasRemolqueSet.add(pr);
                                    }
                                });

                                // Mapeo de unidades en ruta
                                const rutaCamionMap = {};
                                const rutaCarretaSet = new Set();
                                (enRutaRows || []).forEach(r => {
                                    const pt = clean(r.placa_tracto);
                                    const pc = clean(r.placa_carreta);
                                    if (pt && !rutaCamionMap[pt]) {
                                        rutaCamionMap[pt] = r;
                                        if (pc) rutaCarretaSet.add(pc);
                                    }
                                });

                                // Mapeo de base
                                const baseCamionMap = {};
                                const baseCarretaSet = new Set();
                                (baseRows || []).forEach(b => {
                                    const pc = clean(b.placa_camion);
                                    const pcar = clean(b.placa_carreta);
                                    if (pc && !baseCamionMap[pc]) {
                                        baseCamionMap[pc] = b;
                                        if (pcar) baseCarretaSet.add(pcar);
                                    }
                                });

                                // Mapeo de disponibilidad manual
                                const dispMap = {};
                                (dispRows || []).forEach(d => {
                                    const pc = clean(d.placa_camion);
                                    const pcar = clean(d.placa_carreta);
                                    if (pc) dispMap[pc] = d;
                                    else if (pcar) dispMap[pcar] = d;
                                });

                                const placasMap = {};
                                (placas || []).forEach(p => {
                                    placasMap[clean(p.placa)] = p;
                                });

                                const motoras = [];
                                const remolques = [];
                                const carretasAcopladas = new Set();

                                (placas || []).forEach(p => {
                                    const tipoNorm = norm(p.tipo);
                                    const subTipoNorm = norm(p.sub_tipo);
                                    const motoraNorm = norm(p.motora);

                                    const isMotora = (motoraNorm.includes('MOTORA') && !motoraNorm.includes('NO')) ||
                                        p.motora === '1' || p.motora === 1 || 
                                        ['CAMION', 'TRACTO', 'VOLQUETE', 'FURGON', 'CISTERNA', 'CAMIONETA', 'TRACTOCAMION'].some(t => tipoNorm.includes(t)) ||
                                        (subTipoNorm && (subTipoNorm.includes('TRACTO') || subTipoNorm.includes('CAMION')));
                                    
                                    if (isMotora) {
                                        motoras.push(p);
                                    } else {
                                        remolques.push(p);
                                    }
                                });

                                const resultado = [];

                                // Procesar motoras (Camiones / Tractos)
                                motoras.forEach(p => {
                                    const cPlaca = clean(p.placa);
                                    const falla = fallasTractoMap[cPlaca];
                                    const enRuta = rutaCamionMap[cPlaca];
                                    const enBase = baseCamionMap[cPlaca];
                                    const disp = dispMap[cPlaca];
                                    const hasDirectOT = otSet.has(cPlaca);

                                    let carreta = '';
                                    let conductor = '';
                                    let estado = 'En Base';
                                    let observaciones = '';

                                    if (falla || hasDirectOT) {
                                        estado = 'En Mantenimiento';
                                        if (falla) {
                                            carreta = falla.placa_remolque || (disp ? disp.placa_carreta : '') || '';
                                            conductor = falla.conductor || (disp ? disp.conductor_asignado : '') || '';
                                            observaciones = `En Taller / Folio ${falla.folio || ''}`;
                                        } else {
                                            carreta = (disp ? disp.placa_carreta : '') || '';
                                            conductor = (disp ? disp.conductor_asignado : '') || '';
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

                                    // Obtener metadata exacta de la carreta acoplada desde el maestro de placas
                                    let subTipoCarreta = '';
                                    let empresaCarreta = '';
                                    let marcaCarreta = '';
                                    let estadoCarreta = estado;

                                    if (carreta) {
                                        const pCarretaData = placasMap[clean(carreta)];
                                        subTipoCarreta = pCarretaData ? (pCarretaData.sub_tipo || pCarretaData.tipo || 'Carreta') : 'Carreta';
                                        empresaCarreta = pCarretaData ? (pCarretaData.cliente || p.cliente || '').trim() : (p.cliente || '').trim();
                                        marcaCarreta = pCarretaData ? (pCarretaData.marca || '') : '';
                                        if (otSet.has(clean(carreta)) || fallasRemolqueSet.has(clean(carreta))) {
                                            estadoCarreta = 'En Mantenimiento';
                                        }
                                    }

                                    resultado.push({
                                        id: disp ? disp.id : null,
                                        placa_camion: p.placa,
                                        placa_carreta: carreta,
                                        conductor_asignado: conductor,
                                        estado: estado,
                                        empresa: (p.cliente || (disp ? disp.flota : '') || '').trim(),
                                        cliente: (p.cliente || (disp ? disp.flota : '') || '').trim(),
                                        marca: p.marca || (disp ? disp.marca : '') || '',
                                        capacidad_tanque: capTanque,
                                        tipo_unidad: p.tipo || 'Camión',
                                        sub_tipo: p.sub_tipo || p.tipo || 'Camión',
                                        // Datos enriquecidos de la carreta acoplada
                                        sub_tipo_carreta: subTipoCarreta,
                                        empresa_carreta: empresaCarreta,
                                        marca_carreta: marcaCarreta,
                                        estado_carreta: estadoCarreta,
                                        observaciones: observaciones,
                                        is_motora: true
                                    });
                                });

                                // Procesar remolques/carretas sueltas
                                remolques.forEach(p => {
                                    const cPlaca = clean(p.placa);
                                    if (carretasAcopladas.has(cPlaca)) return; // Ya acoplada a un camión

                                    const disp = dispMap[cPlaca];
                                    const hasOT = otSet.has(cPlaca) || fallasRemolqueSet.has(cPlaca);
                                    const enRuta = rutaCarretaSet.has(cPlaca);

                                    let estado = 'En Base';
                                    if (hasOT) estado = 'En Mantenimiento';
                                    else if (enRuta) estado = 'En Ruta';

                                    const stCarreta = p.sub_tipo || p.tipo || 'Carreta';
                                    const empCarreta = (p.cliente || (disp ? disp.flota : '') || '').trim();

                                    resultado.push({
                                        id: disp ? disp.id : null,
                                        placa_camion: '',
                                        placa_carreta: p.placa,
                                        conductor_asignado: disp ? disp.conductor_asignado : '',
                                        estado: estado,
                                        empresa: empCarreta,
                                        cliente: empCarreta,
                                        marca: p.marca || (disp ? disp.marca : '') || '',
                                        capacidad_tanque: '—',
                                        tipo_unidad: p.tipo || 'Carreta',
                                        sub_tipo: stCarreta,
                                        sub_tipo_carreta: stCarreta,
                                        empresa_carreta: empCarreta,
                                        marca_carreta: p.marca || '',
                                        estado_carreta: estado,
                                        observaciones: disp ? disp.observaciones : (hasOT ? 'En Taller / OT Activa' : ''),
                                        is_motora: false
                                    });
                                });

                                res.json(resultado);
                            });
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
            return res.status(400).json({ error: 'Debe ingresar al menos el Camión o la Carreta' });
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
                    (estado || 'En Base').trim(),
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
                    (estado || 'En Base').trim(),
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
