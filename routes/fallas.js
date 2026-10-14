// Módulo: Reporte de Fallas por Conductor
// Flujo: conductor reporta falla → si requiere repuesto → alerta a almacenero
//        almacenero: con stock → reserva; sin stock → genera requerimiento de compra

const express = require('express');

module.exports = function(db) {
    const router = express.Router();

    function getDb(req) { return req.db || db; }

    async function ensureTable(req) {
        const tdb = getDb(req);
        await tdb.promise().query(`
            CREATE TABLE IF NOT EXISTS fallas_conductor (
                id                  INT AUTO_INCREMENT PRIMARY KEY,
                folio               VARCHAR(30)  DEFAULT NULL,
                placa               VARCHAR(20)  NOT NULL,
                conductor           VARCHAR(120) DEFAULT NULL,
                tipo_falla          VARCHAR(80)  NOT NULL COMMENT 'mecanica,electrica,neumaticos,carroceria,otro',
                descripcion         TEXT         NOT NULL,
                severidad           ENUM('baja','media','alta','critica') DEFAULT 'media',
                requiere_repuesto   TINYINT(1)   DEFAULT 0,
                repuesto_descripcion TEXT        DEFAULT NULL,
                orden_viaje         VARCHAR(50)  DEFAULT NULL,
                estado              VARCHAR(40)  DEFAULT 'REPORTADA'
                    COMMENT 'REPORTADA,EN_REVISION,CON_REPUESTO,SIN_STOCK,ATENDIDA,CERRADA',
                atendido_por        VARCHAR(120) DEFAULT NULL,
                alerta_enviada      TINYINT(1)   DEFAULT 0,
                requerimiento_oc_id INT          DEFAULT NULL,
                observaciones       TEXT         DEFAULT NULL,
                reportado_por       VARCHAR(120) DEFAULT NULL,
                created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
                updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_placa  (placa),
                INDEX idx_estado (estado),
                INDEX idx_fecha  (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
    }

    // Genera folio: FAL-AAAA-NNNN
    async function generarFolio(tdb) {
        const anio = new Date().getFullYear();
        const [rows] = await tdb.promise().query(
            `SELECT COUNT(*) AS c FROM fallas_conductor WHERE YEAR(created_at) = ?`, [anio]
        );
        const n = ((rows[0]?.c ?? 0) + 1);
        return `FAL-${anio}-${String(n).padStart(4, '0')}`;
    }

    // ── GET /api/fallas — listar fallas ─────────────────────────────────────────
    router.get('/', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            const { placa, estado, desde, hasta, limit } = req.query;
            let sql = 'SELECT * FROM fallas_conductor WHERE 1=1';
            const params = [];
            if (placa)  { sql += ' AND placa = ?';                   params.push(placa.toUpperCase()); }
            if (estado) { sql += ' AND estado = ?';                  params.push(estado.toUpperCase()); }
            if (desde)  { sql += ' AND DATE(created_at) >= ?';       params.push(desde); }
            if (hasta)  { sql += ' AND DATE(created_at) <= ?';       params.push(hasta); }
            sql += ' ORDER BY created_at DESC';
            sql += ` LIMIT ${Math.min(parseInt(limit || '200', 10), 500)}`;

            const [rows] = await tdb.promise().query(sql, params);
            res.json(rows || []);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/fallas/stats — estadísticas resumen ──────────────────────────
    router.get('/stats', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            const [rows] = await tdb.promise().query(`
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN estado NOT IN ('ATENDIDA','CERRADA') THEN 1 ELSE 0 END) AS abiertas,
                    SUM(CASE WHEN severidad = 'critica' AND estado NOT IN ('ATENDIDA','CERRADA') THEN 1 ELSE 0 END) AS criticas,
                    SUM(CASE WHEN requiere_repuesto=1 AND estado='SIN_STOCK' THEN 1 ELSE 0 END) AS sin_stock,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS hoy
                FROM fallas_conductor
            `);
            res.json(rows[0] || {});
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/fallas — registrar nueva falla ──────────────────────────────
    router.post('/', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            const b = req.body || {};
            const placa = String(b.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (!placa)        return res.status(400).json({ error: 'placa requerida' });
            if (!b.tipo_falla) return res.status(400).json({ error: 'tipo_falla requerido' });
            if (!b.descripcion) return res.status(400).json({ error: 'descripcion requerida' });

            const folio = await generarFolio(tdb);
            const requiereRep = b.requiere_repuesto ? 1 : 0;

            const [result] = await tdb.promise().query(`
                INSERT INTO fallas_conductor
                    (folio, placa, conductor, tipo_falla, descripcion, severidad,
                     requiere_repuesto, repuesto_descripcion, orden_viaje, reportado_por)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            `, [
                folio, placa,
                b.conductor || null,
                b.tipo_falla,
                b.descripcion,
                b.severidad || 'media',
                requiereRep,
                b.repuesto_descripcion || null,
                b.orden_viaje || null,
                b.reportado_por || req.user?.nombre || null
            ]);

            // Si requiere repuesto, intentar notificar por email al almacenero
            if (requiereRep) {
                try {
                    const [destRows] = await tdb.promise().query(
                        `SELECT email FROM configuracion_email_destinatarios WHERE activo=1 AND roles LIKE '%almacen%' LIMIT 5`
                    ).catch(() => [[]]);
                    const destinos = (destRows || []).map(r => r.email).filter(Boolean);

                    if (destinos.length > 0) {
                        const { obtenerTransportadorEmail } = require('../utils/email_utils').catch ? { obtenerTransportadorEmail: null } : require('../utils/email_utils');
                        if (obtenerTransportadorEmail) {
                            const transporter = await obtenerTransportadorEmail(tdb).catch(() => null);
                            if (transporter) {
                                await transporter.sendMail({
                                    to: destinos.join(','),
                                    subject: `[Falla ${severidad?.toUpperCase() || 'MEDIA'}] ${placa} — ${b.tipo_falla}`,
                                    html: `<b>Folio:</b> ${folio}<br><b>Placa:</b> ${placa}<br><b>Tipo:</b> ${b.tipo_falla}<br><b>Descripción:</b> ${b.descripcion}<br><b>Conductor:</b> ${b.conductor || '—'}<br><b>Repuesto requerido:</b> ${b.repuesto_descripcion || 'Ver detalles'}`
                                }).catch(() => {});
                                await tdb.promise().query('UPDATE fallas_conductor SET alerta_enviada=1 WHERE id=?', [result.insertId]);
                            }
                        }
                    }
                } catch (_) { /* notificación es best-effort */ }
            }

            res.json({ ok: true, id: result.insertId, folio });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── PUT /api/fallas/:id/estado — actualizar estado ───────────────────────
    router.put('/:id/estado', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            const { id } = req.params;
            const { estado, atendido_por, observaciones, requerimiento_oc_id } = req.body || {};
            if (!estado) return res.status(400).json({ error: 'estado requerido' });

            const sets = ['estado=?', 'updated_at=NOW()'];
            const params = [estado.toUpperCase()];

            if (atendido_por)       { sets.push('atendido_por=?');       params.push(atendido_por); }
            if (observaciones)      { sets.push('observaciones=?');      params.push(observaciones); }
            if (requerimiento_oc_id){ sets.push('requerimiento_oc_id=?');params.push(requerimiento_oc_id); }

            params.push(id);
            await tdb.promise().query(`UPDATE fallas_conductor SET ${sets.join(', ')} WHERE id=?`, params);
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── DELETE /api/fallas/:id — eliminar (soft delete via estado ANULADA) ──
    router.delete('/:id', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            await tdb.promise().query(
                'UPDATE fallas_conductor SET estado=? WHERE id=?',
                ['ANULADA', req.params.id]
            );
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
