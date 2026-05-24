const express = require('express');
const router = express.Router();

module.exports = (db, broadcast, logAudit) => {

// MÓDULO PLANIFICACIÓN PREVENTIVOS
// ============================================================
// GENERADORES DE ID
// ============================================================

// Genera ID legible para Fleetrun: FL-AJH832-MP1-20260415
// Si ya existe ese ID (mismo placa+tipomp+fecha), agrega -2, -3, etc.
function generarIdFleetrunUnico(placa, tipoMp, fecha, cb) {
    const p = (placa || 'XX').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
    const t = (tipoMp || 'MP').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
    const fechaStr = (fecha || new Date().toISOString().split('T')[0]).split('T')[0].replace(/-/g, '');
    const base = `FL-${p}-${t}-${fechaStr}`;
    db.query(
        'SELECT idRegistro FROM fleetrun WHERE idRegistro LIKE ? ORDER BY idRegistro DESC LIMIT 10',
        [base + '%'],
        (err, rows) => {
            if (err || !rows.length) return cb(base);
            // Si existe el base exacto, buscar el próximo número
            const existing = rows.map(r => r.idRegistro);
            if (!existing.includes(base)) return cb(base);
            let seq = 2;
            while (existing.includes(`${base}-${seq}`)) seq++;
            cb(`${base}-${seq}`);
        }
    );
}

// Genera el próximo ID de planificación (PLAN-YYYYMM-XXXX)
function generarIdPlan(mes, anio, cb) {
    const prefix = `PLAN-${anio}${String(mes).padStart(2,'0')}`;
    db.query(
        `SELECT id FROM planificacion WHERE id LIKE ? ORDER BY id DESC LIMIT 1`,
        [`${prefix}%`],
        (err, rows) => {
            let seq = 1;
            if (!err && rows.length) {
                const last = rows[0].id.split('-')[2];
                seq = (parseInt(last, 10) || 0) + 1;
            }
            cb(`${prefix}-${String(seq).padStart(4,'0')}`);
        }
    );
}

// Auto-genera requerimientos de kits para un plan creado
function generarRequerimientos(planId, placa, tipoMp, mes, anio) {
    db.query('SELECT marca FROM placas WHERE placa=?', [placa], (err, rows) => {
        if (err || !rows.length) return;
        const marca = (rows[0].marca || '').toUpperCase();
        db.query(
            `SELECT item_codigo, item_nombre, cantidad, unidad_medida, costo_unitario, costo_total
             FROM mantenimiento_kits
             WHERE UPPER(marca_vehiculo)=? AND tipo_mp=? AND activo=1
             ORDER BY orden`,
            [marca, tipoMp],
            (err2, kits) => {
                if (err2 || !kits.length) return;
                const inserts = kits.map(k => [
                    planId, mes, anio,
                    k.item_codigo, k.item_nombre,
                    k.cantidad, k.unidad_medida,
                    k.costo_unitario, k.costo_total
                ]);
                db.query(
                    `INSERT INTO requerimientos_planificacion
                     (plan_id, mes_ejecucion, anio_ejecucion, item_codigo, item_nombre,
                      cantidad_requerida, unidad_medida, costo_unitario, costo_total)
                     VALUES ?`,
                    [inserts],
                    (err3) => {
                        if (err3) console.warn('Requerimientos insert error:', err3.message);
                    }
                );
            }
        );
    });
}

// Auto-genera la PRÓXIMA planificación cuando se completa una
function generarProximaMP(placa, tipoMp, createdBy) {
    db.query(
        `SELECT km_actual, km_proximo, frecuencia_km, fecha, km_gps FROM fleetrun
         WHERE placa=? AND tipo_mp=? ORDER BY fecha DESC, idRegistro DESC LIMIT 1`,
        [placa, tipoMp],
        (err, rows) => {
            if (err || !rows.length) return;
            const last = rows[0];
            const intervalo = last.frecuencia_km
                ? parseInt(last.frecuencia_km)
                : (last.km_proximo && last.km_actual ? last.km_proximo - last.km_actual : 0);
            if (!intervalo || intervalo <= 0) return;

            const nextKm = (parseInt(last.km_proximo) || parseInt(last.km_actual) + intervalo);

            // Obtener config para estimar fecha
            db.query(
                `SELECT p.marca, cf.km_diarios
                 FROM placas p
                 LEFT JOIN configuracion_flota cf ON UPPER(cf.marca)=UPPER(p.marca) AND cf.activa=1
                 WHERE p.placa=?
                 ORDER BY cf.uts_categoria ASC LIMIT 1`,
                [placa],
                (err2, cfRows) => {
                    const kmDiarios = (cfRows && cfRows.length && cfRows[0].km_diarios)
                        ? parseFloat(cfRows[0].km_diarios) : 0;

                    const kmGpsActual = parseInt(last.km_gps) || parseInt(last.km_proximo) || parseInt(last.km_actual);
                    let diasAlProximo = 30; // default 1 mes
                    if (kmDiarios > 0) {
                        const faltanKm = nextKm - kmGpsActual;
                        diasAlProximo = Math.max(7, Math.round(faltanKm / kmDiarios));
                    }

                    const hoy = new Date();
                    const fechaEstimada = new Date(hoy.getTime() + diasAlProximo * 86400000);
                    const fechaInicio = new Date(fechaEstimada.getTime() - 5 * 86400000);
                    const fechaFin    = new Date(fechaEstimada.getTime() + 5 * 86400000);

                    const mes  = fechaEstimada.getMonth() + 1;
                    const anio = fechaEstimada.getFullYear();

                    generarIdPlan(mes, anio, (newId) => {
                        db.query(
                            `INSERT INTO planificacion
                             (id, placa, tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
                              mes_ejecucion, anio_ejecucion, km_estimado, km_minimo, km_maximo,
                              estado, source, created_by)
                             VALUES (?,?,?,?,?,?,?,?,?,?,'Programada','auto_generada',?)`,
                            [
                                newId, placa, tipoMp,
                                fechaInicio.toISOString().split('T')[0],
                                fechaFin.toISOString().split('T')[0],
                                mes, anio, nextKm,
                                nextKm - 5000, nextKm + 5000,
                                createdBy || 'sistema'
                            ],
                            (err3) => {
                                if (!err3) {
                                    generarRequerimientos(newId, placa, tipoMp, mes, anio);
                                    broadcast('planificacion', 'auto_generada');
                                    console.log(`✅ Próxima MP generada: ${newId} (${placa} ${tipoMp})`);
                                } else {
                                    console.warn('generarProximaMP insert error:', err3.message);
                                }
                            }
                        );
                    });
                }
            );
        }
    );
}

// GET /api/configuracion-flota
app.get('/api/configuracion-flota', (req, res) => {
    db.query(
        `SELECT id, marca, uts_categoria, km_mensuales, dias_operativos,
                CASE WHEN dias_operativos > 0 THEN ROUND(km_mensuales / dias_operativos, 2) ELSE 0 END AS km_diarios,
                mp1_intervalo_km, mp2_intervalo_km, mp3_intervalo_km, activa, observaciones
         FROM configuracion_flota ORDER BY marca, uts_categoria`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows });
        }
    );
});

