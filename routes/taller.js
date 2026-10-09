const express = require('express');
const router = express.Router();

module.exports = (db, logAudit, _generarCodigoAlmacen) => {
    function _calcularTotalPen(items, tc) {
        return items.reduce((sum, item) => {
            const cant = parseFloat(item.cantidad) || 0;
            const costo = parseFloat(item.costo_unitario) || 0;
            let importe = cant * costo;
            if (item.moneda === 'USD' && tc) importe *= parseFloat(tc);
            return sum + importe;
        }, 0);
    }


    // ============================================================
    // MÓDULO: ÓRDENES DE MANTENIMIENTO (OT)
    // Tablas: ordenes_trabajo, trabajos_ot, ot_materiales, ot_backlog
    // ============================================================

    // ── Migración: columnas de detalle de trabajo en trabajos_ot ──────────────
    [
        'trabajo_realizado TEXT NULL',
        'tecnico VARCHAR(150) NULL DEFAULT \'\'',
        'fecha_trabajo DATETIME NULL',
        'fecha_salida DATETIME NULL',
        'costo DECIMAL(10,2) NULL DEFAULT 0',
        'placa VARCHAR(50) NULL'
    ].forEach(function (colDef) {
        var colName = colDef.split(' ')[0];
        db.query('ALTER TABLE trabajos_ot ADD COLUMN ' + colDef, function (e) {
            if (!e || e.code === 'ER_DUP_FIELDNAME') console.log('✅ trabajos_ot.' + colName + ' verificada');
            else console.warn('ALTER trabajos_ot.' + colName + ':', e.message);
        });
    });

    // ── Migración: agregar id_ot a inspecciones ──────────────
    db.query('ALTER TABLE inspecciones ADD COLUMN id_ot VARCHAR(50) NULL', function (e) {
        if (!e || e.code === 'ER_DUP_FIELDNAME') console.log('✅ inspecciones.id_ot verificada');
        else console.warn('ALTER inspecciones.id_ot:', e.message);
    });
    // ── Helper: sincronizar estado de reportes_fallas y liberar rampas según OTs vinculadas ─────
    function _sincronizarEstadoReportesFallas(targetDb) {
        if (!targetDb) return;
        const pool = targetDb;
        const FINISHED_STATUSES = ['finalizado', 'finalizada', 'cerrada', 'cerrado', 'completada', 'completado', 'terminada', 'terminado', 'anulado', 'anulada'];

        // 1. Sincronizar Reportes de Fallas
        pool.query("SELECT id, folio, ots_generadas_json, estado FROM reportes_fallas", (errRf, rowsRf) => {
            if (errRf || !rowsRf || !rowsRf.length) return;
            pool.query("SELECT ticket_entrada, id_ot, id_rampa, placa, estado, detalles_json FROM ordenes_trabajo", (errOt, rowsOt) => {
                if (errOt || !rowsOt) return;

                rowsRf.forEach(r => {
                    let otsArr = [];
                    try { otsArr = typeof r.ots_generadas_json === 'string' ? JSON.parse(r.ots_generadas_json) : (r.ots_generadas_json || []); } catch (e) { }
                    if (!Array.isArray(otsArr)) otsArr = [];

                    const otsVinculadas = (rowsOt || []).filter(o => {
                        let d = {};
                        try { d = typeof o.detalles_json === 'string' ? JSON.parse(o.detalles_json) : (o.detalles_json || {}); } catch (e) { }
                        const oId = String(o.ticket_entrada || o.id_ot || '').trim();
                        const isMatchOt = otsArr.some(otItem => String(otItem.idOt || otItem.ticket_entrada || '').trim() === oId);
                        const isMatchRep = (d.id_reporte_falla && String(d.id_reporte_falla) === String(r.id)) ||
                            (d.folio_reporte && String(d.folio_reporte) === String(r.folio));
                        return isMatchOt || isMatchRep;
                    });

                    if (otsVinculadas.length === 0) {
                        if (r.estado !== 'Pendiente') {
                            pool.query("UPDATE reportes_fallas SET estado = 'Pendiente' WHERE id = ?", [r.id]);
                        }
                    } else {
                        const todasFinalizadas = otsVinculadas.every(o => {
                            const st = String(o.estado || '').toLowerCase().trim();
                            return FINISHED_STATUSES.includes(st);
                        });

                        const nuevoEstado = todasFinalizadas ? 'Finalizado' : 'En Proceso';
                        if (r.estado !== nuevoEstado) {
                            pool.query("UPDATE reportes_fallas SET estado = ? WHERE id = ?", [nuevoEstado, r.id]);
                        }
                    }
                });

                // 2. Sincronizar y Liberar Status Rampa si todas sus OTs están finalizadas/cerradas
                pool.query("SELECT id, rampa, placa, estado, situacion FROM taller_rampas WHERE estado != 'Liberado'", (errRampas, rowsRampas) => {
                    if (errRampas || !rowsRampas || !rowsRampas.length) return;

                    rowsRampas.forEach(rampa => {
                        const rId = rampa.id;
                        const rPlaca = String(rampa.placa || '').toUpperCase().trim();
                        if (!rPlaca && !rId) return;

                        // Buscar OTs asociadas a esta rampa o placa
                        const otsRampa = (rowsOt || []).filter(o => {
                            const oPlaca = String(o.placa || '').toUpperCase().trim();
                            const oRampaId = o.id_rampa;
                            return (oRampaId && String(oRampaId) === String(rId)) || (oPlaca && oPlaca === rPlaca);
                        });

                        // Si tiene OTs y TODAS están finalizadas/cerradas, liberar la rampa automáticamente
                        if (otsRampa.length > 0) {
                            const todasOtsCerradas = otsRampa.every(o => {
                                const st = String(o.estado || '').toLowerCase().trim();
                                return FINISHED_STATUSES.includes(st);
                            });

                            if (todasOtsCerradas) {
                                pool.query(
                                    `UPDATE taller_rampas SET 
                                        estado = 'Liberado', 
                                        situacion = 'Liberado', 
                                        fecha_salida_real = COALESCE(fecha_salida_real, CURDATE()), 
                                        hora_salida_real = COALESCE(hora_salida_real, CURTIME()), 
                                        fecha_liberado = COALESCE(fecha_liberado, NOW()) 
                                     WHERE id = ?`,
                                    [rId],
                                    (errUpRampa) => {
                                        if (!errUpRampa) {
                                            console.log(`🚗 Status Rampa: Rampa #${rampa.rampa} (ID: ${rId}, Placa: ${rPlaca}) LIBERADA automáticamente por cierre de todas sus OTs.`);
                                        }
                                    }
                                );
                            }
                        }
                    });
                });
            });
        });
    }

    // ── Helper: genera ID secuencial por año  (ej. OT-2026-0001) ─────
    // Solo busca IDs con sufijo de exactamente 4 dígitos (nuevo formato),
    // ignorando los IDs legacy con sufijos largos.
    function generarId(tabla, columna, prefijo, anio, cb) {
        const regex = `^${prefijo}-${anio}-[0-9]{4}$`;
        db.query(`SELECT MAX(${columna}) AS ultimo FROM ${tabla} WHERE ${columna} REGEXP ?`, [regex], (err, rows) => {
            if (err || !rows.length || !rows[0].ultimo) return cb(`${prefijo}-${anio}-0001`);
            const parts = String(rows[0].ultimo).split('-');
            const num = parseInt(parts[parts.length - 1], 10) || 0;
            cb(`${prefijo}-${anio}-${String(num + 1).padStart(4, '0')}`);
        });
    }

    // ── ORDENES DE TRABAJO ────────────────────────────────────────────
    router.get('/ordenes-trabajo', (req, res) => {
        const targetDb = req.db || db;
        const sql = `
        SELECT o.*,
            r.rampa AS rampa_origen,
            ROUND(
                COALESCE((
                    SELECT SUM(s.total_pen) 
                    FROM salidas_inv s 
                    WHERE (s.ticket_ot = o.ticket_entrada OR s.ticket_ot = o.id_ot) 
                      AND s.estado != 'Anulado'
                ), 0) +
                COALESCE((
                    SELECT SUM(COALESCE(t.costo, 0) + COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.detalles_json, '$.costo')) AS DECIMAL(10,2)), 0))
                    FROM trabajos_ot t 
                    WHERE (t.ticket_visita = o.ticket_entrada OR t.ticket_visita = o.id_ot)
                ), 0) +
                COALESCE((
                    SELECT SUM(e.total_pen)
                    FROM entradas_inv e
                    WHERE (e.ot_id = o.ticket_entrada OR e.ot_id = o.id_ot)
                      AND LOWER(e.tipo_orden) = 'orden de servicio'
                      AND e.estado NOT IN ('Anulado', 'Anulada')
                ), 0) +
                COALESCE((
                    SELECT SUM(COALESCE(m.costo_total, m.cantidad * m.costo_unit, 0))
                    FROM ot_materiales m
                    WHERE (m.ticket_ot = o.ticket_entrada OR m.ticket_ot = o.id_ot)
                      AND m.estado != 'Anulado'
                ), 0) +
                COALESCE((
                    SELECT SUM(COALESCE(tr.total, tr.cantidad * tr.precio_unitario, 0))
                    FROM trabajos_ot_repuestos tr
                    WHERE (tr.id_ot = o.ticket_entrada OR tr.id_ot = o.id_ot)
                ), 0)
            , 2) AS costo_total
        FROM ordenes_trabajo o
        LEFT JOIN taller_rampas r ON r.id = o.id_rampa
        ORDER BY o.fecha_ingreso DESC`;
        targetDb.query(sql, (err, rows) => {
            if (err) {
                console.error('Error en /ordenes-trabajo:', err);
                targetDb.query("SELECT * FROM ordenes_trabajo ORDER BY fecha_ingreso DESC", (err2, rows2) => {
                    if (err2) return res.json([]);
                    return res.json(rows2 || []);
                });
                return;
            }
            res.json(rows || []);
        });
    });

    router.post('/ordenes-trabajo', (req, res) => {
        const { placa, estado, fecha_ingreso, creado_por, detalles_json, id_rampa } = req.body;
        if (!placa) return res.status(400).json({ error: 'placa es requerida' });
        const anio = new Date().getFullYear();
        const detJson = typeof detalles_json === 'string' ? detalles_json : JSON.stringify(detalles_json || {});
        generarId('ordenes_trabajo', 'id_ot', 'OT', anio, (nuevoId) => {
            const targetDb = req.db || db;
            targetDb.query(
                `INSERT INTO ordenes_trabajo (ticket_entrada, id_ot, placa, estado, detalles_json, creado_por, fecha_ingreso, id_rampa)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [nuevoId, nuevoId, placa.toUpperCase(), estado || 'Pendiente', detJson, creado_por || '', fecha_ingreso || new Date(), id_rampa || null],
                (err, result) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (typeof logAudit === 'function') {
                        logAudit(req, 'MANTENIMIENTO', 'Taller & OT', 'CREÓ', `Creó Orden de Trabajo ${nuevoId} para unidad ${placa.toUpperCase()}`);
                    }
                    _sincronizarEstadoReportesFallas(targetDb);
                    res.json({ ok: true, id: result.insertId, id_ot: nuevoId });
                }
            );
        });
    });

    router.put('/ordenes-trabajo/:id/fechas', (req, res) => {
        const ticketId = req.params.id;
        const { fecha_inicio_ot, fecha_hora_salida } = req.body;

        // Convert undefined to null for SQL
        const fInicio = fecha_inicio_ot ? fecha_inicio_ot : null;
        const fSalida = fecha_hora_salida ? fecha_hora_salida : null;
        const targetDb = req.db || db;

        targetDb.query(
            "UPDATE ordenes_trabajo SET fecha_inicio_ot=?, fecha_hora_salida=? WHERE ticket_entrada=?",
            [fInicio, fSalida, ticketId],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function') {
                    logAudit(req, 'MANTENIMIENTO', 'Taller & OT', 'MODIFICÓ', `Editó fechas de OT ${ticketId}`);
                }
                res.json({ ok: true });
            }
        );
    });

    router.put('/ordenes-trabajo/:id', (req, res) => {
        const ticketId = req.params.id;
        const { accion, estado, detalles_json, fecha_hora_salida, detalles_cierre, usuario } = req.body;
        const targetDb = req.db || db;

        if (accion === 'iniciar') {
            const { iniciado_por, fecha_inicio } = req.body;
            let q = "UPDATE ordenes_trabajo SET estado='En Proceso', fecha_inicio_ot=NOW(), iniciado_por=? WHERE ticket_entrada=?";
            let params = [iniciado_por || null, ticketId];

            if (fecha_inicio) {
                q = "UPDATE ordenes_trabajo SET estado='En Proceso', fecha_inicio_ot=?, iniciado_por=? WHERE ticket_entrada=?";
                params = [fecha_inicio, iniciado_por || null, ticketId];
            }

            targetDb.query(
                q,
                params,
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (typeof logAudit === 'function') {
                        logAudit(req, 'MANTENIMIENTO', 'Taller & OT', 'INICIÓ', `Inició trabajos de OT ${ticketId}`);
                    }
                    _sincronizarEstadoReportesFallas(targetDb);
                    res.json({ ok: true });
                }
            );
            return;
        }

        if (accion === 'pausar') {
            const { motivo, pausado_por } = req.body;
            if (!motivo || !motivo.trim()) return res.status(400).json({ error: 'El motivo de pausa es requerido' });
            targetDb.query('SELECT fecha_pausa1,fecha_pausa2,fecha_pausa3 FROM ordenes_trabajo WHERE ticket_entrada=?', [ticketId], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
                const r = rows[0];
                let slot = 0;
                if (!r.fecha_pausa1) slot = 1;
                else if (!r.fecha_pausa2) slot = 2;
                else if (!r.fecha_pausa3) slot = 3;
                else return res.status(400).json({ error: 'Límite de 3 pausas alcanzado' });
                targetDb.query(
                    `UPDATE ordenes_trabajo SET estado='Pausada', fecha_pausa${slot}=NOW(), motivo_pausa${slot}=?, pausado_por${slot}=? WHERE ticket_entrada=?`,
                    [motivo.trim(), pausado_por || null, ticketId],
                    (err2) => {
                        if (err2) return res.status(500).json({ error: err2.message });
                        if (typeof logAudit === 'function') {
                            logAudit(req, 'MANTENIMIENTO', 'Taller & OT', 'PAUSÓ', `Pausó OT ${ticketId} - Motivo: ${motivo.trim()}`);
                        }
                        res.json({ ok: true, slot });
                    }
                );
            });
            return;
        }

        if (accion === 'reanudar') {
            targetDb.query('SELECT fecha_pausa1,fecha_fin_pausa1,fecha_pausa2,fecha_fin_pausa2,fecha_pausa3,fecha_fin_pausa3 FROM ordenes_trabajo WHERE ticket_entrada=?', [ticketId], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
                const r = rows[0];
                let slot = 0;
                if (r.fecha_pausa1 && !r.fecha_fin_pausa1) slot = 1;
                else if (r.fecha_pausa2 && !r.fecha_fin_pausa2) slot = 2;
                else if (r.fecha_pausa3 && !r.fecha_fin_pausa3) slot = 3;
                else return res.status(400).json({ error: 'No hay pausa activa' });
                targetDb.query(
                    `UPDATE ordenes_trabajo SET estado='En Proceso', fecha_fin_pausa${slot}=NOW() WHERE ticket_entrada=?`,
                    [ticketId],
                    (err2) => {
                        if (err2) return res.status(500).json({ error: err2.message });
                        if (typeof logAudit === 'function') {
                            logAudit(req, 'MANTENIMIENTO', 'Taller & OT', 'REANUDÓ', `Reanudó trabajos de OT ${ticketId}`);
                        }
                        _sincronizarEstadoReportesFallas(targetDb);
                        res.json({ ok: true, slot });
                    }
                );
            });
            return;
        }

        if (accion === 'anular') {
            targetDb.query("UPDATE ordenes_trabajo SET estado = 'Anulado' WHERE ticket_entrada = ?", [ticketId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function') {
                    logAudit(req, 'MANTENIMIENTO', 'Taller & OT', 'CANCELÓ', `Anuló OT ${ticketId}`);
                }
                _sincronizarEstadoReportesFallas(targetDb);
                res.json({ ok: true });
            });
            return;
        }

        if (accion === 'reactivar') {
            targetDb.query("UPDATE ordenes_trabajo SET estado = 'En Proceso' WHERE ticket_entrada = ?", [ticketId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function') {
                    logAudit(req, 'MANTENIMIENTO', 'Taller & OT', 'REACTIVÓ', `Reactivó OT ${ticketId}`);
                }
                _sincronizarEstadoReportesFallas(targetDb);
                res.json({ ok: true });
            });
            return;
        }

        if (accion === 'aprobar') {
            targetDb.query('SELECT detalles_json FROM ordenes_trabajo WHERE ticket_entrada = ?', [ticketId], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
                const raw = rows[0].detalles_json;
                let det = {};
                try { det = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch (e) { det = {}; }
                det.aprobacion = 'Aprobada';
                targetDb.query('UPDATE ordenes_trabajo SET estado = \'Aprobada\', detalles_json = ? WHERE ticket_entrada = ?',
                    [JSON.stringify(det), ticketId], (err2) => {
                        if (err2) return res.status(500).json({ error: err2.message });
                        if (typeof logAudit === 'function') {
                            logAudit(req, 'MANTENIMIENTO', 'Taller & OT', 'APROBÓ', `Aprobó OT ${ticketId}`);
                        }
                        res.json({ ok: true });
                    }
                );
            });
            return;
        }

        if (accion === 'cerrar') {
            const { comentario_cierre, cerrado_por, motivos_checklist, km_actual } = req.body;
            targetDb.query('SELECT detalles_json, placa FROM ordenes_trabajo WHERE ticket_entrada = ?', [ticketId], async (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
                const raw = rows[0].detalles_json;
                const placaOT = (rows[0].placa || '').toUpperCase();
                let det = {};
                try { det = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch (e) { det = {}; }
                det.aprobacion = 'Cerrada';
                det.tecnico_cierre = (detalles_cierre || {}).tecnico_cierre || '';
                det.obs_cierre = (detalles_cierre || {}).obs_cierre || '';
                det.firma = (detalles_cierre || {}).firma || null;
                if (Array.isArray(motivos_checklist)) {
                    det.motivos_cierre_checklist = motivos_checklist;
                }
                const fhSalidaRaw = fecha_hora_salida ? new Date(fecha_hora_salida) : new Date();
                const fhSalida = fhSalidaRaw.toISOString().slice(0, 19).replace('T', ' ');

                // Procesar motivos_checklist -> Sincronizar Backlog
                if (Array.isArray(motivos_checklist) && motivos_checklist.length > 0) {
                    const anioBk = new Date().getFullYear();
                    const kmRegistrado = parseInt(km_actual) || parseInt(det.km) || 0;

                    for (const item of motivos_checklist) {
                        const textoMotivo = (item.texto || item.tarea || '').trim();
                        if (!textoMotivo) continue;

                        if (item.realizado === true) {
                            // Si se realizó y venía de un backlog existente, marcarlo como Realizado
                            if (item.backlog_id || item.id_backlog) {
                                const bId = item.backlog_id || item.id_backlog;
                                targetDb.query(
                                    "UPDATE ot_backlog SET estado = 'Realizado' WHERE id = ? OR backlog_id = ?",
                                    [bId, bId],
                                    (errBkUp) => {
                                        if (!errBkUp) console.log(`✅ Backlog ${bId} completado y cerrado por OT ${ticketId}`);
                                    }
                                );
                            }
                        } else {
                            // Si NO se realizó y NO viene de un backlog ya registrado como pendiente
                            if (!item.backlog_id && !item.id_backlog) {
                                generarId('ot_backlog', 'backlog_id', 'BK', anioBk, (nuevoBkId) => {
                                    targetDb.query(
                                        `INSERT INTO ot_backlog (backlog_id, placa, km, tema, tarea, reportado_por, fecha_reporte, estado, creado_por, ticket_ot)
                                     VALUES (?, ?, ?, 'Pendiente de OT', ?, ?, NOW(), 'Pendiente', ?, ?)`,
                                        [nuevoBkId, placaOT, kmRegistrado, textoMotivo, cerrado_por || 'Taller', cerrado_por || 'Sistema', ticketId],
                                        (errBkIns) => {
                                            if (!errBkIns) console.log(`📋 Auto-Backlog generado: ${nuevoBkId} para ${placaOT} (${textoMotivo})`);
                                        }
                                    );
                                });
                            }
                        }
                    }
                }

                targetDb.query(
                    'UPDATE ordenes_trabajo SET estado=?, detalles_json=?, fecha_hora_salida=?, comentario_cierre=?, cerrado_por=? WHERE ticket_entrada=?',
                    ['Finalizado', JSON.stringify(det), fhSalida,
                        comentario_cierre || (detalles_cierre || {}).obs_cierre || null,
                        cerrado_por || null, ticketId],
                    (err2) => {
                        if (err2) return res.status(500).json({ error: err2.message });
                        if (typeof logAudit === 'function') {
                            logAudit(req, 'MANTENIMIENTO', 'Taller & OT', 'FINALIZÓ', `Finalizó y cerró OT ${ticketId} para unidad ${placaOT}`);
                        }
                        _sincronizarEstadoReportesFallas(targetDb);
                        res.json({ ok: true });
                    }
                );
            });
            return;
        }

        if (accion === 'editar') {
            const { tipo_ot, sub_tipo, supervisor, situacion_inicial, motivo, km, tecnicos, trabajos_det } = req.body;
            targetDb.query('SELECT detalles_json, id_rampa, placa FROM ordenes_trabajo WHERE ticket_entrada = ?', [ticketId], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
                const raw = rows[0].detalles_json;
                const idRampa = rows[0].id_rampa;
                const placaOT = rows[0].placa;
                let det = {};
                try { det = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch (e) { det = {}; }
                if (tipo_ot !== undefined) det.tipo_ot = tipo_ot;
                if (sub_tipo !== undefined) det.sub_tipo = sub_tipo;
                if (supervisor !== undefined) det.supervisor = supervisor;
                if (situacion_inicial !== undefined) det.situacion_inicial = situacion_inicial;
                if (motivo !== undefined) det.motivo = motivo;
                if (km !== undefined) {
                    det.km = parseInt(km) || 0;
                    det.km_tablero = parseInt(km) || 0;
                }
                if (req.body.km_gps !== undefined) {
                    det.km_gps = parseInt(req.body.km_gps) || 0;
                }

                if (tecnicos !== undefined) {
                    const arrTec = Array.isArray(tecnicos) ? tecnicos.filter(Boolean) : (tecnicos ? [tecnicos] : []);
                    det.tecnicos = arrTec;
                    det.tecnicos_str = arrTec.join(', ');
                }
                if (trabajos_det !== undefined) {
                    det.trabajos_det = trabajos_det;
                }

                targetDb.query('UPDATE ordenes_trabajo SET detalles_json = ? WHERE ticket_entrada = ?',
                    [JSON.stringify(det), ticketId], (err2) => {
                        if (err2) return res.status(500).json({ error: err2.message });

                        if (Array.isArray(trabajos_det) && trabajos_det.length > 0) {
                            targetDb.query('DELETE FROM trabajos_ot WHERE ticket_visita = ? OR id_ot = ?', [ticketId, ticketId], () => {
                                const insVals = trabajos_det.map((td, idx) => [
                                    `${ticketId}-${idx + 1}`,
                                    ticketId,
                                    placaOT || '',
                                    td.desc || '',
                                    td.tecnico || '',
                                    'En Proceso'
                                ]);
                                if (insVals.length > 0) {
                                    targetDb.query('INSERT INTO trabajos_ot (id_ot, ticket_visita, placa, trabajo_realizado, tecnico, estado) VALUES ?', [insVals], () => { });
                                }
                            });
                        }

                        if (motivo !== undefined) {
                            if (idRampa) {
                                targetDb.query('UPDATE taller_rampas SET obs = ? WHERE id = ?', [motivo, idRampa]);
                            } else if (placaOT) {
                                targetDb.query('UPDATE taller_rampas SET obs = ? WHERE UPPER(placa) = UPPER(?) AND (situacion != "Finalizado" OR situacion IS NULL) ORDER BY id DESC LIMIT 1', [motivo, placaOT]);
                            }
                        }
                        if (typeof logAudit === 'function') {
                            logAudit(req, 'MANTENIMIENTO', 'Taller & OT', 'MODIFICÓ', `Editó datos de OT ${ticketId}`);
                        }
                        res.json({ ok: true });
                    }
                );
            });
            return;
        }

        // Edición general
        const sets = [];
        const params = [];
        if (estado) { sets.push('estado = ?'); params.push(estado); }
        if (detalles_json) { sets.push('detalles_json = ?'); params.push(JSON.stringify(detalles_json)); }
        if (fecha_hora_salida) { sets.push('fecha_hora_salida = ?'); params.push(new Date(fecha_hora_salida).toISOString().slice(0, 19).replace('T', ' ')); }
        if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
        params.push(ticketId);
        targetDb.query('UPDATE ordenes_trabajo SET ' + sets.join(', ') + ' WHERE ticket_entrada = ?', params, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (typeof logAudit === 'function') {
                logAudit(req, 'MANTENIMIENTO', 'Taller & OT', 'MODIFICÓ', `Actualizó estado a ${estado || 'actualizado'} en OT ${ticketId}`);
            }
            _sincronizarEstadoReportesFallas(targetDb);
            res.json({ ok: true });
        });
    });

    router.delete('/ordenes-trabajo/:id', (req, res) => {
        const ticketId = req.params.id;
        const targetDb = req.db || db;
        // Cascade: borrar trabajos, salidas de inv e inspecciones
        targetDb.query('DELETE FROM trabajos_ot WHERE ticket_visita = ?', [ticketId], (err1) => {
            targetDb.query('DELETE FROM salidas_inv WHERE ticket_ot = ?', [ticketId], (err2) => {
                targetDb.query('DELETE FROM inspecciones WHERE id_ot = ?', [ticketId], (err3) => {
                    targetDb.query('DELETE FROM ordenes_trabajo WHERE ticket_entrada = ? OR id_ot = ?', [ticketId, ticketId], (err4) => {
                        if (err4) return res.status(500).json({ error: err4.message });

                        // Desvincular OT eliminada de reportes_fallas
                        targetDb.query("SELECT id, ots_generadas_json FROM reportes_fallas WHERE ots_generadas_json IS NOT NULL", (errRf, rowsRf) => {
                            if (!errRf && rowsRf && rowsRf.length) {
                                rowsRf.forEach(rf => {
                                    try {
                                        let otsArr = JSON.parse(rf.ots_generadas_json || '[]');
                                        if (Array.isArray(otsArr) && otsArr.length) {
                                            const lenAntes = otsArr.length;
                                            otsArr = otsArr.filter(o => o.idOt !== ticketId && o.id_ot !== ticketId && o.ticket_entrada !== ticketId);
                                            if (otsArr.length !== lenAntes) {
                                                const nuevoEstado = otsArr.length === 0 ? 'Pendiente' : 'En Proceso';
                                                targetDb.query("UPDATE reportes_fallas SET ots_generadas_json = ?, estado = ? WHERE id = ?", [JSON.stringify(otsArr), nuevoEstado, rf.id]);
                                            }
                                        }
                                    } catch (e) { }
                                });
                            }
                        });

                        _sincronizarEstadoReportesFallas(targetDb);
                        if (typeof logAudit === 'function') {
                            logAudit(req, 'MANTENIMIENTO', 'Taller & OT', 'ELIMINÓ', `Eliminó Orden de Trabajo ${ticketId}`);
                        }
                        res.json({ ok: true });
                    });
                });
            });
        });
    });

    // ── OT TRABAJOS ───────────────────────────────────────────────────

    router.get('/inspecciones-por-ot', (req, res) => {
        const { id_ot } = req.query;
        if (!id_ot) return res.status(400).json({ error: 'id_ot requerido' });
        db.query('SELECT * FROM inspecciones WHERE id_ot = ? ORDER BY fecha_ingreso DESC', [id_ot], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    router.get('/ot-trabajos', (req, res) => {
        const tdb = req.db || db;
        const { id_ot } = req.query;
        let sql = `SELECT t.*, 
                      COALESCE(NULLIF(t.placa, ''), ot.placa, JSON_UNQUOTE(JSON_EXTRACT(t.detalles_json, '$.placa')), '') as placa, 
                      COALESCE(ot.id_ot, t.ticket_visita) as ot_id,
                      ot.detalles_json as ot_detalles_json 
               FROM trabajos_ot t 
               LEFT JOIN ordenes_trabajo ot 
                 ON (ot.ticket_entrada = t.ticket_visita OR ot.id_ot = t.ticket_visita)`;
        const params = [];
        if (id_ot) {
            sql += ' WHERE (t.ticket_visita = ? OR t.id_ot = ?)';
            params.push(id_ot, id_ot);
        }
        sql += ' ORDER BY COALESCE(t.fecha_trabajo, t.fecha_creacion) DESC, t.id_ot DESC';
        tdb.query(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    router.post('/ot-trabajos', (req, res) => {
        // ticket_visita del body = ticket_entrada de la OT (FK de asociación al OT)
        const { ticket_visita: ticketEntrada, trabajo_realizado, fecha_trabajo, fecha_salida, creado_por, detalles_json } = req.body;
        const anio = new Date().getFullYear();
        const detJson = typeof detalles_json === 'string' ? detalles_json : JSON.stringify(detalles_json || {});
        const personal = (typeof detalles_json === 'object' && detalles_json) ? (detalles_json.personal || '') : '';
        // Generar id_ot único (TR-YYYY-NNN); ticket_visita = FK al ticket_entrada del OT
        generarId('trabajos_ot', 'id_ot', 'TR', anio, (nuevoId) => {
            db.query(
                `INSERT INTO trabajos_ot (id_ot, ticket_visita, estado, trabajo_realizado, tecnico, fecha_trabajo, fecha_salida, creado_por, detalles_json)
             VALUES (?, ?, 'Pendiente', ?, ?, ?, ?, ?, ?)`,
                [nuevoId, ticketEntrada || '', trabajo_realizado || '', personal, fecha_trabajo || null, fecha_salida || null, creado_por || '', detJson],
                (err, result) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); }
                    res.json({ ok: true, id: result.insertId, id_ot: nuevoId, ticket_visita: ticketEntrada });
                }
            );
        });
    });

    router.post('/ot-trabajos/bulk-import', async (req, res) => {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'No se enviaron registros para importar.' });
        }

        const anio = new Date().getFullYear();
        let creados = 0;
        let errores = 0;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const ticketEntrada = item.ticket_visita || item.ot || item.id_ot || '';
            const placa = item.placa || item.vehiculo || '';
            const trabajoRealizado = item.trabajo_realizado || item.descripcion || '';
            const fechaTrabajo = item.fecha_trabajo || null;
            const fechaSalida = item.fecha_salida || null;
            const creadoPor = item.creado_por || (req.body && req.body.usuario) || 'Importación Masiva';

            let personal = item.personal || item.tecnico || '';
            let costo = parseFloat(item.costo || 0) || 0;
            let detObj = item.detalles_json ? (typeof item.detalles_json === 'object' ? item.detalles_json : JSON.parse(item.detalles_json)) : { personal, costo, placa };
            if (!detObj.personal) detObj.personal = personal;
            if (detObj.costo == null) detObj.costo = costo;
            if (!detObj.placa) detObj.placa = placa;

            const detJson = JSON.stringify(detObj);

            try {
                await new Promise((resolve, reject) => {
                    generarId('trabajos_ot', 'id_ot', 'TR', anio, (nuevoId) => {
                        db.query(
                            `INSERT INTO trabajos_ot (id_ot, ticket_visita, placa, estado, trabajo_realizado, tecnico, fecha_trabajo, fecha_salida, creado_por, detalles_json)
                         VALUES (?, ?, ?, 'Pendiente', ?, ?, ?, ?, ?, ?)`,
                            [nuevoId, ticketEntrada, placa, trabajoRealizado, personal, fechaTrabajo, fechaSalida, creadoPor, detJson],
                            (err, result) => {
                                if (err) reject(err);
                                else resolve(result);
                            }
                        );
                    });
                });
                creados++;
            } catch (e) {
                console.error('Error insertando trabajo masivo:', e);
                errores++;
            }
        }

        res.json({ ok: true, creados, errores, total: items.length });
    });

    router.put('/ot-trabajos/:id', (req, res) => {
        const idTrabajo = req.params.id;
        const { accion } = req.body;
        if (accion === 'aprobar') {
            db.query("UPDATE trabajos_ot SET estado = 'Aprobado' WHERE id_ot = ?", [idTrabajo], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            });
            return;
        }
        if (accion === 'editar') {
            const { trabajo_realizado, fecha_trabajo, fecha_salida, personal, costo, estado } = req.body;
            const detJson = JSON.stringify({ personal: personal || '', costo: parseFloat(costo) || 0 });
            // Fallback: registros viejos pueden tener id_ot vacío → usar ticket_visita
            db.query(
                `UPDATE trabajos_ot SET trabajo_realizado=?, tecnico=?, fecha_trabajo=?, fecha_salida=?, detalles_json=?, estado=?
             WHERE (id_ot = ? AND id_ot != '') OR (id_ot = '' AND ticket_visita = ?)`,
                [trabajo_realizado || '', personal || '', fecha_trabajo || null, fecha_salida || null, detJson, estado || 'Pendiente', idTrabajo, idTrabajo],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
                }
            );
            return;
        }
        res.status(400).json({ error: 'Acción desconocida' });
    });

    router.delete('/ot-trabajos/limpiar-importados', (req, res) => {
        db.query(
            "DELETE FROM trabajos_ot WHERE creado_por = 'Importación Masiva'",
            (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true, eliminados: result.affectedRows });
            }
        );
    });

    router.delete('/ot-trabajos/:id', (req, res) => {
        const id = req.params.id;
        // Fallback: registros viejos pueden tener id_ot vacío → usar ticket_visita como ID
        db.query(
            'DELETE FROM trabajos_ot WHERE (id_ot = ? AND id_ot != \'\') OR (id_ot = \'\' AND ticket_visita = ?)',
            [id, id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            }
        );
    });

    // ── OT MATERIALES ─────────────────────────────────────────────────
    router.get('/ot-materiales', (req, res) => {
        const { ticket_ot } = req.query;
        const targetDb = req.db || db;
        let sql = `SELECT s.* FROM salidas_inv s WHERE s.ticket_ot IS NOT NULL`;
        const params = [];
        if (ticket_ot) { sql += ' AND s.ticket_ot = ?'; params.push(ticket_ot); }
        sql += ' ORDER BY s.id DESC';
        targetDb.query(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const salidaIds = (rows || []).map(r => r.id);
            if (!salidaIds.length) return res.json([]);

            targetDb.query('SELECT * FROM detalle_salidas_inv WHERE salida_id IN (?) ORDER BY id ASC', [salidaIds], (errItems, itemRows) => {
                const itemsMap = {};
                (itemRows || []).forEach(d => {
                    if (!itemsMap[d.salida_id]) itemsMap[d.salida_id] = [];
                    itemsMap[d.salida_id].push({
                        id: d.id,
                        inventario_id: d.inventario_id || null,
                        descripcion: d.descripcion || '',
                        cantidad: parseFloat(d.cantidad) || 0,
                        costo_unitario: parseFloat(d.costo_unitario) || 0,
                        moneda: d.moneda || 'PEN',
                        importe: parseFloat(d.importe) || ((parseFloat(d.cantidad) || 0) * (parseFloat(d.costo_unitario) || 0))
                    });
                });
                rows.forEach(r => {
                    r.items = itemsMap[r.id] || [];
                });
                res.json(rows);
            });
        });
    });

    router.post('/ot-materiales', (req, res) => {
        const { ticket_ot, tipo_destino, placa, responsable, responsable_id, moneda, tipo_cambio, observaciones, creado_por, items } = req.body;
        if (!ticket_ot) return res.status(400).json({ error: 'ticket_ot es requerido' });
        const fecha = new Date().toISOString().split('T')[0];
        const anio = new Date().getFullYear();
        const tc = parseFloat(tipo_cambio) || 1;
        _generarCodigoAlmacen('SA', anio, (err, id) => {
            if (err) return res.status(500).json({ error: String(err) });
            const total_pen = _calcularTotalPen(items || [], tc);
            const solicitanteVal = creado_por || req.body.usuario || req.body.solicitante || (req.user && req.user.nombre) || null;
            db.query(
                'INSERT INTO salidas_inv (id,fecha,tipo_destino,placa,responsable,responsable_id,moneda,tipo_cambio,total_pen,observaciones,creado_por,ticket_ot,estado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [id, fecha, tipo_destino || 'Vehiculo', placa || null, responsable || null, responsable_id || null,
                    moneda || 'PEN', tc, total_pen, observaciones || null, solicitanteVal, ticket_ot, 'Pendiente'],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    if (!items || !items.length) { if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json({ ok: true, id }); }
                    // Resolver inventario_id por descripción para items que no lo traen
                    const descsParaResolver = items
                        .filter(d => !d.inventario_id && d.descripcion)
                        .map(d => d.descripcion);
                    const resolver = (cb) => {
                        if (!descsParaResolver.length) return cb({});
                        db.query(
                            'SELECT id, descripcion FROM inventario WHERE descripcion IN (?) AND activo = 1',
                            [descsParaResolver],
                            (e, rows) => {
                                const mapa = {};
                                if (!e && rows) rows.forEach(r => { mapa[r.descripcion] = r.id; });
                                cb(mapa);
                            }
                        );
                    };
                    resolver((mapaInv) => {
                        const dVals = items.map(d => {
                            const invId = d.inventario_id || mapaInv[d.descripcion] || null;
                            return [id, invId, d.descripcion || null,
                                parseFloat(d.cantidad) || 0, parseFloat(d.costo_unitario) || 0,
                                d.moneda || moneda || 'PEN',
                                parseFloat(d.importe) || ((parseFloat(d.cantidad) || 0) * (parseFloat(d.costo_unitario) || 0))];
                        });
                        db.query('INSERT INTO detalle_salidas_inv (salida_id,inventario_id,descripcion,cantidad,costo_unitario,moneda,importe) VALUES ?', [dVals], () => { });
                        if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id });
                    });
                }
            );
        });
    });

    router.put('/ot-materiales/:id', (req, res) => {
        const id = req.params.id;
        const { accion, motivo } = req.body;
        const targetDb = req.db || db;
        if (accion === 'despachar') {
            const sqlStockCheck = `
                SELECT d.id AS detalle_id, d.descripcion, d.cantidad, d.costo_unitario, d.moneda, d.importe, d.inventario_id,
                       i.id AS inv_id, i.descripcion AS inv_desc,
                       ROUND(COALESCE(i.stock_regularizado, 0) 
                         + COALESCE(ent.total_entradas, 0) 
                         + COALESCE(rec.total_recepciones, 0) 
                         - COALESCE(sal.total_salidas, 0), 4) AS stock_actual
                FROM detalle_salidas_inv d
                LEFT JOIN inventario i ON (i.id = d.inventario_id OR i.descripcion = d.descripcion OR LEFT(d.descripcion, CHAR_LENGTH(i.id)) = i.id) AND i.activo = 1
                LEFT JOIN (
                    SELECT de.inventario_id, SUM(de.cantidad) AS total_entradas 
                    FROM detalle_entradas_inv de
                    JOIN entradas_inv e ON e.id = de.entrada_id
                    JOIN inventario inv ON inv.id = de.inventario_id
                    WHERE (inv.fecha_regularizacion IS NULL OR COALESCE(e.created_at, e.fecha) > inv.fecha_regularizacion)
                      AND (e.estado IS NULL OR e.estado != 'Anulado')
                      AND (e.tipo_orden = 'Entrada directa' OR e.tipo_orden = 'Ajuste')
                    GROUP BY de.inventario_id
                ) ent ON ent.inventario_id = i.id
                LEFT JOIN (
                    SELECT dr.inventario_id, SUM(dr.cantidad_recibida) AS total_recepciones
                    FROM detalle_recepciones_oc dr
                    JOIN recepciones_oc r ON r.id = dr.recepcion_id
                    JOIN entradas_inv e ON e.id = r.oc_id
                    JOIN inventario inv ON inv.id = dr.inventario_id
                    WHERE (e.estado IS NULL OR (e.estado != 'Anulado' AND LOWER(e.estado) NOT LIKE '%anul%' AND LOWER(e.estado) NOT LIKE '%rechaz%'))
                      AND (inv.fecha_regularizacion IS NULL OR COALESCE(r.created_at, r.fecha_recepcion) > inv.fecha_regularizacion)
                    GROUP BY dr.inventario_id
                ) rec ON rec.inventario_id = i.id
                LEFT JOIN (
                    SELECT ds.inventario_id, SUM(ds.cantidad) AS total_salidas
                    FROM detalle_salidas_inv ds
                    JOIN salidas_inv s2 ON s2.id = ds.salida_id
                    JOIN inventario inv ON inv.id = ds.inventario_id
                    WHERE s2.estado = 'Despachado'
                      AND (inv.fecha_regularizacion IS NULL OR COALESCE(s2.created_at, s2.fecha) > inv.fecha_regularizacion)
                    GROUP BY ds.inventario_id
                ) sal ON sal.inventario_id = i.id
                WHERE d.salida_id = ?
            `;
            targetDb.query(sqlStockCheck, [id], (errStk, rowsStk) => {
                if (errStk) return res.status(500).json({ error: errStk.message });

                const sinStock = [];
                (rowsStk || []).forEach(it => {
                    const stockDisp = parseFloat(it.stock_actual != null ? it.stock_actual : 0);
                    const cantReq = parseFloat(it.cantidad || 0);
                    if (cantReq > stockDisp) {
                        sinStock.push(`"${it.descripcion || it.inv_desc}" (Requerido: ${cantReq}, Disponible: ${stockDisp <= 0 ? 0 : stockDisp})`);
                    }
                });

                if (sinStock.length > 0) {
                    return res.status(400).json({
                        error: `No se puede despachar la salida porque no cuenta con stock suficiente en almacén:\n• ${sinStock.join('\n• ')}`
                    });
                }

                targetDb.query("UPDATE salidas_inv SET estado = 'Despachado' WHERE id = ?", [id], (err, result) => {
                    if (err) {
                        console.error('Error despachando:', err.message);
                        return res.status(500).json({ error: err.message });
                    }
                    // Resolver inventario_id nulos: por descripción exacta O prefijo "INV-XXX — ..."
                    targetDb.query(
                        `UPDATE detalle_salidas_inv d
                     INNER JOIN inventario i ON (i.descripcion = d.descripcion OR LEFT(d.descripcion, CHAR_LENGTH(i.id)) = i.id) AND i.activo = 1
                     SET d.inventario_id = i.id
                     WHERE d.salida_id = ? AND (d.inventario_id IS NULL OR d.inventario_id = '')`,
                        [id], () => { }
                    );
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
                });
            });
        } else if (accion === 'editar') {
            const { items, moneda, tipo_cambio } = req.body;
            if (!Array.isArray(items) || !items.length) {
                return res.status(400).json({ error: 'Se requiere al menos un artículo' });
            }
            const tc = parseFloat(tipo_cambio) || 1;
            const total_pen = items.reduce((acc, it) => acc + ((parseFloat(it.importe) || (parseFloat(it.cantidad || 0) * parseFloat(it.costo_unitario || 0)))), 0);

            targetDb.query('UPDATE salidas_inv SET total_pen = ? WHERE id = ?', [total_pen, id], (errUpd) => {
                if (errUpd) return res.status(500).json({ error: errUpd.message });

                targetDb.query('DELETE FROM detalle_salidas_inv WHERE salida_id = ?', [id], (errDel) => {
                    if (errDel) return res.status(500).json({ error: errDel.message });

                    const dVals = items.map(d => {
                        const cant = parseFloat(d.cantidad) || 0;
                        const cu = parseFloat(d.costo_unitario) || 0;
                        const imp = parseFloat(d.importe) || (cant * cu);
                        return [
                            id,
                            d.inventario_id || null,
                            d.descripcion || null,
                            cant,
                            cu,
                            d.moneda || moneda || 'PEN',
                            imp
                        ];
                    });

                    targetDb.query('INSERT INTO detalle_salidas_inv (salida_id, inventario_id, descripcion, cantidad, costo_unitario, moneda, importe) VALUES ?', [dVals], (errIns) => {
                        if (errIns) return res.status(500).json({ error: errIns.message });
                        if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { 
                            logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'MODIFICÓ', req.path); 
                        }
                        res.json({ ok: true, id, total_pen });
                    });
                });
            });
        } else if (accion === 'anular') {
            if (!motivo || !String(motivo).trim()) return res.status(400).json({ error: 'Motivo requerido' });
            targetDb.query('UPDATE salidas_inv SET estado=?, motivo_anulacion=? WHERE id=?',
                ['Anulado', String(motivo).trim(), id], (err, result) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (!result.affectedRows) return res.status(404).json({ error: 'No encontrado' });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
                });
        } else {
            res.status(400).json({ error: 'Acción desconocida: ' + (accion || 'no especificada') });
        }
    });

    router.delete('/ot-materiales/:id', (req, res) => {
        const id = req.params.id;
        const targetDb = req.db || db;
        targetDb.query('DELETE FROM detalle_salidas_inv WHERE salida_id = ?', [id], () => {
            targetDb.query('DELETE FROM salidas_inv WHERE id = ?', [id], (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            });
        });
    });

    // ── OT BACKLOG ────────────────────────────────────────────────────
    router.get('/ot-backlog', (req, res) => {
        const { placa, estado } = req.query;
        let sql = 'SELECT * FROM ot_backlog';
        const conds = [], params = [];
        if (placa) { conds.push('placa = ?'); params.push(placa.toUpperCase()); }
        if (estado) { conds.push('estado = ?'); params.push(estado); }
        if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
        sql += ' ORDER BY creado_en DESC';
        db.query(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    router.post('/ot-backlog', (req, res) => {
        const { placa, km, tema, tarea, reportado_por, fecha_reporte, estado, creado_por, ticket_ot } = req.body;
        if (!placa || !tarea) return res.status(400).json({ error: 'placa y tarea son requeridos' });
        const anio = new Date().getFullYear();
        generarId('ot_backlog', 'backlog_id', 'BK', anio, (nuevoId) => {
            db.query(
                `INSERT INTO ot_backlog (backlog_id, placa, km, tema, tarea, reportado_por, fecha_reporte, estado, creado_por, ticket_ot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [nuevoId, placa.toUpperCase(), km || 0, tema || '', tarea, reportado_por || '', fecha_reporte || null, estado || 'Pendiente', creado_por || '', ticket_ot || null],
                (err, result) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id: result.insertId, backlog_id: nuevoId });
                }
            );
        });
    });

    router.put('/ot-backlog/:id', (req, res) => {
        const { estado, placa, km, tema, tarea, reportado_por, ticket_ot } = req.body;
        // Modo edición completa
        if (placa !== undefined || tarea !== undefined) {
            if (!tarea || !placa) return res.status(400).json({ error: 'placa y tarea son requeridos' });
            const fields = [];
            const vals = [];
            if (placa !== undefined) { fields.push('placa = ?'); vals.push(String(placa).toUpperCase()); }
            if (km !== undefined) { fields.push('km = ?'); vals.push(km || 0); }
            if (tema !== undefined) { fields.push('tema = ?'); vals.push(tema || ''); }
            if (tarea !== undefined) { fields.push('tarea = ?'); vals.push(tarea); }
            if (reportado_por !== undefined) { fields.push('reportado_por = ?'); vals.push(reportado_por || ''); }
            if (ticket_ot !== undefined) { fields.push('ticket_ot = ?'); vals.push(ticket_ot || null); }
            if (estado !== undefined) { fields.push('estado = ?'); vals.push(estado); }
            vals.push(req.params.id);
            db.query('UPDATE ot_backlog SET ' + fields.join(', ') + ' WHERE id = ?', vals, (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            });
        } else {
            // Modo cambio de estado simple
            if (!estado) return res.status(400).json({ error: 'estado requerido' });
            db.query('UPDATE ot_backlog SET estado = ? WHERE id = ?', [estado, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            });
        }
    });

    router.delete('/ot-backlog/:id', (req, res) => {
        db.query('DELETE FROM ot_backlog WHERE id = ?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
    });

    // ============================================================
    // MÓDULO: STATUS RAMPA
    // Tabla: taller_rampas
    // CREATE TABLE IF NOT EXISTS taller_rampas (
    //   id INT AUTO_INCREMENT PRIMARY KEY,
    //   rampa INT NOT NULL,
    //   placa VARCHAR(20) NOT NULL,
    //   km VARCHAR(20),
    //   fecha_ingreso DATE,
    //   hora_ingreso TIME,
    //   fecha_salida DATE,
    //   hora_salida TIME,
    //   situacion VARCHAR(80),
    //   obs TEXT,
    //   creado_por VARCHAR(100),
    //   creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    // );
    // ============================================================

    // Migración: agregar columna estado a taller_rampas
    db.query(`ALTER TABLE taller_rampas ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'Activo'`, (e) => {
        if (e && !e.message.includes('Duplicate column')) console.warn('ALTER taller_rampas estado:', e.message);
        else console.log('✅ Columna estado verificada en taller_rampas');
    });
    db.query(`ALTER TABLE taller_rampas ADD COLUMN fecha_liberado DATETIME NULL`, (e) => {
        if (e && !e.message.includes('Duplicate column')) console.warn('ALTER taller_rampas fecha_liberado:', e.message);
    });
    db.query(`ALTER TABLE taller_rampas ADD COLUMN liberado_por VARCHAR(100) NULL`, (e) => {
        if (e && !e.message.includes('Duplicate column')) console.warn('ALTER taller_rampas liberado_por:', e.message);
    });
    db.query(`ALTER TABLE taller_rampas ADD COLUMN fecha_salida_real DATE NULL`, (e) => {
        if (e && !e.message.includes('Duplicate column')) console.warn('ALTER taller_rampas fecha_salida_real:', e.message);
    });
    db.query(`ALTER TABLE taller_rampas ADD COLUMN hora_salida_real TIME NULL`, (e) => {
        if (e && !e.message.includes('Duplicate column')) console.warn('ALTER taller_rampas hora_salida_real:', e.message);
    });
    db.query(`ALTER TABLE taller_rampas ADD COLUMN creado_en TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP`, (e) => {
        if (e && !e.message.includes('Duplicate column')) console.warn('ALTER taller_rampas creado_en:', e.message);
    });
    db.query(`ALTER TABLE taller_rampas ADD COLUMN evidencia_url VARCHAR(255) NULL`, (e) => {
        if (e && !e.message.includes('Duplicate column')) console.warn('ALTER taller_rampas evidencia_url:', e.message);
    });

    // ── Migraciones ordenes_trabajo: flujo OT (iniciar / pausar / cerrar) ─────────
    [
        'sistema VARCHAR(100) NULL',
        'sub_sistema VARCHAR(100) NULL',
        'fecha_inicio_ot DATETIME NULL',
        'iniciado_por VARCHAR(100) NULL',
        'fecha_pausa1 DATETIME NULL',
        'fecha_fin_pausa1 DATETIME NULL',
        'motivo_pausa1 VARCHAR(255) NULL',
        'pausado_por1 VARCHAR(100) NULL',
        'fecha_pausa2 DATETIME NULL',
        'fecha_fin_pausa2 DATETIME NULL',
        'motivo_pausa2 VARCHAR(255) NULL',
        'pausado_por2 VARCHAR(100) NULL',
        'fecha_pausa3 DATETIME NULL',
        'fecha_fin_pausa3 DATETIME NULL',
        'motivo_pausa3 VARCHAR(255) NULL',
        'pausado_por3 VARCHAR(100) NULL',
        'comentario_cierre TEXT NULL',
        'cerrado_por VARCHAR(100) NULL'
    ].forEach(function (colDef) {
        var colName = colDef.split(' ')[0];
        db.query('ALTER TABLE ordenes_trabajo ADD COLUMN ' + colDef, function (e) {
            if (e && !e.message.includes('Duplicate column')) console.warn('ALTER ordenes_trabajo ' + colName + ':', e.message);
        });
    });

    router.get(['/taller-rampas', '/rampas'], (req, res) => {
        const targetDb = req.db || db;
        const historial = req.query.historial === '1';
        targetDb.query("ALTER TABLE taller_rampas ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'Activo'", () => {
            targetDb.query("ALTER TABLE taller_rampas ADD COLUMN creado_en TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP", () => {
                targetDb.query("ALTER TABLE taller_rampas ADD COLUMN conductor VARCHAR(255) NULL", () => {
                    const sql = historial
                        ? "SELECT * FROM taller_rampas WHERE estado = 'Liberado' ORDER BY id DESC"
                        : "SELECT * FROM taller_rampas WHERE estado != 'Liberado' ORDER BY rampa ASC, id ASC";
                    targetDb.query(sql, (err, rows) => {
                        if (err) {
                            targetDb.query("SELECT * FROM taller_rampas ORDER BY id ASC", (err2, rows2) => {
                                if (err2) return res.json([]);
                                return res.json(rows2 || []);
                            });
                            return;
                        }
                        res.json(rows || []);
                    });
                });
            });
        });
    });

    router.post('/taller-rampas/upload-url', async (req, res) => {
        try {
            const { fileName, fileType } = req.body;
            if (!fileName) return res.status(400).json({ error: 'fileName requerido' });
            const ext = path.extname(fileName) || '.jpg';
            const uniqueKey = `status-rampa/evidencia_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
            const uploadUrl = await s3Service.getUploadUrl(uniqueKey, fileType || 'image/jpeg');
            res.json({ uploadUrl, key: uniqueKey, finalUrl: uniqueKey });
        } catch (err) {
            console.error('Error generando S3 presigned PUT para taller_rampas:', err);
            res.status(500).json({ error: 'No se pudo generar la URL de subida' });
        }
    });

    router.get('/taller-rampas/:id/evidencia', async (req, res) => {
        const targetDb = req.db || db;
        targetDb.query('SELECT evidencia_url FROM taller_rampas WHERE id = ?', [req.params.id], async (err, rows) => {
            if (err || !rows || !rows.length || !rows[0].evidencia_url) {
                return res.status(404).json({ error: 'Evidencia no encontrada' });
            }
            try {
                const rawUrl = rows[0].evidencia_url;
                if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
                    return res.json({ url: rawUrl });
                }
                const presigned = await s3Service.getPresignedUrl(rawUrl, 3600);
                return res.json({ url: presigned });
            } catch (e) {
                return res.status(500).json({ error: 'Error firmando URL de evidencia' });
            }
        });
    });

    router.post('/taller-rampas', (req, res) => {
        const { rampa, placa, km, conductor, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs, creado_por, evidencia_url } = req.body;
        if (!rampa || !placa) return res.status(400).json({ error: 'rampa y placa son requeridos' });
        db.query(
            `INSERT INTO taller_rampas (rampa, placa, km, conductor, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs, creado_por, evidencia_url, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Activo')`,
            [rampa, placa, km || null, conductor || null, fecha_ingreso || null, hora_ingreso || null, fecha_salida || null, hora_salida || null, situacion || '', obs || '', creado_por || '', evidencia_url || null],
            (err, result) => {
                if (err) {
                    db.query(
                        `INSERT INTO taller_rampas (rampa, placa, km, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs, creado_por, evidencia_url, estado)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Activo')`,
                        [rampa, placa, km || null, fecha_ingreso || null, hora_ingreso || null, fecha_salida || null, hora_salida || null, situacion || '', obs || '', creado_por || '', evidencia_url || null],
                        (err2, result2) => {
                            if (err2) return res.status(500).json({ error: err2.message });
                            return res.json({ ok: true, id: result2.insertId });
                        }
                    );
                    return;
                }
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id: result.insertId });
            }
        );
    });

    router.put('/taller-rampas/:id', (req, res) => {
        const { accion } = req.body;
        if (accion === 'liberar') {
            const { liberado_por, fecha_salida_real, hora_salida_real, situacion } = req.body;
            db.query(
                `UPDATE taller_rampas SET estado='Liberado',
             fecha_liberado = CASE WHEN fecha_salida IS NOT NULL AND hora_salida IS NOT NULL
                              THEN CONCAT(fecha_salida, ' ', hora_salida)
                              ELSE NOW() END,
             liberado_por=?,
             fecha_salida_real=?, hora_salida_real=?, situacion=COALESCE(?, situacion) WHERE id=?`,
                [liberado_por || null, fecha_salida_real || null, hora_salida_real || null,
                situacion || null, req.params.id],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
                }
            );
            return;
        }
        if (accion === 'reactivar') {
            db.query(
                `UPDATE taller_rampas SET estado='Activo', fecha_liberado=NULL, liberado_por=NULL WHERE id=?`,
                [req.params.id],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
                }
            );
            return;
        }
        const { rampa, placa, km, conductor, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs, evidencia_url } = req.body;
        db.query(
            `UPDATE taller_rampas SET rampa=?, placa=?, km=?, conductor=?, fecha_ingreso=?, hora_ingreso=?, fecha_salida=?, hora_salida=?, situacion=?, obs=?, evidencia_url=? WHERE id=?`,
            [rampa, placa, km || null, conductor || null, fecha_ingreso || null, hora_ingreso || null, fecha_salida || null, hora_salida || null, situacion || '', obs || '', evidencia_url || null, req.params.id],
            (err) => {
                if (err) {
                    db.query(
                        `UPDATE taller_rampas SET rampa=?, placa=?, km=?, fecha_ingreso=?, hora_ingreso=?, fecha_salida=?, hora_salida=?, situacion=?, obs=?, evidencia_url=? WHERE id=?`,
                        [rampa, placa, km || null, fecha_ingreso || null, hora_ingreso || null, fecha_salida || null, hora_salida || null, situacion || '', obs || '', evidencia_url || null, req.params.id],
                        () => { }
                    );
                }
                if (obs !== undefined) {
                    db.query('SELECT ticket_entrada, detalles_json FROM ordenes_trabajo WHERE id_rampa = ? OR (UPPER(placa) = UPPER(?) AND estado != "Finalizado")', [req.params.id, placa], (errOTs, rowsOTs) => {
                        if (!errOTs && rowsOTs && rowsOTs.length) {
                            rowsOTs.forEach(row => {
                                let det = {};
                                try { det = typeof row.detalles_json === 'string' ? JSON.parse(row.detalles_json) : (row.detalles_json || {}); } catch (e) { }
                                det.motivo = obs;
                                if (conductor) {
                                    det.conductor = conductor;
                                    det.chofer = conductor;
                                    det.reportado_por = conductor;
                                }
                                db.query('UPDATE ordenes_trabajo SET detalles_json = ? WHERE ticket_entrada = ?', [JSON.stringify(det), row.ticket_entrada]);
                            });
                        }
                    });
                }
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            }
        );
    });

    router.delete('/taller-rampas/:id', (req, res) => {
        const idRampa = req.params.id;
        db.query('SELECT ticket_entrada FROM ordenes_trabajo WHERE id_rampa = ?', [idRampa], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const tickets = rows.map(r => r.ticket_entrada);
            const finishDelete = () => {
                db.query('DELETE FROM taller_rampas WHERE id = ?', [idRampa], (errDel) => {
                    if (errDel) return res.status(500).json({ error: errDel.message });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); }
                    res.json({ ok: true });
                });
            };
            if (tickets.length === 0) return finishDelete();

            db.query('DELETE FROM trabajos_ot WHERE ticket_visita IN (?)', [tickets], () => {
                db.query('DELETE FROM salidas_inv WHERE ticket_ot IN (?)', [tickets], () => {
                    db.query('DELETE FROM inspecciones WHERE id_ot IN (?)', [tickets], () => {
                        db.query('DELETE FROM ordenes_trabajo WHERE id_rampa = ?', [idRampa], () => {
                            finishDelete();
                        });
                    });
                });
            });
        });
    });

    // ✨ TALLER PERSONAL ✨
    router.get('/taller-personal', (req, res) => {
        db.query('SELECT * FROM taller_personal ORDER BY nombre ASC', (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    router.post('/taller-personal', (req, res) => {
        const { nombre, sueldo_mensual, costo_hora } = req.body;
        db.query(
            'INSERT INTO taller_personal (nombre, sueldo_mensual, costo_hora) VALUES (?, ?, ?)',
            [nombre, sueldo_mensual || 0, costo_hora || 0],
            (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true, id: result.insertId });
            }
        );
    });

    router.put('/taller-personal/:id', (req, res) => {
        const { nombre, sueldo_mensual, costo_hora } = req.body;
        db.query(
            'UPDATE taller_personal SET nombre=?, sueldo_mensual=?, costo_hora=? WHERE id=?',
            [nombre, sueldo_mensual || 0, costo_hora || 0, req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true });
            }
        );
    });

    router.delete('/taller-personal/:id', (req, res) => {
        db.query('DELETE FROM taller_personal WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
    });

    return router;
};
