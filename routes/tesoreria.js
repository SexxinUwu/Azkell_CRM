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
                orden_servicio VARCHAR(60) NOT NULL DEFAULT '',
                fecha_servicio DATE NULL,
                razon_social VARCHAR(150) NOT NULL DEFAULT '',
                placa_camion VARCHAR(50) NOT NULL DEFAULT '',
                placa_carreta VARCHAR(50) NOT NULL DEFAULT '',
                conductor VARCHAR(150) NOT NULL DEFAULT '',
                cliente VARCHAR(150) NOT NULL DEFAULT '',
                lugar VARCHAR(150) NOT NULL DEFAULT '',
                flete DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                comision_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0.00,
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
                factura_documento_url TEXT NULL,
                nota_credito VARCHAR(60) NOT NULL DEFAULT '',
                nota_credito_url TEXT NULL,
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
                INDEX idx_os (orden_servicio),
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
                "ALTER TABLE tesoreria_cuentas ADD COLUMN orden_servicio VARCHAR(60) NOT NULL DEFAULT '' AFTER id",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN numero_viaje VARCHAR(60) NOT NULL DEFAULT '' AFTER fecha_liquidacion",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN placa_camion VARCHAR(50) NOT NULL DEFAULT '' AFTER razon_social",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN placa_carreta VARCHAR(50) NOT NULL DEFAULT '' AFTER placa_camion",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN flete DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER lugar",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN comision_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER flete",
                "ALTER TABLE tesoreria_cuentas ALTER COLUMN comision_porcentaje SET DEFAULT 0.00",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN documento_url TEXT NULL AFTER observacion",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN neto_cobrado DECIMAL(12,2) NULL DEFAULT NULL AFTER neto_cobrar",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN sustento_pago_url TEXT NULL AFTER documento_url",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN factura_documento_url TEXT NULL AFTER factura",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN nota_credito VARCHAR(60) NOT NULL DEFAULT '' AFTER factura_documento_url",
                "ALTER TABLE tesoreria_cuentas ADD COLUMN nota_credito_url TEXT NULL AFTER nota_credito"
            ];
            for (const mig of migraciones) {
                try { await tdb.query(mig); } catch(e){}
            }

            // Crear tabla de historial de notas de crédito y reemplazo de facturas
            await tdb.query(`CREATE TABLE IF NOT EXISTS tesoreria_cuentas_historial_facturas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cuenta_id INT NOT NULL,
                factura_anterior_serie VARCHAR(30) NOT NULL DEFAULT '',
                factura_anterior_numero VARCHAR(50) NOT NULL DEFAULT '',
                factura_anterior_url TEXT NULL,
                nota_credito_serie VARCHAR(30) NOT NULL DEFAULT '',
                nota_credito_numero VARCHAR(50) NOT NULL DEFAULT '',
                nota_credito_url TEXT NULL,
                motivo_anulacion VARCHAR(255) NOT NULL DEFAULT '',
                factura_nueva_serie VARCHAR(30) NOT NULL DEFAULT '',
                factura_nueva_numero VARCHAR(50) NOT NULL DEFAULT '',
                factura_nueva_url TEXT NULL,
                usuario_registro VARCHAR(150) NULL DEFAULT 'ADMINISTRADOR',
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_cuenta_id (cuenta_id),
                INDEX idx_nc (nota_credito_serie, nota_credito_numero)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

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
                    orden_servicio,
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
                    neto_cobrado,
                    mes_facturacion,
                    DATE_FORMAT(fecha_factura, '%Y-%m-%d') AS fecha_factura,
                    serie,
                    factura,
                    factura_documento_url,
                    nota_credito,
                    nota_credito_url,
                    credito_dias,
                    DATE_FORMAT(fecha_cobrar, '%Y-%m-%d') AS fecha_cobrar,
                    DATE_FORMAT(fecha_deposito, '%Y-%m-%d') AS fecha_deposito,
                    estado_servicio,
                    diferencia,
                    observacion,
                    documento_url,
                    sustento_pago_url,
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
                    orden_servicio LIKE ? OR
                    numero_viaje LIKE ? OR
                    razon_social LIKE ? OR 
                    placa_camion LIKE ? OR 
                    placa_carreta LIKE ? OR 
                    conductor LIKE ? OR 
                    cliente LIKE ? OR 
                    factura LIKE ? OR 
                    serie LIKE ? OR
                    nota_credito LIKE ? OR
                    lugar LIKE ? OR
                    observacion LIKE ?
                )`;
                params.push(term, term, term, term, term, term, term, term, term, term, term, term, term);
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

                if (r.sustento_pago_url && r.sustento_pago_url.includes('amazonaws.com')) {
                    try {
                        const key = s3KeyFromUrl(r.sustento_pago_url);
                        if (key) {
                            r.sustento_pago_view_url = await getPresignedUrl(key, 7200);
                        }
                    } catch(e) {
                        r.sustento_pago_view_url = r.sustento_pago_url;
                    }
                } else if (r.sustento_pago_url) {
                    r.sustento_pago_view_url = r.sustento_pago_url;
                }

                if (r.factura_documento_url && r.factura_documento_url.includes('amazonaws.com')) {
                    try {
                        const key = s3KeyFromUrl(r.factura_documento_url);
                        if (key) {
                            r.factura_documento_view_url = await getPresignedUrl(key, 7200);
                        }
                    } catch(e) {
                        r.factura_documento_view_url = r.factura_documento_url;
                    }
                } else if (r.factura_documento_url) {
                    r.factura_documento_view_url = r.factura_documento_url;
                }

                if (r.nota_credito_url && r.nota_credito_url.includes('amazonaws.com')) {
                    try {
                        const key = s3KeyFromUrl(r.nota_credito_url);
                        if (key) {
                            r.nota_credito_view_url = await getPresignedUrl(key, 7200);
                        }
                    } catch(e) {
                        r.nota_credito_view_url = r.nota_credito_url;
                    }
                } else if (r.nota_credito_url) {
                    r.nota_credito_view_url = r.nota_credito_url;
                }
            }

            res.json({ ok: true, data: rows || [] });
        } catch (err) {
            console.error('Error al listar cuentas tesoreria:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/tesoreria/cuentas (Crear registro individual con archivo opcional) ──
    router.post('/cuentas', upload.fields([{ name: 'archivo_adjunto', maxCount: 1 }, { name: 'archivo_factura', maxCount: 1 }]), async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const b = req.body || {};
            const { cam, car } = parsePlacas(b.placa, b.placa_camion, b.placa_carreta);

            let docUrl = b.documento_url || null;
            let facturaDocUrl = b.factura_documento_url || null;

            // Si se subió archivo de liquidación
            if (req.files && req.files['archivo_adjunto'] && req.files['archivo_adjunto'][0]) {
                const f = req.files['archivo_adjunto'][0];
                const ext = (f.originalname || '').split('.').pop() || 'pdf';
                const s3Key = `tesoreria/liquidaciones/liq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
                docUrl = await uploadToS3(f.buffer, s3Key, f.mimetype);
            }

            // Si se subió archivo de factura
            if (req.files && req.files['archivo_factura'] && req.files['archivo_factura'][0]) {
                const f = req.files['archivo_factura'][0];
                const ext = (f.originalname || '').split('.').pop() || 'pdf';
                const s3Key = `tesoreria/facturas/fac_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
                facturaDocUrl = await uploadToS3(f.buffer, s3Key, f.mimetype);
            }

            const insertSql = `
                INSERT INTO tesoreria_cuentas (
                    codigo_liquidacion, orden_servicio, fecha_liquidacion, numero_viaje, fecha_servicio, razon_social,
                    placa_camion, placa_carreta, conductor, cliente, lugar,
                    flete, comision_porcentaje,
                    tarifa, gastos_operativos, base_imponible, igv, total, adelanto, detraccion, neto_cobrar,
                    mes_facturacion, fecha_factura, serie, factura, factura_documento_url, credito_dias, fecha_cobrar, fecha_deposito,
                    estado_servicio, diferencia, observacion, documento_url
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                (b.codigo_liquidacion || '').trim(),
                (b.orden_servicio || '').trim(),
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
                b.comision_porcentaje !== undefined && b.comision_porcentaje !== '' ? safeNum(b.comision_porcentaje) : 0.0,
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
                facturaDocUrl,
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

            res.json({ ok: true, id: result.insertId, documento_url: docUrl, factura_documento_url: facturaDocUrl, message: 'Registro creado exitosamente' });
        } catch (err) {
            console.error('Error al crear registro de tesoreria:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── PUT /api/tesoreria/cuentas/:id (Editar registro con archivo opcional) ──
    router.put('/cuentas/:id', upload.fields([{ name: 'archivo_adjunto', maxCount: 1 }, { name: 'archivo_factura', maxCount: 1 }]), async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const id = req.params.id;
            const [existente] = await tdb.query('SELECT estado_servicio FROM tesoreria_cuentas WHERE id = ?', [id]);
            if (existente && existente[0] && (existente[0].estado_servicio || '').toUpperCase() === 'PAGADO') {
                return res.status(400).json({ error: 'El registro se encuentra en estado PAGADO y no puede ser editado.' });
            }

            const b = req.body || {};
            const { cam, car } = parsePlacas(b.placa, b.placa_camion, b.placa_carreta);

            let docUrl = b.documento_url || null;
            let facturaDocUrl = b.factura_documento_url || null;

            if (req.files && req.files['archivo_adjunto'] && req.files['archivo_adjunto'][0]) {
                const f = req.files['archivo_adjunto'][0];
                const ext = (f.originalname || '').split('.').pop() || 'pdf';
                const s3Key = `tesoreria/liquidaciones/liq_${id}_${Date.now()}.${ext}`;
                docUrl = await uploadToS3(f.buffer, s3Key, f.mimetype);
            }

            if (req.files && req.files['archivo_factura'] && req.files['archivo_factura'][0]) {
                const f = req.files['archivo_factura'][0];
                const ext = (f.originalname || '').split('.').pop() || 'pdf';
                const s3Key = `tesoreria/facturas/fac_${id}_${Date.now()}.${ext}`;
                facturaDocUrl = await uploadToS3(f.buffer, s3Key, f.mimetype);
            }

            const updateSql = `
                UPDATE tesoreria_cuentas SET
                    codigo_liquidacion = ?,
                    orden_servicio = ?,
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
                    documento_url = COALESCE(?, documento_url),
                    factura_documento_url = COALESCE(?, factura_documento_url)
                WHERE id = ?
            `;

            const values = [
                (b.codigo_liquidacion || '').trim(),
                (b.orden_servicio || '').trim(),
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
                b.comision_porcentaje !== undefined && b.comision_porcentaje !== '' ? safeNum(b.comision_porcentaje) : 0.0,
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
                facturaDocUrl,
                id
            ];

            await tdb.query(updateSql, values);

            if (typeof logAudit === 'function') {
                logAudit(req, 'TESORERIA', 'CUENTAS', 'MODIFICO', `Modificó registro ID ${id} liquidación ${b.codigo_liquidacion}`);
            }

            res.json({ ok: true, documento_url: docUrl, factura_documento_url: facturaDocUrl, message: 'Registro actualizado exitosamente' });
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
            const [existente] = await tdb.query('SELECT estado_servicio FROM tesoreria_cuentas WHERE id = ?', [id]);
            if (existente && existente[0] && (existente[0].estado_servicio || '').toUpperCase() === 'PAGADO') {
                return res.status(400).json({ error: 'El registro se encuentra en estado PAGADO y no puede ser eliminado.' });
            }

            const [rows] = await tdb.query('SELECT documento_url, sustento_pago_url FROM tesoreria_cuentas WHERE id = ?', [id]);
            await tdb.query('DELETE FROM tesoreria_cuentas WHERE id = ?', [id]);

            if (rows && rows[0]) {
                if (rows[0].documento_url && rows[0].documento_url.includes('amazonaws.com')) {
                    const key = s3KeyFromUrl(rows[0].documento_url);
                    if (key) deleteFromS3(key).catch(() => {});
                }
                if (rows[0].sustento_pago_url && rows[0].sustento_pago_url.includes('amazonaws.com')) {
                    const keyS = s3KeyFromUrl(rows[0].sustento_pago_url);
                    if (keyS) deleteFromS3(keyS).catch(() => {});
                }
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

    // ── POST /api/tesoreria/cuentas/:id/registrar-pago (Registrar Neto Cobrado, Fecha y Sustento) ──
    router.post('/cuentas/:id/registrar-pago', upload.single('archivo_sustento'), async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const id = req.params.id;
            const b = req.body || {};

            // Obtener datos actuales del registro
            const [rows] = await tdb.query('SELECT neto_cobrar, sustento_pago_url FROM tesoreria_cuentas WHERE id = ?', [id]);
            if (!rows || !rows.length) {
                return res.status(404).json({ error: 'Registro no encontrado' });
            }

            const netoCobrar = parseFloat(rows[0].neto_cobrar) || 0;
            const netoCobrado = parseFloat(b.neto_cobrado) || 0;
            const fechaDeposito = safeDate(b.fecha_deposito) || new Date().toISOString().slice(0, 10);
            const diferencia = netoCobrado - netoCobrar;

            let sustentoUrl = rows[0].sustento_pago_url || null;
            if (req.file) {
                const ext = (req.file.originalname || '').split('.').pop() || 'pdf';
                const s3Key = `tesoreria/sustentos_pago/sustento_${id}_${Date.now()}.${ext}`;
                sustentoUrl = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
            }

            await tdb.query(`
                UPDATE tesoreria_cuentas SET
                    neto_cobrado = ?,
                    fecha_deposito = ?,
                    diferencia = ?,
                    estado_servicio = 'PAGADO',
                    sustento_pago_url = COALESCE(?, sustento_pago_url)
                WHERE id = ?
            `, [netoCobrado, fechaDeposito, diferencia, sustentoUrl, id]);

            if (typeof logAudit === 'function') {
                logAudit(req, 'TESORERIA', 'CUENTAS', 'REGISTRO_PAGO', `Registró pago de S/ ${netoCobrado} para cuenta ID ${id}`);
            }

            res.json({
                ok: true,
                message: 'Pago registrado exitosamente. Estado cambiado a PAGADO.',
                neto_cobrado: netoCobrado,
                fecha_deposito: fechaDeposito,
                diferencia: diferencia,
                estado_servicio: 'PAGADO',
                sustento_pago_url: sustentoUrl
            });
        } catch (err) {
            console.error('Error al registrar pago en tesoreria:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/tesoreria/cuentas/:id/cambiar-factura-nc (Cambiar Factura emitiendo Nota de Crédito) ──
    router.post('/cuentas/:id/cambiar-factura-nc', upload.fields([
        { name: 'archivo_nc', maxCount: 1 },
        { name: 'archivo_nueva_factura', maxCount: 1 },
        { name: 'archivo_factura_anterior', maxCount: 1 }
    ]), async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const id = req.params.id;
            const b = req.body || {};

            const [rows] = await tdb.query('SELECT * FROM tesoreria_cuentas WHERE id = ?', [id]);
            if (!rows || !rows.length) {
                return res.status(404).json({ error: 'Registro de cuenta no encontrado' });
            }
            const actual = rows[0];

            const facAntSerie = (actual.serie || '').trim();
            const facAntNum = (actual.factura || '').trim();
            let facAntUrl = actual.factura_documento_url || null;

            if (req.files && req.files['archivo_factura_anterior'] && req.files['archivo_factura_anterior'][0]) {
                const f = req.files['archivo_factura_anterior'][0];
                const ext = (f.originalname || '').split('.').pop() || 'pdf';
                const s3Key = `tesoreria/facturas/fac_ant_${id}_${Date.now()}.${ext}`;
                facAntUrl = await uploadToS3(f.buffer, s3Key, f.mimetype);
            }

            const ncSerie = (b.nc_serie || '').trim().toUpperCase();
            const ncNumero = (b.nc_numero || '').trim();
            const motivo = (b.motivo_anulacion || '').trim();

            const nuevaSerie = (b.nueva_serie || '').trim().toUpperCase();
            const nuevoNumero = (b.nuevo_numero || '').trim();
            const nuevaFecha = safeDate(b.nueva_fecha_factura) || new Date().toISOString().slice(0, 10);

            if (!ncSerie || !ncNumero) {
                return res.status(400).json({ error: 'Debe especificar Serie y Número de la Nota de Crédito.' });
            }
            if (!motivo) {
                return res.status(400).json({ error: 'Debe indicar el motivo de la Nota de Crédito / cambio de factura.' });
            }
            if (!nuevaSerie || !nuevoNumero) {
                return res.status(400).json({ error: 'Debe especificar Serie y Número de la Nueva Factura.' });
            }

            let ncUrl = null;
            if (req.files && req.files['archivo_nc'] && req.files['archivo_nc'][0]) {
                const f = req.files['archivo_nc'][0];
                const ext = (f.originalname || '').split('.').pop() || 'pdf';
                const s3Key = `tesoreria/notas_credito/nc_${id}_${Date.now()}.${ext}`;
                ncUrl = await uploadToS3(f.buffer, s3Key, f.mimetype);
            }

            let nuevaFacUrl = null;
            if (req.files && req.files['archivo_nueva_factura'] && req.files['archivo_nueva_factura'][0]) {
                const f = req.files['archivo_nueva_factura'][0];
                const ext = (f.originalname || '').split('.').pop() || 'pdf';
                const s3Key = `tesoreria/facturas/fac_${id}_${Date.now()}.${ext}`;
                nuevaFacUrl = await uploadToS3(f.buffer, s3Key, f.mimetype);
            }

            // Registrar en historial de auditoría
            const userStr = (req.user && req.user.nombre) ? req.user.nombre : 'ADMINISTRADOR';
            await tdb.query(`
                INSERT INTO tesoreria_cuentas_historial_facturas (
                    cuenta_id, factura_anterior_serie, factura_anterior_numero, factura_anterior_url,
                    nota_credito_serie, nota_credito_numero, nota_credito_url, motivo_anulacion,
                    factura_nueva_serie, factura_nueva_numero, factura_nueva_url, usuario_registro
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id, facAntSerie, facAntNum, facAntUrl,
                ncSerie, ncNumero, ncUrl, motivo,
                nuevaSerie, nuevoNumero, nuevaFacUrl, userStr
            ]);

            // Actualizar la factura activa en tesoreria_cuentas y anexar nota de auditoría
            const obsActual = (actual.observacion || '').trim();
            const notaHistorial = `[NC ${ncSerie}-${ncNumero} reemplaza a ${facAntSerie}-${facAntNum} Motivo: ${motivo}]`;
            const obsFinal = obsActual ? `${obsActual} | ${notaHistorial}` : notaHistorial;
            const fullNc = `${ncSerie}-${ncNumero}`;

            await tdb.query(`
                UPDATE tesoreria_cuentas SET
                    serie = ?,
                    factura = ?,
                    fecha_factura = ?,
                    factura_documento_url = COALESCE(?, factura_documento_url),
                    nota_credito = ?,
                    nota_credito_url = COALESCE(?, nota_credito_url),
                    observacion = ?
                WHERE id = ?
            `, [nuevaSerie, nuevoNumero, nuevaFecha, nuevaFacUrl, fullNc, ncUrl, obsFinal, id]);

            if (typeof logAudit === 'function') {
                logAudit(req, 'TESORERIA', 'CUENTAS', 'CAMBIO_FACTURA_NC', `Emitió NC ${fullNc} anulando factura ${facAntSerie}-${facAntNum} por nueva factura ${nuevaSerie}-${nuevoNumero} (Cuenta ID ${id})`);
            }

            res.json({
                ok: true,
                message: `Factura reemplazada exitosamente con Nota de Crédito ${fullNc}.`,
                nueva_serie: nuevaSerie,
                nuevo_numero: nuevoNumero,
                nueva_factura_url: nuevaFacUrl,
                nota_credito: fullNc,
                nota_credito_url: ncUrl
            });
        } catch (err) {
            console.error('Error al cambiar factura con NC en tesorería:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/tesoreria/cuentas/:id/historial-facturas (Listar historial de NC y Facturas) ──
    router.get('/cuentas/:id/historial-facturas', async (req, res) => {
        try {
            await ensureTable(req);
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'Base de datos no disponible' });

            const id = req.params.id;
            const [rows] = await tdb.query(`
                SELECT * FROM tesoreria_cuentas_historial_facturas
                WHERE cuenta_id = ?
                ORDER BY id DESC
            `, [id]);

            for (let r of rows) {
                if (r.factura_anterior_url && r.factura_anterior_url.includes('amazonaws.com')) {
                    try {
                        const k = s3KeyFromUrl(r.factura_anterior_url);
                        if (k) r.factura_anterior_view_url = await getPresignedUrl(k, 7200);
                    } catch(e) { r.factura_anterior_view_url = r.factura_anterior_url; }
                } else if (r.factura_anterior_url) {
                    r.factura_anterior_view_url = r.factura_anterior_url;
                }

                if (r.nota_credito_url && r.nota_credito_url.includes('amazonaws.com')) {
                    try {
                        const k = s3KeyFromUrl(r.nota_credito_url);
                        if (k) r.nota_credito_view_url = await getPresignedUrl(k, 7200);
                    } catch(e) { r.nota_credito_view_url = r.nota_credito_url; }
                } else if (r.nota_credito_url) {
                    r.nota_credito_view_url = r.nota_credito_url;
                }

                if (r.factura_nueva_url && r.factura_nueva_url.includes('amazonaws.com')) {
                    try {
                        const k = s3KeyFromUrl(r.factura_nueva_url);
                        if (k) r.factura_nueva_view_url = await getPresignedUrl(k, 7200);
                    } catch(e) { r.factura_nueva_view_url = r.factura_nueva_url; }
                } else if (r.factura_nueva_url) {
                    r.factura_nueva_view_url = r.factura_nueva_url;
                }
            }

            res.json({ ok: true, data: rows || [] });
        } catch (err) {
            console.error('Error al obtener historial de facturas:', err);
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
                centro_costo VARCHAR(150) NULL,
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

            const { fecha_desde, fecha_hasta, estado, buscar, orden_viaje } = req.query;
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
                    centro_costo,
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

            if (orden_viaje && orden_viaje.trim()) {
                sql += ` AND UPPER(TRIM(orden_viaje)) = UPPER(?)`;
                params.push(orden_viaje.trim());
            }
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
                    centro_costo LIKE ? OR
                    sub_motivo LIKE ? OR
                    descripcion LIKE ? OR
                    persona LIKE ? OR
                    autoriza LIKE ? OR
                    numero_factura LIKE ?
                )`;
                params.push(term, term, term, term, term, term, term, term, term, term);
            }

            sql += ` ORDER BY fecha DESC, id DESC LIMIT 500`;

            const [rows] = await tdb.query(sql, params);

            // Generar presigned URLs para voucher y sustento
            for (const r of rows) {
                if (r.voucher_url && typeof getPresignedUrl === 'function') {
                    try {
                        const k = s3KeyFromUrl(r.voucher_url);
                        if (k) r.voucher_view_url = await getPresignedUrl(k, 7200);
                    } catch(e) { r.voucher_view_url = r.voucher_url; }
                } else if (r.voucher_url) {
                    r.voucher_view_url = r.voucher_url;
                }

                if (r.sustento_url && typeof getPresignedUrl === 'function') {
                    try {
                        const k = s3KeyFromUrl(r.sustento_url);
                        if (k) r.sustento_view_url = await getPresignedUrl(k, 7200);
                    } catch(e) { r.sustento_view_url = r.sustento_url; }
                } else if (r.sustento_url) {
                    r.sustento_view_url = r.sustento_url;
                }
            }

            res.json({ ok: true, data: rows || [] });
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
            const b = req.body || {};

            let voucherUrl = null;
            if (req.files && req.files.voucher && req.files.voucher[0]) {
                const f = req.files.voucher[0];
                const ext = (f.originalname.split('.').pop() || 'png').toLowerCase();
                const key = `tesoreria/caja/voucher_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                voucherUrl = await uploadToS3(f.buffer, key, f.mimetype);
            }

            let sustentoUrl = null;
            if (req.files && req.files.sustento && req.files.sustento[0]) {
                const f = req.files.sustento[0];
                const ext = (f.originalname.split('.').pop() || 'pdf').toLowerCase();
                const key = `tesoreria/caja/sustento_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                sustentoUrl = await uploadToS3(f.buffer, key, f.mimetype);
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
                    autoriza, motivo, centro_costo, sub_motivo, modalidad_pago, moneda,
                    tipo_persona, persona, tipo_movimiento, subtotal,
                    retencion_detraccion, importe_total, tipo_cambio, descripcion,
                    tipo_comprobante, cuenta_bancaria_persona, cuenta_bancaria_empresa,
                    voucher_url, sustento_url, observacion, no_aplica_liquidacion,
                    estado, usuario_creacion
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTRADO', ?)
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
                (b.centro_costo || '').trim(),
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
            const b = req.body || {};

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
                voucherUrl = await uploadToS3(f.buffer, key, f.mimetype);
            }

            let sustentoUrl = rows[0].sustento_url;
            if (req.files && req.files['sustento'] && req.files['sustento'][0]) {
                const f = req.files['sustento'][0];
                const ext = (f.originalname.split('.').pop() || 'bin').toLowerCase();
                const key = `tesoreria/caja/sustento_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                sustentoUrl = await uploadToS3(f.buffer, key, f.mimetype);
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
                    centro_costo = ?,
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
                (b.centro_costo || '').trim(),
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

    // Cambiar estado a APROBADO (Desde módulo Gerencia / Aprobación de Caja)
    router.post('/caja/:id/aprobar', async (req, res) => {
        try {
            await ensureTableCaja(req);
            const tdb = getDb(req);
            const { id } = req.params;
            const b = req.body || {};
            const userName = (req.user && req.user.nombre) ? req.user.nombre : (b.usuario_aprobacion || 'Administrador');

            const [rows] = await tdb.query('SELECT estado FROM tesoreria_caja WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });

            await tdb.query(`
                UPDATE tesoreria_caja SET
                    estado = 'APROBADO',
                    usuario_aprobacion = ?,
                    fecha_aprobacion = NOW()
                WHERE id = ?
            `, [userName, id]);

            res.json({ ok: true, message: 'Caja aprobada con éxito por ' + userName });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Cambiar estado a ANULADO (Desde módulo Gerencia / Aprobación de Caja)
    router.post('/caja/:id/anular', async (req, res) => {
        try {
            await ensureTableCaja(req);
            const tdb = getDb(req);
            const { id } = req.params;
            const b = req.body || {};
            const userName = (req.user && req.user.nombre) ? req.user.nombre : (b.usuario_anulacion || 'Administrador');
            const motivo = (b.motivo || 'Anulado por Gerencia').trim();

            const [rows] = await tdb.query('SELECT estado, observacion FROM tesoreria_caja WHERE id = ?', [id]);
            if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });

            const obsPrev = rows[0].observacion || '';
            const nuevaObs = obsPrev ? `${obsPrev} | [ANULACIÓN]: ${motivo} (Por ${userName})` : `[ANULACIÓN]: ${motivo} (Por ${userName})`;

            await tdb.query(`
                UPDATE tesoreria_caja SET
                    estado = 'ANULADO',
                    usuario_aprobacion = ?,
                    observacion = ?
                WHERE id = ?
            `, [userName, nuevaObs, id]);

            res.json({ ok: true, message: 'Caja anulada correctamente' });
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
                voucherUrl = await uploadToS3(f.buffer, key, f.mimetype);
            }

            let sustentoUrl = rows[0].sustento_url;
            if (req.files && req.files['sustento'] && req.files['sustento'][0]) {
                const f = req.files['sustento'][0];
                const ext = (f.originalname.split('.').pop() || 'bin').toLowerCase();
                const key = `tesoreria/caja/sustento_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                sustentoUrl = await uploadToS3(f.buffer, key, f.mimetype);
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

    // ══════════════════════════════════════════════════════════════════════
    // ── MÓDULO CENTROS DE COSTOS (TESORERÍA) ──────────────────────────────
    // ══════════════════════════════════════════════════════════════════════
    async function ensureTableCentrosCostos(req) {
        const tdb = getDb(req);
        if (!tdb) return;
        await tdb.query(`
            CREATE TABLE IF NOT EXISTS tesoreria_centros_costos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                codigo VARCHAR(50) NOT NULL UNIQUE,
                nombre VARCHAR(150) NOT NULL,
                nivel VARCHAR(50) NOT NULL DEFAULT 'Principal',
                cuenta_contable VARCHAR(100) NULL,
                requiere_placa TINYINT(1) NOT NULL DEFAULT 0,
                descripcion TEXT NULL,
                estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `).catch(() => {});
    }

    // Listar Centros de Costos
    router.get('/centros-costos', async (req, res) => {
        try {
            await ensureTableCentrosCostos(req);
            const tdb = getDb(req);
            const [rows] = await tdb.query('SELECT * FROM tesoreria_centros_costos ORDER BY codigo ASC');
            res.json({ ok: true, data: rows || [] });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Crear Centro de Costos
    router.post('/centros-costos', async (req, res) => {
        try {
            await ensureTableCentrosCostos(req);
            const tdb = getDb(req);
            const b = req.body || {};
            const codigo = (b.codigo || '').trim().toUpperCase();
            const nombre = (b.nombre || '').trim();

            if (!codigo || !nombre) {
                return res.status(400).json({ error: 'El código y el nombre son obligatorios.' });
            }

            const [result] = await tdb.query(`
                INSERT INTO tesoreria_centros_costos (codigo, nombre, nivel, cuenta_contable, requiere_placa, descripcion, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                codigo,
                nombre,
                (b.nivel || 'Principal').trim(),
                (b.cuenta_contable || '').trim(),
                b.requiere_placa ? 1 : 0,
                (b.descripcion || '').trim(),
                (b.estado || 'ACTIVO').trim()
            ]);

            res.json({ ok: true, id: result.insertId, message: 'Centro de costos creado exitosamente.' });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Ya existe un centro de costos con ese código.' });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // Actualizar Centro de Costos
    router.put('/centros-costos/:id', async (req, res) => {
        try {
            await ensureTableCentrosCostos(req);
            const tdb = getDb(req);
            const { id } = req.params;
            const b = req.body || {};
            const codigo = (b.codigo || '').trim().toUpperCase();
            const nombre = (b.nombre || '').trim();

            if (!codigo || !nombre) {
                return res.status(400).json({ error: 'El código y el nombre son obligatorios.' });
            }

            await tdb.query(`
                UPDATE tesoreria_centros_costos SET
                    codigo = ?,
                    nombre = ?,
                    nivel = ?,
                    cuenta_contable = ?,
                    requiere_placa = ?,
                    descripcion = ?,
                    estado = ?
                WHERE id = ?
            `, [
                codigo,
                nombre,
                (b.nivel || 'Principal').trim(),
                (b.cuenta_contable || '').trim(),
                b.requiere_placa ? 1 : 0,
                (b.descripcion || '').trim(),
                (b.estado || 'ACTIVO').trim(),
                id
            ]);

            res.json({ ok: true, message: 'Centro de costos actualizado correctamente.' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Eliminar Centro de Costos
    router.delete('/centros-costos/:id', async (req, res) => {
        try {
            await ensureTableCentrosCostos(req);
            const tdb = getDb(req);
            const { id } = req.params;
            await tdb.query('DELETE FROM tesoreria_centros_costos WHERE id = ?', [id]);
            res.json({ ok: true, message: 'Centro de costos eliminado.' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GESTIÓN DE MOTIVOS Y SUBMOTIVOS DE GASTO ───────────────────
    async function ensureTableMotivosGastos(req) {
        const tdb = getDb(req);
        try {
            await tdb.query(`
                CREATE TABLE IF NOT EXISTS tesoreria_motivos_gastos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    motivo VARCHAR(150) NOT NULL,
                    sub_motivo VARCHAR(150) NOT NULL,
                    centro_costo_codigo VARCHAR(50) NULL,
                    estado ENUM('ACTIVO', 'INACTIVO') DEFAULT 'ACTIVO',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_motivo (motivo),
                    INDEX idx_submotivo (sub_motivo),
                    INDEX idx_cc_codigo (centro_costo_codigo)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `).catch(() => {});
        } catch (e) {
            console.warn('[Tesorería Motivos] Error verificando tabla tesoreria_motivos_gastos:', e.message);
        }
    }

    // Listar Motivos y Submotivos (con opción de filtrar solo activos)
    router.get('/motivos-gastos', async (req, res) => {
        try {
            await ensureTableMotivosGastos(req);
            const tdb = getDb(req);
            const soloActivos = req.query.solo_activos === '1' || req.query.solo_activos === 'true';
            let sql = 'SELECT * FROM tesoreria_motivos_gastos';
            const params = [];
            if (soloActivos) {
                sql += ' WHERE estado = ?';
                params.push('ACTIVO');
            }
            sql += ' ORDER BY motivo ASC, sub_motivo ASC';
            const [rows] = await tdb.query(sql, params);
            res.json({ ok: true, data: rows });
        } catch (err) {
            console.error('Error al listar motivos de gastos:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Crear Motivo / Submotivo
    router.post('/motivos-gastos', async (req, res) => {
        try {
            await ensureTableMotivosGastos(req);
            const tdb = getDb(req);
            const b = req.body || {};
            const motivo = (b.motivo || '').trim();
            const sub_motivo = (b.sub_motivo || '').trim();
            const centro_costo_codigo = (b.centro_costo_codigo || '').trim().toUpperCase();

            if (!motivo || !sub_motivo) {
                return res.status(400).json({ error: 'El Motivo y el Sub Motivo son obligatorios.' });
            }

            const [result] = await tdb.query(`
                INSERT INTO tesoreria_motivos_gastos (motivo, sub_motivo, centro_costo_codigo, estado)
                VALUES (?, ?, ?, ?)
            `, [
                motivo,
                sub_motivo,
                centro_costo_codigo || null,
                (b.estado || 'ACTIVO').trim()
            ]);

            res.json({ ok: true, id: result.insertId, message: 'Motivo de gasto registrado exitosamente.' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Actualizar Motivo / Submotivo
    router.put('/motivos-gastos/:id', async (req, res) => {
        try {
            await ensureTableMotivosGastos(req);
            const tdb = getDb(req);
            const { id } = req.params;
            const b = req.body || {};
            const motivo = (b.motivo || '').trim();
            const sub_motivo = (b.sub_motivo || '').trim();
            const centro_costo_codigo = (b.centro_costo_codigo || '').trim().toUpperCase();

            if (!motivo || !sub_motivo) {
                return res.status(400).json({ error: 'El Motivo y el Sub Motivo son obligatorios.' });
            }

            await tdb.query(`
                UPDATE tesoreria_motivos_gastos SET
                    motivo = ?,
                    sub_motivo = ?,
                    centro_costo_codigo = ?,
                    estado = ?
                WHERE id = ?
            `, [
                motivo,
                sub_motivo,
                centro_costo_codigo || null,
                (b.estado || 'ACTIVO').trim(),
                id
            ]);

            res.json({ ok: true, message: 'Motivo de gasto actualizado correctamente.' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Eliminar Motivo / Submotivo
    // ── GESTIÓN DE LIQUIDACIÓN DE GASTOS OPERATIVOS DE VIAJE ─────────
    async function ensureTableLiquidacionesGastos(req) {
        const tenantSlug = req.tenantSlug || 'default';
        const key = `liq_gastos_${tenantSlug}`;
        if (_tenantsInitSet.has(key)) return;

        const tdb = getDb(req);
        if (!tdb) return;

        const createSql = `
            CREATE TABLE IF NOT EXISTS tesoreria_liquidaciones_gastos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                orden_viaje VARCHAR(100) NOT NULL,
                fecha DATE NOT NULL,
                conductor VARCHAR(150) NULL,
                tipo_gasto VARCHAR(100) NOT NULL,
                sub_motivo VARCHAR(150) NULL,
                tipo_comprobante VARCHAR(50) NOT NULL DEFAULT 'BOLETA',
                serie VARCHAR(30) NULL,
                numero VARCHAR(50) NULL,
                proveedor_ruc VARCHAR(20) NULL,
                proveedor_nombre VARCHAR(200) NULL,
                detalle TEXT NULL,
                importe DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                sustento_url TEXT NULL,
                estado VARCHAR(50) NOT NULL DEFAULT 'APROBADO',
                usuario_registro VARCHAR(150) NULL,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_liq_viaje (orden_viaje),
                INDEX idx_liq_fecha (fecha)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        try {
            await tdb.query(createSql);
            _tenantsInitSet.add(key);
        } catch(e) {
            console.warn('[Liquidaciones Gastos] Error verificando tabla:', e.message);
        }
    }

    // Listar gastos de liquidación de un viaje + Balance consolidado contra depósitos de caja
    router.get('/liquidaciones-gastos', async (req, res) => {
        try {
            await ensureTableLiquidacionesGastos(req);
            await ensureTableCaja(req);
            const tdb = getDb(req);
            const { orden_viaje } = req.query;

            // Si no se especifica orden_viaje, listar el consolidado de viajes con depósitos o liquidaciones
            if (!orden_viaje || !orden_viaje.trim()) {
                const { q, estado_balance, limit } = req.query;
                
                // Obtener viajes recientes de operaciones
                let sql = `
                    SELECT ov.viaje, DATE_FORMAT(ov.fecha_viaje, '%Y-%m-%d') AS fecha,
                           ov.conductor, ov.placa_tracto, ov.placa_remolque, ov.ruta, ov.estado
                    FROM operaciones_ordenes_viaje ov
                    WHERE 1=1
                `;
                const params = [];
                if (q && q.trim()) {
                    const term = `%${q.trim()}%`;
                    sql += ` AND (ov.viaje LIKE ? OR ov.conductor LIKE ? OR ov.placa_tracto LIKE ? OR ov.placa_remolque LIKE ? OR ov.ruta LIKE ?)`;
                    params.push(term, term, term, term, term);
                }
                sql += ` ORDER BY ov.fecha_viaje DESC, ov.id DESC LIMIT ?`;
                params.push(parseInt(limit, 10) || 50);

                const [viajes] = await tdb.query(sql, params);

                // Para cada viaje, calcular rápidamente sus totales
                const resultado = [];
                for (const v of viajes) {
                    const [cajas] = await tdb.query(`
                        SELECT tipo_movimiento, SUM(importe_total) AS total
                        FROM tesoreria_caja
                        WHERE UPPER(TRIM(orden_viaje)) = UPPER(?) AND UPPER(estado) != 'ANULADO'
                        GROUP BY tipo_movimiento
                    `, [v.viaje]);

                    let dep = 0, dev = 0;
                    (cajas || []).forEach(c => {
                        const t = parseFloat(c.total || 0);
                        if (c.tipo_movimiento === 'INGRESO') dev += t;
                        else dep += t;
                    });
                    const netoDep = dep - dev;

                    const [gastos] = await tdb.query(`
                        SELECT SUM(importe) AS total_gastos, COUNT(id) AS cant_gastos
                        FROM tesoreria_liquidaciones_gastos
                        WHERE UPPER(TRIM(orden_viaje)) = UPPER(?) AND estado != 'RECHAZADO'
                    `, [v.viaje]);

                    const ren = parseFloat((gastos && gastos[0] && gastos[0].total_gastos) || 0);
                    const cantGastos = parseInt((gastos && gastos[0] && gastos[0].cant_gastos) || 0, 10);
                    const diff = netoDep - ren;

                    let estadoBal = 'CUADRADO';
                    if (diff > 0.01) estadoBal = 'SALDO_EMPRESA';
                    else if (diff < -0.01) estadoBal = 'SALDO_CONDUCTOR';

                    // Filtrar por estado de balance si fue solicitado
                    if (estado_balance === 'PENDIENTE' && estadoBal === 'CUADRADO') continue;
                    if (estado_balance === 'CUADRADO' && estadoBal !== 'CUADRADO') continue;

                    resultado.push({
                        ...v,
                        total_depositado: netoDep,
                        total_rendido: ren,
                        saldo_diferencia: diff,
                        cant_gastos: cantGastos,
                        estado_balance: estadoBal
                    });
                }

                return res.json({ ok: true, data: resultado });
            }

            const ovTrim = orden_viaje.trim();

            // 1. Obtener gastos rendidos del viaje específico
            const [gastos] = await tdb.query(`
                SELECT id, orden_viaje, 
                       DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
                       DATE_FORMAT(IFNULL(creado_en, fecha), '%d/%m/%Y %H:%i') AS fecha_formateada,
                       conductor,
                       tipo_gasto, sub_motivo, tipo_comprobante, serie, numero,
                       proveedor_ruc, proveedor_nombre, detalle, importe, sustento_url,
                       estado, usuario_registro, creado_en
                FROM tesoreria_liquidaciones_gastos
                WHERE UPPER(TRIM(orden_viaje)) = UPPER(?)
                ORDER BY IFNULL(creado_en, fecha) DESC, id DESC
            `, [ovTrim]);

            for (const g of gastos) {
                if (g.sustento_url && typeof getPresignedUrl === 'function') {
                    try {
                        const k = s3KeyFromUrl(g.sustento_url);
                        if (k) g.sustento_view_url = await getPresignedUrl(k, 7200);
                    } catch(e) { g.sustento_view_url = g.sustento_url; }
                } else if (g.sustento_url) {
                    g.sustento_view_url = g.sustento_url;
                }
            }

            // 2. Obtener depósitos/cajas asignados a este viaje (excluyendo ANULADO)
            const [cajas] = await tdb.query(`
                SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, serie, numero, motivo, sub_motivo,
                       persona, importe_total, tipo_movimiento, estado, voucher_url, sustento_url,
                       DATE_FORMAT(fecha_aprobacion, '%Y-%m-%d %H:%i') AS fecha_aprobacion
                FROM tesoreria_caja
                WHERE UPPER(TRIM(orden_viaje)) = UPPER(?) AND UPPER(estado) != 'ANULADO'
                ORDER BY fecha ASC, id ASC
            `, [ovTrim]);

            // Sumatorias: SOLO cajas con estado PROCESADO representan fondos efectivamente depositados/entregados
            let totalDepositado = 0;
            let totalDevoluciones = 0;
            let totalPendientePago = 0;
            cajas.forEach(c => {
                const imp = parseFloat(c.importe_total || 0);
                const est = (c.estado || '').toUpperCase().trim();
                if (est === 'PROCESADO' || est === 'REGISTRADO') {
                    if (c.tipo_movimiento === 'INGRESO') {
                        totalDevoluciones += imp;
                    } else {
                        totalDepositado += imp;
                    }
                } else if (est !== 'ANULADO') {
                    totalPendientePago += imp;
                }
            });

            let totalGastos = 0;
            gastos.forEach(g => {
                if (g.estado !== 'RECHAZADO') {
                    totalGastos += parseFloat(g.importe || 0);
                }
            });

            // Saldo = Total Entregado Procesado (Egresos - Ingresos) - Total Gastado
            // Si saldo > 0: El conductor gastó menos (saldo a favor de la empresa / por devolver)
            // Si saldo < 0: El conductor gastó más (saldo a favor del conductor / por reembolsar)
            const netoEntregado = totalDepositado - totalDevoluciones;
            const saldoDiferencia = netoEntregado - totalGastos;

            res.json({
                ok: true,
                orden_viaje: ovTrim,
                gastos: gastos || [],
                total_depositado: netoEntregado,
                total_pendiente_pago: totalPendientePago,
                total_rendido: totalGastos,
                saldo_diferencia: saldoDiferencia,
                estado_balance: saldoDiferencia === 0 ? 'CUADRADO' : (saldoDiferencia > 0 ? 'SALDO_EMPRESA' : 'SALDO_CONDUCTOR')
            });
        } catch (err) {
            console.error('Error al listar liquidaciones de gastos:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Registrar nuevo gasto de liquidación con comprobante adjunto
    router.post('/liquidaciones-gastos', upload.single('sustento'), async (req, res) => {
        try {
            await ensureTableLiquidacionesGastos(req);
            const tdb = getDb(req);
            const b = req.body || {};

            if (!b.orden_viaje || !b.importe) {
                return res.status(400).json({ error: 'orden_viaje e importe requeridos' });
            }

            let sustentoUrl = null;
            if (req.file) {
                const f = req.file;
                let ext = (f.originalname.split('.').pop() || 'jpg').toLowerCase();
                if (ext === 'heic' || ext === 'heif') ext = 'jpg';
                const key = `tesoreria/liquidaciones/gasto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                let mime = f.mimetype || 'image/jpeg';
                if (mime === 'image/heic' || mime === 'image/heif') mime = 'image/jpeg';
                sustentoUrl = await uploadToS3(f.buffer, key, mime);
            }

            const [result] = await tdb.query(`
                INSERT INTO tesoreria_liquidaciones_gastos (
                    orden_viaje, fecha, conductor, tipo_gasto, sub_motivo,
                    tipo_comprobante, serie, numero, proveedor_ruc, proveedor_nombre,
                    detalle, importe, sustento_url, estado, usuario_registro
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                (b.orden_viaje || '').trim(),
                safeDate(b.fecha) || new Date(),
                (b.conductor || '').trim(),
                (b.tipo_gasto || 'Gastos de Viaje y Ruta').trim(),
                (b.sub_motivo || '').trim(),
                (b.tipo_comprobante || 'BOLETA').trim(),
                (b.serie || '').trim(),
                (b.numero || '').trim(),
                (b.proveedor_ruc || '').trim(),
                (b.proveedor_nombre || '').trim(),
                (b.detalle || '').trim(),
                safeNum(b.importe),
                sustentoUrl,
                (b.estado || 'APROBADO').trim(),
                (req.user && req.user.nombre) ? req.user.nombre : (b.usuario_creacion || 'SISTEMA')
            ]);

            res.json({ ok: true, id: result.insertId, message: 'Gasto registrado con éxito' });
        } catch (err) {
            console.error('Error al registrar gasto de liquidación:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Actualizar / Editar gasto de liquidación
    router.put('/liquidaciones-gastos/:id', upload.single('sustento'), async (req, res) => {
        try {
            await ensureTableLiquidacionesGastos(req);
            const tdb = getDb(req);
            const { id } = req.params;
            const b = req.body || {};

            let sustentoUrl = undefined;
            if (req.file) {
                const f = req.file;
                let ext = (f.originalname.split('.').pop() || 'jpg').toLowerCase();
                if (ext === 'heic' || ext === 'heif') ext = 'jpg';
                const key = `tesoreria/liquidaciones/gasto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                let mime = f.mimetype || 'image/jpeg';
                if (mime === 'image/heic' || mime === 'image/heif') mime = 'image/jpeg';
                sustentoUrl = await uploadToS3(f.buffer, key, mime);
            }

            const sets = [];
            const params = [];

            if (b.tipo_gasto !== undefined) {
                sets.push('tipo_gasto = ?');
                params.push((b.tipo_gasto || 'Gastos de Viaje y Ruta').trim());
            }
            if (b.sub_motivo !== undefined) {
                sets.push('sub_motivo = ?');
                params.push((b.sub_motivo || '').trim());
            }
            if (b.detalle !== undefined) {
                sets.push('detalle = ?');
                params.push((b.detalle || '').trim());
            }
            if (b.importe !== undefined) {
                sets.push('importe = ?');
                params.push(safeNum(b.importe));
            }
            if (sustentoUrl !== undefined) {
                sets.push('sustento_url = ?');
                params.push(sustentoUrl);
            }

            if (sets.length === 0) {
                return res.json({ ok: true, message: 'Sin cambios' });
            }

            params.push(id);
            await tdb.query(`UPDATE tesoreria_liquidaciones_gastos SET ${sets.join(', ')} WHERE id = ?`, params);

            res.json({ ok: true, message: 'Gasto actualizado con éxito' });
        } catch (err) {
            console.error('Error al actualizar gasto de liquidación:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Eliminar gasto de liquidación
    router.delete('/liquidaciones-gastos/:id', async (req, res) => {
        try {
            await ensureTableLiquidacionesGastos(req);
            const tdb = getDb(req);
            const { id } = req.params;
            await tdb.query('DELETE FROM tesoreria_liquidaciones_gastos WHERE id = ?', [id]);
            res.json({ ok: true, message: 'Gasto de liquidación eliminado' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Generar Caja de Compensación (Devolución por saldo a favor o Reembolso agrupado por conceptos)
    router.post('/liquidaciones-gastos/generar-caja-compensacion', async (req, res) => {
        try {
            await ensureTableCaja(req);
            await ensureTableLiquidacionesGastos(req);
            await ensureTableMotivosGastos(req);
            const tdb = getDb(req);
            const b = req.body || {};

            const { orden_viaje, tipo_compensacion, importe, conductor, placa, descripcion, destino_devolucion, conceptos } = b;

            if (!orden_viaje) {
                return res.status(400).json({ error: 'orden_viaje es requerido' });
            }

            const tipoMov = (tipo_compensacion === 'DEVOLUCION_EMPRESA') ? 'INGRESO' : 'EGRESO';
            const anio = new Date().getFullYear().toString();
            const userCreacion = (req.user && req.user.nombre) ? req.user.nombre : (b.usuario_creacion || 'ADMINISTRACION');

            // Cargar mapa de centros de costo para motivos/submotivos
            const [catalogoMotivos] = await tdb.query('SELECT motivo, sub_motivo, centro_costo_codigo FROM tesoreria_motivos_gastos WHERE estado = "ACTIVO"').catch(() => [[]]);
            const getCentroCosto = (mot, sub) => {
                const found = (catalogoMotivos || []).find(m => 
                    (m.motivo || '').toLowerCase() === (mot || '').toLowerCase() &&
                    (m.sub_motivo || '').toLowerCase() === (sub || '').toLowerCase()
                );
                return (found && found.centro_costo_codigo) ? found.centro_costo_codigo : 'CC-300';
            };

            const cajasGeneradas = [];

            if (tipo_compensacion === 'DEVOLUCION_EMPRESA') {
                // Generar 1 Caja de INGRESO por el saldo a favor de la empresa
                const impNum = safeNum(importe);
                if (impNum <= 0) return res.status(400).json({ error: 'Importe de devolución inválido' });

                let submot = 'Sobrante de Viáticos (Caja Principal)';
                let modPago = 'DEPOSITO EN CUENTA';
                if (destino_devolucion === 'CAJA_CHICA') {
                    submot = 'Sobrante de Viáticos (Caja Chica)';
                    modPago = 'EFECTIVO';
                } else if (destino_devolucion === 'DESCUENTO_PLANILLA') {
                    submot = 'Descuento en Planilla / Asignación';
                    modPago = 'DESCUENTO EN PLANILLA';
                }

                const [lastNum] = await tdb.query("SELECT numero FROM tesoreria_caja WHERE serie = ? ORDER BY id DESC LIMIT 1", [anio]);
                let nextCorrelativo = 1;
                if (lastNum && lastNum.length > 0 && lastNum[0].numero) {
                    const parsed = parseInt(lastNum[0].numero, 10);
                    if (!isNaN(parsed)) nextCorrelativo = parsed + 1;
                }
                const numeroFormateado = String(nextCorrelativo).padStart(8, '0');
                const descFinal = descripcion || `Devolución de Viáticos - Orden de Viaje ${orden_viaje} - Conductor: ${conductor || 'Personal'} [Destino: ${destino_devolucion || 'CAJA_PRINCIPAL'}]`;

                const [rCaja] = await tdb.query(`
                    INSERT INTO tesoreria_caja (
                        fecha, hora, serie, numero, orden_viaje, conductor, placa, autoriza,
                        motivo, centro_costo, sub_motivo, modalidad_pago, moneda,
                        tipo_persona, persona, tipo_movimiento, subtotal, importe_total,
                        descripcion, estado, usuario_creacion
                    ) VALUES (
                        CURDATE(), CURTIME(), ?, ?, ?, ?, ?, ?,
                        'Gastos de Viaje y Ruta', 'CC-300', ?, ?, 'SOLES',
                        'CONDUCTOR', ?, 'INGRESO', ?, ?,
                        ?, 'PENDIENTE', ?
                    )
                `, [
                    anio, numeroFormateado, orden_viaje, conductor || '', placa || '', 'GERENCIA',
                    submot, modPago, conductor || 'CONDUCTOR', impNum, impNum, descFinal, userCreacion
                ]);

                cajasGeneradas.push({
                    id: rCaja.insertId,
                    numero: `${anio}-${numeroFormateado}`,
                    sub_motivo: submot,
                    importe: impNum
                });

            } else {
                // REEMBOLSO AL CONDUCTOR: Agrupar por sub_motivo
                let listaConceptos = [];

                if (Array.isArray(conceptos) && conceptos.length > 0) {
                    listaConceptos = conceptos.map(c => ({
                        sub_motivo: (c.sub_motivo || c.concepto || 'Gastos de Viaje y Ruta').trim(),
                        importe: safeNum(c.importe || 0),
                        centro_costo: (c.centro_costo || getCentroCosto('Gastos de Viaje y Ruta', c.sub_motivo || c.concepto)).trim()
                    })).filter(c => c.importe > 0);
                } else {
                    // Consultar automáticamente los gastos de liquidación de este viaje y agruparlos por sub_motivo
                    const [gastosAgrup] = await tdb.query(`
                        SELECT COALESCE(NULLIF(sub_motivo, ''), NULLIF(tipo_gasto, ''), 'Gastos de Viaje y Ruta') as sub_mot,
                               SUM(importe) as total_grupo
                        FROM tesoreria_liquidaciones_gastos
                        WHERE UPPER(TRIM(orden_viaje)) = UPPER(?) AND estado != 'RECHAZADO'
                        GROUP BY sub_mot
                    `, [orden_viaje]);

                    if (gastosAgrup && gastosAgrup.length > 0) {
                        listaConceptos = gastosAgrup.map(g => ({
                            sub_motivo: g.sub_mot,
                            importe: parseFloat(g.total_grupo || 0),
                            centro_costo: getCentroCosto('Gastos de Viaje y Ruta', g.sub_mot)
                        })).filter(c => c.importe > 0);
                    } else {
                        // Fallback con importe directo
                        const impNum = safeNum(importe);
                        if (impNum > 0) {
                            listaConceptos = [{
                                sub_motivo: 'Viáticos / Alimentación choferes',
                                importe: impNum,
                                centro_costo: 'CC-300'
                            }];
                        }
                    }
                }

                if (listaConceptos.length === 0) {
                    return res.status(400).json({ error: 'No se encontraron montos o conceptos válidos para generar caja.' });
                }

                const modPago = (destino_devolucion === 'EFECTIVO') ? 'EFECTIVO' : 'TRANSFERENCIA BANCARIA';

                // Generar una caja por cada concepto
                for (let i = 0; i < listaConceptos.length; i++) {
                    const itemConcepto = listaConceptos[i];
                    
                    const [lastNum] = await tdb.query("SELECT numero FROM tesoreria_caja WHERE serie = ? ORDER BY id DESC LIMIT 1", [anio]);
                    let nextCorrelativo = 1;
                    if (lastNum && lastNum.length > 0 && lastNum[0].numero) {
                        const parsed = parseInt(lastNum[0].numero, 10);
                        if (!isNaN(parsed)) nextCorrelativo = parsed + 1;
                    }
                    const numeroFormateado = String(nextCorrelativo).padStart(8, '0');
                    const descFinal = descripcion || `Reembolso por Liquidación [${itemConcepto.sub_motivo}] - Orden de Viaje ${orden_viaje} - Conductor: ${conductor || 'Personal'}`;

                    const [rCaja] = await tdb.query(`
                        INSERT INTO tesoreria_caja (
                            fecha, hora, serie, numero, orden_viaje, conductor, placa, autoriza,
                            motivo, centro_costo, sub_motivo, modalidad_pago, moneda,
                            tipo_persona, persona, tipo_movimiento, subtotal, importe_total,
                            descripcion, estado, usuario_creacion
                        ) VALUES (
                            CURDATE(), CURTIME(), ?, ?, ?, ?, ?, ?,
                            'Gastos de Viaje y Ruta', ?, ?, ?, 'SOLES',
                            'CONDUCTOR', ?, 'EGRESO', ?, ?,
                            ?, 'PENDIENTE', ?
                        )
                    `, [
                        anio,
                        numeroFormateado,
                        orden_viaje,
                        conductor || '',
                        placa || '',
                        'GERENCIA',
                        itemConcepto.centro_costo || 'CC-300',
                        itemConcepto.sub_motivo,
                        modPago,
                        conductor || 'CONDUCTOR',
                        itemConcepto.importe,
                        itemConcepto.importe,
                        descFinal,
                        userCreacion
                    ]);

                    cajasGeneradas.push({
                        id: rCaja.insertId,
                        numero: `${anio}-${numeroFormateado}`,
                        sub_motivo: itemConcepto.sub_motivo,
                        centro_costo: itemConcepto.centro_costo || 'CC-300',
                        importe: itemConcepto.importe
                    });
                }
            }

            res.json({
                ok: true,
                cajas_generadas: cajasGeneradas,
                total_cajas: cajasGeneradas.length,
                tipo_movimiento: tipoMov,
                message: `Se ${cajasGeneradas.length === 1 ? 'generó 1 caja' : 'generaron ' + cajasGeneradas.length + ' cajas'} de ${tipoMov} en estado PENDIENTE.`
            });
        } catch (err) {
            console.error('Error al generar caja de compensación:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================================
    // 💳 PAGO DE REQUERIMIENTOS (Órdenes de Compra Aprobadas)
    // ============================================================

    // ── Helper: Asegurar columnas necesarias en entradas_inv ─────
    async function _ensureColumnasPagoRequerimientos(tdb) {
        const cols = [
            { col: 'numero_operacion', def: 'VARCHAR(100) NULL' },
            { col: 'fecha_pago', def: 'DATETIME NULL' },
            { col: 'pagado_por', def: 'VARCHAR(150) NULL' },
            { col: 'fecha_aprobacion', def: 'DATETIME NULL' },
            { col: 'cuenta_bancaria_empresa', def: 'VARCHAR(150) NULL' }
        ];
        for (const c of cols) {
            try {
                const [r] = await tdb.query(
                    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='entradas_inv' AND COLUMN_NAME='${c.col}'`
                );
                if (r && r[0] && r[0].cnt === 0) {
                    await tdb.query(`ALTER TABLE entradas_inv ADD COLUMN ${c.col} ${c.def}`);
                }
            } catch(e) {}
        }
    }

    // ── GET /api/tesoreria/pago-requerimientos ───────────────────
    router.get('/pago-requerimientos', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'DB no disponible' });
            await _ensureColumnasPagoRequerimientos(tdb);

            const estadoFiltro = (req.query.estado || 'aprobado').toLowerCase();
            let whereClause = "WHERE LOWER(e.estado) IN ('aprobado', 'autorizado')";
            if (estadoFiltro === 'todos') {
                whereClause = "WHERE LOWER(e.estado) IN ('aprobado', 'autorizado', 'procesado', 'pagado')";
            } else if (estadoFiltro === 'procesados' || estadoFiltro === 'pagados') {
                whereClause = "WHERE LOWER(e.estado) IN ('procesado', 'pagado')";
            }

            // 1. Obtener Órdenes de Compra
            const sqlOC = `
                SELECT e.*,
                       COALESCE(e.total_pen, 0) AS total_oc,
                       COUNT(DISTINCT de.id) AS total_items,
                       GROUP_CONCAT(CONCAT(COALESCE(de.descripcion,''), '|', COALESCE(de.cantidad,0), '|', COALESCE(de.costo_unitario,0), '|', COALESCE(de.moneda,'PEN'), '|', COALESCE(de.importe,0)) SEPARATOR ';;') AS items_raw
                FROM entradas_inv e
                LEFT JOIN detalle_entradas_inv de ON de.entrada_id = e.id
                ${whereClause}
                GROUP BY e.id
                ORDER BY e.fecha DESC, e.id DESC
            `;
            const [ocs] = await tdb.query(sqlOC);

            // 2. Mapear Usuarios para nombres legibles
            const [usrRows] = await tdb.query("SELECT idUsuario, correo, nombre FROM usuarios").catch(() => [[]]);
            const usuariosMap = {};
            (usrRows || []).forEach(u => {
                if (u.idUsuario) usuariosMap[u.idUsuario.toLowerCase()] = u.nombre;
                if (u.correo) usuariosMap[u.correo.toLowerCase()] = u.nombre;
                if (u.nombre) usuariosMap[u.nombre.toLowerCase()] = u.nombre;
            });

            // 3. Mapear Cuentas Bancarias de Proveedores
            const [ctasRows] = await tdb.query("SELECT * FROM proveedor_cuentas_bancarias WHERE estado = 1").catch(() => [[]]);
            const ctasProvMap = {};
            (ctasRows || []).forEach(c => {
                if (!ctasProvMap[c.proveedor_id]) ctasProvMap[c.proveedor_id] = [];
                const monStr = (c.moneda || 'SOLES').toUpperCase();
                const monLabel = (monStr.includes('DOL') || monStr === 'USD' || monStr === 'US$') ? 'USD' : 'PEN';
                ctasProvMap[c.proveedor_id].push({
                    banco: c.banco,
                    tipo_cuenta: c.tipo_cuenta,
                    numero_cuenta: c.numero_cuenta,
                    moneda: monLabel,
                    texto: `${c.banco} - ${c.tipo_cuenta} [${monLabel === 'USD' ? 'DÓLARES' : 'SOLES'}] - ${c.numero_cuenta}`
                });
            });

            // 4. Mapear Proveedores info (RUC, Teléfono)
            const [provRows] = await tdb.query("SELECT id, numero_documento, nombre, telefono, email FROM proveedores_inv").catch(() => [[]]);
            const provsMap = {};
            (provRows || []).forEach(p => {
                if (p.id) provsMap[p.id] = p;
                if (p.nombre) provsMap[p.nombre.toLowerCase()] = p;
            });

            // 5. Enriquecer cada requerimiento con presigned URLs y datos de pago
            const resultado = await Promise.all((ocs || []).map(async (oc) => {
                const creadorKey = (oc.creado_por || '').toLowerCase().trim();
                const creadorNombre = usuariosMap[creadorKey] || usuariosMap[oc.creado_por] || oc.creado_por || 'SISTEMA';

                const aprobKey = (oc.aprobado_por || '').toLowerCase().trim();
                const aprobadorNombre = usuariosMap[aprobKey] || usuariosMap[oc.aprobado_por] || oc.aprobado_por || 'Gerencia';

                const pInfo = (oc.proveedor_id && provsMap[oc.proveedor_id]) ||
                              (oc.proveedor_nombre && provsMap[oc.proveedor_nombre.toLowerCase()]) || null;
                const proveedorRuc = pInfo ? pInfo.numero_documento : '';

                // Cuenta bancaria de destino
                let cuentaDestino = oc.cuenta_bancaria_proveedor || '';
                let cuentaDestinoMoneda = (oc.moneda || 'PEN').toUpperCase();
                if (!cuentaDestino && oc.proveedor_id && ctasProvMap[oc.proveedor_id] && ctasProvMap[oc.proveedor_id].length > 0) {
                    cuentaDestino = ctasProvMap[oc.proveedor_id][0].texto;
                    cuentaDestinoMoneda = ctasProvMap[oc.proveedor_id][0].moneda;
                }

                // Desglosar ítems
                const items = oc.items_raw ? oc.items_raw.split(';;').map(s => {
                    const [desc, cant, cu, mon, imp] = s.split('|');
                    return {
                        descripcion: desc || '',
                        cantidad: parseFloat(cant) || 0,
                        costo_unitario: parseFloat(cu) || 0,
                        moneda: mon || oc.moneda || 'PEN',
                        importe: parseFloat(imp) || ((parseFloat(cant) || 0) * (parseFloat(cu) || 0))
                    };
                }) : [];

                // Calcular importe total correcto
                let importeCalculado = 0;
                if (items.length > 0) {
                    importeCalculado = items.reduce((acc, it) => acc + (it.importe || 0), 0);
                } else {
                    importeCalculado = parseFloat(oc.total_pen) || 0;
                }

                // Generar presigned URLs para cotización, factura y voucher
                let cotizacionPresigned = null;
                if (oc.url_cotizacion) {
                    const k = s3KeyFromUrl(oc.url_cotizacion);
                    if (k) cotizacionPresigned = await getPresignedUrl(k).catch(() => oc.url_cotizacion);
                    else cotizacionPresigned = oc.url_cotizacion;
                }

                let facturaPresigned = null;
                if (oc.url_factura) {
                    const k = s3KeyFromUrl(oc.url_factura);
                    if (k) facturaPresigned = await getPresignedUrl(k).catch(() => oc.url_factura);
                    else facturaPresigned = oc.url_factura;
                }

                let voucherPresigned = null;
                if (oc.url_voucher) {
                    const k = s3KeyFromUrl(oc.url_voucher);
                    if (k) voucherPresigned = await getPresignedUrl(k).catch(() => oc.url_voucher);
                    else voucherPresigned = oc.url_voucher;
                }

                return {
                    id: oc.id,
                    folio: oc.id,
                    fecha: oc.fecha,
                    created_at: oc.created_at,
                    solicitante: oc.solicitante || oc.autoriza || '—',
                    centro_costo: oc.centro_costo || 'CC-100',
                    sub_motivo: oc.sub_motivo || '',
                    autoriza: oc.autoriza || '',
                    motivo: oc.motivo_entrada || `ORDEN DE COMPRA: ${oc.id}`,
                    motivo_entrada: oc.motivo_entrada || '',
                    tipo_orden: oc.tipo_orden || 'Orden de compra',
                    moneda: oc.moneda || 'PEN',
                    importe: importeCalculado,
                    total_pen: oc.total_pen,
                    tipo_cambio: oc.tipo_cambio || 1,
                    tipo_igv: oc.tipo_igv || 'sin_igv',
                    placa: oc.placa || '',
                    ot_id: oc.ot_id || '',
                    observaciones: oc.observaciones || '',
                    documento_referencia: oc.documento_referencia || '',
                    creado_por: oc.creado_por,
                    creador_nombre: creadorNombre,
                    aprobado_por: oc.aprobado_por,
                    aprobador_nombre: aprobadorNombre,
                    fecha_aprobacion: oc.fecha_aprobacion || oc.actualizado_en || oc.fecha,
                    dias_credito: parseInt(oc.dias_credito) || 0,
                    dias_pagar: parseInt(oc.dias_pagar || oc.dias_credito) || 0,
                    condicion_pago: oc.condicion_pago || 'Al contado',
                    prioridad: oc.prioridad || 'Normal',
                    proveedor_id: oc.proveedor_id,
                    proveedor_nombre: oc.proveedor_nombre || 'PROVEEDOR GENERAL',
                    proveedor_ruc: proveedorRuc,
                    cuenta_bancaria_proveedor: cuentaDestino,
                    cuenta_destino_moneda: cuentaDestinoMoneda,
                    cuenta_bancaria_empresa: oc.cuenta_bancaria_empresa || '',
                    estado: oc.estado || 'Aprobado',
                    numero_operacion: oc.numero_operacion || '',
                    fecha_pago: oc.fecha_pago || null,
                    pagado_por: oc.pagado_por || '',
                    url_cotizacion: oc.url_cotizacion,
                    url_cotizacion_presigned: cotizacionPresigned,
                    url_factura: oc.url_factura,
                    url_factura_presigned: facturaPresigned,
                    url_voucher: oc.url_voucher,
                    url_voucher_presigned: voucherPresigned,
                    items: items
                };
            }));

            res.json({ ok: true, data: resultado });
        } catch (err) {
            console.error('Error en GET /api/tesoreria/pago-requerimientos:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/tesoreria/pago-requerimientos/:id/procesar ─────
    router.post('/pago-requerimientos/:id/procesar', upload.single('voucher'), async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'DB no disponible' });
            await _ensureColumnasPagoRequerimientos(tdb);
            await ensureTableCaja(req);

            const { id } = req.params;
            const b = req.body || {};
            const numeroConstancia = (b.numero_constancia || b.numero_operacion || '').trim();
            const cuentaOrigen = (b.cuenta_origen || '').trim();
            const usuarioPago = (req.user && req.user.nombre) ? req.user.nombre : (b.usuario || 'Tesorería');
            const descripcionPago = (b.descripcion || `ORDEN DE COMPRA: ${id}`).trim();
            const montoPagado = parseFloat(b.monto || b.importe) || 0;
            const monedaPago = (b.moneda || 'PEN').toUpperCase();

            // 1. Obtener la Orden de Compra actual
            const [ocRows] = await tdb.query("SELECT * FROM entradas_inv WHERE id = ?", [id]);
            if (!ocRows.length) return res.status(404).json({ error: 'Orden de Compra no encontrada' });
            const oc = ocRows[0];

            // 2. Subir voucher a S3 si se adjuntó
            let voucherUrl = oc.url_voucher || null;
            if (req.file) {
                const f = req.file;
                const ext = (f.originalname.split('.').pop() || 'jpg').toLowerCase();
                const key = `tesoreria/requerimientos/voucher_${id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
                voucherUrl = await uploadToS3(f.buffer, key, f.mimetype);
            }

            // 3. Actualizar estado de la Orden de Compra a PROCESADO
            await tdb.query(`
                UPDATE entradas_inv SET
                    estado = 'Procesado',
                    numero_operacion = ?,
                    cuenta_bancaria_empresa = ?,
                    url_voucher = ?,
                    pagado_por = ?,
                    fecha_pago = NOW()
                WHERE id = ?
            `, [numeroConstancia, cuentaOrigen, voucherUrl, usuarioPago, id]);

            // 4. Asentar egreso automático en tesoreria_caja (Conciliación automática)
            try {
                const anioActual = new Date().getFullYear();
                const [maxRow] = await tdb.query(
                    "SELECT numero FROM tesoreria_caja WHERE serie = ? ORDER BY id DESC LIMIT 1",
                    [String(anioActual)]
                );
                let nextNum = 1;
                if (maxRow && maxRow[0] && maxRow[0].numero) {
                    const match = String(maxRow[0].numero).match(/\d+$/);
                    if (match) nextNum = parseInt(match[0], 10) + 1;
                }
                const formatted = String(nextNum).padStart(8, '0');

                const insertCajaSql = `
                    INSERT INTO tesoreria_caja (
                        fecha, hora, fecha_valuta, hora_valuta,
                        numero_constancia_deposito, numero_factura, serie, numero,
                        orden_viaje, conductor, ruta_viaje, placa,
                        autoriza, motivo, centro_costo, sub_motivo, modalidad_pago, moneda,
                        tipo_persona, persona, tipo_movimiento, subtotal,
                        retencion_detraccion, importe_total, tipo_cambio, descripcion,
                        tipo_comprobante, cuenta_bancaria_persona, cuenta_bancaria_empresa,
                        voucher_url, observacion, no_aplica_liquidacion,
                        estado, usuario_creacion, usuario_aprobacion, fecha_aprobacion
                    ) VALUES (
                        CURDATE(), CURTIME(), CURDATE(), CURTIME(),
                        ?, ?, ?, ?,
                        ?, '', '', ?,
                        ?, ?, ?, ?, ?, ?,
                        'PROVEEDOR', ?, 'EGRESO', ?,
                        0, ?, ?, ?,
                        'ORDEN DE COMPRA', ?, ?,
                        ?, ?, 0,
                        'PROCESADO', ?, ?, NOW()
                    )
                `;

                const monStr = (oc.moneda || monedaPago || 'SOLES').toUpperCase().includes('DOL') ? 'DOLARES' : 'SOLES';
                const totalFinal = montoPagado || parseFloat(oc.total_pen) || 0;

                await tdb.query(insertCajaSql, [
                    numeroConstancia || '',
                    oc.documento_referencia || '',
                    String(anioActual),
                    formatted,
                    oc.ot_id || '',
                    oc.placa || '',
                    oc.autoriza || oc.aprobado_por || usuarioPago,
                    oc.motivo_entrada || 'COMPRA / ALMACÉN',
                    oc.centro_costo || 'CC-100',
                    'PAGO REQUERIMIENTO',
                    cuentaOrigen.includes('CAJA') ? 'EFECTIVO' : 'TRANSFERENCIA',
                    monStr,
                    oc.proveedor_nombre || 'PROVEEDOR GENERAL',
                    totalFinal,
                    totalFinal,
                    oc.tipo_cambio || 1,
                    `PAGO DE REQUERIMIENTO OC ${id} - ${descripcionPago}`,
                    oc.cuenta_bancaria_proveedor || '',
                    cuentaOrigen || 'BCP - CTA CTE SOLES',
                    voucherUrl,
                    `PAGO DE REQUERIMIENTO OC ${id} | N° Constancia: ${numeroConstancia}`,
                    oc.creado_por || usuarioPago,
                    oc.aprobado_por || oc.autoriza || usuarioPago
                ]);
            } catch (errCaja) {
                console.warn('Advertencia al asentar egreso en tesoreria_caja:', errCaja.message);
            }

            // 5. Auditoría y broadcast
            if (typeof logAudit === 'function') {
                logAudit(usuarioPago, 'tesoreria/pago-requerimientos', 'PROCESÓ PAGO', `OC: ${id} - Constancia: ${numeroConstancia} - Monto: ${monedaPago} ${montoPagado}`);
            }
            if (typeof broadcast === 'function') {
                broadcast('almacen', 'actualizar_oc');
                broadcast('tesoreria', 'pago_procesado');
            }

            res.json({
                ok: true,
                success: true,
                message: 'Pago de requerimiento procesado exitosamente',
                id: id,
                estado: 'Procesado',
                numero_operacion: numeroConstancia,
                voucher_url: voucherUrl
            });
        } catch (err) {
            console.error('Error al procesar pago de requerimiento:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================================
    // 📊 MOVIMIENTOS DE TESORERÍA (Libro Banco & Caja Unificado)
    // ============================================================
    router.delete('/movimientos/:id', async (req, res) => {
        try {
            await ensureTableCaja(req);
            const tdb = getDb(req);
            const { id } = req.params;
            const [rows] = await tdb.query('SELECT voucher_url, sustento_url FROM tesoreria_caja WHERE id = ?', [id]);
            await tdb.query('DELETE FROM tesoreria_caja WHERE id = ?', [id]);
            if (rows && rows.length) {
                if (rows[0].voucher_url) deleteFromS3(s3KeyFromUrl(rows[0].voucher_url)).catch(() => {});
                if (rows[0].sustento_url) deleteFromS3(s3KeyFromUrl(rows[0].sustento_url)).catch(() => {});
            }
            res.json({ ok: true, message: 'Movimiento eliminado correctamente' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/movimientos', async (req, res) => {
        try {
            const tdb = getDb(req);
            if (!tdb) return res.status(500).json({ error: 'DB no disponible' });
            await ensureTableCaja(req);
            await ensureTableCentrosCostos(req);
            await _ensureColumnasPagoRequerimientos(tdb);

            // Limpieza preventiva de movimientos huérfanos de OCs que ya fueron eliminadas del sistema
            try {
                await tdb.query(`
                    DELETE c FROM tesoreria_caja c
                    LEFT JOIN entradas_inv e ON (
                        c.descripcion LIKE CONCAT('%', e.id, '%') 
                        OR c.descripcion LIKE CONCAT('%', REPLACE(e.id, 'ENT-', ''), '%')
                        OR c.observacion LIKE CONCAT('%', e.id, '%')
                        OR c.observacion LIKE CONCAT('%', REPLACE(e.id, 'ENT-', ''), '%')
                    )
                    WHERE (c.tipo_comprobante = 'ORDEN DE COMPRA' OR c.sub_motivo = 'PAGO REQUERIMIENTO' OR c.descripcion LIKE '%PAGO DE REQUERIMIENTO OC%')
                      AND e.id IS NULL
                `);
            } catch (errPurge) {}

            const { banco, estado, fecha_desde, fecha_hasta, tipo_movimiento, search } = req.query;

            let condiciones = ["1=1"];
            let params = [];

            if (fecha_desde) {
                condiciones.push("c.fecha >= ?");
                params.push(fecha_desde);
            }
            if (fecha_hasta) {
                condiciones.push("c.fecha <= ?");
                params.push(fecha_hasta);
            }
            if (estado && estado !== 'TODOS' && estado !== '') {
                condiciones.push("UPPER(c.estado) = ?");
                params.push(estado.toUpperCase());
            }
            if (tipo_movimiento && tipo_movimiento !== 'TODOS' && tipo_movimiento !== '') {
                condiciones.push("UPPER(c.tipo_movimiento) = ?");
                params.push(tipo_movimiento.toUpperCase());
            }
            if (banco && banco !== 'TODOS' && banco !== '') {
                condiciones.push("UPPER(COALESCE(c.cuenta_bancaria_empresa, '')) LIKE ?");
                params.push(`%${banco.toUpperCase()}%`);
            }

            const sql = `
                SELECT 
                    c.*,
                    DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
                    DATE_FORMAT(c.fecha_valuta, '%Y-%m-%d') AS fecha_valuta,
                    CONCAT(COALESCE(c.serie, YEAR(c.fecha)), '-', LPAD(COALESCE(c.numero, c.id), 6, '0')) AS codigo_caja,
                    COALESCE(c.importe_total, c.subtotal, 0) AS monto_total,
                    cc.nombre AS centro_costo_nombre
                FROM tesoreria_caja c
                LEFT JOIN tesoreria_centros_costos cc ON cc.codigo = c.centro_costo
                WHERE ${condiciones.join(" AND ")}
                ORDER BY c.fecha DESC, c.id DESC
            `;

            const [rows] = await tdb.query(sql, params);

            // Enriquecer registros con URLs firmadas y campos unificados
            const resultado = await Promise.all((rows || []).map(async (r) => {
                let voucherPresigned = null;
                const vUrl = r.voucher_url || r.sustento_url;
                if (vUrl) {
                    const k = s3KeyFromUrl(vUrl);
                    if (k) voucherPresigned = await getPresignedUrl(k).catch(() => vUrl);
                    else voucherPresigned = vUrl;
                }

                const tipoMov = (r.tipo_movimiento || 'EGRESO').toUpperCase();
                const montoNum = parseFloat(r.monto_total || r.importe_total || r.subtotal || 0) || 0;
                const esIngreso = tipoMov === 'INGRESO';

                // Detectar si proviene de una Orden de Compra
                const descStr = String(r.descripcion || '') + ' ' + String(r.observacion || '');
                const ocMatch = descStr.match(/OC\s+(ENT-\d{4}-\d+|\d{4}-\d+)/i) || 
                                (r.tipo_comprobante === 'ORDEN DE COMPRA' ? descStr.match(/(ENT-\d{4}-\d+|\d{4}-\d+)/i) : null);
                const codigoOC = ocMatch ? ocMatch[1].replace(/^ENT-/i, '') : null;
                const esOC = Boolean(codigoOC || (r.tipo_comprobante && r.tipo_comprobante.toUpperCase().includes('ORDEN')) || (r.sub_motivo && r.sub_motivo.toUpperCase().includes('REQUERIMIENTO')));
                const tipoOrigen = esOC ? 'ORDEN DE COMPRA' : 'CAJA CHICA';
                const cajaFolioFinal = esOC && codigoOC ? codigoOC : (r.codigo_caja || `CJ-${r.id}`);

                return {
                    id: r.id,
                    caja_folio: cajaFolioFinal,
                    codigo_oc: codigoOC,
                    tipo_origen: tipoOrigen,
                    fecha: r.fecha,
                    hora: r.hora || null,
                    tipo_movimiento: tipoMov,
                    moneda: (r.moneda || 'SOLES').toUpperCase(),
                    monto: montoNum,
                    debe: esIngreso ? montoNum : 0,
                    haber: !esIngreso ? montoNum : 0,
                    motivo: r.motivo || 'GENERAL',
                    sub_motivo: r.sub_motivo || '-',
                    descripcion: r.descripcion || r.observacion || '-',
                    tipo_caja: (r.cuenta_bancaria_empresa && r.cuenta_bancaria_empresa.includes('CAJA')) ? 'CAJA' : 'BANCO',
                    banco_cuenta: r.cuenta_bancaria_empresa || 'BANCO PRINCIPAL',
                    numero_operacion: r.numero_constancia_deposito || r.numero || '-',
                    numero_factura: r.numero_factura || '-',
                    beneficiario: r.persona || '-',
                    tipo_persona: r.tipo_persona || 'PROVEEDOR',
                    usuario_creacion: r.usuario_creacion || r.creado_por || '-',
                    solicitante: r.solicitante || r.usuario_creacion || '-',
                    autoriza: r.usuario_aprobacion || r.autoriza || '-',
                    observacion: r.observacion || '',
                    fecha_aprobacion: r.fecha_aprobacion || null,
                    fecha_valuta: r.fecha_valuta || r.fecha,
                    cliente: '-',
                    tipo_servicio: '-',
                    orden_viaje: r.orden_viaje || '-',
                    placa: r.placa || '-',
                    ruta: r.ruta_viaje || '-',
                    centro_costo: r.centro_costo || 'CC-ADM',
                    centro_costo_nombre: r.centro_costo_nombre || '',
                    estado: (r.estado || 'PROCESADO').toUpperCase(),
                    voucher_url: vUrl,
                    voucher_url_presigned: voucherPresigned
                };
            }));

            res.json({ ok: true, data: resultado });
        } catch (err) {
            console.error('Error en GET /api/tesoreria/movimientos:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};

