const express = require('express');
const mysql = require('mysql2/promise');

module.exports = function (db, broadcast, logAudit) {
    const router = express.Router();

    function getDb(req) {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    }

    // Configuración de conexión al host remoto de combustible
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

    const TABLE_SQL = `CREATE TABLE IF NOT EXISTS combustible_vales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        id_remoto INT NULL,
        fecha DATETIME NOT NULL,
        estado VARCHAR(30) NOT NULL DEFAULT 'VÁLIDO',
        correlativo VARCHAR(50) NOT NULL DEFAULT '',
        estado_pago VARCHAR(30) NOT NULL DEFAULT 'NO PAGADO',
        viaje VARCHAR(50) NOT NULL DEFAULT '',
        caja VARCHAR(50) NOT NULL DEFAULT '',
        estado_caja VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
        clase_vehiculo VARCHAR(50) NOT NULL DEFAULT 'TRACTO',
        vehiculo VARCHAR(20) NOT NULL DEFAULT '',
        vehiculo_marca VARCHAR(100) NULL,
        vehiculo_modelo VARCHAR(100) NULL,
        conductor VARCHAR(150) NOT NULL DEFAULT '',
        ruta VARCHAR(255) NOT NULL DEFAULT '',
        departamento VARCHAR(80) NOT NULL DEFAULT '',
        provincia VARCHAR(80) NOT NULL DEFAULT '',
        distrito VARCHAR(80) NOT NULL DEFAULT '',
        estacion VARCHAR(150) NOT NULL DEFAULT '',
        tipo_combustible VARCHAR(50) NOT NULL DEFAULT 'D2',
        proveedor VARCHAR(200) NOT NULL DEFAULT '',
        ruc VARCHAR(20) NOT NULL DEFAULT '',
        kilometraje DECIMAL(12,2) NOT NULL DEFAULT 0,
        peso_tn DECIMAL(10,2) NOT NULL DEFAULT 0,
        galones DECIMAL(10,2) NOT NULL DEFAULT 0,
        costo_gl DECIMAL(10,2) NOT NULL DEFAULT 0,
        tipo_pago VARCHAR(50) NOT NULL DEFAULT 'ANTICIPO',
        dias_credito INT NOT NULL DEFAULT 0,
        moneda VARCHAR(20) NOT NULL DEFAULT 'SOLES',
        importe DECIMAL(12,2) NOT NULL DEFAULT 0,
        numero_comprobante VARCHAR(50) NOT NULL DEFAULT '',
        tipo_cambio DECIMAL(8,4) NULL,
        archivo_url VARCHAR(255) NULL,
        observacion TEXT NULL,
        tipo VARCHAR(80) NOT NULL DEFAULT 'RECARGA VUELTA',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_vehiculo (vehiculo),
        INDEX idx_viaje (viaje),
        INDEX idx_fecha (fecha),
        INDEX idx_correlativo (correlativo),
        INDEX idx_id_remoto (id_remoto),
        INDEX idx_estado (estado)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

    const TABLE_MATRIZ_SQL = `CREATE TABLE IF NOT EXISTS combustible_matriz_d2 (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sentido VARCHAR(20) NOT NULL DEFAULT 'IDA',
        ruta VARCHAR(150) NOT NULL,
        motor VARCHAR(50) NOT NULL DEFAULT 'MC11.44',
        confg VARCHAR(20) NOT NULL DEFAULT 'T3',
        km_0 DECIMAL(10,2) NOT NULL DEFAULT 0,
        km_5 DECIMAL(10,2) NOT NULL DEFAULT 0,
        km_10 DECIMAL(10,2) NOT NULL DEFAULT 0,
        km_15 DECIMAL(10,2) NOT NULL DEFAULT 0,
        km_20 DECIMAL(10,2) NOT NULL DEFAULT 0,
        km_25 DECIMAL(10,2) NOT NULL DEFAULT 0,
        km_30 DECIMAL(10,2) NOT NULL DEFAULT 0,
        km DECIMAL(10,2) NOT NULL DEFAULT 0,
        estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ruta (ruta),
        INDEX idx_motor_confg (motor, confg)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

    async function ensureTables(req) {
        const tenantId = (req && req.tenantId) ? req.tenantId : 'default';
        if (_tenantsInitSet.has(tenantId)) return;
        try {
            const tdb = getDb(req);
            if (!tdb) return;
            await tdb.query(TABLE_SQL);
            await tdb.query(TABLE_MATRIZ_SQL);
            
            // Migrar columnas adicionales si la tabla ya existía
            const migCols = [
                "ALTER TABLE combustible_vales ADD COLUMN id_remoto INT NULL",
                "ALTER TABLE combustible_vales ADD COLUMN vehiculo_marca VARCHAR(100) NULL",
                "ALTER TABLE combustible_vales ADD COLUMN vehiculo_modelo VARCHAR(100) NULL"
            ];
            for (const q of migCols) {
                try { await tdb.query(q); } catch(e) {}
            }

            try { await tdb.query("DROP TABLE IF EXISTS combustible_abastecimientos"); } catch(e) {}
            _tenantsInitSet.add(tenantId);
        } catch (err) {
            console.error(`⚠️ Error inicializando tabla combustible_vales en tenant [${tenantId}]:`, err.message);
        }
    }

    router.use(async (req, res, next) => {
        await ensureTables(req);
        next();
    });

    function safeSqlDate(val, serie) {
        const defaultYear = (serie && /^\d{4}$/.test(serie)) ? serie : '2025';
        if (!val) return `${defaultYear}-01-01 00:00:00`;
        try {
            let dt = (val instanceof Date) ? new Date(val.getTime()) : new Date(val);
            if (!isNaN(dt.getTime())) {
                const currentYear = new Date().getFullYear();
                if (dt.getFullYear() > currentYear && serie && /^\d{4}$/.test(serie)) {
                    dt.setFullYear(parseInt(serie, 10));
                }
                return dt.toISOString().slice(0, 19).replace('T', ' ');
            }
        } catch(e) {}
        return `${defaultYear}-01-01 00:00:00`;
    }

    // ============================================================
    // 1. 🔄 SINCRONIZACIÓN DIRECTA DESDE LA BASE DE DATOS EXTERNA (168.231.98.23)
    // ============================================================
    router.post('/sincronizar-remoto', async (req, res) => {
        try {
            const tenantId = req.tenantSlug || req.headers['x-tenant-id'] || 'default';
            const host = (req.headers.host || '').toLowerCase();
            const isMarsisa = tenantId.toLowerCase().includes('marsisa') || host.includes('marsisa') || tenantId === 'master';

            if (!isMarsisa) {
                return res.status(400).json({
                    ok: false,
                    error: 'La sincronización remota con MarsisaSoft solo está habilitada para la empresa Marsisa (marsisa.azkell.com).'
                });
            }

            const tdb = getDb(req);
            const rdb = getRemoteDb();
            const body = req.body || {};
            const query = req.query || {};
            const reimportAll = query.reset === 'true' || body.reset === true || query.forzar === 'true' || body.forzar === true;

            console.log('🔄 Iniciando sincronización remota de combustible desde 168.231.98.23 para Marsisa...');

            if (reimportAll) {
                await tdb.query("DELETE FROM combustible_vales");
            }

            // Consultar catálogo de estaciones para mapear RUC de proveedores
            const [estacionesRows] = await rdb.query(
                "SELECT DISTINCT proveedor_razon_social, proveedor_ruc FROM vw_combustible_estacion WHERE proveedor_ruc IS NOT NULL AND proveedor_ruc != ''"
            );
            const rucMap = new Map();
            estacionesRows.forEach(e => {
                if (e.proveedor_razon_social && e.proveedor_ruc) {
                    rucMap.set(String(e.proveedor_razon_social).trim().toUpperCase(), String(e.proveedor_ruc).trim());
                }
            });

            // Consultar catálogo de placas para obtener la clase real del vehículo (TRACTO, SEMIREMOLQUE, CAMION, etc.)
            const [placasRows] = await tdb.query("SELECT placa, tipo, sub_tipo FROM placas");
            const placaClaseMap = new Map();
            placasRows.forEach(p => {
                if (p.placa) {
                    const claseVal = (p.tipo || p.sub_tipo || 'TRACTO').toUpperCase().trim();
                    placaClaseMap.set(p.placa.trim().toUpperCase(), claseVal);
                }
            });

            // Consultar correlativos e IDs existentes para no duplicar (a menos que se fuerce reimportAll)
            const [existentesRows] = reimportAll ? [[]] : await tdb.query("SELECT DISTINCT id_remoto, correlativo FROM combustible_vales WHERE correlativo != '' OR id_remoto IS NOT NULL");
            const existentesCorrelativos = new Set(existentesRows.map(r => r.correlativo).filter(Boolean));
            const existentesRemotoIds = new Set(existentesRows.map(r => r.id_remoto).filter(Boolean));

            // Consultar los vales de la vista remota
            const [remotoVales] = await rdb.query(
                `SELECT * FROM vw_combustible_vale ORDER BY fecha DESC LIMIT 10000`
            );

            if (!remotoVales || remotoVales.length === 0) {
                return res.json({ ok: true, sincronizados: 0, totalRemotos: 0, mensaje: 'No hay registros en el servidor remoto.' });
            }

            // Filtrar solo los vales que no estén ya registrados por ID remoto o correlativo
            const nuevosVales = reimportAll ? remotoVales : remotoVales.filter(v => {
                const corr = v.serie ? `${v.serie}-${v.numero}` : (v.numero || '');
                const idRemoto = v.id;
                if (idRemoto && existentesRemotoIds.has(idRemoto)) return false;
                if (corr && existentesCorrelativos.has(corr)) return false;
                return true;
            });

            if (nuevosVales.length === 0) {
                return res.json({
                    ok: true,
                    totalRemotos: remotoVales.length,
                    sincronizados: 0,
                    mensaje: 'Todos los vales de MarsisaSoft ya se encuentran sincronizados en el ERP.'
                });
            }

            let sincronizados = 0;
            const batchSize = 100;

            for (let i = 0; i < nuevosVales.length; i += batchSize) {
                const chunk = nuevosVales.slice(i, i + batchSize);
                const values = [];

                chunk.forEach(v => {
                    const id_remoto = v.id || null;
                    const fecha = safeSqlDate(v.fecha, v.serie);
                    const anio = fecha.slice(0, 4);
                    const estado = (v.fl_estado === 1 || v.fl_estado === '1') ? 'VÁLIDO' : 'ANULADO';
                    const correlativo = v.serie ? `${v.serie}-${v.numero}` : (v.numero || '');
                    const estado_pago = (v.tipo_pago || '').toUpperCase().includes('CRED') ? 'NO EXISTE PAGO' : 'PAGADO';
                    const rawViaje = String(v.viaje_numero || '').trim();
                    const viajeSerie = (v.serie && /^\d{4}$/.test(v.serie)) ? v.serie : anio;
                    const viaje = rawViaje ? (rawViaje.includes('-') ? rawViaje : `${viajeSerie}-${rawViaje}`) : '';
                    const caja = v.serie_caja ? `${v.serie_caja}-${v.numero_caja}` : (v.numero_caja || '');
                    const estado_caja = 'PROCESADO';
                    const vehiculo = String(v.placa || 'SIN-PLACA').toUpperCase().trim();
                    const clase_vehiculo = placaClaseMap.get(vehiculo) || 'TRACTO';
                    const vehiculo_marca = String(v.vehiculo_marca || '').trim();
                    const vehiculo_modelo = String(v.vehiculo_modelo || '').trim();
                    const conductor = String(v.conductor_nombre || '').trim();
                    const departamento = String(v.departamento || '').trim();
                    const provincia = String(v.provincia || '').trim();
                    const distrito = String(v.distrito || '').trim();
                    const ruta = String(v.viaje_rutas || v.localidad || '').trim();
                    const estacion = String(v.estacion || '').trim();
                    const tipo_combustible = String(v.tipo_combustible || 'D2').trim();
                    const proveedor = String(v.proveedor_razon_social || '').trim();
                    const ruc = rucMap.get(proveedor.toUpperCase()) || '';
                    const kilometraje = parseFloat(v.kilometraje || 0);
                    const rawPeso = parseFloat(v.peso || 0);
                    const peso_tn = rawPeso > 50 ? parseFloat((rawPeso / 1000).toFixed(2)) : parseFloat(rawPeso.toFixed(2));
                    const galones = parseFloat(v.galones || 0);
                    const costo_gl = parseFloat(v.costo_galon || 0);
                    const tipo_pago = String(v.tipo_pago || 'CONTADO').toUpperCase().trim();
                    const dias_credito = 0;
                    const moneda = (v.moneda_codigo || v.moneda_simbolo || 'SOLES').toUpperCase().trim();
                    const importe = parseFloat(v.importe || (galones * costo_gl));
                    const numero_comprobante = String(v.numero_comprobante || v.numero_ticket || '').trim();
                    const tipo_cambio = null;
                    const archivo_url = null;
                    const observacion = null;
                    const tipo = String(v.tipo || 'RECARGA VUELTA').toUpperCase().trim();

                    values.push([
                        id_remoto, fecha, estado, correlativo, estado_pago, viaje, caja, estado_caja, clase_vehiculo,
                        vehiculo, vehiculo_marca, vehiculo_modelo, conductor, ruta, departamento, provincia, distrito, estacion, tipo_combustible,
                        proveedor, ruc, kilometraje, peso_tn, galones, costo_gl, tipo_pago, dias_credito,
                        moneda, importe, numero_comprobante, tipo_cambio, archivo_url, observacion, tipo
                    ]);
                });

                if (values.length > 0) {
                    await tdb.query(
                        `INSERT INTO combustible_vales (
                            id_remoto, fecha, estado, correlativo, estado_pago, viaje, caja, estado_caja, clase_vehiculo,
                            vehiculo, vehiculo_marca, vehiculo_modelo, conductor, ruta, departamento, provincia, distrito, estacion, tipo_combustible,
                            proveedor, ruc, kilometraje, peso_tn, galones, costo_gl, tipo_pago, dias_credito,
                            moneda, importe, numero_comprobante, tipo_cambio, archivo_url, observacion, tipo
                        ) VALUES ?`,
                        [values]
                    );
                    sincronizados += values.length;
                }
            }

            if (logAudit) logAudit(req, 'COMBUSTIBLE', 'SINCRONIZACION_REMOTA', `Sincronizados ${sincronizados} nuevos vales desde MarsisaSoft`);
            if (broadcast) broadcast({ type: 'COMBUSTIBLE_VALES_SINCRONIZADOS', cantidad: sincronizados });

            res.json({
                ok: true,
                totalRemotos: remotoVales.length,
                sincronizados,
                mensaje: `Se sincronizaron exitosamente ${sincronizados} nuevos vales desde MarsisaSoft.`
            });
        } catch (err) {
            console.error("❌ Error en sincronización remota de combustible:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 2. 📊 MATRIZ DE COMBUSTIBLE D2 (LOCAL MYSQL: combustible_matriz_d2)
    // ============================================================

    // Listar registros de la matriz de combustible
    router.get('/matriz', async (req, res) => {
        try {
            const tdb = getDb(req);
            const { q, sentido, motor, confg } = req.query;

            let sql = `SELECT * FROM combustible_matriz_d2 WHERE estado = 'ACTIVO'`;
            const params = [];

            if (sentido && sentido !== 'ALL') {
                sql += ` AND sentido = ?`;
                params.push(sentido);
            }
            if (motor && motor !== 'ALL') {
                sql += ` AND motor = ?`;
                params.push(motor);
            }
            if (confg && confg !== 'ALL') {
                sql += ` AND confg = ?`;
                params.push(confg);
            }
            if (q && String(q).trim()) {
                sql += ` AND (ruta LIKE ? OR motor LIKE ? OR confg LIKE ?)`;
                const term = `%${String(q).trim()}%`;
                params.push(term, term, term);
            }

            sql += ` ORDER BY sentido ASC, ruta ASC`;

            const [rows] = await tdb.query(sql, params);
            res.json({ ok: true, data: rows || [] });
        } catch (err) {
            console.error("Error al listar matriz de combustible:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Guardar una nueva ruta en la matriz
    router.post('/matriz', async (req, res) => {
        try {
            const tdb = getDb(req);
            const b = req.body;
            if (!b.ruta || !String(b.ruta).trim()) {
                return res.status(400).json({ ok: false, error: 'El nombre de la ruta es obligatorio.' });
            }

            const [result] = await tdb.query(
                `INSERT INTO combustible_matriz_d2 
                (sentido, ruta, motor, confg, km_0, km_5, km_10, km_15, km_20, km_25, km_30, km)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    b.sentido || 'IDA',
                    String(b.ruta).trim().toUpperCase(),
                    b.motor || 'MC11.44',
                    b.confg || 'T3',
                    parseFloat(b.km_0 || 0),
                    parseFloat(b.km_5 || 0),
                    parseFloat(b.km_10 || 0),
                    parseFloat(b.km_15 || 0),
                    parseFloat(b.km_20 || 0),
                    parseFloat(b.km_25 || 0),
                    parseFloat(b.km_30 || 0),
                    parseFloat(b.km || 0)
                ]
            );

            if (logAudit) logAudit(req, 'COMBUSTIBLE', 'CREAR_MATRIZ_RUTA', `Creada ruta ${b.ruta} en matriz D2`);
            res.json({ ok: true, id: result.insertId, message: 'Ruta agregada a la matriz exitosamente.' });
        } catch (err) {
            console.error("Error al guardar ruta en matriz:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Actualizar una ruta existente en la matriz
    router.put('/matriz/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const id = parseInt(req.params.id, 10);
            const b = req.body;

            await tdb.query(
                `UPDATE combustible_matriz_d2 SET
                    sentido = ?, ruta = ?, motor = ?, confg = ?,
                    km_0 = ?, km_5 = ?, km_10 = ?, km_15 = ?, km_20 = ?, km_25 = ?, km_30 = ?, km = ?
                WHERE id = ?`,
                [
                    b.sentido || 'IDA',
                    String(b.ruta).trim().toUpperCase(),
                    b.motor || 'MC11.44',
                    b.confg || 'T3',
                    parseFloat(b.km_0 || 0),
                    parseFloat(b.km_5 || 0),
                    parseFloat(b.km_10 || 0),
                    parseFloat(b.km_15 || 0),
                    parseFloat(b.km_20 || 0),
                    parseFloat(b.km_25 || 0),
                    parseFloat(b.km_30 || 0),
                    parseFloat(b.km || 0),
                    id
                ]
            );

            if (logAudit) logAudit(req, 'COMBUSTIBLE', 'ACTUALIZAR_MATRIZ_RUTA', `Actualizada ruta ID ${id} en matriz D2`);
            res.json({ ok: true, message: 'Ruta actualizada exitosamente.' });
        } catch (err) {
            console.error("Error al actualizar ruta en matriz:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Eliminar una ruta de la matriz (Soft delete)
    router.delete('/matriz/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const id = parseInt(req.params.id, 10);

            await tdb.query(`UPDATE combustible_matriz_d2 SET estado = 'INACTIVO' WHERE id = ?`, [id]);
            if (logAudit) logAudit(req, 'COMBUSTIBLE', 'ELIMINAR_MATRIZ_RUTA', `Eliminada ruta ID ${id} de la matriz D2`);
            res.json({ ok: true, message: 'Ruta eliminada de la matriz.' });
        } catch (err) {
            console.error("Error al eliminar ruta en matriz:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Importación masiva desde Excel
    router.post('/matriz/importar', async (req, res) => {
        try {
            const tdb = getDb(req);
            const items = req.body && Array.isArray(req.body.items) ? req.body.items : (Array.isArray(req.body) ? req.body : []);

            if (!items.length) {
                return res.status(400).json({ ok: false, error: 'No se enviaron filas para importar.' });
            }

            let insertados = 0;
            for (const it of items) {
                const ruta = String(it.ruta || it.RUTA || '').trim().toUpperCase();
                if (!ruta) continue;

                const sentido = String(it.sentido || it.SENTIDO || 'IDA').trim().toUpperCase();
                const motor = String(it.motor || it.MOTOR || 'MC11.44').trim().toUpperCase();
                const confg = String(it.confg || it.CONFG || it.configuracion || 'T3').trim().toUpperCase();

                const parseNum = (val) => {
                    if (val === null || val === undefined) return 0;
                    if (typeof val === 'number') return isNaN(val) ? 0 : val;
                    const clean = String(val).replace(/[^0-9.,-]/g, '').replace(',', '.');
                    const n = parseFloat(clean);
                    return isNaN(n) ? 0 : n;
                };

                const km_0 = parseNum(it['0'] !== undefined ? it['0'] : it.km_0);
                const km_5 = parseNum(it['5'] !== undefined ? it['5'] : it.km_5);
                const km_10 = parseNum(it['10'] !== undefined ? it['10'] : it.km_10);
                const km_15 = parseNum(it['15'] !== undefined ? it['15'] : it.km_15);
                const km_20 = parseNum(it['20'] !== undefined ? it['20'] : it.km_20);
                const km_25 = parseNum(it['25'] !== undefined ? it['25'] : it.km_25);
                const km_30 = parseNum(it['30'] !== undefined ? it['30'] : it.km_30);
                const km = parseNum(it.KM !== undefined ? it.KM : (it.km !== undefined ? it.km : it.distancia));

                await tdb.query(
                    `INSERT INTO combustible_matriz_d2 
                    (sentido, ruta, motor, confg, km_0, km_5, km_10, km_15, km_20, km_25, km_30, km)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [sentido, ruta, motor, confg, km_0, km_5, km_10, km_15, km_20, km_25, km_30, km]
                );
                insertados++;
            }

            if (logAudit) logAudit(req, 'COMBUSTIBLE', 'IMPORTAR_MATRIZ_EXCEL', `Importadas ${insertados} rutas en matriz D2`);
            res.json({ ok: true, insertados, message: `Se importaron ${insertados} registros a la Matriz de Combustible exitosamente.` });
        } catch (err) {
            console.error("Error al importar matriz:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // Endpoint de compatibilidad para análisis (consultando directamente nuestra matriz local)
    router.get('/rendimiento-teorico', async (req, res) => {
        try {
            const tdb = getDb(req);
            const [rows] = await tdb.query(
                "SELECT * FROM combustible_matriz_d2 WHERE estado = 'ACTIVO' ORDER BY sentido ASC, ruta ASC"
            );
            res.json({ ok: true, data: rows || [] });
        } catch (err) {
            console.error("Error obteniendo rendimientos de la matriz local:", err.message);
            res.json({ ok: true, data: [] });
        }
    });

    // ============================================================
    // 3. 📋 LISTADO DE VALES CON PAGINACIÓN (50 REGISTROS/PÁG) Y FILTROS
    // ============================================================
    router.get('/vales', async (req, res) => {
        try {
            const tdb = getDb(req);
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
            const offset = (page - 1) * limit;

            const { search, placa, viaje, combustible, fecha_desde, fecha_hasta, estado } = req.query;

            const whereClauses = [];
            const params = [];

            if (placa && placa !== 'ALL') {
                whereClauses.push("vehiculo = ?");
                params.push(placa.toUpperCase().trim());
            }

            if (viaje) {
                whereClauses.push("viaje LIKE ?");
                params.push(`%${viaje.trim()}%`);
            }

            if (combustible && combustible !== 'ALL') {
                whereClauses.push("tipo_combustible = ?");
                params.push(combustible.trim());
            }

            if (estado && estado !== 'ALL') {
                whereClauses.push("estado = ?");
                params.push(estado.trim());
            }

            if (fecha_desde) {
                whereClauses.push("fecha >= ?");
                params.push(`${fecha_desde} 00:00:00`);
            }

            if (fecha_hasta) {
                whereClauses.push("fecha <= ?");
                params.push(`${fecha_hasta} 23:59:59`);
            }

            if (search && search.trim()) {
                const q = `%${search.trim()}%`;
                whereClauses.push("(correlativo LIKE ? OR vehiculo LIKE ? OR viaje LIKE ? OR conductor LIKE ? OR ruta LIKE ? OR proveedor LIKE ? OR numero_comprobante LIKE ? OR estacion LIKE ?)");
                params.push(q, q, q, q, q, q, q, q);
            }

            const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            // Conteo total y métricas KPI de los resultados filtrados
            const [kpiRows] = await tdb.query(
                `SELECT 
                    COUNT(*) AS totalRegistros,
                    IFNULL(SUM(galones), 0) AS totalGalones,
                    IFNULL(SUM(importe), 0) AS totalGasto
                 FROM combustible_vales ${whereSQL}`,
                params
            );

            const totalRegistros = kpiRows[0]?.totalRegistros || 0;
            const totalGalones = parseFloat(kpiRows[0]?.totalGalones || 0);
            const totalGasto = parseFloat(kpiRows[0]?.totalGasto || 0);
            const costoPromedioGalon = totalGalones > 0 ? (totalGasto / totalGalones) : 0;
            const totalPages = Math.ceil(totalRegistros / limit) || 1;

            // Ordenamiento dinámico
            const validSortCols = {
                'fecha': 'fecha',
                'correlativo': 'correlativo',
                'estado': 'estado',
                'estado_pago': 'estado_pago',
                'viaje': 'viaje',
                'caja': 'caja',
                'estado_caja': 'estado_caja',
                'clase_vehiculo': 'clase_vehiculo',
                'vehiculo': 'vehiculo',
                'conductor': 'conductor',
                'ruta': 'ruta',
                'departamento': 'departamento',
                'provincia': 'provincia',
                'distrito': 'distrito',
                'estacion': 'estacion',
                'tipo_combustible': 'tipo_combustible',
                'proveedor': 'proveedor',
                'ruc': 'ruc',
                'kilometraje': 'kilometraje',
                'peso_tn': 'peso_tn',
                'galones': 'galones',
                'costo_gl': 'costo_gl',
                'tipo_pago': 'tipo_pago',
                'dias_credito': 'dias_credito',
                'moneda': 'moneda',
                'importe': 'importe',
                'numero_comprobante': 'numero_comprobante',
                'tipo': 'tipo'
            };

            const sortCol = validSortCols[req.query.sort_by] || 'correlativo';
            const sortDir = (req.query.sort_dir || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

            // Registros paginados con orden dinámico
            const [rows] = await tdb.query(
                `SELECT * FROM combustible_vales 
                 ${whereSQL} 
                 ORDER BY ${sortCol} ${sortDir}, id_remoto DESC 
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            res.json({
                ok: true,
                data: rows,
                total: totalRegistros,
                page,
                limit,
                totalPages,
                kpis: {
                    totalVales: totalRegistros,
                    totalGalones,
                    totalGasto,
                    costoPromedioGalon
                }
            });
        } catch (err) {
            console.error("Error obteniendo vales de combustible:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 4. ➕ REGISTRAR VALE INDIVIDUAL
    // ============================================================
    router.post('/vales', async (req, res) => {
        try {
            const tdb = getDb(req);
            const body = req.body || {};

            const fecha = body.fecha ? new Date(body.fecha).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');
            const estado = (body.estado || 'VÁLIDO').toUpperCase().trim();
            const correlativo = (body.correlativo || '').trim();
            const estado_pago = (body.estado_pago || 'NO PAGADO').toUpperCase().trim();
            const viaje = (body.viaje || '').trim();
            const caja = (body.caja || '').trim();
            const estado_caja = (body.estado_caja || 'PENDIENTE').toUpperCase().trim();
            const clase_vehiculo = (body.clase_vehiculo || 'TRACTO').toUpperCase().trim();
            const vehiculo = (body.vehiculo || body.placa || '').toUpperCase().trim();
            const conductor = (body.conductor || '').trim();
            const ruta = (body.ruta || '').trim();
            const departamento = (body.departamento || '').trim();
            const provincia = (body.provincia || '').trim();
            const distrito = (body.distrito || '').trim();
            const estacion = (body.estacion || '').trim();
            const tipo_combustible = (body.tipo_combustible || 'D2').trim();
            const proveedor = (body.proveedor || '').trim();
            const ruc = (body.ruc || '').trim();
            const kilometraje = parseFloat(body.kilometraje || body.odometro || 0);
            const peso_tn = parseFloat(body.peso_tn || 0);
            const galones = parseFloat(body.galones || 0);
            const costo_gl = parseFloat(body.costo_gl || (galones > 0 ? (body.importe / galones) : 0));
            const tipo_pago = (body.tipo_pago || 'ANTICIPO').toUpperCase().trim();
            const dias_credito = parseInt(body.dias_credito || 0, 10);
            const moneda = (body.moneda || 'SOLES').toUpperCase().trim();
            const importe = parseFloat(body.importe || (galones * costo_gl));
            const numero_comprobante = (body.numero_comprobante || '').trim();
            const tipo_cambio = body.tipo_cambio ? parseFloat(body.tipo_cambio) : null;
            const archivo_url = body.archivo_url || null;
            const observacion = body.observacion || body.obs || null;
            const tipo = (body.tipo || 'RECARGA VUELTA').toUpperCase().trim();

            if (!vehiculo) {
                return res.status(400).json({ ok: false, error: 'El vehículo/placa es obligatorio.' });
            }

            const [result] = await tdb.query(
                `INSERT INTO combustible_vales (
                    fecha, estado, correlativo, estado_pago, viaje, caja, estado_caja, clase_vehiculo,
                    vehiculo, conductor, ruta, departamento, provincia, distrito, estacion, tipo_combustible,
                    proveedor, ruc, kilometraje, peso_tn, galones, costo_gl, tipo_pago, dias_credito,
                    moneda, importe, numero_comprobante, tipo_cambio, archivo_url, observacion, tipo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    fecha, estado, correlativo, estado_pago, viaje, caja, estado_caja, clase_vehiculo,
                    vehiculo, conductor, ruta, departamento, provincia, distrito, estacion, tipo_combustible,
                    proveedor, ruc, kilometraje, peso_tn, galones, costo_gl, tipo_pago, dias_credito,
                    moneda, importe, numero_comprobante, tipo_cambio, archivo_url, observacion, tipo
                ]
            );

            if (logAudit) logAudit(req, 'COMBUSTIBLE', 'CREAR_VALE', `Registrado vale ID ${result.insertId} para ${vehiculo}`);
            if (broadcast) broadcast({ type: 'COMBUSTIBLE_VALE_CREADO', id: result.insertId, vehiculo });

            res.json({ ok: true, id: result.insertId, mensaje: 'Vale de combustible registrado exitosamente.' });
        } catch (err) {
            console.error("Error registrando vale de combustible:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 5. 📥 IMPORTACIÓN MASIVA DE VALES (FORMATO MARSISASOFT / EXCEL)
    // ============================================================
    router.post('/vales/importar-masivo', async (req, res) => {
        try {
            const tdb = getDb(req);
            const vales = Array.isArray(req.body.vales) ? req.body.vales : [];

            if (vales.length === 0) {
                return res.status(400).json({ ok: false, error: 'No se enviaron registros para importar.' });
            }

            const parseNum = (v) => {
                if (typeof v === 'number') return v;
                if (!v) return 0;
                const clean = String(v).replace(/\s/g, '').replace(',', '.');
                const n = parseFloat(clean);
                return isNaN(n) ? 0 : n;
            };

            const parseFecha = (v) => {
                if (!v) return new Date().toISOString().slice(0, 19).replace('T', ' ');
                const str = String(v).trim();
                const parts = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
                if (parts) {
                    const d = parts[1].padStart(2, '0');
                    const m = parts[2].padStart(2, '0');
                    const y = parts[3];
                    const h = (parts[4] || '00').padStart(2, '0');
                    const min = (parts[5] || '00').padStart(2, '0');
                    const s = (parts[6] || '00').padStart(2, '0');
                    return `${y}-${m}-${d} ${h}:${min}:${s}`;
                }
                const dt = new Date(v);
                if (!isNaN(dt.getTime())) {
                    return dt.toISOString().slice(0, 19).replace('T', ' ');
                }
                return new Date().toISOString().slice(0, 19).replace('T', ' ');
            };

            let insertados = 0;
            const batchSize = 100;

            for (let i = 0; i < vales.length; i += batchSize) {
                const chunk = vales.slice(i, i + batchSize);
                const values = [];

                chunk.forEach(row => {
                    const fecha = parseFecha(row.fecha || row.FECHA);
                    const estado = (row.estado || row.ESTADO || 'VÁLIDO').toUpperCase().trim();
                    const correlativo = String(row.correlativo || row.CORRELATIVO || '').trim();
                    const estado_pago = (row.estado_pago || row['ESTADO PAGO'] || 'NO PAGADO').toUpperCase().trim();
                    const viaje = String(row.viaje || row.VIAJE || '').trim();
                    const caja = String(row.caja || row.CAJA || '').trim();
                    const estado_caja = (row.estado_caja || row['ESTADO CAJA'] || 'PENDIENTE').toUpperCase().trim();
                    const clase_vehiculo = (row.clase_vehiculo || row['CLASE VEHICULO'] || 'TRACTO').toUpperCase().trim();
                    const vehiculo = String(row.vehiculo || row.VEHICULO || row.placa || row.PLACA || 'SIN-PLACA').toUpperCase().trim();
                    const conductor = String(row.conductor || row.CONDUCTOR || '').trim();
                    const ruta = String(row.ruta || row.RUTA || '').trim();
                    const departamento = String(row.departamento || row.DEPARTAMENTO || '').trim();
                    const provincia = String(row.provincia || row.PROVINCIA || '').trim();
                    const distrito = String(row.distrito || row.DISTRITO || '').trim();
                    const estacion = String(row.estacion || row['ESTACIÓN'] || row.ESTACION || '').trim();
                    const tipo_combustible = String(row.tipo_combustible || row['TIPO COMBUSTIBLE'] || 'D2').trim();
                    const proveedor = String(row.proveedor || row.PROVEEDOR || '').trim();
                    const ruc = String(row.ruc || row.RUC || '').trim();
                    const kilometraje = parseNum(row.kilometraje || row.KILOMETRAJE || row.odometro);
                    const peso_tn = parseNum(row.peso_tn || row['PESO (Tn)'] || row.PESO);
                    const galones = parseNum(row.galones || row.GALONES);
                    const costo_gl = parseNum(row.costo_gl || row['COSTO/GL'] || row.PRECIO);
                    const tipo_pago = (row.tipo_pago || row['TIPO PAGO'] || 'ANTICIPO').toUpperCase().trim();
                    const dias_credito = parseInt(row.dias_credito || row['DÍAS CRÉDITO'] || row.DIAS_CREDITO || 0, 10);
                    const moneda = (row.moneda || row.MONEDA || 'SOLES').toUpperCase().trim();
                    const importe = parseNum(row.importe || row.IMPORTE || (galones * costo_gl));
                    const numero_comprobante = String(row.numero_comprobante || row['NÚMERO COMPROBANTE'] || row.COMPROBANTE || '').trim();
                    const tipo_cambio = row.tipo_cambio ? parseNum(row.tipo_cambio || row['TIPO CAMBIO']) : null;
                    const archivo_url = row.archivo || row.ARCHIVO || null;
                    const observacion = row.observacion || row['OBSERVACIÓN'] || row.OBSERVACION || null;
                    const tipo = (row.tipo || row.TIPO || 'RECARGA VUELTA').toUpperCase().trim();

                    values.push([
                        fecha, estado, correlativo, estado_pago, viaje, caja, estado_caja, clase_vehiculo,
                        vehiculo, conductor, ruta, departamento, provincia, distrito, estacion, tipo_combustible,
                        proveedor, ruc, kilometraje, peso_tn, galones, costo_gl, tipo_pago, dias_credito,
                        moneda, importe, numero_comprobante, tipo_cambio, archivo_url, observacion, tipo
                    ]);
                });

                if (values.length > 0) {
                    await tdb.query(
                        `INSERT INTO combustible_vales (
                            fecha, estado, correlativo, estado_pago, viaje, caja, estado_caja, clase_vehiculo,
                            vehiculo, conductor, ruta, departamento, provincia, distrito, estacion, tipo_combustible,
                            proveedor, ruc, kilometraje, peso_tn, galones, costo_gl, tipo_pago, dias_credito,
                            moneda, importe, numero_comprobante, tipo_cambio, archivo_url, observacion, tipo
                        ) VALUES ?`,
                        [values]
                    );
                    insertados += values.length;
                }
            }

            if (logAudit) logAudit(req, 'COMBUSTIBLE', 'IMPORTAR_MASIVO', `Importados ${insertados} vales masivamente`);
            if (broadcast) broadcast({ type: 'COMBUSTIBLE_VALES_IMPORTADOS', cantidad: insertados });

            res.json({
                ok: true,
                insertados,
                mensaje: `Se importaron ${insertados} vales de combustible exitosamente.`
            });
        } catch (err) {
            console.error("Error en importación masiva de vales:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 6. ✏️ ACTUALIZAR VALE
    // ============================================================
    router.put('/vales/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const id = req.params.id;
            const body = req.body || {};

            const fields = [
                'fecha', 'estado', 'correlativo', 'estado_pago', 'viaje', 'caja', 'estado_caja', 'clase_vehiculo',
                'vehiculo', 'conductor', 'ruta', 'departamento', 'provincia', 'distrito', 'estacion', 'tipo_combustible',
                'proveedor', 'ruc', 'kilometraje', 'peso_tn', 'galones', 'costo_gl', 'tipo_pago', 'dias_credito',
                'moneda', 'importe', 'numero_comprobante', 'tipo_cambio', 'archivo_url', 'observacion', 'tipo'
            ];

            const updates = [];
            const values = [];

            fields.forEach(f => {
                if (body[f] !== undefined) {
                    updates.push(`${f} = ?`);
                    values.push(body[f]);
                }
            });

            if (updates.length === 0) {
                return res.status(400).json({ ok: false, error: 'No se enviaron campos para actualizar.' });
            }

            values.push(id);
            await tdb.query(`UPDATE combustible_vales SET ${updates.join(', ')} WHERE id = ?`, values);

            if (logAudit) logAudit(req, 'COMBUSTIBLE', 'EDITAR_VALE', `Actualizado vale ID ${id}`);

            res.json({ ok: true, mensaje: 'Vale de combustible actualizado exitosamente.' });
        } catch (err) {
            console.error("Error actualizando vale de combustible:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 7. 🗑️ ELIMINAR O ANULAR VALE INDIVIDUAL
    // ============================================================
    router.delete('/vales/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const id = req.params.id;
            const hardDelete = req.query.hard === 'true';

            if (hardDelete) {
                await tdb.query("DELETE FROM combustible_vales WHERE id = ?", [id]);
            } else {
                await tdb.query("UPDATE combustible_vales SET estado = 'ANULADO' WHERE id = ?", [id]);
            }

            if (logAudit) logAudit(req, 'COMBUSTIBLE', 'ELIMINAR_VALE', `Eliminado/Anulado vale ID ${id}`);
            if (broadcast) broadcast({ type: 'COMBUSTIBLE_VALE_ELIMINADO', id });

            res.json({ ok: true, mensaje: hardDelete ? 'Vale eliminado definitivamente.' : 'Vale marcado como ANULADO.' });
        } catch (err) {
            console.error("Error eliminando vale de combustible:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 8. 🗑️ ELIMINACIÓN MASIVA DE VALES (SELECCIÓN POR CHECKBOX)
    // ============================================================
    router.post('/vales/eliminar-masivo', async (req, res) => {
        try {
            const tdb = getDb(req);
            const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
            const hardDelete = req.body.hard === true || req.query.hard === 'true';

            if (ids.length === 0) {
                return res.status(400).json({ ok: false, error: 'No se seleccionaron vales para eliminar.' });
            }

            if (hardDelete) {
                await tdb.query("DELETE FROM combustible_vales WHERE id IN (?)", [ids]);
            } else {
                await tdb.query("UPDATE combustible_vales SET estado = 'ANULADO' WHERE id IN (?)", [ids]);
            }

            if (logAudit) logAudit(req, 'COMBUSTIBLE', 'ELIMINAR_MASIVO', `Eliminados/Anulados ${ids.length} vales`);
            if (broadcast) broadcast({ type: 'COMBUSTIBLE_VALES_ELIMINADOS_MASIVO', cantidad: ids.length });

            res.json({
                ok: true,
                eliminados: ids.length,
                mensaje: `Se ${hardDelete ? 'eliminaron' : 'anularon'} ${ids.length} vales exitosamente.`
            });
        } catch (err) {
            console.error("Error en eliminación masiva de vales:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 9. 📊 ANÁLISIS DINÁMICO POR VIAJE CON COMPARATIVA DE RENDIMIENTO TEÓRICO
    // ============================================================
    router.get('/analisis-viajes', async (req, res) => {
        try {
            const tdb = getDb(req);
            const { combustible, placa, search, fecha_desde, fecha_hasta } = req.query;

            const whereClauses = ["estado != 'ANULADO'"];
            const params = [];

            if (placa && placa !== 'ALL') {
                whereClauses.push("vehiculo = ?");
                params.push(placa.toUpperCase().trim());
            }

            if (combustible && combustible !== 'ALL') {
                whereClauses.push("tipo_combustible = ?");
                params.push(combustible.trim());
            }

            if (fecha_desde) {
                whereClauses.push("fecha >= ?");
                params.push(`${fecha_desde} 00:00:00`);
            }

            if (fecha_hasta) {
                whereClauses.push("fecha <= ?");
                params.push(`${fecha_hasta} 23:59:59`);
            }

            if (search && search.trim()) {
                const q = `%${search.trim()}%`;
                whereClauses.push("(viaje LIKE ? OR vehiculo LIKE ? OR ruta LIKE ? OR conductor LIKE ?)");
                params.push(q, q, q, q);
            }

            const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            // 1. Consultar vales filtrados a máxima velocidad (índice directo)
            const [rows] = await tdb.query(
                `SELECT 
                    id, fecha, estado, correlativo, viaje, vehiculo, conductor, ruta,
                    estacion, proveedor, tipo_combustible, kilometraje, peso_tn, galones,
                    importe, numero_comprobante, tipo
                FROM combustible_vales 
                ${whereSQL} 
                ORDER BY fecha ASC, id ASC`,
                params
            );

            // 2. Consultar órdenes de viaje en paralelo y mapear en memoria O(1)
            const [ovRows] = await tdb.query(`SELECT viaje, ruta, peso FROM operaciones_ordenes_viaje`);
            const ovMap = new Map();
            ovRows.forEach(o => {
                if (o.viaje) {
                    const raw = String(o.viaje).trim();
                    ovMap.set(raw, o);
                    const clean = raw.replace(/^\d{4}-0*/, '');
                    if (clean) ovMap.set(clean, o);
                }
            });

            // Enriquecer ruta y peso instantáneamente sin degradar SQL
            rows.forEach(v => {
                if (v.viaje) {
                    const vKey = String(v.viaje).trim();
                    const cleanV = vKey.replace(/^\d{4}-0*/, '');
                    const ov = ovMap.get(vKey) || ovMap.get(cleanV);
                    if (ov) {
                        if (ov.ruta && (!v.ruta || v.ruta === 'Sin Ruta')) {
                            v.ruta = ov.ruta;
                        }
                        if (ov.peso && parseFloat(ov.peso) > 0) {
                            const rawP = parseFloat(ov.peso);
                            v.peso_tn = rawP > 50 ? parseFloat((rawP / 1000).toFixed(2)) : parseFloat(rawP.toFixed(2));
                        }
                    }
                }
            });

            const peruDateFmt = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Lima',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });

            const formatPeruDate = (f) => {
                if (!f) return '';
                const d = new Date(f);
                if (isNaN(d.getTime())) return String(f);
                return peruDateFmt.format(d).replace(',', '');
            };

            // Consultar modelo de motor y marca de las placas para enriquecer el análisis
            const [placasRows] = await tdb.query("SELECT placa, modelo_motor, marca, modelo_uts FROM placas");
            const placaMotorMap = new Map();
            const placaMarcaMap = new Map();
            placasRows.forEach(p => {
                if (p.placa) {
                    const plKey = p.placa.trim().toUpperCase();
                    placaMotorMap.set(plKey, p.modelo_motor || '');
                    placaMarcaMap.set(plKey, p.marca || '');
                }
            });

            // 1. Agrupar vales por Vehículo y luego por Viaje
            const vehiculoMap = {};

            rows.forEach(v => {
                const vehKey = String(v.vehiculo || 'SIN-PLACA').toUpperCase().trim();
                const tripKey = String(v.viaje || 'SIN-VIAJE').trim();

                if (!vehiculoMap[vehKey]) vehiculoMap[vehKey] = {};
                if (!vehiculoMap[vehKey][tripKey]) {
                    vehiculoMap[vehKey][tripKey] = {
                        viaje: tripKey,
                        placa: vehKey,
                        ruta: v.ruta || 'Sin Ruta',
                        vouchers: []
                    };
                }

                vehiculoMap[vehKey][tripKey].vouchers.push({
                    id: v.id,
                    fecha: formatPeruDate(v.fecha),
                    producto: v.tipo_combustible || 'D2',
                    grifo: v.estacion || v.proveedor || 'Estación',
                    odometro: parseFloat(v.kilometraje || 0),
                    galones: parseFloat(v.galones || 0),
                    importe: parseFloat(v.importe || 0),
                    peso: parseFloat(v.peso_tn || 0),
                    conductor: v.conductor || 'Sin Especificar',
                    correlativo: v.correlativo || '',
                    numero_comprobante: v.numero_comprobante || '',
                    tipo: v.tipo || ''
                });
            });

            // 2. Encadenar odómetros y fechas viaje a viaje para cada vehículo (Global y por Combustible)
            const trips = [];

            Object.keys(vehiculoMap).forEach(vehKey => {
                const tripsObj = vehiculoMap[vehKey];
                // Convertir a array de viajes del vehículo y ordenar cronológicamente
                const vehTrips = Object.values(tripsObj).map(t => {
                    t.vouchers.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.id - b.id));
                    const earliestDate = t.vouchers[0]?.fecha || '';
                    return { ...t, earliestDate };
                }).sort((a, b) => a.earliestDate.localeCompare(b.earliestDate));

                // Rastrear el último voucher general y por combustible en esta placa
                let lastVoucherGeneral = null;
                const lastVoucherByFuel = {};

                vehTrips.forEach((t) => {
                    const firstVCurrent = t.vouchers[0] || {};
                    const lastVCurrent = t.vouchers[t.vouchers.length - 1] || {};
                    const totalGal = t.vouchers.reduce((s, x) => s + x.galones, 0);
                    const totalCost = t.vouchers.reduce((s, x) => s + x.importe, 0);
                    
                    const maxPesoRaw = Math.max(0, ...t.vouchers.map(x => parseFloat(x.peso || 0)));
                    const pesoCalculadoTn = maxPesoRaw > 50 ? parseFloat((maxPesoRaw / 1000).toFixed(2)) : parseFloat(maxPesoRaw.toFixed(2));

                    // Desglose de galones y pesos por tramo (IDA vs RETORNO)
                    // Solo los vales marcados explícitamente como RETORNO o VUELTA van a retorno; el resto (o vales de servicio/recarga) van a IDA
                    const vouchersRetorno = t.vouchers.filter(v => !v.esPuntoPartida && ((v.tipo || '').toUpperCase().includes('VUELTA') || (v.tipo || '').toUpperCase().includes('RETORNO')));
                    const vouchersIda = t.vouchers.filter(v => !v.esPuntoPartida && !((v.tipo || '').toUpperCase().includes('VUELTA') || (v.tipo || '').toUpperCase().includes('RETORNO')));

                    const galonesIda = vouchersIda.reduce((s, x) => s + (x.galones || 0), 0);
                    const galonesRetorno = vouchersRetorno.reduce((s, x) => s + (x.galones || 0), 0);

                    const rawPesoIda = Math.max(0, ...vouchersIda.map(x => parseFloat(x.peso || 0)));
                    let pesoIdaCalculado = rawPesoIda > 50 ? parseFloat((rawPesoIda / 1000).toFixed(2)) : parseFloat(rawPesoIda.toFixed(2));

                    const rawPesoRet = Math.max(0, ...vouchersRetorno.map(x => parseFloat(x.peso || 0)));
                    let pesoRetornoCalculado = rawPesoRet > 50 ? parseFloat((rawPesoRet / 1000).toFixed(2)) : parseFloat(rawPesoRet.toFixed(2));

                    // Regla Operativa: La IDA lleva la carga del viaje y el RETORNO va vacío (0 Tn).
                    if (pesoIdaCalculado === 0 && pesoCalculadoTn > 0) {
                        pesoIdaCalculado = pesoCalculadoTn;
                    }
                    if (vouchersRetorno.length === 0) {
                        pesoRetornoCalculado = 0;
                    }

                    // Último vale del viaje actual (Cierre General)
                    const kmFin = lastVCurrent.odometro || 0;
                    const fechaFin = lastVCurrent.fecha || 'N/D';

                    // Puntos de partida específicos por tipo de combustible
                    const fuelStats = {};
                    const fuelsInTrip = new Set(t.vouchers.map(v => (v.producto || 'D2').toUpperCase()));

                    fuelsInTrip.forEach(fuelType => {
                        const fuelVouchers = t.vouchers.filter(v => (v.producto || 'D2').toUpperCase() === fuelType);
                        const firstVFuel = fuelVouchers[0] || {};
                        const lastVFuel = fuelVouchers[fuelVouchers.length - 1] || {};
                        const prevVFuel = lastVoucherByFuel[fuelType];

                        const validPrevFuel = (prevVFuel && prevVFuel.fecha <= (firstVFuel.fecha || ''));
                        const fKmFin = lastVFuel.odometro || 0;
                        const fFechaFin = lastVFuel.fecha || 'N/D';
                        const fKmInicio = validPrevFuel ? (prevVFuel.odometro || 0) : (firstVFuel.odometro || 0);
                        const fFechaInicio = validPrevFuel ? (prevVFuel.fecha || 'N/D') : (firstVFuel.fecha || 'N/D');
                        const fRecorrido = (fKmFin > fKmInicio && fKmInicio > 0) ? (fKmFin - fKmInicio) : 0;
                        const fGalones = fuelVouchers.reduce((s, x) => s + x.galones, 0);
                        const fGasto = fuelVouchers.reduce((s, x) => s + x.importe, 0);
                        const fRendimiento = (fGalones > 0 && fRecorrido > 0) ? (fRecorrido / fGalones) : 0;

                        const fPartidaVoucher = validPrevFuel ? {
                            ...prevVFuel,
                            id: `partida_${fuelType}_${prevVFuel.id}`,
                            esPuntoPartida: true,
                            viajeOriginal: prevVFuel.viaje
                        } : null;

                        fuelStats[fuelType] = {
                            kmInicio: fKmInicio,
                            kmFin: fKmFin,
                            fechaInicio: fFechaInicio,
                            fechaFin: fFechaFin,
                            recorridoKm: fRecorrido,
                            totalGalones: fGalones,
                            totalGasto: fGasto,
                            rendimiento: fRendimiento,
                            voucherPartida: fPartidaVoucher,
                            vouchers: fPartidaVoucher ? [fPartidaVoucher, ...fuelVouchers] : [...fuelVouchers]
                        };

                        // Actualizar último voucher histórico de este combustible para el siguiente viaje
                        lastVoucherByFuel[fuelType] = { ...lastVFuel, viaje: t.viaje };
                    });

                    // Punto de partida general (el último vale del viaje anterior para esta placa)
                    const validPrevGen = (lastVoucherGeneral && lastVoucherGeneral.fecha <= (firstVCurrent.fecha || ''));
                    const kmInicio = validPrevGen ? (lastVoucherGeneral.odometro || 0) : (firstVCurrent.odometro || 0);
                    const fechaInicio = validPrevGen ? (lastVoucherGeneral.fecha || 'N/D') : (firstVCurrent.fecha || 'N/D');
                    const recorridoKm = (kmFin > kmInicio && kmInicio > 0) ? (kmFin - kmInicio) : 0;
                    const rendimiento = (totalGal > 0 && recorridoKm > 0) ? (recorridoKm / totalGal) : 0;

                    // Punto de partida general para el modal
                    const genPartidaVoucher = validPrevGen ? {
                        ...lastVoucherGeneral,
                        id: `partida_gen_${lastVoucherGeneral.id}`,
                        esPuntoPartida: true,
                        viajeOriginal: lastVoucherGeneral.viaje
                    } : null;

                    // Marcar cierre en el último voucher del viaje
                    lastVCurrent.esPuntoCierre = true;

                    // Vales del modal por defecto
                    const modalVouchers = genPartidaVoucher ? [genPartidaVoucher, ...t.vouchers] : [...t.vouchers];

                    // Actualizar último voucher general para el siguiente viaje
                    lastVoucherGeneral = { ...lastVCurrent, viaje: t.viaje };

                    trips.push({
                        viaje: t.viaje,
                        placa: t.placa,
                        motor: placaMotorMap.get(t.placa) || '',
                        marca: placaMarcaMap.get(t.placa) || '',
                        ruta: t.ruta,
                        fechaInicio,
                        fechaFin,
                        kmInicio,
                        kmFin,
                        recorridoKm,
                        odometroInconsistente: (kmInicio > 0 && kmFin > 0 && kmFin < kmInicio),
                        pesoMaxTn: pesoCalculadoTn,
                        pesoMaxKg: maxPesoRaw,
                        galonesIda: parseFloat(galonesIda.toFixed(2)),
                        galonesRetorno: parseFloat(galonesRetorno.toFixed(2)),
                        pesoIda: pesoIdaCalculado,
                        pesoRetorno: pesoRetornoCalculado,
                        totalGalones: totalGal,
                        totalGasto: totalCost,
                        rendimiento,
                        vouchers: modalVouchers,
                        vouchersPropiosCount: t.vouchers.length,
                        fuelStats
                    });
                });
            });

            // Ordenar viajes por Fecha Fin DESC por defecto (los más recientes en el tiempo primero)
            trips.sort((a, b) => (b.fechaFin || '').localeCompare(a.fechaFin || '') || (b.viaje || '').localeCompare(a.viaje || ''));

            const totalViajes = trips.length;
            const totalGalones = trips.reduce((s, t) => s + t.totalGalones, 0);
            const totalGasto = trips.reduce((s, t) => s + t.totalGasto, 0);
            const totalKm = trips.reduce((s, t) => s + t.recorridoKm, 0);

            const promGalViaje = totalViajes > 0 ? (totalGalones / totalViajes) : 0;
            const promPrecioGal = totalGalones > 0 ? (totalGasto / totalGalones) : 0;
            const promKmGal = (totalGalones > 0 && totalKm > 0) ? (totalKm / totalGalones) : 0;

            res.json({
                ok: true,
                trips,
                kpis: {
                    totalViajes,
                    totalGalones,
                    totalGasto,
                    totalKm,
                    promGalViaje,
                    promPrecioGal,
                    promKmGal
                }
            });
        } catch (err) {
            console.error("Error en análisis dinámico de combustible:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 10. 🗂️ CATÁLOGOS ÚNICOS PARA FILTROS
    // ============================================================
    router.get('/catalogos', async (req, res) => {
        try {
            const tdb = getDb(req);
            const [combustibles] = await tdb.query("SELECT DISTINCT tipo_combustible FROM combustible_vales WHERE tipo_combustible != '' ORDER BY tipo_combustible ASC");
            const [placas] = await tdb.query("SELECT DISTINCT vehiculo FROM combustible_vales WHERE vehiculo != '' AND vehiculo != 'SIN-PLACA' ORDER BY vehiculo ASC");
            const [proveedores] = await tdb.query("SELECT DISTINCT proveedor FROM combustible_vales WHERE proveedor != '' ORDER BY proveedor ASC");

            res.json({
                ok: true,
                combustibles: combustibles.map(r => r.tipo_combustible),
                placas: placas.map(r => r.vehiculo),
                proveedores: proveedores.map(r => r.proveedor)
            });
        } catch (err) {
            console.error("Error obteniendo catálogos de combustible:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 11. 🛒 CONSULTAR COMPRAS EXTERNAS (vw_combustible_compra_externa)
    // ============================================================
    router.get('/compras-externas', async (req, res) => {
        try {
            const rdb = getRemoteDb();
            const [rows] = await rdb.query(
                `SELECT * FROM vw_combustible_compra_externa ORDER BY fecha DESC LIMIT 500`
            );
            res.json({ ok: true, data: rows || [] });
        } catch (err) {
            console.error("Error consultando compras externas:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    // ============================================================
    // 🛰️ GESTOR DE SESIÓN Y TELEMETRÍA CAN BUS WIALON (ALTO RENDIMIENTO)
    // ============================================================
    // 🛰️ GESTOR DE SESIÓN Y TELEMETRÍA CAN BUS WIALON (ALTO RENDIMIENTO)
    // ============================================================
    let _wialonCache = {
        sid: null,
        token: null,
        baseUrl: null,
        expiresAt: 0,
        unitsMap: new Map(), // cleanPlaca -> unit
        targetResourceId: null,
        targetTemplateId: null,
        templateName: ''
    };

    async function getWialonContext(dbLocal) {
        const [intgRows] = await dbLocal.promise().query(
            "SELECT clave, valor FROM integraciones_api WHERE clave IN ('wialon_token', 'wialon_url')"
        );

        let token = '';
        let baseUrl = 'https://hst-api.wialon.us/wialon/ajax.html';
        intgRows.forEach(r => {
            if (r.clave === 'wialon_token') token = (r.valor || '').trim();
            if (r.clave === 'wialon_url' && r.valor) baseUrl = r.valor.trim();
        });

        if (!token) throw new Error('Token Wialon no configurado en Sistema → Integraciones');

        const now = Date.now();
        // Reutilizar sesión activa si es del mismo token y no ha expirado (10 min TTL)
        if (_wialonCache.sid && _wialonCache.token === token && _wialonCache.baseUrl === baseUrl && now < _wialonCache.expiresAt) {
            return { sid: _wialonCache.sid, baseUrl, cache: _wialonCache };
        }

        // 1. Iniciar Sesión en Wialon
        const loginRes = await fetch(`${baseUrl}?svc=token/login&params=${encodeURIComponent(JSON.stringify({ token }))}`);
        const loginData = await loginRes.json();
        if (!loginData.eid) {
            throw new Error('Error autenticando con Wialon. Verifica el token en Integraciones.');
        }
        const sid = loginData.eid;

        // 2. Precargar Recursos y Plantilla "3.2.1 Informe: Viajes - Unidad CAN"
        const resParams = {
            spec: { itemsType: "avl_resource", propName: "sys_name", propValueMask: "*", sortType: "sys_name" },
            force: 1, flags: 8193, from: 0, to: 0
        };
        const resRes = await fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(resParams))}&sid=${sid}`);
        const resData = await resRes.json();

        let targetResourceId = null;
        let targetTemplateId = null;
        let templateName = '';

        if (resData.items) {
            for (const r of resData.items) {
                if (r.rep) {
                    for (const rep of Object.values(r.rep)) {
                        const n = (rep.n || '').toLowerCase();
                        if (n.includes('3.2.1') || n.includes('viajes - unidad can')) {
                            targetResourceId = r.id;
                            targetTemplateId = rep.id;
                            templateName = rep.n;
                            break;
                        }
                    }
                }
                if (targetResourceId && targetTemplateId) break;
            }

            if (!targetResourceId || !targetTemplateId) {
                for (const r of resData.items) {
                    if (r.rep) {
                        for (const rep of Object.values(r.rep)) {
                            const n = (rep.n || '').toLowerCase();
                            if (n.includes('25') || n.includes('informe de combustible')) {
                                targetResourceId = r.id;
                                targetTemplateId = rep.id;
                                templateName = rep.n;
                                break;
                            }
                        }
                    }
                    if (targetResourceId && targetTemplateId) break;
                }
            }
        }

        // 3. Precargar Unidades (avl_unit)
        const unitsParams = {
            spec: { itemsType: "avl_unit", propName: "sys_name", propValueMask: "*", sortType: "sys_name" },
            force: 1, flags: 1, from: 0, to: 0
        };
        const unitsRes = await fetch(`${baseUrl}?svc=core/search_items&params=${encodeURIComponent(JSON.stringify(unitsParams))}&sid=${sid}`);
        const unitsData = await unitsRes.json();
        const unitsMap = new Map();

        if (unitsData.items) {
            unitsData.items.forEach(u => {
                const rawName = String(u.nm || '').toUpperCase();
                const clean = rawName.replace(/[^A-Z0-9]/gi, '');
                unitsMap.set(clean, u);
                const m = rawName.match(/([A-Z0-9]{3}-?[A-Z0-9]{3})/i);
                if (m) {
                    unitsMap.set(m[1].replace(/[^A-Z0-9]/gi, ''), u);
                }
            });
        }

        _wialonCache = {
            sid,
            token,
            baseUrl,
            expiresAt: now + (10 * 60 * 1000), // 10 min
            unitsMap,
            targetResourceId,
            targetTemplateId,
            templateName
        };

        return { sid, baseUrl, cache: _wialonCache };
    }

    async function consultarTelemetriaViajeWialon(baseUrl, sid, cache, placa, fechaInicio, fechaFin) {
        const cleanPlaca = String(placa).replace(/[^A-Z0-9]/gi, '').toUpperCase();
        let unit = cache.unitsMap.get(cleanPlaca);

        if (!unit) {
            for (const [k, u] of cache.unitsMap.entries()) {
                if (k.includes(cleanPlaca) || cleanPlaca.includes(k)) {
                    unit = u;
                    break;
                }
            }
        }

        if (!unit) return null;

        const parseToUnix = (dateStr) => {
            if (!dateStr || dateStr === 'N/D' || dateStr === '---' || dateStr === '—') return null;
            const str = String(dateStr).trim();
            if (/^\d{10,13}$/.test(str)) {
                const n = Number(str);
                return n > 1e11 ? Math.floor(n / 1000) : n;
            }
            const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
            if (ddmmyyyy) {
                const [, d, m, y, h, min, s] = ddmmyyyy;
                const dateObj = new Date(Number(y), Number(m) - 1, Number(d), Number(h || 0), Number(min || 0), Number(s || 0));
                return Math.floor(dateObj.getTime() / 1000);
            }
            const d = new Date(str.includes('T') || str.includes('Z') ? str : (str.replace(' ', 'T') + '-05:00'));
            if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
            const fallback = new Date(str);
            return isNaN(fallback.getTime()) ? null : Math.floor(fallback.getTime() / 1000);
        };

        let fromUnix = parseToUnix(fechaInicio);
        let toUnix = parseToUnix(fechaFin);
        if (!fromUnix && !toUnix) return null;
        if (!fromUnix) fromUnix = toUnix;
        if (!toUnix) toUnix = fromUnix;

        // Si es un solo vale en el viaje (diferencia de tiempo <= 5 minutos o idéntica fecha)
        if (toUnix - fromUnix < 300) {
            fromUnix = fromUnix - (12 * 3600); // 12 horas antes
            toUnix = toUnix + (12 * 3600);     // 12 horas después
        }

        if (toUnix <= fromUnix) return null;

        const execParams = {
            reportResourceId: cache.targetResourceId,
            reportTemplateId: cache.targetTemplateId,
            reportObjectId: unit.id,
            reportObjectSecId: 0,
            interval: { from: fromUnix, to: toUnix, flags: 0 }
        };

        let execRes = await fetch(`${baseUrl}?svc=report/exec_report&params=${encodeURIComponent(JSON.stringify(execParams))}&sid=${sid}`);
        let execData = await execRes.json();

        // Si la sesión expiró (error 1 o 4), invalidar caché
        if (execData && (execData.error === 1 || execData.error === 4)) {
            _wialonCache.sid = null;
            _wialonCache.expiresAt = 0;
        }

        let recorridoKmGps = null;
        let combustibleConsumidoGps = null;
        let rendimientoGps = null;
        let velocidadMaxGps = null;
        let rpmMediaGps = null;
        let rpmMediaMaxGps = null;
        let rpmMaxGps = null;
        let rpmMaxMaxGps = null;
        let horasMotorGps = null;
        let consumoRalentiGps = null;

        const cleanNum = (str) => {
            if (!str) return null;
            const match = String(str).replace(/,/g, '').match(/[-+]?[0-9]*\.?[0-9]+/);
            return match ? parseFloat(match[0]) : null;
        };

        if (execData.reportResult && Array.isArray(execData.reportResult.tables)) {
            execData.reportResult.tables.forEach(tbl => {
                if (Array.isArray(tbl.header) && Array.isArray(tbl.total)) {
                    tbl.header.forEach((h, hIdx) => {
                        const headerRaw = String(h || '').trim();
                        const headerLower = headerRaw.toLowerCase();
                        const valStr = tbl.total[hIdx];

                        const esKmInicial = headerLower.includes('inicial') || headerLower.includes('initial') || headerLower.includes('inicio');
                        const esKmFinal = headerLower.includes('final');

                        if (!esKmInicial && !esKmFinal) {
                            if (headerLower === 'kilometraje' || headerLower === 'kilometraje en viajes' || headerLower.includes('distancia') || headerLower.includes('recorrido')) {
                                const num = cleanNum(valStr);
                                if (num !== null) recorridoKmGps = num;
                            }
                        }

                        if (headerLower.includes('consumo promedio en ralentí') || headerLower.includes('consumo promedio en ralenti') || headerLower.includes('idle')) {
                            const num = cleanNum(valStr);
                            if (num !== null && consumoRalentiGps === null) consumoRalentiGps = num;
                        } else if (headerLower.includes('combustible consumido') || headerLower.includes('consumo')) {
                            const num = cleanNum(valStr);
                            if (num !== null && combustibleConsumidoGps === null) combustibleConsumidoGps = num;
                        } else if (headerLower.includes('rendimiento') || headerLower.includes('km/gal')) {
                            const num = cleanNum(valStr);
                            if (num !== null && rendimientoGps === null) rendimientoGps = num;
                        } else if (headerLower.includes('velocidad máxima') || headerLower.includes('velocidad maxima') || headerLower.includes('max speed')) {
                            const num = cleanNum(valStr);
                            if (num !== null && velocidadMaxGps === null) velocidadMaxGps = num;
                        } else if (headerRaw.includes('RPM Media (RPM)') || (headerLower.includes('rpm media') && !headerLower.includes('máxima rpm') && !headerLower.includes('maxima rpm'))) {
                            const num = cleanNum(valStr);
                            if (num !== null && rpmMediaGps === null) rpmMediaGps = num;
                        } else if (headerRaw.includes('RPM Media (Máxima RPM)') || headerRaw.includes('RPM Media (Maxima RPM)')) {
                            const num = cleanNum(valStr);
                            if (num !== null && rpmMediaMaxGps === null) rpmMediaMaxGps = num;
                        } else if (headerRaw.includes('RPM Máxima (RPM)') || headerRaw.includes('RPM Maxima (RPM)')) {
                            const num = cleanNum(valStr);
                            if (num !== null && rpmMaxGps === null) rpmMaxGps = num;
                        } else if (headerRaw.includes('RPM Máxima (Máxima RPM)') || headerRaw.includes('RPM Maxima (Maxima RPM)')) {
                            const num = cleanNum(valStr);
                            if (num !== null && rpmMaxMaxGps === null) rpmMaxMaxGps = num;
                        } else if (headerLower.includes('horas de motor') || headerLower.includes('horas motor') || headerLower.includes('duración del viaje') || headerLower.includes('duracion')) {
                            if (valStr && horasMotorGps === null) horasMotorGps = String(valStr).trim();
                        }
                    });
                }
            });
        }

        if (execData.reportResult && Array.isArray(execData.reportResult.stats)) {
            execData.reportResult.stats.forEach(([key, val]) => {
                const k = String(key || '').toLowerCase().trim();
                const esContador = k.includes('contador') || k.includes('counter');
                const esInicial = k.includes('inicial') || k.includes('initial');
                const esFinal = k.includes('final');

                if (!esContador && !esInicial && !esFinal) {
                    if ((k.includes('kilometraje en viajes') || k.includes('mileage in trips') || k.includes('distancia') || k === 'kilometraje') && recorridoKmGps === null) {
                        recorridoKmGps = cleanNum(val);
                    }
                }

                if ((k.includes('fuel consumed') || k.includes('combustible consumido')) && combustibleConsumidoGps === null) {
                    combustibleConsumidoGps = cleanNum(val);
                } else if ((k.includes('rendimiento') || k.includes('avg. fuel consumption')) && rendimientoGps === null) {
                    rendimientoGps = cleanNum(val);
                } else if ((k.includes('max speed') || k.includes('velocidad máxima') || k.includes('velocidad maxima')) && velocidadMaxGps === null) {
                    velocidadMaxGps = cleanNum(val);
                } else if ((k.includes('engine hours') || k.includes('horas de motor') || k.includes('horas motor')) && horasMotorGps === null) {
                    horasMotorGps = String(val).trim();
                } else if ((k.includes('idle') || k.includes('ralentí') || k.includes('ralenti')) && consumoRalentiGps === null) {
                    consumoRalentiGps = cleanNum(val);
                }
            });
        }

        if (rendimientoGps === null && recorridoKmGps > 0 && combustibleConsumidoGps > 0) {
            rendimientoGps = Math.round((recorridoKmGps / combustibleConsumidoGps) * 100) / 100;
        }

        // Limpiar el reporte ejecutado
        await fetch(`${baseUrl}?svc=report/cleanup_result&params=%7B%7D&sid=${sid}`).catch(() => {});

        return {
            placa: cleanPlaca,
            unitName: unit.nm,
            plantilla: cache.templateName,
            recorridoKmGps,
            combustibleConsumidoGps,
            rendimientoGps,
            velocidadMaxGps,
            rpmMediaGps,
            rpmMediaMaxGps,
            rpmMaxGps,
            rpmMaxMaxGps,
            horasMotorGps,
            consumoRalentiGps
        };
    }

    // ── GET /api/combustible/wialon-telemetria (Individual Rápido con Cache) ────
    router.get('/wialon-telemetria', async (req, res) => {
        try {
            const { placa, fechaInicio, fechaFin } = req.query;
            if (!placa || !fechaInicio || !fechaFin) {
                return res.status(400).json({ ok: false, error: 'Parámetros requeridos: placa, fechaInicio, fechaFin' });
            }

            const dbLocal = req.db;
            const { sid, baseUrl, cache } = await getWialonContext(dbLocal);

            if (!cache.targetResourceId || !cache.targetTemplateId) {
                return res.json({ ok: false, error: 'No se encontró la plantilla de telemetría CAN en Wialon' });
            }

            const data = await consultarTelemetriaViajeWialon(baseUrl, sid, cache, placa, fechaInicio, fechaFin);
            res.json({ ok: true, data });
        } catch (err) {
            console.error('Error en wialon-telemetria:', err);
            res.json({ ok: false, error: err.message });
        }
    });

    // ── POST /api/combustible/wialon-telemetria-batch (Masivo en Paralelo) ──────
    router.post('/wialon-telemetria-batch', async (req, res) => {
        try {
            const { trips } = req.body;
            if (!Array.isArray(trips) || trips.length === 0) {
                return res.json({ ok: true, results: [] });
            }

            const dbLocal = req.db;
            const { sid, baseUrl, cache } = await getWialonContext(dbLocal);

            if (!cache.targetResourceId || !cache.targetTemplateId) {
                return res.json({ ok: false, error: 'No se encontró la plantilla de telemetría CAN en Wialon' });
            }

            // Ejecutar secuencialmente para evitar colisiones de estado en la sesión de reportes de Wialon
            const results = [];

            for (const t of trips) {
                try {
                    const data = await consultarTelemetriaViajeWialon(baseUrl, sid, cache, t.placa, t.fechaInicio, t.fechaFin);
                    results.push({ id: t.id || t.viaje || t.index, index: t.index, placa: t.placa, data });
                } catch (err) {
                    console.warn(`Error telemetría viaje ${t.placa}:`, err.message);
                    results.push({ id: t.id || t.viaje || t.index, index: t.index, placa: t.placa, data: null, error: err.message });
                }
            }

            res.json({ ok: true, results });
        } catch (err) {
            console.error('Error en wialon-telemetria-batch:', err);
            res.json({ ok: false, error: err.message });
        }
    });

    return router;
};

