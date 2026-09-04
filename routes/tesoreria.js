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
                fecha_servicio DATE NULL,
                razon_social VARCHAR(150) NOT NULL DEFAULT '',
                placa_camion VARCHAR(50) NOT NULL DEFAULT '',
                placa_carreta VARCHAR(50) NOT NULL DEFAULT '',
                conductor VARCHAR(150) NOT NULL DEFAULT '',
                cliente VARCHAR(150) NOT NULL DEFAULT '',
                lugar VARCHAR(150) NOT NULL DEFAULT '',
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
                "ALTER TABLE tesoreria_cuentas ADD COLUMN placa_camion VARCHAR(50) NOT NULL DEFAULT '' AFTER razon_social",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN placa_carreta VARCHAR(50) NOT NULL DEFAULT '' AFTER placa_camion",
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
            if (val.includes('/')) {
                const parts = val.split('/');
                if (parts.length === 3) {
                    const day = parts[0].padStart(2, '0');
                    const month = parts[1].padStart(2, '0');
                    let year = parts[2];
                    if (year.length === 2) year = '20' + year;
                    return `${year}-${month}-${day}`;
                }
            }
            if (val.includes('-')) {
                const parts = val.split('-');
                if (parts.length === 3) {
                    if (parts[0].length === 4) return val.slice(0, 10);
                    const day = parts[0].padStart(2, '0');
                    const month = parts[1].padStart(2, '0');
                    let year = parts[2];
                    if (year.length === 2) year = '20' + year;
                    return `${year}-${month}-${day}`;
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
            const raw = String(placaRaw).toUpperCase().trim();
            if (raw.includes('-') && raw.length >= 13) {
                const parts = raw.split(/[\/\s-]+/).filter(Boolean);
                if (parts.length >= 2) {
                    cam = parts[0];
                    car = parts[1];
                } else {
                    cam = raw;
                }
            } else if (raw.includes('/')) {
                const parts = raw.split('/').map(p => p.trim());
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
                    DATE_FORMAT(fecha_servicio, '%Y-%m-%d') AS fecha_servicio,
                    razon_social,
                    placa_camion,
                    placa_carreta,
                    conductor,
                    cliente,
                    lugar,
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
                params.push(term, term, term, term, term, term, term, term, term, term);
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
                    codigo_liquidacion, fecha_liquidacion, fecha_servicio, razon_social,
                    placa_camion, placa_carreta, conductor, cliente, lugar,
                    tarifa, gastos_operativos, base_imponible, igv, total, adelanto, detraccion, neto_cobrar,
                    mes_facturacion, fecha_factura, serie, factura, credito_dias, fecha_cobrar, fecha_deposito,
                    estado_servicio, diferencia, observacion, documento_url
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                (b.codigo_liquidacion || '').trim(),
                safeDate(b.fecha_liquidacion),
                safeDate(b.fecha_servicio),
                (b.razon_social || '').trim(),
                cam,
                car,
                (b.conductor || '').trim(),
                (b.cliente || '').trim(),
                (b.lugar || '').trim(),
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
                parseInt(b.credito_dias, 10) || 0,
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
                    fecha_servicio = ?,
                    razon_social = ?,
                    placa_camion = ?,
                    placa_carreta = ?,
                    conductor = ?,
                    cliente = ?,
                    lugar = ?,
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
                safeDate(b.fecha_servicio),
                (b.razon_social || '').trim(),
                cam,
                car,
                (b.conductor || '').trim(),
                (b.cliente || '').trim(),
                (b.lugar || '').trim(),
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
                parseInt(b.credito_dias, 10) || 0,
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
            console.error('Error al actualizar registro de tesoreria:', err);
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
                    codigo_liquidacion, fecha_liquidacion, fecha_servicio, razon_social,
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

    return router;
};
