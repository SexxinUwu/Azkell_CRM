const express = require('express');

module.exports = function (db, logAudit) {
    const router = express.Router();

    function getDb(req) { return req.db || db; }

    // Helper auditoría seguro
    function auditar(req, accion, detalle) {
        if (typeof logAudit === 'function') {
            logAudit(req, 'FLOTA', 'Status Flota', accion, String(detalle || ''));
        }
    }

    // ── GET /api/disponibilidad-flota (Listado general consolidado en vivo) ───────
    router.get('/', async (req, res) => {
        try {
            const tdb = getDb(req);
            const pDb = (tdb.promise ? tdb.promise() : tdb);

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

            // 1. Placas maestras (Solo placas activas y en uso del maestro oficial)
            const placas = await safeQuery(`
                SELECT placa, cliente, marca, tipo, sub_tipo, combustible, uts, carga_util, capacidad_tanque, motora 
                FROM placas 
                WHERE (estado = 'Activa' OR estado IS NULL OR estado = '')
                  AND (en_uso != 'No' AND en_uso != 'NO' OR en_uso IS NULL OR en_uso = '')
                  AND (placa NOT LIKE '%CONSUMO%' AND placa NOT LIKE '%ENTREGA%')
                ORDER BY placa ASC
            `);

            // 2. Reportes de fallas activos
            const fallasRows = await safeQuery(`
                SELECT id, folio, fecha_reporte, placa_tracto, placa_remolque, conductor, estado, ots_generadas_json, critica
                FROM reportes_fallas
                WHERE estado NOT IN ('Finalizado', 'Finalizada', 'Anulado', 'Anulada', 'ATENDIDA', 'CERRADA', 'ANULADA')
                ORDER BY id DESC
            `);

            // 3. OTs activas directas
            const otRows = await safeQuery(`
                SELECT placa, id_ot, ticket_entrada, estado, fecha_ingreso
                FROM ordenes_trabajo
                WHERE estado NOT IN ('Finalizado', 'Finalizada', 'Anulado', 'Anulada', 'Cerrado', 'Cerrada')
            `);

            // 3.1 Rampas activas (no liberadas)
            const rampaRows = await safeQuery(`
                SELECT placa, rampa, estado, situacion
                FROM taller_rampas
                WHERE estado NOT IN ('Liberado', 'Liberada') AND situacion NOT IN ('Liberado', 'Liberada')
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

            // 7. Último conductor por placa, según sus órdenes de viaje (sin anuladas, la más reciente primero)
            const viajesConductor = await safeQuery(`
                SELECT placa_tracto, placa_remolque, conductor FROM operaciones_ordenes_viaje
                WHERE estado <> 'ANULADO' AND TRIM(COALESCE(conductor, '')) <> ''
                ORDER BY fecha_viaje DESC, id DESC
            `);
            const ultimoConductorTracto = {};
            const ultimoConductorRemolque = {};
            // Viaje abierto (sin retorno) que tiene bloqueada la unidad: se explica en vez de mostrar el estado sin motivo
            const avisoViaje = r => `Bloqueado por viaje ${r.id} en ruta (salida ${r.salida_fecha || ''} ${r.salida_hora || ''}${r.destino ? ' ' + r.destino : ''}). Requiere registrar retorno en Garita/Seguridad.`;
            const rutaCarretaMap = {};
            (enRutaRows || []).forEach(r => {
                const pc = clean(r.placa_carreta);
                if (pc && !rutaCarretaMap[pc]) rutaCarretaMap[pc] = r;
            });
            viajesConductor.forEach(v => {
                const pt = clean(v.placa_tracto);
                const pr = clean(v.placa_remolque);
                if (pt && !ultimoConductorTracto[pt]) ultimoConductorTracto[pt] = String(v.conductor).trim();
                if (pr && !ultimoConductorRemolque[pr]) ultimoConductorRemolque[pr] = String(v.conductor).trim();
            });

            const otSet = new Set();
            (otRows || []).forEach(ot => {
                const p = clean(ot.placa);
                if (p) otSet.add(p);
            });

            // Agregar placas con rampas activas al set de mantenimiento
            (rampaRows || []).forEach(r => {
                const p = clean(r.placa);
                if (p) otSet.add(p);
            });

                                // Mapeo de fallas activas (Taller)
                                const fallasTractoMap = {};
                                const fallasRemolqueSet = new Set();
                                (fallasRows || []).forEach(f => {
                                    const pt = clean(f.placa_tracto);
                                    const pr = clean(f.placa_remolque);
                                    if (pt && (!fallasTractoMap[pt] || (Number(f.critica) === 1 && Number(fallasTractoMap[pt].critica) !== 1))) {
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
                                    if (pcar && !dispMap[pcar]) dispMap[pcar] = d;
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

                                const isMaintenanceState = str => {
                                    if (!str) return false;
                                    const s = String(str).toLowerCase().trim();
                                    return s.includes('mant') || s.includes('taller');
                                };

                                const resultado = [];

                                // Procesar motoras (Camiones / Tractos)
                                motoras.forEach(p => {
                                    const cPlaca = clean(p.placa);
                                    const falla = fallasTractoMap[cPlaca];
                                    const enRuta = rutaCamionMap[cPlaca];
                                    const enBase = baseCamionMap[cPlaca];
                                    const disp = dispMap[cPlaca];
                                    const hasDirectOT = otSet.has(cPlaca);

                                    let candidataCarreta = (disp ? disp.placa_carreta : '') || (enRuta ? enRuta.placa_carreta : (enBase ? enBase.placa_carreta : '')) || '';
                                    let cCandidata = clean(candidataCarreta);
                                    let hasCarretaOT = cCandidata ? otSet.has(cCandidata) : false;

                                    let carreta = '';
                                    let conductor = (disp ? disp.conductor_asignado : '') || ultimoConductorTracto[cPlaca] || '';
                                    let estado = 'En Base';
                                    let observaciones = '';

                                    // Regla de acople / desacople por mantenimiento (OT activa o rampa activa):
                                    // Si solo uno de los dos tiene OT activa, se desacoplan para que salgan en líneas separadas.
                                    if (candidataCarreta) {
                                        if (hasDirectOT && !hasCarretaOT) {
                                            // Camión en taller, pero carreta sin OT -> Desacoplar (la carreta saldrá libre en base)
                                            carreta = '';
                                        } else if (!hasDirectOT && hasCarretaOT) {
                                            // Carreta en taller (OT activa), pero camión sin OT -> Desacoplar (el camión queda en base/ruta y la carreta saldrá en taller)
                                            carreta = '';
                                        } else if (carretasAcopladas.has(cCandidata)) {
                                            // La carreta ya fue acoplada a otro camión (evitar duplicidad física en múltiples registros)
                                            carreta = '';
                                        } else {
                                            // Ambos sin OT o ambos con OT -> Se mantienen acoplados
                                            carreta = candidataCarreta;
                                            carretasAcopladas.add(cCandidata);
                                        }
                                    }

                                    // Determinar estado de la motora:
                                    if (hasDirectOT) {
                                        estado = 'En Mantenimiento';
                                        observaciones = (disp && disp.observaciones) ? disp.observaciones : 'En Taller / OT Activa';
                                    } else if (falla && Number(falla.critica) === 1) {
                                        estado = 'En Mantenimiento';
                                        observaciones = `Falla crítica / Folio ${falla.folio || ''}`;
                                    } else if (enRuta) {
                                        estado = 'En Ruta';
                                        observaciones = enRuta.destino ? `Destino: ${enRuta.destino}` : (enRuta.salida_observaciones || (disp ? disp.observaciones : ''));
                                    } else if (disp && disp.estado_unidad && disp.estado_unidad.trim() !== '' && !isMaintenanceState(disp.estado_unidad)) {
                                        estado = disp.estado_unidad;
                                        observaciones = disp.observaciones || (enBase ? enBase.observacion : '');
                                    } else if (enBase) {
                                        estado = 'En Base';
                                        observaciones = enBase.observacion || (disp ? disp.observaciones : '');
                                    } else {
                                        estado = (disp && disp.estado_unidad && !isMaintenanceState(disp.estado_unidad)) ? disp.estado_unidad : 'En Base';
                                        observaciones = (disp && disp.observaciones) ? disp.observaciones : '';
                                    }

                                    // La columna Observaciones es solo lo que escribe la persona; el estado ya muestra lo demás
                                    observaciones = disp && disp.observaciones ? String(disp.observaciones).trim() : '';

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
                                        if (otSet.has(clean(carreta))) {
                                            estadoCarreta = 'En Mantenimiento';
                                        }
                                    }

                                    resultado.push({
                                        id: disp ? disp.id : null,
                                        placa_camion: p.placa,
                                        placa_carreta: carreta,
                                        conductor_asignado: conductor,
                                        aviso_viaje: enRuta ? avisoViaje(enRuta) : '',
                                        estado: estado,
                                        empresa: (p.cliente || (disp ? disp.flota : '') || '').trim(),
                                        cliente: (p.cliente || (disp ? disp.flota : '') || '').trim(),
                                        marca: p.marca || (disp ? disp.marca : '') || '',
                                        capacidad_tanque: capTanque,
                                        tipo_unidad: p.tipo || 'Camión',
                                        sub_tipo: p.sub_tipo || p.tipo || 'Camión',
                                        sub_tipo_carreta: subTipoCarreta,
                                        empresa_carreta: empresaCarreta,
                                        marca_carreta: marcaCarreta,
                                        estado_carreta: estadoCarreta,
                                        observaciones: observaciones,
                                        is_motora: true
                                    });
                                });

                                // Procesar remolques/carretas sueltas o desacopladas
                                remolques.forEach(p => {
                                    const cPlaca = clean(p.placa);
                                    if (carretasAcopladas.has(cPlaca)) return; // Ya acoplada a un camión

                                    const disp = dispMap[cPlaca];
                                    const hasOT = otSet.has(cPlaca);
                                    const enRuta = rutaCarretaSet.has(cPlaca);

                                    let estado = 'En Base';
                                    let obs = '';

                                    if (hasOT) {
                                        estado = 'En Mantenimiento';
                                        obs = (disp && disp.observaciones) ? disp.observaciones : 'En Taller / OT Activa';
                                    } else if (enRuta) {
                                        estado = 'En Ruta';
                                        obs = (disp && disp.observaciones) ? disp.observaciones : '';
                                    } else if (disp && disp.estado_unidad && disp.estado_unidad.trim() !== '' && !isMaintenanceState(disp.estado_unidad)) {
                                        estado = disp.estado_unidad;
                                        obs = disp.observaciones || '';
                                    } else {
                                        estado = 'En Base';
                                        obs = (disp && disp.observaciones) ? disp.observaciones : '';
                                    }

                                    // Solo lo escrito a mano en Observaciones
                                    obs = disp && disp.observaciones ? String(disp.observaciones).trim() : '';

                                    const stCarreta = p.sub_tipo || p.tipo || 'Carreta';
                                    const empCarreta = (p.cliente || (disp ? disp.flota : '') || '').trim();

                                    resultado.push({
                                        id: disp ? disp.id : null,
                                        placa_camion: '',
                                        placa_carreta: p.placa,
                                        conductor_asignado: (disp ? disp.conductor_asignado : '') || ultimoConductorRemolque[cPlaca] || '',
                                        aviso_viaje: rutaCarretaMap[cPlaca] ? avisoViaje(rutaCarretaMap[cPlaca]) : '',
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
                                        observaciones: obs,
                                        is_motora: false
                                    });
                                });

            // 7. Incluir registros manuales de flota_disponibilidad que no estén en el resultado
            const placasEnResultado = new Set();
            resultado.forEach(r => {
                if (r.placa_camion) placasEnResultado.add(clean(r.placa_camion));
                if (r.placa_carreta) placasEnResultado.add(clean(r.placa_carreta));
            });

            (dispRows || []).forEach(d => {
                const pc = clean(d.placa_camion);
                const pcar = clean(d.placa_carreta);
                const target = pc || pcar;
                const yaPresente = (pc && placasEnResultado.has(pc)) || (pcar && (placasEnResultado.has(pcar) || carretasAcopladas.has(pcar)));
                if (!yaPresente && target) {
                    if (pc) placasEnResultado.add(pc);
                    if (pcar) placasEnResultado.add(pcar);
                    const st = d.tipo_unidad || (pc ? 'Camión' : 'Carreta');
                    resultado.push({
                        id: d.id,
                        placa_camion: d.placa_camion || '',
                        placa_carreta: d.placa_carreta || '',
                        conductor_asignado: d.conductor_asignado || '',
                        estado: d.estado_unidad || 'En Base',
                        empresa: d.flota || '',
                        cliente: d.flota || '',
                        marca: d.marca || '',
                        capacidad_tanque: d.capacidad_tanque || '—',
                        tipo_unidad: st,
                        sub_tipo: st,
                        sub_tipo_carreta: st,
                        empresa_carreta: d.flota || '',
                        marca_carreta: '',
                        estado_carreta: d.estado_unidad || 'En Base',
                        observaciones: d.observaciones || '',
                        is_motora: !!pc
                    });
                }
            });

            res.json(resultado);
        } catch (err) {
            console.error('Error en GET /api/disponibilidad-flota:', err);
            res.status(500).json({ error: 'Error al consultar disponibilidad', detalle: err.message });
        }
    });

    // Conductor de la última orden de viaje de una placa (columna: placa_tracto o placa_remolque).
    // Es la fuente del conductor sugerido: no se toma del checklist de seguridad.
    async function conductorDeUltimoViaje(pDb, placa, columna) {
        const p = String(placa || '').trim().toUpperCase();
        if (!p) return '';
        try {
            const [rows] = await pDb.query(
                `SELECT conductor FROM operaciones_ordenes_viaje
                 WHERE UPPER(TRIM(${columna})) = ? AND estado <> 'ANULADO' AND TRIM(COALESCE(conductor, '')) <> ''
                 ORDER BY fecha_viaje DESC, id DESC LIMIT 1`, [p]);
            return rows && rows[0] ? String(rows[0].conductor).trim() : '';
        } catch (err) {
            return '';
        }
    }

    // Helper unificado para guardar / actualizar disponibilidad de flota
    async function procesarGuardadoDisponibilidad(tdb, reqId, body) {
        const pDb = (tdb.promise ? tdb.promise() : tdb);

        const cam = (body.placa_camion || '').trim().toUpperCase();
        const car = (body.placa_carreta || '').trim().toUpperCase();

        if (!cam && !car) {
            throw new Error('Debe ingresar al menos la Placa de Camión o la Placa de Carreta');
        }

        const conductor = (body.conductor_asignado || '').trim();
        // El conductor de la última orden de viaje no se fija en la tabla: se toma en vivo.
        // Solo se guarda si la persona eligió otro (así un cambio de viaje se refleja solo).
        const sugerido = (await conductorDeUltimoViaje(pDb, cam, 'placa_tracto')) || (await conductorDeUltimoViaje(pDb, car, 'placa_remolque'));
        const conductorAGuardar = conductor && conductor.toUpperCase() !== sugerido.toUpperCase() ? conductor : '';
        const marca = (body.marca || '').trim().toUpperCase();
        const capacidad = (body.capacidad_tanque || '').trim();
        const tipoUnidad = (body.tipo_unidad || '').trim();
        const estadoUnidad = (body.estado || body.estado_unidad || 'En Base').trim();
        const observaciones = (body.observaciones || '').trim();
        const usuario = (body.actualizado_por || body.creado_por || 'Sistema').trim();

        const numId = reqId ? parseInt(reqId, 10) : (body.id ? parseInt(body.id, 10) : null);

        let targetId = null;

        // 1. Si vino un ID numérico, buscar si existe en flota_disponibilidad
        if (numId && !isNaN(numId)) {
            const [rowsById] = await pDb.query('SELECT id, placa_camion, placa_carreta FROM flota_disponibilidad WHERE id = ?', [numId]);
            if (rowsById && rowsById.length > 0) {
                targetId = rowsById[0].id;
            }
        }

        // 2. Si no se encontró por ID, buscar si ya existe registro por placa de camión o carreta
        if (!targetId) {
            if (cam) {
                const [rowsByCam] = await pDb.query("SELECT id FROM flota_disponibilidad WHERE placa_camion = ? AND placa_camion != '' LIMIT 1", [cam]);
                if (rowsByCam && rowsByCam.length > 0) targetId = rowsByCam[0].id;
            }
            if (!targetId && car) {
                const [rowsByCar] = await pDb.query("SELECT id FROM flota_disponibilidad WHERE placa_carreta = ? LIMIT 1", [car]);
                if (rowsByCar && rowsByCar.length > 0) targetId = rowsByCar[0].id;
            }
        }

        // 3. Ejecutar UPDATE o INSERT
        if (targetId) {
            await pDb.query(`
                UPDATE flota_disponibilidad SET
                    conductor_asignado = ?,
                    placa_camion = ?,
                    placa_carreta = ?,
                    capacidad_tanque = ?,
                    marca = ?,
                    tipo_unidad = ?,
                    estado_unidad = ?,
                    observaciones = ?,
                    actualizado_por = ?,
                    fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [conductorAGuardar, cam, car, capacidad, marca, tipoUnidad, estadoUnidad, observaciones, usuario, targetId]);
        } else {
            const [insRes] = await pDb.query(`
                INSERT INTO flota_disponibilidad (
                    conductor_asignado, placa_camion, placa_carreta,
                    capacidad_tanque, marca, tipo_unidad,
                    estado_unidad, observaciones, creado_por, actualizado_por
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [conductorAGuardar, cam, car, capacidad, marca, tipoUnidad, estadoUnidad, observaciones, usuario, usuario]);
            targetId = insRes.insertId;
        }

        // 4. Limpieza de duplicados:
        // Si la carreta 'car' fue asignada a un camión 'cam', cualquier otro registro de esa carreta suelta se remueve
        if (cam && car) {
            await pDb.query("DELETE FROM flota_disponibilidad WHERE placa_carreta = ? AND (placa_camion = '' OR placa_camion IS NULL) AND id != ?", [car, targetId]);
        }
        if (cam) {
            await pDb.query("DELETE FROM flota_disponibilidad WHERE placa_camion = ? AND id != ?", [cam, targetId]);
        }

        return targetId;
    }

    // ── GET /api/disponibilidad-flota/conductor-sugerido?placa=&tipo=camion|carreta ──
    router.get('/conductor-sugerido', async (req, res) => {
        try {
            const tdb = getDb(req);
            const pDb = (tdb.promise ? tdb.promise() : tdb);
            const esCarreta = String(req.query.tipo || '') === 'carreta';
            const conductor = await conductorDeUltimoViaje(pDb, req.query.placa, esCarreta ? 'placa_remolque' : 'placa_tracto');
            res.json({ conductor });
        } catch (err) {
            res.status(500).json({ error: 'No se pudo consultar el conductor sugerido' });
        }
    });

    // Si la unidad tiene un viaje abierto y se guarda otro estado, la respuesta lo indica
    async function advertenciaViaje(tdb, body) {
        const pDb = (tdb.promise ? tdb.promise() : tdb);
        const estado = String(body.estado || body.estado_unidad || '').trim().toLowerCase();
        if (!estado || estado === 'en ruta' || estado.includes('mant')) return '';
        const cam = String(body.placa_camion || '').trim().toUpperCase() || '\u0000';
        const car = String(body.placa_carreta || '').trim().toUpperCase() || '\u0000';
        try {
            const [rows] = await pDb.query(
                "SELECT id, salida_fecha, salida_hora, destino FROM seg_unidades_registros WHERE estado = 'en_ruta' AND (placa_tracto = ? OR placa_carreta = ?) ORDER BY id DESC LIMIT 1",
                [cam, car]);
            if (!rows || !rows[0]) return '';
            const r = rows[0];
            return `Guardado, pero la unidad sigue EN RUTA: bloqueado por viaje ${r.id} (salida ${r.salida_fecha || ''} ${r.salida_hora || ''}${r.destino ? ' ' + r.destino : ''}). Requiere registrar retorno en Garita/Seguridad.`;
        } catch (err) {
            return '';
        }
    }

    // ── POST /api/disponibilidad-flota (Crear / Guardar registro) ───────────────
    router.post('/', async (req, res) => {
        try {
            const tdb = getDb(req);
            const targetId = await procesarGuardadoDisponibilidad(tdb, null, req.body);
            auditar(req, 'CREAR/GUARDAR', `Registro disponibilidad guardado: ${req.body.placa_camion || req.body.placa_carreta} (ID: ${targetId})`);
            const advertencia = await advertenciaViaje(tdb, req.body);
            res.json({ success: true, message: 'Registro guardado correctamente', id: targetId, advertencia });
        } catch (err) {
            console.error('Error en POST /api/disponibilidad-flota:', err);
            res.status(400).json({ error: err.message || 'Error al guardar disponibilidad' });
        }
    });

    // ── PUT /api/disponibilidad-flota/:id (Actualizar registro) ─────────────────
    router.put('/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const targetId = await procesarGuardadoDisponibilidad(tdb, req.params.id, req.body);
            auditar(req, 'ACTUALIZAR', `Registro disponibilidad actualizado: ${req.body.placa_camion || req.body.placa_carreta} (ID: ${targetId})`);
            const advertencia = await advertenciaViaje(tdb, req.body);
            res.json({ success: true, message: 'Disponibilidad actualizada exitosamente', id: targetId, advertencia });
        } catch (err) {
            console.error('Error en PUT /api/disponibilidad-flota:', err);
            res.status(400).json({ error: err.message || 'Error al actualizar disponibilidad' });
        }
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
