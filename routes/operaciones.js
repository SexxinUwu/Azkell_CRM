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

    // ── GET /api/operaciones/reporte-viajes ───────────────────────────
    // Reporte consolidado: N° Viaje, Fecha (solo fecha), Placas, Motor, Ruta, Peso Ida/Retorno y Galones Teóricos Matriz D2
    router.get('/reporte-viajes', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            // 1. Obtener matriz de combustible D2 para cálculo dinámico
            let matrizD2 = [];
            try {
                const [mRows] = await tdb.query("SELECT * FROM combustible_matriz_d2 WHERE estado = 'ACTIVO'");
                matrizD2 = mRows || [];
            } catch (mErr) {
                console.warn('Advertencia: no se pudo cargar matriz D2 en reporte-viajes:', mErr.message);
            }

            // 2. Traer todos los viajes con sus detalles de rutas y motor de la placa
            const sql = `
                SELECT 
                    ov.id,
                    ov.viaje,
                    DATE_FORMAT(ov.fecha_viaje, '%Y-%m-%d') AS fecha,
                    DATE_FORMAT(ov.fecha_viaje, '%Y-%m-%d %H:%i:%s') AS fecha_viaje,
                    ov.placa_tracto,
                    ov.placa_remolque,
                    ov.conductor,
                    ov.peso AS peso_cabecera,
                    ov.ruta AS ruta_cabecera,
                    ov.estado,
                    COALESCE(p.modelo_motor, p.sub_tipo, 'MC11.44') AS modelo_motor,
                    COALESCE(p.configuracion, 'T3') AS configuracion_tracto
                FROM operaciones_ordenes_viaje ov
                LEFT JOIN placas p ON ov.placa_tracto = p.placa
                ORDER BY ov.fecha_viaje DESC, ov.id DESC
                LIMIT 2000
            `;

            const [viajes] = await tdb.query(sql);
            if (!viajes || viajes.length === 0) {
                return res.json({ ok: true, data: [] });
            }

            // 3. Traer detalle de rutas para los viajes obtenidos
            const viajesCodigos = viajes.map(v => v.viaje).filter(Boolean);
            let rutasMap = new Map(); // viaje -> array de rutas

            if (viajesCodigos.length > 0) {
                // Fragmentar en lotes si es necesario
                const chunkSize = 500;
                for (let i = 0; i < viajesCodigos.length; i += chunkSize) {
                    const chunk = viajesCodigos.slice(i, i + chunkSize);
                    const placeholders = chunk.map(() => '?').join(',');
                    const [rutasRows] = await tdb.query(
                        `SELECT viaje, orden, ruta, tipo_servicio, es_retorno, peso_total, cantidad_total, volumen_total 
                         FROM operaciones_ordenes_viaje_rutas 
                         WHERE viaje IN (${placeholders}) 
                         ORDER BY es_retorno ASC, id ASC`,
                        chunk
                    );
                    (rutasRows || []).forEach(r => {
                        if (!rutasMap.has(r.viaje)) rutasMap.set(r.viaje, []);
                        rutasMap.get(r.viaje).push(r);
                    });
                }
            }

            // Helper para calcular consumo teórico de galones contra la matriz D2
            function calcularGalonesTeoricos(rutaStr, sentidoStr, pesoTn, motorStr) {
                if (!matrizD2 || matrizD2.length === 0 || !rutaStr) return 0;
                const cleanRuta = String(rutaStr).toUpperCase().trim();
                const cleanSentido = (sentidoStr || 'IDA').toUpperCase().trim();
                const cleanMotor = (motorStr || '').toUpperCase().trim();

                // Buscar coincidencia en la matriz
                let match = matrizD2.find(m => {
                    const mRuta = (m.ruta || '').toUpperCase().trim();
                    const mSentido = (m.sentido || '').toUpperCase().trim();
                    const mMotor = (m.motor || '').toUpperCase().trim();
                    const matchRuta = cleanRuta.includes(mRuta) || mRuta.includes(cleanRuta);
                    const matchMotor = !cleanMotor || mMotor.includes(cleanMotor) || cleanMotor.includes(mMotor);
                    return matchRuta && mSentido === cleanSentido && matchMotor;
                });

                // Si no coincide con motor específico, buscar con cualquier motor disponible en esa ruta
                if (!match) {
                    match = matrizD2.find(m => {
                        const mRuta = (m.ruta || '').toUpperCase().trim();
                        const mSentido = (m.sentido || '').toUpperCase().trim();
                        return (cleanRuta.includes(mRuta) || mRuta.includes(cleanRuta)) && mSentido === cleanSentido;
                    });
                }

                if (!match) return 0;

                // Interpolar según tonelaje
                const p = Math.max(0, parseFloat(pesoTn) || 0);
                if (p <= 0) return parseFloat(match.km_0) || 0;
                if (p <= 5) return parseFloat(match.km_5) || 0;
                if (p <= 10) return parseFloat(match.km_10) || 0;
                if (p <= 15) return parseFloat(match.km_15) || 0;
                if (p <= 20) return parseFloat(match.km_20) || 0;
                if (p <= 25) return parseFloat(match.km_25) || 0;
                return parseFloat(match.km_30) || 0;
            }

            // 4. Armar estructura enriquecida para cada viaje
            const resultado = viajes.map(v => {
                const rutas = rutasMap.get(v.viaje) || [];
                const rutasIda = rutas.filter(r => parseInt(r.es_retorno, 10) === 0);
                const rutasRetorno = rutas.filter(r => parseInt(r.es_retorno, 10) === 1);

                // Pesos
                const pesoIda = rutasIda.reduce((sum, r) => sum + (parseFloat(r.peso_total) || 0), 0);
                const pesoRetorno = rutasRetorno.reduce((sum, r) => sum + (parseFloat(r.peso_total) || 0), 0);
                const pesoTotal = (pesoIda + pesoRetorno) > 0 ? (pesoIda + pesoRetorno) : (parseFloat(v.peso_cabecera) || 0);

                // Rutas textos
                const rutaIdaTexto = rutasIda.length > 0 
                    ? rutasIda.map(r => r.ruta).join(' | ') 
                    : (v.ruta_cabecera || 'LIMA - DESTINO');

                let rutaRetornoTexto = rutasRetorno.length > 0 
                    ? rutasRetorno.map(r => r.ruta).join(' | ') 
                    : '';

                // Si no tiene retorno registrado, generar el retorno de la ruta de ida
                if (!rutaRetornoTexto && rutaIdaTexto) {
                    const partes = rutaIdaTexto.split(' - ');
                    rutaRetornoTexto = partes.length === 2 ? `${partes[1]} - ${partes[0]}` : `RETORNO ${rutaIdaTexto}`;
                }

                // Cálculo de Galones Teóricos
                const galonesIda = calcularGalonesTeoricos(rutaIdaTexto, 'IDA', pesoIda, v.modelo_motor);
                const galonesRetorno = calcularGalonesTeoricos(rutaRetornoTexto, 'RETORNO', pesoRetorno, v.modelo_motor);

                // Descuento -10% si va sin carreta (solo tracto)
                const esSinCarreta = !v.placa_remolque || v.placa_remolque.trim() === '' || v.placa_remolque === '—';
                let galonesTotal = (galonesIda + galonesRetorno);
                if (esSinCarreta && galonesTotal > 0) {
                    galonesTotal = galonesTotal * 0.90;
                }

                return {
                    id: v.id,
                    viaje: v.viaje,
                    fecha: v.fecha || '---',
                    fecha_viaje: v.fecha_viaje,
                    placa_tracto: v.placa_tracto || '---',
                    placa_remolque: v.placa_remolque || '',
                    es_sin_carreta: esSinCarreta,
                    conductor: v.conductor || '---',
                    modelo_motor: v.modelo_motor || 'MC11.44',
                    ruta_principal: v.ruta_cabecera || rutaIdaTexto,
                    
                    // Detalle IDA
                    ida: {
                        ruta: rutaIdaTexto,
                        peso_tn: +(pesoIda / 1000).toFixed(2),
                        peso_kg: pesoIda,
                        ordenes: rutasIda.map(r => r.orden).filter(Boolean),
                        galones_estimados: +galonesIda.toFixed(2)
                    },

                    // Detalle RETORNO (si no tiene carga peso_tn es 0.00)
                    retorno: {
                        ruta: rutaRetornoTexto,
                        peso_tn: +(pesoRetorno / 1000).toFixed(2),
                        peso_kg: pesoRetorno,
                        ordenes: rutasRetorno.map(r => r.orden).filter(Boolean),
                        galones_estimados: +galonesRetorno.toFixed(2)
                    },

                    // Consolidado
                    peso_total_tn: +(pesoTotal / 1000).toFixed(2),
                    peso_total_kg: pesoTotal,
                    galones_teoricos_total: +galonesTotal.toFixed(2),
                    estado: v.estado || 'ACTIVO'
                };
            });

            res.json({ ok: true, data: resultado });
        } catch (err) {
            console.error('Error al generar reporte de viajes:', err);
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