// PUT /api/configuracion-flota/:id  (Gerencia ajusta km/mes e intervalos)
app.put('/api/configuracion-flota/:id', (req, res) => {
    const { id } = req.params;
    const { km_mensuales, dias_operativos, mp1_intervalo_km, mp2_intervalo_km, mp3_intervalo_km, observaciones, activa } = req.body;
    db.query(
        `UPDATE configuracion_flota
         SET km_mensuales=?, dias_operativos=?, mp1_intervalo_km=?, mp2_intervalo_km=?, mp3_intervalo_km=?,
             observaciones=?, activa=?
         WHERE id=?`,
        [km_mensuales, dias_operativos, mp1_intervalo_km, mp2_intervalo_km, mp3_intervalo_km, observaciones, activa, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

// GET /api/mantenimiento-kits?marca=X&tipo_mp=Y
app.get('/api/mantenimiento-kits', (req, res) => {
    const { marca, tipo_mp } = req.query;
    let sql = `SELECT id, marca_vehiculo, tipo_mp, nombre_kit, item_codigo, item_nombre,
                      cantidad, unidad_medida, costo_unitario, costo_total, orden
               FROM mantenimiento_kits WHERE activo=1`;
    const params = [];
    if (marca)   { sql += ' AND UPPER(marca_vehiculo)=?'; params.push(marca.toUpperCase()); }
    if (tipo_mp) { sql += ' AND tipo_mp=?'; params.push(tipo_mp); }
    sql += ' ORDER BY marca_vehiculo, tipo_mp, orden';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// GET /api/planificacion?mes=X&anio=Y&estado=X&placa=X
router.get('/planificacion', (req, res) => {
    const { mes, anio, estado, placa } = req.query;
    let sql = `SELECT p.*, pl.marca, pl.cliente, pl.modelo_uts, pl.tipo, pl.uts AS placa_uts
               FROM planificacion p
               LEFT JOIN placas pl ON pl.placa = p.placa
               WHERE 1=1`;
    const params = [];
    if (mes)    { sql += ' AND p.mes_ejecucion=?';   params.push(parseInt(mes)); }
    if (anio)   { sql += ' AND p.anio_ejecucion=?';  params.push(parseInt(anio)); }
    if (estado) { sql += ' AND p.estado=?';           params.push(estado); }
    if (placa)  { sql += ' AND p.placa=?';            params.push(placa.toUpperCase()); }
    sql += ' ORDER BY p.fecha_inicio_ventana ASC, p.prioridad DESC';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// POST /api/importarPlanificacionMasivo  (JSON desde SheetJS en frontend)
router.post('/importarPlanificacionMasivo', async (req, res) => {
    const { registros, mes, anio, createdBy } = req.body;
    if (!Array.isArray(registros) || !registros.length)
        return res.status(400).json({ ok: 0, errores: 0, msg: 'Sin registros' });

    const mesN  = parseInt(mes)  || new Date().getMonth() + 1;
    const anioN = parseInt(anio) || new Date().getFullYear();

    let ok = 0, errores = 0;
    const detallesError = [];

    // Validar que todas las placas existen
    const placasUnicas = [...new Set(registros.map(r => (r.placa || r.PLACA || '').toString().trim().toUpperCase()).filter(Boolean))];
    const placasEnDB = await new Promise(resolve => {
        if (!placasUnicas.length) return resolve([]);
        db.query('SELECT placa FROM placas WHERE placa IN (?)', [placasUnicas], (err, rows) => {
            resolve(err ? [] : rows.map(r => r.placa));
        });
    });

    for (let i = 0; i < registros.length; i++) {
        const r = registros[i];
        const placa    = (r.placa || r.PLACA || '').toString().trim().toUpperCase();
        const tipoMp   = (r.tipo_mp || r.TIPO_MP || r['TIPO MP'] || '').toString().trim().toUpperCase();
        const fechaIni = r.fecha_inicio || r.FECHA_INICIO || r['FECHA INICIO'] || '';
        const fechaFin = r.fecha_fin    || r.FECHA_FIN    || r['FECHA FIN']    || '';

        if (!placa || !tipoMp || !fechaIni || !fechaFin) {
            errores++;
            detallesError.push(`Fila ${i+2}: datos incompletos (placa, tipo_mp, fechas son obligatorios)`);
            continue;
        }
        if (!placasEnDB.includes(placa)) {
            errores++;
            detallesError.push(`Fila ${i+2}: placa ${placa} no existe en el sistema`);
            continue;
        }

        const kmEst  = parseInt(r.km_estimado || r.KM_ESTIMADO || r['KM ESTIMADO'] || 0) || 0;
        const kmMin  = parseInt(r.km_minimo   || r.KM_MINIMO   || r['KM MINIMO']   || 0) || null;
        const kmMax  = parseInt(r.km_maximo   || r.KM_MAXIMO   || r['KM MAXIMO']   || 0) || null;
        const tecnico   = r.tecnico   || r.TECNICO   || null;
        const prioridad = r.prioridad || r.PRIORIDAD || 'Normal';
        const obs       = r.observaciones || r.OBSERVACIONES || null;

        await new Promise(resolve => {
            generarIdPlan(mesN, anioN, (newId) => {
                db.query(
                    `INSERT INTO planificacion
                     (id, placa, tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
                      mes_ejecucion, anio_ejecucion, km_estimado, km_minimo, km_maximo,
                      tecnico_asignado, prioridad, observaciones_plan,
                      estado, source, created_by)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'Programada','manual_excel',?)`,
                    [newId, placa, tipoMp, fechaIni, fechaFin,
                     mesN, anioN, kmEst, kmMin, kmMax,
                     tecnico, prioridad, obs, createdBy || 'sistema'],
                    (err) => {
                        if (err) {
                            errores++;
                            detallesError.push(`Fila ${i+2}: ${err.message}`);
                        } else {
                            ok++;
                            generarRequerimientos(newId, placa, tipoMp, mesN, anioN);
                        }
                        resolve();
                    }
                );
            });
        });
    }

    if (ok > 0) broadcast('planificacion', 'importar');
    res.json({ ok, errores, errores_detalle: detallesError });
});

// POST /api/planificacion/lote — Genera múltiples planes desde proyección
router.post('/planificacion/lote', (req, res) => {
    const { planes } = req.body;
    if (!Array.isArray(planes) || !planes.length) return res.status(400).json({ error: 'planes[] requerido' });
    let creados = 0, ignorados = 0;
    const procesarPlan = (plan, cb) => {
        const { placa, tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
                mes_ejecucion, anio_ejecucion, km_estimado, prioridad, source, created_by } = plan;
        if (!placa || !tipo_mp || !fecha_inicio_ventana || !fecha_fin_ventana) { ignorados++; return cb(); }
        db.query(
            `SELECT id FROM planificacion
             WHERE UPPER(placa)=? AND UPPER(tipo_mp)=? AND mes_ejecucion=? AND anio_ejecucion=?
               AND estado NOT IN ('Cancelada','Diferida') LIMIT 1`,
            [placa.toUpperCase(), tipo_mp.toUpperCase(), mes_ejecucion, anio_ejecucion],
            (err, rows) => {
                if (err || rows.length) { ignorados++; return cb(); }
                generarIdPlan(mes_ejecucion, anio_ejecucion, (newId) => {
                    db.query(
                        `INSERT INTO planificacion (id, placa, tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
                         mes_ejecucion, anio_ejecucion, km_estimado, prioridad, estado, source, created_by)
                         VALUES (?,?,?,?,?,?,?,?,?,'Programada',?,?)`,
                        [newId, placa.toUpperCase(), tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
                         mes_ejecucion, anio_ejecucion, km_estimado || 0,
                         prioridad || 'Normal', source || 'auto_generada', created_by || 'sistema'],
                        (e2) => { if (!e2) creados++; cb(); }
                    );
                });
            }
        );
    };
    let i = 0;
    const siguiente = () => {
        if (i >= planes.length) {
            broadcast('planificacion', 'lote');
            return res.json({ ok: true, creados, ignorados });
        }
        procesarPlan(planes[i++], siguiente);
    };
    siguiente();
});

// POST /api/planificacion  (crear uno solo manualmente)
router.post('/planificacion', (req, res) => {
    const { placa, tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
            mes_ejecucion, anio_ejecucion, km_estimado, km_minimo, km_maximo,
            tecnico_asignado, prioridad, observaciones_plan, created_by } = req.body;

    if (!placa || !tipo_mp || !fecha_inicio_ventana || !fecha_fin_ventana)
        return res.status(400).json({ error: 'Placa, tipo_mp y fechas son requeridos' });

    const mes  = parseInt(mes_ejecucion)  || new Date().getMonth() + 1;
    const anio = parseInt(anio_ejecucion) || new Date().getFullYear();

    generarIdPlan(mes, anio, (newId) => {
        db.query(
            `INSERT INTO planificacion
             (id, placa, tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
              mes_ejecucion, anio_ejecucion, km_estimado, km_minimo, km_maximo,
              tecnico_asignado, prioridad, observaciones_plan,
              estado, source, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'Programada','manual_excel',?)`,
            [newId, placa.toUpperCase(), tipo_mp, fecha_inicio_ventana, fecha_fin_ventana,
             mes, anio, km_estimado || 0, km_minimo || null, km_maximo || null,
             tecnico_asignado || null, prioridad || 'Normal', observaciones_plan || null,
             created_by || 'sistema'],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                generarRequerimientos(newId, placa.toUpperCase(), tipo_mp, mes, anio);
                broadcast('planificacion', 'crear');
                res.json({ ok: true, id: newId });
            }
        );
    });
});

// PUT /api/planificacion/:id  (cambiar estado, reasignar, posponer)
router.put('/planificacion/:id', (req, res) => {
    const { id } = req.params;
    const {
        estado, tecnico_asignado, prioridad, observaciones_plan,
        fecha_inicio_ventana, fecha_fin_ventana,
        mes_ejecucion, anio_ejecucion,
        motivo_cancelacion
    } = req.body;

    const campos = [];
    const vals   = [];

    if (estado !== undefined)               { campos.push('estado=?');                 vals.push(estado); }
    if (tecnico_asignado !== undefined)     { campos.push('tecnico_asignado=?');       vals.push(tecnico_asignado); }
    if (prioridad !== undefined)            { campos.push('prioridad=?');              vals.push(prioridad); }
    if (observaciones_plan !== undefined)   { campos.push('observaciones_plan=?');     vals.push(observaciones_plan); }
    if (fecha_inicio_ventana !== undefined) { campos.push('fecha_inicio_ventana=?');   vals.push(fecha_inicio_ventana); }
    if (fecha_fin_ventana !== undefined)    { campos.push('fecha_fin_ventana=?');      vals.push(fecha_fin_ventana); }
    if (mes_ejecucion !== undefined)        { campos.push('mes_ejecucion=?');          vals.push(mes_ejecucion); }
    if (anio_ejecucion !== undefined)       { campos.push('anio_ejecucion=?');         vals.push(anio_ejecucion); }
    if (motivo_cancelacion !== undefined)   { campos.push('motivo_cancelacion=?');     vals.push(motivo_cancelacion); }

    // Si se pospone: resetear alertas
    if (estado === 'Diferida') {
        campos.push('fecha_primer_retraso=NULL');
        campos.push('alertas_enviadas=0');
    }

    if (!campos.length) return res.status(400).json({ error: 'Sin campos a actualizar' });

    vals.push(id);
    db.query(`UPDATE planificacion SET ${campos.join(',')} WHERE id=?`, vals, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        broadcast('planificacion', 'actualizar');
        res.json({ ok: true });
    });
});

// POST /api/planificacion/:id/completar  (link a Fleetrun + generar próxima MP)
router.post('/planificacion/:id/completar', (req, res) => {
    const { id } = req.params;
    const { fleetrun_id, fecha_real, km_real, usuario } = req.body;

    if (!fleetrun_id)
        return res.status(400).json({ error: 'fleetrun_id es requerido' });

    db.query('SELECT placa, tipo_mp, km_estimado, fecha_inicio_ventana, estado FROM planificacion WHERE id=?', [id], (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ error: 'Plan no encontrado' });
        const plan = rows[0];

        // Idempotencia: si ya está completado con el mismo Fleetrun, responder OK sin duplicar
        if (plan.estado === 'Completada') {
            return res.json({ ok: true, ya_completado: true });
        }

        const kmReal = parseInt(km_real) || 0;
        const desviacionKm = kmReal ? kmReal - plan.km_estimado : null;

        // Calcular desviacion_dias solo si ambas fechas son válidas
        let desviacionDias = null;
        if (fecha_real) {
            const dReal = new Date(fecha_real);
            const dPlan = plan.fecha_inicio_ventana instanceof Date
                ? plan.fecha_inicio_ventana
                : new Date(String(plan.fecha_inicio_ventana || ''));
            if (!isNaN(dReal.getTime()) && !isNaN(dPlan.getTime())) {
                desviacionDias = Math.round((dReal - dPlan) / 86400000);
            }
        }

        db.query(
            `UPDATE planificacion SET
                estado='Completada',
                fleetrun_id_ejecutado=?,
                fecha_real_ejecucion=?,
                km_real_ejecucion=?,
                desviacion_km=?,
                desviacion_dias=?,
                alertas_enviadas=0
             WHERE id=? AND estado != 'Completada'`,
            [fleetrun_id, fecha_real || null, kmReal || null, desviacionKm, desviacionDias, id],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                broadcast('planificacion', 'completar');
                logAudit(usuario || 'sistema', 'planificacion', 'COMPLETÓ', `${plan.tipo_mp} · ${plan.placa} → ${fleetrun_id}`);
                // Auto-generar próxima MP
                generarProximaMP(plan.placa, plan.tipo_mp, usuario || 'sistema');
                res.json({ ok: true });
            }
        );
    });
});

// DELETE /api/planificacion/:id  (cancelar con motivo)
router.delete('/planificacion/:id', (req, res) => {
    const { id }     = req.params;
    const { motivo, usuario } = req.body;

    db.query(
        `UPDATE planificacion SET estado='Cancelada', motivo_cancelacion=? WHERE id=?`,
        [motivo || null, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            logAudit(usuario || 'sistema', 'planificacion', 'CANCELÓ', `Plan ${id}: ${motivo || 'sin motivo'}`);
            broadcast('planificacion', 'cancelar');
            res.json({ ok: true });
        }
    );
});

// GET /api/reportePlanificacion?mes=X&anio=Y
router.get('/reportePlanificacion', (req, res) => {
    const mes  = parseInt(req.query.mes)  || new Date().getMonth() + 1;
    const anio = parseInt(req.query.anio) || new Date().getFullYear();

    db.query(
        `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN estado='Completada' THEN 1 ELSE 0 END) AS completadas,
            SUM(CASE WHEN estado='Cancelada'  THEN 1 ELSE 0 END) AS canceladas,
            SUM(CASE WHEN estado='Diferida'   THEN 1 ELSE 0 END) AS diferidas,
            SUM(CASE WHEN estado NOT IN ('Completada','Cancelada','Diferida') THEN 1 ELSE 0 END) AS pendientes,
            ROUND(
                SUM(CASE WHEN estado='Completada' THEN 1 ELSE 0 END) * 100.0 /
                NULLIF(COUNT(*),0), 1
            ) AS pct_cumplimiento,
            ROUND(AVG(CASE WHEN desviacion_dias IS NOT NULL THEN desviacion_dias END),1) AS promedio_desviacion_dias,
            ROUND(AVG(CASE WHEN desviacion_km IS NOT NULL AND estado='Completada' THEN desviacion_km END),0) AS promedio_desviacion_km,
            MAX(CASE WHEN desviacion_dias > 0 THEN desviacion_dias END) AS max_retraso_dias
         FROM planificacion
         WHERE mes_ejecucion=? AND anio_ejecucion=?`,
        [mes, anio],
        (err, kpis) => {
            if (err) return res.status(500).json({ error: err.message });

            db.query(
                `SELECT p.id, p.placa, pl.cliente, pl.marca, p.tipo_mp,
                        p.fecha_inicio_ventana, p.fecha_fin_ventana,
                        p.fecha_real_ejecucion, p.km_estimado, p.km_real_ejecucion,
                        p.desviacion_km, p.desviacion_dias, p.tecnico_asignado,
                        p.estado, p.prioridad, p.observaciones_plan, p.motivo_cancelacion,
                        p.fleetrun_id_ejecutado, p.source
                 FROM planificacion p
                 LEFT JOIN placas pl ON pl.placa=p.placa
                 WHERE p.mes_ejecucion=? AND p.anio_ejecucion=?
                 ORDER BY p.fecha_inicio_ventana ASC`,
                [mes, anio],
                (err2, detalle) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ kpis: kpis[0], detalle });
                }
            );
        }
    );
});

