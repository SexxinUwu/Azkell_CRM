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

    async function ensureTables(req) {
        const tenantId = (req && req.tenantId) ? req.tenantId : 'default';
        if (_tenantsInitSet.has(tenantId)) return;
        try {
            const tdb = getDb(req);
            if (!tdb) return;
            await tdb.query(TABLE_SQL);
            
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
            const reimportAll = query.reset === 'true' || body.reset === true;

            console.log('🔄 Iniciando sincronización remota de combustible desde 168.231.98.23 para Marsisa...');

            if (reimportAll) {
                await tdb.query("TRUNCATE TABLE combustible_vales");
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

            // Consultar correlativos e IDs existentes para no duplicar
            const [existentesRows] = await tdb.query("SELECT DISTINCT id_remoto, correlativo FROM combustible_vales WHERE correlativo != '' OR id_remoto IS NOT NULL");
            const existentesCorrelativos = new Set(existentesRows.map(r => r.correlativo).filter(Boolean));
            const existentesRemotoIds = new Set(existentesRows.map(r => r.id_remoto).filter(Boolean));

            // Consultar los vales de la vista remota
            const [remotoVales] = await rdb.query(
                `SELECT * FROM vw_combustible_vale ORDER BY fecha DESC LIMIT 5000`
            );

            if (!remotoVales || remotoVales.length === 0) {
                return res.json({ ok: true, sincronizados: 0, totalRemotos: 0, mensaje: 'No hay registros en el servidor remoto.' });
            }

            // Filtrar solo los vales que no estén ya registrados por ID remoto o correlativo
            const nuevosVales = remotoVales.filter(v => {
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
                    const caja = '';
                    const estado_caja = 'PROCESADO';
                    const vehiculo = String(v.placa || 'SIN-PLACA').toUpperCase().trim();
                    const clase_vehiculo = placaClaseMap.get(vehiculo) || 'TRACTO';
                    const vehiculo_marca = String(v.vehiculo_marca || '').trim();
                    const vehiculo_modelo = String(v.vehiculo_modelo || '').trim();
                    const conductor = String(v.conductor_nombre || '').trim();
                    const ruta = String(v.localidad || '').trim();
                    const departamento = '';
                    const provincia = '';
                    const distrito = '';
                    const estacion = String(v.estacion || '').trim();
                    const tipo_combustible = String(v.tipo_combustible || 'D2').trim();
                    const proveedor = String(v.proveedor_razon_social || '').trim();
                    const ruc = rucMap.get(proveedor.toUpperCase()) || '';
                    const kilometraje = parseFloat(v.kilometraje || 0);
                    const peso_tn = parseFloat(v.peso || 0);
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
    // 2. 📊 OBTENER MATRIZ DE RENDIMIENTO TEÓRICO (vw_combustible_rendimiento)
    // ============================================================
    router.get('/rendimiento-teorico', async (req, res) => {
        try {
            const rdb = getRemoteDb();
            const [rows] = await rdb.query(
                "SELECT * FROM vw_combustible_rendimiento ORDER BY punto_inicio ASC, punto_final ASC"
            );
            res.json({ ok: true, data: rows || [] });
        } catch (err) {
            console.error("Error obteniendo rendimientos teóricos:", err.message);
            // Si la conexión remota fallase temporalmente, devolver matriz base de respaldo
            res.json({
                ok: true,
                data: [
                    { ruta_id: 1, punto_inicio: 'LIMA', punto_final: 'ICA', ruta_distancia_km: 300, configuracion_vehicular: 'T2SE3', km_0: 16.0, km_15: 13.0, km_30: 9.5, retorno_vacio: 15.0 },
                    { ruta_id: 2, punto_inicio: 'LIMA', punto_final: 'AREQUIPA', ruta_distancia_km: 1010, configuracion_vehicular: 'T3S3', km_0: 14.5, km_15: 11.5, km_30: 8.5, retorno_vacio: 13.5 },
                    { ruta_id: 3, punto_inicio: 'LIMA', punto_final: 'HUANCAYO', ruta_distancia_km: 310, configuracion_vehicular: 'T3S3', km_0: 12.0, km_15: 9.5, km_30: 7.2, retorno_vacio: 11.0 }
                ]
            });
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

            const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

            const [rows] = await tdb.query(
                `SELECT * FROM combustible_vales ${whereSQL} ORDER BY fecha ASC, id ASC`,
                params
            );

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
                    fecha: v.fecha ? new Date(v.fecha).toISOString().replace('T', ' ').slice(0, 19) : '',
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

            // 2. Encadenar odómetros y fechas viaje a viaje para cada vehículo
            const trips = [];

            Object.keys(vehiculoMap).forEach(vehKey => {
                const tripsObj = vehiculoMap[vehKey];
                // Convertir a array de viajes del vehículo y ordenar cronológicamente
                const vehTrips = Object.values(tripsObj).map(t => {
                    t.vouchers.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.id - b.id));
                    const earliestDate = t.vouchers[0]?.fecha || '';
                    return { ...t, earliestDate };
                }).sort((a, b) => a.earliestDate.localeCompare(b.earliestDate));

                vehTrips.forEach((t, i) => {
                    const totalGal = t.vouchers.reduce((s, x) => s + x.galones, 0);
                    const totalCost = t.vouchers.reduce((s, x) => s + x.importe, 0);
                    const maxPeso = Math.max(0, ...t.vouchers.map(x => x.peso));

                    // Último vale del viaje actual (Cierre)
                    const lastVCurrent = t.vouchers[t.vouchers.length - 1] || {};
                    const kmFin = lastVCurrent.odometro || 0;
                    const fechaFin = lastVCurrent.fecha || 'N/D';
                    lastVCurrent.esPuntoCierre = true;

                    let kmInicio = 0;
                    let fechaInicio = 'N/D';
                    let voucherPartida = null;

                    if (i > 0) {
                        // Viene de viaje previo de la misma placa
                        const prevTrip = vehTrips[i - 1];
                        const lastVPrev = prevTrip.vouchers[prevTrip.vouchers.length - 1];
                        if (lastVPrev) {
                            kmInicio = lastVPrev.odometro || 0;
                            fechaInicio = lastVPrev.fecha || 'N/D';
                            voucherPartida = {
                                ...lastVPrev,
                                id: `partida_${lastVPrev.id}`,
                                esPuntoPartida: true,
                                viajeOriginal: prevTrip.viaje
                            };
                        }
                    } else {
                        // Primer viaje histórico registrado de esta placa
                        const firstVCurrent = t.vouchers[0] || {};
                        kmInicio = firstVCurrent.odometro || 0;
                        fechaInicio = firstVCurrent.fecha || 'N/D';
                    }

                    const recorridoKm = (kmFin > kmInicio && kmInicio > 0) ? (kmFin - kmInicio) : 0;
                    const odometroInconsistente = (kmInicio > 0 && kmFin > 0 && kmFin < kmInicio);
                    const rendimiento = (totalGal > 0 && recorridoKm > 0) ? (recorridoKm / totalGal) : 0;

                    // Lista de vales para el modal: incluir punto de partida si existe
                    const modalVouchers = voucherPartida ? [voucherPartida, ...t.vouchers] : [...t.vouchers];

                    trips.push({
                        viaje: t.viaje,
                        placa: t.placa,
                        ruta: t.ruta,
                        fechaInicio,
                        fechaFin,
                        kmInicio,
                        kmFin,
                        recorridoKm,
                        odometroInconsistente,
                        pesoMaxTn: maxPeso,
                        totalGalones: totalGal,
                        totalGasto: totalCost,
                        rendimiento,
                        vouchers: modalVouchers,
                        vouchersPropiosCount: t.vouchers.length
                    });
                });
            });

            // Ordenar viajes por fechaFin DESC por defecto
            trips.sort((a, b) => (b.fechaFin || '').localeCompare(a.fechaFin || ''));

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
    // 12. ⛽ DIRECTORIO DE ESTACIONES / GRIFOS (vw_combustible_estacion)
    // ============================================================
    router.get('/estaciones-catalogo', async (req, res) => {
        try {
            const rdb = getRemoteDb();
            const [rows] = await rdb.query(
                `SELECT * FROM vw_combustible_estacion ORDER BY estacion_nombre ASC`
            );
            res.json({ ok: true, data: rows || [] });
        } catch (err) {
            console.error("Error consultando catálogo de estaciones:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    return router;
};
