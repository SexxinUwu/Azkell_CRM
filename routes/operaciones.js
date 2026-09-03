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
        peso DECIMAL(12,2) NULL DEFAULT 0.00,
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

    const TABLE_RUTAS_SQL = `CREATE TABLE IF NOT EXISTS operaciones_ordenes_viaje_rutas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        viaje VARCHAR(60) NOT NULL,
        orden VARCHAR(60) NOT NULL,
        ruta VARCHAR(255) NULL,
        tipo_servicio VARCHAR(100) NULL,
        es_retorno TINYINT(1) NOT NULL DEFAULT 0,
        peso_total DECIMAL(12,2) NULL DEFAULT 0.00,
        cantidad_total DECIMAL(12,2) NULL DEFAULT 0.00,
        volumen_total DECIMAL(12,3) NULL DEFAULT 0.000,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_viaje_orden (viaje, orden),
        INDEX idx_viaje (viaje),
        INDEX idx_orden (orden),
        INDEX idx_es_retorno (es_retorno)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

    async function ensureTables(req) {
        const tenantId = (req && req.tenantId) ? req.tenantId : 'default';
        if (_tenantsInitSet.has(tenantId)) return;
        try {
            const tdb = getDb(req);
            if (!tdb) return;
            await tdb.query(TABLE_SQL);
            await tdb.query(TABLE_RUTAS_SQL);
            try {
                await tdb.query("ALTER TABLE operaciones_ordenes_viaje ADD COLUMN peso DECIMAL(12,2) NULL DEFAULT 0.00 AFTER placa_remolque");
            } catch (ignore) {}
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

            const { q, placa, limit, vista } = req.query;

            // Si se solicita la vista detallada por orden de servicio / ruta:
            if (vista === 'rutas' || vista === 'detalle') {
                let sql = `
                    SELECT 
                        r.id,
                        r.viaje,
                        r.orden,
                        r.ruta,
                        r.tipo_servicio,
                        r.es_retorno,
                        r.peso_total,
                        r.cantidad_total,
                        r.volumen_total,
                        ov.fecha_viaje,
                        ov.conductor,
                        ov.placa_tracto,
                        ov.placa_remolque,
                        ov.estado
                    FROM operaciones_ordenes_viaje_rutas r
                    LEFT JOIN operaciones_ordenes_viaje ov ON r.viaje = ov.viaje
                    WHERE 1=1
                `;
                const params = [];

                if (q && String(q).trim()) {
                    const search = `%${String(q).trim()}%`;
                    sql += ` AND (r.viaje LIKE ? OR r.orden LIKE ? OR r.ruta LIKE ? OR r.tipo_servicio LIKE ? OR ov.conductor LIKE ? OR ov.placa_tracto LIKE ? OR ov.placa_remolque LIKE ?)`;
                    params.push(search, search, search, search, search, search, search);
                }

                if (placa && String(placa).trim()) {
                    sql += ` AND (ov.placa_tracto = ? OR ov.placa_remolque = ?)`;
                    params.push(String(placa).trim(), String(placa).trim());
                }

                sql += ` ORDER BY ov.fecha_viaje DESC, r.viaje DESC, r.es_retorno ASC, r.id ASC LIMIT ?`;
                params.push(parseInt(limit, 10) || 2000);

                const [rows] = await tdb.query(sql, params);
                return res.json({ ok: true, data: rows });
            }

            // Vista agrupada por Viaje (con resumen de órdenes y pesos de ida/retorno)
            let sql = `
                SELECT 
                    ov.id,
                    ov.id_remoto,
                    ov.viaje,
                    DATE_FORMAT(ov.fecha_viaje, '%Y-%m-%d %H:%i:%s') AS fecha_viaje,
                    ov.id_conductor,
                    ov.conductor,
                    ov.placa_tracto,
                    ov.placa_remolque,
                    ov.peso,
                    ov.ruta,
                    ov.origen,
                    ov.destino,
                    ov.estado,
                    COALESCE(r_agg.cant_ordenes, 0) AS cant_ordenes,
                    COALESCE(r_agg.peso_ida, 0) AS peso_ida,
                    COALESCE(r_agg.peso_retorno, 0) AS peso_retorno,
                    COALESCE(r_agg.peso_total_calc, ov.peso, 0) AS peso_total_rutas,
                    r_agg.ordenes_list,
                    r_agg.rutas_list
                FROM operaciones_ordenes_viaje ov
                LEFT JOIN (
                    SELECT 
                        viaje,
                        COUNT(DISTINCT orden) AS cant_ordenes,
                        SUM(CASE WHEN es_retorno = 0 THEN peso_total ELSE 0 END) AS peso_ida,
                        SUM(CASE WHEN es_retorno = 1 THEN peso_total ELSE 0 END) AS peso_retorno,
                        SUM(peso_total) AS peso_total_calc,
                        GROUP_CONCAT(DISTINCT orden ORDER BY orden SEPARATOR ', ') AS ordenes_list,
                        GROUP_CONCAT(DISTINCT CONCAT(CASE WHEN es_retorno=1 THEN '[RETORNO] ' ELSE '[IDA] ' END, ruta) ORDER BY es_retorno ASC SEPARATOR ' | ') AS rutas_list
                    FROM operaciones_ordenes_viaje_rutas
                    GROUP BY viaje
                ) r_agg ON ov.viaje = r_agg.viaje
                WHERE 1=1
            `;
            const params = [];

            if (q && String(q).trim()) {
                const search = `%${String(q).trim()}%`;
                sql += ` AND (ov.viaje LIKE ? OR ov.conductor LIKE ? OR ov.placa_tracto LIKE ? OR ov.placa_remolque LIKE ? OR ov.ruta LIKE ? OR r_agg.ordenes_list LIKE ? OR r_agg.rutas_list LIKE ?)`;
                params.push(search, search, search, search, search, search, search);
            }

            if (placa && String(placa).trim()) {
                sql += ` AND (ov.placa_tracto = ? OR ov.placa_remolque = ?)`;
                params.push(String(placa).trim(), String(placa).trim());
            }

            sql += ` ORDER BY ov.fecha_viaje DESC, ov.id DESC LIMIT ?`;
            params.push(parseInt(limit, 10) || 1500);

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
            
            // Adjuntar rutas de la orden de viaje
            const [rutas] = await tdb.query(
                `SELECT * FROM operaciones_ordenes_viaje_rutas WHERE viaje = ? ORDER BY es_retorno ASC, id ASC`,
                [req.params.viaje]
            );

            const resultado = rows[0];
            resultado.rutas_detalle = rutas;
            res.json({ ok: true, data: resultado });
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
                return res.json({
                    ok: true,
                    syncSkipped: true,
                    insertados: 0,
                    actualizados: 0,
                    message: 'La sincronización remota de órdenes de viaje solo aplica para la empresa Marsisa.'
                });
            }

            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos local no disponible' });

            const remoteDb = getRemoteDb();

            // 1. Extraer viajes principales preservando la fecha y hora literal exacta de Marsisa
            const queryViajes = `
                SELECT 
                    ov.id_viaje,
                    ov.viaje,
                    DATE_FORMAT(ov.fecha_viaje, '%Y-%m-%d %H:%i:%s') AS fecha_viaje,
                    ov.id_conductor,
                    ov.conductor,
                    ov.placa_vehiculo AS placa_tracto,
                    ov.placa_remolque,
                    COALESCE(ov.peso_total, 0) AS peso,
                    COALESCE(NULLIF(ov.viaje_rutas, ''), '') AS ruta
                FROM vw_combustible_orden_viaje ov
                ORDER BY ov.fecha_viaje DESC
                LIMIT 2500
            `;

            const [viajesRemotos] = await remoteDb.query(queryViajes);

            // 2. Extraer detalle de rutas y órdenes de servicio desde vw_combustible_orden_viaje_ruta
            const queryRutas = `
                SELECT 
                    viaje,
                    orden,
                    COALESCE(ruta, '') AS ruta,
                    COALESCE(tipo_servicio, '') AS tipo_servicio,
                    COALESCE(es_retorno, 0) AS es_retorno,
                    COALESCE(peso_total, 0) AS peso_total,
                    COALESCE(cantidad_total, 0) AS cantidad_total,
                    COALESCE(volumen_total, 0) AS volumen_total
                FROM vw_combustible_orden_viaje_ruta
                ORDER BY serie_viaje DESC, numero_viaje DESC
                LIMIT 4000
            `;

            const [rutasRemotas] = await remoteDb.query(queryRutas);

            let insertados = 0;
            let actualizados = 0;

            // Guardar Viajes Principales
            if (viajesRemotos && viajesRemotos.length) {
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
                        const peso = parseFloat(v.peso) || 0;
                        const ruta = String(v.ruta || '').trim();

                        placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        values.push(
                            v.id_viaje || null,
                            viajeStr,
                            v.fecha_viaje || null,
                            v.id_conductor || null,
                            cond,
                            placaT,
                            placaR,
                            peso,
                            ruta
                        );
                    }

                    if (!placeholders.length) continue;

                    const batchSql = `
                        INSERT INTO operaciones_ordenes_viaje 
                            (id_remoto, viaje, fecha_viaje, id_conductor, conductor, placa_tracto, placa_remolque, peso, ruta)
                        VALUES ${placeholders.join(', ')}
                        ON DUPLICATE KEY UPDATE
                            id_remoto = VALUES(id_remoto),
                            fecha_viaje = VALUES(fecha_viaje),
                            id_conductor = VALUES(id_conductor),
                            conductor = VALUES(conductor),
                            placa_tracto = VALUES(placa_tracto),
                            placa_remolque = VALUES(placa_remolque),
                            peso = VALUES(peso),
                            ruta = CASE WHEN VALUES(ruta) != '' THEN VALUES(ruta) ELSE ruta END
                    `;

                    const [resBatch] = await tdb.query(batchSql, values);
                    insertados += resBatch.affectedRows;
                }
            }

            // Guardar Detalle de Órdenes de Servicio / Rutas
            let rutasInsertadas = 0;
            if (rutasRemotas && rutasRemotas.length) {
                const chunkSizeR = 100;
                for (let i = 0; i < rutasRemotas.length; i += chunkSizeR) {
                    const chunkR = rutasRemotas.slice(i, i + chunkSizeR);
                    const valR = [];
                    const phR = [];

                    for (const r of chunkR) {
                        if (!r.viaje || !r.orden) continue;
                        phR.push('(?, ?, ?, ?, ?, ?, ?, ?)');
                        valR.push(
                            String(r.viaje).trim(),
                            String(r.orden).trim(),
                            String(r.ruta || '').trim(),
                            String(r.tipo_servicio || '').trim(),
                            parseInt(r.es_retorno, 10) || 0,
                            parseFloat(r.peso_total) || 0,
                            parseFloat(r.cantidad_total) || 0,
                            parseFloat(r.volumen_total) || 0
                        );
                    }

                    if (!phR.length) continue;

                    const batchRutasSql = `
                        INSERT INTO operaciones_ordenes_viaje_rutas
                            (viaje, orden, ruta, tipo_servicio, es_retorno, peso_total, cantidad_total, volumen_total)
                        VALUES ${phR.join(', ')}
                        ON DUPLICATE KEY UPDATE
                            ruta = VALUES(ruta),
                            tipo_servicio = VALUES(tipo_servicio),
                            es_retorno = VALUES(es_retorno),
                            peso_total = VALUES(peso_total),
                            cantidad_total = VALUES(cantidad_total),
                            volumen_total = VALUES(volumen_total)
                    `;

                    const [resR] = await tdb.query(batchRutasSql, valR);
                    rutasInsertadas += resR.affectedRows;
                }
            }

            if (logAudit) {
                logAudit({
                    req,
                    accion: 'SINCRONIZAR_ORDENES_VIAJE',
                    modulo: 'OPERACIONES',
                    detalle: `Sincronizados ${viajesRemotos.length} viajes y ${rutasRemotas.length} órdenes/rutas.`
                });
            }

            res.json({
                ok: true,
                total_viajes_remoto: viajesRemotos.length,
                total_rutas_remoto: rutasRemotas.length,
                insertados,
                rutas_procesadas: rutasInsertadas,
                message: `Sincronización exitosa: ${viajesRemotos.length} viajes y ${rutasRemotas.length} órdenes de servicio/rutas procesadas.`
            });
        } catch (err) {
            console.error('Error al sincronizar ordenes de viaje:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