// GET /api/requerimientos-planificacion?mes=X&anio=Y&plan_id=X
router.get('/requerimientos-planificacion', (req, res) => {
    const { mes, anio, plan_id } = req.query;
    let sql = `SELECT r.*, p.placa, p.tipo_mp FROM requerimientos_planificacion r
               LEFT JOIN planificacion p ON p.id=r.plan_id WHERE 1=1`;
    const params = [];
    if (plan_id) { sql += ' AND r.plan_id=?'; params.push(plan_id); }
    if (mes)     { sql += ' AND r.mes_ejecucion=?'; params.push(parseInt(mes)); }
    if (anio)    { sql += ' AND r.anio_ejecucion=?'; params.push(parseInt(anio)); }
    sql += ' ORDER BY r.plan_id, r.id';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// GET /api/planificacion-proyeccion?meses=3&placa=ALL
// Proyecta próximos mantenimientos basándose en el último Fleetrun + frecuencia configurada
router.get('/planificacion-proyeccion', (req, res) => {
    const meses = Math.max(1, Math.min(24, parseInt(req.query.meses) || 3));
    const placa = (req.query.placa || '').toUpperCase().trim();

    const sql = `
        SELECT
            fr.placa, fr.tipo_mp,
            fr.ultima_fecha, fr.ultimo_km, fr.km_proximo,
            p.marca, p.cliente, p.uts,
            tm.frecuencia_km, tm.frecuencia_dias,
            COALESCE(ks.costo_total_kit, 0) AS costo_kit
        FROM (
            SELECT f.placa, f.tipo_mp,
                   MAX(f.fecha)      AS ultima_fecha,
                   MAX(f.km_actual)  AS ultimo_km,
                   MAX(f.km_proximo) AS km_proximo,
                   MAX(f.marca)      AS fr_marca
            FROM fleetrun f
            INNER JOIN (
                SELECT placa, tipo_mp, MAX(fecha) AS max_fecha
                FROM fleetrun
                GROUP BY placa, tipo_mp
            ) lf ON f.placa = lf.placa AND f.tipo_mp = lf.tipo_mp AND f.fecha = lf.max_fecha
            GROUP BY f.placa, f.tipo_mp
        ) fr
        LEFT JOIN placas p   ON UPPER(p.placa) = UPPER(fr.placa)
        LEFT JOIN tipos_mantenimiento tm
            ON tm.id = (
                SELECT id FROM tipos_mantenimiento
                WHERE UPPER(marca) = UPPER(COALESCE(p.marca, fr.fr_marca, ''))
                  AND UPPER(tipo_mp) = UPPER(fr.tipo_mp)
                ORDER BY CASE WHEN UPPER(uts) = UPPER(COALESCE(p.uts,'')) THEN 0 ELSE 1 END, id ASC
                LIMIT 1
            )
        LEFT JOIN (
            SELECT marca_vehiculo, tipo_mp, SUM(costo_total) AS costo_total_kit
            FROM mantenimiento_kits
            WHERE activo = 1 OR activo IS NULL
            GROUP BY marca_vehiculo, tipo_mp
        ) ks ON UPPER(ks.marca_vehiculo) = UPPER(COALESCE(p.marca,'')) AND ks.tipo_mp = fr.tipo_mp
        ${placa ? 'WHERE UPPER(fr.placa) = ?' : ''}
        ORDER BY fr.placa, fr.tipo_mp
    `;

    const params = placa ? [placa] : [];

    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const horizonte = new Date(today);
        horizonte.setMonth(horizonte.getMonth() + meses);

        const resultado = [];

        rows.forEach(row => {
            let fecha_proyectada = null;
            let metodo = null;
            let vencida = false;
            let dias_restantes = null;

            if (row.ultima_fecha && row.frecuencia_dias) {
                const _rawUF = (row.ultima_fecha instanceof Date && !isNaN(row.ultima_fecha.getTime()))
                    ? row.ultima_fecha.toISOString()
                    : String(row.ultima_fecha || '');
                const base = new Date(_rawUF.slice(0, 10) + 'T00:00:00');
                if (!isNaN(base.getTime())) {
                    fecha_proyectada = new Date(base);
                    fecha_proyectada.setDate(fecha_proyectada.getDate() + parseInt(row.frecuencia_dias));
                    metodo  = 'dias';
                    vencida = fecha_proyectada < today;
                    dias_restantes = Math.round((fecha_proyectada - today) / 86400000);
                    if (!vencida && fecha_proyectada > horizonte) return;
                } else if (row.km_proximo) {
                    metodo = 'km';
                } else {
                    return;
                }
            } else if (row.km_proximo) {
                metodo = 'km';
            } else {
                return;
            }

            resultado.push({
                placa:           row.placa,
                marca:           row.marca || '',
                cliente:         row.cliente || '',
                uts:             row.uts    || '',
                tipo_mp:         row.tipo_mp,
                frecuencia_km:   row.frecuencia_km   || null,
                frecuencia_dias: row.frecuencia_dias || null,
                ultima_fecha:    (row.ultima_fecha instanceof Date && !isNaN(row.ultima_fecha.getTime()))
                    ? row.ultima_fecha.toISOString().split('T')[0]
                    : (row.ultima_fecha || null),
                ultimo_km:       row.ultimo_km,
                km_proximo:      row.km_proximo,
                costo_kit:       parseFloat(row.costo_kit) || 0,
                fecha_proyectada: (fecha_proyectada && !isNaN(fecha_proyectada.getTime())) ? fecha_proyectada.toISOString().split('T')[0] : null,
                metodo,
                vencida,
                dias_restantes
            });
        });

        res.json({ data: resultado, total: resultado.length });
    });
});

