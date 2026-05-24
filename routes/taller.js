const express = require('express');
const router = express.Router();

module.exports = (db) => {

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
    'costo DECIMAL(10,2) NULL DEFAULT 0'
].forEach(function(colDef) {
    var colName = colDef.split(' ')[0];
    db.query('ALTER TABLE trabajos_ot ADD COLUMN ' + colDef, function(e) {
        if (!e || e.code === 'ER_DUP_FIELDNAME') console.log('✅ trabajos_ot.' + colName + ' verificada');
        else console.warn('ALTER trabajos_ot.' + colName + ':', e.message);
    });
});

// ── Helper: genera ID secuencial por año  (ej. OT-2026-0001) ─────
// Solo busca IDs con sufijo de exactamente 4 dígitos (nuevo formato),
// ignorando los IDs legacy con sufijos largos.
function generarId(tabla, columna, prefijo, anio, cb) {
    const regex = `^${prefijo}-${anio}-[0-9]{4}$`;
    db.query(`SELECT MAX(${columna}) AS ultimo FROM ${tabla} WHERE ${columna} REGEXP ?`, [regex], (err, rows) => {
        if (err || !rows.length || !rows[0].ultimo) return cb(`${prefijo}-${anio}-0001`);
        const parts = String(rows[0].ultimo).split('-');
        const num   = parseInt(parts[parts.length - 1], 10) || 0;
        cb(`${prefijo}-${anio}-${String(num + 1).padStart(4, '0')}`);
    });
}

