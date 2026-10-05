const express = require('express');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB max
const { uploadToS3 } = require('../utils/s3');
const { createApprovalToken } = require('../services/ocApprovalService');
const { sendApprovalWhatsapp, sendDecisionConfirmationWhatsapp } = require('../services/whatsappService');

module.exports = function (db, broadcast, logAudit) {
    const router = express.Router();

    function getDb(req) {
        const d = (req && req.db) ? req.db : db;
        if (!d) return null;
        return (typeof d.promise === 'function') ? d.promise() : d;
    }

    // ── 1. LISTAR ÓRDENES DE COMPRA ──────────────────────────────────
    router.get('/api/ordenes-compra', async (req, res) => {
        try {
            const tdb = getDb(req);
            const [rows] = await tdb.query(
                `SELECT oc.*, 
                        (SELECT COUNT(*) FROM ordenes_compra_items WHERE orden_compra_id = oc.id) AS total_items,
                        (SELECT estado FROM oc_approval_tokens WHERE orden_compra_id = oc.id ORDER BY id DESC LIMIT 1) AS token_estado
                 FROM ordenes_compra oc
                 ORDER BY oc.id DESC`
            );
            return res.json(rows);
        } catch (err) {
            console.error('Error listando órdenes de compra:', err);
            return res.status(500).json({ error: 'Error al obtener las órdenes de compra' });
        }
    });

    // ── 2. CREAR ÓRDEN DE COMPRA Y DESPACHAR APROBACIÓN POR WHATSAPP ──
    router.post('/api/ordenes-compra', upload.single('sustento_archivo'), async (req, res) => {
        const tdb = getDb(req);
        if (!tdb) return res.status(500).json({ error: 'Error de conexión a la base de datos' });

        try {
            let body = req.body;
            if (typeof body.items === 'string') {
                try { body.items = JSON.parse(body.items); } catch(e) { body.items = []; }
            }

            const {
                codigo,
                proveedor_nombre,
                proveedor_ruc,
                monto_total,
                moneda = 'PEN',
                motivo_solicitud,
                aprobador_telefono, // Teléfono del dueño / aprobador
                aprobador_nombre,
                solicitado_por
            } = body;

            if (!proveedor_nombre) {
                return res.status(400).json({ error: 'El nombre del proveedor es obligatorio' });
            }

            // Manejo de archivo de sustento (PDF/Foto) a S3 o almacenamiento
            let sustentoUrl = body.sustento_cotizacion_url || null;
            if (req.file) {
                try {
                    const ext = req.file.originalname.split('.').pop() || 'pdf';
                    const s3Key = `ordenes_compra/sustentos/OC_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
                    sustentoUrl = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
                } catch (errS3) {
                    console.error('Error subiendo sustento a S3:', errS3);
                }
            }

            // Generar código de OC si no viene especificado
            let finalCode = codigo;
            if (!finalCode) {
                const year = new Date().getFullYear();
                const [countRows] = await tdb.query("SELECT COUNT(*) as cnt FROM ordenes_compra WHERE YEAR(creado_en) = ?", [year]);
                const seq = (countRows[0]?.cnt || 0) + 1;
                finalCode = `OC-${year}-${String(seq).padStart(4, '0')}`;
            }

            // Iniciar transacción en MySQL
            await tdb.query('START TRANSACTION');

            const [ocResult] = await tdb.query(
                `INSERT INTO ordenes_compra (codigo, proveedor_nombre, proveedor_ruc, monto_total, moneda, motivo_solicitud, sustento_cotizacion_url, solicitado_por, estado)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE_APROBACION')`,
                [finalCode, proveedor_nombre, proveedor_ruc || null, monto_total || 0, moneda, motivo_solicitud || null, sustentoUrl, solicitado_por || req.usuario?.nombre || 'Sistema']
            );
            const ocId = ocResult.insertId;

            // Insertar ítems
            const itemsList = Array.isArray(body.items) ? body.items : [];
            for (const item of itemsList) {
                await tdb.query(
                    `INSERT INTO ordenes_compra_items (orden_compra_id, descripcion, cantidad, unidad_medida, precio_unitario, subtotal)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [ocId, item.descripcion, item.cantidad || 1, item.unidad_medida || 'UND', item.precio_unitario || 0, item.subtotal || 0]
                );
            }

            await tdb.query('COMMIT');

            // Obtener datos del tenant y empresa
            const tenantSlug = req.tenantSlug || (req.headers.host ? req.headers.host.split('.')[0] : null);
            let empresaNombre = req.tenantInfo?.nombre_empresa || null;
            if (!empresaNombre) {
                try {
                    const [cfgName] = await tdb.query("SELECT valor FROM configuracion_erp WHERE clave = 'empresa_nombre' LIMIT 1");
                    if (cfgName && cfgName[0] && cfgName[0].valor) empresaNombre = cfgName[0].valor;
                } catch(e) {}
            }

            // Generar Token criptográfico y enlace de Aprobación Móvil
            let approvalUrl = null;
            let waResult = null;
            
            // Prioridad de teléfono: 1. Enviado en body, 2. Guardado en configuracion_erp, 3. Variable de entorno .env
            let targetPhone = aprobador_telefono;
            if (!targetPhone) {
                try {
                    const [cfgPhone] = await tdb.query("SELECT valor FROM configuracion_erp WHERE clave IN ('gerencia_whatsapp', 'aprobador_whatsapp', 'telefono_gerencia') LIMIT 1");
                    if (cfgPhone && cfgPhone[0] && cfgPhone[0].valor) targetPhone = cfgPhone[0].valor;
                } catch(e) {}
            }
            if (!targetPhone) {
                targetPhone = process.env.GERENCIA_WHATSAPP || process.env.OWNER_WHATSAPP;
            }

            if (targetPhone) {
                const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
                const tokenData = await createApprovalToken(tdb, {
                    ocId,
                    approverPhone: targetPhone,
                    approverName: aprobador_nombre || 'Gerencia',
                    baseUrl: origin
                });
                approvalUrl = tokenData.approvalUrl;

                // Despachar WhatsApp a través de Evolution API
                waResult = await sendApprovalWhatsapp({
                    phone: targetPhone,
                    ocCode: finalCode,
                    supplier: proveedor_nombre,
                    total: monto_total,
                    currency: moneda,
                    approvalUrl: approvalUrl,
                    solicitadoPor: solicitado_por || req.usuario?.nombre,
                    motivo: motivo_solicitud,
                    tenantSlug: tenantSlug,
                    empresaNombre: empresaNombre
                });
            }

            if (logAudit) {
                logAudit(req, 'ORDENES_COMPRA', 'CREAR', `Orden de Compra #${finalCode} registrada y enviada para aprobación.`);
            }

            return res.status(201).json({
                success: true,
                message: 'Orden de compra registrada exitosamente.',
                ocId,
                codigo: finalCode,
                approvalUrl,
                whatsappSent: waResult?.success || false
            });

        } catch (err) {
            try { await tdb.query('ROLLBACK'); } catch(e) {}
            console.error('Error creando orden de compra:', err);
            return res.status(500).json({ error: 'Error al procesar la orden de compra: ' + err.message });
        }
    });

    // ── 3. DETALLE DE ORDEN DE COMPRA (INTERNA) ──────────────────────
    router.get('/api/ordenes-compra/:id', async (req, res) => {
        try {
            const tdb = getDb(req);
            const term = req.params.id;
            const [rows] = await tdb.query('SELECT * FROM ordenes_compra WHERE id = ? OR codigo = ?', [term, term]);
            if (!rows.length) return res.status(404).json({ error: 'Orden de compra no encontrada' });

            const ocId = rows[0].id;
            const [items] = await tdb.query('SELECT * FROM ordenes_compra_items WHERE orden_compra_id = ?', [ocId]);
            const [tokens] = await tdb.query('SELECT * FROM oc_approval_tokens WHERE orden_compra_id = ? ORDER BY id DESC', [ocId]);

            return res.json({ ...rows[0], items, tokens });
        } catch (err) {
            return res.status(500).json({ error: 'Error al obtener detalle de la orden de compra' });
        }
    });

    // ── 4. ENDPOINT PÚBLICO: OBTENER DATOS PARA LA PANTALLA MÓVIL VÍA TOKEN ──
    router.get('/api/approvals/oc', async (req, res) => {
        const { t: token } = req.query;
        if (!token) return res.status(400).json({ error: 'Token de aprobación requerido' });

        try {
            const tdb = getDb(req);
            const [rows] = await tdb.query(
                `SELECT t.id AS token_id, t.estado AS token_estado, t.expira_en, t.usado_en, t.aprobador_telefono,
                        oc.id AS oc_id, oc.codigo, oc.proveedor_nombre, oc.proveedor_ruc, oc.monto_total, 
                        oc.moneda, oc.motivo_solicitud, oc.sustento_cotizacion_url, oc.estado AS oc_estado,
                        oc.solicitado_por, oc.creado_en
                 FROM oc_approval_tokens t
                 JOIN ordenes_compra oc ON t.orden_compra_id = oc.id
                 WHERE t.token = ?`,
                [token]
            );

            if (rows.length === 0) {
                return res.status(404).json({ error: 'El enlace de aprobación no existe o es inválido.' });
            }

            const record = rows[0];
            const isExpired = new Date() > new Date(record.expira_en);

            const [items] = await tdb.query(
                `SELECT id, descripcion, cantidad, unidad_medida, precio_unitario, subtotal 
                 FROM ordenes_compra_items 
                 WHERE orden_compra_id = ?`,
                [record.oc_id]
            );

            return res.json({
                ...record,
                is_expired: isExpired,
                is_used: record.token_estado !== 'PENDIENTE',
                items
            });

        } catch (err) {
            console.error('Error validando token de OC:', err);
            return res.status(500).json({ error: 'Error al consultar la orden' });
        }
    });

    // ── 5. ENDPOINT PÚBLICO: PROCESAR DECISIÓN (APROBAR / RECHAZAR) VÍA TOKEN ──
    router.post('/api/approvals/oc/action', async (req, res) => {
        const { token, action, reason, approver_name } = req.body; // action: 'APPROVE' | 'REJECT'

        if (!token || !['APPROVE', 'REJECT'].includes(action)) {
            return res.status(400).json({ error: 'Parámetros inválidos' });
        }

        const tdb = getDb(req);
        if (!tdb) return res.status(500).json({ error: 'Error de base de datos' });

        try {
            const [tokens] = await tdb.query(
                `SELECT t.*, oc.codigo, oc.proveedor_nombre 
                 FROM oc_approval_tokens t
                 JOIN ordenes_compra oc ON t.orden_compra_id = oc.id
                 WHERE t.token = ?`,
                [token]
            );

            if (tokens.length === 0) {
                return res.status(404).json({ error: 'Solicitud no encontrada.' });
            }

            const tok = tokens[0];

            if (tok.estado !== 'PENDIENTE') {
                return res.status(400).json({ error: `Esta orden ya fue procesada anteriormente con estado: ${tok.estado}.` });
            }

            if (new Date() > new Date(tok.expira_en)) {
                return res.status(410).json({ error: 'Este enlace de aprobación ha expirado (vigencia de 24 horas).' });
            }

            const newOcStatus = action === 'APPROVE' ? 'APROBADA' : 'RECHAZADA';
            const newTokStatus = action === 'APPROVE' ? 'APROBADO' : 'RECHAZADO';
            const aprobador = approver_name || tok.aprobador_nombre || 'Dueño / Gerencia';

            await tdb.query('START TRANSACTION');

            // Actualizar Orden de Compra
            await tdb.query(
                `UPDATE ordenes_compra 
                 SET estado = ?, 
                     aprobado_por = ?, 
                     aprobado_en = NOW(), 
                     motivo_rechazo = ? 
                 WHERE id = ?`,
                [newOcStatus, aprobador, reason || null, tok.orden_compra_id]
            );

            // Sincronizar actualización en entradas_inv del ERP
            try {
                await tdb.query(
                    `UPDATE entradas_inv 
                     SET estado = ?, 
                         autoriza = ? 
                     WHERE id = ?`,
                    [newOcStatus === 'APROBADA' ? 'Aprobado' : 'Rechazado', aprobador, tok.codigo]
                );
            } catch(e) {}

            // Actualizar Token a consumido
            await tdb.query(
                `UPDATE oc_approval_tokens 
                 SET estado = ?, 
                     usado_en = NOW(), 
                     motivo_rechazo = ? 
                 WHERE id = ?`,
                [newTokStatus, reason || null, tok.id]
            );

            await tdb.query('COMMIT');

            // Enviar confirmación por WhatsApp en segundo plano
            if (tok.aprobador_telefono) {
                const tenantSlug = req.tenantSlug || (req.headers.host ? req.headers.host.split('.')[0] : null);
                sendDecisionConfirmationWhatsapp({
                    phone: tok.aprobador_telefono,
                    ocCode: tok.codigo,
                    status: newOcStatus,
                    reason: reason,
                    tenantSlug: tenantSlug
                }).catch(e => console.error('Error enviando confirmación:', e));
            }

            return res.json({
                success: true,
                status: newOcStatus,
                message: action === 'APPROVE' ? 'Orden autorizada con éxito' : 'Orden rechazada correctamente'
            });

        } catch (err) {
            try { await tdb.query('ROLLBACK'); } catch(e) {}
            console.error('Error procesando decisión de OC:', err);
            return res.status(500).json({ error: 'Error procesando la aprobación: ' + err.message });
        }
    });

    return router;
};