// GET /api/planificacion-sugerir?placa=X&tipomp=Y — sugiere fechas/KM para nuevo plan
router.get('/planificacion-sugerir', (req, res) => {
    const { placa, tipomp } = req.query;
    if (!placa || !tipomp) return res.status(400).json({ error: 'placa y tipomp requeridos' });

    // 1. Último registro Fleetrun para esa placa+tipomp
    db.query(
        `SELECT fecha, km_actual, km_proximo FROM fleetrun
         WHERE UPPER(placa)=? AND UPPER(tipo_mp)=?
         ORDER BY fecha DESC, idRegistro DESC LIMIT 1`,
        [placa.toUpperCase(), tipomp.toUpperCase()],
        (err, frRows) => {
            if (err) return res.status(500).json({ error: err.message });

            // 2. Configuración de frecuencia desde tipos_mantenimiento
            // ORDER BY prioriza el que coincide con el uts del vehículo (NACIONAL vs LOCAL)
            db.query(
                `SELECT tm.frecuencia_km, tm.frecuencia_dias, tm.uts
                 FROM tipos_mantenimiento tm
                 INNER JOIN placas p ON UPPER(p.marca) = UPPER(tm.marca)
                 WHERE UPPER(p.placa)=? AND UPPER(tm.tipo_mp)=?
                 ORDER BY CASE WHEN UPPER(tm.uts) = UPPER(p.uts) THEN 0 ELSE 1 END, tm.id ASC
                 LIMIT 1`,
                [placa.toUpperCase(), tipomp.toUpperCase()],
                (err2, tmRows) => {
                    if (err2) return res.status(500).json({ error: err2.message });

                    const tm = tmRows[0] || {};
                    const fr = frRows[0] || {};

                    // Calcular fecha sugerida
                    let fechaSugerida = null;
                    let fechaFinSugerida = null;
                    let kmSugerido = null;

                    const frecDias = parseInt(tm.frecuencia_dias) || 0;
                    const frecKm   = parseInt(tm.frecuencia_km)   || 0;

                    if (fr.fecha) {
                        const fechaRaw = fr.fecha instanceof Date ? fr.fecha.toISOString() : String(fr.fecha || '');
                        const base = new Date(fechaRaw.slice(0, 10) + 'T00:00:00');
                        if (!isNaN(base.getTime()) && frecDias > 0) {
                            const ini = new Date(base);
                            ini.setDate(ini.getDate() + frecDias);
                            fechaSugerida = ini.toISOString().split('T')[0];
                            // Ventana por defecto: 7 días
                            const fin = new Date(ini);
                            fin.setDate(fin.getDate() + 7);
                            fechaFinSugerida = fin.toISOString().split('T')[0];
                        }
                    }
                    if (fr.km_actual && frecKm > 0) {
                        kmSugerido = parseInt(fr.km_actual) + frecKm;
                    }

                    if (!fechaSugerida && !kmSugerido) {
                        return res.json({ ok: false, mensaje: 'Sin datos suficientes para sugerir fechas' });
                    }

                    res.json({
                        ok: true,
                        fecha_sugerida:     fechaSugerida,
                        fecha_fin_sugerida: fechaFinSugerida,
                        km_sugerido:        kmSugerido,
                        basado_en: {
                            ultimo_fleetrun_fecha: fr.fecha || null,
                            ultimo_km_actual:      fr.km_actual || null,
                            frecuencia_dias:       frecDias || null,
                            frecuencia_km:         frecKm   || null
                        }
                    });
                }
            );
        }
    );
});

