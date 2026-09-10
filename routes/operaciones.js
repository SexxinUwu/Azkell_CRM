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
        ubigeo_partida VARCHAR(10) NULL,
        direccion_partida VARCHAR(255) NULL,
        ubigeo_llegada VARCHAR(10) NULL,
        direccion_llegada VARCHAR(255) NULL,
        escolta VARCHAR(150) NULL,
        observaciones TEXT NULL,
        estado VARCHAR(30) NOT NULL DEFAULT 'ACTIVO',
        fecha_inicio DATETIME NULL,
        fecha_fin DATETIME NULL,
        usuario_creacion VARCHAR(150) NULL DEFAULT 'ADMINISTRADOR DEL SISTEMA',
        usuario_finalizacion VARCHAR(150) NULL,
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

    // Tablas exclusivas para Operaciones Marsisa (Sincronización remota externa)
    const TABLE_MARSISA_SQL = `CREATE TABLE IF NOT EXISTS marsisa_ordenes_viaje (
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

    const TABLE_MARSISA_RUTAS_SQL = `CREATE TABLE IF NOT EXISTS marsisa_ordenes_viaje_rutas (
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

    // Tabla principal de Órdenes de Servicio
    const TABLE_ORDENES_SERVICIO_SQL = `CREATE TABLE IF NOT EXISTS operaciones_ordenes_servicio (
        id INT AUTO_INCREMENT PRIMARY KEY,
        serie VARCHAR(10) NOT NULL DEFAULT '2026',
        numero VARCHAR(20) NOT NULL,
        codigo_orden VARCHAR(40) NOT NULL,
        fecha DATE NOT NULL,
        fecha_fin DATE NULL,
        moneda VARCHAR(20) DEFAULT 'SOLES',
        tipo_cambio DECIMAL(8,3) DEFAULT 3.750,
        tipo_contratacion VARCHAR(50) DEFAULT 'CLIENTE DIRECTO',
        modalidad_ejecucion VARCHAR(50) DEFAULT 'PROPIO',
        cliente_id INT NULL,
        cliente_nombre VARCHAR(255) NOT NULL,
        tipo_servicio VARCHAR(100) DEFAULT 'CARGA GENERAL',
        tipo_costo VARCHAR(50) DEFAULT 'POR VIAJE',
        impuesto VARCHAR(50) DEFAULT 'IGV 18%',
        costo_flete DECIMAL(12,2) DEFAULT 0.00,
        puntos_carga INT DEFAULT 1,
        puntos_destino INT DEFAULT 1,
        destinatario VARCHAR(255) NULL,
        sustento_url VARCHAR(255) NULL,
        observaciones TEXT NULL,
        viaje_asignado VARCHAR(60) NULL,
        estado_viaje VARCHAR(30) DEFAULT 'Sin asignar',
        estado_servicio VARCHAR(30) DEFAULT 'INICIADO',
        estado_descarga VARCHAR(30) DEFAULT 'PENDIENTE',
        conductor VARCHAR(150) NULL,
        placa_tracto VARCHAR(20) NULL,
        placa_carreta VARCHAR(20) NULL,
        ruta_sistema VARCHAR(255) NULL,
        tipo_medida VARCHAR(50) DEFAULT 'VIAJE',
        costo_medida DECIMAL(12,2) DEFAULT 0.00,
        cargos_adicionales DECIMAL(12,2) DEFAULT 0.00,
        descuentos DECIMAL(12,2) DEFAULT 0.00,
        subtotal DECIMAL(12,2) DEFAULT 0.00,
        igv DECIMAL(12,2) DEFAULT 0.00,
        kilometraje_fin INT NULL,
        usuario_creacion VARCHAR(100) DEFAULT 'ADMINISTRADOR',
        factura VARCHAR(60) NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_codigo_orden (codigo_orden),
        INDEX idx_fecha (fecha),
        INDEX idx_cliente (cliente_nombre),
        INDEX idx_viaje (viaje_asignado)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

    // Tabla de Documentos / Guías asociadas a la Orden de Servicio
    const TABLE_ORDENES_SERVICIO_DOCS_SQL = `CREATE TABLE IF NOT EXISTS operaciones_ordenes_servicio_docs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        orden_servicio_id INT NOT NULL,
        codigo_orden VARCHAR(40) NOT NULL,
        guia_remision_id INT NULL,
        numero_documento VARCHAR(50) NOT NULL,
        tipo_documento VARCHAR(50) DEFAULT 'GRE',
        gr_remitente VARCHAR(50) NULL,
        numero_transporte VARCHAR(50) NULL,
        placa_referencia VARCHAR(20) NULL,
        volumen DECIMAL(12,3) DEFAULT 0.000,
        cantidad DECIMAL(12,2) DEFAULT 0.00,
        peso DECIMAL(12,2) DEFAULT 0.00,
        remitente VARCHAR(255) NULL,
        destinatario VARCHAR(255) NULL,
        fecha_carga DATE NULL,
        fecha_entrega DATE NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_os_id (orden_servicio_id),
        INDEX idx_os_codigo (codigo_orden),
        INDEX idx_guia_id (guia_remision_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

    async function ensureTables(req) {
        const tenantId = (req && req.tenantId) ? req.tenantId : 'default';
        if (_tenantsInitSet.has(tenantId)) return;
        try {
            const tdb = getDb(req);
            if (!tdb) return;
            await tdb.query(TABLE_SQL);
            await tdb.query(TABLE_RUTAS_SQL);
            await tdb.query(TABLE_MARSISA_SQL);
            await tdb.query(TABLE_MARSISA_RUTAS_SQL);
            await tdb.query(TABLE_ORDENES_SERVICIO_SQL);
            await tdb.query(TABLE_ORDENES_SERVICIO_DOCS_SQL);
            try {
                await tdb.query("ALTER TABLE operaciones_ordenes_viaje ADD COLUMN peso DECIMAL(12,2) NULL DEFAULT 0.00 AFTER placa_remolque");
            } catch (ignore) {}
            try {
                await tdb.query("ALTER TABLE operaciones_ordenes_viaje ADD COLUMN ubigeo_partida VARCHAR(10) NULL AFTER destino, ADD COLUMN direccion_partida VARCHAR(255) NULL AFTER ubigeo_partida, ADD COLUMN ubigeo_llegada VARCHAR(10) NULL AFTER direccion_partida, ADD COLUMN direccion_llegada VARCHAR(255) NULL AFTER ubigeo_llegada, ADD COLUMN escolta VARCHAR(150) NULL AFTER direccion_llegada, ADD COLUMN observaciones TEXT NULL AFTER escolta");
            } catch (ignore) {}
            try {
                await tdb.query("ALTER TABLE operaciones_ordenes_viaje ADD COLUMN fecha_inicio DATETIME NULL AFTER estado, ADD COLUMN fecha_fin DATETIME NULL AFTER fecha_inicio, ADD COLUMN kilometraje_inicial INT NULL AFTER fecha_fin, ADD COLUMN kilometraje_final INT NULL AFTER kilometraje_inicial, ADD COLUMN horas_motor_remolque INT NULL AFTER kilometraje_final, ADD COLUMN usuario_creacion VARCHAR(150) NULL DEFAULT 'ADMINISTRADOR DEL SISTEMA' AFTER horas_motor_remolque, ADD COLUMN usuario_finalizacion VARCHAR(150) NULL AFTER usuario_creacion");
            } catch (ignore) {}
            try {
                await tdb.query("ALTER TABLE operaciones_ordenes_viaje ADD COLUMN kilometraje_inicial INT NULL AFTER fecha_fin, ADD COLUMN kilometraje_final INT NULL AFTER kilometraje_inicial, ADD COLUMN horas_motor_remolque INT NULL AFTER kilometraje_final");
            } catch (ignore) {}
            try {
                await tdb.query("ALTER TABLE operaciones_ordenes_viaje ADD COLUMN horas_motor_remolque INT NULL AFTER kilometraje_final");
            } catch (ignore) {}
            try {
                await tdb.query(`ALTER TABLE operaciones_ordenes_servicio 
                    ADD COLUMN ruta_sistema VARCHAR(255) NULL AFTER placa_carreta,
                    ADD COLUMN tipo_medida VARCHAR(50) DEFAULT 'VIAJE' AFTER ruta_sistema,
                    ADD COLUMN costo_medida DECIMAL(12,2) DEFAULT 0.00 AFTER tipo_medida,
                    ADD COLUMN cargos_adicionales DECIMAL(12,2) DEFAULT 0.00 AFTER costo_medida,
                    ADD COLUMN descuentos DECIMAL(12,2) DEFAULT 0.00 AFTER cargos_adicionales,
                    ADD COLUMN subtotal DECIMAL(12,2) DEFAULT 0.00 AFTER descuentos,
                    ADD COLUMN igv DECIMAL(12,2) DEFAULT 0.00 AFTER subtotal,
                    ADD COLUMN kilometraje_fin INT NULL AFTER igv,
                    ADD COLUMN usuario_creacion VARCHAR(100) DEFAULT 'ADMINISTRADOR' AFTER kilometraje_fin,
                    ADD COLUMN factura VARCHAR(60) NULL AFTER usuario_creacion
                `);
            } catch (ignore) {}
            _tenantsInitSet.add(tenantId);
        } catch (err) {
            console.error('Error asegurando tablas de operaciones:', err);
        }
    }

    // ── GET /api/operaciones/ordenes-viaje ────────────────────────
    router.get('/ordenes-viaje', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const { q, placa, limit, vista, fecha_desde, fecha_hasta } = req.query;

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

                if (fecha_desde) {
                    sql += ` AND DATE(ov.fecha_viaje) >= ?`;
                    params.push(fecha_desde);
                }
                if (fecha_hasta) {
                    sql += ` AND DATE(ov.fecha_viaje) <= ?`;
                    params.push(fecha_hasta);
                }

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
                    ov.ubigeo_partida,
                    ov.direccion_partida,
                    ov.ubigeo_llegada,
                    ov.direccion_llegada,
                    ov.escolta,
                    ov.observaciones,
                    ov.estado,
                    DATE_FORMAT(ov.fecha_inicio, '%Y-%m-%d %H:%i:%s') AS fecha_inicio,
                    DATE_FORMAT(ov.fecha_fin, '%Y-%m-%d %H:%i:%s') AS fecha_fin,
                    ov.kilometraje_inicial,
                    ov.kilometraje_final,
                    ov.horas_motor_remolque,
                    ov.usuario_creacion,
                    ov.usuario_finalizacion,
                    DATE_FORMAT(ov.creado_en, '%Y-%m-%d %H:%i:%s') AS fecha_registro,
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

            if (fecha_desde) {
                sql += ` AND DATE(ov.fecha_viaje) >= ?`;
                params.push(fecha_desde);
            }
            if (fecha_hasta) {
                sql += ` AND DATE(ov.fecha_viaje) <= ?`;
                params.push(fecha_hasta);
            }

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

    // ── GET /api/operaciones/ordenes-viaje/correlativo ────────────
    // Devuelve el año serie actual y el siguiente número correlativo formateado (ej. 00000992)
    router.get('/ordenes-viaje/correlativo', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const year = new Date().getFullYear();
            const prefix = `${year}-`;

            const [rows] = await tdb.query(
                `SELECT viaje FROM operaciones_ordenes_viaje WHERE viaje LIKE ? ORDER BY viaje DESC LIMIT 1`,
                [`${prefix}%`]
            );

            let nextNum = 1;
            if (rows && rows.length > 0) {
                const numStr = rows[0].viaje.replace(prefix, '');
                const parsed = parseInt(numStr, 10);
                if (!isNaN(parsed)) {
                    nextNum = parsed + 1;
                }
            }

            const formattedNum = String(nextNum).padStart(8, '0');
            res.json({
                ok: true,
                serie: String(year),
                numero: formattedNum,
                viaje: `${year}-${formattedNum}`
            });
        } catch (err) {
            console.error('Error al obtener correlativo de viaje:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/operaciones/ordenes-viaje ────────────────────────
    // Registra una nueva Orden de Viaje generada desde el módulo de Operaciones propio
    router.post('/ordenes-viaje', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const {
                serie,
                numero,
                viaje,
                fecha_viaje,
                id_conductor,
                conductor,
                placa_tracto,
                placa_remolque,
                ruta,
                peso,
                ubigeo_partida,
                direccion_partida,
                ubigeo_llegada,
                direccion_llegada,
                escolta,
                observaciones,
                usuario_creacion,
                kilometraje_inicial,
                horas_motor_remolque,
                rutas // array opcional con órdenes de servicio / rutas
            } = req.body;

            const codeViaje = (viaje && String(viaje).trim()) 
                ? String(viaje).trim().toUpperCase() 
                : `${serie || new Date().getFullYear()}-${String(numero || '1').padStart(8, '0')}`;

            if (!placa_tracto || !conductor) {
                return res.status(400).json({ ok: false, error: 'Conductor y Vehículo (Tracto) son obligatorios.' });
            }

            const fechaFinal = fecha_viaje || new Date().toISOString().slice(0, 19).replace('T', ' ');
            const userCreador = usuario_creacion || (req.user && req.user.nombre) || 'ADMINISTRADOR DEL SISTEMA';

            const kmIniVal = kilometraje_inicial ? parseInt(kilometraje_inicial, 10) : null;
            const hrRemVal = horas_motor_remolque ? parseInt(horas_motor_remolque, 10) : null;

            const [insertRes] = await tdb.query(`
                INSERT INTO operaciones_ordenes_viaje (
                    viaje, fecha_viaje, id_conductor, conductor,
                    placa_tracto, placa_remolque, peso, ruta,
                    ubigeo_partida, direccion_partida, ubigeo_llegada, direccion_llegada,
                    escolta, observaciones, estado, usuario_creacion,
                    kilometraje_inicial, horas_motor_remolque
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    fecha_viaje = VALUES(fecha_viaje),
                    id_conductor = VALUES(id_conductor),
                    conductor = VALUES(conductor),
                    placa_tracto = VALUES(placa_tracto),
                    placa_remolque = VALUES(placa_remolque),
                    peso = VALUES(peso),
                    ruta = VALUES(ruta),
                    ubigeo_partida = VALUES(ubigeo_partida),
                    direccion_partida = VALUES(direccion_partida),
                    ubigeo_llegada = VALUES(ubigeo_llegada),
                    direccion_llegada = VALUES(direccion_llegada),
                    escolta = VALUES(escolta),
                    observaciones = VALUES(observaciones),
                    usuario_creacion = COALESCE(operaciones_ordenes_viaje.usuario_creacion, VALUES(usuario_creacion)),
                    kilometraje_inicial = COALESCE(VALUES(kilometraje_inicial), operaciones_ordenes_viaje.kilometraje_inicial),
                    horas_motor_remolque = COALESCE(VALUES(horas_motor_remolque), operaciones_ordenes_viaje.horas_motor_remolque)
            `, [
                codeViaje,
                fechaFinal,
                id_conductor || null,
                String(conductor).trim().toUpperCase(),
                String(placa_tracto).trim().toUpperCase(),
                placa_remolque ? String(placa_remolque).trim().toUpperCase() : null,
                parseFloat(peso) || 0.00,
                ruta ? String(ruta).trim() : null,
                ubigeo_partida || null,
                direccion_partida || null,
                ubigeo_llegada || null,
                direccion_llegada || null,
                escolta || null,
                observaciones || null,
                userCreador,
                kmIniVal,
                hrRemVal
            ]);

            // Si se envió detalle de rutas / órdenes
            if (Array.isArray(rutas) && rutas.length > 0) {
                for (const r of rutas) {
                    if (!r.orden) continue;
                    await tdb.query(`
                        INSERT INTO operaciones_ordenes_viaje_rutas (
                            viaje, orden, ruta, tipo_servicio, es_retorno, peso_total, cantidad_total, volumen_total
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            ruta = VALUES(ruta),
                            tipo_servicio = VALUES(tipo_servicio),
                            es_retorno = VALUES(es_retorno),
                            peso_total = VALUES(peso_total),
                            cantidad_total = VALUES(cantidad_total),
                            volumen_total = VALUES(volumen_total)
                    `, [
                        codeViaje,
                        String(r.orden).trim(),
                        String(r.ruta || ruta || '').trim(),
                        String(r.tipo_servicio || 'CARGA GENERAL').trim(),
                        parseInt(r.es_retorno, 10) || 0,
                        parseFloat(r.peso_total || peso) || 0.00,
                        parseFloat(r.cantidad_total) || 0.00,
                        parseFloat(r.volumen_total) || 0.000
                    ]);
                }
            }

            if (logAudit) {
                logAudit({
                    req,
                    accion: 'CREAR_ORDEN_VIAJE',
                    modulo: 'OPERACIONES',
                    detalle: `Creada Orden de Viaje ${codeViaje} (Tracto: ${placa_tracto}, Conductor: ${conductor}, KM: ${kmIniVal || '---'}, Horas Termoking: ${hrRemVal || '---'})`
                });
            }

            res.json({ ok: true, message: `Orden de Viaje ${codeViaje} registrada exitosamente.`, viaje: codeViaje });
        } catch (err) {
            console.error('Error al registrar orden de viaje:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── PUT /api/operaciones/ordenes-viaje/:viaje/iniciar ───────────
    router.put('/ordenes-viaje/:viaje/iniciar', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const codeViaje = req.params.viaje;
            const { fecha_inicio, kilometraje_inicial, horas_motor_remolque } = req.body;
            const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const fechaInicioSql = fecha_inicio ? (fecha_inicio.length <= 10 ? fecha_inicio + ' ' + nowStr.slice(11) : fecha_inicio) : nowStr;
            const kmIniVal = kilometraje_inicial ? parseInt(kilometraje_inicial, 10) : null;
            const hrRemVal = horas_motor_remolque ? parseInt(horas_motor_remolque, 10) : null;

            await tdb.query(`
                UPDATE operaciones_ordenes_viaje 
                SET estado = 'INICIADO',
                    fecha_inicio = ?,
                    fecha_viaje = COALESCE(?, fecha_viaje),
                    kilometraje_inicial = COALESCE(?, kilometraje_inicial),
                    horas_motor_remolque = COALESCE(?, horas_motor_remolque),
                    observaciones = CONCAT(COALESCE(observaciones, ''), IF(? IS NOT NULL, CONCAT(' [KM Inicial: ', ?, ']'), ''))
                WHERE viaje = ?
            `, [
                fechaInicioSql,
                fechaInicioSql,
                kmIniVal,
                hrRemVal,
                kmIniVal,
                kmIniVal,
                codeViaje
            ]);

            if (logAudit) {
                logAudit({
                    req,
                    accion: 'INICIAR_ORDEN_VIAJE',
                    modulo: 'OPERACIONES',
                    detalle: `Iniciada Orden de Viaje ${codeViaje} con KM: ${kmIniVal} / Horas Termoking: ${hrRemVal}`
                });
            }

            res.json({ ok: true, message: `El viaje ${codeViaje} ha sido iniciado exitosamente.` });
        } catch (err) {
            console.error('Error al iniciar viaje:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── PUT /api/operaciones/ordenes-viaje/:viaje/finalizar ─────────
    router.put('/ordenes-viaje/:viaje/finalizar', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const codeViaje = req.params.viaje;
            const { fecha_fin, kilometraje_final, usuario_finalizacion } = req.body;
            const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const fechaFinSql = fecha_fin ? (fecha_fin.length <= 10 ? fecha_fin + ' ' + nowStr.slice(11) : fecha_fin) : nowStr;
            const userFinaliza = usuario_finalizacion || (req.user && req.user.nombre) || 'ADMINISTRADOR DEL SISTEMA';

            await tdb.query(`
                UPDATE operaciones_ordenes_viaje 
                SET estado = 'FINALIZADO',
                    fecha_fin = ?,
                    kilometraje_final = ?,
                    usuario_finalizacion = ?,
                    observaciones = CONCAT(COALESCE(observaciones, ''), IF(? IS NOT NULL, CONCAT(' [KM Final: ', ?, ']'), ''))
                WHERE viaje = ?
            `, [
                fechaFinSql,
                kilometraje_final || null,
                userFinaliza,
                kilometraje_final,
                kilometraje_final,
                codeViaje
            ]);

            if (logAudit) {
                logAudit({
                    req,
                    accion: 'FINALIZAR_ORDEN_VIAJE',
                    modulo: 'OPERACIONES',
                    detalle: `Finalizada Orden de Viaje ${codeViaje} por ${userFinaliza}`
                });
            }

            res.json({ ok: true, message: `El viaje ${codeViaje} ha sido finalizado exitosamente.` });
        } catch (err) {
            console.error('Error al finalizar viaje:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── PUT /api/operaciones/ordenes-viaje/:viaje (Editar Orden de Viaje) ───
    router.put('/ordenes-viaje/:viaje', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const codeViaje = req.params.viaje;
            const {
                fecha_viaje,
                id_conductor,
                conductor,
                placa_tracto,
                placa_remolque,
                ruta,
                peso,
                ubigeo_partida,
                direccion_partida,
                ubigeo_llegada,
                direccion_llegada,
                escolta,
                observaciones,
                kilometraje_inicial,
                horas_motor_remolque
            } = req.body;

            if (!placa_tracto || !conductor) {
                return res.status(400).json({ ok: false, error: 'Conductor y Vehículo (Tracto) son obligatorios.' });
            }

            const kmIniVal = kilometraje_inicial !== undefined && kilometraje_inicial !== '' ? parseInt(kilometraje_inicial, 10) : null;
            const hrRemVal = horas_motor_remolque !== undefined && horas_motor_remolque !== '' ? parseInt(horas_motor_remolque, 10) : null;

            await tdb.query(`
                UPDATE operaciones_ordenes_viaje
                SET fecha_viaje = COALESCE(?, fecha_viaje),
                    id_conductor = ?,
                    conductor = ?,
                    placa_tracto = ?,
                    placa_remolque = ?,
                    ruta = ?,
                    peso = ?,
                    ubigeo_partida = ?,
                    direccion_partida = ?,
                    ubigeo_llegada = ?,
                    direccion_llegada = ?,
                    escolta = ?,
                    observaciones = ?,
                    kilometraje_inicial = COALESCE(?, kilometraje_inicial),
                    horas_motor_remolque = COALESCE(?, horas_motor_remolque)
                WHERE viaje = ?
            `, [
                fecha_viaje || null,
                id_conductor || null,
                String(conductor).trim().toUpperCase(),
                String(placa_tracto).trim().toUpperCase(),
                placa_remolque ? String(placa_remolque).trim().toUpperCase() : null,
                ruta ? String(ruta).trim() : null,
                parseFloat(peso) || 0.00,
                ubigeo_partida || null,
                direccion_partida || null,
                ubigeo_llegada || null,
                direccion_llegada || null,
                escolta || null,
                observaciones || null,
                kmIniVal,
                hrRemVal,
                codeViaje
            ]);

            if (logAudit) {
                logAudit({
                    req,
                    accion: 'EDITAR_ORDEN_VIAJE',
                    modulo: 'OPERACIONES',
                    detalle: `Actualizada Orden de Viaje ${codeViaje} (Tracto: ${placa_tracto}, Conductor: ${conductor})`
                });
            }

            res.json({ ok: true, message: `Orden de Viaje ${codeViaje} actualizada correctamente.` });
        } catch (err) {
            console.error('Error al editar orden de viaje:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── DELETE /api/operaciones/ordenes-viaje/:viaje (Eliminar Orden de Viaje) ───
    router.delete('/ordenes-viaje/:viaje', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const codeViaje = req.params.viaje;
            if (!codeViaje) {
                return res.status(400).json({ ok: false, error: 'El código de viaje es requerido.' });
            }

            // Verificar si el viaje existe
            const [rows] = await tdb.query('SELECT * FROM operaciones_ordenes_viaje WHERE viaje = ?', [codeViaje]);
            if (!rows || rows.length === 0) {
                return res.status(404).json({ ok: false, error: `No se encontró la orden de viaje ${codeViaje}.` });
            }

            // Eliminar rutas asociadas al viaje
            await tdb.query('DELETE FROM operaciones_ordenes_viaje_rutas WHERE viaje = ?', [codeViaje]);

            // Eliminar el viaje
            await tdb.query('DELETE FROM operaciones_ordenes_viaje WHERE viaje = ?', [codeViaje]);

            if (logAudit) {
                logAudit({
                    req,
                    accion: 'ELIMINAR_ORDEN_VIAJE',
                    modulo: 'OPERACIONES',
                    detalle: `Eliminada Orden de Viaje ${codeViaje}`
                });
            }

            res.json({ ok: true, message: `Orden de Viaje ${codeViaje} eliminada exitosamente.` });
        } catch (err) {
            console.error('Error al eliminar orden de viaje:', err);
            res.status(500).json({ ok: false, error: err.message });
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
                    COALESCE(NULLIF(TRIM(p.configuracion), ''), 'T3') AS configuracion_tracto,
                    COALESCE(NULLIF(TRIM(pr.configuracion), ''), '') AS configuracion_remolque
                FROM operaciones_ordenes_viaje ov
                LEFT JOIN placas p ON ov.placa_tracto = p.placa
                LEFT JOIN placas pr ON ov.placa_remolque = pr.placa
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

            // Normalizador de texto para emparejamiento flexible de rutas y motores
            function normalizarTexto(txt) {
                return (txt || '').toString().toUpperCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^A-Z0-9\s-]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            // Búsqueda inteligente en la Matriz D2 con soporte bidireccional (Ida/Retorno), validación de Motor y Configuración (confg)
            function buscarEnMatriz(rutaStr, sentidoStr, motorStr, confgStr) {
                if (!matrizD2 || matrizD2.length === 0 || !rutaStr) return null;

                const rutaNorm = normalizarTexto(rutaStr);
                const sentidoNorm = (sentidoStr || 'IDA').toUpperCase().trim();
                const motorNorm = normalizarTexto(motorStr);
                const confgNorm = normalizarTexto(confgStr);

                const partesRuta = rutaNorm.split('-').map(s => s.trim()).filter(Boolean);
                const origen = partesRuta[0] || '';
                const destino = partesRuta[partesRuta.length - 1] || partesRuta[0] || '';

                // Filtrar candidatos en la matriz que correspondan al tramo
                const candidatosRuta = matrizD2.filter(m => {
                    const mRuta = normalizarTexto(m.ruta);
                    const mPartes = mRuta.split('-').map(s => s.trim()).filter(Boolean);
                    const mOrigen = mPartes[0] || '';
                    const mDestino = mPartes[mPartes.length - 1] || '';

                    // 1. Coincidencia completa
                    if (rutaNorm.includes(mRuta) || mRuta.includes(rutaNorm)) return true;

                    // 2. Coincidencia bidireccional de origen y destino (e.g. HUANCAYO - LIMA con LIMA - HUANCAYO)
                    if (origen && destino && mOrigen && mDestino) {
                        if ((origen.includes(mOrigen) || mOrigen.includes(origen)) && (destino.includes(mDestino) || mDestino.includes(destino))) return true;
                        if ((origen.includes(mDestino) || mDestino.includes(origen)) && (destino.includes(mOrigen) || mOrigen.includes(destino))) return true;
                    }

                    // 3. Coincidencia por ciudad de destino
                    if (destino && mDestino && (destino.includes(mDestino) || mDestino.includes(destino))) return true;
                    if (origen && mDestino && (origen.includes(mDestino) || mDestino.includes(origen))) return true;

                    return false;
                });

                if (candidatosRuta.length === 0) return null;

                function matchMotorFn(mMotor) {
                    if (!motorNorm) return true;
                    const mNorm = normalizarTexto(mMotor);
                    if (!mNorm) return false;
                    if (mNorm === motorNorm || mNorm.includes(motorNorm) || motorNorm.includes(mNorm)) return true;
                    const tokenMatrix = mNorm.replace(/[^A-Z0-9]/g, '');
                    const tokenPlaca = motorNorm.replace(/[^A-Z0-9]/g, '');
                    if (tokenMatrix.includes(tokenPlaca) || tokenPlaca.includes(tokenMatrix)) return true;
                    const coreMatches = ['MC11', 'DC13', 'D13', 'D8', 'OM926', '6HK1', 'MX13', 'MAXXFORCE'];
                    for (const core of coreMatches) {
                        if (tokenMatrix.includes(core) && tokenPlaca.includes(core)) return true;
                    }
                    return false;
                }

                function matchConfgFn(mConfg) {
                    if (!confgNorm) return true;
                    const cNorm = normalizarTexto(mConfg);
                    if (!cNorm) return false;
                    return cNorm === confgNorm || cNorm.includes(confgNorm) || confgNorm.includes(cNorm);
                }

                // 1. Intentar coincidir sentido + motor + configuración
                let match = candidatosRuta.find(m => {
                    const mSentido = (m.sentido || 'IDA').toUpperCase().trim();
                    return mSentido === sentidoNorm && matchMotorFn(m.motor) && matchConfgFn(m.confg);
                });

                // 2. Intentar coincidir sentido + configuración (cualquier motor)
                if (!match) {
                    match = candidatosRuta.find(m => {
                        const mSentido = (m.sentido || 'IDA').toUpperCase().trim();
                        return mSentido === sentidoNorm && matchConfgFn(m.confg);
                    });
                }

                // 3. Intentar coincidir sentido + motor (cualquier configuración)
                if (!match) {
                    match = candidatosRuta.find(m => {
                        const mSentido = (m.sentido || 'IDA').toUpperCase().trim();
                        return mSentido === sentidoNorm && matchMotorFn(m.motor);
                    });
                }

                // 4. Intentar coincidir sentido (cualquiera de la ruta)
                if (!match) {
                    match = candidatosRuta.find(m => {
                        const mSentido = (m.sentido || 'IDA').toUpperCase().trim();
                        return mSentido === sentidoNorm;
                    });
                }

                // 5. Intentar coincidir motor + configuración en cualquier sentido
                if (!match) {
                    match = candidatosRuta.find(m => {
                        return matchMotorFn(m.motor) && matchConfgFn(m.confg);
                    });
                }

                // 6. Fallback al primer candidato de la ruta
                if (!match) {
                    match = candidatosRuta[0];
                }

                return match;
            }

            // Cálculo exacto de consumo según peso con redondeo hacia arriba y fallback al peso anterior si el escalón es 0.00
            function calcularGalonesTeoricos(rutaStr, sentidoStr, pesoTn, motorStr, confgStr) {
                const match = buscarEnMatriz(rutaStr, sentidoStr, motorStr, confgStr);
                if (!match) return 0;

                const p = Math.max(0, parseFloat(pesoTn) || 0);
                const fields = ['km_0', 'km_5', 'km_10', 'km_15', 'km_20', 'km_25', 'km_30'];

                let targetIdx = 0;
                if (p <= 0) targetIdx = 0;
                else if (p <= 5) targetIdx = 1;
                else if (p <= 10) targetIdx = 2;
                else if (p <= 15) targetIdx = 3;
                else if (p <= 20) targetIdx = 4;
                else if (p <= 25) targetIdx = 5;
                else targetIdx = 6;

                // 1. Intentar desde targetIdx hacia abajo (si el escalón actual es 0.00, usar el peso anterior no-cero)
                for (let i = targetIdx; i >= 0; i--) {
                    const val = parseFloat(match[fields[i]]);
                    if (val > 0) return val;
                }

                // 2. Si hacia abajo todos son 0, buscar hacia arriba
                for (let i = targetIdx + 1; i < fields.length; i++) {
                    const val = parseFloat(match[fields[i]]);
                    if (val > 0) return val;
                }

                return 0;
            }

            // 4. Armar estructura enriquecida para cada viaje
            const resultado = viajes.map(v => {
                const rutas = rutasMap.get(v.viaje) || [];
                const rutasIda = rutas.filter(r => parseInt(r.es_retorno, 10) === 0);
                const rutasRetorno = rutas.filter(r => parseInt(r.es_retorno, 10) === 1);

                // Pesos en KG
                let pesoIdaKg = rutasIda.reduce((sum, r) => sum + (parseFloat(r.peso_total) || 0), 0);
                const pesoRetornoKg = rutasRetorno.reduce((sum, r) => sum + (parseFloat(r.peso_total) || 0), 0);
                
                // Si pesoIda es 0 pero la cabecera tiene peso registrado y no hay retorno con peso, usar cabecera
                if (pesoIdaKg === 0 && pesoRetornoKg === 0 && parseFloat(v.peso_cabecera) > 0) {
                    pesoIdaKg = parseFloat(v.peso_cabecera);
                }

                const pesoTotalKg = pesoIdaKg + pesoRetornoKg;
                const pesoIdaTn = +(pesoIdaKg / 1000).toFixed(2);
                const pesoRetornoTn = +(pesoRetornoKg / 1000).toFixed(2);
                const pesoTotalTn = +(pesoTotalKg / 1000).toFixed(2);

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

                // Helper para concatenar configuraciones (Tracto/Camión + Carreta/Remolque)
                function formatearConfiguracion(confTracto, confRemolque) {
                    const t = (confTracto || 'T3').trim().toUpperCase();
                    let r = (confRemolque || '').trim().toUpperCase();
                    if (!r || r === '—' || r === 'NULL') return t;
                    if (r.startsWith('SE')) {
                        r = 'S' + r.substring(2);
                    }
                    if (r.startsWith('R') || t.startsWith('C')) {
                        return `${t} - ${r}`;
                    }
                    return `${t} ${r}`;
                }

                const configConcatenada = formatearConfiguracion(v.configuracion_tracto, v.configuracion_remolque);

                // Cálculo de Galones Teóricos pasando Toneladas (TN) exactas, Modelo de Motor y estrictamente Configuración del Tracto/Camión
                let galonesIda = calcularGalonesTeoricos(rutaIdaTexto, 'IDA', pesoIdaTn, v.modelo_motor, v.configuracion_tracto);
                let galonesRetorno = calcularGalonesTeoricos(rutaRetornoTexto, 'RETORNO', pesoRetornoTn, v.modelo_motor, v.configuracion_tracto);

                // Descuento -10% si va sin carreta (solo tracto)
                const esSinCarreta = !v.placa_remolque || v.placa_remolque.trim() === '' || v.placa_remolque === '—';
                if (esSinCarreta) {
                    galonesIda = +(galonesIda * 0.90).toFixed(2);
                    galonesRetorno = +(galonesRetorno * 0.90).toFixed(2);
                }

                const galonesTotal = +(galonesIda + galonesRetorno).toFixed(2);

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
                    configuracion_tracto: v.configuracion_tracto || 'T3',
                    configuracion_remolque: v.configuracion_remolque || '',
                    configuracion: configConcatenada,
                    ruta_principal: v.ruta_cabecera || rutaIdaTexto,
                    
                    // Detalle IDA
                    ida: {
                        ruta: rutaIdaTexto,
                        peso_tn: pesoIdaTn,
                        peso_kg: pesoIdaKg,
                        ordenes: rutasIda.map(r => r.orden).filter(Boolean),
                        galones_estimados: +galonesIda.toFixed(2)
                    },

                    // Detalle RETORNO (si no tiene carga peso_tn es 0.00)
                    retorno: {
                        ruta: rutaRetornoTexto,
                        peso_tn: pesoRetornoTn,
                        peso_kg: pesoRetornoKg,
                        ordenes: rutasRetorno.map(r => r.orden).filter(Boolean),
                        galones_estimados: +galonesRetorno.toFixed(2)
                    },

                    // Consolidado
                    peso_total_tn: pesoTotalTn,
                    peso_total_kg: pesoTotalKg,
                    galones_teoricos_total: galonesTotal,
                    estado: v.estado || 'ACTIVO'
                };
            });

            res.json({ ok: true, data: resultado });
        } catch (err) {
            console.error('Error al generar reporte de viajes:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/operaciones/marsisa-ordenes-viaje ───────────────────
    // Vista exclusiva para Operaciones Marsisa (datos sincronizados)
    router.get('/marsisa-ordenes-viaje', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const { q, placa, limit, vista } = req.query;

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
                    FROM marsisa_ordenes_viaje_rutas r
                    LEFT JOIN marsisa_ordenes_viaje ov ON r.viaje = ov.viaje
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

            // Vista agrupada por Viaje para Marsisa
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
                FROM marsisa_ordenes_viaje ov
                LEFT JOIN (
                    SELECT 
                        viaje,
                        COUNT(DISTINCT orden) AS cant_ordenes,
                        SUM(CASE WHEN es_retorno = 0 THEN peso_total ELSE 0 END) AS peso_ida,
                        SUM(CASE WHEN es_retorno = 1 THEN peso_total ELSE 0 END) AS peso_retorno,
                        SUM(peso_total) AS peso_total_calc,
                        GROUP_CONCAT(DISTINCT orden ORDER BY orden SEPARATOR ', ') AS ordenes_list,
                        GROUP_CONCAT(DISTINCT CONCAT(CASE WHEN es_retorno=1 THEN '[RETORNO] ' ELSE '[IDA] ' END, ruta) ORDER BY es_retorno ASC SEPARATOR ' | ') AS rutas_list
                    FROM marsisa_ordenes_viaje_rutas
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
            params.push(parseInt(limit, 10) || 2500);

            const [rows] = await tdb.query(sql, params);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error('Error al listar ordenes de viaje Marsisa:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/operaciones/ordenes-viaje/sincronizar ───────────
    // Sincronización remota exclusiva para Marsisa que almacena en marsisa_ordenes_viaje
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

            // Guardar Viajes Principales en marsisa_ordenes_viaje (tabla exclusiva de Marsisa)
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
                        INSERT INTO marsisa_ordenes_viaje 
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

            // Guardar Detalle de Órdenes de Servicio / Rutas en marsisa_ordenes_viaje_rutas
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
                        INSERT INTO marsisa_ordenes_viaje_rutas
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
                    accion: 'SINCRONIZAR_ORDENES_VIAJE_MARSISA',
                    modulo: 'OPERACIONES_MARSISA',
                    detalle: `Sincronizados ${viajesRemotos.length} viajes y ${rutasRemotas.length} órdenes/rutas a tablas marsisa.`
                });
            }

            res.json({
                ok: true,
                total_viajes_remoto: viajesRemotos.length,
                total_rutas_remoto: rutasRemotas.length,
                insertados,
                rutas_procesadas: rutasInsertadas,
                message: `Sincronización exitosa en Marsisa: ${viajesRemotos.length} viajes y ${rutasRemotas.length} órdenes de servicio/rutas procesadas.`
            });
        } catch (err) {
            console.error('Error al sincronizar ordenes de viaje:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // =========================================================================
    // 💼 ENDPOINTS: ÓRDENES DE SERVICIO (ERP AZKELL FLEET)
    // =========================================================================

    // 1. Correlativo para nueva Orden de Servicio
    router.get('/ordenes-servicio/correlativo', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const year = new Date().getFullYear().toString();
            const [rows] = await tdb.query(
                `SELECT numero FROM operaciones_ordenes_servicio WHERE serie = ? ORDER BY id DESC LIMIT 1`,
                [year]
            );

            let nextNum = 1450;
            if (rows && rows.length > 0) {
                const parsed = parseInt(rows[0].numero, 10);
                if (!isNaN(parsed)) nextNum = parsed + 1;
            }

            const formattedNum = String(nextNum).padStart(8, '0');
            res.json({
                ok: true,
                serie: year,
                numero: formattedNum,
                codigo_orden: `${year}-${formattedNum}`
            });
        } catch (err) {
            console.error('Error al obtener correlativo de orden de servicio:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 2. Listar Órdenes de Servicio
    router.get('/ordenes-servicio', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const { fecha_desde, fecha_hasta, cliente, q } = req.query;

            let sql = `
                SELECT 
                    os.*,
                    DATE_FORMAT(os.fecha, '%Y-%m-%d') AS fecha_fmt,
                    DATE_FORMAT(os.fecha_fin, '%Y-%m-%d') AS fecha_fin_fmt,
                    COALESCE(doc_cnt.total_docs, 0) AS carga_doc,
                    COALESCE(doc_cnt.total_peso, 0) AS peso_documentos,
                    COALESCE(doc_cnt.total_volumen, 0) AS volumen_documentos
                FROM operaciones_ordenes_servicio os
                LEFT JOIN (
                    SELECT 
                        orden_servicio_id, 
                        COUNT(*) AS total_docs,
                        SUM(peso) AS total_peso,
                        SUM(volumen) AS total_volumen
                    FROM operaciones_ordenes_servicio_docs
                    GROUP BY orden_servicio_id
                ) doc_cnt ON os.id = doc_cnt.orden_servicio_id
                WHERE 1=1
            `;
            const params = [];

            if (fecha_desde) {
                sql += ` AND os.fecha >= ?`;
                params.push(fecha_desde);
            }
            if (fecha_hasta) {
                sql += ` AND os.fecha <= ?`;
                params.push(fecha_hasta);
            }
            if (cliente && String(cliente).trim() !== '' && cliente !== 'TODOS') {
                sql += ` AND (os.cliente_nombre = ? OR os.cliente_id = ?)`;
                params.push(cliente, cliente);
            }
            if (q && String(q).trim() !== '') {
                const term = `%${String(q).trim()}%`;
                sql += ` AND (
                    os.codigo_orden LIKE ? OR 
                    os.cliente_nombre LIKE ? OR 
                    os.conductor LIKE ? OR 
                    os.viaje_asignado LIKE ? OR
                    os.tipo_servicio LIKE ?
                )`;
                params.push(term, term, term, term, term);
            }

            sql += ` ORDER BY os.fecha DESC, os.id DESC LIMIT 1500`;

            const [rows] = await tdb.query(sql, params);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error('Error al listar ordenes de servicio:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 3. Obtener detalle de una Orden de Servicio (con sus documentos adjuntos)
    router.get('/ordenes-servicio/:id', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const [rows] = await tdb.query(
                `SELECT *, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha_fmt, DATE_FORMAT(fecha_fin, '%Y-%m-%d') AS fecha_fin_fmt FROM operaciones_ordenes_servicio WHERE id = ?`,
                [req.params.id]
            );
            if (!rows || rows.length === 0) {
                return res.status(404).json({ ok: false, error: 'Orden de servicio no encontrada' });
            }

            const orden = rows[0];
            const [docs] = await tdb.query(
                `SELECT *, DATE_FORMAT(fecha_carga, '%Y-%m-%d') AS fecha_carga_fmt, DATE_FORMAT(fecha_entrega, '%Y-%m-%d') AS fecha_entrega_fmt 
                 FROM operaciones_ordenes_servicio_docs 
                 WHERE orden_servicio_id = ? 
                 ORDER BY id ASC`,
                [orden.id]
            );

            orden.documentos = docs || [];
            res.json({ ok: true, data: orden });
        } catch (err) {
            console.error('Error al obtener orden de servicio:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 4. Crear nueva Orden de Servicio
    router.post('/ordenes-servicio', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const {
                serie,
                numero,
                fecha,
                fecha_fin,
                moneda,
                tipo_cambio,
                tipo_contratacion,
                modalidad_ejecucion,
                cliente_id,
                cliente_nombre,
                tipo_servicio,
                tipo_costo,
                impuesto,
                costo_flete,
                puntos_carga,
                puntos_destino,
                destinatario,
                observaciones,
                documentos
            } = req.body;

            const yearSerie = serie || new Date().getFullYear().toString();
            let numFinal = numero;
            if (!numFinal) {
                const [r] = await tdb.query(`SELECT numero FROM operaciones_ordenes_servicio WHERE serie = ? ORDER BY id DESC LIMIT 1`, [yearSerie]);
                let next = 1450;
                if (r && r.length > 0) {
                    const p = parseInt(r[0].numero, 10);
                    if (!isNaN(p)) next = p + 1;
                }
                numFinal = String(next).padStart(8, '0');
            }

            const codigo_orden = `${yearSerie}-${numFinal}`;

            const [ins] = await tdb.query(`
                INSERT INTO operaciones_ordenes_servicio (
                    serie, numero, codigo_orden, fecha, fecha_fin, moneda, tipo_cambio,
                    tipo_contratacion, modalidad_ejecucion, cliente_id, cliente_nombre,
                    tipo_servicio, tipo_costo, impuesto, costo_flete, puntos_carga,
                    puntos_destino, destinatario, observaciones, estado_servicio
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INICIADO')
            `, [
                yearSerie,
                numFinal,
                codigo_orden,
                fecha || new Date().toISOString().split('T')[0],
                fecha_fin || null,
                moneda || 'SOLES',
                parseFloat(tipo_cambio) || 3.750,
                tipo_contratacion || 'CLIENTE DIRECTO',
                modalidad_ejecucion || 'PROPIO',
                cliente_id || null,
                cliente_nombre || 'CLIENTE GENERAL',
                tipo_servicio || 'CARGA GENERAL',
                tipo_costo || 'POR VIAJE',
                impuesto || 'IGV 18%',
                parseFloat(costo_flete) || 0.00,
                parseInt(puntos_carga, 10) || 1,
                parseInt(puntos_destino, 10) || 1,
                destinatario || null,
                observaciones || null
            ]);

            const osId = ins.insertId;

            // Anexar documentos (GREs) si vienen en el payload
            if (Array.isArray(documentos) && documentos.length > 0) {
                for (const doc of documentos) {
                    await tdb.query(`
                        INSERT INTO operaciones_ordenes_servicio_docs (
                            orden_servicio_id, codigo_orden, guia_remision_id, numero_documento,
                            tipo_documento, gr_remitente, numero_transporte, placa_referencia,
                            volumen, cantidad, peso, remitente, destinatario, fecha_carga, fecha_entrega
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        osId,
                        codigo_orden,
                        doc.guia_remision_id || null,
                        doc.numero_documento || doc.numero_guia || 'GRE',
                        doc.tipo_documento || 'GRE',
                        doc.gr_remitente || null,
                        doc.numero_transporte || null,
                        doc.placa_referencia || doc.placa_tracto || null,
                        parseFloat(doc.volumen || doc.volumen_m3) || 0.000,
                        parseFloat(doc.cantidad) || 1.00,
                        parseFloat(doc.peso || doc.peso_bruto_total) || 0.00,
                        doc.remitente || doc.remitente_razon_social || null,
                        doc.destinatario || doc.destinatario_razon_social || null,
                        doc.fecha_carga || doc.fecha_traslado || null,
                        doc.fecha_entrega || null
                    ]);

                    // Actualizar trazabilidad en la tabla guias_remision
                    if (doc.guia_remision_id) {
                        try {
                            await tdb.query(
                                `UPDATE guias_remision SET orden_servicio = ? WHERE id = ?`,
                                [codigo_orden, doc.guia_remision_id]
                            );
                        } catch (ignore) {}
                    } else if (doc.numero_documento) {
                        try {
                            await tdb.query(
                                `UPDATE guias_remision SET orden_servicio = ? WHERE numero_guia = ?`,
                                [codigo_orden, doc.numero_documento]
                            );
                        } catch (ignore) {}
                    }
                }
            }

            if (logAudit) {
                logAudit({
                    req,
                    accion: 'CREAR_ORDEN_SERVICIO',
                    modulo: 'OPERACIONES',
                    detalle: `Creada Orden de Servicio ${codigo_orden} para cliente ${cliente_nombre}`
                });
            }

            res.json({
                ok: true,
                message: `Orden de Servicio ${codigo_orden} guardada exitosamente.`,
                id: osId,
                codigo_orden
            });
        } catch (err) {
            console.error('Error al crear orden de servicio:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 5. Editar Orden de Servicio existente
    router.put('/ordenes-servicio/:id', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const osId = req.params.id;
            const {
                fecha,
                fecha_fin,
                moneda,
                tipo_cambio,
                tipo_contratacion,
                modalidad_ejecucion,
                cliente_id,
                cliente_nombre,
                tipo_servicio,
                tipo_costo,
                impuesto,
                costo_flete,
                puntos_carga,
                puntos_destino,
                destinatario,
                observaciones,
                estado_servicio,
                documentos
            } = req.body;

            const [prev] = await tdb.query(`SELECT codigo_orden FROM operaciones_ordenes_servicio WHERE id = ?`, [osId]);
            if (!prev || prev.length === 0) {
                return res.status(404).json({ ok: false, error: 'Orden de servicio no encontrada' });
            }
            const codigo_orden = prev[0].codigo_orden;

            await tdb.query(`
                UPDATE operaciones_ordenes_servicio SET
                    fecha = COALESCE(?, fecha),
                    fecha_fin = ?,
                    moneda = COALESCE(?, moneda),
                    tipo_cambio = COALESCE(?, tipo_cambio),
                    tipo_contratacion = COALESCE(?, tipo_contratacion),
                    modalidad_ejecucion = COALESCE(?, modalidad_ejecucion),
                    cliente_id = ?,
                    cliente_nombre = COALESCE(?, cliente_nombre),
                    tipo_servicio = COALESCE(?, tipo_servicio),
                    tipo_costo = COALESCE(?, tipo_costo),
                    impuesto = COALESCE(?, impuesto),
                    costo_flete = COALESCE(?, costo_flete),
                    puntos_carga = COALESCE(?, puntos_carga),
                    puntos_destino = COALESCE(?, puntos_destino),
                    destinatario = ?,
                    observaciones = ?,
                    estado_servicio = COALESCE(?, estado_servicio)
                WHERE id = ?
            `, [
                fecha || null,
                fecha_fin || null,
                moneda || null,
                parseFloat(tipo_cambio) || 3.750,
                tipo_contratacion || null,
                modalidad_ejecucion || null,
                cliente_id || null,
                cliente_nombre || null,
                tipo_servicio || null,
                tipo_costo || null,
                impuesto || null,
                parseFloat(costo_flete) || 0.00,
                parseInt(puntos_carga, 10) || 1,
                parseInt(puntos_destino, 10) || 1,
                destinatario || null,
                observaciones || null,
                estado_servicio || null,
                osId
            ]);

            // Si se envían documentos, actualizar sincronizando guias_remision
            if (Array.isArray(documentos)) {
                // Liberar documentos anteriores vinculados a esta OS en guias_remision
                try {
                    await tdb.query(`UPDATE guias_remision SET orden_servicio = NULL WHERE orden_servicio = ?`, [codigo_orden]);
                } catch (ignore) {}

                // Limpiar tabla de docs para reemplazo limpio
                await tdb.query(`DELETE FROM operaciones_ordenes_servicio_docs WHERE orden_servicio_id = ?`, [osId]);

                for (const doc of documentos) {
                    await tdb.query(`
                        INSERT INTO operaciones_ordenes_servicio_docs (
                            orden_servicio_id, codigo_orden, guia_remision_id, numero_documento,
                            tipo_documento, gr_remitente, numero_transporte, placa_referencia,
                            volumen, cantidad, peso, remitente, destinatario, fecha_carga, fecha_entrega
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        osId,
                        codigo_orden,
                        doc.guia_remision_id || null,
                        doc.numero_documento || doc.numero_guia || 'GRE',
                        doc.tipo_documento || 'GRE',
                        doc.gr_remitente || null,
                        doc.numero_transporte || null,
                        doc.placa_referencia || doc.placa_tracto || null,
                        parseFloat(doc.volumen || doc.volumen_m3) || 0.000,
                        parseFloat(doc.cantidad) || 1.00,
                        parseFloat(doc.peso || doc.peso_bruto_total) || 0.00,
                        doc.remitente || doc.remitente_razon_social || null,
                        doc.destinatario || doc.destinatario_razon_social || null,
                        doc.fecha_carga || doc.fecha_traslado || null,
                        doc.fecha_entrega || null
                    ]);

                    // Actualizar trazabilidad en guias_remision
                    if (doc.guia_remision_id) {
                        try {
                            await tdb.query(`UPDATE guias_remision SET orden_servicio = ? WHERE id = ?`, [codigo_orden, doc.guia_remision_id]);
                        } catch (ignore) {}
                    } else if (doc.numero_documento) {
                        try {
                            await tdb.query(`UPDATE guias_remision SET orden_servicio = ? WHERE numero_guia = ?`, [codigo_orden, doc.numero_documento]);
                        } catch (ignore) {}
                    }
                }
            }

            if (logAudit) {
                logAudit({
                    req,
                    accion: 'EDITAR_ORDEN_SERVICIO',
                    modulo: 'OPERACIONES',
                    detalle: `Actualizada Orden de Servicio ${codigo_orden}`
                });
            }

            res.json({
                ok: true,
                message: `Orden de Servicio ${codigo_orden} actualizada correctamente.`
            });
        } catch (err) {
            console.error('Error al actualizar orden de servicio:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // 6. Cambiar estado de servicio (ej: FINALIZAR / ANULAR)
    router.put('/ordenes-servicio/:id/estado', async (req, res) => {
        try {
            await ensureTables(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const { estado_servicio } = req.body;
            await tdb.query(
                `UPDATE operaciones_ordenes_servicio SET estado_servicio = ? WHERE id = ?`,
                [estado_servicio, req.params.id]
            );

            res.json({ ok: true, message: `Estado actualizado a ${estado_servicio}.` });
        } catch (err) {
            console.error('Error al cambiar estado de orden de servicio:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    return router;
};
