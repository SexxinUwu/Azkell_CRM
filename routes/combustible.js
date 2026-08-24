const express = require('express');

module.exports = function (db, broadcast, logAudit) {
    const router = express.Router();

    function getDb(req) {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    }

    const _tenantsInitSet = new Set();

    const TABLE_SQL = `CREATE TABLE IF NOT EXISTS combustible_vales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fecha DATETIME NOT NULL,
        estado VARCHAR(30) NOT NULL DEFAULT 'VÁLIDO',
        correlativo VARCHAR(50) NOT NULL DEFAULT '',
        estado_pago VARCHAR(30) NOT NULL DEFAULT 'NO PAGADO',
        viaje VARCHAR(50) NOT NULL DEFAULT '',
        caja VARCHAR(50) NOT NULL DEFAULT '',
        estado_caja VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
        clase_vehiculo VARCHAR(50) NOT NULL DEFAULT 'TRACTO',
        vehiculo VARCHAR(20) NOT NULL DEFAULT '',
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
        INDEX idx_estado (estado)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

    async function ensureTables(req) {
        const tenantId = (req && req.tenantId) ? req.tenantId : 'default';
        if (_tenantsInitSet.has(tenantId)) return;
        try {
            const tdb = getDb(req);
            if (!tdb) return;
            await tdb.query(TABLE_SQL);
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

    // ============================================================
    // 1. 📋 LISTADO DE VALES CON PAGINACIÓN (50 REGISTROS/PÁG) Y FILTROS
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

            // Registros paginados
            const [rows] = await tdb.query(
                `SELECT * FROM combustible_vales 
                 ${whereSQL} 
                 ORDER BY fecha DESC, id DESC 
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
    // 2. ➕ REGISTRAR VALE INDIVIDUAL
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
    // 3. 📥 IMPORTACIÓN MASIVA DE VALES (FORMATO MARSISASOFT / EXCEL)
    // ============================================================
    router.post('/vales/importar-masivo', async (req, res) => {
        try {
            const tdb = getDb(req);
            const vales = Array.isArray(req.body.vales) ? req.body.vales : [];

            if (vales.length === 0) {
                return res.status(400).json({ ok: false, error: 'No se enviaron registros para importar.' });
            }

            // Normalizador de números (soporta formato con coma decimal tipo 552040,00)
            const parseNum = (v) => {
                if (typeof v === 'number') return v;
                if (!v) return 0;
                const clean = String(v).replace(/\s/g, '').replace(',', '.');
                const n = parseFloat(clean);
                return isNaN(n) ? 0 : n;
            };

            // Normalizador de fecha
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
    // 4. ✏️ ACTUALIZAR VALE
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
    // 5. 🗑️ ELIMINAR O ANULAR VALE INDIVIDUAL
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
    // 6. 🗑️ ELIMINACIÓN MASIVA DE VALES (SELECCIÓN POR CHECKBOX)
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
    // 7. 📊 ANÁLISIS DE COMBUSTIBLE: CONSOLIDADO DINÁMICO POR VIAJE
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

            // Obtener todos los vales que cumplen con el filtro para agrupar en memoria por viaje
            const [rows] = await tdb.query(
                `SELECT * FROM combustible_vales ${whereSQL} ORDER BY fecha ASC, id ASC`,
                params
            );

            const tripMap = {};

            rows.forEach(v => {
                const tripKey = v.viaje || 'SIN-VIAJE';
                if (!tripMap[tripKey]) {
                    tripMap[tripKey] = {
                        viaje: tripKey,
                        placa: v.vehiculo || 'SIN-PLACA',
                        ruta: v.ruta || 'Sin Ruta',
                        vouchers: []
                    };
                }
                tripMap[tripKey].vouchers.push({
                    id: v.id,
                    fecha: v.fecha ? new Date(v.fecha).toISOString().replace('T', ' ').slice(0, 19) : '',
                    producto: v.tipo_combustible || 'D2',
                    grifo: v.estacion || v.proveedor || 'Estación',
                    odometro: parseFloat(v.kilometraje || 0),
                    galones: parseFloat(v.galones || 0),
                    importe: parseFloat(v.importe || 0),
                    conductor: v.conductor || 'Sin Especificar',
                    correlativo: v.correlativo || '',
                    numero_comprobante: v.numero_comprobante || '',
                    tipo: v.tipo || ''
                });
            });

            const trips = Object.values(tripMap).map(t => {
                t.vouchers.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

                const firstV = t.vouchers[0] || {};
                const lastV = t.vouchers[t.vouchers.length - 1] || {};

                const totalGal = t.vouchers.reduce((s, x) => s + x.galones, 0);
                const totalCost = t.vouchers.reduce((s, x) => s + x.importe, 0);

                const validOdos = t.vouchers.map(x => x.odometro).filter(o => o > 0);
                const kmInicio = validOdos.length > 0 ? Math.min(...validOdos) : 0;
                const kmFin = validOdos.length > 0 ? Math.max(...validOdos) : 0;
                const recorridoKm = (kmFin > kmInicio) ? (kmFin - kmInicio) : 0;
                const rendimiento = (totalGal > 0 && recorridoKm > 0) ? (recorridoKm / totalGal) : 0;

                return {
                    viaje: t.viaje,
                    placa: t.placa || firstV.vehiculo,
                    ruta: t.ruta || firstV.ruta,
                    fechaInicio: firstV.fecha || 'N/D',
                    fechaFin: lastV.fecha || 'N/D',
                    kmInicio,
                    kmFin,
                    recorridoKm,
                    totalGalones: totalGal,
                    totalGasto: totalCost,
                    rendimiento,
                    vouchers: t.vouchers
                };
            });

            // Resumen global de KPIs
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
    // 8. 🗂️ CATÁLOGOS ÚNICOS PARA FILTROS
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

    return router;
};