// GET /api/fleetrun/buscar/:id — buscar un registro por idRegistro (para completar plan)
app.get('/api/fleetrun/buscar/:id', (req, res) => {
    db.query(
        `SELECT idRegistro, fecha, placa, tipo_mp, km_actual, km_proximo, frecuencia_km, tecnico, observacion
         FROM fleetrun WHERE idRegistro = ? LIMIT 1`,
        [req.params.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });
            res.json({ data: rows[0] });
        }
    );
});

// POST /api/fleetrun-backfill-codigos — migra IDs tipo FL-1713000000000 al formato legible
app.post('/api/fleetrun-backfill-codigos', (req, res) => {
    // Buscar registros con el antiguo formato timestamp (FL-13dígitos)
    db.query(
        `SELECT idRegistro, placa, tipo_mp, fecha FROM fleetrun
         WHERE idRegistro REGEXP '^FL-[0-9]{10,}$' OR idRegistro NOT REGEXP '^FL-[A-Z]'
         ORDER BY fecha ASC`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.json({ ok: true, actualizados: 0, mensaje: 'No hay registros con IDs antiguos' });

            let pendientes = rows.length;
            let actualizados = 0;
            let errores = 0;

            const procesarSiguiente = (idx) => {
                if (idx >= rows.length) {
                    return res.json({ ok: true, actualizados, errores, total: rows.length });
                }
                const r = rows[idx];
                const fechaStr = r.fecha
                    ? (r.fecha instanceof Date ? r.fecha.toISOString() : String(r.fecha)).split('T')[0]
                    : new Date().toISOString().split('T')[0];

                generarIdFleetrunUnico(r.placa, r.tipo_mp, fechaStr, (nuevoId) => {
                    db.query(
                        'UPDATE fleetrun SET idRegistro = ? WHERE idRegistro = ?',
                        [nuevoId, r.idRegistro],
                        (err2) => {
                            if (err2) { errores++; } else { actualizados++; }
                            procesarSiguiente(idx + 1);
                        }
                    );
                });
            };

            procesarSiguiente(0);
        }
    );
});

