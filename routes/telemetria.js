// Telemetría CAN Bus por viaje/placa
// Persiste los datos de GPS/CAN en MySQL para no llamar a Wialon en cada visita.
// El botón "Consultar CAN (GPS)" del frontend usa POST /api/telemetria/guardar.
// Lecturas posteriores usan GET /api/telemetria/:placa.

const express = require('express');

module.exports = function(db) {
    const router = express.Router();

    function getDb(req) { return req.db || db; }

    // Crea la tabla si no existe
    async function ensureTable(req) {
        const tdb = getDb(req);
        await tdb.promise().query(`
            CREATE TABLE IF NOT EXISTS telemetria_can (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                placa           VARCHAR(20) NOT NULL,
                fecha           DATE NOT NULL,
                recorrido_km    DECIMAL(10,1) DEFAULT 0,
                horas_motor     DECIMAL(8,1)  DEFAULT 0,
                velocidad_max   DECIMAL(5,1)  DEFAULT 0,
                consumo_ralenti DECIMAL(8,2)  DEFAULT NULL COMMENT 'litros en ralentí',
                combustible_con DECIMAL(8,2)  DEFAULT NULL COMMENT 'litros totales consumidos',
                rendimiento     DECIMAL(8,3)  DEFAULT NULL COMMENT 'km/litro',
                lat_ultimo      DECIMAL(10,7) DEFAULT NULL,
                lng_ultimo      DECIMAL(10,7) DEFAULT NULL,
                estado_motor    VARCHAR(30)   DEFAULT NULL,
                raw_json        JSON          DEFAULT NULL COMMENT 'snapshot completo del objeto Wialon',
                synced_at       DATETIME      DEFAULT NULL,
                created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_placa_fecha (placa, fecha),
                INDEX idx_placa (placa),
                INDEX idx_fecha (fecha)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
    }

    // ── GET /api/telemetria — resumen de todas las placas (última entrada por placa) ─
    router.get('/', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            const { placa } = req.query;
            let sql = `
                SELECT t.*
                FROM telemetria_can t
                INNER JOIN (
                    SELECT placa, MAX(fecha) AS ultima_fecha
                    FROM telemetria_can
                    GROUP BY placa
                ) m ON t.placa = m.placa AND t.fecha = m.ultima_fecha
            `;
            const params = [];
            if (placa) {
                sql = `SELECT * FROM telemetria_can WHERE placa = ? ORDER BY fecha DESC LIMIT 30`;
                params.push(String(placa).toUpperCase());
            }
            const [rows] = await tdb.promise().query(sql, params);
            res.json(rows || []);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/telemetria/:placa — historial de una placa ──────────────────────
    router.get('/:placa', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            const placa = String(req.params.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const limit = Math.min(parseInt(req.query.limit || '30', 10), 90);
            const [rows] = await tdb.promise().query(
                'SELECT * FROM telemetria_can WHERE placa=? ORDER BY fecha DESC LIMIT ?',
                [placa, limit]
            );
            res.json(rows || []);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/telemetria/guardar — guarda/actualiza snapshot CAN ─────────────
    // Body: { placa, fecha?, recorrido_km, horas_motor, velocidad_max, consumo_ralenti,
    //         combustible_con, rendimiento, lat_ultimo, lng_ultimo, estado_motor, raw_json }
    router.post('/guardar', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            const b = req.body || {};
            const placa = String(b.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (!placa) return res.status(400).json({ error: 'placa requerida' });

            const fecha = b.fecha || new Date().toISOString().split('T')[0];
            const raw = b.raw_json ? JSON.stringify(b.raw_json) : null;

            await tdb.promise().query(`
                INSERT INTO telemetria_can
                    (placa, fecha, recorrido_km, horas_motor, velocidad_max, consumo_ralenti,
                     combustible_con, rendimiento, lat_ultimo, lng_ultimo, estado_motor, raw_json, synced_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())
                ON DUPLICATE KEY UPDATE
                    recorrido_km    = VALUES(recorrido_km),
                    horas_motor     = VALUES(horas_motor),
                    velocidad_max   = VALUES(velocidad_max),
                    consumo_ralenti = VALUES(consumo_ralenti),
                    combustible_con = VALUES(combustible_con),
                    rendimiento     = VALUES(rendimiento),
                    lat_ultimo      = VALUES(lat_ultimo),
                    lng_ultimo      = VALUES(lng_ultimo),
                    estado_motor    = VALUES(estado_motor),
                    raw_json        = VALUES(raw_json),
                    synced_at       = NOW()
            `, [
                placa, fecha,
                b.recorrido_km ?? b.km ?? null,
                b.horas_motor ?? b.horas ?? null,
                b.velocidad_max ?? null,
                b.consumo_ralenti ?? null,
                b.combustible_con ?? null,
                b.rendimiento ?? null,
                b.lat_ultimo ?? b.lat ?? null,
                b.lng_ultimo ?? b.lng ?? null,
                b.estado_motor ?? null,
                raw
            ]);

            res.json({ ok: true, placa, fecha });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/telemetria/guardar-lote — guarda múltiples vehículos a la vez ──
    // Body: { items: [{ placa, recorrido_km, horas_motor, ... }] }
    router.post('/guardar-lote', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            const items = Array.isArray(req.body?.items) ? req.body.items : [];
            if (!items.length) return res.json({ ok: true, guardados: 0 });

            const fecha = new Date().toISOString().split('T')[0];
            let guardados = 0;

            for (const b of items) {
                const placa = String(b.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (!placa) continue;
                const raw = b.raw_json ? JSON.stringify(b.raw_json) : null;
                await tdb.promise().query(`
                    INSERT INTO telemetria_can
                        (placa, fecha, recorrido_km, horas_motor, velocidad_max, consumo_ralenti,
                         combustible_con, rendimiento, lat_ultimo, lng_ultimo, estado_motor, raw_json, synced_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())
                    ON DUPLICATE KEY UPDATE
                        recorrido_km    = VALUES(recorrido_km),
                        horas_motor     = VALUES(horas_motor),
                        velocidad_max   = VALUES(velocidad_max),
                        consumo_ralenti = VALUES(consumo_ralenti),
                        combustible_con = VALUES(combustible_con),
                        rendimiento     = VALUES(rendimiento),
                        lat_ultimo      = VALUES(lat_ultimo),
                        lng_ultimo      = VALUES(lng_ultimo),
                        estado_motor    = VALUES(estado_motor),
                        raw_json        = VALUES(raw_json),
                        synced_at       = NOW()
                `, [
                    placa, b.fecha || fecha,
                    b.recorrido_km ?? b.km ?? null,
                    b.horas_motor ?? b.horas ?? null,
                    b.velocidad_max ?? null,
                    b.consumo_ralenti ?? null,
                    b.combustible_con ?? null,
                    b.rendimiento ?? null,
                    b.lat_ultimo ?? b.lat ?? null,
                    b.lng_ultimo ?? b.lng ?? null,
                    b.estado_motor ?? null,
                    raw
                ]);
                guardados++;
            }

            res.json({ ok: true, guardados });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
