const express = require('express');
const mysql = require('mysql2/promise');

module.exports = function (db, broadcast, logAudit) {
    const router = express.Router();

    function getDb(req) {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    }

    // Configuración de conexión al host remoto de la empresa de transporte
    const REMOTE_CONFIG = {
        host: process.env.REMOTE_FUEL_HOST || '168.231.98.23',
        user: process.env.REMOTE_FUEL_USER || 'prov_combustible',
        password: process.env.REMOTE_FUEL_PASSWORD || '32f2dc8b2b27fc021c81674c04c2326e',
        database: process.env.REMOTE_FUEL_DATABASE || 'marsisadb_prod',
        connectTimeout: 15000,
        waitForConnections: true,
        connectionLimit: 5
    };

    let _remotePool = null;
    function getRemoteDb() {
        if (!_remotePool) {
            _remotePool = mysql.createPool(REMOTE_CONFIG);
        }
        return _remotePool;
    }

    const _tenantsInitSet = new Set();

    const TABLE_SQL = `CREATE TABLE IF NOT EXISTS operaciones_ordenes_viaje (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_remoto BIGINT NULL,
        viaje VARCHAR(60) NOT NULL,
        fecha_viaje DATETIME NULL,
        id_conductor INT NULL,
        conductor VARCHAR(150) NOT NULL DEFAULT '',
        placa_tracto VARCHAR(20) NOT NULL DEFAULT '',
        placa_remolque VARCHAR(20) NULL,
        ruta VARCHAR(255) NULL,
        origen VARCHAR(100) NULL,
        destino VARCHAR(100) NULL,
        estado VARCHAR(30) NOT NULL DEFAULT 'ACTIVO',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_viaje (viaje),
        INDEX idx_placa_tracto (placa_tracto),
        INDEX idx_placa_remolque (placa_remolque),
        INDEX idx_fecha_viaje (fecha_viaje),
        INDEX idx_id_remoto (id_remoto)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

    async function ensureTables(req) {
        const tenantId = (req && req.tenantId) ? req.tenantId : 'default';
        if (_tenantsInitSet.has(tenantId)) return;
        try {
            const tdb = getDb(req);
            if (!tdb) return;
            await tdb.query(TABLE_SQL);
            _tenantsInitSet.add(tenantId);
        } catch (err) {
            console.error('Error asegurando tabla operaciones_ordenes_viaje:', err);
        }
    }

    // ── GET /api/operaciones/ordenes-viaje ────────────────────────
    router.get('/ordenes-viaje', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const { q, placa, limit } = req.query;
            let sql = `SELECT * FROM operaciones_ordenes_viaje WHERE 1=1`;
            const params = [];

            if (q && String(q).trim()) {
                const search = `%${String(q).trim()}%`;
                sql += ` AND (viaje LIKE ? OR conductor LIKE ? OR placa_tracto LIKE ? OR placa_remolque LIKE ? OR ruta LIKE ?)`;
                params.push(search, search, search, search, search);
            }

            if (placa && String(placa).trim()) {
                sql += ` AND (placa_tracto = ? OR placa_remolque = ?)`;
                params.push(String(placa).trim(), String(placa).trim());
            }

            sql += ` ORDER BY fecha_viaje DESC, id DESC LIMIT ?`;
            params.push(parseInt(limit, 10) || 100);

            const [rows] = await tdb.query(sql, params);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error('Error al listar ordenes de viaje:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/operaciones/ordenes-viaje/:viaje ──────────────────
    router.get('/ordenes-viaje/:viaje', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const [rows] = await tdb.query(
                `SELECT * FROM operaciones_ordenes_viaje WHERE viaje = ? LIMIT 1`,
                [req.params.viaje]
            );

            if (!rows.length) return res.status(404).json({ error: 'Orden de viaje no encontrada' });
            res.json({ ok: true, data: rows[0] });
        } catch (err) {
            console.error('Error al obtener orden de viaje:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/operaciones/ordenes-viaje/sincronizar ───────────
    router.post('/ordenes-viaje/sincronizar', async (req, res) => {
        try {
            const tenantId = req.tenantSlug || req.headers['x-tenant-id'] || 'default';
            const host = (req.headers.host || '').toLowerCase();
            const isMarsisa = tenantId.toLowerCase().includes('marsisa') || host.includes('marsisa') || tenantId === 'master' || tenantId === 'default';

            if (!isMarsisa) {
                return res.status(400).json({
                    ok: false,
                    error: 'La sincronización remota de órdenes de viaje solo está habilitada para la empresa Marsisa.'
                });
            }

            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos local no disponible' });

            const remoteDb = getRemoteDb();

            // Extraer viajes desde la BD remota con sus rutas agrupadas
            const queryRemota = `
                SELECT 
                    ov.id_viaje,
                    ov.viaje,
                    ov.fecha_viaje,
                    ov.id_conductor,
                    ov.conductor,
                    ov.placa_vehiculo AS placa_tracto,
                    ov.placa_remolque,
                    COALESCE(vales.ruta, '') AS ruta
                FROM vw_combustible_orden_viaje ov
                LEFT JOIN (
                    SELECT viaje_numero, MAX(viaje_rutas) AS ruta
                    FROM vw_combustible_vale
                    WHERE viaje_rutas IS NOT NULL AND viaje_rutas != ''
                    GROUP BY viaje_numero
                ) vales ON (ov.viaje LIKE CONCAT('%', vales.viaje_numero) OR vales.viaje_numero = ov.viaje)
                ORDER BY ov.fecha_viaje DESC
                LIMIT 1500
            `;

            const [viajesRemotos] = await remoteDb.query(queryRemota);

            if (!viajesRemotos || !viajesRemotos.length) {
                return res.json({ ok: true, message: 'No se encontraron viajes en el origen remoto', insertados: 0 });
            }

            let insertados = 0;
            let actualizados = 0;

            const chunkSize = 100;
            for (let i = 0; i < viajesRemotos.length; i += chunkSize) {
                const chunk = viajesRemotos.slice(i, i + chunkSize);
                const values = [];
                const placeholders = [];

                for (const v of chunk) {
                    if (!v.viaje) continue;
                    const viajeStr = String(v.viaje).trim();
                    const placaT = String(v.placa_tracto || '').trim().toUpperCase();
                    const placaR = v.placa_remolque ? String(v.placa_remolque).trim().toUpperCase() : null;
                    const cond = String(v.conductor || '').trim().toUpperCase();
                    const ruta = String(v.ruta || '').trim();

                    placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?)');
                    values.push(
                        v.id_viaje || null,
                        viajeStr,
                        v.fecha_viaje || null,
                        v.id_conductor || null,
                        cond,
                        placaT,
                        placaR,
                        ruta
                    );
                }

                if (!placeholders.length) continue;

                const batchSql = `
                    INSERT INTO operaciones_ordenes_viaje 
                        (id_remoto, viaje, fecha_viaje, id_conductor, conductor, placa_tracto, placa_remolque, ruta)
                    VALUES ${placeholders.join(', ')}
                    ON DUPLICATE KEY UPDATE
                        id_remoto = VALUES(id_remoto),
                        fecha_viaje = VALUES(fecha_viaje),
                        id_conductor = VALUES(id_conductor),
                        conductor = VALUES(conductor),
                        placa_tracto = VALUES(placa_tracto),
                        placa_remolque = VALUES(placa_remolque),
                        ruta = CASE WHEN VALUES(ruta) != '' THEN VALUES(ruta) ELSE ruta END
                `;

                const [resBatch] = await tdb.query(batchSql, values);
                insertados += resBatch.affectedRows;
            }

            if (logAudit) {
                logAudit({
                    req,
                    accion: 'SINCRONIZAR_ORDENES_VIAJE',
                    modulo: 'OPERACIONES',
                    detalle: `Sincronizados ${viajesRemotos.length} viajes. Insertados: ${insertados}, Actualizados: ${actualizados}`
                });
            }

            res.json({
                ok: true,
                total_remoto: viajesRemotos.length,
                insertados,
                actualizados,
                message: `Sincronización exitosa: ${insertados} nuevos, ${actualizados} actualizados.`
            });
        } catch (err) {
            console.error('Error al sincronizar ordenes de viaje:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