// GET /api/requerimientos-resumen?mes=X&anio=Y — vista consolidada por marca/tipo
app.get('/api/requerimientos-resumen', (req, res) => {
    const { mes, anio } = req.query;
    if (!mes || !anio) return res.status(400).json({ error: 'mes y anio son requeridos' });
    const sql = `
        SELECT pl2.marca, p.tipo_mp, mk.nombre_kit,
               r.item_codigo, r.item_nombre,
               SUM(r.cantidad_requerida) AS total_cantidad, r.unidad_medida,
               r.costo_unitario, SUM(r.costo_total) AS total_costo,
               COUNT(DISTINCT r.plan_id) AS num_planes
        FROM requerimientos_planificacion r
        LEFT JOIN planificacion p ON p.id = r.plan_id
        LEFT JOIN placas pl2 ON UPPER(pl2.placa) = UPPER(p.placa)
        LEFT JOIN mantenimiento_kits mk
               ON UPPER(mk.marca_vehiculo) = UPPER(pl2.marca)
              AND mk.tipo_mp = p.tipo_mp
              AND mk.item_codigo = r.item_codigo
        WHERE r.mes_ejecucion = ? AND r.anio_ejecucion = ?
          AND p.estado NOT IN ('Cancelada')
        GROUP BY pl2.marca, p.tipo_mp, mk.nombre_kit, r.item_codigo,
                 r.item_nombre, r.unidad_medida, r.costo_unitario
        ORDER BY pl2.marca, p.tipo_mp, r.item_codigo`;
    db.query(sql, [parseInt(mes), parseInt(anio)], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// ============================================================
// CRUD TIPOS PREVENTIVO (tabla maestra de tipos de MP)
// ============================================================
app.get('/api/tipos-preventivo', (req, res) => {
    db.query(
        `SELECT id, nombre, descripcion, activo FROM tipos_preventivo WHERE activo=1 ORDER BY nombre`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: rows });
        }
    );
});

