const express = require('express');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB max
const { uploadToS3, deleteFromS3, s3KeyFromUrl, getPresignedUrl } = require('../utils/s3');

module.exports = function (db, broadcast, logAudit) {
    const router = express.Router();

    function getDb(req) {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    }

    const _tenantsInitSet = new Set();

    async function ensureTable(req) {
        const tenantSlug = req.tenantSlug || 'default';
        if (_tenantsInitSet.has(tenantSlug)) return;

        const tdb = getDb(req);
        if (!tdb) return;

        const createSql = `
            CREATE TABLE IF NOT EXISTS tesoreria_cuentas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                codigo_liquidacion VARCHAR(60) NOT NULL DEFAULT '',
                fecha_liquidacion DATE NULL,
                numero_viaje VARCHAR(60) NOT NULL DEFAULT '',
                fecha_servicio DATE NULL,
                razon_social VARCHAR(150) NOT NULL DEFAULT '',
                placa_camion VARCHAR(50) NOT NULL DEFAULT '',
                placa_carreta VARCHAR(50) NOT NULL DEFAULT '',
                conductor VARCHAR(150) NOT NULL DEFAULT '',
                cliente VARCHAR(150) NOT NULL DEFAULT '',
                lugar VARCHAR(150) NOT NULL DEFAULT '',
                flete DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                comision_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 10.00,
                tarifa DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                gastos_operativos DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                base_imponible DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                igv DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                adelanto DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                detraccion DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                neto_cobrar DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                mes_facturacion VARCHAR(50) NOT NULL DEFAULT '',
                fecha_factura DATE NULL,
                serie VARCHAR(30) NOT NULL DEFAULT '',
                factura VARCHAR(50) NOT NULL DEFAULT '',
                credito_dias INT NOT NULL DEFAULT 0,
                fecha_cobrar DATE NULL,
                fecha_deposito DATE NULL,
                estado_servicio VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
                diferencia DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                observacion TEXT NULL,
                documento_url TEXT NULL,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_cod_liq (codigo_liquidacion),
                INDEX idx_fecha_liq (fecha_liquidacion),
                INDEX idx_num_viaje (numero_viaje),
                INDEX idx_factura (serie, factura),
                INDEX idx_placa_cam (placa_camion),
                INDEX idx_placa_car (placa_carreta),
                INDEX idx_cliente (cliente),
                INDEX idx_estado (estado_servicio)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        try {
            await tdb.query(createSql);
            // Migraciones de columnas en tablas existentes si faltan
            const migraciones = [
                "ALTER TABLE tesoreria_cuentas ADD COLUMN codigo_liquidacion VARCHAR(60) NOT NULL DEFAULT '' AFTER id",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN numero_viaje VARCHAR(60) NOT NULL DEFAULT '' AFTER fecha_liquidacion",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN placa_camion VARCHAR(50) NOT NULL DEFAULT '' AFTER razon_social",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN placa_carreta VARCHAR(50) NOT NULL DEFAULT '' AFTER placa_camion",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN flete DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER lugar",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN comision_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 10.00 AFTER flete",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN documento_url TEXT NULL AFTER observacion"
            ];
            for (const mig of migraciones) {
                try { await tdb.query(mig); } catch(e){}
            }
            _tenantsInitSet.add(tenantSlug);
        } catch (e) {
            console.warn(`[Tesorería] Error verificando tabla tesoreria_cuentas (${tenantSlug}):`, e.message);
        }
    }

    function safeDate(val) {
        if (!val) return null;
        if (typeof val === 'string') {
            val = val.trim();
            if (!val || val === '-' || val === '—') return null;

            // Si viene un rango de fechas como '6/04/2026-23/04/26' o '23/04/26 - 07/05/26', tomar la primera fecha
            if (val.includes(' - ') || (val.includes('/') && val.indexOf('/') !== val.lastIndexOf('/') && val.match(/\d+[\/\-]\d+[\/\-]\d+.*[\/\-]\d+/))) {
                const firstMatch = val.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
                if (firstMatch) val = firstMatch[1];
            }

            // Formato DD/MM/YYYY o DD/MM/YY
            if (val.includes('/')) {
                const parts = val.split('/');
                if (parts.length === 3) {
                    const p0 = parseInt(parts[0], 10);
                    const p1 = parseInt(parts[1], 10);
                    let year = parts[2].trim();
                    if (year.length === 2) year = '20' + year;
                    const day = String(p0).padStart(2, '0');
                    const month = String(p1).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                }
            }

            // Formato YYYY-MM-DD o YYYY-DD-MM o DD-MM-YYYY
            if (val.includes('-')) {
                const parts = val.split('-').map(p => p.trim());
                if (parts.length === 3) {
                    if (parts[0].length === 4) {
                        const year = parts[0];
                        const p1 = parseInt(parts[1], 10);
                        const p2 = parseInt(parts[2], 10);
                        // Si p1 > 12, vino como YYYY-DD-MM (ej: 2026-20-02) -> invertir a YYYY-MM-DD
                        if (p1 > 12) {
                            return `${year}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
                        }
                        return `${year}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
                    } else {
                        const day = parts[0].padStart(2, '0');
                        const month = parts[1].padStart(2, '0');
                        let year = parts[2];
                        if (year.length === 2) year = '20' + year;
                        return `${year}-${month}-${day}`;
                    }
                }
            }
        }
        if (val instanceof Date && !isNaN(val.getTime())) {
            return val.toISOString().slice(0, 10);
        }
        return null;
    }

    function safeNum(val) {
        if (val == null || val === '') return 0.0;
        if (typeof val === 'number') return isNaN(val) ? 0.0 : val;
        let str = String(val).trim();
        if (str.includes('.') && str.includes(',')) {
            str = str.replace(/\./g, '').replace(',', '.');
        } else if (str.includes(',')) {
            str = str.replace(',', '.');
        }
        const num = parseFloat(str);
        return isNaN(num) ? 0.0 : num;
    }

    function parsePlacas(placaRaw, placaCamionRaw, placaCarretaRaw) {
        let cam = (placaCamionRaw || '').toUpperCase().trim();
        let car = (placaCarretaRaw || '').toUpperCase().trim();

        if (!cam && !car && placaRaw) {
            let raw = String(placaRaw).toUpperCase().trim();
            // Casos como "ANULADO", "PLACA TRAHESA", "MOTORIZADO" o placas simples
            if (raw.includes('-')) {
                const parts = raw.split('-').map(p => p.trim()).filter(Boolean);
                if (parts.length >= 2) {
                    cam = parts[0];
                    car = parts[1];
                } else if (parts.length === 1) {
                    cam = parts[0];
                }
            } else if (raw.includes('/')) {
                const parts = raw.split('/').map(p => p.trim()).filter(Boolean);
                cam = parts[0] || '';
                car = parts[1] || '';
            } else if (raw.includes(' ') && raw.length >= 12) {
                const parts = raw.split(/\s+/).map(p => p.trim()).filter(Boolean);
                cam = parts[0] || '';
                car = parts[1] || '';
            } else {
                cam = raw;
            }
        }
        return { cam, car };
    }

    // ── GET /api/tesoreria/cuentas (Listar registros con presigned URLs para PDFs/Imágenes) ──
    router.get('/cuentas', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const { buscar, estado, mes } = req.query;
            let sql = `
                SELECT 
                    id,
                    codigo_liquidacion,
                    DATE_FORMAT(fecha_liquidacion, '%Y-%m-%d') AS fecha_liquidacion,
                    numero_viaje,
                    DATE_FORMAT(fecha_servicio, '%Y-%m-%d') AS fecha_servicio,
                    razon_social,
                    placa_camion,
                    placa_carreta,
                    conductor,
                    cliente,
                    lugar,
                    flete,
                    comision_porcentaje,
                    tarifa,
                    gastos_operativos,
                    base_imponible,
                    igv,
                    total,
                    adelanto,
                    detraccion,
                    neto_cobrar,
                    mes_facturacion,
                    DATE_FORMAT(fecha_factura, '%Y-%m-%d') AS fecha_factura,
                    serie,
                    factura,
                    credito_dias,
                    DATE_FORMAT(fecha_cobrar, '%Y-%m-%d') AS fecha_cobrar,
                    DATE_FORMAT(fecha_deposito, '%Y-%m-%d') AS fecha_deposito,
                    estado_servicio,
                    diferencia,
                    observacion,
                    documento_url,
                    creado_en,
                    actualizado_en
                FROM tesoreria_cuentas
                WHERE 1=1
            `;
            const params = [];

            if (estado && estado !== 'TODOS') {
                sql += ` AND UPPER(estado_servicio) = UPPER(?)`;
                params.push(estado);
            }

            if (mes && mes !== 'TODOS') {
                sql += ` AND UPPER(mes_facturacion) = UPPER(?)`;
                params.push(mes);
            }

            if (buscar && buscar.trim()) {
                const term = `%${buscar.trim()}%`;
                sql += ` AND (
                    codigo_liquidacion LIKE ? OR
                    numero_viaje LIKE ? OR
                    razon_social LIKE ? OR 
                    placa_camion LIKE ? OR 
                    placa_carreta LIKE ? OR 
                    conductor LIKE ? OR 
                    cliente LIKE ? OR 
                    factura LIKE ? OR 
                    serie LIKE ? OR
                    lugar LIKE ? OR
                    observacion LIKE ?
                )`;
                params.push(term, term, term, term, term, term, term, term, term, term, term);
            }

            sql += ` ORDER BY fecha_liquidacion DESC, id DESC LIMIT 5000`;

            const [rows] = await tdb.query(sql, params);

            // Generar presigned URLs para ver archivos de S3 de manera segura
            for (let r of rows) {
                if (r.documento_url && r.documento_url.includes('amazonaws.com')) {
                    try {
                        const key = s3KeyFromUrl(r.documento_url);
                        if (key) {
                            r.documento_view_url = await getPresignedUrl(key, 7200);
                        }
                    } catch(e) {
                        r.documento_view_url = r.documento_url;
                    }
                } else if (r.documento_url) {
                    r.documento_view_url = r.documento_url;
                }
            }

            res.json({ ok: true, data: rows || [] });
        } catch (err) {
            console.error('Error al listar cuentas tesoreria:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/tesoreria/cuentas (Crear registro individual con archivo opcional) ──
    router.post('/cuentas', upload.single('archivo_adjunto'), async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const b = req.body || {};
            const { cam, car } = parsePlacas(b.placa, b.placa_camion, b.placa_carreta);

            let docUrl = b.documento_url || null;

            // Si se subió un archivo (PDF o Imagen)
            if (req.file) {
                const ext = (req.file.originalname || '').split('.').pop() || 'pdf';
                const s3Key = `tesoreria/liquidaciones/liq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
                docUrl = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
            }

            const insertSql = `
                INSERT INTO tesoreria_cuentas (
                    codigo_liquidacion, fecha_liquidacion, numero_viaje, fecha_servicio, razon_social,
                    placa_camion, placa_carreta, conductor, cliente, lugar,
                    flete, comision_porcentaje,
                    tarifa, gastos_operativos, base_imponible, igv, total, adelanto, detraccion, neto_cobrar,
                    mes_facturacion, fecha_factura, serie, factura, credito_dias, fecha_cobrar, fecha_deposito,
                    estado_servicio, diferencia, observacion, documento_url
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                (b.codigo_liquidacion || '').trim(),
                safeDate(b.fecha_liquidacion),
                (b.numero_viaje || '').trim(),
                safeDate(b.fecha_servicio),
                (b.razon_social || '').trim(),
                cam,
                car,
                (b.conductor || '').trim(),
                (b.cliente || '').trim(),
                (b.lugar || '').trim(),
                safeNum(b.flete),
                b.comision_porcentaje !== undefined && b.comision_porcentaje !== '' ? safeNum(b.comision_porcentaje) : 10.0,
                safeNum(b.tarifa),
                safeNum(b.gastos_operativos),
                safeNum(b.base_imponible),
                safeNum(b.igv),
                safeNum(b.total),
                safeNum(b.adelanto),
                safeNum(b.detraccion),
                safeNum(b.neto_cobrar),
                (b.mes_facturacion || '').trim(),
                safeDate(b.fecha_factura),
                (b.serie || '').trim(),
                (b.factura || '').trim(),
                parseInt(b.credito_dias, 10) || 15,
                safeDate(b.fecha_cobrar),
                safeDate(b.fecha_deposito),
                (b.estado_servicio || 'PENDIENTE').toUpperCase().trim(),
                safeNum(b.diferencia),
                (b.observacion || '').trim(),
                docUrl
            ];

            const [result] = await tdb.query(insertSql, values);

            if (typeof logAudit === 'function') {
                logAudit(req, 'TESORERIA', 'CUENTAS', 'CREO', `Creó registro liquidación ${b.codigo_liquidacion} factura ${b.serie}-${b.factura}`);
            }

            res.json({ ok: true, id: result.insertId, documento_url: docUrl, message: 'Registro creado exitosamente' });
        } catch (err) {
            console.error('Error al crear registro de tesoreria:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── PUT /api/tesoreria/cuentas/:id (Editar registro con archivo opcional) ──
    router.put('/cuentas/:id', upload.single('archivo_adjunto'), async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const id = req.params.id;
            const b = req.body || {};
            const { cam, car } = parsePlacas(b.placa, b.placa_camion, b.placa_carreta);

            let docUrl = b.documento_url || null;

            if (req.file) {
                const ext = (req.file.originalname || '').split('.').pop() || 'pdf';
                const s3Key = `tesoreria/liquidaciones/liq_${id}_${Date.now()}.${ext}`;
                docUrl = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
            }

            const updateSql = `
                UPDATE tesoreria_cuentas SET
                    codigo_liquidacion = ?,
                    fecha_liquidacion = ?,
                    numero_viaje = ?,
                    fecha_servicio = ?,
                    razon_social = ?,
                    placa_camion = ?,
                    placa_carreta = ?,
                    conductor = ?,
                    cliente = ?,
                    lugar = ?,
                    flete = ?,
                    comision_porcentaje = ?,
                    tarifa = ?,
                    gastos_operativos = ?,
                    base_imponible = ?,
                    igv = ?,
                    total = ?,
                    adelanto = ?,
                    detraccion = ?,
                    neto_cobrar = ?,
                    mes_facturacion = ?,
                    fecha_factura = ?,
                    serie = ?,
                    factura = ?,
                    credito_dias = ?,
                    fecha_cobrar = ?,
                    fecha_deposito = ?,
                    estado_servicio = ?,
                    diferencia = ?,
                    observacion = ?,
                    documento_url = COALESCE(?, documento_url)
                WHERE id = ?
            `;

            const values = [
                (b.codigo_liquidacion || '').trim(),
                safeDate(b.fecha_liquidacion),
                (b.numero_viaje || '').trim(),
                safeDate(b.fecha_servicio),
                (b.razon_social || '').trim(),
                cam,
                car,
                (b.conductor || '').trim(),
                (b.cliente || '').trim(),
                (b.lugar || '').trim(),
                safeNum(b.flete),
                b.comision_porcentaje !== undefined && b.comision_porcentaje !== '' ? safeNum(b.comision_porcentaje) : 10.0,
                safeNum(b.tarifa),
                safeNum(b.gastos_operativos),
                safeNum(b.base_imponible),
                safeNum(b.igv),
                safeNum(b.total),
                safeNum(b.adelanto),
                safeNum(b.detraccion),
                safeNum(b.neto_cobrar),
                (b.mes_facturacion || '').trim(),
                safeDate(b.fecha_factura),
                (b.serie || '').trim(),
                (b.factura || '').trim(),
                parseInt(b.credito_dias, 10) || 15,
                safeDate(b.fecha_cobrar),
                safeDate(b.fecha_deposito),
                (b.estado_servicio || 'PENDIENTE').toUpperCase().trim(),
                safeNum(b.diferencia),
                (b.observacion || '').trim(),
                docUrl,
                id
            ];

            await tdb.query(updateSql, values);

            if (typeof logAudit === 'function') {
                logAudit(req, 'TESORERIA', 'CUENTAS', 'MODIFICO', `Modificó registro ID ${id} liquidación ${b.codigo_liquidacion}`);
            }

            res.json({ ok: true, documento_url: docUrl, message: 'Registro actualizado exitosamente' });
        } catch (err) {
            console.error('Error al editar registro tesoreria:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── PATCH /api/tesoreria/cuentas/:id/toggle-estado (Cambio rápido de estado) ──
    router.patch('/cuentas/:id/toggle-estado', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const id = req.params.id;
            const nuevoEstado = (req.body.estado_servicio || 'PENDIENTE').toUpperCase().trim();

            await tdb.query('UPDATE tesoreria_cuentas SET estado_servicio = ? WHERE id = ?', [nuevoEstado, id]);

            if (typeof logAudit === 'function') {
                logAudit(req, 'TESORERIA', 'CUENTAS', 'CAMBIO_ESTADO', `Cambió estado a ${nuevoEstado} en registro ID ${id}`);
            }

            res.json({ ok: true, nuevoEstado, message: 'Estado actualizado correctamente' });
        } catch (err) {
            console.error('Error al cambiar estado de cuenta:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── DELETE /api/tesoreria/cuentas/:id (Eliminar registro) ───────────
    router.delete('/cuentas/:id', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const id = req.params.id;
            const [rows] = await tdb.query('SELECT documento_url FROM tesoreria_cuentas WHERE id = ?', [id]);
            await tdb.query('DELETE FROM tesoreria_cuentas WHERE id = ?', [id]);

            if (rows && rows[0] && rows[0].documento_url && rows[0].documento_url.includes('amazonaws.com')) {
                const key = s3KeyFromUrl(rows[0].documento_url);
                if (key) deleteFromS3(key).catch(() => {});
            }

            if (typeof logAudit === 'function') {
                logAudit(req, 'TESORERIA', 'CUENTAS', 'ELIMINO', `Eliminó registro ID ${id}`);
            }

            res.json({ ok: true, message: 'Registro eliminado exitosamente' });
        } catch (err) {
            console.error('Error al eliminar registro de tesoreria:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/tesoreria/cuentas/importar-masivo ──────────────────────
    router.post('/cuentas/importar-masivo', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const filas = req.body.filas || [];
            if (!Array.isArray(filas) || filas.length === 0) {
                return res.status(400).json({ error: 'No se enviaron filas para importar.' });
            }

            const insertSql = `
                INSERT INTO tesoreria_cuentas (
                    codigo_liquidacion, fecha_liquidacion, numero_viaje, fecha_servicio, razon_social,
                    placa_camion, placa_carreta, conductor, cliente, lugar,
                    tarifa, gastos_operativos, base_imponible, igv, total, adelanto, detraccion, neto_cobrar,
                    mes_facturacion, fecha_factura, serie, factura, credito_dias, fecha_cobrar, fecha_deposito,
                    estado_servicio, diferencia, observacion, documento_url
                ) VALUES ?
            `;

            const batchSize = 100;
            let insertados = 0;

            for (let i = 0; i < filas.length; i += batchSize) {
                const chunk = filas.slice(i, i + batchSize);
                const values = chunk.map(r => {
                    const { cam, car } = parsePlacas(r.placa, r.placa_camion, r.placa_carreta);
                    return [
                        (r.codigo_liquidacion || '').trim(),
                        safeDate(r.fecha_liquidacion),
                        (r.numero_viaje || '').trim(),
                        safeDate(r.fecha_servicio),
                        (r.razon_social || '').trim(),
                        cam,
                        car,
                        (r.conductor || '').trim(),
                        (r.cliente || '').trim(),
                        (r.lugar || '').trim(),
                        safeNum(r.tarifa),
                        safeNum(r.gastos_operativos),
                        safeNum(r.base_imponible),
                        safeNum(r.igv),
                        safeNum(r.total),
                        safeNum(r.adelanto),
                        safeNum(r.detraccion),
                        safeNum(r.neto_cobrar),
                        (r.mes_facturacion || '').trim(),
                        safeDate(r.fecha_factura),
                        (r.serie || '').trim(),
                        (r.factura || '').trim(),
                        parseInt(r.credito_dias, 10) || 0,
                        safeDate(r.fecha_cobrar),
                        safeDate(r.fecha_deposito),
                        (r.estado_servicio || 'PENDIENTE').toUpperCase().trim(),
                        safeNum(r.diferencia),
                        (r.observacion || '').trim(),
                        r.documento_url || null
                    ];
                });

                await tdb.query(insertSql, [values]);
                insertados += values.length;
            }

            if (typeof logAudit === 'function') {
                logAudit(req, 'TESORERIA', 'CUENTAS', 'IMPORTACION_EXCEL', `Importación masiva de ${insertados} registros en Cuentas por Cobrar/Pagar`);
            }

            res.json({ ok: true, insertados, message: `Se importaron ${insertados} registros correctamente.` });
        } catch (err) {
            console.error('Error en importación masiva de tesorería:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── GESTIÓN DE CAJA (TESORERÍA) ──────────────────────────────────
    async function ensureTableCaja(req) {
        const tenantSlug = req.tenantSlug || 'default';
        const tdb = getDb(req);
        if (!tdb) return;

        const createSql = `
            CREATE TABLE IF NOT EXISTS tesoreria_caja (
                id INT AUTO_INCREMENT PRIMARY KEY,
                fecha DATE NOT NULL,
                hora VARCHAR(10) NOT NULL DEFAULT '00:00:00',
                fecha_valuta DATE NULL,
                hora_valuta VARCHAR(10) NULL,
                numero_constancia_deposito VARCHAR(100) NULL,
                numero_factura VARCHAR(100) NULL,
                serie VARCHAR(50) NOT NULL DEFAULT '2026',
                numero VARCHAR(50) NOT NULL DEFAULT '',
                orden_viaje VARCHAR(100) NULL,
                conductor VARCHAR(150) NULL,
                ruta_viaje VARCHAR(255) NULL,
                placa VARCHAR(50) NULL,
                autoriza VARCHAR(150) NOT NULL,
                motivo VARCHAR(150) NOT NULL,
                sub_motivo VARCHAR(150) NULL,
                modalidad_pago VARCHAR(100) NOT NULL,
                moneda VARCHAR(20) NOT NULL DEFAULT 'SOLES',
                tipo_persona VARCHAR(50) NOT NULL,
                persona VARCHAR(200) NOT NULL,
                tipo_movimiento VARCHAR(20) NOT NULL DEFAULT 'EGRESO',
                subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                retencion_detraccion DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                importe_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                tipo_cambio DECIMAL(8,4) NOT NULL DEFAULT 1.0000,
                descripcion TEXT NOT NULL,
                tipo_comprobante VARCHAR(100) NULL,
                cuenta_bancaria_persona VARCHAR(200) NULL,
                cuenta_bancaria_empresa VARCHAR(200) NULL,
                voucher_url TEXT NULL,
                sustento_url TEXT NULL,
                observacion TEXT NULL,
                no_aplica_liquidacion TINYINT(1) NOT NULL DEFAULT 0,
                estado VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
                comentario TEXT NULL,
                usuario_creacion VARCHAR(150) NULL,
                usuario_aprobacion VARCHAR(150) NULL,
                fecha_aprobacion DATETIME NULL,
                motivo_anulacion TEXT NULL,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_caja_fecha (fecha),
                INDEX idx_caja_estado (estado),
                INDEX idx_caja_numero (serie, numero),
                INDEX idx_caja_orden (orden_viaje),
                INDEX idx_caja_placa (placa)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        try {
            await tdb.query(createSql);
        } catch (e) {
            console.warn(`[Tesorería Caja] Error verificando tabla tesoreria_caja (${tenantSlug}):`, e.message);
        }
    }

    // Correlativo automático para Caja
    router.get('/caja/siguiente-numero', async (req, res) => {
        try {
            await ensureTableCaja(req);
            const tdb = getDb(req);
            const serie = req.query.serie || String(new Date().getFullYear());
            const [rows] = await tdb.query(
                "SELECT numero FROM tesoreria_caja WHERE serie = ? ORDER BY id DESC LIMIT 1",
                [serie]
            );
            let nextNum = 1;
            if (rows.length && rows[0].numero) {
                const match = rows[0].numero.match(/\d+$/);
                if (match) nextNum = parseInt(match[0], 10) + 1;
            }
            const formatted = String(nextNum).padStart(8, '0');
            res.json({ ok: true, serie, numero: formatted });
        } catch (err) {
            console.error('Error al generar correlativo de caja:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Auxiliar: Listado de Órdenes de Viaje para autocompletar en Caja
    router.get('/caja/buscar-ordenes-viaje', async (req, res) => {
        try {
            const tdb = getDb(req);
            const q = (req.query.q || '').trim();
            let sql = `
                SELECT viaje, conductor, placa_tracto, placa_remolque, ruta, fecha_viaje
                FROM (
                    SELECT viaje, conductor, placa_tracto, placa_remolque, ruta, fecha_viaje FROM marsisa_ordenes_viaje
                    UNION
                    SELECT viaje, conductor, placa_tracto, placa_remolque, ruta, fecha_viaje FROM operaciones_ordenes_viaje
                ) AS u
                WHERE 1=1
            `;
            const params = [];
            if (q) {
                sql += ` AND (viaje LIKE ? OR conductor LIKE ? OR placa_tracto LIKE ? OR ruta LIKE ?)`;
                const term = `%${q}%`;
                params.push(term, term, term, term);
            }
            sql += ` ORDER BY fecha_viaje DESC LIMIT 50`;
            const [rows] = await tdb.query(sql, params);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error('Error al buscar órdenes de viaje para caja:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Listar movimientos de Caja con presigned URLs
    router.get('/caja', async (req, res) => {
        try {
            await ensureTableCaja(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const { fecha_desde, fecha_hasta, estado, buscar } = req.query;
            let sql = `
                SELECT 
                    id,
                    DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
                    hora,
                    DATE_FORMAT(fecha_valuta, '%Y-%m-%d') AS fecha_valuta,
                    hora_valuta,
                    numero_constancia_deposito,
                    numero_factura,
                    serie,
                    numero,
                    orden_viaje,
                    conductor,
                    ruta_viaje,
                    placa,
                    autoriza,
                    motivo,
                    sub_motivo,
                    modalidad_pago,
                    moneda,
                    tipo_persona,
                    persona,
                    tipo_movimiento,
                    subtotal,
                    retencion_detraccion,
                    importe_total,
                    tipo_cambio,
                    descripcion,
                    tipo_comprobante,
                    cuenta_bancaria_persona,
                    cuenta_bancaria_empresa,
                    voucher_url,
                    sustento_url,
                    observacion,
                    no_aplica_liquidacion,
                    estado,
                    comentario,
                    usuario_creacion,
                    usuario_aprobacion,
                    DATE_FORMAT(fecha_aprobacion, '%Y-%m-%d %H:%i') AS fecha_aprobacion,
                    motivo_anulacion,
                    creado_en
                FROM tesoreria_caja
                WHERE 1=1
            `;
            const params = [];

            if (fecha_desde) {
                sql += ` AND fecha >= ?`;
                params.push(safeDate(fecha_desde));
            }
            if (fecha_hasta) {
                sql += ` AND fecha <= ?`;
                params.push(safeDate(fecha_hasta));
            }
            if (estado && estado !== 'TODOS') {
                sql += ` AND UPPER(estado) = UPPER(?)`;
                params.push(estado);
            }
            if (buscar && buscar.trim()) {
                const term = `%${buscar.trim()}%`;
                sql += ` AND (
                    numero LIKE ? OR
                    orden_viaje LIKE ? OR
                    placa LIKE ? OR
                    motivo LIKE ? OR
                    sub_motivo LIKE ? OR
                    descripcion LIKE ? OR
                    persona LIKE ? OR
                    autoriza LIKE ? OR
                    numero_factura LIKE ?
                )`;
                params.push(term, term, term, term, term, term, term, term, term);
            }

            sql += ` ORDER BY fecha DESC, id DESC LIMIT 500`;

            const [rows] = await tdb.query(sql, params);

            // Generar presigned URLs para voucher y sustento
            for (const r of rows) {
                if (r.voucher_url && typeof getPresignedUrl === 'function') {
                    r.voucher_signed = await getPresignedUrl(r.voucher_url).catch(() => r.voucher_url);
                }
                if (r.sustento_url && typeof getPresignedUrl === 'function') {
                    r.sustento_signed = await getPresignedUrl(r.sustento_url).catch(() => r.sustento_url);
                }
            }

            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error('Error al listar movimientos de caja:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Guardar nuevo registro de Caja con archivos adjuntos
    router.post('/caja', upload.fields([{ name: 'voucher', maxCount: 1 }, { name: 'sustento', maxCount: 1 }]), async (req, res) => {
        try {
            await ensureTableCaja(req);
            const tdb = getDb(req);
            const b = req.body;

            let voucherUrl = null;
            if (req.files && req.files.voucher && req.files.voucher[0]) {
                const f = req.files.voucher[0];
                const ext = (f.originalname.split('.').pop() || 'png').toLowerCase();
                const key = `tesoreria/caja/voucher_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                voucherUrl = await uploadToS3(key, f.buffer, f.mimetype);
            }

            let sustentoUrl = null;
            if (req.files && req.files.sustento && req.files.sustento[0]) {
                const f = req.files.sustento[0];
                const ext = (f.originalname.split('.').pop() || 'pdf').toLowerCase();
                const key = `tesoreria/caja/sustento_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                sustentoUrl = await uploadToS3(key, f.buffer, f.mimetype);
            }

            // Calcular importe total y subtotal
            const impTotal = safeNum(b.importe_total);
            const retDet = safeNum(b.retencion_detraccion);
            const subTot = safeNum(b.subtotal) || Math.max(0, impTotal - retDet);

            const userCreator = (req.user && req.user.nombre) ? req.user.nombre : (b.usuario_creacion || 'Sistema');

            const insertSql = `
                INSERT INTO tesoreria_caja (
                    fecha, hora, fecha_valuta, hora_valuta,
                    numero_constancia_deposito, numero_factura, serie, numero,
                    orden_viaje, conductor, ruta_viaje, placa,
                    autoriza, motivo, sub_motivo, modalidad_pago, moneda,
                    tipo_persona, persona, tipo_movimiento, subtotal,
                    retencion_detraccion, importe_total, tipo_cambio, descripcion,
                    tipo_comprobante, cuenta_bancaria_persona, cuenta_bancaria_empresa,
                    voucher_url, sustento_url, observacion, no_aplica_liquidacion,
                    estado, usuario_creacion
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTRADO', ?)
            `;

            const [result] = await tdb.query(insertSql, [
                safeDate(b.fecha) || new Date().toISOString().slice(0, 10),
                (b.hora || '').trim() || new Date().toTimeString().slice(0, 8),
                safeDate(b.fecha_valuta) || safeDate(b.fecha) || new Date().toISOString().slice(0, 10),
                (b.hora_valuta || b.hora || '').trim() || new Date().toTimeString().slice(0, 8),
                (b.numero_constancia_deposito || '').trim(),
                (b.numero_factura || '').trim(),
                (b.serie || '2026').trim(),
                (b.numero || '').trim(),
                (b.orden_viaje || '').trim(),
                (b.conductor || '').trim(),
                (b.ruta_viaje || '').trim(),
                (b.placa || '').toUpperCase().trim(),
                (b.autoriza || '').trim(),
                (b.motivo || '').trim(),
                (b.sub_motivo || '').trim(),
                (b.modalidad_pago || '').trim(),
                (b.moneda || 'SOLES').trim(),
                (b.tipo_persona || '').trim(),
                (b.persona || '').trim(),
                (b.tipo_movimiento || 'EGRESO').trim(),
                subTot,
                retDet,
                impTotal,
                safeNum(b.tipo_cambio) || 1.0000,
                (b.descripcion || '').trim(),
                (b.tipo_comprobante || '').trim(),
                (b.cuenta_bancaria_persona || '').trim(),
                (b.cuenta_bancaria_empresa || '').trim(),
                voucherUrl,
                sustentoUrl,
                (b.observacion || '').trim(),
                b.no_aplica_liquidacion === '1' || b.no_aplica_liquidacion === 1 || b.no_aplica_liquidacion === true ? 1 : 0,
                userCreator
            ]);

            if (typeof logAudit === 'function') {
                logAudit(req, 'TESORERIA', 'CAJA', 'CREO', `Creó registro de caja Nº ${b.serie}-${b.numero} por S/ ${impTotal}`);
            }

            res.json({ ok: true, id: result.insertId, message: 'Registro de caja guardado con éxito' });
        } catch (err) {
            console.error('Error al guardar registro de caja:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Editar registro de caja (Solo si estado es REGISTRADO o PENDIENTE)
    router.put('/caja/:id', upload.fields([{ name: 'voucher', maxCount: 1 }, { name: 'sustento', maxCount: 1 }]), async (req, res) => {
        try {
            await ensureTableCaja(req);
            const tdb = getDb(req);
            const { id } = req.params;
            const b = req.body;

            const [rows] = await tdb.query('SELECT estado, voucher_url, sustento_url FROM tesoreria_caja WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });

            const estadoActual = (rows[0].estado || 'REGISTRADO').toUpperCase();
            if (estadoActual !== 'REGISTRADO' && estadoActual !== 'PENDIENTE') {
                return res.status(400).json({ error: 'No se puede editar una caja en estado ' + estadoActual });
            }

            let voucherUrl = rows[0].voucher_url;
            if (req.files && req.files['voucher'] && req.files['voucher'][0]) {
                const f = req.files['voucher'][0];
                const ext = (f.originalname.split('.').pop() || 'bin').toLowerCase();
                const key = `tesoreria/caja/voucher_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                voucherUrl = await uploadToS3(key, f.buffer, f.mimetype);
            }

            let sustentoUrl = rows[0].sustento_url;
            if (req.files && req.files['sustento'] && req.files['sustento'][0]) {
                const f = req.files['sustento'][0];
                const ext = (f.originalname.split('.').pop() || 'bin').toLowerCase();
                const key = `tesoreria/caja/sustento_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                sustentoUrl = await uploadToS3(key, f.buffer, f.mimetype);
            }

            const impTotal = safeNum(b.importe_total);
            const retDet = safeNum(b.retencion_detraccion);
            const subTot = safeNum(b.subtotal) || Math.max(0, impTotal - retDet);

            await tdb.query(`
                UPDATE tesoreria_caja SET
                    numero_constancia_deposito = ?,
                    numero_factura = ?,
                    orden_viaje = ?,
                    conductor = ?,
                    ruta_viaje = ?,
                    placa = ?,
                    autoriza = ?,
                    motivo = ?,
                    sub_motivo = ?,
                    modalidad_pago = ?,
                    moneda = ?,
                    tipo_persona = ?,
                    persona = ?,
                    subtotal = ?,
                    retencion_detraccion = ?,
                    importe_total = ?,
                    tipo_cambio = ?,
                    descripcion = ?,
                    tipo_comprobante = ?,
                    cuenta_bancaria_persona = ?,
                    cuenta_bancaria_empresa = ?,
                    voucher_url = ?,
                    sustento_url = ?,
                    observacion = ?,
                    no_aplica_liquidacion = ?
                WHERE id = ?
            `, [
                (b.numero_constancia_deposito || '').trim(),
                (b.numero_factura || '').trim(),
                (b.orden_viaje || '').trim(),
                (b.conductor || '').trim(),
                (b.ruta_viaje || '').trim(),
                (b.placa || '').toUpperCase().trim(),
                (b.autoriza || '').trim(),
                (b.motivo || '').trim(),
                (b.sub_motivo || '').trim(),
                (b.modalidad_pago || '').trim(),
                (b.moneda || 'SOLES').trim(),
                (b.tipo_persona || '').trim(),
                (b.persona || '').trim(),
                subTot,
                retDet,
                impTotal,
                safeNum(b.tipo_cambio) || 1.0000,
                (b.descripcion || '').trim(),
                (b.tipo_comprobante || '').trim(),
                (b.cuenta_bancaria_persona || '').trim(),
                (b.cuenta_bancaria_empresa || '').trim(),
                voucherUrl,
                sustentoUrl,
                (b.observacion || '').trim(),
                b.no_aplica_liquidacion === '1' || b.no_aplica_liquidacion === 1 || b.no_aplica_liquidacion === true ? 1 : 0,
                id
            ]);

            res.json({ ok: true, message: 'Registro de caja actualizado' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Cambiar estado a APROBADO
    router.post('/caja/:id/aprobar', async (req, res) => {
        try {
            await ensureTableCaja(req);
            const tdb = getDb(req);
            const { id } = req.params;
            const userName = (req.user && req.user.nombre) ? req.user.nombre : 'Administrador';

            const [rows] = await tdb.query('SELECT estado FROM tesoreria_caja WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });

            await tdb.query(`
                UPDATE tesoreria_caja SET
                    estado = 'APROBADO',
                    usuario_aprobacion = ?,
                    fecha_aprobacion = NOW()
                WHERE id = ?
            `, [userName, id]);

            res.json({ ok: true, message: 'Caja aprobada con éxito' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Subir documentos posteriores (Pasa estado a PROCESADO si ya estaba aprobado)
    router.post('/caja/:id/subir-documentos', upload.fields([{ name: 'voucher', maxCount: 1 }, { name: 'sustento', maxCount: 1 }]), async (req, res) => {
        try {
            await ensureTableCaja(req);
            const tdb = getDb(req);
            const { id } = req.params;
            const b = req.body;

            const [rows] = await tdb.query('SELECT estado, voucher_url, sustento_url FROM tesoreria_caja WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });

            let voucherUrl = rows[0].voucher_url;
            if (req.files && req.files['voucher'] && req.files['voucher'][0]) {
                const f = req.files['voucher'][0];
                const ext = (f.originalname.split('.').pop() || 'bin').toLowerCase();
                const key = `tesoreria/caja/voucher_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                voucherUrl = await uploadToS3(key, f.buffer, f.mimetype);
            }

            let sustentoUrl = rows[0].sustento_url;
            if (req.files && req.files['sustento'] && req.files['sustento'][0]) {
                const f = req.files['sustento'][0];
                const ext = (f.originalname.split('.').pop() || 'bin').toLowerCase();
                const key = `tesoreria/caja/sustento_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                sustentoUrl = await uploadToS3(key, f.buffer, f.mimetype);
            }

            const nuevoEstado = (rows[0].estado === 'APROBADO' || rows[0].estado === 'PROCESADO') ? 'PROCESADO' : rows[0].estado;

            await tdb.query(`
                UPDATE tesoreria_caja SET
                    numero_constancia_deposito = COALESCE(NULLIF(?, ''), numero_constancia_deposito),
                    numero_factura = COALESCE(NULLIF(?, ''), numero_factura),
                    voucher_url = ?,
                    sustento_url = ?,
                    estado = ?
                WHERE id = ?
            `, [
                (b.numero_constancia_deposito || '').trim(),
                (b.numero_factura || '').trim(),
                voucherUrl,
                sustentoUrl,
                nuevoEstado,
                id
            ]);

            res.json({ ok: true, message: 'Documentos adjuntados con éxito' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GESTIÓN DE BANCOS (TESORERÍA) ─────────────────────────────────
    router.get('/bancos', async (req, res) => {
        try {
            const tdb = getDb(req);
            const [rows] = await tdb.query('SELECT * FROM tesoreria_bancos ORDER BY banco ASC');
            res.json({ ok: true, data: rows });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/bancos', async (req, res) => {
        try {
            const tdb = getDb(req);
            const b = req.body;
            const [result] = await tdb.query(`
                INSERT INTO tesoreria_bancos (banco, titular, moneda, tipo_cuenta, numero_cuenta, cci, saldo_inicial, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                (b.banco || '').trim(),
                (b.titular || '').trim(),
                (b.moneda || 'SOLES').trim(),
                (b.tipo_cuenta || 'CORRIENTE').trim(),
                (b.numero_cuenta || '').trim(),
                (b.cci || '').trim(),
                safeNum(b.saldo_inicial) || 0,
                (b.estado || 'ACTIVO').trim()
            ]);
            res.json({ ok: true, id: result.insertId, message: 'Cuenta bancaria guardada' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/bancos/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            await tdb.query('DELETE FROM tesoreria_bancos WHERE id = ?', [req.params.id]);
            res.json({ ok: true, message: 'Cuenta bancaria eliminada' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Eliminar registro de caja
    router.delete('/caja/:id', async (req, res) => {
        try {
            await ensureTableCaja(req);
            const tdb = getDb(req);
            const { id } = req.params;
            const [rows] = await tdb.query('SELECT voucher_url, sustento_url FROM tesoreria_caja WHERE id = ?', [id]);
            await tdb.query('DELETE FROM tesoreria_caja WHERE id = ?', [id]);
            if (rows.length) {
                if (rows[0].voucher_url) deleteFromS3(s3KeyFromUrl(rows[0].voucher_url)).catch(() => {});
                if (rows[0].sustento_url) deleteFromS3(s3KeyFromUrl(rows[0].sustento_url)).catch(() => {});
            }
            res.json({ ok: true, message: 'Registro eliminado' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
