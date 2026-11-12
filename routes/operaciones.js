const express = require('express');
const mysql = require('mysql2/promise');
const { getPresignedUrl, s3KeyFromUrl } = require('../utils/s3');
const { recalcularLiquidacionViaje } = require('../services/liquidacion_viaje');
const { documentosVencidosPara, mensajeAdvertencia } = require('../services/documentos_flota');
const { rentabilidadPeriodo } = require('../services/rentabilidad');

module.exports = function (db, broadcast, logAudit, opciones = {}) {
    // Hora de Lima (America/Lima), como el resto del sistema; toISOString daría UTC
    const ahoraLima = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
    const router = express.Router();

    function getDb(req) {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    }

    // ── Middleware de Auditoría Automática para Operaciones ────────────────
    router.use((req, res, next) => {
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
            const originalJson = res.json.bind(res);
            res.json = function (data) {
                if (data && (data.ok === true || data.data === 'Éxito' || data.success || data.id || res.statusCode < 400)) {
                    if (typeof logAudit === 'function') {
                        const accion = req.method === 'POST' ? 'CREÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'MODIFICÓ';
                        let sub = 'Órdenes de Viaje';
                        let desc = `Operación de ${accion.toLowerCase()} en Operaciones (${req.path})`;
                        if (req.body) {
                            if (req.body.orden_servicio || req.body.numero_orden) desc = `${accion} Orden de Servicio: ${req.body.orden_servicio || req.body.numero_orden}`;
                            else if (req.body.tracto || req.body.placa) desc = `${accion} operación para unidad ${req.body.tracto || req.body.placa}`;
                            else if (req.params.id) desc = `${accion} registro ID: ${req.params.id}`;
                        }
                        logAudit(req, 'OPERACIONES', sub, accion, desc);
                    }
                }
                return originalJson(data);
            };
        }
        next();
    });

    // Configuración de conexión al host remoto de la empresa de transporte
    const REMOTE_CONFIG = {
        host: process.env.REMOTE_FUEL_HOST,
        user: process.env.REMOTE_FUEL_USER,
        password: process.env.REMOTE_FUEL_PASSWORD,
        database: process.env.REMOTE_FUEL_DATABASE,
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

    // ── Recorrido GPS del viaje (km que midió Wialon; se guarda una vez al cerrar la orden) ──
    // `opciones.recorridoWialon(req, { placa, fechaInicio, fechaFin })` es la consulta de telemetría de
    // routes/combustible.js (consultarTelemetriaViajeWialon) y debe devolver km o null.
    // - Sin función inyectada: no guarda nada (queda NULL para un cierre posterior).
    // - Wialon falla, no responde a tiempo o no hay dato: guarda NULL con fuente 'ODOMETRO'.
    // - Si la orden ya tiene fuente guardada, no vuelve a consultar Wialon.
    // Nunca lanza: el cierre del viaje no depende de Wialon.
    const TIMEOUT_RECORRIDO_WIALON_MS = 20000;

    async function guardarRecorridoGpsViaje(req, tdb, codeViaje) {
        try {
            const recorridoWialon = opciones && opciones.recorridoWialon;
            if (typeof recorridoWialon !== 'function') return;

            const [rows] = await tdb.query(
                `SELECT placa_tracto,
                        DATE_FORMAT(COALESCE(fecha_inicio, fecha_viaje), '%Y-%m-%d %H:%i:%s') AS ini,
                        DATE_FORMAT(fecha_fin, '%Y-%m-%d %H:%i:%s') AS fin,
                        km_recorrido_gps_fuente
                 FROM operaciones_ordenes_viaje
                 WHERE viaje = ? LIMIT 1`,
                [codeViaje]
            );
            if (!rows.length || rows[0].km_recorrido_gps_fuente) return;

            const { placa_tracto, ini, fin } = rows[0];
            let km = null;
            if (placa_tracto && ini && fin) {
                let timer = null;
                try {
                    const timeout = new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('Wialon no respondió a tiempo')), TIMEOUT_RECORRIDO_WIALON_MS);
                    });
                    const valor = await Promise.race([
                        recorridoWialon(req, { placa: placa_tracto, fechaInicio: ini, fechaFin: fin }),
                        timeout
                    ]);
                    const n = Number(valor);
                    if (Number.isFinite(n) && n > 0) km = Math.round(n * 10) / 10;
                } catch (errWialon) {
                    console.warn('[Operaciones] Recorrido GPS sin dato para', codeViaje, '-', errWialon.message);
                } finally {
                    clearTimeout(timer);
                }
            }

            await tdb.query(
                `UPDATE operaciones_ordenes_viaje
                 SET km_recorrido_gps = ?, km_recorrido_gps_fuente = ?
                 WHERE viaje = ? AND km_recorrido_gps_fuente IS NULL`,
                [km, km !== null ? 'WIALON' : 'ODOMETRO', codeViaje]
            );
        } catch (err) {
            console.warn('[Operaciones] No se pudo guardar el recorrido GPS del viaje', codeViaje, '-', err.message);
        }
    }

    // ── GET /api/operaciones/ordenes-viaje ────────────────────────
    router.get('/ordenes-viaje', async (req, res) => {
        try {
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
                    sql += ` AND DATE(COALESCE(ov.fecha_viaje, ov.fecha_inicio, ov.creado_en)) >= ?`;
                    params.push(fecha_desde);
                }
                if (fecha_hasta) {
                    sql += ` AND DATE(COALESCE(ov.fecha_viaje, ov.fecha_inicio, ov.creado_en)) <= ?`;
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

                sql += ` ORDER BY COALESCE(ov.fecha_viaje, ov.creado_en) DESC, r.viaje DESC, r.es_retorno ASC, r.id ASC LIMIT ?`;
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
                    ov.ejecucion,
                    ov.tercero_nombre,
                    ov.tercero_ruc,
                    ov.tercero_costo,
                    ov.tercero_moneda,
                    ov.tercero_documento,
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
                    r_agg.rutas_list,
                    COALESCE(NULLIF(TRIM(ov.configuracion_tracto), ''), NULLIF(TRIM(p.configuracion), ''), '') AS configuracion_tracto,
                    COALESCE(NULLIF(TRIM(ov.configuracion_remolque), ''), NULLIF(TRIM(pr.configuracion), ''), '') AS configuracion_remolque
                FROM operaciones_ordenes_viaje ov
                LEFT JOIN placas p ON ov.placa_tracto = p.placa
                LEFT JOIN placas pr ON ov.placa_remolque = pr.placa
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
                sql += ` AND DATE(COALESCE(ov.fecha_viaje, ov.fecha_inicio, ov.creado_en)) >= ?`;
                params.push(fecha_desde);
            }
            if (fecha_hasta) {
                sql += ` AND DATE(COALESCE(ov.fecha_viaje, ov.fecha_inicio, ov.creado_en)) <= ?`;
                params.push(fecha_hasta);
            }

            if (q && String(q).trim()) {
                const search = `%${String(q).trim()}%`;
                sql += ` AND (ov.viaje LIKE ? OR ov.conductor LIKE ? OR ov.placa_tracto LIKE ? OR ov.placa_remolque LIKE ? OR ov.ruta LIKE ? OR r_agg.ordenes_list LIKE ? OR r_agg.rutas_list LIKE ? OR p.configuracion LIKE ? OR pr.configuracion LIKE ?)`;
                params.push(search, search, search, search, search, search, search, search, search);
            }

            if (placa && String(placa).trim()) {
                sql += ` AND (ov.placa_tracto = ? OR ov.placa_remolque = ?)`;
                params.push(String(placa).trim(), String(placa).trim());
            }

            sql += ` ORDER BY COALESCE(ov.fecha_viaje, ov.creado_en) DESC, ov.id DESC LIMIT ?`;
            params.push(parseInt(limit, 10) || 2500);

            let rows = [];
            try {
                const [r] = await tdb.query(sql, params);
                rows = r || [];
            } catch (errQuery) {
                console.warn('Advertencia en query principal ordenes-viaje, ejecutando fallback seguro:', errQuery.message);
                try {
                    let fallbackSql = `
                        SELECT 
                            ov.id,
                            ov.id_remoto,
                            ov.viaje,
                            DATE_FORMAT(ov.fecha_viaje, '%Y-%m-%d %H:%i:%s') AS fecha_viaje,
                            ov.id_conductor,
                            ov.conductor,
                            ov.placa_tracto,
                            ov.placa_remolque,
                            COALESCE(ov.peso, 0) AS peso,
                            ov.ruta,
                            ov.origen,
                            ov.destino,
                            ov.estado
                        FROM operaciones_ordenes_viaje ov
                        WHERE 1=1
                    `;
                    const fallbackParams = [];
                    if (fecha_desde) {
                        fallbackSql += ` AND DATE(COALESCE(ov.fecha_viaje, ov.creado_en)) >= ?`;
                        fallbackParams.push(fecha_desde);
                    }
                    if (fecha_hasta) {
                        fallbackSql += ` AND DATE(COALESCE(ov.fecha_viaje, ov.creado_en)) <= ?`;
                        fallbackParams.push(fecha_hasta);
                    }
                    if (q && String(q).trim()) {
                        const search = `%${String(q).trim()}%`;
                        fallbackSql += ` AND (ov.viaje LIKE ? OR ov.conductor LIKE ? OR ov.placa_tracto LIKE ? OR ov.placa_remolque LIKE ? OR ov.ruta LIKE ?)`;
                        fallbackParams.push(search, search, search, search, search);
                    }
                    if (placa && String(placa).trim()) {
                        fallbackSql += ` AND (ov.placa_tracto = ? OR ov.placa_remolque = ?)`;
                        fallbackParams.push(String(placa).trim(), String(placa).trim());
                    }
                    fallbackSql += ` ORDER BY COALESCE(ov.fecha_viaje, ov.creado_en) DESC, ov.id DESC LIMIT ?`;
                    fallbackParams.push(parseInt(limit, 10) || 2500);

                    const [fbRows] = await tdb.query(fallbackSql, fallbackParams);
                    rows = fbRows || [];
                } catch (errFb) {
                    console.error('Error total en fallback ordenes-viaje:', errFb.message);
                    rows = [];
                }
            }

            // Formatear configuración vehicular conjunta para la vista
            function formatearConfigConjunta(confTracto, confRemolque) {
                const t = (confTracto || '').trim().toUpperCase();
                let r = (confRemolque || '').trim().toUpperCase();
                if (r.startsWith('SE')) {
                    r = 'S' + r.substring(2);
                }
                if (t && r) {
                    return (r.startsWith('R') || t.startsWith('C')) ? `${t} - ${r}` : `${t} ${r}`;
                }
                return t || r || '---';
            }

            const rowsConConfig = (rows || []).map(row => ({
                ...row,
                configuracion: formatearConfigConjunta(row.configuracion_tracto, row.configuracion_remolque)
            }));

            res.json({ ok: true, data: rowsConConfig });
        } catch (err) {
            console.error('Error al listar ordenes de viaje:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/operaciones/ordenes-viaje/correlativo ────────────
    // Devuelve el año serie actual y el siguiente número correlativo formateado (ej. 00000992)
    router.get('/ordenes-viaje/correlativo', async (req, res) => {
        try {
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
    // ── GET /api/operaciones/documentos-vencidos — placas con SOAT o Revisión Técnica vencidos ──
    router.get('/documentos-vencidos', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ ok: false, error: 'Base de datos no disponible' });
            const [filas] = await tdb.query("SELECT DISTINCT UPPER(TRIM(placa)) AS placa FROM documentos_flota WHERE UPPER(TRIM(tipo_documento)) IN ('SOAT', 'REV_TECNICA')");
            const vencidos = await documentosVencidosPara(tdb, filas.map(r => r.placa));
            res.json({ ok: true, vencidos });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── GET /api/operaciones/rentabilidad?mes=AAAA-MM — costo por placa y margen por viaje (solo lectura) ──
    router.get('/rentabilidad', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });
            const ahora = new Date();
            const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? String(req.query.mes) : `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
            const [anio, m] = mes.split('-').map(Number);
            const desde = `${mes}-01`;
            const hasta = `${mes}-${String(new Date(anio, m, 0).getDate()).padStart(2, '0')}`;
            res.json({ ok: true, ...(await rentabilidadPeriodo(tdb, desde, hasta)) });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.post('/ordenes-viaje', async (req, res) => {
        try {
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
                configuracion_tracto,
                configuracion_remolque,
                rutas, // array opcional con órdenes de servicio / rutas
                ejecucion,
                tercero_nombre,
                tercero_ruc,
                tercero_costo,
                tercero_moneda,
                tercero_documento
            } = req.body;

            const codeViaje = (viaje && String(viaje).trim()) 
                ? String(viaje).trim().toUpperCase() 
                : `${serie || new Date().getFullYear()}-${String(numero || '1').padStart(8, '0')}`;

            const esTercero = String(ejecucion || '').toUpperCase() === 'TERCERO';
            if (esTercero ? !String(tercero_nombre || '').trim() : (!placa_tracto || !conductor)) {
                return res.status(400).json({ ok: false, error: esTercero ? 'Indica el transportista tercero.' : 'Conductor y Vehículo (Tracto) son obligatorios.' });
            }
            const costoTerc = parseFloat(tercero_costo);
            const datosTercero = [
                esTercero ? 'TERCERO' : 'PROPIO',
                esTercero ? String(tercero_nombre).trim().slice(0, 200) : null,
                esTercero && String(tercero_ruc || '').trim() ? String(tercero_ruc).trim().slice(0, 20) : null,
                esTercero && Number.isFinite(costoTerc) ? costoTerc : null,
                esTercero && String(tercero_moneda || '').trim() ? String(tercero_moneda).trim().slice(0, 20) : null,
                esTercero && String(tercero_documento || '').trim() ? String(tercero_documento).trim().slice(0, 100) : null,
            ];
            const vencidosViaje = await documentosVencidosPara(tdb, [placa_tracto, placa_remolque]);
            // Solo advertencia: el despacho sigue permitido mientras se renueva el documento

            const fechaFinal = fecha_viaje || ahoraLima();
            const userCreador = usuario_creacion || (req.user && req.user.nombre) || 'ADMINISTRADOR DEL SISTEMA';

            const parsedKm = parseInt(kilometraje_inicial, 10);
            const kmIniVal = (!isNaN(parsedKm) && parsedKm >= 0) ? parsedKm : null;
            const parsedHr = parseInt(horas_motor_remolque, 10);
            const hrRemVal = (!isNaN(parsedHr) && parsedHr >= 0) ? parsedHr : null;

            const [insertRes] = await tdb.query(`
                INSERT INTO operaciones_ordenes_viaje (
                    viaje, fecha_viaje, id_conductor, conductor,
                    placa_tracto, placa_remolque, peso, ruta,
                    ubigeo_partida, direccion_partida, ubigeo_llegada, direccion_llegada,
                    escolta, observaciones, estado, usuario_creacion,
                    kilometraje_inicial, horas_motor_remolque,
                    ejecucion, tercero_nombre, tercero_ruc, tercero_costo, tercero_moneda, tercero_documento
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    horas_motor_remolque = COALESCE(VALUES(horas_motor_remolque), operaciones_ordenes_viaje.horas_motor_remolque),
                    ejecucion = VALUES(ejecucion),
                    tercero_nombre = VALUES(tercero_nombre),
                    tercero_ruc = VALUES(tercero_ruc),
                    tercero_costo = VALUES(tercero_costo),
                    tercero_moneda = VALUES(tercero_moneda),
                    tercero_documento = VALUES(tercero_documento)
            `, [
                codeViaje,
                fechaFinal,
                id_conductor || null,
                String(conductor || '').trim().toUpperCase(),
                String(placa_tracto || '').trim().toUpperCase(),
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
                hrRemVal,
                ...datosTercero
            ]);

            // Actualizar o guardar configuración en la tabla placas para tracto y carreta
            if (configuracion_tracto && String(configuracion_tracto).trim() && placa_tracto) {
                try {
                    await tdb.query(
                        `UPDATE placas SET configuracion = ? WHERE UPPER(TRIM(placa)) = UPPER(TRIM(?))`,
                        [String(configuracion_tracto).trim().toUpperCase(), String(placa_tracto).trim()]
                    );
                } catch(pErr) {
                    console.warn('No se pudo actualizar configuración de tracto en tabla placas:', pErr.message);
                }
            }
            if (configuracion_remolque && String(configuracion_remolque).trim() && placa_remolque) {
                try {
                    await tdb.query(
                        `UPDATE placas SET configuracion = ? WHERE UPPER(TRIM(placa)) = UPPER(TRIM(?))`,
                        [String(configuracion_remolque).trim().toUpperCase(), String(placa_remolque).trim()]
                    );
                } catch(pErr) {
                    console.warn('No se pudo actualizar configuración de remolque en tabla placas:', pErr.message);
                }
            }

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

            res.json({ ok: true, message: `Orden de Viaje ${codeViaje} registrada exitosamente.`, viaje: codeViaje, advertencias: vencidosViaje.map(mensajeAdvertencia) });
        } catch (err) {
            console.error('Error al registrar orden de viaje:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── PUT /api/operaciones/ordenes-viaje/:viaje/iniciar ───────────
    router.put('/ordenes-viaje/:viaje/iniciar', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const codeViaje = req.params.viaje;
            const { fecha_inicio, kilometraje_inicial, horas_motor_remolque } = req.body;
            const nowStr = ahoraLima();
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
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const codeViaje = req.params.viaje;
            const { fecha_fin, kilometraje_final, usuario_finalizacion } = req.body;
            const nowStr = ahoraLima();
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

            await guardarRecorridoGpsViaje(req, tdb, codeViaje);
            await recalcularLiquidacionViaje(tdb, codeViaje).catch(() => {});
            res.json({ ok: true, message: `El viaje ${codeViaje} ha sido finalizado exitosamente.` });
        } catch (err) {
            console.error('Error al finalizar viaje:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── PUT /api/operaciones/ordenes-viaje/:viaje (Editar Orden de Viaje) ───
    // Peso de un tramo (ida o retorno) de una orden de viaje Marsisa. Se guarda en kg; la pantalla lo pide en toneladas.
    router.put('/marsisa-ordenes-viaje/rutas/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const id = Number(req.params.id);
            const tn = Number((req.body || {}).peso_tn);
            if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Tramo no válido' });
            if (!Number.isFinite(tn) || tn < 0 || tn > 100) return res.status(400).json({ error: 'El peso debe estar entre 0 y 100 TN' });

            const [previo] = await tdb.query(
                'SELECT id, viaje, ruta, es_retorno, peso_total FROM marsisa_ordenes_viaje_rutas WHERE id = ? LIMIT 1', [id]);
            if (!previo.length) return res.status(404).json({ error: 'El tramo no existe' });

            const kg = Math.round(tn * 1000 * 100) / 100;
            // peso_manual = 1: la sincronización con MarsisaSoft ya no revierte este peso
            await tdb.query('UPDATE marsisa_ordenes_viaje_rutas SET peso_total = ?, peso_manual = 1 WHERE id = ?', [kg, id]);

            const tramo = Number(previo[0].es_retorno) === 1 ? 'retorno' : 'ida';
            if (typeof logAudit === 'function') {
                logAudit(req, 'OPERACIONES', 'Órdenes de viaje', 'EDITÓ PESO DE TRAMO',
                    `Viaje ${previo[0].viaje} · ${tramo} · ${previo[0].ruta || 'sin ruta'}: ${Number(previo[0].peso_total || 0)} kg → ${kg} kg`);
            }
            res.json({ ok: true, id, peso_total: kg });
        } catch (err) {
            console.error('[PUT /marsisa-ordenes-viaje/rutas/:id]', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.put('/ordenes-viaje/:viaje', async (req, res) => {
        try {
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
                horas_motor_remolque,
                configuracion_tracto,
                configuracion_remolque,
                ejecucion,
                tercero_nombre,
                tercero_ruc,
                tercero_costo,
                tercero_moneda,
                tercero_documento
            } = req.body;

            const esTercero = String(ejecucion || '').toUpperCase() === 'TERCERO';
            if (esTercero ? !String(tercero_nombre || '').trim() : (!placa_tracto || !conductor)) {
                return res.status(400).json({ ok: false, error: esTercero ? 'Indica el transportista tercero.' : 'Conductor y Vehículo (Tracto) son obligatorios.' });
            }
            const costoTerc = parseFloat(tercero_costo);
            const datosTercero = [
                esTercero ? 'TERCERO' : 'PROPIO',
                esTercero ? String(tercero_nombre).trim().slice(0, 200) : null,
                esTercero && String(tercero_ruc || '').trim() ? String(tercero_ruc).trim().slice(0, 20) : null,
                esTercero && Number.isFinite(costoTerc) ? costoTerc : null,
                esTercero && String(tercero_moneda || '').trim() ? String(tercero_moneda).trim().slice(0, 20) : null,
                esTercero && String(tercero_documento || '').trim() ? String(tercero_documento).trim().slice(0, 100) : null,
            ];

            const parsedKm = parseInt(kilometraje_inicial, 10);
            const kmIniVal = (!isNaN(parsedKm) && parsedKm >= 0) ? parsedKm : null;
            const parsedHr = parseInt(horas_motor_remolque, 10);
            const hrRemVal = (!isNaN(parsedHr) && parsedHr >= 0) ? parsedHr : null;
            const pesoVal = !isNaN(parseFloat(peso)) ? parseFloat(peso) : 0.00;

            await tdb.query(`
                UPDATE operaciones_ordenes_viaje
                SET fecha_viaje = COALESCE(?, fecha_viaje),
                    id_conductor = ?,
                    conductor = ?,
                    placa_tracto = ?,
                    placa_remolque = ?,
                    configuracion_tracto = ?,
                    configuracion_remolque = ?,
                    ruta = ?,
                    peso = ?,
                    ubigeo_partida = ?,
                    direccion_partida = ?,
                    ubigeo_llegada = ?,
                    direccion_llegada = ?,
                    escolta = ?,
                    observaciones = ?,
                    kilometraje_inicial = COALESCE(?, kilometraje_inicial),
                    horas_motor_remolque = COALESCE(?, horas_motor_remolque),
                    ejecucion = ?,
                    tercero_nombre = ?,
                    tercero_ruc = ?,
                    tercero_costo = ?,
                    tercero_moneda = ?,
                    tercero_documento = ?
                WHERE viaje = ?
            `, [
                fecha_viaje || null,
                id_conductor || null,
                String(conductor || '').trim().toUpperCase(),
                String(placa_tracto || '').trim().toUpperCase(),
                placa_remolque ? String(placa_remolque).trim().toUpperCase() : null,
                configuracion_tracto ? String(configuracion_tracto).trim().toUpperCase() : null,
                configuracion_remolque ? String(configuracion_remolque).trim().toUpperCase() : null,
                ruta ? String(ruta).trim() : null,
                pesoVal,
                ubigeo_partida || null,
                direccion_partida || null,
                ubigeo_llegada || null,
                direccion_llegada || null,
                escolta || null,
                observaciones || null,
                kmIniVal,
                hrRemVal,
                ...datosTercero,
                codeViaje
            ]);

            // Actualizar o insertar configuración en la tabla placas para tracto y carreta
            if (configuracion_tracto && String(configuracion_tracto).trim() && placa_tracto) {
                try {
                    const cTr = String(configuracion_tracto).trim().toUpperCase();
                    const pTr = String(placa_tracto).trim().toUpperCase();
                    const [resUpd] = await tdb.query(
                        `UPDATE placas SET configuracion = ? WHERE UPPER(TRIM(placa)) = UPPER(TRIM(?))`,
                        [cTr, pTr]
                    );
                    if (resUpd && resUpd.affectedRows === 0) {
                        await tdb.query(
                            `INSERT INTO placas (placa, configuracion, tipo, sub_tipo, estado) VALUES (?, ?, 'Tracto', 'Tracto', 'Activa') ON DUPLICATE KEY UPDATE configuracion = VALUES(configuracion)`,
                            [pTr, cTr]
                        );
                    }
                } catch(pErr) {
                    console.warn('No se pudo actualizar configuración de tracto en tabla placas:', pErr.message);
                }
            }
            if (configuracion_remolque && String(configuracion_remolque).trim() && placa_remolque) {
                try {
                    const cRem = String(configuracion_remolque).trim().toUpperCase();
                    const pRem = String(placa_remolque).trim().toUpperCase();
                    const [resUpd] = await tdb.query(
                        `UPDATE placas SET configuracion = ? WHERE UPPER(TRIM(placa)) = UPPER(TRIM(?))`,
                        [cRem, pRem]
                    );
                    if (resUpd && resUpd.affectedRows === 0) {
                        await tdb.query(
                            `INSERT INTO placas (placa, configuracion, tipo, sub_tipo, estado) VALUES (?, ?, 'Carreta', 'Carreta', 'Activa') ON DUPLICATE KEY UPDATE configuracion = VALUES(configuracion)`,
                            [pRem, cRem]
                        );
                    }
                } catch(pErr) {
                    console.warn('No se pudo actualizar configuración de remolque en tabla placas:', pErr.message);
                }
            }

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

    // ── PATCH /api/operaciones/ordenes-viaje/:viaje/asignacion (Asignar conductor, tracto, carreta y ruta) ───
    // Solo toca esos cuatro campos; a diferencia del PUT no pone en blanco fechas, ubigeos ni observaciones.
    // Avisos no bloqueantes: documentos vencidos y unidad o conductor ya en otro viaje activo del mismo día (o en ruta).
    router.patch('/ordenes-viaje/:viaje/asignacion', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ ok: false, error: 'Base de datos no disponible' });

            const codeViaje = req.params.viaje;
            const { id_conductor, conductor, placa_tracto, placa_remolque, ruta } = req.body || {};
            if (!placa_tracto || !conductor) {
                return res.status(400).json({ ok: false, error: 'Conductor y Vehículo (Tracto) son obligatorios.' });
            }

            const [[actual]] = await tdb.query(
                `SELECT estado, placa_tracto, placa_remolque, DATE_FORMAT(fecha_viaje, '%Y-%m-%d') AS dia
                 FROM operaciones_ordenes_viaje WHERE viaje = ?`, [codeViaje]);
            if (!actual) return res.status(404).json({ ok: false, error: 'Viaje no encontrado.' });
            if (actual.estado !== 'ACTIVO' && actual.estado !== 'INICIADO') {
                return res.status(409).json({ ok: false, error: `No se puede reasignar un viaje ${actual.estado}.` });
            }

            const tracto = String(placa_tracto).trim().toUpperCase();
            const carreta = placa_remolque ? String(placa_remolque).trim().toUpperCase() : null;
            const nombre = String(conductor).trim().toUpperCase();
            const unidades = [tracto, carreta].filter(Boolean);

            // Si cambia la unidad, la configuración guardada en el viaje era de la unidad anterior: se descarta
            // para que el servidor vuelva a leer la configuración de la placa nueva.
            const mismoTracto = String(actual.placa_tracto ?? '').trim().toUpperCase() === tracto;
            const mismaCarreta = String(actual.placa_remolque ?? '').trim().toUpperCase() === String(carreta ?? '');

            await tdb.query(`
                UPDATE operaciones_ordenes_viaje
                SET id_conductor = ?,
                    conductor = ?,
                    placa_tracto = ?,
                    placa_remolque = ?,
                    configuracion_tracto = ${mismoTracto ? 'configuracion_tracto' : 'NULL'},
                    configuracion_remolque = ${mismaCarreta ? 'configuracion_remolque' : 'NULL'},
                    ruta = ?
                WHERE viaje = ?
            `, [id_conductor || null, nombre, tracto, carreta, ruta ? String(ruta).trim() : null, codeViaje]);

            const advertencias = (await documentosVencidosPara(tdb, unidades)).map(mensajeAdvertencia);

            const [choques] = await tdb.query(`
                SELECT viaje, estado, conductor, placa_tracto, placa_remolque
                FROM operaciones_ordenes_viaje
                WHERE viaje <> ?
                  AND (estado = 'INICIADO' OR (estado = 'ACTIVO' AND DATE_FORMAT(fecha_viaje, '%Y-%m-%d') = ?))
                  AND (UPPER(TRIM(placa_tracto)) IN (?) OR UPPER(TRIM(placa_remolque)) IN (?) OR UPPER(TRIM(conductor)) = ?)
            `, [codeViaje, actual.dia ?? '', unidades, unidades, nombre]);
            for (const c of choques) {
                const motivos = [];
                if (unidades.includes(String(c.placa_tracto ?? '').trim().toUpperCase()) || unidades.includes(String(c.placa_remolque ?? '').trim().toUpperCase())) motivos.push('la unidad');
                if (String(c.conductor ?? '').trim().toUpperCase() === nombre) motivos.push('el conductor');
                advertencias.push(`Advertencia: ${motivos.join(' y ')} ya ${motivos.length > 1 ? 'están' : 'está'} en el viaje ${c.viaje} (${c.estado}).`);
            }

            res.json({ ok: true, message: `Asignación del viaje ${codeViaje} actualizada.`, advertencias });
        } catch (err) {
            console.error('Error al asignar orden de viaje:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ── DELETE /api/operaciones/ordenes-viaje/:viaje (Eliminar Orden de Viaje) ───
    router.delete('/ordenes-viaje/:viaje', async (req, res) => {
        try {
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

                // Determinar índice del escalón según regla de punto medio (umbral 2.5 Tn entre intervalos de 5)
                let targetIdx = 0;
                if (p <= 2.5) targetIdx = 0;       // km_0 (0 Tn)
                else if (p <= 7.5) targetIdx = 1;  // km_5 (5 Tn)
                else if (p <= 12.5) targetIdx = 2; // km_10 (10 Tn)
                else if (p <= 17.5) targetIdx = 3; // km_15 (15 Tn)
                else if (p <= 22.5) targetIdx = 4; // km_20 (20 Tn)
                else if (p <= 27.5) targetIdx = 5; // km_25 (25 Tn)
                else targetIdx = 6;                // km_30 (> 27.5 Tn)

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
                // Callao forma parte de Lima (la matriz de rendimiento solo tiene LIMA)
                const sinCallao = (s) => String(s == null ? '' : s).replace(/\bCALLAO\b/gi, 'LIMA');
                const rutaIdaTexto = sinCallao(rutasIda.length > 0
                    ? rutasIda.map(r => r.ruta).join(' | ')
                    : (v.ruta_cabecera || 'LIMA - DESTINO'));

                let rutaRetornoTexto = sinCallao(rutasRetorno.length > 0
                    ? rutasRetorno.map(r => r.ruta).join(' | ')
                    : '');

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

                // Descuento -25% si va sin carreta (solo tracto)
                const esSinCarreta = !v.placa_remolque || v.placa_remolque.trim() === '' || v.placa_remolque === '—';
                if (esSinCarreta) {
                    galonesIda = +(galonesIda * 0.75).toFixed(2);
                    galonesRetorno = +(galonesRetorno * 0.75).toFixed(2);
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
                        CASE 
                            WHEN ov.estado IN ('FINALIZADO', 'LIQUIDADO') THEN 'FINALIZADO'
                            WHEN v_stat.tiene_fin > 0 THEN 'FINALIZADO'
                            ELSE 'INICIADO'
                        END AS estado
                    FROM marsisa_ordenes_viaje_rutas r
                    LEFT JOIN marsisa_ordenes_viaje ov ON r.viaje = ov.viaje
                    LEFT JOIN (
                        SELECT 
                            viaje,
                            SUM(CASE WHEN tipo LIKE '%FIN%' THEN 1 ELSE 0 END) AS tiene_fin
                        FROM marsisa_combustible_vales
                        GROUP BY viaje
                    ) v_stat ON (r.viaje = v_stat.viaje OR r.viaje = CONCAT('2026-', v_stat.viaje) OR r.viaje = CONCAT('2025-', v_stat.viaje))
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
                    CASE 
                        WHEN ov.estado IN ('FINALIZADO', 'LIQUIDADO') THEN 'FINALIZADO'
                        WHEN v_stat.tiene_fin > 0 THEN 'FINALIZADO'
                        WHEN v_stat.total_vales > 0 THEN 'INICIADO'
                        ELSE 'INICIADO'
                    END AS estado,
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
                        COUNT(*) AS total_vales,
                        SUM(CASE WHEN tipo LIKE '%FIN%' THEN 1 ELSE 0 END) AS tiene_fin
                    FROM marsisa_combustible_vales
                    GROUP BY viaje
                ) v_stat ON (ov.viaje = v_stat.viaje OR ov.viaje = CONCAT('2026-', v_stat.viaje) OR ov.viaje = CONCAT('2025-', v_stat.viaje))
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
                            peso_total = IF(peso_manual = 1, peso_total, VALUES(peso_total)),
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

    // 0. Rutas disponibles de la Matriz de Combustible D2 para listas desplegables y autocompletado de recorrido (KM)
    router.get('/rutas-matriz', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const [rows] = await tdb.query(`
                SELECT 
                    TRIM(UPPER(ruta)) AS ruta,
                    COALESCE(sentido, 'IDA') AS sentido,
                    COALESCE(MAX(km), 0) AS km,
                    COUNT(*) AS total_variantes
                FROM combustible_matriz_d2
                WHERE estado = 'ACTIVO' AND ruta IS NOT NULL AND TRIM(ruta) != ''
                GROUP BY TRIM(UPPER(ruta)), COALESCE(sentido, 'IDA')
                ORDER BY ruta ASC, sentido ASC
            `);
            res.json({ ok: true, data: rows || [] });
        } catch (err) {
            console.error('Error al obtener rutas de matriz:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ════════════════════════════════════════════════════════════════
    // ÓRDENES DE SERVICIO (rediseño 2026-11-12)
    // El servicio es lo que se vende al cliente; el viaje es lo que ejecuta la unidad. Un viaje agrupa varios
    // servicios (ida, retorno, locales) a través de operaciones_ordenes_viaje_rutas (viaje + orden = código del servicio).
    // Estados: PENDIENTE → PROGRAMADO (ya tiene viaje) → EN_EJECUCION → ENTREGADO; ANULADO en cualquier punto antes de entregar.
    // ════════════════════════════════════════════════════════════════
    const OS_CERRADOS = ['ENTREGADO', 'ANULADO'];
    const osTexto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
    const osNumero = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
    const osFecha = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null);
    const osUsuario = (req) => (req.user && req.user.nombre) || 'ADMINISTRADOR';

    // Servicio con su viaje (el primero, y cuántos tiene)
    const OS_SELECT = `
        SELECT os.*,
               DATE_FORMAT(os.fecha, '%Y-%m-%d') AS fecha_fmt,
               DATE_FORMAT(os.fecha_entrega, '%Y-%m-%d') AS fecha_entrega_fmt,
               (SELECT MAX(m.km) FROM combustible_matriz_d2 m WHERE m.estado = 'ACTIVO' AND m.ruta COLLATE utf8mb4_unicode_ci = os.ruta COLLATE utf8mb4_unicode_ci) AS distancia_km,
               b.viaje AS viaje, COALESCE(b.n, 0) AS viajes_n,
               ov.estado AS viaje_estado, ov.conductor AS conductor, ov.placa_tracto AS placa_tracto,
               ov.placa_remolque AS placa_carreta, ov.ejecucion AS ejecucion, ov.tercero_nombre AS tercero_nombre
        FROM operaciones_ordenes_servicio os
        LEFT JOIN (SELECT orden, MIN(viaje) AS viaje, COUNT(*) AS n FROM operaciones_ordenes_viaje_rutas GROUP BY orden) b
               ON b.orden COLLATE utf8mb4_unicode_ci = os.codigo_orden COLLATE utf8mb4_unicode_ci
        LEFT JOIN operaciones_ordenes_viaje ov ON ov.viaje COLLATE utf8mb4_unicode_ci = b.viaje COLLATE utf8mb4_unicode_ci`;

    async function siguienteCodigoServicio(tdb) {
        const year = new Date().getFullYear().toString();
        const [rows] = await tdb.query(`SELECT numero FROM operaciones_ordenes_servicio WHERE serie = ? ORDER BY id DESC LIMIT 1`, [year]);
        let next = 1;
        if (rows && rows.length) { const p = parseInt(rows[0].numero, 10); if (!isNaN(p)) next = p + 1; }
        const numero = String(next).padStart(8, '0');
        return { serie: year, numero, codigo_orden: `${year}-${numero}` };
    }

    router.get('/ordenes-servicio/correlativo', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });
            res.json({ ok: true, ...(await siguienteCodigoServicio(tdb)) });
        } catch (err) {
            console.error('Error al obtener correlativo de orden de servicio:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Últimas direcciones de carga y entrega usadas (por cliente y distrito): el formulario las propone para no volver a escribirlas
    router.get('/ordenes-servicio/direcciones-recientes', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });
            const [rows] = await tdb.query(
                `SELECT 'origen' AS tipo, cliente_nombre, ubigeo_origen AS ubigeo, direccion_origen AS direccion, MAX(id) AS ultimo
                   FROM operaciones_ordenes_servicio WHERE ubigeo_origen IS NOT NULL AND TRIM(COALESCE(direccion_origen, '')) <> '' AND estado_servicio <> 'ANULADO'
                  GROUP BY cliente_nombre, ubigeo_origen, direccion_origen
                 UNION ALL
                 SELECT 'destino' AS tipo, cliente_nombre, ubigeo_destino AS ubigeo, direccion_destino AS direccion, MAX(id) AS ultimo
                   FROM operaciones_ordenes_servicio WHERE ubigeo_destino IS NOT NULL AND TRIM(COALESCE(direccion_destino, '')) <> '' AND estado_servicio <> 'ANULADO'
                  GROUP BY cliente_nombre, ubigeo_destino, direccion_destino
                 ORDER BY ultimo DESC LIMIT 2000`);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error('Error al listar direcciones recientes:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Rutas para elegir en el formulario: las de la matriz de combustible (según el sentido) y las ya usadas en otros servicios
    router.get('/ordenes-servicio/rutas', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });
            const sentido = String(req.query.sentido || '').toUpperCase() === 'RETORNO' ? 'RETORNO' : 'IDA';
            let matriz = [];
            try { [matriz] = await tdb.query(`SELECT ruta, MAX(km) AS km FROM combustible_matriz_d2 WHERE estado = 'ACTIVO' AND sentido = ? AND TRIM(ruta) <> '' GROUP BY ruta ORDER BY ruta`, [sentido]); } catch (e) { matriz = []; }
            let kmDe = new Map();
            try { const [todas] = await tdb.query(`SELECT ruta, MAX(km) AS km FROM combustible_matriz_d2 WHERE estado = 'ACTIVO' GROUP BY ruta`); kmDe = new Map(todas.map(x => [String(x.ruta).trim().toUpperCase(), Number(x.km) || 0])); } catch (e) { kmDe = new Map(); }
            const [usadas] = await tdb.query(`SELECT ruta, COUNT(*) AS n FROM operaciones_ordenes_servicio WHERE ruta IS NOT NULL AND ruta <> '' AND es_retorno = ? GROUP BY ruta ORDER BY n DESC LIMIT 200`, [sentido === 'RETORNO' ? 1 : 0]);
            const vistas = new Set();
            const data = [];
            for (const r of [...matriz.map(x => ({ ruta: x.ruta, origen: 'matriz' })), ...usadas.map(x => ({ ruta: x.ruta, origen: 'usada' }))]) {
                const clave = String(r.ruta).trim().toUpperCase();
                if (!clave || vistas.has(clave)) continue;
                vistas.add(clave); data.push({ ruta: clave, origen: r.origen, km: kmDe.get(clave) || null });
            }
            res.json({ ok: true, data });
        } catch (err) {
            console.error('Error al listar rutas de servicio:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.get('/ordenes-servicio', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });
            const { fecha_desde, fecha_hasta, cliente, q, viaje, estado } = req.query;
            let sql = `${OS_SELECT} WHERE 1=1`;
            const params = [];
            if (viaje && String(viaje).trim()) {
                sql += ` AND os.codigo_orden IN (SELECT orden FROM operaciones_ordenes_viaje_rutas WHERE viaje = ?)`;
                params.push(String(viaje).trim());
            }
            if (estado && String(estado).trim()) { sql += ` AND os.estado_servicio = ?`; params.push(String(estado).trim().toUpperCase()); }
            if (fecha_desde) { sql += ` AND os.fecha >= ?`; params.push(fecha_desde); }
            if (fecha_hasta) { sql += ` AND os.fecha <= ?`; params.push(fecha_hasta); }
            if (cliente && String(cliente).trim() && cliente !== 'TODOS') { sql += ` AND (os.cliente_nombre = ? OR os.cliente_id = ?)`; params.push(cliente, cliente); }
            if (q && String(q).trim()) {
                const term = `%${String(q).trim()}%`;
                sql += ` AND (os.codigo_orden LIKE ? OR os.cliente_nombre LIKE ? OR os.origen LIKE ? OR os.destino LIKE ? OR os.tipo_servicio LIKE ? OR b.viaje LIKE ? OR ov.conductor LIKE ? OR ov.placa_tracto LIKE ?)`;
                params.push(term, term, term, term, term, term, term, term);
            }
            sql += ` ORDER BY os.fecha DESC, os.id DESC LIMIT 1500`;
            const [rows] = await tdb.query(sql, params);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error('Error al listar ordenes de servicio:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.get('/ordenes-servicio/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });
            const [rows] = await tdb.query(`${OS_SELECT} WHERE os.id = ? OR os.codigo_orden = ? LIMIT 1`, [req.params.id, req.params.id]);
            if (!rows.length) return res.status(404).json({ ok: false, error: 'Orden de servicio no encontrada' });
            const o = rows[0];
            const [viajes] = await tdb.query(
                `SELECT r.viaje, ov.estado, ov.conductor, ov.placa_tracto, ov.placa_remolque, ov.ejecucion, ov.tercero_nombre, DATE_FORMAT(ov.fecha_viaje, '%Y-%m-%d') AS fecha_viaje
                 FROM operaciones_ordenes_viaje_rutas r LEFT JOIN operaciones_ordenes_viaje ov ON ov.viaje COLLATE utf8mb4_unicode_ci = r.viaje COLLATE utf8mb4_unicode_ci
                 WHERE r.orden COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci ORDER BY r.id`, [o.codigo_orden]);
            // documentos y rutas ya no se manejan aquí (las guías se vincularán más adelante); se devuelven vacíos por compatibilidad
            res.json({ ok: true, data: { ...o, viajes, documentos: [], rutas: [] } });
        } catch (err) {
            console.error('Error al obtener orden de servicio:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // «ORIGEN - DESTINO» → { origen, destino } (la ruta es lo que se elige; origen y destino se derivan de ella)
    function tramosDeRuta(ruta) {
        const partes = String(ruta || '').split(/\s+-\s+/).map(t => t.trim()).filter(Boolean);
        return { origen: partes[0] || null, destino: partes.length > 1 ? partes.slice(1).join(' - ') : null };
    }

    function camposServicio(b) {
        const ruta = osTexto(b.ruta, 150) ? osTexto(b.ruta, 150).toUpperCase() : null;
        const tramo = tramosDeRuta(ruta);
        return {
            fecha: osFecha(b.fecha) || new Date().toISOString().slice(0, 10),
            fecha_entrega: osFecha(b.fecha_entrega),
            moneda: osTexto(b.moneda, 20) || 'SOLES',
            tipo_cambio: osNumero(b.tipo_cambio) ?? 3.75,
            tipo_contratacion: String(b.tipo_contratacion || '').toUpperCase() === 'INTERMEDIARIO' ? 'INTERMEDIARIO' : 'CLIENTE DIRECTO',
            intermediario: String(b.tipo_contratacion || '').toUpperCase() === 'INTERMEDIARIO' ? osTexto(b.intermediario, 255) : null,
            ejecucion: String(b.ejecucion || '').toUpperCase() === 'TERCERO' ? 'TERCERO' : 'PROPIO',
            ruta,
            cliente_id: Number.isInteger(Number(b.cliente_id)) && Number(b.cliente_id) > 0 ? Number(b.cliente_id) : null,
            cliente_nombre: osTexto(b.cliente_nombre, 255),
            tipo_servicio: osTexto(b.tipo_servicio, 100) || 'CARGA GENERAL',
            es_retorno: b.es_retorno === true || b.es_retorno === 1 || b.es_retorno === '1' ? 1 : 0,
            origen: tramo.origen || osTexto(b.origen, 150),
            destino: tramo.destino || osTexto(b.destino, 150),
            ubigeo_origen: /^\d{6}$/.test(String(b.ubigeo_origen || '')) ? String(b.ubigeo_origen) : null,
            direccion_origen: osTexto(b.direccion_origen, 255),
            ubigeo_destino: /^\d{6}$/.test(String(b.ubigeo_destino || '')) ? String(b.ubigeo_destino) : null,
            direccion_destino: osTexto(b.direccion_destino, 255),
            descripcion_carga: osTexto(b.descripcion_carga, 255),
            peso_estimado: osNumero(b.peso_estimado),
            impuesto: osTexto(b.impuesto, 50) || 'INCLUYE IGV',
            costo_flete: osNumero(b.costo_flete) ?? 0,
            destinatario: osTexto(b.destinatario, 255),
            remitente_generador: osTexto(b.remitente_generador, 255),
            observaciones: osTexto(b.observaciones, 5000),
        };
    }

    router.post('/ordenes-servicio', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });
            const c = camposServicio(req.body || {});
            if (!c.cliente_nombre) return res.status(400).json({ ok: false, error: 'Indica el cliente.' });
            if (!c.ruta) return res.status(400).json({ ok: false, error: 'Elige la ruta del servicio.' });
            if (c.tipo_contratacion === 'INTERMEDIARIO' && !c.intermediario) return res.status(400).json({ ok: false, error: 'Indica la empresa que nos contrata como intermediario.' });
            const cols = Object.keys(c);
            let ultimo = null;
            for (let intento = 0; intento < 3; intento++) {
                const cod = await siguienteCodigoServicio(tdb);
                try {
                    const [r] = await tdb.query(
                        `INSERT INTO operaciones_ordenes_servicio (serie, numero, codigo_orden, ${cols.join(', ')}, estado_servicio, usuario_creacion) VALUES (?, ?, ?, ${cols.map(() => '?').join(', ')}, 'PENDIENTE', ?)`,
                        [cod.serie, cod.numero, cod.codigo_orden, ...cols.map(k => c[k]), osUsuario(req)]);
                    if (logAudit) logAudit({ req, accion: 'CREAR_ORDEN_SERVICIO', modulo: 'OPERACIONES', detalle: `Creada orden de servicio ${cod.codigo_orden} (${c.cliente_nombre}: ${c.origen} → ${c.destino})` });
                    return res.json({ ok: true, id: r.insertId, codigo_orden: cod.codigo_orden, message: `Orden de servicio ${cod.codigo_orden} creada.` });
                } catch (e) { if (e && e.code === 'ER_DUP_ENTRY') { ultimo = e; continue; } throw e; }
            }
            throw ultimo;
        } catch (err) {
            console.error('Error al crear orden de servicio:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.put('/ordenes-servicio/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });
            const [prev] = await tdb.query(`SELECT id, codigo_orden, estado_servicio FROM operaciones_ordenes_servicio WHERE id = ?`, [req.params.id]);
            if (!prev.length) return res.status(404).json({ ok: false, error: 'Orden de servicio no encontrada' });
            if (OS_CERRADOS.includes(String(prev[0].estado_servicio).toUpperCase())) return res.status(409).json({ ok: false, error: 'Una orden entregada o anulada ya no se edita.' });
            const c = camposServicio(req.body || {});
            if (!c.cliente_nombre) return res.status(400).json({ ok: false, error: 'Indica el cliente.' });
            if (!c.ruta) return res.status(400).json({ ok: false, error: 'Elige la ruta del servicio.' });
            if (c.tipo_contratacion === 'INTERMEDIARIO' && !c.intermediario) return res.status(400).json({ ok: false, error: 'Indica la empresa que nos contrata como intermediario.' });
            const cols = Object.keys(c);
            const [r] = await tdb.query(`UPDATE operaciones_ordenes_servicio SET ${cols.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...cols.map(k => c[k]), req.params.id]);
            // El tramo del vínculo con el viaje se mantiene al día
            await tdb.query(`UPDATE operaciones_ordenes_viaje_rutas SET ruta = ?, tipo_servicio = ?, es_retorno = ?, peso_total = COALESCE(?, peso_total) WHERE orden = ?`,
                [c.ruta, c.tipo_servicio, c.es_retorno, c.peso_estimado, prev[0].codigo_orden]);
            if (logAudit) logAudit({ req, accion: 'EDITAR_ORDEN_SERVICIO', modulo: 'OPERACIONES', detalle: `Editada orden de servicio ${prev[0].codigo_orden}` });
            res.json({ ok: true, message: 'Orden de servicio actualizada.', filas: r.affectedRows });
        } catch (err) {
            console.error('Error al actualizar orden de servicio:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Vincula un servicio a un viaje ya existente
    async function vincularServicioViaje(tdb, os, viaje) {
        await tdb.query(
            `INSERT INTO operaciones_ordenes_viaje_rutas (viaje, orden, ruta, tipo_servicio, es_retorno, peso_total) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE ruta = VALUES(ruta), tipo_servicio = VALUES(tipo_servicio), es_retorno = VALUES(es_retorno), peso_total = VALUES(peso_total)`,
            [viaje, os.codigo_orden, os.ruta || [os.origen, os.destino].filter(Boolean).join(' - '), os.tipo_servicio || 'CARGA GENERAL', os.es_retorno ? 1 : 0, os.peso_estimado || 0]);
        await tdb.query(`UPDATE operaciones_ordenes_servicio SET estado_servicio = 'PROGRAMADO' WHERE id = ? AND estado_servicio = 'PENDIENTE'`, [os.id]);
    }

    router.post('/ordenes-servicio/:id/asignar-viaje', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });
            const viaje = String((req.body || {}).viaje || '').trim().toUpperCase();
            if (!viaje) return res.status(400).json({ ok: false, error: 'Elige el viaje.' });
            const [os] = await tdb.query(`SELECT * FROM operaciones_ordenes_servicio WHERE id = ?`, [req.params.id]);
            if (!os.length) return res.status(404).json({ ok: false, error: 'Orden de servicio no encontrada' });
            if (OS_CERRADOS.includes(String(os[0].estado_servicio).toUpperCase())) return res.status(409).json({ ok: false, error: 'La orden ya está cerrada.' });
            const [v] = await tdb.query(`SELECT viaje, estado FROM operaciones_ordenes_viaje WHERE viaje = ?`, [viaje]);
            if (!v.length) return res.status(404).json({ ok: false, error: 'El viaje no existe.' });
            if (['FINALIZADO', 'ANULADO'].includes(String(v[0].estado).toUpperCase())) return res.status(409).json({ ok: false, error: 'El viaje ya está cerrado.' });
            await vincularServicioViaje(tdb, os[0], viaje);
            if (logAudit) logAudit({ req, accion: 'ASIGNAR_SERVICIO_VIAJE', modulo: 'OPERACIONES', detalle: `Servicio ${os[0].codigo_orden} asignado al viaje ${viaje}` });
            res.json({ ok: true, message: `Servicio asignado al viaje ${viaje}.`, viaje });
        } catch (err) {
            console.error('Error al asignar viaje:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Crea un viaje nuevo con los datos del servicio (origen, destino, fecha, peso); conductor y placa se eligen después
    router.post('/ordenes-servicio/:id/generar-viaje', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });
            const [os] = await tdb.query(`SELECT * FROM operaciones_ordenes_servicio WHERE id = ?`, [req.params.id]);
            if (!os.length) return res.status(404).json({ ok: false, error: 'Orden de servicio no encontrada' });
            const o = os[0];
            if (OS_CERRADOS.includes(String(o.estado_servicio).toUpperCase())) return res.status(409).json({ ok: false, error: 'La orden ya está cerrada.' });
            const [ya] = await tdb.query(`SELECT viaje FROM operaciones_ordenes_viaje_rutas WHERE orden = ? LIMIT 1`, [o.codigo_orden]);
            if (ya.length) return res.status(409).json({ ok: false, error: `Ya tiene el viaje ${ya[0].viaje}.` });

            const year = new Date().getFullYear();
            const con = await tdb.getConnection();
            try {
                await con.beginTransaction();
                const [rows] = await con.query(`SELECT viaje FROM operaciones_ordenes_viaje WHERE viaje LIKE ? ORDER BY viaje DESC LIMIT 1 FOR UPDATE`, [`${year}-%`]);
                let next = 1;
                if (rows.length) { const p = parseInt(String(rows[0].viaje).replace(`${year}-`, ''), 10); if (!isNaN(p)) next = p + 1; }
                const codigo = `${year}-${String(next).padStart(8, '0')}`;
                const fechaViaje = `${osFecha(o.fecha instanceof Date ? o.fecha.toISOString() : o.fecha) || new Date().toISOString().slice(0, 10)} 00:00:00`;
                const d = req.body || {};
                const tercero = String(d.ejecucion || o.ejecucion || '').toUpperCase() === 'TERCERO';
                if (tercero ? !osTexto(d.tercero_nombre, 150) && d.ejecucion : false) throw Object.assign(new Error('Indica el transportista tercero.'), { status: 400 });
                const fechaElegida = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(String(d.fecha_viaje || '')) ? `${String(d.fecha_viaje).slice(0, 10)} ${String(d.fecha_viaje).slice(11, 16)}:00` : fechaViaje;
                const idCond = Number.isInteger(Number(d.id_conductor)) && Number(d.id_conductor) > 0 ? Number(d.id_conductor) : null;
                await con.query(
                    `INSERT INTO operaciones_ordenes_viaje (viaje, fecha_viaje, id_conductor, conductor, placa_tracto, placa_remolque, escolta, observaciones, ruta, origen, destino, ubigeo_partida, direccion_partida, ubigeo_llegada, direccion_llegada, peso, ejecucion, tercero_nombre, tercero_ruc, tercero_costo, tercero_moneda, tercero_documento, estado, usuario_creacion)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO', ?)`,
                    [codigo, fechaElegida, idCond, osTexto(d.conductor, 150) || '', (osTexto(d.placa_tracto, 20) || '').toUpperCase(), osTexto(d.placa_remolque, 20) ? osTexto(d.placa_remolque, 20).toUpperCase() : null, osTexto(d.escolta, 150), osTexto(d.observaciones, 5000), o.ruta || [o.origen, o.destino].filter(Boolean).join(' - '), o.origen, o.destino, o.ubigeo_origen, o.direccion_origen, o.ubigeo_destino, o.direccion_destino, o.peso_estimado || 0, tercero ? 'TERCERO' : 'PROPIO',
                     tercero ? osTexto(d.tercero_nombre, 150) : null, tercero ? osTexto(d.tercero_ruc, 20) : null, tercero ? osNumero(d.tercero_costo) : null,
                     tercero ? (/DOL/i.test(String(d.tercero_moneda || '')) ? 'DOLARES' : 'SOLES') : null, tercero ? osTexto(d.tercero_documento, 60) : null, osUsuario(req)]);
                await con.query(
                    `INSERT INTO operaciones_ordenes_viaje_rutas (viaje, orden, ruta, tipo_servicio, es_retorno, peso_total) VALUES (?, ?, ?, ?, ?, ?)`,
                    [codigo, o.codigo_orden, o.ruta || [o.origen, o.destino].filter(Boolean).join(' - '), o.tipo_servicio || 'CARGA GENERAL', o.es_retorno ? 1 : 0, o.peso_estimado || 0]);
                const [u] = await con.query(`UPDATE operaciones_ordenes_servicio SET estado_servicio = 'PROGRAMADO' WHERE id = ? AND estado_servicio = 'PENDIENTE'`, [o.id]);
                await con.commit();
                if (logAudit) logAudit({ req, accion: 'GENERAR_VIAJE_DESDE_SERVICIO', modulo: 'OPERACIONES', detalle: `Viaje ${codigo} generado desde el servicio ${o.codigo_orden}` });
                res.json({ ok: true, message: `Viaje ${codigo} generado.`, viaje: codigo, programado: u.affectedRows === 1 });
            } catch (e) { await con.rollback(); throw e; } finally { con.release(); }
        } catch (err) {
            console.error('Error al generar viaje desde servicio:', err);
            res.status(err.status || 500).json({ ok: false, error: err.message });
        }
    });

    // Quita el servicio de un viaje (solo antes de empezar)
    router.delete('/ordenes-servicio/:id/viaje/:viaje', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });
            const [os] = await tdb.query(`SELECT id, codigo_orden, estado_servicio FROM operaciones_ordenes_servicio WHERE id = ?`, [req.params.id]);
            if (!os.length) return res.status(404).json({ ok: false, error: 'Orden de servicio no encontrada' });
            const est = String(os[0].estado_servicio).toUpperCase();
            if (!['PENDIENTE', 'PROGRAMADO'].includes(est)) return res.status(409).json({ ok: false, error: 'Solo se puede quitar del viaje antes de iniciar el servicio.' });
            const [d] = await tdb.query(`DELETE FROM operaciones_ordenes_viaje_rutas WHERE orden = ? AND viaje = ?`, [os[0].codigo_orden, req.params.viaje]);
            const [resto] = await tdb.query(`SELECT COUNT(*) AS n FROM operaciones_ordenes_viaje_rutas WHERE orden = ?`, [os[0].codigo_orden]);
            if (!resto[0].n) await tdb.query(`UPDATE operaciones_ordenes_servicio SET estado_servicio = 'PENDIENTE' WHERE id = ? AND estado_servicio = 'PROGRAMADO'`, [os[0].id]);
            if (logAudit) logAudit({ req, accion: 'QUITAR_SERVICIO_VIAJE', modulo: 'OPERACIONES', detalle: `Servicio ${os[0].codigo_orden} quitado del viaje ${req.params.viaje}` });
            res.json({ ok: true, message: 'Servicio quitado del viaje.', filas: d.affectedRows });
        } catch (err) {
            console.error('Error al quitar servicio del viaje:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Cuenta por cobrar del servicio (Tesorería): se crea o actualiza cuando el servicio entra en ejecución
    async function sincronizarCuentaPorCobrar(tdb, o, v, fechaServicio) {
        const netoDeseado = parseFloat(o.costo_flete) || 0;
        let total = netoDeseado > 700 ? Math.round(netoDeseado / 0.96) : netoDeseado;
        let detr = total > 700 ? Math.round(total * 0.04) : 0;
        while ((total - detr) < netoDeseado) { total++; detr = total > 700 ? Math.round(total * 0.04) : 0; }
        while ((total - detr) > netoDeseado) { total--; detr = total > 700 ? Math.round(total * 0.04) : 0; }
        const bi = parseFloat((total / 1.18).toFixed(2));
        const igv = parseFloat((total - bi).toFixed(2));
        const neto = parseFloat((total - detr).toFixed(2));
        const lugar = [o.origen, o.destino].filter(Boolean).join(' - ');
        const [ex] = await tdb.query(`SELECT id FROM tesoreria_cuentas WHERE orden_servicio = ? LIMIT 1`, [o.codigo_orden]);
        if (ex.length) {
            await tdb.query(
                `UPDATE tesoreria_cuentas SET numero_viaje = ?, fecha_servicio = ?, placa_camion = ?, placa_carreta = ?, conductor = COALESCE(NULLIF(?, ''), conductor), cliente = ?, lugar = ?,
                        flete = ?, tarifa = ?, base_imponible = ?, igv = ?, total = ?, detraccion = ?, neto_cobrar = ?, estado_servicio = 'PENDIENTE' WHERE id = ?`,
                [v.viaje, fechaServicio, v.placa_tracto || '', v.placa_remolque || '', v.conductor || '', o.cliente_nombre || 'CLIENTE GENERAL', lugar, bi, bi, bi, igv, total, detr, neto, ex[0].id]);
        } else {
            await tdb.query(
                `INSERT INTO tesoreria_cuentas (orden_servicio, numero_viaje, fecha_servicio, razon_social, placa_camion, placa_carreta, conductor, cliente, lugar,
                        flete, comision_porcentaje, tarifa, gastos_operativos, base_imponible, igv, total, adelanto, detraccion, neto_cobrar, estado_servicio)
                 VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, 0.00, ?, 0.00, ?, ?, ?, 0.00, ?, ?, 'PENDIENTE')`,
                [o.codigo_orden, v.viaje, fechaServicio, v.placa_tracto || '', v.placa_remolque || '', v.conductor || '', o.cliente_nombre || 'CLIENTE GENERAL', lugar, bi, bi, bi, igv, total, detr, neto]);
        }
    }

    router.put('/ordenes-servicio/:id/estado', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });
            const nuevo = String((req.body || {}).estado_servicio || '').trim().toUpperCase();
            const fechaInicio = osFecha((req.body || {}).fecha_inicio);
            const [prev] = await tdb.query(`SELECT * FROM operaciones_ordenes_servicio WHERE id = ?`, [req.params.id]);
            if (!prev.length) return res.status(404).json({ ok: false, error: 'Orden de servicio no encontrada' });
            const o = prev[0];
            const actual = String(o.estado_servicio || 'PENDIENTE').toUpperCase();
            const permitido = { PENDIENTE: ['ANULADO'], PROGRAMADO: ['EN_EJECUCION', 'ANULADO'], EN_EJECUCION: ['ENTREGADO', 'ANULADO'], ENTREGADO: [], ANULADO: [] };
            if (!(permitido[actual] || []).includes(nuevo)) return res.status(409).json({ ok: false, error: `No se puede pasar de ${actual} a ${nuevo}.` });

            const [vinc] = await tdb.query(
                `SELECT ov.viaje, ov.estado, ov.conductor, ov.placa_tracto, ov.placa_remolque, ov.ejecucion, ov.tercero_nombre FROM operaciones_ordenes_viaje_rutas r
                 JOIN operaciones_ordenes_viaje ov ON ov.viaje COLLATE utf8mb4_unicode_ci = r.viaje COLLATE utf8mb4_unicode_ci WHERE r.orden = ? ORDER BY r.id LIMIT 1`, [o.codigo_orden]);
            const viaje = vinc[0] || null;

            if (nuevo === 'EN_EJECUCION') {
                if (!viaje) return res.status(409).json({ ok: false, error: 'Asigna un viaje antes de iniciar el servicio.' });
                if (viaje.ejecucion === 'TERCERO' ? !viaje.tercero_nombre : (!viaje.conductor || !viaje.placa_tracto)) return res.status(409).json({ ok: false, error: viaje.ejecucion === 'TERCERO' ? `El viaje ${viaje.viaje} aún no tiene transportista tercero.` : `El viaje ${viaje.viaje} aún no tiene conductor y tracto.` });
                const fecha = fechaInicio || new Date().toISOString().slice(0, 10);
                await tdb.query(`UPDATE operaciones_ordenes_servicio SET estado_servicio = 'EN_EJECUCION' WHERE id = ?`, [o.id]);
                if (!['INICIADO', 'FINALIZADO'].includes(String(viaje.estado).toUpperCase())) {
                    await tdb.query(`UPDATE operaciones_ordenes_viaje SET estado = 'INICIADO', fecha_inicio = COALESCE(fecha_inicio, ?) WHERE viaje = ?`, [`${fecha} 00:00:00`, viaje.viaje]);
                }
                try { await sincronizarCuentaPorCobrar(tdb, o, viaje, fecha); }
                catch (e) { console.warn('[Operaciones -> Tesorería] No se pudo crear la cuenta por cobrar:', e.message); }
            } else if (nuevo === 'ENTREGADO') {
                await tdb.query(`UPDATE operaciones_ordenes_servicio SET estado_servicio = 'ENTREGADO', fecha_entrega = COALESCE(fecha_entrega, CURDATE()) WHERE id = ?`, [o.id]);
            } else if (nuevo === 'ANULADO') {
                await tdb.query(`UPDATE operaciones_ordenes_servicio SET estado_servicio = 'ANULADO' WHERE id = ?`, [o.id]);
                await tdb.query(`DELETE FROM operaciones_ordenes_viaje_rutas WHERE orden = ?`, [o.codigo_orden]);
                try { await tdb.query(`UPDATE tesoreria_cuentas SET estado_servicio = 'ANULADO' WHERE orden_servicio = ?`, [o.codigo_orden]); } catch (e) { /* sin cuenta por cobrar */ }
            }
            if (logAudit) logAudit({ req, accion: 'ESTADO_ORDEN_SERVICIO', modulo: 'OPERACIONES', detalle: `Servicio ${o.codigo_orden}: ${actual} → ${nuevo}` });
            res.json({ ok: true, message: `Estado actualizado a ${nuevo}.` });
        } catch (err) {
            console.error('Error al cambiar estado de orden de servicio:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ════════════════════════════════════════════════════════════════
    // 🚚 PORTAL MÓVIL DEL CONDUCTOR — VIAJE ACTIVO Y LIQUIDACIONES
    // ════════════════════════════════════════════════════════════════
    router.get('/conductor-portal/viaje-activo', async (req, res) => {
        try {
            const tdb = getDb(req);
            const qDni = (req.query.dni || '').trim();
            const qNombre = (req.query.nombre || '').trim();

            let conductorNombre = qNombre;
            let conductorDni = qDni;

            // Si se envió DNI, buscar el nombre completo en la tabla conductores
            if (qDni) {
                const [cRows] = await tdb.query(
                    'SELECT idConductor, nombre, dni, licencia, telefono FROM conductores WHERE TRIM(dni) = ? LIMIT 1',
                    [qDni]
                );
                if (cRows && cRows.length > 0) {
                    conductorNombre = cRows[0].nombre;
                    conductorDni = cRows[0].dni;
                }
            } else if (qNombre) {
                const [cRows] = await tdb.query(
                    'SELECT idConductor, nombre, dni, licencia, telefono FROM conductores WHERE UPPER(TRIM(nombre)) LIKE UPPER(?) LIMIT 1',
                    [`%${qNombre}%`]
                );
                if (cRows && cRows.length > 0) {
                    conductorNombre = cRows[0].nombre;
                    conductorDni = cRows[0].dni;
                }
            }

            // Buscar viaje activo o más reciente para este conductor
            let viaje = null;
            if (conductorNombre) {
                const [vRows] = await tdb.query(`
                    SELECT ov.*, 
                           DATE_FORMAT(ov.fecha_viaje, '%Y-%m-%d') AS fecha_formateada,
                           DATE_FORMAT(ov.fecha_inicio, '%Y-%m-%d %H:%i') AS inicio_formateado
                    FROM operaciones_ordenes_viaje ov
                    WHERE UPPER(TRIM(ov.conductor)) LIKE UPPER(?)
                    ORDER BY 
                        CASE WHEN UPPER(ov.estado) = 'ACTIVO' THEN 1 
                             WHEN UPPER(ov.estado) = 'INICIADO' THEN 2 
                             ELSE 3 END ASC,
                        ov.fecha_viaje DESC, ov.id DESC
                    LIMIT 1
                `, [`%${conductorNombre}%`]);

                if (vRows && vRows.length > 0) {
                    viaje = vRows[0];
                }
            }

            // Si aún no encontró por nombre y había DNI, intentar buscar por id_conductor o en observaciones
            if (!viaje && conductorDni) {
                const [vRows] = await tdb.query(`
                    SELECT ov.*, 
                           DATE_FORMAT(ov.fecha_viaje, '%Y-%m-%d') AS fecha_formateada,
                           DATE_FORMAT(ov.fecha_inicio, '%Y-%m-%d %H:%i') AS inicio_formateado
                    FROM operaciones_ordenes_viaje ov
                    WHERE ov.conductor LIKE ? OR ov.observaciones LIKE ?
                    ORDER BY ov.fecha_viaje DESC, ov.id DESC
                    LIMIT 1
                `, [`%${conductorDni}%`, `%${conductorDni}%`]);
                if (vRows && vRows.length > 0) viaje = vRows[0];
            }

            // Si no tiene viaje activo
            if (!viaje) {
                return res.json({
                    ok: true,
                    conductor: { nombre: conductorNombre || 'Conductor', dni: conductorDni || '' },
                    viaje: null,
                    message: 'No se encontró un viaje asignado para este conductor.'
                });
            }

            // Obtener depósitos/cajas de Tesorería asignados a este viaje
            let cajas = [];
            try {
                const [cRows] = await tdb.query(`
                    SELECT id, serie, numero, motivo, sub_motivo, importe_total, tipo_movimiento,
                           DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, estado, voucher_url
                    FROM tesoreria_caja
                    WHERE UPPER(TRIM(orden_viaje)) = UPPER(?) AND UPPER(estado) != 'ANULADO'
                    ORDER BY fecha ASC, id ASC
                `, [viaje.viaje]);
                cajas = cRows || [];
            } catch (errCaja) {
                cajas = [];
            }

            let totalDepositado = 0;
            let totalDevoluciones = 0;
            cajas.forEach(c => {
                const imp = parseFloat(c.importe_total || 0);
                if (c.tipo_movimiento === 'INGRESO') totalDevoluciones += imp;
                else totalDepositado += imp;
            });

            // Obtener gastos rendidos por el conductor con fecha y hora legibles
            let gastos = [];
            try {
                const [gRows] = await tdb.query(`
                    SELECT id, 
                           DATE_FORMAT(IFNULL(creado_en, fecha), '%d/%m/%Y %H:%i') AS fecha_formateada,
                           fecha, tipo_gasto, sub_motivo, tipo_comprobante, serie, numero,
                           proveedor_nombre, detalle, importe, sustento_url, estado, uuid_cliente
                    FROM tesoreria_liquidaciones_gastos
                    WHERE UPPER(TRIM(orden_viaje)) = UPPER(?)
                    ORDER BY IFNULL(creado_en, fecha) DESC, id DESC
                `, [viaje.viaje]);
                gastos = gRows || [];
            } catch (errGastos) {
                gastos = [];
            }

            let totalGastado = 0;
            for (let g of gastos) {
                if (g.estado !== 'RECHAZADO') totalGastado += parseFloat(g.importe || 0);
                if (g.sustento_url && (g.sustento_url.includes('amazonaws.com') || g.sustento_url.startsWith('http'))) {
                    try {
                        const key = s3KeyFromUrl(g.sustento_url);
                        if (key) {
                            g.sustento_url = await getPresignedUrl(key, 7200);
                        }
                    } catch (e) {
                        console.warn('Error al firmar sustento_url de gasto:', e.message);
                    }
                }
            }

            const netoAsignado = totalDepositado - totalDevoluciones;
            const saldo = netoAsignado - totalGastado;

            res.json({
                ok: true,
                conductor: {
                    nombre: conductorNombre || viaje.conductor,
                    dni: conductorDni
                },
                viaje: {
                    id: viaje.id,
                    codigo: viaje.viaje,
                    placa_tracto: viaje.placa_tracto,
                    placa_remolque: viaje.placa_remolque || '---',
                    origen: viaje.origen || 'BASE',
                    destino: viaje.destino || 'DESTINO',
                    ruta: viaje.ruta || `${viaje.origen || 'BASE'} - ${viaje.destino || 'DESTINO'}`,
                    estado: viaje.estado,
                    fecha: viaje.fecha_formateada
                },
                balance: {
                    total_asignado: netoAsignado,
                    total_rendido: totalGastado,
                    saldo_restante: saldo
                },
                depositos: cajas || [],
                gastos: gastos || []
            });
        } catch (err) {
            console.error('Error en portal de conductor:', err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    return router;
};