app.post('/api/tipos-preventivo', (req, res) => {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre es requerido' });
    db.query(
        `INSERT INTO tipos_preventivo (nombre, descripcion) VALUES (?, ?)`,
        [nombre.toUpperCase(), descripcion || null],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.put('/api/tipos-preventivo/:id', (req, res) => {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre es requerido' });
    db.query(
        `UPDATE tipos_preventivo SET nombre=?, descripcion=? WHERE id=?`,
        [nombre.toUpperCase(), descripcion || null, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/tipos-preventivo/:id', (req, res) => {
    db.query(`DELETE FROM tipos_preventivo WHERE id=?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// Sync: importa tipos distintos de tipos_mantenimiento hacia tipos_preventivo
app.post('/api/tipos-preventivo/sync-desde-frecuencias', (req, res) => {
    db.query(
        `INSERT IGNORE INTO tipos_preventivo (nombre)
         SELECT DISTINCT UPPER(TRIM(tipo_mp)) FROM tipos_mantenimiento
         WHERE tipo_mp IS NOT NULL AND TRIM(tipo_mp) != ''`,
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, insertados: result.affectedRows });
        }
    );
});

// ============================================================
// HISTÓRICO KM GPS — Snapshots diarios por placa
// ============================================================

// Últimos N días de snapshots + km/día promedio
app.get('/api/km-historico/:placa', (req, res) => {
    const placa = (req.params.placa || '').toUpperCase().trim();
    const dias  = Math.min(parseInt(req.query.dias) || 30, 90);
    if (!placa) return res.status(400).json({ error: 'Placa requerida' });

    db.query(
        `SELECT fecha, km_gps, horas_motor
         FROM km_snapshots
         WHERE placa = ?
           AND fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         ORDER BY fecha ASC`,
        [placa, dias],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows || rows.length < 2) return res.json({ data: rows || [], km_dia: null, horas_dia: null });

            // Calcular km/día promedio entre primer y último snapshot
            const primero = rows[0];
            const ultimo  = rows[rows.length - 1];
            const diasDiff = Math.max(1,
                (new Date(ultimo.fecha) - new Date(primero.fecha)) / (1000 * 60 * 60 * 24)
            );
            const km_dia    = ((ultimo.km_gps    - primero.km_gps)    / diasDiff).toFixed(0);
            const horas_dia = ((ultimo.horas_motor - primero.horas_motor) / diasDiff).toFixed(1);

            res.json({ data: rows, km_dia: Number(km_dia), horas_dia: Number(horas_dia), dias_muestra: diasDiff });
        }
    );
});

// Resumen general: km/día de todas las placas (últimos 30 días)
app.get('/api/km-historico', (req, res) => {
    db.query(
        `SELECT
            s1.placa,
            ROUND((MAX(s1.km_gps) - MIN(s1.km_gps)) / GREATEST(DATEDIFF(MAX(s1.fecha), MIN(s1.fecha)), 1), 0) AS km_dia,
            ROUND((MAX(s1.horas_motor) - MIN(s1.horas_motor)) / GREATEST(DATEDIFF(MAX(s1.fecha), MIN(s1.fecha)), 1), 1) AS horas_dia,
            COUNT(*) AS snapshots,
            MAX(s1.km_gps) AS km_actual,
            MAX(s1.fecha)  AS ultima_fecha
         FROM km_snapshots s1
         WHERE s1.fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         GROUP BY s1.placa
         HAVING snapshots >= 2
         ORDER BY s1.placa`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

// ============================================================
// CONFIG MÉTRICA POR PLACA (km vs horas motor)
// ============================================================
app.get('/api/config-metrica', (req, res) => {
    db.query(
        `SELECT placa, marca, metrica FROM placas ORDER BY placa`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

app.put('/api/config-metrica/:placa', (req, res) => {
    const { placa } = req.params;
    const metrica = (req.body.metrica || 'km').toLowerCase() === 'horas' ? 'horas' : 'km';
    db.query(
        `UPDATE placas SET metrica = ? WHERE placa = ?`,
        [metrica, placa],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (result.affectedRows === 0) return res.status(404).json({ error: 'Placa no encontrada' });
            res.json({ ok: true, placa, metrica });
        }
    );
});

// ============================================================
// CRUD TIPOS MANTENIMIENTO
// ============================================================
app.get('/api/tipos-mantenimiento', (req, res) => {
    const { marca, uts } = req.query;
    let sql = `SELECT id, marca, tipo_mp, uts, frecuencia_km, frecuencia_horas, frecuencia_dias,
                      tipo, sistema, descripcion
               FROM tipos_mantenimiento WHERE 1=1`;
    const params = [];
    if (marca) { sql += ' AND UPPER(marca)=?'; params.push(marca.toUpperCase()); }
    if (uts)   { sql += ' AND UPPER(uts)=?';   params.push(uts.toUpperCase()); }
    sql += ' ORDER BY marca, tipo_mp, uts';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.post('/api/tipos-mantenimiento', (req, res) => {
    const { marca, tipo_mp, uts, frecuencia_km, frecuencia_horas, frecuencia_dias, tipo, sistema, descripcion } = req.body;
    if (!marca || !tipo_mp) return res.status(400).json({ error: 'Marca y tipo_mp son requeridos' });
    db.query(
        `INSERT INTO tipos_mantenimiento (marca, tipo_mp, uts, frecuencia_km, frecuencia_horas, frecuencia_dias, tipo, sistema, descripcion)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [marca, tipo_mp, uts || '', frecuencia_km || null, frecuencia_horas || null, frecuencia_dias || null, tipo || '', sistema || '', descripcion || ''],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.put('/api/tipos-mantenimiento/:id', (req, res) => {
    const { id } = req.params;
    const { marca, tipo_mp, uts, frecuencia_km, frecuencia_horas, frecuencia_dias, tipo, sistema, descripcion } = req.body;
    db.query(
        `UPDATE tipos_mantenimiento SET marca=?, tipo_mp=?, uts=?, frecuencia_km=?,
         frecuencia_horas=?, frecuencia_dias=?, tipo=?, sistema=?, descripcion=? WHERE id=?`,
        [marca, tipo_mp, uts || '', frecuencia_km || null, frecuencia_horas || null, frecuencia_dias || null, tipo || '', sistema || '', descripcion || '', id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/tipos-mantenimiento/:id', (req, res) => {
    db.query('DELETE FROM tipos_mantenimiento WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// POST /api/tipos-mantenimiento/bulk-delete — eliminación masiva por IDs
app.post('/api/tipos-mantenimiento/bulk-delete', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length)
        return res.status(400).json({ error: 'Sin IDs' });
    const placeholders = ids.map(function(){ return '?'; }).join(',');
    db.query('DELETE FROM tipos_mantenimiento WHERE id IN (' + placeholders + ')', ids, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, eliminados: result.affectedRows });
    });
});

// POST /api/tipos-mantenimiento/importar — importación masiva (upsert por marca+tipo_mp+uts)
app.post('/api/tipos-mantenimiento/importar', async (req, res) => {
    const { registros } = req.body;
    if (!Array.isArray(registros) || !registros.length)
        return res.status(400).json({ error: 'Sin registros' });

    let insertados = 0, actualizados = 0;
    try {
        for (const r of registros) {
            const marca   = (r.marca   || '').toUpperCase().trim();
            const tipo_mp = (r.tipo_mp || '').toUpperCase().trim();
            const uts     = (r.uts     || 'LOCAL').toUpperCase().trim();
            if (!marca || !tipo_mp) continue;

            const [existing] = await db.promise().query(
                'SELECT id FROM tipos_mantenimiento WHERE UPPER(marca)=? AND UPPER(tipo_mp)=? AND UPPER(uts)=? LIMIT 1',
                [marca, tipo_mp, uts]
            );
            if (existing.length) {
                await db.promise().query(
                    `UPDATE tipos_mantenimiento SET
                        frecuencia_km=?, frecuencia_horas=?, frecuencia_dias=?,
                        tipo=?, sistema=?, descripcion=?
                     WHERE id=?`,
                    [r.frecuencia_km||null, r.frecuencia_horas||null, r.frecuencia_dias||null,
                     r.tipo||null, r.sistema||null, r.descripcion||null, existing[0].id]
                );
                actualizados++;
            } else {
                await db.promise().query(
                    `INSERT INTO tipos_mantenimiento
                        (marca, tipo_mp, uts, frecuencia_km, frecuencia_horas, frecuencia_dias, tipo, sistema, descripcion)
                     VALUES (?,?,?,?,?,?,?,?,?)`,
                    [marca, tipo_mp, uts, r.frecuencia_km||null, r.frecuencia_horas||null, r.frecuencia_dias||null,
                     r.tipo||null, r.sistema||null, r.descripcion||null]
                );
                insertados++;
            }
        }
        res.json({ ok: true, insertados, actualizados });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// CRUD DESTINATARIOS ALERTAS
// ============================================================
app.get('/api/destinatarios-alertas', (req, res) => {
    db.query('SELECT * FROM destinatarios_alertas ORDER BY nombre', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.post('/api/destinatarios-alertas', (req, res) => {
    const { nombre, correo, cargo, notif_1d, notif_3d, notif_7d, notif_completada } = req.body;
    if (!nombre || !correo) return res.status(400).json({ error: 'Nombre y correo son requeridos' });
    db.query(
        `INSERT INTO destinatarios_alertas (nombre, correo, cargo, notif_1d, notif_3d, notif_7d, notif_completada)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), cargo=VALUES(cargo),
         notif_1d=VALUES(notif_1d), notif_3d=VALUES(notif_3d),
         notif_7d=VALUES(notif_7d), notif_completada=VALUES(notif_completada), activo=1`,
        [nombre, correo.trim().toLowerCase(), cargo || null,
         notif_1d ? 1 : 0, notif_3d ? 1 : 0, notif_7d ? 1 : 0, notif_completada ? 1 : 0],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.put('/api/destinatarios-alertas/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, correo, cargo, notif_1d, notif_3d, notif_7d, notif_completada, activo } = req.body;
    db.query(
        `UPDATE destinatarios_alertas SET nombre=?, correo=?, cargo=?,
         notif_1d=?, notif_3d=?, notif_7d=?, notif_completada=?, activo=?
         WHERE id=?`,
        [nombre, correo?.trim().toLowerCase(), cargo || null,
         notif_1d ? 1 : 0, notif_3d ? 1 : 0, notif_7d ? 1 : 0,
         notif_completada ? 1 : 0, activo !== undefined ? (activo ? 1 : 0) : 1, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/destinatarios-alertas/:id', (req, res) => {
    db.query('DELETE FROM destinatarios_alertas WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// Disparo manual de alertas (para probar o forzar envío)
app.post('/api/dispararAlertas', async (req, res) => {
    try {
        await verificarAlertasRetraso();
        res.json({ ok: true, msg: 'Verificación ejecutada' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Test de email (envía a un correo de prueba)
app.post('/api/testEmail', async (req, res) => {
    const { correo } = req.body;
    if (!correo) return res.status(400).json({ error: 'Correo requerido' });
    try {
        await enviarEmailAlerta(
            correo,
            '✅ Test Azkell Fleet — Email configurado correctamente',
            `<div style="font-family:Arial,sans-serif">
             <h2 style="color:#10b981;">✅ Configuración de email correcta</h2>
             <p>Este es un correo de prueba del sistema <strong>Azkell Fleet</strong>.</p>
             <p>Las alertas de mantenimiento llegarán a esta bandeja.</p>
             <p style="color:#64748b; font-size:12px;">— Sistema Azkell Fleet</p>
             </div>`
        );
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// CRUD CONFIGURACION FLOTA (ya tiene GET y PUT, falta DELETE y POST)
// ============================================================
app.post('/api/configuracion-flota', (req, res) => {
    const { marca, uts_categoria, km_mensuales, dias_operativos,
            mp1_intervalo_km, mp2_intervalo_km, mp3_intervalo_km, observaciones } = req.body;
    if (!marca || !uts_categoria) return res.status(400).json({ error: 'Marca y UTS son requeridos' });
    db.query(
        `INSERT INTO configuracion_flota
         (marca, uts_categoria, km_mensuales, dias_operativos, mp1_intervalo_km, mp2_intervalo_km, mp3_intervalo_km, observaciones)
         VALUES (?,?,?,?,?,?,?,?)`,
        [marca.toUpperCase(), uts_categoria.toUpperCase(),
         km_mensuales || 0, dias_operativos || 26,
         mp1_intervalo_km || 5000, mp2_intervalo_km || 10000, mp3_intervalo_km || 20000,
         observaciones || null],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/configuracion-flota/:id', (req, res) => {
    db.query('DELETE FROM configuracion_flota WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// ============================================================
// CRUD MANTENIMIENTO KITS (ya tiene GET, falta POST/PUT/DELETE)
// ============================================================
app.post('/api/mantenimiento-kits', (req, res) => {
    const { marca_vehiculo, tipo_mp, nombre_kit, item_codigo, item_nombre,
            cantidad, unidad_medida, costo_unitario, costo_total, orden } = req.body;
    if (!marca_vehiculo || !tipo_mp || !item_nombre)
        return res.status(400).json({ error: 'Marca, tipo_mp e item_nombre son requeridos' });
    db.query(
        `INSERT INTO mantenimiento_kits
         (marca_vehiculo, tipo_mp, nombre_kit, item_codigo, item_nombre,
          cantidad, unidad_medida, costo_unitario, costo_total, orden)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [marca_vehiculo.toUpperCase(), tipo_mp, nombre_kit || null,
         item_codigo || null, item_nombre,
         cantidad || 1, unidad_medida || 'UND',
         costo_unitario || 0, costo_total || 0, orden || 1],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.put('/api/mantenimiento-kits/:id', (req, res) => {
    const { id } = req.params;
    const { nombre_kit, item_codigo, item_nombre, cantidad,
            unidad_medida, costo_unitario, costo_total, orden, activo } = req.body;
    db.query(
        `UPDATE mantenimiento_kits
         SET nombre_kit=?, item_codigo=?, item_nombre=?, cantidad=?,
             unidad_medida=?, costo_unitario=?, costo_total=?, orden=?, activo=?
         WHERE id=?`,
        [nombre_kit || null, item_codigo || null, item_nombre,
         cantidad || 1, unidad_medida || 'UND',
         costo_unitario || 0, costo_total || 0, orden || 1,
         activo !== undefined ? (activo ? 1 : 0) : 1, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/mantenimiento-kits/:id', (req, res) => {
    db.query('DELETE FROM mantenimiento_kits WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

// POST /api/mantenimiento-kits/importarMasivo
app.post('/api/mantenimiento-kits/importarMasivo', (req, res) => {
    const items = req.body.items;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Sin datos' });
    let insertados = 0, errores = 0;
    const done = () => { if (insertados + errores === items.length) res.json({ insertados, errores }); };
    items.forEach(function(k) {
        const costo_total = (parseFloat(k.cantidad)||0) * (parseFloat(k.costo_unitario)||0);
        db.query(
            `INSERT INTO mantenimiento_kits (marca_vehiculo, tipo_mp, nombre_kit, item_nombre, cantidad, unidad_medida, costo_unitario, costo_total)
             VALUES (?,?,?,?,?,?,?,?)`,
            [k.marca_vehiculo||'', k.tipo_mp||'', k.nombre_kit||'', k.item_nombre||'',
             parseFloat(k.cantidad)||0, k.unidad_medida||'', parseFloat(k.costo_unitario)||0, costo_total],
            (err) => { if (err) errores++; else insertados++; done(); }
        );
    });
});


// ============================================================
router.put('/requerimientos-planificacion/:id', (req, res) => {
    const { id } = req.params;
    const { estado_req, fecha_solicitud, fecha_entrega, responsable_almacen, observaciones } = req.body;
    db.query(
        `UPDATE requerimientos_planificacion
         SET estado_req=?, fecha_solicitud=?, fecha_entrega=?,
             responsable_almacen=?, observaciones=?
         WHERE id=?`,
        [estado_req || 'Pendiente', fecha_solicitud || null, fecha_entrega || null,
         responsable_almacen || null, observaciones || null, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

router.delete('/requerimientos-planificacion/:id', (req, res) => {
    db.query('DELETE FROM requerimientos_planificacion WHERE id=?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});



    return router;
};