// ── ORDENES DE TRABAJO ────────────────────────────────────────────
router.get('/ordenes-trabajo', (req, res) => {
    const sql = `
        SELECT o.*,
            COALESCE((
                SELECT SUM(COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.detalles_json, '$.costo')) AS DECIMAL(10,2)), 0))
                FROM trabajos_ot t WHERE t.id_ot = o.ticket_entrada AND t.estado = 'Aprobado'
            ), 0)
            +
            COALESCE((
                SELECT SUM(s.total_pen)
                FROM salidas_inv s WHERE s.ticket_ot = o.ticket_entrada AND s.estado = 'Despachado'
            ), 0) AS costo_total
        FROM ordenes_trabajo o
        ORDER BY o.fecha_ingreso DESC`;
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/ordenes-trabajo', (req, res) => {
    const { placa, estado, fecha_ingreso, creado_por, detalles_json } = req.body;
    if (!placa) return res.status(400).json({ error: 'placa es requerida' });
    const anio    = new Date().getFullYear();
    const detJson = typeof detalles_json === 'string' ? detalles_json : JSON.stringify(detalles_json || {});
    generarId('ordenes_trabajo', 'id_ot', 'OT', anio, (nuevoId) => {
        db.query(
            `INSERT INTO ordenes_trabajo (ticket_entrada, id_ot, placa, estado, detalles_json, creado_por, fecha_ingreso)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [nuevoId, nuevoId, placa.toUpperCase(), estado || 'Pendiente', detJson, creado_por || '', fecha_ingreso || new Date()],
            (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true, id: result.insertId, id_ot: nuevoId });
            }
        );
    });
});

router.put('/ordenes-trabajo/:id', (req, res) => {
    const ticketId = req.params.id;
    const { accion, estado, detalles_json, fecha_hora_salida, detalles_cierre, usuario } = req.body;

    if (accion === 'iniciar') {
        const { iniciado_por } = req.body;
        db.query(
            "UPDATE ordenes_trabajo SET estado='En Proceso', fecha_inicio_ot=NOW(), iniciado_por=? WHERE ticket_entrada=?",
            [iniciado_por || null, ticketId],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true });
            }
        );
        return;
    }

    if (accion === 'pausar') {
        const { motivo, pausado_por } = req.body;
        if (!motivo || !motivo.trim()) return res.status(400).json({ error: 'El motivo de pausa es requerido' });
        db.query('SELECT fecha_pausa1,fecha_pausa2,fecha_pausa3 FROM ordenes_trabajo WHERE ticket_entrada=?', [ticketId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
            const r = rows[0];
            let slot = 0;
            if (!r.fecha_pausa1) slot = 1;
            else if (!r.fecha_pausa2) slot = 2;
            else if (!r.fecha_pausa3) slot = 3;
            else return res.status(400).json({ error: 'Límite de 3 pausas alcanzado' });
            db.query(
                `UPDATE ordenes_trabajo SET estado='Pausada', fecha_pausa${slot}=NOW(), motivo_pausa${slot}=?, pausado_por${slot}=? WHERE ticket_entrada=?`,
                [motivo.trim(), pausado_por || null, ticketId],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ ok: true, slot });
                }
            );
        });
        return;
    }

    if (accion === 'reanudar') {
        db.query('SELECT fecha_pausa1,fecha_fin_pausa1,fecha_pausa2,fecha_fin_pausa2,fecha_pausa3,fecha_fin_pausa3 FROM ordenes_trabajo WHERE ticket_entrada=?', [ticketId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
            const r = rows[0];
            let slot = 0;
            if (r.fecha_pausa1 && !r.fecha_fin_pausa1) slot = 1;
            else if (r.fecha_pausa2 && !r.fecha_fin_pausa2) slot = 2;
            else if (r.fecha_pausa3 && !r.fecha_fin_pausa3) slot = 3;
            else return res.status(400).json({ error: 'No hay pausa activa' });
            db.query(
                `UPDATE ordenes_trabajo SET estado='En Proceso', fecha_fin_pausa${slot}=NOW() WHERE ticket_entrada=?`,
                [ticketId],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ ok: true, slot });
                }
            );
        });
        return;
    }

    if (accion === 'anular') {
        db.query("UPDATE ordenes_trabajo SET estado = 'Anulado' WHERE ticket_entrada = ?", [ticketId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
        return;
    }

    if (accion === 'aprobar') {
        db.query('SELECT detalles_json FROM ordenes_trabajo WHERE ticket_entrada = ?', [ticketId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
            const raw = rows[0].detalles_json;
            let det = {};
            try { det = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch(e) { det = {}; }
            det.aprobacion = 'Aprobada';
            db.query('UPDATE ordenes_trabajo SET estado = \'Aprobada\', detalles_json = ? WHERE ticket_entrada = ?',
                [JSON.stringify(det), ticketId], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ ok: true });
                }
            );
        });
        return;
    }

    if (accion === 'cerrar') {
        const { comentario_cierre, cerrado_por } = req.body;
        db.query('SELECT detalles_json FROM ordenes_trabajo WHERE ticket_entrada = ?', [ticketId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
            const raw = rows[0].detalles_json;
            let det = {};
            try { det = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch(e) { det = {}; }
            det.aprobacion    = 'Cerrada';
            det.tecnico_cierre = (detalles_cierre || {}).tecnico_cierre || '';
            det.obs_cierre    = (detalles_cierre || {}).obs_cierre || '';
            det.firma         = (detalles_cierre || {}).firma || null;
            const fhSalidaRaw = fecha_hora_salida ? new Date(fecha_hora_salida) : new Date();
            const fhSalida = fhSalidaRaw.toISOString().slice(0, 19).replace('T', ' ');
            db.query(
                'UPDATE ordenes_trabajo SET estado=?, detalles_json=?, fecha_hora_salida=?, comentario_cierre=?, cerrado_por=? WHERE ticket_entrada=?',
                ['Finalizado', JSON.stringify(det), fhSalida,
                 comentario_cierre || (detalles_cierre || {}).obs_cierre || null,
                 cerrado_por || null, ticketId],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ ok: true });
                }
            );
        });
        return;
    }

    if (accion === 'editar') {
        const { tipo_ot, sub_tipo, supervisor, situacion_inicial, motivo } = req.body;
        db.query('SELECT detalles_json FROM ordenes_trabajo WHERE ticket_entrada = ?', [ticketId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows.length) return res.status(404).json({ error: 'OT no encontrada' });
            const raw = rows[0].detalles_json;
            let det = {};
            try { det = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch(e) { det = {}; }
            if (tipo_ot !== undefined)           det.tipo_ot           = tipo_ot;
            if (sub_tipo !== undefined)          det.sub_tipo          = sub_tipo;
            if (supervisor !== undefined)        det.supervisor        = supervisor;
            if (situacion_inicial !== undefined) det.situacion_inicial = situacion_inicial;
            if (motivo !== undefined)            det.motivo            = motivo;
            db.query('UPDATE ordenes_trabajo SET detalles_json = ? WHERE ticket_entrada = ?',
                [JSON.stringify(det), ticketId], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ ok: true });
                }
            );
        });
        return;
    }

    // Edición general
    const sets = [];
    const params = [];
    if (estado)            { sets.push('estado = ?');          params.push(estado); }
    if (detalles_json)     { sets.push('detalles_json = ?');   params.push(JSON.stringify(detalles_json)); }
    if (fecha_hora_salida) { sets.push('fecha_hora_salida = ?'); params.push(new Date(fecha_hora_salida).toISOString().slice(0,19).replace('T',' ')); }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(ticketId);
    db.query('UPDATE ordenes_trabajo SET ' + sets.join(', ') + ' WHERE ticket_entrada = ?', params, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

router.delete('/ordenes-trabajo/:id', (req, res) => {
    const ticketId = req.params.id;
    // Cascade: borrar trabajos y materiales asociados primero
    db.query('DELETE FROM trabajos_ot WHERE id_ot = ?', [ticketId], (err1) => {
        if (err1) return res.status(500).json({ error: err1.message });
        db.query('DELETE FROM ot_materiales WHERE ticket_ot = ?', [ticketId], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            db.query('DELETE FROM ordenes_trabajo WHERE ticket_entrada = ?', [ticketId], (err3) => {
                if (err3) return res.status(500).json({ error: err3.message });
                res.json({ ok: true });
            });
        });
    });
});

// ── OT TRABAJOS ───────────────────────────────────────────────────
router.get('/ot-trabajos', (req, res) => {
    const { id_ot } = req.query;
    // ticket_visita = FK a ordenes_trabajo.ticket_entrada | id_ot = ID único del trabajo (TR-YYYY-NNN)
    let sql = 'SELECT t.*, ot.placa, ot.id_ot as ot_id FROM trabajos_ot t LEFT JOIN ordenes_trabajo ot ON ot.ticket_entrada = t.ticket_visita';
    const params = [];
    if (id_ot) { sql += ' WHERE t.ticket_visita = ?'; params.push(id_ot); }
    sql += ' ORDER BY t.fecha_creacion DESC';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/ot-trabajos', (req, res) => {
    // ticket_visita del body = ticket_entrada de la OT (FK de asociación al OT)
    const { ticket_visita: ticketEntrada, trabajo_realizado, fecha_trabajo, fecha_salida, creado_por, detalles_json } = req.body;
    const anio    = new Date().getFullYear();
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
                res.json({ ok: true, id: result.insertId, id_ot: nuevoId, ticket_visita: ticketEntrada });
            }
        );
    });
});

router.put('/ot-trabajos/:id', (req, res) => {
    const idTrabajo = req.params.id;
    const { accion } = req.body;
    if (accion === 'aprobar') {
        db.query("UPDATE trabajos_ot SET estado = 'Aprobado' WHERE id_ot = ?", [idTrabajo], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
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
                res.json({ ok: true });
            }
        );
        return;
    }
    res.status(400).json({ error: 'Acción desconocida' });
});

router.delete('/ot-trabajos/:id', (req, res) => {
    const id = req.params.id;
    // Fallback: registros viejos pueden tener id_ot vacío → usar ticket_visita como ID
    db.query(
        'DELETE FROM trabajos_ot WHERE (id_ot = ? AND id_ot != \'\') OR (id_ot = \'\' AND ticket_visita = ?)',
        [id, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

// ── OT MATERIALES ─────────────────────────────────────────────────
router.get('/ot-materiales', (req, res) => {
    const { ticket_ot } = req.query;
    let sql = `SELECT s.*,
        GROUP_CONCAT(CONCAT_WS('\u001f', COALESCE(d.inventario_id,''), COALESCE(d.descripcion,''), d.cantidad, d.costo_unitario, COALESCE(d.moneda,'PEN'), d.importe) ORDER BY d.id SEPARATOR '\u001e') AS items_raw
        FROM salidas_inv s
        LEFT JOIN detalle_salidas_inv d ON d.salida_id = s.id
        WHERE s.ticket_ot IS NOT NULL`;
    const params = [];
    if (ticket_ot) { sql += ' AND s.ticket_ot = ?'; params.push(ticket_ot); }
    sql += ' GROUP BY s.id ORDER BY s.id DESC';
    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => {
            r.items = r.items_raw ? r.items_raw.split('\u001e').map(s => {
                const [invId, desc, cant, cu, mon, imp] = s.split('\u001f');
                return { inventario_id: invId || null, descripcion: desc || '', cantidad: parseFloat(cant) || 0, costo_unitario: parseFloat(cu) || 0, moneda: mon || 'PEN', importe: parseFloat(imp) || 0 };
            }) : [];
            delete r.items_raw;
        });
        res.json(rows);
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
        db.query(
            'INSERT INTO salidas_inv (id,fecha,tipo_destino,placa,responsable,responsable_id,moneda,tipo_cambio,total_pen,observaciones,creado_por,ticket_ot,estado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [id, fecha, tipo_destino || 'Vehiculo', placa || null, responsable || null, responsable_id || null,
             moneda || 'PEN', tc, total_pen, observaciones || null, creado_por || null, ticket_ot, 'Pendiente'],
            (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (!items || !items.length) return res.json({ ok: true, id });
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
                    db.query('INSERT INTO detalle_salidas_inv (salida_id,inventario_id,descripcion,cantidad,costo_unitario,moneda,importe) VALUES ?', [dVals], () => {});
                    res.json({ ok: true, id });
                });
            }
        );
    });
});

router.put('/ot-materiales/:id', (req, res) => {
    const id = req.params.id;
    const { accion, motivo } = req.body;
    if (accion === 'despachar') {
        db.query("UPDATE salidas_inv SET estado = 'Despachado' WHERE id = ?", [id], (err, result) => {
            if (err) {
                console.error('Error despachando:', err.message);
                return res.status(500).json({ error: err.message });
            }
            // Resolver inventario_id nulos: por descripción exacta O prefijo "INV-XXX — ..."
            db.query(
                `UPDATE detalle_salidas_inv d
                 INNER JOIN inventario i ON (i.descripcion = d.descripcion OR LEFT(d.descripcion, CHAR_LENGTH(i.id)) = i.id) AND i.activo = 1
                 SET d.inventario_id = i.id
                 WHERE d.salida_id = ? AND (d.inventario_id IS NULL OR d.inventario_id = '')`,
                [id], () => {}
            );
            res.json({ ok: true });
        });
    } else if (accion === 'anular') {
        if (!motivo || !String(motivo).trim()) return res.status(400).json({ error: 'Motivo requerido' });
        db.query('UPDATE salidas_inv SET estado=?, motivo_anulacion=? WHERE id=?',
            ['Anulado', String(motivo).trim(), id], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!result.affectedRows) return res.status(404).json({ error: 'No encontrado' });
                res.json({ ok: true });
            });
    } else {
        res.status(400).json({ error: 'Acción desconocida: ' + (accion || 'no especificada') });
    }
});

router.delete('/ot-materiales/:id', (req, res) => {
    const id = req.params.id;
    db.query('DELETE FROM detalle_salidas_inv WHERE salida_id = ?', [id], () => {
        db.query('DELETE FROM salidas_inv WHERE id = ?', [id], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ ok: true });
        });
    });
});

// ── OT BACKLOG ────────────────────────────────────────────────────
router.get('/ot-backlog', (req, res) => {
    const { placa, estado } = req.query;
    let sql = 'SELECT * FROM ot_backlog';
    const conds = [], params = [];
    if (placa)  { conds.push('placa = ?');  params.push(placa.toUpperCase()); }
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
            res.json({ ok: true, id: result.insertId, backlog_id: nuevoId });
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
        if (placa         !== undefined) { fields.push('placa = ?');         vals.push(String(placa).toUpperCase()); }
        if (km            !== undefined) { fields.push('km = ?');            vals.push(km || 0); }
        if (tema          !== undefined) { fields.push('tema = ?');          vals.push(tema || ''); }
        if (tarea         !== undefined) { fields.push('tarea = ?');         vals.push(tarea); }
        if (reportado_por !== undefined) { fields.push('reportado_por = ?'); vals.push(reportado_por || ''); }
        if (ticket_ot     !== undefined) { fields.push('ticket_ot = ?');     vals.push(ticket_ot || null); }
        if (estado        !== undefined) { fields.push('estado = ?');        vals.push(estado); }
        vals.push(req.params.id);
        db.query('UPDATE ot_backlog SET ' + fields.join(', ') + ' WHERE id = ?', vals, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
    } else {
        // Modo cambio de estado simple
        if (!estado) return res.status(400).json({ error: 'estado requerido' });
        db.query('UPDATE ot_backlog SET estado = ? WHERE id = ?', [estado, req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
    }
});

router.delete('/ot-backlog/:id', (req, res) => {
    db.query('DELETE FROM ot_backlog WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
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
].forEach(function(colDef) {
    var colName = colDef.split(' ')[0];
    db.query('ALTER TABLE ordenes_trabajo ADD COLUMN ' + colDef, function(e) {
        if (e && !e.message.includes('Duplicate column')) console.warn('ALTER ordenes_trabajo ' + colName + ':', e.message);
    });
});

router.get('/taller-rampas', (req, res) => {
    const historial = req.query.historial === '1';
    const sql = historial
        ? "SELECT * FROM taller_rampas WHERE estado = 'Liberado' ORDER BY fecha_liberado DESC, id DESC"
        : "SELECT * FROM taller_rampas WHERE estado != 'Liberado' ORDER BY rampa ASC, creado_en ASC";
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.post('/taller-rampas', (req, res) => {
    const { rampa, placa, km, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs, creado_por } = req.body;
    if (!rampa || !placa) return res.status(400).json({ error: 'rampa y placa son requeridos' });
    db.query(
        `INSERT INTO taller_rampas (rampa, placa, km, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs, creado_por, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Activo')`,
        [rampa, placa, km || null, fecha_ingreso || null, hora_ingreso || null, fecha_salida || null, hora_salida || null, situacion || '', obs || '', creado_por || ''],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, id: result.insertId });
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
                res.json({ ok: true });
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
                res.json({ ok: true });
            }
        );
        return;
    }
    const { rampa, placa, km, fecha_ingreso, hora_ingreso, fecha_salida, hora_salida, situacion, obs } = req.body;
    db.query(
        `UPDATE taller_rampas SET rampa=?, placa=?, km=?, fecha_ingreso=?, hora_ingreso=?, fecha_salida=?, hora_salida=?, situacion=?, obs=? WHERE id=?`,
        [rampa, placa, km || null, fecha_ingreso || null, hora_ingreso || null, fecha_salida || null, hora_salida || null, situacion || '', obs || '', req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

router.delete('/taller-rampas/:id', (req, res) => {
    db.query('DELETE FROM taller_rampas WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});



    return router;
};
