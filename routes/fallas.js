// Módulo: reporte de fallas por conductor (Mantenimiento > Fallas).
// Se guarda en la tabla oficial reportes_fallas, la misma que lee Disponibilidad, y cada falla abre un ítem en ot_backlog.
// Estados de la pantalla: REPORTADA, EN_REVISION, CON_REPUESTO, SIN_STOCK, ATENDIDA, CERRADA, ANULADA.
// Los datos propios de la falla (tipo, repuesto, atendido por, observaciones) van en el primer ítem de fallas_tracto_json.

const express = require('express');

const SEVERIDADES = ['baja', 'media', 'alta', 'critica'];
const TERMINADOS = ['ATENDIDA', 'CERRADA', 'ANULADA'];
// Estados terminados de reportes_fallas: los de la pantalla y los del checklist
const TERMINADOS_SQL = "('ATENDIDA','CERRADA','ANULADA','Finalizado','Anulado')";

module.exports = function (db) {
    const router = express.Router();
    const getDb = req => req.db || db;

    // FAL-AAAA-NNNN (el siguiente después del último del año)
    async function siguienteFolio(tdb) {
        const anio = new Date().getFullYear();
        const [rows] = await tdb.promise().query(
            'SELECT folio FROM reportes_fallas WHERE folio LIKE ? ORDER BY folio DESC LIMIT 1',
            [`FAL-${anio}-%`]
        );
        const ultimo = rows[0] ? parseInt(String(rows[0].folio).split('-').pop(), 10) || 0 : 0;
        return `FAL-${anio}-${String(ultimo + 1).padStart(4, '0')}`;
    }

    // BK-AAAA-NNNN, mismo formato que el backlog del taller
    async function siguienteBacklog(tdb) {
        const anio = new Date().getFullYear();
        const [rows] = await tdb.promise().query(
            'SELECT MAX(backlog_id) AS ultimo FROM ot_backlog WHERE backlog_id REGEXP ?',
            [`^BK-${anio}-[0-9]{4}$`]
        );
        const ultimo = rows[0] && rows[0].ultimo ? parseInt(String(rows[0].ultimo).split('-').pop(), 10) || 0 : 0;
        return `BK-${anio}-${String(ultimo + 1).padStart(4, '0')}`;
    }

    function leerLista(row) {
        try {
            const v = typeof row.fallas_tracto_json === 'string' ? JSON.parse(row.fallas_tracto_json || '[]') : (row.fallas_tracto_json || []);
            return Array.isArray(v) ? v : [];
        } catch (e) {
            return [];
        }
    }

    // Forma que usa la pantalla de fallas
    function aFalla(row) {
        const it = leerLista(row)[0] || {};
        const critica = Number(row.critica) === 1;
        return {
            id: row.id,
            folio: row.folio,
            placa: row.placa_tracto,
            conductor: row.conductor,
            tipo_falla: it.tipo_falla || it.sistema || '',
            descripcion: it.obs || row.fallas_libres_text || '',
            severidad: critica ? 'critica' : (it.severidad || 'media'),
            requiere_repuesto: it.requiere_repuesto ? 1 : 0,
            repuesto_descripcion: it.repuesto_descripcion || null,
            orden_viaje: row.orden_viaje,
            estado: row.estado || 'REPORTADA',
            atendido_por: it.atendido_por || null,
            observaciones: it.observaciones || null,
            requerimiento_oc_id: it.requerimiento_oc_id || null,
            created_at: row.fecha_reporte,
        };
    }

    async function avisarAlmacen(tdb, datos) {
        try {
            const [destRows] = await tdb.promise().query(
                "SELECT email FROM configuracion_email_destinatarios WHERE activo=1 AND roles LIKE '%almacen%' LIMIT 5"
            ).catch(() => [[]]);
            const destinos = (destRows || []).map(r => r.email).filter(Boolean);
            if (!destinos.length) return;
            const { obtenerTransportadorEmail } = require('../utils/email_utils');
            const transporter = await obtenerTransportadorEmail(tdb).catch(() => null);
            if (!transporter) return;
            await transporter.sendMail({
                to: destinos.join(','),
                subject: `[Falla ${datos.severidad.toUpperCase()}] ${datos.placa} — ${datos.tipo}`,
                html: `<b>Folio:</b> ${datos.folio}<br><b>Placa:</b> ${datos.placa}<br><b>Tipo:</b> ${datos.tipo}<br><b>Descripción:</b> ${datos.descripcion}<br><b>Repuesto:</b> ${datos.repuesto || '—'}`,
            }).catch(() => {});
        } catch (_) { /* el aviso es best-effort */ }
    }

    // ── GET /api/fallas — listar ─────────────────────────────────────────────
    router.get('/', async (req, res) => {
        try {
            const tdb = getDb(req);
            const { placa, estado, desde, hasta, limit } = req.query;
            let sql = 'SELECT * FROM reportes_fallas WHERE 1=1';
            const params = [];
            if (placa) { sql += ' AND placa_tracto = ?'; params.push(String(placa).toUpperCase()); }
            if (estado) { sql += ' AND estado = ?'; params.push(String(estado).toUpperCase()); }
            if (desde) { sql += ' AND DATE(fecha_reporte) >= ?'; params.push(desde); }
            if (hasta) { sql += ' AND DATE(fecha_reporte) <= ?'; params.push(hasta); }
            sql += ` ORDER BY fecha_reporte DESC, id DESC LIMIT ${Math.min(parseInt(limit || '200', 10) || 200, 500)}`;
            const [rows] = await tdb.promise().query(sql, params);
            res.json((rows || []).map(aFalla));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/fallas/stats — resumen ──────────────────────────────────────
    router.get('/stats', async (req, res) => {
        try {
            const tdb = getDb(req);
            const [rows] = await tdb.promise().query(`
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN estado NOT IN ${TERMINADOS_SQL} OR estado IS NULL THEN 1 ELSE 0 END) AS abiertas,
                    SUM(CASE WHEN critica = 1 AND (estado NOT IN ${TERMINADOS_SQL} OR estado IS NULL) THEN 1 ELSE 0 END) AS criticas,
                    SUM(CASE WHEN estado = 'SIN_STOCK' THEN 1 ELSE 0 END) AS sin_stock,
                    SUM(CASE WHEN DATE(fecha_reporte) = CURDATE() THEN 1 ELSE 0 END) AS hoy
                FROM reportes_fallas
            `);
            res.json(rows[0] || {});
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/fallas — registrar falla (abre ítem en ot_backlog) ─────────
    router.post('/', async (req, res) => {
        try {
            const tdb = getDb(req);
            const b = req.body || {};
            const placa = String(b.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (!placa) return res.status(400).json({ error: 'placa requerida' });
            if (!b.tipo_falla) return res.status(400).json({ error: 'tipo_falla requerido' });
            if (!b.descripcion) return res.status(400).json({ error: 'descripcion requerida' });

            const severidad = SEVERIDADES.includes(b.severidad) ? b.severidad : 'media';
            const requiereRep = b.requiere_repuesto ? 1 : 0;
            const km = parseInt(b.km, 10) || 0;
            const usuario = b.reportado_por || (req.user && req.user.nombre) || 'Sistema';
            const folio = await siguienteFolio(tdb);

            const item = {
                sistema: b.tipo_falla, item: b.tipo_falla, tipo_falla: b.tipo_falla, obs: b.descripcion,
                estado: 'FALLA', severidad, requiere_repuesto: requiereRep,
                repuesto_descripcion: b.repuesto_descripcion || null,
                atendido_por: null, observaciones: null, requerimiento_oc_id: null,
            };
            const [result] = await tdb.promise().query(
                `INSERT INTO reportes_fallas
                    (folio, orden_viaje, placa_tracto, km_inicial, km_final, conductor,
                     fallas_tracto_json, fallas_libres_text, critica, estado, creado_por)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                [folio, b.orden_viaje || null, placa, km, km, b.conductor || null,
                 JSON.stringify([item]), b.descripcion, severidad === 'critica' ? 1 : 0, 'REPORTADA', usuario]
            );

            const backlogId = await siguienteBacklog(tdb);
            await tdb.promise().query(
                `INSERT INTO ot_backlog (backlog_id, placa, km, tema, tarea, reportado_por, fecha_reporte, estado, creado_por, ticket_ot)
                 VALUES (?, ?, ?, ?, ?, ?, CURDATE(), 'Pendiente', ?, ?)`,
                [backlogId, placa, km, String(b.tipo_falla).slice(0, 100), b.descripcion, usuario, 'Sistema', folio]
            );

            if (requiereRep) {
                avisarAlmacen(tdb, { folio, placa, severidad, tipo: b.tipo_falla, descripcion: b.descripcion, repuesto: b.repuesto_descripcion });
            }
            res.json({ ok: true, id: result.insertId, folio, backlog_id: backlogId });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── PUT /api/fallas/:id/estado — cambia estado y lo refleja en ot_backlog ─
    router.put('/:id/estado', async (req, res) => {
        try {
            const tdb = getDb(req);
            const { id } = req.params;
            const { estado, atendido_por, observaciones, requerimiento_oc_id } = req.body || {};
            if (!estado) return res.status(400).json({ error: 'estado requerido' });

            const [rows] = await tdb.promise().query('SELECT * FROM reportes_fallas WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ error: 'Falla no encontrada' });
            const row = rows[0];
            const nuevo = String(estado).toUpperCase();

            const lista = leerLista(row);
            if (!lista.length) lista.push({});
            if (atendido_por) lista[0].atendido_por = atendido_por;
            if (observaciones) lista[0].observaciones = observaciones;
            if (requerimiento_oc_id) lista[0].requerimiento_oc_id = requerimiento_oc_id;

            await tdb.promise().query(
                'UPDATE reportes_fallas SET estado = ?, fallas_tracto_json = ? WHERE id = ?',
                [nuevo, JSON.stringify(lista), id]
            );
            await tdb.promise().query(
                'UPDATE ot_backlog SET estado = ? WHERE ticket_ot = ?',
                [TERMINADOS.includes(nuevo) ? 'Realizado' : 'Pendiente', row.folio]
            );
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── DELETE /api/fallas/:id — anula (no borra) ────────────────────────────
    router.delete('/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const [rows] = await tdb.promise().query('SELECT folio FROM reportes_fallas WHERE id = ?', [req.params.id]);
            if (!rows.length) return res.status(404).json({ error: 'Falla no encontrada' });
            await tdb.promise().query('UPDATE reportes_fallas SET estado = ? WHERE id = ?', ['ANULADA', req.params.id]);
            await tdb.promise().query('UPDATE ot_backlog SET estado = ? WHERE ticket_ot = ?', ['Anulado', rows[0].folio]);
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
