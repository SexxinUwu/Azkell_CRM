const express = require('express');
const { tipoCambioSunat } = require('../services/tipo_cambio');
const { crearLlantasDeRecepcion } = require('../services/neumaticos_codigo');
const router = express.Router();

// Nombre de las llantas: "Llanta <marca> <medida> <modelo>" (p. ej. "Llanta MICHELIN 295/80R22.5 XMULTI").
// Sin medida ni modelo no hay nombre de llanta y queda la regla general.
// Los demás artículos siguen la regla general (artículo, código, compatibles, marca).
const esFamiliaLlanta = f => String(f || '').trim().toUpperCase() === 'NEUMATICOS';
const nombreLlanta = ({ marca, modelo, medida }) => {
    const medMod = [medida, modelo].map(v => String(v || '').trim()).filter(Boolean).join(' ');
    if (!medMod) return '';
    const mar = String(marca || '').trim();
    return ['Llanta', mar, medMod].filter(Boolean).join(' ');
};
    // Compra o artículo en dólares sin tipo de cambio: se toma el de la SUNAT del día (nunca 1)
    const tcSunatSiFalta = async (req, res, next) => {
        try {
            const b = req.body || {};
            if (String(b.moneda || '').toUpperCase() === 'USD' && !(parseFloat(b.tipo_cambio) > 0)) {
                b.tipo_cambio = (await tipoCambioSunat()).venta;
            }
            next();
        } catch (e) {
            res.status(503).json({ error: 'Falta el tipo de cambio y no se pudo consultar la SUNAT: ' + e.message });
        }
    };
const { createApprovalToken } = require('../services/ocApprovalService');
const { fechaVencimiento, normalizarCondicion } = require('../services/condicion_oc');
const { sendApprovalWhatsapp, sendTreasuryNotificationWhatsapp } = require('../services/whatsappService');
const eventosNotif = require('../services/notificaciones_eventos');

async function despacharAprobacionWhatsAppAlmacen(req, tdb, entradaId, bodyData) {
    try {
        const promiseDb = typeof tdb.promise === 'function' ? tdb.promise() : tdb;
        const tenantSlug = req.tenantSlug || (req.headers.host ? req.headers.host.split('.')[0] : null);

        // 1. Obtener datos de la empresa y receptor
        let empresaNombre = req.tenantInfo?.nombre_empresa || (tenantSlug ? tenantSlug.toUpperCase() : 'Azkell ERP');
        let targetPhone = bodyData.aprobador_telefono || null;
        let approverName = bodyData.aprobador_nombre || null;

        try {
            const [cfgRows] = await promiseDb.query(
                "SELECT clave, valor FROM configuracion_erp WHERE clave IN ('empresa_nombre', 'gerencia_whatsapp', 'aprobador_whatsapp', 'gerencia_nombre')"
            );
            (cfgRows || []).forEach(r => {
                if (r.clave === 'empresa_nombre' && r.valor) empresaNombre = r.valor;
                if (!targetPhone && (r.clave === 'gerencia_whatsapp' || r.clave === 'aprobador_whatsapp') && r.valor) targetPhone = r.valor;
                if (!approverName && r.clave === 'gerencia_nombre' && r.valor) approverName = r.valor;
            });
        } catch(e) {}

        if (!approverName) {
            approverName = bodyData.autoriza || 'Gerencia General';
        }

        if (!targetPhone) {
            targetPhone = process.env.GERENCIA_WHATSAPP || process.env.OWNER_WHATSAPP;
        }

        // Aviso por la regla "Aprobación de orden de compra" (correo y otros destinatarios de la pantalla de Notificaciones).
        // Al número del aprobador no se le repite: ese ya recibe abajo el WhatsApp con el enlace para aprobar.
        try {
            const [ocs] = await promiseDb.query('SELECT id, proveedor_nombre, moneda, total_pen, tipo_cambio, motivo_entrada, creado_por FROM entradas_inv WHERE id = ? LIMIT 1', [entradaId]);
            const o = ocs && ocs[0];
            if (o) {
                eventosNotif.notificar(tdb, 'oc_aprobacion', {
                    ...eventosNotif.avisoOrdenCompra({ id: o.id, proveedor: o.proveedor_nombre, moneda: o.moneda, totalPen: o.total_pen, tipoCambio: o.tipo_cambio, motivo: o.motivo_entrada, solicitante: o.creado_por, empresa: empresaNombre }),
                    excluir: [targetPhone],
                }, { dedupeMin: 30 });
            }
        } catch (e) { console.warn('[Notificaciones] oc_aprobacion:', e.message); }

        if (!targetPhone) {
            console.warn(`[WhatsApp OC] No hay teléfono de gerencia configurado para el tenant: ${tenantSlug || 'default'}`);
            return;
        }

        // 2. Calcular Monto Total exacto de los ítems o base de datos
        const itemsList = Array.isArray(bodyData.items) ? bodyData.items : [];
        let total = 0;
        if (itemsList.length > 0) {
            total = itemsList.reduce((acc, it) => {
                const cant = parseFloat(it.cantidad != null ? it.cantidad : (it.cant != null ? it.cant : 1));
                const pu = parseFloat(it.costo_unitario != null ? it.costo_unitario : (it.pu != null ? it.pu : 0));
                const imp = it.importe != null ? parseFloat(it.importe) : (it.total != null ? parseFloat(it.total) : (cant * pu));
                return acc + (isNaN(imp) ? 0 : imp);
            }, 0);
        }

        if (!total || total === 0) {
            total = parseFloat(bodyData.total_pen || bodyData.total || bodyData.monto_total || 0);
        }

        if (!total || total === 0) {
            try {
                const [entRows] = await promiseDb.query("SELECT total_pen, moneda, url_cotizacion FROM entradas_inv WHERE id = ? LIMIT 1", [entradaId]);
                if (entRows && entRows.length > 0) {
                    if (parseFloat(entRows[0].total_pen) > 0) total = parseFloat(entRows[0].total_pen);
                    if (!bodyData.url_cotizacion && entRows[0].url_cotizacion) bodyData.url_cotizacion = entRows[0].url_cotizacion;
                }
            } catch(e) {}
        }

        const moneda = bodyData.moneda || 'PEN';
        const proveedor = bodyData.proveedor_nombre || 'Proveedor General';
        const ruc = bodyData.proveedor_ruc || null;
        const motivo = bodyData.motivo_entrada || bodyData.observaciones || 'Solicitud de Compra / Entrada';
        const sustentoUrl = bodyData.url_cotizacion || bodyData.url_voucher || null;
        const solicitante = bodyData.solicitante || bodyData.creado_por || req.usuario?.nombre || 'Almacén / Taller';

        await promiseDb.query(
            `INSERT INTO ordenes_compra (codigo, proveedor_nombre, proveedor_ruc, monto_total, moneda, motivo_solicitud, sustento_cotizacion_url, solicitado_por, estado, condicion_pago, dias_credito)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE_APROBACION', ?, ?)
             ON DUPLICATE KEY UPDATE 
                condicion_pago = VALUES(condicion_pago),
                dias_credito = VALUES(dias_credito),
                proveedor_nombre = VALUES(proveedor_nombre),
                monto_total = VALUES(monto_total),
                moneda = VALUES(moneda),
                motivo_solicitud = VALUES(motivo_solicitud),
                sustento_cotizacion_url = VALUES(sustento_cotizacion_url),
                solicitado_por = VALUES(solicitado_por)`,
            [entradaId, proveedor, ruc, total, moneda, motivo, sustentoUrl, solicitante, normalizarCondicion(bodyData).condicion_pago, normalizarCondicion(bodyData).dias_credito]
        );

        // Obtener ID numérico de ordenes_compra
        const [ocRows] = await promiseDb.query("SELECT id FROM ordenes_compra WHERE codigo = ? LIMIT 1", [entradaId]);
        if (!ocRows || !ocRows.length) return;
        const ocId = ocRows[0].id;

        // Sincronizar items en ordenes_compra_items
        if (itemsList.length > 0) {
            await promiseDb.query("DELETE FROM ordenes_compra_items WHERE orden_compra_id = ?", [ocId]);
            for (const it of itemsList) {
                const cant = parseFloat(it.cantidad || it.cant || 1);
                const pu = parseFloat(it.costo_unitario || it.pu || 0);
                const sub = parseFloat(it.importe || it.total || (cant * pu));
                await promiseDb.query(
                    `INSERT INTO ordenes_compra_items (orden_compra_id, descripcion, cantidad, unidad_medida, precio_unitario, subtotal)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [ocId, it.descripcion || 'Item', cant, it.unidad_medida || it.um || 'UND', pu, sub]
                );
            }
        }

        // 3. Generar token criptográfico de aprobación de 24h
        const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
        const tokenData = await createApprovalToken(promiseDb, {
            ocId,
            approverPhone: targetPhone,
            approverName: approverName,
            baseUrl: origin
        });

        // 4. Enviar WhatsApp a través de Evolution API
        const waResult = await sendApprovalWhatsapp({
            phone: targetPhone,
            ocCode: entradaId,
            supplier: proveedor,
            total: total,
            currency: moneda,
            approvalUrl: tokenData.approvalUrl,
            solicitadoPor: solicitante,
            motivo: motivo,
            tenantSlug: tenantSlug,
            empresaNombre: empresaNombre
        });

        console.log(`[WhatsApp OC] Despachado a ${targetPhone} para orden ${entradaId}:`, waResult?.success ? 'OK' : waResult?.error);

    } catch (err) {
        console.error('[WhatsApp OC] Error despachando aprobación:', err.message);
    }
}

module.exports = (db, _multerInv, logAudit, _generarCodigoAlmacen) => {
    const { audit: auditar, actorFrom: actorDe, diff } = require('../services/auditoria');

    function getDb(req) {
        return (req && req.db) ? req.db : db;
    }

    // ── Middleware de Auditoría Automática para Almacén ────────────────
    router.use((req, res, next) => {
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
            const originalJson = res.json.bind(res);
            res.json = function (data) {
                if (data && (data.ok === true || data.data === 'Éxito' || data.success || data.id || res.statusCode < 400)) {
                    if (typeof logAudit === 'function') {
                        const accion = req.method === 'POST' ? 'CREÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'MODIFICÓ';
                        let sub = req.path.replace(/^\//, '').split('/')[0] || 'General';
                        sub = sub.toUpperCase();
                        let desc = `Operación de ${accion.toLowerCase()} en Almacén (${req.path})`;
                        if (req.body) {
                            if (req.body.descripcion) desc = `${accion} item/artículo: ${req.body.descripcion}`;
                            else if (req.body.id || req.params.id) desc = `${accion} registro ${req.body.id || req.params.id} en ${sub}`;
                            else if (req.body.razon_social) desc = `${accion} proveedor ${req.body.razon_social}`;
                            else if (req.body.categoria) desc = `${accion} categoría ${req.body.categoria}`;
                        }
                        logAudit(req, 'ALMACEN', sub, accion, desc);
                    }
                }
                return originalJson(data);
            };
        }
        next();
    });

    // ── Helper: sumar total_pen de detalle (convierte USD con tipo_cambio) ───
    function _calcularTotalPen(detalles, tc, monedaCabecera) {
        const tcNum = parseFloat(tc) || 1;
        const cabIsUSD = String(monedaCabecera || '').toUpperCase() === 'USD';
        return (detalles || []).reduce((acc, d) => {
            const cant = parseFloat(d.cantidad) || 0;
            const cu = parseFloat(d.costo_unitario) || 0;
            const imp = (d.importe !== undefined && d.importe !== null && d.importe !== '') ? parseFloat(d.importe) : (cant * cu);
            const val = isNaN(imp) ? (cant * cu) : imp;
            const isUSD = (d.moneda === 'USD' || cabIsUSD);
            return acc + (isUSD ? val * tcNum : val);
        }, 0);
    }

    // ── Reset de Recepciones de Prueba (Iniciar de 0) ───
    router.post('/reset-recepciones', (req, res) => {
        getDb(req).query('DELETE FROM detalle_recepciones_oc', () => {
            getDb(req).query('DELETE FROM recepciones_oc', () => {
                getDb(req).query("UPDATE entradas_inv SET estado = 'Registrado' WHERE estado IS NULL OR estado != 'Anulado'", () => {
                    res.json({ ok: true, message: 'Recepciones reiniciadas a 0 y OCs en estado Registrado' });
                });
            });
        });
    });

    // ============================================================
    // ALMACÉN — Configuración
    // ============================================================
    router.get('/configuracion', (req, res) => {
        getDb(req).query('SELECT clave, valor FROM configuracion_almacen', (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const obj = {};
            rows.forEach(r => { obj[r.clave] = r.valor; });
            res.json(obj);
        });
    });
    router.put('/configuracion', (req, res) => {
        const entries = Object.entries(req.body);
        if (!entries.length) { if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json({ ok: true }); }
        const vals = entries.map(([k, v]) => [k, String(v)]);
        getDb(req).query('INSERT INTO configuracion_almacen (clave,valor) VALUES ? ON DUPLICATE KEY UPDATE valor=VALUES(valor)',
            [vals], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            });
    });

    // ============================================================
    // ALMACÉN — Proveedores
    // ============================================================
    router.get('/proveedores', (req, res) => {
        const q = `
        SELECT p.id, p.nombre, p.razon_social, p.tipo_documento, p.numero_documento, p.telefono, p.email, p.direccion, p.estado, p.observaciones, p.created_at, p.updated_at,
               GROUP_CONCAT(DISTINCT m.marca ORDER BY m.marca SEPARATOR ', ') AS marcas,
               (
                   SELECT JSON_ARRAYAGG(
                       JSON_OBJECT(
                           'id', c.id,
                           'banco', c.banco,
                           'moneda', COALESCE(c.moneda, 'SOLES'),
                           'tipo_cuenta', c.tipo_cuenta,
                           'numero_cuenta', c.numero_cuenta,
                           'detraccion', c.detraccion,
                           'estado', c.estado
                       )
                   )
                   FROM proveedor_cuentas_bancarias c
                   WHERE c.proveedor_id = p.id
               ) AS cuentas_json
        FROM proveedores_inv p
        LEFT JOIN proveedor_marcas_inv m ON m.proveedor_id = p.id
        GROUP BY p.id, p.nombre, p.razon_social, p.tipo_documento, p.numero_documento, p.telefono, p.email, p.direccion, p.estado, p.observaciones, p.created_at, p.updated_at
        ORDER BY p.nombre
    `;
        getDb(req).query(q, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const procesados = rows.map(r => {
                let cuentas = [];
                try {
                    cuentas = typeof r.cuentas_json === 'string' ? JSON.parse(r.cuentas_json) : (r.cuentas_json || []);
                } catch (e) { cuentas = []; }
                r.cuentas = cuentas;
                delete r.cuentas_json;
                return r;
            });
            res.json(procesados);
        });
    });

    router.get('/proveedores/:id/cuentas', (req, res) => {
        getDb(req).query('SELECT * FROM proveedor_cuentas_bancarias WHERE proveedor_id = ? ORDER BY id ASC', [req.params.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
    });

    router.post('/proveedores', (req, res) => {
        const { nombre, razon_social, tipo_documento, numero_documento, telefono, email, direccion, estado, observaciones, marcas, cuentas } = req.body;
        _generarCodigoAlmacen('PROV', null, (err, id) => {
            if (err) return res.status(500).json({ error: err.message });
            getDb(req).query('INSERT INTO proveedores_inv (id,nombre,razon_social,tipo_documento,numero_documento,telefono,email,direccion,estado,observaciones) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [id, nombre, razon_social || null, tipo_documento || 'RUC', numero_documento || null, telefono || null, email || null, direccion || null, estado || 'Activo', observaciones || null],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    if (marcas && marcas.length) {
                        const mVals = marcas.map(m => [id, m]);
                        getDb(req).query('INSERT INTO proveedor_marcas_inv (proveedor_id,marca) VALUES ?', [mVals], () => { });
                    }
                    if (cuentas && cuentas.length) {
                        const cVals = cuentas.map(c => [
                            id,
                            c.banco || '',
                            c.moneda || 'SOLES',
                            c.tipo_cuenta || 'CUENTA CORRIENTE',
                            c.numero_cuenta || '',
                            c.detraccion ? 1 : 0,
                            c.estado !== false && c.estado !== 0 ? 1 : 0
                        ]).filter(c => c[1] && c[4]);
                        if (cVals.length) {
                            getDb(req).query('INSERT INTO proveedor_cuentas_bancarias (proveedor_id,banco,moneda,tipo_cuenta,numero_cuenta,detraccion,estado) VALUES ?', [cVals], () => { });
                        }
                    }
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); }
                    res.json({ ok: true, id });
                });
        });
    });

    router.put('/proveedores/:id', (req, res) => {
        const { id } = req.params;
        const { nombre, razon_social, tipo_documento, numero_documento, telefono, email, direccion, estado, observaciones, marcas, cuentas } = req.body;
        getDb(req).query('UPDATE proveedores_inv SET nombre=?,razon_social=?,tipo_documento=?,numero_documento=?,telefono=?,email=?,direccion=?,estado=?,observaciones=? WHERE id=?',
            [nombre, razon_social || null, tipo_documento || 'RUC', numero_documento || null, telefono || null, email || null, direccion || null, estado || 'Activo', observaciones || null, id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                getDb(req).query('DELETE FROM proveedor_marcas_inv WHERE proveedor_id=?', [id], () => {
                    if (marcas && marcas.length) {
                        const mVals = marcas.map(m => [id, m]);
                        getDb(req).query('INSERT INTO proveedor_marcas_inv (proveedor_id,marca) VALUES ?', [mVals], () => { });
                    }
                });
                getDb(req).query('DELETE FROM proveedor_cuentas_bancarias WHERE proveedor_id=?', [id], () => {
                    if (cuentas && cuentas.length) {
                        const cVals = cuentas.map(c => [
                            id,
                            c.banco || '',
                            c.moneda || 'SOLES',
                            c.tipo_cuenta || 'CUENTA CORRIENTE',
                            c.numero_cuenta || '',
                            c.detraccion ? 1 : 0,
                            c.estado !== false && c.estado !== 0 ? 1 : 0
                        ]).filter(c => c[1] && c[4]);
                        if (cVals.length) {
                            getDb(req).query('INSERT INTO proveedor_cuentas_bancarias (proveedor_id,banco,moneda,tipo_cuenta,numero_cuenta,detraccion,estado) VALUES ?', [cVals], () => { });
                        }
                    }
                });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); }
                res.json({ ok: true });
            });
    });

    router.delete('/proveedores/:id', (req, res) => {
        getDb(req).query('DELETE FROM proveedor_cuentas_bancarias WHERE proveedor_id=?', [req.params.id], () => {
            getDb(req).query('DELETE FROM proveedor_marcas_inv WHERE proveedor_id=?', [req.params.id], () => {
                getDb(req).query('DELETE FROM proveedores_inv WHERE id=?', [req.params.id], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
                });
            });
        });
    });


    router.post('/importarProveedoresMasivo', async (req, res) => {
        const lista = req.body.proveedores || [];
        if (!lista.length) return res.status(400).json({ error: 'Sin datos' });

        // Helper promisificado
        const dbq = (sql, params) => new Promise((resolve, reject) =>
            getDb(req).query(sql, params || [], (err, rows) => err ? reject(err) : resolve(rows))
        );

        try {
            // 1. Buscar todos los existentes por nombre en una sola query
            const nombres = lista.filter(p => p.nombre).map(p => p.nombre);
            if (!nombres.length) return res.json({ insertados: 0, actualizados: 0, errores: lista.length });

            const existentes = await dbq('SELECT id, nombre FROM proveedores_inv WHERE nombre IN (?)', [nombres]);
            const existMap = {};
            existentes.forEach(r => { existMap[r.nombre] = r.id; });

            // 2. Separar nuevos vs a actualizar
            const nuevos = lista.filter(p => p.nombre && !existMap[p.nombre]);
            const actualizar = lista.filter(p => p.nombre && existMap[p.nombre]);

            // 3. Obtener próximo número de secuencia una sola vez
            let startNum = 1;
            if (nuevos.length) {
                const maxRow = await dbq("SELECT MAX(id) AS max_id FROM proveedores_inv WHERE id LIKE 'PROV-%'");
                if (maxRow[0] && maxRow[0].max_id) {
                    const parts = maxRow[0].max_id.split('-');
                    const last = parseInt(parts[parts.length - 1], 10);
                    if (!isNaN(last)) startNum = last + 1;
                }
            }

            const mkMarcas = p => p.marcas
                ? (typeof p.marcas === 'string' ? p.marcas.split(',').map(m => m.trim()).filter(Boolean) : (p.marcas || []))
                : [];

            let insertados = 0, actualizados = 0, errores = 0;

            // 4. INSERT nuevos en paralelo (IDs pre-asignados, sin race condition)
            await Promise.all(nuevos.map((p, i) => {
                const id = 'PROV-' + String(startNum + i).padStart(4, '0');
                const marcasArr = mkMarcas(p);
                return dbq(
                    'INSERT INTO proveedores_inv (id,nombre,razon_social,tipo_documento,numero_documento,telefono,email,direccion,estado,observaciones) VALUES (?,?,?,?,?,?,?,?,?,?)',
                    [id, p.nombre, p.razon_social || null, p.tipo_documento || 'RUC', p.numero_documento || null,
                        p.telefono || null, p.email || null, p.direccion || null, p.estado || 'Activo', p.observaciones || null]
                ).then(() => {
                    insertados++;
                    if (marcasArr.length) return dbq('INSERT INTO proveedor_marcas_inv (proveedor_id,marca) VALUES ?', [marcasArr.map(m => [id, m])]);
                }).catch(() => { errores++; });
            }));

            // 5. UPDATE existentes en paralelo + refresh marcas
            await Promise.all(actualizar.map(p => {
                const id = existMap[p.nombre];
                const marcasArr = mkMarcas(p);
                return dbq(
                    'UPDATE proveedores_inv SET razon_social=?,tipo_documento=?,numero_documento=?,telefono=?,email=?,direccion=?,estado=?,observaciones=? WHERE id=?',
                    [p.razon_social || null, p.tipo_documento || 'RUC', p.numero_documento || null,
                    p.telefono || null, p.email || null, p.direccion || null, p.estado || 'Activo', p.observaciones || null, id]
                ).then(() => {
                    actualizados++;
                    return dbq('DELETE FROM proveedor_marcas_inv WHERE proveedor_id=?', [id]).then(() => {
                        if (marcasArr.length) return dbq('INSERT INTO proveedor_marcas_inv (proveedor_id,marca) VALUES ?', [marcasArr.map(m => [id, m])]);
                    });
                }).catch(() => { errores++; });
            }));

            res.json({ insertados, actualizados, errores });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/proveedores/bulk-delete', (req, res) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Sin IDs' });
        const placeholders = ids.map(() => '?').join(',');
        getDb(req).query('DELETE FROM proveedores_inv WHERE id IN (' + placeholders + ')', ids, (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, eliminados: result.affectedRows });
        });
    });

    // ============================================================
    // ALMACÉN — Inventario (Catálogo)
    // ============================================================
    const _stockSQL = `
  SELECT i.*,
    DATE_FORMAT(i.fecha_regularizacion, '%Y-%m-%d %H:%i:%s') AS fecha_regularizacion,
    COALESCE(prov.ultimo_proveedor, p_dir.nombre) AS ultimo_proveedor,
    ROUND(
      COALESCE(i.stock_regularizado, 0)
      + COALESCE(ent.total_entradas, 0)
      + COALESCE(rec.total_recepciones, 0)
      - COALESCE(sal.total_salidas, 0)
    , 4) AS stock_actual
  FROM inventario i
  LEFT JOIN (
      SELECT 
          d.inventario_id,
          SUBSTRING_INDEX(GROUP_CONCAT(e.proveedor_nombre ORDER BY COALESCE(e.fecha, e.created_at) DESC, d.id DESC SEPARATOR '|||'), '|||', 1) AS ultimo_proveedor
      FROM detalle_entradas_inv d
      JOIN entradas_inv e ON e.id = d.entrada_id
      WHERE (e.estado IS NULL OR e.estado != 'Anulado')
        AND e.proveedor_nombre IS NOT NULL AND e.proveedor_nombre != ''
      GROUP BY d.inventario_id
  ) prov ON prov.inventario_id = i.id
  LEFT JOIN proveedores_inv p_dir ON p_dir.id = i.proveedor_id
  LEFT JOIN (
      SELECT 
          d.inventario_id, 
          SUM(d.cantidad) AS total_entradas
      FROM detalle_entradas_inv d
      JOIN entradas_inv e ON e.id = d.entrada_id
      JOIN inventario inv ON inv.id = d.inventario_id
      WHERE (inv.fecha_regularizacion IS NULL OR COALESCE(e.created_at, e.fecha) > inv.fecha_regularizacion)
        AND (e.estado IS NULL OR e.estado != 'Anulado')
        AND (e.tipo_orden = 'Entrada directa' OR e.tipo_orden = 'Ajuste')
      GROUP BY d.inventario_id
  ) ent ON ent.inventario_id = i.id
  LEFT JOIN (
      SELECT 
          dr.inventario_id,
          SUM(dr.cantidad_recibida) AS total_recepciones
      FROM detalle_recepciones_oc dr
      JOIN recepciones_oc r ON r.id = dr.recepcion_id
      JOIN entradas_inv e ON e.id = r.oc_id
      JOIN inventario inv ON inv.id = dr.inventario_id
      WHERE (e.estado IS NULL OR (e.estado != 'Anulado' AND LOWER(e.estado) NOT LIKE '%anul%' AND LOWER(e.estado) NOT LIKE '%rechaz%'))
        AND (inv.fecha_regularizacion IS NULL OR COALESCE(r.created_at, r.fecha_recepcion) > inv.fecha_regularizacion)
      GROUP BY dr.inventario_id
  ) rec ON rec.inventario_id = i.id
  LEFT JOIN (
      SELECT 
          inv.id AS mapped_id,
          SUM(d.cantidad) AS total_salidas
      FROM detalle_salidas_inv d
      JOIN salidas_inv s ON s.id = d.salida_id
      JOIN inventario inv ON (d.inventario_id = inv.id OR (d.inventario_id IS NULL AND SUBSTRING_INDEX(d.descripcion, ' - ', 1) = inv.id))
      WHERE s.estado = 'Despachado'
        AND (inv.fecha_regularizacion IS NULL OR COALESCE(s.created_at, s.fecha) > inv.fecha_regularizacion)
      GROUP BY inv.id
  ) sal ON sal.mapped_id = i.id
  WHERE i.activo=1
  ORDER BY i.id`;

    // Quiebre de stock: cuando un despacho deja un artículo en su stock mínimo o debajo, se abre una O/C en BORRADOR.
    // No notifica ni aprueba nada, y no abre otra si ya hay una O/C abierta para el mismo artículo.
    function abrirOcPorQuiebre(tdbQ, inventarioIds) {
        const ids = [...new Set((inventarioIds || []).filter(Boolean))];
        if (!ids.length) return;
        // Mismo cálculo de stock que el inventario; se filtra por id dentro de la consulta (envolverla daría columnas repetidas)
        const sqlStockIds = _stockSQL.replace(/WHERE i\.activo=1\s*ORDER BY i\.id\s*$/, 'WHERE i.activo=1 AND i.id IN (?) ORDER BY i.id');
        tdbQ.query(sqlStockIds, [ids], (err, todos) => {
            const rows = (todos || []).filter(x => Number(x.stock_min) > 0 && Number(x.stock_actual) <= Number(x.stock_min));
            if (err || !rows.length) return;
            rows.forEach(it => {
                tdbQ.query(`SELECT 1 FROM ordenes_compra_items oi JOIN ordenes_compra oc ON oc.id = oi.orden_compra_id
                           WHERE oi.descripcion = ? AND oc.estado IN ('BORRADOR','PENDIENTE_APROBACION','APROBADA') LIMIT 1`, [it.descripcion], (e2, abiertas) => {
                    if (e2 || (abiertas && abiertas.length)) return;
                    const meta = Number(it.stock_max) > 0 ? Number(it.stock_max) : Number(it.stock_min);
                    const cantidad = Math.max(meta - Number(it.stock_actual), 1);
                    const costo = Number(it.costo_referencial) || 0;
                    const total = +(cantidad * costo).toFixed(2);
                    const codigo = `OCQ-${it.id}-${Date.now()}`;
                    tdbQ.query(`INSERT INTO ordenes_compra (codigo, proveedor_nombre, proveedor_ruc, monto_total, moneda, motivo_solicitud, solicitado_por, estado)
                               VALUES (?, 'Por definir', NULL, ?, ?, ?, 'Sistema (stock mínimo)', 'BORRADOR')`,
                        [codigo, total, it.moneda || 'PEN', `Quiebre de stock: ${it.descripcion} (stock ${it.stock_actual}, mínimo ${it.stock_min})`], (e3, r) => {
                            if (e3 || !r) return;
                            tdbQ.query(`INSERT INTO ordenes_compra_items (orden_compra_id, descripcion, cantidad, unidad_medida, precio_unitario, subtotal)
                                       VALUES (?, ?, ?, ?, ?, ?)`, [r.insertId, it.descripcion, cantidad, it.unidad || 'UND', costo, total]);
                        });
                });
            });
        });
    }
    function abrirOcPorQuiebreSalida(tdbQ, salidaId) {
        tdbQ.query('SELECT inventario_id FROM detalle_salidas_inv WHERE salida_id = ?', [salidaId], (err, rows) => {
            if (err || !rows) return;
            abrirOcPorQuiebre(tdbQ, rows.map(r => r.inventario_id));
        });
    }

    router.get('/notificaciones/resumen', (req, res) => {
        const targetDb = getDb(req);
        const qInspVencidas = `
        SELECT COUNT(*) AS cnt FROM inspecciones
        WHERE estado IS NULL OR estado != 'Eliminada'
        AND fecha_ingreso IS NOT NULL
        AND DATE_ADD(
            CASE
                WHEN fecha_ingreso REGEXP '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
                    THEN STR_TO_DATE(fecha_ingreso, '%d/%m/%Y')
                WHEN fecha_ingreso REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                    THEN DATE(fecha_ingreso)
                ELSE NULL
            END,
            INTERVAL COALESCE(dias_propuestos, 30) DAY
        ) < CURDATE()
    `;
        const qFleetrunVenc = `
        SELECT COUNT(*) AS cnt FROM (
            SELECT f.placa, f.tipo_mp
            FROM fleetrun f
            INNER JOIN (
                SELECT placa, tipo_mp, MAX(fecha) AS max_fecha
                FROM fleetrun GROUP BY placa, tipo_mp
            ) lf ON f.placa = lf.placa AND f.tipo_mp = lf.tipo_mp AND f.fecha = lf.max_fecha
            WHERE f.km_proximo > 0 AND f.km_actual >= f.km_proximo
            GROUP BY f.placa, f.tipo_mp
        ) t
    `;
        const qStockCrit = `
        SELECT COUNT(*) AS cnt FROM inventario
        WHERE activo = 1 AND stock_min > 0
        AND stock_actual <= stock_min
    `;
        const runQ = (sql) => new Promise((resolve) => {
            targetDb.query(sql, (err, rows) => {
                resolve(err ? 0 : (rows[0] && rows[0].cnt != null ? parseInt(rows[0].cnt) : 0));
            });
        });
        Promise.all([runQ(qInspVencidas), runQ(qFleetrunVenc), runQ(qStockCrit)])
            .then(([inspVenc, fleetVenc, stockCrit]) => {
                res.json([
                    { id: 'insp-vencidas', tipo: 'danger', icono: 'bi-shield-x', titulo: 'Inspecciones Vencidas', count: inspVenc, modulo: 'mantenimiento/inspecciones' },
                    { id: 'fleet-vencidos', tipo: 'warning', icono: 'bi-speedometer2', titulo: 'MP Fleetrun Vencidos', count: fleetVenc, modulo: 'mantenimiento/fleetrun' },
                    { id: 'stock-critico', tipo: 'info', icono: 'bi-exclamation-triangle', titulo: 'Stock Crítico', count: stockCrit, modulo: 'almacen/inventario' }
                ]);
            });
    });

    router.get('/inventario', (req, res) => {
        const targetDb = getDb(req);
        targetDb.query(_stockSQL, async (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const { getPresignedUrl, s3KeyFromUrl } = require('../utils/s3');
            const signedRows = await Promise.all(rows.map(async (row) => {
                if (row.imagen_url) {
                    const key = s3KeyFromUrl(row.imagen_url);
                    if (key) {
                        try {
                            row.imagen_url = await getPresignedUrl(key, 3600);
                        } catch (e) { }
                    }
                }
                return row;
            }));
            res.json(signedRows);
        });
    });

    // ─── Marcas de placas para multi-select inventario ───────────────
    router.get('/marcas-placas', (req, res) => {
        const targetDb = req.db || db;
        targetDb.query(`SELECT DISTINCT marca FROM placas WHERE marca IS NOT NULL AND marca <> '' ORDER BY marca`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json((rows || []).map(r => r.marca));
        });
    });

    router.post('/inventario', tcSunatSiFalta, (req, res) => {
        const { articulo, codigo_articulo, descripcion, familia, almacen, unidad, moneda, costo_referencial,
            tipo_cambio, cantidad_inicial,
            proveedor_id, marca, observaciones,
            codigo_item, marca_unidad, sistema, sub_sistema, tipo, sub_tipo,
            ubicacion, anaquel, stock_min, stock_max, estado_art, codigo_barras } = req.body;

        const costoRef = parseFloat(costo_referencial) || 0;
        const tc = parseFloat(tipo_cambio) || null;
        const monedaVal = moneda || 'PEN';
        const costoSoles = (monedaVal === 'USD' && tc) ? costoRef * tc : costoRef;
        const cantInicial = parseFloat(cantidad_inicial) || 0;
        const stockReg = cantInicial > 0 ? cantInicial : 0;
        const fechaReg = cantInicial > 0 ? new Date().toISOString().split('T')[0] : null;

        // Generar descripcion concatenada desde los campos individuales
        let marcasArr = [];
        try { marcasArr = JSON.parse(marca_unidad || '[]'); } catch (e) { marcasArr = marca_unidad ? [marca_unidad] : []; }
        let descGenerada = (articulo || '').trim();
        if (codigo_articulo) descGenerada += ' ' + String(codigo_articulo).trim();
        if (marcasArr.length) descGenerada += ' - ' + marcasArr.join(', ');
        if (marca) descGenerada += ' / ' + String(marca).trim();
        // Llantas: marca + modelo + medida (si no hay medida ni modelo, queda la regla general)
        const nombreLl = esFamiliaLlanta(familia) ? nombreLlanta({ marca, modelo: req.body.modelo, medida: req.body.medida }) : '';
        if (nombreLl) descGenerada = nombreLl;
        const descFinal = descGenerada || descripcion || 'Sin nombre';

        const isServ = (tipo === 'Servicio' || tipo === 'SERV' || /^(servicio|mantenimiento|reparacion|alquiler|flete|torno|taxi|mano de obra|lavado|planchado|pintura|diagnostico|auxilio|grua)/i.test((articulo || '').trim()) || /^(servicio|mantenimiento|reparacion|alquiler|flete|torno|taxi|mano de obra|lavado|planchado|pintura|diagnostico|auxilio|grua)/i.test((descripcion || '').trim()));
        const tipoFinal = (tipo || (isServ ? 'Servicio' : null));
        const unidadFinal = (unidad || (isServ ? 'Servicio' : null));
        const prefix = (tipoFinal === 'Servicio' || tipoFinal === 'SERV' || isServ) ? 'SERV' : 'INV';

        _generarCodigoAlmacen(prefix, null, (err, id) => {
            if (err) return res.status(500).json({ error: err.message });
            getDb(req).query(`INSERT INTO inventario
            (id,descripcion,articulo,codigo_articulo,familia,almacen,unidad,moneda,costo_referencial,costo_soles,tipo_cambio,
             proveedor_id,marca,observaciones,
             codigo_item,marca_unidad,sistema,sub_sistema,tipo,sub_tipo,
             ubicacion,anaquel,stock_min,stock_max,estado_art,codigo_barras,
             stock_regularizado,fecha_regularizacion)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [id, descFinal, articulo || null, codigo_articulo || null, familia || null, almacen || null, unidadFinal, monedaVal,
                    costoRef, costoSoles, tc,
                    proveedor_id || null, marca || null, observaciones || null,
                    codigo_item || null, marca_unidad || null, sistema || null, sub_sistema || null,
                    tipoFinal, sub_tipo || null, ubicacion || null,
                    (anaquel != null && String(anaquel).trim() !== '') ? String(anaquel).trim() : null, parseFloat(stock_min) || 0, parseFloat(stock_max) || 0,
                    estado_art || 'Activo', codigo_barras || null,
                    stockReg, fechaReg],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id });
                });
        });
    });

    // Lectura de los datos de la llanta de un artículo (para el formulario de inventario)
    router.get('/neumaticos-articulo/:id', (req, res) => {
        getDb(req).query('SELECT medida, modelo, cocada_inicial FROM neumaticos_articulo WHERE inventario_id = ?', [String(req.params.id || '')], (err, rows) => {
            if (err) return res.status(500).json({ ok: false, error: err.message });
            res.json({ ok: true, data: rows && rows[0] ? rows[0] : null });
        });
    });

    // Datos del artículo "Llanta" (familia NEUMATICOS): medida, modelo y cocada inicial, que usa la recepción para crear la llanta
    router.put('/neumaticos-articulo/:id', async (req, res) => {
        try {
            const inventarioId = String(req.params.id || '').trim();
            const b = req.body || {};
            const medida = String(b.medida || '').trim() || null;
            const modelo = String(b.modelo || '').trim() || null;
            const cocada = (b.cocada_inicial === '' || b.cocada_inicial == null) ? null : Number(b.cocada_inicial);
            if (cocada !== null && (!Number.isFinite(cocada) || cocada < 0)) {
                return res.status(400).json({ ok: false, error: 'La cocada inicial debe ser un número positivo' });
            }
            await new Promise((resolve, reject) => getDb(req).query(
                `INSERT INTO neumaticos_articulo (inventario_id, medida, modelo, cocada_inicial)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE medida = VALUES(medida), modelo = VALUES(modelo), cocada_inicial = VALUES(cocada_inicial)`,
                [inventarioId, medida, modelo, cocada],
                (err, r) => (err ? reject(err) : resolve(r))));
            res.json({ ok: true, inventario_id: inventarioId, medida, modelo, cocada_inicial: cocada });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.put('/inventario/:id', tcSunatSiFalta, (req, res) => {
        const { articulo, codigo_articulo, descripcion, familia, almacen, unidad, moneda, costo_referencial,
            tipo_cambio,
            proveedor_id, marca, observaciones, activo,
            codigo_item, marca_unidad, sistema, sub_sistema, tipo, sub_tipo,
            ubicacion, anaquel, stock_min, stock_max, estado_art, codigo_barras } = req.body;

        const costoRef = parseFloat(costo_referencial) || 0;
        const tc = parseFloat(tipo_cambio) || null;
        const monedaVal = moneda || 'PEN';
        const costoSoles = (monedaVal === 'USD' && tc) ? costoRef * tc : costoRef;

        let marcasArr = [];
        try { marcasArr = JSON.parse(marca_unidad || '[]'); } catch (e) { marcasArr = marca_unidad ? [marca_unidad] : []; }
        let descGenerada = (articulo || '').trim();
        if (codigo_articulo) descGenerada += ' ' + String(codigo_articulo).trim();
        if (marcasArr.length) descGenerada += ' - ' + marcasArr.join(', ');
        if (marca) descGenerada += ' / ' + String(marca).trim();
        // Llantas: marca + modelo + medida (si no hay medida ni modelo, queda la regla general)
        const nombreLl = esFamiliaLlanta(familia) ? nombreLlanta({ marca, modelo: req.body.modelo, medida: req.body.medida }) : '';
        if (nombreLl) descGenerada = nombreLl;
        const descFinal = descGenerada || descripcion || 'Sin nombre';

        const oldId = req.params.id;
        const wantsServ = (tipo === 'Servicio' || tipo === 'SERV' || /^(servicio|mantenimiento|reparacion|alquiler|flete|torno|taxi|mano de obra|lavado|planchado|pintura|diagnostico|auxilio|grua)/i.test((articulo || '').trim()) || /^(servicio|mantenimiento|reparacion|alquiler|flete|torno|taxi|mano de obra|lavado|planchado|pintura|diagnostico|auxilio|grua)/i.test((descripcion || '').trim()));
        const isInvPrefix = oldId.startsWith('INV-');
        const isServPrefix = oldId.startsWith('SERV-');

        const needsPrefixChange = (isInvPrefix && wantsServ) || (isServPrefix && tipo && tipo !== 'Servicio' && tipo !== 'SERV' && !wantsServ);
        const targetPrefix = wantsServ ? 'SERV' : 'INV';
        const targetTipo = wantsServ ? 'Servicio' : (tipo || null);
        const targetUnidad = wantsServ ? (unidad || 'Servicio') : (unidad || null);

        const doUpdate = (newId) => {
            getDb(req).query(`UPDATE inventario SET
            id=?,descripcion=?,articulo=?,codigo_articulo=?,familia=?,almacen=?,unidad=?,moneda=?,costo_referencial=?,costo_soles=?,tipo_cambio=?,
            proveedor_id=?,marca=?,observaciones=?,activo=?,
            codigo_item=?,marca_unidad=?,sistema=?,sub_sistema=?,tipo=?,sub_tipo=?,ubicacion=?,
            anaquel=?,stock_min=?,stock_max=?,estado_art=?,codigo_barras=?
            WHERE id=?`,
                [newId, descFinal, articulo || null, codigo_articulo || null, familia || null, almacen || null, targetUnidad, monedaVal,
                    costoRef, costoSoles, tc,
                    proveedor_id || null, marca || null, observaciones || null,
                    activo != null ? activo : 1,
                    codigo_item || null, marca_unidad || null, sistema || null, sub_sistema || null,
                    targetTipo, sub_tipo || null, ubicacion || null,
                    (anaquel != null && String(anaquel).trim() !== '') ? String(anaquel).trim() : null, parseFloat(stock_min) || 0, parseFloat(stock_max) || 0,
                    estado_art || 'Activo', codigo_barras || null, oldId],
                (err) => {
                    if (err) { console.error('[PUT inventario]', err.message); return res.status(500).json({ error: err.message }); }
                    if (newId !== oldId) {
                        getDb(req).query('UPDATE detalle_entradas_inv SET inventario_id = ? WHERE inventario_id = ?', [newId, oldId]);
                        getDb(req).query('UPDATE detalle_salidas_inv SET inventario_id = ? WHERE inventario_id = ?', [newId, oldId]);
                        getDb(req).query('UPDATE detalle_recepciones_oc SET inventario_id = ? WHERE inventario_id = ?', [newId, oldId], () => {});
                    }
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); }
                    res.json({ ok: true, id: newId, old_id: oldId, migrado: newId !== oldId });
                });
        };

        if (needsPrefixChange) {
            _generarCodigoAlmacen(targetPrefix, null, (errGen, genId) => {
                if (errGen) return res.status(500).json({ error: errGen.message });
                doUpdate(genId);
            });
        } else {
            doUpdate(oldId);
        }
    });
    router.delete('/inventario/:id', (req, res) => {
        getDb(req).query('UPDATE inventario SET activo=0 WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
    });

    router.post('/inventario/bulk-delete', (req, res) => {
        const { ids } = req.body;
        if (!ids || !ids.length) return res.status(400).json({ error: 'Sin IDs' });
        const placeholders = ids.map(() => '?').join(',');
        const targetDb = getDb(req);
        targetDb.query(`UPDATE inventario SET activo=0 WHERE id IN (${placeholders})`, ids, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, eliminados: ids.length });
        });
    });

    function _getPeruNowString() {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Lima',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        const parts = formatter.formatToParts(new Date());
        const p = {};
        parts.forEach(part => { p[part.type] = part.value; });
        return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
    }

    // ── Regularizar Stock de un Artículo Individual ──────────────────
    router.post('/inventario/:id/regularizar', (req, res) => {
        const targetDb = getDb(req);
        const id = req.params.id;
        const stockFisico = parseFloat(req.body.stock_fisico);
        const motivo = (req.body.motivo || '').trim();
        const usuario = req.body.usuario || 'sistema';
        const peruNow = _getPeruNowString();

        if (isNaN(stockFisico) || stockFisico < 0) {
            return res.status(400).json({ error: 'Stock físico inválido' });
        }

        // Stock anterior y nombre del artículo, para registrar el cambio exacto
        targetDb.query('SELECT stock_regularizado, descripcion FROM inventario WHERE id = ?', [id], (errA, filasA) => {
            const antes = (!errA && filasA && filasA[0]) ? filasA[0] : {};
            targetDb.query(
                'UPDATE inventario SET stock_regularizado = ?, fecha_regularizacion = ? WHERE id = ?',
                [stockFisico, peruNow, id],
                (err, result) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (result.affectedRows === 0) return res.status(404).json({ error: 'Artículo no encontrado' });

                    const stockAnterior = antes.stock_regularizado == null ? null : Number(antes.stock_regularizado); // DECIMAL llega como texto
                    const cambios = diff({ stock_regularizado: stockAnterior }, { stock_regularizado: stockFisico }, ['stock_regularizado']);
                    auditar(targetDb, actorDe(req), {
                        action: 'UPDATE', entity: 'stock-adjustment', entityId: id,
                        summary: `Regularizó el stock de ${antes.descripcion || 'un artículo'} a ${stockFisico}${motivo ? ` (motivo: ${motivo})` : ''}`,
                        changes: Object.keys(cambios).length ? { ...cambios, motivo: { from: null, to: motivo || 'Regularización física' } } : { motivo: { from: null, to: motivo || 'Regularización física' } },
                    });
                    if (typeof logAudit === 'function') {
                        logAudit(usuario, 'almacen', 'REGULARIZÓ', `Stock ajustado a ${stockFisico} (Motivo: ${motivo || 'Regularización física'}) para ${id}`);
                    }

                    res.json({
                        ok: true,
                        stock_regularizado: stockFisico,
                        fecha_regularizacion: peruNow
                    });
                }
            );
        });
    });

    // ── Regularización Masiva de Todo el Inventario a Cero ───────────
    router.post('/inventario/regularizar-todo-cero', (req, res) => {
        const targetDb = getDb(req);
        const usuario = req.body.usuario || 'sistema';
        const motivo = (req.body.motivo || 'Reinicio general de stock físico a cero').trim();
        const peruNow = _getPeruNowString();

        targetDb.query(
            'UPDATE inventario SET stock_regularizado = 0, fecha_regularizacion = ? WHERE activo = 1',
            [peruNow],
            (err, result) => {
                if (err) return res.status(500).json({ error: err.message });

                if (typeof logAudit === 'function') {
                    logAudit(usuario, 'almacen', 'REGULARIZÓ_TODO', `Reinicio masivo de stock a 0 para ${result.affectedRows} artículos. Motivo: ${motivo}`);
                }

                res.json({
                    ok: true,
                    total_regularizados: result.affectedRows,
                    fecha_regularizacion: peruNow
                });
            }
        );
    });

    // Upload imagen de artículo → AWS S3
    router.post('/inventario/:id/imagen', _multerInv.single('imagen'), (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
        try {
            const { uploadToS3, deleteFromS3, s3KeyFromUrl, getPresignedUrl } = require('../utils/s3');
            const targetDb = getDb(req);
            targetDb.query('SELECT imagen_url FROM inventario WHERE id=?', [req.params.id], async (err, rows) => {
                if (!err && rows && rows.length > 0 && rows[0].imagen_url) {
                    const oldKey = s3KeyFromUrl(rows[0].imagen_url);
                    if (oldKey) await deleteFromS3(oldKey).catch(() => { });
                }

                const ext = req.file.originalname.split('.').pop() || 'jpg';
                const s3Key = `almacen/inventario/${req.params.id}/${Date.now()}.${ext}`;
                const url = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);

                targetDb.query('UPDATE inventario SET imagen_url=? WHERE id=?', [url, req.params.id], async (updateErr) => {
                    if (updateErr) return res.status(500).json({ error: updateErr.message });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) {
                        logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'MODIFICÓ', req.path);
                    }

                    let presigned = url;
                    try {
                        presigned = await getPresignedUrl(s3Key, 3600);
                    } catch (e) {
                        console.warn('[Presign Error]', e.message);
                    }
                    res.json({ ok: true, imagen_url: presigned });
                });
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Eliminar imagen de artículo → AWS S3
    router.delete('/inventario/:id/imagen', (req, res) => {
        try {
            const { deleteFromS3, s3KeyFromUrl } = require('../utils/s3');
            getDb(req).query('SELECT imagen_url FROM inventario WHERE id=?', [req.params.id], async (err, rows) => {
                if (!err && rows && rows.length > 0 && rows[0].imagen_url) {
                    const oldKey = s3KeyFromUrl(rows[0].imagen_url);
                    if (oldKey) await deleteFromS3(oldKey).catch(() => { });
                }
                getDb(req).query('UPDATE inventario SET imagen_url=NULL WHERE id=?', [req.params.id], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'ELIMINÓ', req.path); }
                    res.json({ ok: true });
                });
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Regularizar stock físico (autocontrol)
    router.post('/inventario/:id/regularizar', (req, res) => {
        const { stock_fisico, motivo, usuario } = req.body;
        const id = req.params.id;
        if (stock_fisico == null || isNaN(parseFloat(stock_fisico))) {
            return res.status(400).json({ error: 'stock_fisico requerido' });
        }
        const stockVal = parseFloat(stock_fisico);
        const fechaHoy = new Date().toISOString().split('T')[0];

        // Obtener stock virtual actual para registrar en observaciones
        getDb(req).query(`SELECT
        COALESCE(i.stock_regularizado,0)
        + COALESCE((SELECT SUM(d.cantidad) FROM detalle_entradas_inv d
                    JOIN entradas_inv e ON e.id=d.entrada_id
                    WHERE d.inventario_id=i.id
                    AND (i.fecha_regularizacion IS NULL OR DATE(e.created_at) >= DATE(i.fecha_regularizacion))),0)
        - COALESCE((SELECT SUM(d.cantidad) FROM detalle_salidas_inv d
                    JOIN salidas_inv s ON s.id=d.salida_id
                    WHERE d.inventario_id=i.id
                    AND (i.fecha_regularizacion IS NULL OR DATE(s.created_at) >= DATE(i.fecha_regularizacion))),0)
        AS stock_virtual,
        i.stock_regularizado AS stock_ant,
        i.fecha_regularizacion AS fecha_reg_ant
        FROM inventario i WHERE i.id=?`, [id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const stockVirtual = parseFloat(rows[0]?.stock_virtual || 0);
            const stockAnt = parseFloat(rows[0]?.stock_ant || 0);

            const obsAudit = `Regularización: virtual=${stockVirtual.toFixed(2)} → físico=${stockVal.toFixed(2)}` +
                (motivo ? ` | Motivo: ${motivo}` : '') +
                ` | Usuario: ${usuario || 'sistema'} | Fecha: ${fechaHoy}`;

            getDb(req).query(`UPDATE inventario SET stock_regularizado=?, fecha_regularizacion=? WHERE id=?`,
                [stockVal, fechaHoy, id], (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    // Registrar en observaciones de auditoría (append)
                    getDb(req).query(`UPDATE inventario SET observaciones = CONCAT(COALESCE(observaciones,''), ?)
                      WHERE id=?`,
                        ['\n[REG ' + fechaHoy + '] ' + obsAudit, id], () => { });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, fecha_regularizacion: fechaHoy, stock_anterior: stockAnt, stock_nuevo: stockVal });
                });
        });
    });

    // Import masivo desde Excel
    router.post('/inventario/importar', async (req, res) => {
        const { filas } = req.body;
        if (!filas || !filas.length) { if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json({ ok: true, insertados: 0 }); }
        let insertados = 0;
        const errors = [];
        for (let i = 0; i < filas.length; i++) {
            const f = filas[i];
            if (!f.articulo) { errors.push(`Fila ${i + 2}: falta el campo 'articulo'`); continue; }
            try {
                // Generar descripcion concatenada igual que el POST individual
                let marcasArr = [];
                try { marcasArr = JSON.parse(f.marca_unidad || '[]'); } catch (e) {
                    marcasArr = f.marca_unidad ? String(f.marca_unidad).split(',').map(s => s.trim()).filter(Boolean) : [];
                }
                let descGenerada = String(f.articulo).trim();
                if (f.codigo_articulo) descGenerada += ' ' + String(f.codigo_articulo).trim();
                if (marcasArr.length) descGenerada += ' - ' + marcasArr.join(', ');
                if (f.marca) descGenerada += ' / ' + String(f.marca).trim();
                const marcaUnidadJson = marcasArr.length ? JSON.stringify(marcasArr) : null;

                await new Promise((resolve, reject) => {
                    _generarCodigoAlmacen('INV', null, (err, id) => {
                        if (err) return reject(err);
                        const cantInicial = parseFloat(f.cantidad_inicial) || 0;
                        const stockReg = cantInicial > 0 ? cantInicial : 0;
                        const fechaReg = cantInicial > 0 ? new Date().toISOString().split('T')[0] : null;
                        getDb(req).query(`INSERT INTO inventario
                        (id,descripcion,articulo,codigo_articulo,familia,almacen,unidad,moneda,costo_referencial,
                         marca,observaciones,marca_unidad,sistema,sub_sistema,tipo,sub_tipo,
                         ubicacion,anaquel,stock_min,stock_max,estado_art,codigo_barras,
                         stock_regularizado,fecha_regularizacion)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                            [id, descGenerada || 'Sin nombre',
                                f.articulo || null, f.codigo_articulo || null, f.familia || null, f.almacen || null, f.unidad || null,
                                f.moneda || 'PEN', parseFloat(f.costo_referencial) || 0,
                                f.marca || null, f.observaciones || null,
                                marcaUnidadJson, f.sistema || null, f.sub_sistema || null,
                                f.tipo || null, f.sub_tipo || null, f.ubicacion || null,
                                (f.anaquel != null && String(f.anaquel).trim() !== '') ? String(f.anaquel).trim() : null,
                                parseFloat(f.stock_min) || 0, parseFloat(f.stock_max) || 0,
                                f.estado_art || 'Activo', f.codigo_barras || null,
                                stockReg, fechaReg],
                            (err2) => { if (err2) return reject(err2); insertados++; resolve(); });
                    });
                });
            } catch (e) { errors.push(`Fila ${i + 2}: ${e.message}`); }
        }
        if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, insertados, errores: errors });
    });

    // ── Clientes de placas (para Empresa en conductores) ──────────────────────
    router.get('/clientes-placas', (req, res) => {
        const tdb = req.db || db;
        const sql = `
        SELECT DISTINCT TRIM(empresa) as cliente FROM (
            SELECT cliente as empresa FROM placas WHERE cliente IS NOT NULL AND TRIM(cliente) <> ''
            UNION
            SELECT razon_social as empresa FROM clientes WHERE razon_social IS NOT NULL AND TRIM(razon_social) <> ''
        ) AS t ORDER BY cliente
    `;
        tdb.query(sql, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows.map(r => r.cliente));
        });
    });

    // ============================================================
    // ALMACÉN — Unidades de Medida
    // ============================================================
    router.get('/unidades', (req, res) => {
        getDb(req).query(`SELECT * FROM almacen_unidades ORDER BY orden, nombre`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    router.post('/unidades', (req, res) => {
        const { nombre, descripcion, activo } = req.body;
        if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
        getDb(req).query('INSERT INTO almacen_unidades (nombre, descripcion, activo) VALUES (?,?,?)',
            [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1],
            (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id: result.insertId });
            });
    });

    router.put('/unidades/:id', (req, res) => {
        const { nombre, descripcion, activo } = req.body;
        getDb(req).query('UPDATE almacen_unidades SET nombre=?, descripcion=?, activo=? WHERE id=?',
            [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1, req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            });
    });

    router.delete('/unidades/:id', (req, res) => {
        getDb(req).query('DELETE FROM almacen_unidades WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
    });

    // ============================================================
    // ALMACÉN — Sistemas y Sub-Sistemas
    // ============================================================
    router.get('/sistemas', (req, res) => {
        getDb(req).query(`SELECT * FROM almacen_sistemas ORDER BY orden, nombre`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            // sub_sistemas es columna JSON: el driver ya la entrega como lista
            rows.forEach(r => {
                if (Array.isArray(r.sub_sistemas)) return;
                try { r.sub_sistemas = r.sub_sistemas ? JSON.parse(r.sub_sistemas) : []; }
                catch (e) { r.sub_sistemas = []; }
                if (!Array.isArray(r.sub_sistemas)) r.sub_sistemas = [];
            });
            res.json(rows);
        });
    });

    router.post('/sistemas', (req, res) => {
        const { nombre, sub_sistemas, activo, orden } = req.body;
        if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
        getDb(req).query('INSERT INTO almacen_sistemas (nombre, sub_sistemas, activo, orden) VALUES (?,?,?,?)',
            [nombre.toUpperCase().trim(), JSON.stringify(sub_sistemas || []), activo != null ? activo : 1, orden || 0],
            (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id: result.insertId });
            });
    });

    router.put('/sistemas/:id', (req, res) => {
        const { nombre, sub_sistemas, activo, orden } = req.body;
        getDb(req).query('UPDATE almacen_sistemas SET nombre=?, sub_sistemas=?, activo=?, orden=? WHERE id=?',
            [nombre.toUpperCase().trim(), JSON.stringify(sub_sistemas || []), activo != null ? activo : 1, orden || 0, req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            });
    });

    router.delete('/sistemas/:id', (req, res) => {
        getDb(req).query('DELETE FROM almacen_sistemas WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
    });

    // ============================================================
    // ALMACÉN — Almacenes / Sucursales
    // ============================================================
    router.get('/almacenes-lista', (req, res) => {
        const tdb = getDb(req);
        tdb.query(`SELECT * FROM almacen_almacenes WHERE activo=1 ORDER BY orden, id`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    router.get('/almacenes', (req, res) => {
        const tdb = getDb(req);
        tdb.query(`SELECT * FROM almacen_almacenes ORDER BY orden, id`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    router.post('/almacenes', (req, res) => {
        const tdb = getDb(req);
        const { nombre, descripcion, activo, orden } = req.body;
        if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
        const nomLimpio = nombre.trim();
        tdb.query('INSERT INTO almacen_almacenes (nombre, descripcion, activo, orden, es_sistema) VALUES (?,?,?,?,0)',
            [nomLimpio, descripcion || null, activo != null ? activo : 1, orden || 0],
            (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); }
                res.json({ ok: true, id: result.insertId });
            });
    });

    router.put('/almacenes/:id', (req, res) => {
        const tdb = getDb(req);
        const { id } = req.params;
        const { nombre, descripcion, activo, orden } = req.body;
        tdb.query('SELECT es_sistema, nombre FROM almacen_almacenes WHERE id=?', [id], (errC, rowsC) => {
            if (errC) return res.status(500).json({ error: errC.message });
            const esSistema = rowsC[0]?.es_sistema;
            const nombreFinal = esSistema ? rowsC[0].nombre : (nombre ? nombre.trim() : rowsC[0].nombre);

            tdb.query('UPDATE almacen_almacenes SET nombre=?, descripcion=?, activo=?, orden=? WHERE id=?',
                [nombreFinal, descripcion || null, activo != null ? activo : 1, orden || 0, id],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); }
                    res.json({ ok: true });
                });
        });
    });

    router.delete('/almacenes/:id', (req, res) => {
        const tdb = getDb(req);
        const { id } = req.params;
        tdb.query('SELECT es_sistema, nombre FROM almacen_almacenes WHERE id=?', [id], (errC, rowsC) => {
            if (errC) return res.status(500).json({ error: errC.message });
            if (rowsC[0]?.es_sistema) {
                return res.status(400).json({ error: 'No se puede eliminar el almacén Principal del sistema' });
            }
            tdb.query('DELETE FROM almacen_almacenes WHERE id=?', [id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); }
                res.json({ ok: true });
            });
        });
    });

    // ============================================================
    // ALMACÉN — Familias
    // ============================================================
    router.get('/familias', (req, res) => {
        getDb(req).query(`SELECT * FROM almacen_familias ORDER BY orden, nombre`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    router.post('/familias', (req, res) => {
        const { nombre, descripcion, activo } = req.body;
        if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
        getDb(req).query('INSERT INTO almacen_familias (nombre, descripcion, activo) VALUES (?,?,?)',
            [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1],
            (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id: result.insertId });
            });
    });

    router.put('/familias/:id', (req, res) => {
        const { nombre, descripcion, activo } = req.body;
        getDb(req).query('UPDATE almacen_familias SET nombre=?, descripcion=?, activo=? WHERE id=?',
            [nombre.toUpperCase().trim(), descripcion || null, activo != null ? activo : 1, req.params.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            });
    });

    router.delete('/familias/:id', (req, res) => {
        getDb(req).query('DELETE FROM almacen_familias WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
    });

    // ============================================================
    // ALMACÉN — Marcas de Fabricante
    // ============================================================
    router.get('/marcas', (req, res) => {
        getDb(req).query(`SELECT * FROM almacen_marcas ORDER BY orden, nombre`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });
    router.post('/marcas', (req, res) => {
        const { nombre, descripcion, activo } = req.body;
        if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
        getDb(req).query('INSERT INTO almacen_marcas (nombre, descripcion, activo) VALUES (?,?,?)',
            [nombre.toUpperCase(), descripcion || null, activo ?? 1], (err, r) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id: r.insertId });
            });
    });
    router.put('/marcas/:id', (req, res) => {
        const { nombre, descripcion, activo } = req.body;
        getDb(req).query('UPDATE almacen_marcas SET nombre=?, descripcion=?, activo=? WHERE id=?',
            [nombre.toUpperCase(), descripcion || null, activo ?? 1, req.params.id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            });
    });
    router.delete('/marcas/:id', (req, res) => {
        getDb(req).query('DELETE FROM almacen_marcas WHERE id=?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
        });
    });

    // ============================================================
    // ALMACÉN — Entradas
    // ============================================================
    router.get('/entradas/proximo-codigo', (req, res) => {
        const anio = parseInt(req.query.anio) || new Date().getFullYear();
        _generarCodigoAlmacen('ENT', anio, (err, id) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ codigo: id });
        });
    });

    router.get('/empresa-cuentas', (req, res) => {
        const tdb = getDb(req);
        tdb.query("SELECT * FROM tesoreria_bancos WHERE estado = 'ACTIVO' OR estado = '1' OR estado IS NULL ORDER BY banco ASC", (err, rows) => {
            if (err || !rows || !rows.length) {
                tdb.query('SELECT * FROM empresa_cuentas_bancarias WHERE estado = 1 ORDER BY id ASC', (err2, rows2) => {
                    if (err2) return res.json(rows || []);
                    res.json((rows && rows.length) ? rows : (rows2 || []));
                });
                return;
            }
            res.json(rows || []);
        });
    });

    // Datos de la empresa emisora para los documentos (PDF de la O/C): se leen de la base de esta empresa
    router.get('/empresa-documentos', (req, res) => {
        getDb(req).query("SELECT clave, valor FROM configuracion_erp WHERE clave IN ('empresa_nombre', 'empresa_ruc', 'empresa_direccion', 'empresa_telefono')", (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const cfg = {};
            (rows || []).forEach(r => { cfg[r.clave] = r.valor; });
            res.json({ nombre: cfg.empresa_nombre || null, ruc: cfg.empresa_ruc || null, direccion: cfg.empresa_direccion || null, telefono: cfg.empresa_telefono || null });
        });
    });

    router.get('/entradas', (req, res) => {
        const tdb = getDb(req);
        let where = '';
        let params = [];
        if (req.query.ot_id) {
            where = ` WHERE e.ot_id = ?`;
            params.push(req.query.ot_id);
        }
        let q = `SELECT e.*, 
                    COALESCE(rec.total_recibido, 0) AS total_recibido,
                    COALESCE(rec.cant_recepciones, 0) AS cant_recepciones
             FROM (
                 SELECT * FROM entradas_inv e
                 ${where}
                 ORDER BY e.fecha DESC, e.id DESC
                 LIMIT 300
             ) e
             LEFT JOIN (
                 SELECT r.oc_id, SUM(dr.cantidad_recibida) AS total_recibido, COUNT(DISTINCT r.id) AS cant_recepciones
                 FROM recepciones_oc r
                 JOIN detalle_recepciones_oc dr ON dr.recepcion_id = r.id
                 GROUP BY r.oc_id
             ) rec ON rec.oc_id = e.id
             ORDER BY e.fecha DESC, e.id DESC`;
        tdb.query(q, params, async (err, rows) => {
            if (err) {
                console.error('[GET /api/almacen/entradas error]', err);
                return res.status(500).json({ error: err.message });
            }
            try {
                const { getPresignedUrl, s3KeyFromUrl } = require('../utils/s3');
                const entradaIds = (rows || []).map(r => r.id);

                // Mapear usuarios, proveedores y los ítems detallados sin límite de bytes
                const [usuariosMap, provsMap, itemsMap] = await Promise.all([
                    new Promise(resU => {
                        tdb.query('SELECT nombre, correo, idUsuario FROM usuarios', (eU, rU) => {
                            const uMap = {};
                            if (!eU && rU) {
                                rU.forEach(u => {
                                    if (u.correo) uMap[u.correo.toLowerCase()] = u.nombre;
                                    if (u.idUsuario) uMap[String(u.idUsuario)] = u.nombre;
                                    if (u.nombre) uMap[u.nombre.toLowerCase()] = u.nombre;
                                });
                            }
                            resU(uMap);
                        });
                    }),
                    new Promise(resP => {
                        tdb.query('SELECT id, nombre, razon_social, numero_documento, telefono, email FROM proveedores_inv', (eP, rP) => {
                            const pMap = {};
                            if (!eP && rP) {
                                rP.forEach(p => {
                                    if (p.id) pMap[p.id] = p;
                                    if (p.nombre) pMap[p.nombre.toLowerCase()] = p;
                                    if (p.razon_social) pMap[p.razon_social.toLowerCase()] = p;
                                });
                            }
                            resP(pMap);
                        });
                    }),
                    new Promise(resItems => {
                        if (!entradaIds.length) return resItems({});
                        tdb.query(
                            `SELECT d.*, 
                                    COALESCE(i.descripcion, d.descripcion) AS item_descripcion_final,
                                    COALESCE(i.codigo_articulo, '') AS item_codigo_articulo,
                                    COALESCE(i.unidad, 'UND') AS item_unidad
                             FROM detalle_entradas_inv d
                             LEFT JOIN inventario i ON d.inventario_id = i.id
                             WHERE d.entrada_id IN (?)
                             ORDER BY d.id ASC`,
                            [entradaIds],
                            (eI, rI) => {
                                const map = {};
                                if (!eI && rI) {
                                    rI.forEach(it => {
                                        if (!map[it.entrada_id]) map[it.entrada_id] = [];
                                        const cantNum = parseFloat(it.cantidad) || 0;
                                        const cuNum = parseFloat(it.costo_unitario) || 0;
                                        const impNum = parseFloat(it.importe) || (cantNum * cuNum);
                                        const invId = it.inventario_id || '';
                                        map[it.entrada_id].push({
                                            id: it.id,
                                            descripcion: it.item_descripcion_final || it.descripcion || '',
                                            cantidad: cantNum,
                                            costo_unitario: cuNum,
                                            moneda: it.moneda || 'PEN',
                                            inventario_id: invId,
                                            unidad_medida: it.item_unidad || 'UND',
                                            importe: impNum,
                                            codigo_articulo: it.item_codigo_articulo || invId
                                        });
                                    });
                                }
                                resItems(map);
                            }
                        );
                    })
                ]);

                const signedRows = (rows || []).map((r) => {
                    // Formatear fecha exacta YYYY-MM-DD sin desfase de zona horaria
                    if (r.fecha) {
                        if (r.fecha instanceof Date) {
                            const y = r.fecha.getFullYear();
                            const m = String(r.fecha.getMonth() + 1).padStart(2, '0');
                            const day = String(r.fecha.getDate()).padStart(2, '0');
                            r.fecha = `${y}-${m}-${day}`;
                        } else {
                            r.fecha = String(r.fecha).split('T')[0];
                        }
                    }

                    // Resolver creador_nombre
                    const creadorKey = (r.creado_por || '').toLowerCase().trim();
                    r.creador_nombre = usuariosMap[creadorKey] || usuariosMap[r.creado_por] || r.creado_por || 'SISTEMA';

                    // Resolver aprobador_nombre
                    const aprobKey = (r.aprobado_por || '').toLowerCase().trim();
                    r.aprobador_nombre = usuariosMap[aprobKey] || usuariosMap[r.aprobado_por] || r.aprobado_por || '';

                    // Resolver proveedor datos
                    const pInfo = (r.proveedor_id && provsMap[r.proveedor_id]) ||
                        (r.proveedor_nombre && provsMap[r.proveedor_nombre.toLowerCase()]) || null;
                    r.proveedor_ruc = pInfo?.numero_documento || '';
                    r.proveedor_telefono = pInfo?.telefono || '';
                    r.proveedor_email = pInfo?.email || '';

                    r.items = itemsMap[r.id] || [];
                    const isUSD = (r.moneda === 'USD');
                    const tc = parseFloat(r.tipo_cambio) || 1;
                    const totalOrigCalc = (r.items || []).reduce((acc, it) => acc + (parseFloat(it.importe) || 0), 0);
                    r.total_oc = totalOrigCalc > 0 ? totalOrigCalc : (isUSD && tc > 0 ? (parseFloat(r.total_pen) / tc) : parseFloat(r.total_pen || 0));
                    if (isUSD && tc > 0) {
                        r.total_pen = r.total_oc * tc;
                    }
                    r.url_voucher_presigned = r.url_voucher ? ('/api/almacen/entradas/' + encodeURIComponent(r.id) + '/archivo/voucher/ver') : null;
                    r.url_cotizacion_presigned = r.url_cotizacion ? ('/api/almacen/entradas/' + encodeURIComponent(r.id) + '/archivo/cotizacion/ver') : null;
                    r.url_factura_presigned = r.url_factura ? ('/api/almacen/entradas/' + encodeURIComponent(r.id) + '/archivo/factura/ver') : null;
                    return r;
                });
                res.json(signedRows);
            } catch (innerErr) {
                console.error('[GET /api/almacen/entradas inner error]', innerErr);
                res.status(500).json({ error: innerErr.message });
            }
        });
    });

    // ── Endpoint rápido para obtener URL de subida directa a S3 (Cotizaciones u otros) ──
    // NOTA: Debe ir ANTES de /entradas/:id para que Express no capture 'upload-url' como :id
    const _handleUploadUrlEntradas = async (req, res) => {
        try {
            const { getPresignedUploadUrl } = require('../utils/s3');
            const filename = req.query.filename || req.body?.filename;
            const contentType = req.query.contentType || req.body?.contentType;
            const tipo = req.query.tipo || req.body?.tipo;
            if (!filename) return res.status(400).json({ error: 'Falta filename' });

            const safeName = String(filename).replace(/[^a-zA-Z0-9.\-_]/g, '');
            const fileTipo = tipo || 'cotizacion';
            const s3Key = `almacen/entradas/${fileTipo}_${Date.now()}_${safeName}`;
            const uploadUrl = await getPresignedUploadUrl(s3Key, contentType || 'application/pdf', 600);

            const region = (process.env.AWS_REGION || 'us-east-2').trim();
            const bucket = (process.env.AWS_BUCKET_NAME || '').trim();
            const fileUrl = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;

            res.json({ uploadUrl, fileUrl, s3Key });
        } catch (e) {
            console.error('Error generando upload-url en almacén:', e);
            res.status(500).json({ error: e.message });
        }
    };
    router.get('/entradas/upload-url', _handleUploadUrlEntradas);
    router.post('/entradas/upload-url', _handleUploadUrlEntradas);

    router.get('/entradas/:id', async (req, res) => {
        const tdb = getDb(req);
        const rawId = (req.params.id || '').trim();
        if (!rawId) return res.status(400).json({ error: 'ID requerido' });

        const searchLike = '%' + rawId + '%';
        tdb.query('SELECT * FROM entradas_inv WHERE id = ? OR id LIKE ? ORDER BY fecha DESC, id DESC LIMIT 1', [rawId, searchLike], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!rows || !rows.length) return res.status(404).json({ error: 'Orden no encontrada' });

            const entrada = rows[0];
            tdb.query(
                `SELECT d.*, 
                        COALESCE(i.descripcion, d.descripcion) AS item_descripcion_final,
                        COALESCE(i.codigo_articulo, '') AS item_codigo_articulo,
                        COALESCE(i.unidad, 'UND') AS item_unidad
                 FROM detalle_entradas_inv d
                 LEFT JOIN inventario i ON d.inventario_id = i.id
                 WHERE d.entrada_id = ?
                 ORDER BY d.id ASC`,
                [entrada.id],
                (eI, rI) => {
                    const items = (rI || []).map(it => {
                        const cantNum = parseFloat(it.cantidad) || 0;
                        const cuNum = parseFloat(it.costo_unitario) || 0;
                        const impNum = parseFloat(it.importe) || (cantNum * cuNum);
                        const invId = it.inventario_id || '';
                        return {
                            id: it.id,
                            descripcion: it.item_descripcion_final || it.descripcion || '',
                            cantidad: cantNum,
                            costo_unitario: cuNum,
                            moneda: it.moneda || 'PEN',
                            inventario_id: invId,
                            unidad_medida: it.item_unidad || 'UND',
                            importe: impNum,
                            codigo_articulo: it.item_codigo_articulo || invId
                        };
                    });
                    res.json({ ...entrada, items });
                }
            );
        });
    });

    router.get('/entradas/:id/archivo/:tipo/ver', async (req, res) => {
        const { id, tipo } = req.params;
        if (!['voucher', 'cotizacion', 'factura'].includes(tipo)) return res.status(400).send('Tipo de archivo inválido');
        const tdb = getDb(req);
        const col = `url_${tipo}`;
        tdb.query(`SELECT ${col} FROM entradas_inv WHERE id=?`, [id], async (err, rows) => {
            if (err || !rows || !rows.length || !rows[0][col]) {
                return res.status(404).send('Archivo no encontrado');
            }
            const rawUrl = rows[0][col];
            try {
                const { getPresignedUrl, s3KeyFromUrl } = require('../utils/s3');
                const key = s3KeyFromUrl(rawUrl);
                if (key) {
                    const signed = await getPresignedUrl(key, 7200);
                    return res.redirect(signed);
                }
                res.redirect(rawUrl);
            } catch(e) {
                res.redirect(rawUrl);
            }
        });
    });

    router.post('/entradas', tcSunatSiFalta, (req, res) => {
        const tdb = getDb(req);
        const {
            fecha, proveedor_id, proveedor_nombre, documento_referencia, moneda, tipo_cambio, tipo_igv,
            observaciones, creado_por, items, motivo_entrada, placa, tipo_orden, condicion_pago, dias_credito, ot_id,
            serie, numero_correlativo, dias_pagar, prioridad, cuenta_bancaria_proveedor, cuenta_bancaria_empresa, solicitante, estado_factura,
            centro_costo, sub_motivo, autoriza, url_cotizacion
        } = req.body;
        const anio = new Date(fecha || Date.now()).getFullYear();
        const tc = parseFloat(tipo_cambio) || 1;
        _generarCodigoAlmacen('ENT', anio, (err, id) => {
            if (err) return res.status(500).json({ error: err.message });
            const total_pen = _calcularTotalPen(items || [], tc, moneda);
            tdb.query(
                `INSERT INTO entradas_inv (
                id, fecha, proveedor_id, proveedor_nombre, documento_referencia, moneda, tipo_cambio, total_pen,
                observaciones, tipo_igv, creado_por, motivo_entrada, placa, tipo_orden, condicion_pago, dias_credito, ot_id, estado,
                serie, numero_correlativo, dias_pagar, prioridad, cuenta_bancaria_proveedor, cuenta_bancaria_empresa, solicitante, estado_factura,
                centro_costo, sub_motivo, autoriza, url_cotizacion
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    id, fecha || new Date().toISOString().split('T')[0], proveedor_id || null, proveedor_nombre || null,
                    documento_referencia || null, moneda || 'PEN', tc || null, total_pen, observaciones || null, tipo_igv || 'sin_igv',
                    creado_por || null, motivo_entrada || null, placa || null, tipo_orden || 'Orden de compra', condicion_pago || 'Al contado',
                    dias_credito || 30, ot_id || null, 'Registrado',
                    serie || String(anio), numero_correlativo || id, parseInt(dias_pagar) || 0, prioridad || 'Normal',
                    cuenta_bancaria_proveedor || null, cuenta_bancaria_empresa || null, solicitante || null, estado_factura || 'Pendiente',
                    centro_costo || 'CC-100', sub_motivo || null, autoriza || null, url_cotizacion || null
                ],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    auditar(tdb, actorDe(req), {
                        action: 'CREATE', entity: 'warehouse-entry', entityId: id,
                        summary: `Registró la entrada ${id} de ${proveedor_nombre || 'proveedor sin nombre'} por ${moneda === 'USD' ? 'US$' : 'S/'} ${Number(total_pen || 0).toFixed(2)}`,
                        changes: diff({}, { proveedor: proveedor_nombre || null, monto_pen: total_pen, moneda: moneda || 'PEN', documento: documento_referencia || null, estado: 'Registrado' },
                            ['proveedor', 'monto_pen', 'moneda', 'documento', 'estado']),
                    });
                    if (!items || !items.length) { if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json({ ok: true, id }); }
                    // Resolver inventario_id por descripción para items sin código
                    const descsEntrada = items.filter(d => !d.inventario_id && d.descripcion).map(d => d.descripcion);
                    const resolverEntrada = (cb) => {
                        if (!descsEntrada.length) return cb({});
                        tdb.query('SELECT id, descripcion FROM inventario WHERE descripcion IN (?) AND activo = 1', [descsEntrada], (e, rows) => {
                            const mapa = {};
                            if (!e && rows) rows.forEach(r => { mapa[r.descripcion] = r.id; });
                            cb(mapa);
                        });
                    };
                    resolverEntrada((mapaInvEnt) => {
                        const dVals = items.map(d => {
                            const invId = d.inventario_id || mapaInvEnt[d.descripcion] || null;
                            return [id, invId, d.descripcion || null,
                                parseFloat(d.cantidad) || 0, parseFloat(d.costo_unitario) || 0, d.moneda || moneda || 'PEN',
                                parseFloat(d.importe) || ((parseFloat(d.cantidad) || 0) * (parseFloat(d.costo_unitario) || 0))];
                        });
                        tdb.query('INSERT INTO detalle_entradas_inv (entrada_id,inventario_id,descripcion,cantidad,costo_unitario,moneda,importe) VALUES ?', [dVals], () => {
                            // Actualizar costo_referencial en PEN para cada ítem con inventario_id conocido
                            const toUpdate = items.filter(d =>
                                (d.inventario_id || mapaInvEnt[d.descripcion]) && parseFloat(d.costo_unitario) > 0
                            );
                            if (!toUpdate.length) { 
                                despacharAprobacionWhatsAppAlmacen(req, tdb, id, req.body).catch(e => console.error('[WhatsApp OC] Background error:', e));
                                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } 
                                return res.json({ ok: true, id }); 
                            }
                            let done = 0;
                            toUpdate.forEach(d => {
                                const invId = d.inventario_id || mapaInvEnt[d.descripcion];
                                const isUSD = d.moneda === 'USD' || moneda === 'USD';
                                const costoOrig = parseFloat(d.costo_unitario);
                                const costoSoles = isUSD ? costoOrig * tc : costoOrig;
                                tdb.query(
                                    'UPDATE inventario SET moneda=?, costo_referencial=?, costo_soles=?, tipo_cambio=? WHERE id=? AND activo=1',
                                    [isUSD ? 'USD' : 'PEN', costoOrig, costoSoles, isUSD ? tc : null, invId],
                                    () => { 
                                        if (++done === toUpdate.length) {
                                            despacharAprobacionWhatsAppAlmacen(req, tdb, id, req.body).catch(e => console.error('[WhatsApp OC] Background error:', e));
                                            if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } 
                                            res.json({ ok: true, id }); 
                                        }
                                    }
                                );
                            });
                        });
                    });
                });
        });
    });

    // ── Endpoint para Reenviar Notificación de Aprobación por WhatsApp ──
    router.post('/entradas/:id/reenviar-whatsapp', async (req, res) => {
        try {
            const tdb = getDb(req);
            const promiseDb = typeof tdb.promise === 'function' ? tdb.promise() : tdb;
            const { id } = req.params;
            const [rows] = await promiseDb.query("SELECT * FROM entradas_inv WHERE id = ?", [id]);
            if (!rows || !rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
            const [items] = await promiseDb.query("SELECT * FROM detalle_entradas_inv WHERE entrada_id = ?", [id]);
            const bodyData = { ...rows[0], items };
            await despacharAprobacionWhatsAppAlmacen(req, tdb, id, bodyData);
            return res.json({ success: true, message: 'Notificación de WhatsApp enviada a Gerencia exitosamente' });
        } catch (e) {
            console.error('Error reenviando WhatsApp de orden:', e);
            return res.status(500).json({ error: e.message });
        }
    });

    router.put('/entradas/:id', tcSunatSiFalta, (req, res) => {
        const tdb = getDb(req);
        const { id } = req.params;
        const {
            fecha, proveedor_id, proveedor_nombre, documento_referencia, moneda, tipo_cambio, tipo_igv,
            observaciones, items, motivo_entrada, placa, tipo_orden, condicion_pago, dias_credito, ot_id,
            serie, numero_correlativo, dias_pagar, prioridad, cuenta_bancaria_proveedor, cuenta_bancaria_empresa, solicitante, estado_factura,
            centro_costo, sub_motivo, autoriza, url_cotizacion
        } = req.body;
        const tc = parseFloat(tipo_cambio) || 1;
        const total_pen = _calcularTotalPen(items || [], tc, moneda);

        let updateSql = `UPDATE entradas_inv SET
            fecha=?, proveedor_id=?, proveedor_nombre=?, documento_referencia=?, moneda=?, tipo_cambio=?, total_pen=?,
            observaciones=?, tipo_igv=?, motivo_entrada=?, placa=?, tipo_orden=?, condicion_pago=?, dias_credito=?, ot_id=?,
            serie=?, numero_correlativo=?, dias_pagar=?, prioridad=?, cuenta_bancaria_proveedor=?, cuenta_bancaria_empresa=?, solicitante=?, estado_factura=?,
            centro_costo=?, sub_motivo=?, autoriza=?`;
        const updateParams = [
            fecha || new Date().toISOString().split('T')[0], proveedor_id || null, proveedor_nombre || null,
            documento_referencia || null, moneda || 'PEN', tc || null, total_pen,
            observaciones || null, tipo_igv || 'sin_igv', motivo_entrada || null, placa || null, tipo_orden || 'Orden de compra', condicion_pago || 'Al contado', dias_credito || 30, ot_id || null,
            serie || null, numero_correlativo || null, parseInt(dias_pagar) || 0, prioridad || 'Normal',
            cuenta_bancaria_proveedor || null, cuenta_bancaria_empresa || null, solicitante || null, estado_factura || 'Pendiente',
            centro_costo || 'CC-100', sub_motivo || null, autoriza || null
        ];

        if (url_cotizacion !== undefined) {
            updateSql += `, url_cotizacion=?`;
            updateParams.push(url_cotizacion || null);
        }

        updateSql += ` WHERE id=?`;
        updateParams.push(id);

        tdb.query(updateSql, updateParams, (err) => {
                if (err) return res.status(500).json({ error: err.message });

                // Delete old details
                tdb.query('DELETE FROM detalle_entradas_inv WHERE entrada_id=?', [id], (errDel) => {
                    if (errDel) return res.status(500).json({ error: errDel.message });
                    if (!items || !items.length) { if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json({ ok: true, id }); }

                    const descsEntrada = items.filter(d => !d.inventario_id && d.descripcion).map(d => d.descripcion);
                    const resolverEntrada = (cb) => {
                        if (!descsEntrada.length) return cb({});
                        tdb.query('SELECT id, descripcion FROM inventario WHERE descripcion IN (?) AND activo = 1', [descsEntrada], (e, rows) => {
                            const mapa = {};
                            if (!e && rows) rows.forEach(r => { mapa[r.descripcion] = r.id; });
                            cb(mapa);
                        });
                    };

                    resolverEntrada((mapaInvEnt) => {
                        const dVals = items.map(d => {
                            const invId = d.inventario_id || mapaInvEnt[d.descripcion] || null;
                            return [id, invId, d.descripcion || null,
                                parseFloat(d.cantidad) || 0, parseFloat(d.costo_unitario) || 0, d.moneda || moneda || 'PEN',
                                parseFloat(d.importe) || ((parseFloat(d.cantidad) || 0) * (parseFloat(d.costo_unitario) || 0))];
                        });
                        tdb.query('INSERT INTO detalle_entradas_inv (entrada_id,inventario_id,descripcion,cantidad,costo_unitario,moneda,importe) VALUES ?', [dVals], () => {
                            const toUpdate = items.filter(d =>
                                (d.inventario_id || mapaInvEnt[d.descripcion]) && parseFloat(d.costo_unitario) > 0
                            );
                            if (!toUpdate.length) { if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } return res.json({ ok: true, id }); }
                            let done = 0;
                            toUpdate.forEach(d => {
                                const invId = d.inventario_id || mapaInvEnt[d.descripcion];
                                const isUSD = d.moneda === 'USD' || moneda === 'USD';
                                const costoOrig = parseFloat(d.costo_unitario);
                                const costoSoles = isUSD ? costoOrig * tc : costoOrig;
                                tdb.query(
                                    'UPDATE inventario SET moneda=?, costo_referencial=?, costo_soles=?, tipo_cambio=? WHERE id=? AND activo=1',
                                    [isUSD ? 'USD' : 'PEN', costoOrig, costoSoles, isUSD ? tc : null, invId],
                                    () => { if (++done === toUpdate.length) if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true, id }); }
                                );
                            });
                        });
                    });
                });
            }
        );
    });
    router.delete('/entradas/:id', (req, res) => {
        const tdb = getDb(req);
        const { id } = req.params;
        const cleanId = String(id).replace(/^ENT-/i, '');

        // 1. Eliminar movimientos de tesorería asociados a la OC (pagos / egresos)
        tdb.query(
            `DELETE FROM tesoreria_caja 
             WHERE (tipo_comprobante = 'ORDEN DE COMPRA' OR sub_motivo = 'PAGO REQUERIMIENTO' OR descripcion LIKE '%PAGO DE REQUERIMIENTO OC%')
               AND (descripcion LIKE ? OR descripcion LIKE ? OR observacion LIKE ? OR observacion LIKE ?)`,
            [`%${id}%`, `%${cleanId}%`, `%${id}%`, `%${cleanId}%`],
            (errTes) => {
                if (errTes) console.warn('Error borrando movimientos tesoreria_caja al eliminar OC:', errTes.message);

                // 2. Eliminar detalles de recepciones de la OC
                tdb.query('DELETE dr FROM detalle_recepciones_oc dr JOIN recepciones_oc r ON r.id = dr.recepcion_id WHERE r.oc_id = ?', [id], (errRecDet) => {
                    if (errRecDet) console.warn('Error borrando detalle_recepciones_oc al eliminar OC:', errRecDet.message);
                    // 3. Eliminar cabeceras de recepciones de la OC
                    tdb.query('DELETE FROM recepciones_oc WHERE oc_id = ?', [id], (errRec) => {
                        if (errRec) console.warn('Error borrando recepciones_oc al eliminar OC:', errRec.message);
                        // 4. Eliminar detalle de la entrada
                        tdb.query('DELETE FROM detalle_entradas_inv WHERE entrada_id=?', [id], (err) => {
                            if (err) return res.status(500).json({ error: err.message });
                            // 5. Eliminar entrada/OC principal
                            tdb.query('DELETE FROM entradas_inv WHERE id=?', [id], (err2) => {
                                if (err2) return res.status(500).json({ error: err2.message });
                                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { 
                                    logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); 
                                } 
                                res.json({ ok: true });
                            });
                        });
                    });
                });
            }
        );
    });

    router.put('/entradas/:id/estado', (req, res) => {
        const tdb = getDb(req);
        const { id } = req.params;
        const { estado, comentario, usuario } = req.body;
        if (!estado) return res.status(400).json({ error: 'Estado requerido' });

        const esAprob = (estado.toLowerCase().startsWith('aprob') || estado.toLowerCase().startsWith('autoriz'));
        const esRech = (estado.toLowerCase().startsWith('rechaz') || estado.toLowerCase().startsWith('anul'));
        const esObs = estado.toLowerCase().startsWith('observ');
        const aprobadorVal = (esAprob || esRech || esObs) ? (usuario || 'Gerencia') : (estado.toLowerCase() === 'registrado' ? null : undefined);

        let setFields = ['estado=?'];
        let params = [estado];

        if (aprobadorVal !== undefined) {
            setFields.push('aprobado_por=?');
            params.push(aprobadorVal);
            if (esAprob) {
                setFields.push('autoriza=?');
                params.push(aprobadorVal);
                setFields.push('fecha_aprobacion=NOW()');
            } else if (estado.toLowerCase() === 'registrado') {
                setFields.push('fecha_aprobacion=NULL');
            }
        }

        if (comentario && String(comentario).trim()) {
            setFields.push('observaciones=CONCAT(COALESCE(observaciones,""), " [Nota Gerencia: ", ?, "]")');
            params.push(String(comentario).trim());
        }

        params.push(id);
        let sql = `UPDATE entradas_inv SET ${setFields.join(', ')} WHERE id=?`;

        tdb.query(sql, params, (err) => {
            if (err) {
                // Fallback si la columna no existiera
                tdb.query('UPDATE entradas_inv SET estado=? WHERE id=?', [estado, id], (errFallback) => {
                    if (errFallback) return res.status(500).json({ error: errFallback.message });
                    res.json({ ok: true, estado });
                });
                return;
            }
            tdb.query('SELECT proveedor_nombre, total_pen, moneda FROM entradas_inv WHERE id = ?', [id], (eE, filasE) => {
                const e = (!eE && filasE && filasE[0]) ? filasE[0] : {};
                const aprobada = /aprob/i.test(String(estado || ''));
                auditar(tdb, actorDe(req), {
                    action: aprobada ? 'APPROVE' : 'UPDATE', entity: 'warehouse-entry', entityId: id,
                    summary: `${aprobada ? 'Aprobó' : 'Cambió el estado de'} la entrada ${id} de ${e.proveedor_nombre || 'proveedor'} por ${e.moneda === 'USD' ? 'US$' : 'S/'} ${Number(e.total_pen || 0).toFixed(2)} a ${estado}`,
                    changes: { estado: { from: null, to: estado } },
                });
            });

            // Sincronizar en ordenes_compra y notificar a Tesorería si fue aprobado
            if (esAprob) {
                (async () => {
                    try {
                        const promiseDb = typeof tdb.promise === 'function' ? tdb.promise() : tdb;
                        const tenantSlug = req.tenantSlug || (req.headers.host ? req.headers.host.split('.')[0] : null);

                        await promiseDb.query(
                            "UPDATE ordenes_compra SET estado = 'APROBADA', aprobado_por = ?, aprobado_en = NOW() WHERE codigo = ?",
                            [aprobadorVal, id]
                        );

                        // Obtener datos para WhatsApp de Tesorería
                        let tesoreriaPhone = null;
                        let empresaNombre = null;
                        const [cfgRows] = await promiseDb.query("SELECT clave, valor FROM configuracion_erp WHERE clave IN ('tesoreria_whatsapp', 'empresa_nombre')");
                        (cfgRows || []).forEach(r => {
                            if (r.clave === 'tesoreria_whatsapp' && r.valor) tesoreriaPhone = r.valor;
                            if (r.clave === 'empresa_nombre' && r.valor) empresaNombre = r.valor;
                        });
                        if (!tesoreriaPhone) tesoreriaPhone = process.env.TESORERIA_WHATSAPP || null;

                        if (tesoreriaPhone) {
                            const [entRows] = await promiseDb.query(
                                `SELECT e.id, e.proveedor_id, e.proveedor_nombre, e.total_pen, e.moneda, e.tipo_cambio, e.motivo_entrada, 
                                        e.cuenta_bancaria_proveedor, e.solicitante, e.creado_por,
                                        p.numero_documento AS proveedor_ruc,
                                        COALESCE((SELECT SUM(d.importe) FROM detalle_entradas_inv d WHERE d.entrada_id = e.id), 0) AS total_original,
                                        COALESCE(oc.monto_total, 0) AS oc_monto_total,
                                        COALESCE(oc.moneda, e.moneda) AS oc_moneda
                                 FROM entradas_inv e
                                 LEFT JOIN proveedores_inv p ON (e.proveedor_id = p.id OR e.proveedor_nombre = p.nombre)
                                 LEFT JOIN ordenes_compra oc ON oc.codigo = e.id
                                 WHERE e.id = ? LIMIT 1`,
                                [id]
                            );
                            const ent = entRows && entRows.length > 0 ? entRows[0] : {};

                            let ruc = ent.proveedor_ruc || '';
                            let provNombre = ent.proveedor_nombre || '';
                            if (!ruc && provNombre) {
                                const matchRuc = provNombre.match(/\b(10|20)\d{9}\b/);
                                if (matchRuc) ruc = matchRuc[0];
                            }

                            let ctaBancaria = ent.cuenta_bancaria_proveedor || '';
                            if (!ctaBancaria && ent.proveedor_id) {
                                try {
                                    const [ctas] = await promiseDb.query("SELECT banco, tipo_cuenta, numero_cuenta, moneda FROM proveedor_cuentas_bancarias WHERE proveedor_id = ? AND estado = 1 LIMIT 1", [ent.proveedor_id]);
                                    if (ctas && ctas.length > 0) {
                                        ctaBancaria = `${ctas[0].banco} - ${ctas[0].tipo_cuenta || 'Cta'} [${ctas[0].moneda || 'SOLES'}] - ${ctas[0].numero_cuenta}`;
                                    }
                                } catch(e) {}
                            }

                            const monedaFinal = ent.moneda || ent.oc_moneda || 'PEN';
                            const totalOrigParsed = parseFloat(ent.total_original || 0);
                            const totalOcParsed = parseFloat(ent.oc_monto_total || 0);
                            const totalPenParsed = parseFloat(ent.total_pen || 0);
                            const tcParsed = parseFloat(ent.tipo_cambio || 1);

                            let totalAutorizado = 0;
                            if (totalOrigParsed > 0) {
                                totalAutorizado = totalOrigParsed;
                            } else if (totalOcParsed > 0) {
                                totalAutorizado = totalOcParsed;
                            } else if (monedaFinal === 'USD' && tcParsed > 0) {
                                totalAutorizado = totalPenParsed / tcParsed;
                            } else {
                                totalAutorizado = totalPenParsed;
                            }

                            await sendTreasuryNotificationWhatsapp({
                                phone: tesoreriaPhone,
                                ocCode: id,
                                supplier: provNombre,
                                ruc: ruc,
                                total: totalAutorizado || 0,
                                currency: monedaFinal,
                                approverName: aprobadorVal,
                                reason: ent.motivo_entrada || comentario || 'Orden de compra autorizada',
                                bankAccount: ctaBancaria,
                                tenantSlug: tenantSlug,
                                empresaNombre: empresaNombre
                            });
                        }
                    } catch(eNotif) {
                        console.error('[WhatsApp Tesorería - Almacén] Error:', eNotif.message);
                    }
                })();
            }

            res.json({ ok: true, estado, aprobado_por: aprobadorVal });
        });
    });

    router.put('/entradas/:id/anular', (req, res) => {
        const tdb = getDb(req);
        const { id } = req.params;
        const { motivo } = req.body;
        tdb.query('UPDATE entradas_inv SET estado=?, motivo_anulacion=? WHERE id=?',
            ['Anulado', String(motivo || '').trim(), id], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'MODIFICÓ', req.path); }
                res.json({ ok: true });
            }
        );
    });

    // ── Pre-signed Upload BATCH: genera URLs para subir directo a S3 (patrón idéntico a seguridad/unidades) ──
    router.post('/entradas/:id/archivos/presigned', async (req, res) => {
        try {
            const { getPresignedUploadUrl } = require('../utils/s3');
            const archivos = (req.body && req.body.archivos) || [];
            if (!archivos.length) return res.status(400).json({ error: 'No se enviaron archivos' });

            const bucket = (process.env.AWS_BUCKET_NAME || '').trim();
            const region = (process.env.AWS_REGION || 'us-east-2').trim();

            const urls = await Promise.all(archivos.map(async (arch) => {
                const tipo = arch.tipo || 'voucher';
                const ext = (arch.fileName || 'file.pdf').split('.').pop() || 'pdf';
                const s3Key = `almacen/entradas/${req.params.id}/${tipo}_${Date.now()}_${Math.random().toString(36).substring(2,7)}.${ext}`;
                const uploadUrl = await getPresignedUploadUrl(s3Key, arch.contentType || 'application/pdf', 600);
                const finalUrl = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;
                return { uploadUrl, s3Key, finalUrl, tipo };
            }));

            res.json({ ok: true, urls });
        } catch (e) {
            console.error('Error generando presigned URLs batch:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // ── Confirmar uploads batch: guarda URLs en BD después de subir directo a S3 ──
    router.post('/entradas/:id/archivos/confirmar', async (req, res) => {
        try {
            const tdb = getDb(req);
            const { deleteFromS3, s3KeyFromUrl } = require('../utils/s3');
            const exitosos = (req.body && req.body.exitosos) || [];
            const numOperacionGeneral = ((req.body && req.body.numero_operacion) || '').trim();

            // Obtener estado actual
            const rows = await new Promise((resolve, reject) => {
                tdb.query('SELECT url_voucher, url_cotizacion, url_factura, numero_operacion, estado FROM entradas_inv WHERE id=?',
                    [req.params.id], (err, r) => err ? reject(err) : resolve(r));
            });

            const current = rows && rows[0] ? rows[0] : {};
            const sets = [];
            const params = [];
            let cambiaEstado = false;
            let finalVoucherUrl = null;
            let finalNumeroOperacion = numOperacionGeneral;

            for (const ex of exitosos) {
                const col = `url_${ex.tipo}`;
                if (!['url_voucher', 'url_cotizacion', 'url_factura'].includes(col)) continue;

                // Borrar anterior si existe
                if (current[col]) {
                    const oldKey = s3KeyFromUrl(current[col]);
                    if (oldKey) await deleteFromS3(oldKey).catch(() => {});
                }

                sets.push(`${col}=?`);
                params.push(ex.finalUrl);

                if (ex.tipo === 'voucher') {
                    cambiaEstado = true;
                    finalVoucherUrl = ex.finalUrl;
                    const numOp = (ex.numero_operacion || numOperacionGeneral || '').trim();
                    if (numOp) {
                        finalNumeroOperacion = numOp;
                    }
                }
                if (ex.tipo === 'factura') {
                    sets.push("estado_factura='Factura Entregada'");
                    const docRef = (ex.documento_referencia || (req.body && req.body.documento_referencia) || '').trim();
                    if (docRef) {
                        sets.push("documento_referencia=?");
                        params.push(docRef);
                    }
                }
            }

            if (finalNumeroOperacion) {
                sets.push("numero_operacion=?");
                params.push(finalNumeroOperacion);
            }

            if (cambiaEstado) {
                sets.push("estado='Procesado'");
            }

            if (sets.length) {
                params.push(req.params.id);
                await new Promise((resolve, reject) => {
                    tdb.query(`UPDATE entradas_inv SET ${sets.join(', ')} WHERE id=?`, params, (err) => err ? reject(err) : resolve());
                });
            }

            // Sincronizar automáticamente con tesoreria_caja si se actualizó voucher o numero_operacion
            if (finalVoucherUrl || finalNumeroOperacion) {
                try {
                    const ocId = req.params.id;
                    const setCaja = [];
                    const pCaja = [];
                    if (finalVoucherUrl) {
                        setCaja.push("voucher_url = ?");
                        pCaja.push(finalVoucherUrl);
                    }
                    if (finalNumeroOperacion) {
                        setCaja.push("numero_constancia_deposito = ?");
                        pCaja.push(finalNumeroOperacion);
                    }
                    if (setCaja.length) {
                        pCaja.push(`%${ocId}%`, `%${ocId}%`);
                        const sqlCaja = `UPDATE tesoreria_caja SET ${setCaja.join(', ')} WHERE (descripcion LIKE ? OR observacion LIKE ?)`;
                        await new Promise((resolve) => {
                            tdb.query(sqlCaja, pCaja, (err) => {
                                if (err) console.error('Error sincronizando tesoreria_caja:', err);
                                resolve();
                            });
                        });
                    }
                } catch (errCaja) {
                    console.error('Error sincronizando con tesoreria_caja:', errCaja);
                }
            }

            res.json({ ok: true, estado: cambiaEstado ? 'Procesado' : (current.estado || 'Registrado') });
        } catch (e) {
            console.error('Error confirmando uploads batch:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // ── Upload legacy (fallback via servidor) ──
    router.post('/entradas/:id/archivo/:tipo', _multerInv.single('archivo'), (req, res) => {
        const { tipo } = req.params;
        if (!['voucher', 'cotizacion', 'factura'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
        if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

        try {
            const tdb = getDb(req);
            const { uploadToS3, deleteFromS3, s3KeyFromUrl, getPresignedUrl } = require('../utils/s3');
            const col = `url_${tipo}`;
            tdb.query(`SELECT ${col}, numero_operacion, estado FROM entradas_inv WHERE id=?`, [req.params.id], async (err, rows) => {
                if (err) return res.status(500).json({ error: 'DB Error: ' + err.message });
                try {
                    if (rows && rows.length > 0 && rows[0][col]) {
                        const oldKey = s3KeyFromUrl(rows[0][col]);
                        if (oldKey) await deleteFromS3(oldKey).catch(() => { });
                    }
                    const ext = req.file.originalname.split('.').pop() || 'pdf';
                    const s3Key = `almacen/entradas/${req.params.id}/${tipo}_${Date.now()}.${ext}`;
                    const url = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);

                    // Actualizaciones según el tipo de documento
                    let updateSql = `UPDATE entradas_inv SET ${col}=? WHERE id=?`;
                    let updateParams = [url, req.params.id];
                    const numOp = (req.body && (req.body.numero_operacion || req.body.numero_constancia)) ? String(req.body.numero_operacion || req.body.numero_constancia).trim() : null;

                    if (tipo === 'voucher') {
                        if (numOp) {
                            updateSql = `UPDATE entradas_inv SET ${col}=?, numero_operacion=?, estado='Procesado' WHERE id=?`;
                            updateParams = [url, numOp, req.params.id];
                        } else {
                            updateSql = `UPDATE entradas_inv SET ${col}=?, estado='Procesado' WHERE id=?`;
                        }

                        // Sincronizar tesoreria_caja
                        try {
                            const ocId = req.params.id;
                            let sqlCaja = "UPDATE tesoreria_caja SET voucher_url = ?";
                            const pCaja = [url];
                            if (numOp) {
                                sqlCaja += ", numero_constancia_deposito = ?";
                                pCaja.push(numOp);
                            }
                            sqlCaja += " WHERE (descripcion LIKE ? OR observacion LIKE ?)";
                            pCaja.push(`%${ocId}%`, `%${ocId}%`);
                            tdb.query(sqlCaja, pCaja, () => {});
                        } catch (eCaja) {}

                    } else if (tipo === 'factura') {
                        const docRef = (req.body && (req.body.documento_referencia || req.body.numero_factura)) ? String(req.body.documento_referencia || req.body.numero_factura).trim() : null;
                        if (docRef) {
                            updateSql = `UPDATE entradas_inv SET ${col}=?, documento_referencia=?, estado_factura='Factura Entregada' WHERE id=?`;
                            updateParams = [url, docRef, req.params.id];
                        } else {
                            updateSql = `UPDATE entradas_inv SET ${col}=?, estado_factura='Factura Entregada' WHERE id=?`;
                        }
                    }

                    tdb.query(updateSql, updateParams, async (err2) => {
                        if (err2) return res.status(500).json({ error: 'Update Error: ' + err2.message });
                        const presignedUrl = await getPresignedUrl(s3Key).catch(() => url);
                        res.json({ ok: true, url, presignedUrl, estado: tipo === 'voucher' ? 'Procesado' : (rows[0] ? rows[0].estado : 'Registrado') });
                    });
                } catch (innerError) {
                    res.status(500).json({ error: 'S3 Error: ' + innerError.message });
                }
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.delete('/entradas/:id/archivo/:tipo', (req, res) => {
        const { tipo } = req.params;
        if (!['voucher', 'cotizacion', 'factura'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });

        try {
            const tdb = getDb(req);
            const { deleteFromS3, s3KeyFromUrl } = require('../utils/s3');
            const col = `url_${tipo}`;
            tdb.query(`SELECT ${col} FROM entradas_inv WHERE id=?`, [req.params.id], async (err, rows) => {
                if (err) return res.status(500).json({ error: 'DB Error: ' + err.message });
                try {
                    if (rows && rows.length > 0 && rows[0][col]) {
                        const oldKey = s3KeyFromUrl(rows[0][col]);
                        if (oldKey) await deleteFromS3(oldKey).catch(() => { });
                    }
                    let delSql = `UPDATE entradas_inv SET ${col}=NULL WHERE id=?`;
                    if (tipo === 'factura') {
                        delSql = `UPDATE entradas_inv SET ${col}=NULL, documento_referencia=NULL, estado_factura='Factura Pendiente' WHERE id=?`;
                    } else if (tipo === 'voucher') {
                        delSql = `UPDATE entradas_inv SET ${col}=NULL, numero_operacion=NULL WHERE id=?`;
                        // Sincronizar con tesoreria_caja
                        try {
                            const ocId = req.params.id;
                            tdb.query("UPDATE tesoreria_caja SET voucher_url=NULL, numero_constancia_deposito=NULL WHERE (descripcion LIKE ? OR observacion LIKE ?)", [`%${ocId}%`, `%${ocId}%`], () => {});
                        } catch (eCaja) {}
                    }
                    tdb.query(delSql, [req.params.id], (err2) => {
                        if (err2) return res.status(500).json({ error: 'Update Error: ' + err2.message });
                        if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'ELIMINÓ', req.path); }
                        res.json({ ok: true });
                    });
                } catch (innerError) {
                    res.status(500).json({ error: 'S3 Error: ' + innerError.message });
                }
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ============================================================
    // ALMACÉN — Salidas
    // ============================================================
    router.get('/salidas', (req, res) => {
        const targetDb = req.db || db;
        const q = (req.query.q || '').trim();

        let whereClause = '';
        let queryParams = [];
        if (q) {
            whereClause = 'WHERE s.id LIKE ?';
            queryParams = [`%${q}%`];
        }

        const limit = q ? '' : 'LIMIT 2000';

        targetDb.query(`SELECT s.*
              FROM salidas_inv s
              ${whereClause}
              ORDER BY s.fecha DESC, s.id DESC ${limit}`, queryParams, (err, rows) => {
            if (err) {
                console.error('Error GET /api/almacen/salidas:', err);
                return res.status(500).json({ error: err.message });
            }

            if (!rows || rows.length === 0) {
                return res.json([]);
            }

            const salidaIds = rows.map(r => r.id);
            targetDb.query(`
                SELECT d.id, d.salida_id, d.inventario_id,
                       COALESCE(i.descripcion, d.descripcion, '') AS descripcion,
                       COALESCE(d.cantidad, 0) AS cantidad,
                       COALESCE(d.costo_unitario, 0) AS costo_unitario,
                       COALESCE(d.moneda, 'PEN') AS moneda,
                       COALESCE(d.importe, d.cantidad * d.costo_unitario, 0) AS importe
                FROM detalle_salidas_inv d
                LEFT JOIN inventario i ON d.inventario_id = i.id
                WHERE d.salida_id IN (?)
                ORDER BY d.id ASC
            `, [salidaIds], (errDet, detRows) => {
                if (errDet) {
                    console.error('Error cargando detalle_salidas_inv:', errDet);
                    return res.status(500).json({ error: errDet.message });
                }

                const itemsBySalida = {};
                (detRows || []).forEach(d => {
                    if (!itemsBySalida[d.salida_id]) itemsBySalida[d.salida_id] = [];
                    itemsBySalida[d.salida_id].push({
                        id: d.id,
                        inventario_id: d.inventario_id || null,
                        descripcion: d.descripcion || null,
                        cantidad: parseFloat(d.cantidad) || 0,
                        costo_unitario: parseFloat(d.costo_unitario) || 0,
                        moneda: d.moneda || 'PEN',
                        importe: parseFloat(d.importe) || 0
                    });
                });

                const result = rows.map(r => {
                    let sol = (r.solicitante_nombre || r.creado_por || '').trim();
                    if (sol && sol.includes('@')) {
                        let uName = sol.split('@')[0].replace(/[._-]/g, ' ');
                        sol = uName.charAt(0).toUpperCase() + uName.slice(1);
                    }
                    const items = itemsBySalida[r.id] || [];
                    const calcTotal = items.reduce((acc, it) => acc + (parseFloat(it.importe) || (it.cantidad * it.costo_unitario) || 0), 0);
                    const totalPen = (r.total_pen != null && parseFloat(r.total_pen) > 0) ? parseFloat(r.total_pen) : calcTotal;
                    return Object.assign({}, r, { creado_por: sol, items: items, total_pen: totalPen });
                });

                res.json(result);
            });
        });
    });
    router.post('/salidas', (req, res) => {
        const { fecha, tipo_destino, placa, responsable, responsable_id, moneda, tipo_cambio, observaciones, creado_por, items, ticket_ot } = req.body;
        // Todo se escribe en la base de esta empresa (req.db), no en la base por defecto
        const targetDb = getDb(req);

        // Solo se despachan artículos (INV): los servicios (SERV) no salen del almacén
        const servicios = (Array.isArray(items) ? items : []).filter(d => /^SERV/i.test(String(d.inventario_id || '')));
        if (servicios.length) {
            return res.status(400).json({ error: 'Solo se pueden solicitar artículos (INV). Quita los servicios: ' + servicios.map(d => d.inventario_id).join(', ') });
        }

        // La OT debe existir en la base de esta empresa
        if (ticket_ot) {
            targetDb.query('SELECT estado FROM ordenes_trabajo WHERE id_ot = ?', [ticket_ot], (errOT, rowsOT) => {
                if (errOT) return res.status(500).json({ error: errOT.message });
                if (!rowsOT.length) return res.status(400).json({ error: 'La OT ' + ticket_ot + ' no existe' });
                // Bloqueo removido: Permitir salidas a OT cerradas para regularizaciones de almacén
                crearSalida();
            });
        } else {
            crearSalida();
        }

        // Costo promedio ponderado del inventario para cada repuesto (S/); luego se crea la salida con ese costo
        function costearItemsSalida(lista, cb) {
            const ids = [...new Set((lista || []).map(d => d.inventario_id).filter(Boolean))];
            if (!ids.length) return cb();
            targetDb.query('SELECT id, costo_soles, costo_referencial FROM inventario WHERE id IN (?)', [ids], (err, rows) => {
                if (!err && rows) {
                    const mapa = new Map(rows.map(r => [String(r.id), r]));
                    lista.forEach(d => {
                        const inv = d.inventario_id ? mapa.get(String(d.inventario_id)) : null;
                        if (!inv) return;
                        const costo = Number(inv.costo_soles) || Number(inv.costo_referencial) || 0;
                        if (costo > 0) { d.costo_unitario = costo; d.moneda = 'PEN'; delete d.importe; }
                    });
                }
                cb();
            });
        }
        function crearSalida() {
            if (items && items.length && !items.__costeados) {
                return costearItemsSalida(items, () => { items.__costeados = true; crearSalida(); });
            }
            const anio = new Date(fecha || Date.now()).getFullYear();
            const tc = parseFloat(tipo_cambio) || 1;
            const solUser = creado_por || req.body.usuario || req.body.solicitante || (req.user && req.user.nombre) || null;
            _generarCodigoAlmacen('SAL', anio, (err, id) => {
                if (err) return res.status(500).json({ error: err.message });
                const total_pen = _calcularTotalPen(items || [], tc, moneda);
                targetDb.query('INSERT INTO salidas_inv (id,fecha,tipo_destino,placa,responsable,responsable_id,moneda,tipo_cambio,total_pen,observaciones,creado_por,ticket_ot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                    [id, fecha || new Date().toISOString().split('T')[0], tipo_destino, placa || null, responsable || null,
                        responsable_id || null, moneda || 'PEN', tc || null, total_pen, observaciones || null, solUser, ticket_ot || null],
                    (err2) => {
                        if (err2) return res.status(500).json({ error: err2.message });
                        auditar(targetDb, actorDe(req), {
                            action: 'CREATE', entity: 'warehouse-exit', entityId: id,
                            summary: `Registró la salida ${id}${tipo_destino ? ` a ${tipo_destino}` : ''}${placa ? ` de la unidad ${placa}` : ''}${ticket_ot ? ` para la OT ${ticket_ot}` : ''}${(responsable || solUser) ? `, solicitada por ${responsable || solUser}` : ''}`,
                            changes: diff({}, { destino: tipo_destino || null, placa: placa || null, ot: ticket_ot || null, solicitante: responsable || solUser || null, total_pen, moneda: moneda || 'PEN' },
                                ['destino', 'placa', 'ot', 'solicitante', 'total_pen', 'moneda']),
                        });
                        const registrar = () => {
                            if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); }
                            res.json({ ok: true, id });
                        };
                        if (!items || !items.length) return registrar();
                        // Resolver inventario_id por descripción para items sin código
                        const descsSalida = items.filter(d => !d.inventario_id && d.descripcion).map(d => d.descripcion);
                        const resolverSalida = (cb) => {
                            if (!descsSalida.length) return cb({});
                            targetDb.query('SELECT id, descripcion FROM inventario WHERE descripcion IN (?) AND activo = 1', [descsSalida], (e, rows) => {
                                const mapa = {};
                                if (!e && rows) rows.forEach(r => { mapa[r.descripcion] = r.id; });
                                cb(mapa);
                            });
                        };
                        resolverSalida((mapaInvSal) => {
                            const dVals = items.map(d => {
                                const invId = d.inventario_id || mapaInvSal[d.descripcion] || null;
                                return [id, invId, d.descripcion || null,
                                    parseFloat(d.cantidad) || 0, parseFloat(d.costo_unitario) || 0, d.moneda || moneda || 'PEN',
                                    parseFloat(d.importe) || ((parseFloat(d.cantidad) || 0) * (parseFloat(d.costo_unitario) || 0))];
                            });
                            targetDb.query('INSERT INTO detalle_salidas_inv (salida_id,inventario_id,descripcion,cantidad,costo_unitario,moneda,importe) VALUES ?', [dVals], (errDet) => {
                                // Sin líneas la salida no rebaja stock, pero su total sí suma al costo de la OT:
                                // si el detalle falla, se deshace la cabecera y no queda una salida a medias
                                if (errDet) {
                                    return targetDb.query('DELETE FROM salidas_inv WHERE id = ?', [id], () =>
                                        res.status(500).json({ error: 'No se pudo guardar el detalle de la salida: ' + errDet.message }));
                                }
                                registrar();
                            });
                        });
                    });
            }, targetDb);
        } // fin crearSalida
    });
    router.put('/salidas/:id', (req, res) => {
        const { id } = req.params;
        const { accion, motivo } = req.body;
        if (accion === 'anular') {
            const motivoFinal = (motivo && String(motivo).trim()) ? String(motivo).trim() : 'Anulado por el usuario';
            const targetDb = getDb(req);
            targetDb.query('UPDATE salidas_inv SET estado=?, motivo_anulacion=? WHERE id=?',
                ['Anulado', motivoFinal, id], (err, result) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (!result.affectedRows) return res.status(404).json({ error: 'No encontrado' });
                    if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
                });
        } else if (accion === 'despachar') {
            const { item_ids } = req.body;
            const targetDb = getDb(req);

            const sqlDetalleConStock = `
                SELECT d.id AS detalle_id, d.descripcion, d.cantidad, d.costo_unitario, d.moneda, d.importe, d.inventario_id,
                       i.id AS inv_id, i.descripcion AS inv_desc,
                       ROUND(COALESCE(i.stock_regularizado, 0) 
                         + COALESCE(ent.total_entradas, 0) 
                         + COALESCE(rec.total_recepciones, 0) 
                         - COALESCE(sal.total_salidas, 0), 4) AS stock_actual
                FROM detalle_salidas_inv d
                LEFT JOIN inventario i ON (i.id = d.inventario_id OR i.descripcion = d.descripcion OR LEFT(d.descripcion, CHAR_LENGTH(i.id)) = i.id) AND i.activo = 1
                LEFT JOIN (
                    SELECT de.inventario_id, SUM(de.cantidad) AS total_entradas 
                    FROM detalle_entradas_inv de
                    JOIN entradas_inv e ON e.id = de.entrada_id
                    JOIN inventario inv ON inv.id = de.inventario_id
                    WHERE (inv.fecha_regularizacion IS NULL OR COALESCE(e.created_at, e.fecha) > inv.fecha_regularizacion)
                      AND (e.estado IS NULL OR e.estado != 'Anulado')
                      AND (e.tipo_orden = 'Entrada directa' OR e.tipo_orden = 'Ajuste')
                    GROUP BY de.inventario_id
                ) ent ON ent.inventario_id = i.id
                LEFT JOIN (
                    SELECT dr.inventario_id, SUM(dr.cantidad_recibida) AS total_recepciones
                    FROM detalle_recepciones_oc dr
                    JOIN recepciones_oc r ON r.id = dr.recepcion_id
                    JOIN entradas_inv e ON e.id = r.oc_id
                    JOIN inventario inv ON inv.id = dr.inventario_id
                    WHERE (e.estado IS NULL OR (e.estado != 'Anulado' AND LOWER(e.estado) NOT LIKE '%anul%' AND LOWER(e.estado) NOT LIKE '%rechaz%'))
                      AND (inv.fecha_regularizacion IS NULL OR COALESCE(r.created_at, r.fecha_recepcion) > inv.fecha_regularizacion)
                    GROUP BY dr.inventario_id
                ) rec ON rec.inventario_id = i.id
                LEFT JOIN (
                    SELECT ds.inventario_id, SUM(ds.cantidad) AS total_salidas
                    FROM detalle_salidas_inv ds
                    JOIN salidas_inv s2 ON s2.id = ds.salida_id
                    JOIN inventario inv ON inv.id = ds.inventario_id
                    WHERE s2.estado = 'Despachado'
                      AND (inv.fecha_regularizacion IS NULL OR COALESCE(s2.created_at, s2.fecha) > inv.fecha_regularizacion)
                    GROUP BY ds.inventario_id
                ) sal ON sal.inventario_id = i.id
                WHERE d.salida_id = ?
            `;

            targetDb.query(sqlDetalleConStock, [id], (errStk, rowsStk) => {
                if (errStk) return res.status(500).json({ error: errStk.message });
                if (!rowsStk || !rowsStk.length) return res.status(404).json({ error: 'La salida no tiene artículos para despachar' });

                // Filtrar según item_ids seleccionados si se proporcionan
                let aDespachar = rowsStk;
                let quedanPendientes = [];

                if (Array.isArray(item_ids) && item_ids.length > 0) {
                    const idSet = new Set(item_ids.map(Number));
                    aDespachar = rowsStk.filter(r => idSet.has(Number(r.detalle_id)));
                    quedanPendientes = rowsStk.filter(r => !idSet.has(Number(r.detalle_id)));

                    if (aDespachar.length === 0) {
                        return res.status(400).json({ error: 'Debes seleccionar al menos un repuesto para despachar.' });
                    }
                }

                // Validar stock solo para los repuestos que se van a despachar
                const sinStock = [];
                aDespachar.forEach(it => {
                    const stockDisp = it.stock_actual != null ? parseFloat(it.stock_actual) : 0;
                    const cantReq = parseFloat(it.cantidad || 0);
                    if (cantReq > stockDisp) {
                        sinStock.push(`"${it.descripcion || it.inv_desc || it.inventario_id}" (Requerido: ${cantReq}, Disponible: ${stockDisp <= 0 ? 0 : stockDisp})`);
                    }
                });

                if (sinStock.length > 0) {
                    return res.status(400).json({
                        error: `No se puede despachar la salida porque no cuenta con stock suficiente en almacén:\n• ${sinStock.join('\n• ')}`
                    });
                }

                // Proceder con el despacho
                if (quedanPendientes.length > 0) {
                    // Despacho parcial: Consultar cabecera original
                    targetDb.query('SELECT * FROM salidas_inv WHERE id = ?', [id], (errCab, rowsCab) => {
                        if (errCab || !rowsCab.length) return res.status(500).json({ error: 'Error al obtener cabecera de salida' });
                        const cab = rowsCab[0];
                        const anio = new Date(cab.fecha || Date.now()).getFullYear();

                        _generarCodigoAlmacen('SAL', anio, (errCod, nuevoId) => {
                            if (errCod) return res.status(500).json({ error: 'Error al generar folio para ítems pendientes' });

                            const tc = parseFloat(cab.tipo_cambio) || 1;
                            const totalPendientePen = quedanPendientes.reduce((acc, it) => acc + ((parseFloat(it.importe) || (parseFloat(it.cantidad || 0) * parseFloat(it.costo_unitario || 0)))), 0);
                            const totalDespachadoPen = aDespachar.reduce((acc, it) => acc + ((parseFloat(it.importe) || (parseFloat(it.cantidad || 0) * parseFloat(it.costo_unitario || 0)))), 0);

                            // Insertar nueva salida con estado 'Pendiente' para los ítems restantes
                            targetDb.query(
                                'INSERT INTO salidas_inv (id, fecha, tipo_destino, placa, responsable, responsable_id, moneda, tipo_cambio, total_pen, observaciones, creado_por, ticket_ot, estado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                                [
                                    nuevoId, cab.fecha, cab.tipo_destino, cab.placa, cab.responsable, cab.responsable_id,
                                    cab.moneda || 'PEN', tc, totalPendientePen,
                                    (cab.observaciones ? cab.observaciones + ' ' : '') + `(Separado de ${id})`,
                                    cab.creado_por, cab.ticket_ot, 'Pendiente'
                                ],
                                (errIns) => {
                                    if (errIns) return res.status(500).json({ error: 'Error al registrar salida pendiente restante' });

                                    // Mover los registros de detalle no despachados a la nueva salida
                                    const idsMover = quedanPendientes.map(r => r.detalle_id);
                                    targetDb.query('UPDATE detalle_salidas_inv SET salida_id = ? WHERE id IN (?)', [nuevoId, idsMover], (errUpdDet) => {
                                        if (errUpdDet) console.error('Error moviendo detalles:', errUpdDet);

                                        // Marcar la salida original como Despachada y actualizar su total
                                        targetDb.query("UPDATE salidas_inv SET estado='Despachado', total_pen=? WHERE id=?", [totalDespachadoPen, id], (errFinal) => {
                                            if (errFinal) return res.status(500).json({ error: errFinal.message });

                                            // Normalizar inventario_id si faltara
                                            targetDb.query(
                                                `UPDATE detalle_salidas_inv d
                                                 INNER JOIN inventario i ON (i.descripcion = d.descripcion OR LEFT(d.descripcion, CHAR_LENGTH(i.id)) = i.id) AND i.activo = 1
                                                 SET d.inventario_id = i.id
                                                 WHERE d.salida_id = ? AND (d.inventario_id IS NULL OR d.inventario_id = '')`,
                                                [id], () => { }
                                            );

                                            if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { 
                                                logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'MODIFICÓ', req.path); 
                                            }
                                            abrirOcPorQuiebreSalida(getDb(req), id);
                                            res.json({ ok: true, parcial: true, nuevo_pendiente_id: nuevoId, despachado_id: id });
                                        });
                                    });
                                }
                            );
                        });
                    });
                } else {
                    // Despacho total de todos los artículos
                    targetDb.query("UPDATE salidas_inv SET estado='Despachado' WHERE id=?", [id], (err, result) => {
                        if (err) return res.status(500).json({ error: err.message });
                        if (!result.affectedRows) return res.status(404).json({ error: 'No encontrado' });

                        // Normalizar inventario_id si faltara
                        targetDb.query(
                            `UPDATE detalle_salidas_inv d
                             INNER JOIN inventario i ON (i.descripcion = d.descripcion OR LEFT(d.descripcion, CHAR_LENGTH(i.id)) = i.id) AND i.activo = 1
                             SET d.inventario_id = i.id
                             WHERE d.salida_id = ? AND (d.inventario_id IS NULL OR d.inventario_id = '')`,
                            [id], () => { }
                        );

                        if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { 
                            logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'MODIFICÓ', req.path); 
                        }
                        abrirOcPorQuiebreSalida(getDb(req), id);
                        res.json({ ok: true, parcial: false });
                    });
                }
            });
        } else if (accion === 'editar') {
            const { fecha, tipo_destino, placa, responsable, ticket_ot, observaciones, items, moneda, tipo_cambio } = req.body;
            const tc = parseFloat(tipo_cambio) || 1;
            const total_pen = _calcularTotalPen(items || [], tc, moneda);
            getDb(req).query(`UPDATE salidas_inv SET fecha=?, tipo_destino=?, placa=?, responsable=?, ticket_ot=?, observaciones=?, moneda=?, tipo_cambio=?, total_pen=? WHERE id=?`,
                [fecha || null, tipo_destino || null, placa || null, responsable || null, ticket_ot || null, observaciones || null, moneda || 'PEN', tc, total_pen, id],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    getDb(req).query('DELETE FROM detalle_salidas_inv WHERE salida_id=?', [id], (err2) => {
                        if (err2) return res.status(500).json({ error: err2.message });
                        if (!items || !items.length) {
                            if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'MODIFICÓ', req.path); }
                            return res.json({ ok: true, id });
                        }
                        const dVals = items.map(d => {
                            return [id, d.inventario_id || null, d.descripcion || null,
                                parseFloat(d.cantidad) || 0, parseFloat(d.costo_unitario) || 0, d.moneda || moneda || 'PEN',
                                parseFloat(d.importe) || ((parseFloat(d.cantidad) || 0) * (parseFloat(d.costo_unitario) || 0))];
                        });
                        getDb(req).query('INSERT INTO detalle_salidas_inv (salida_id,inventario_id,descripcion,cantidad,costo_unitario,moneda,importe) VALUES ?', [dVals], (err3) => {
                            if (err3) return res.status(500).json({ error: err3.message });
                            if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', 'MODIFICÓ', req.path); }
                            res.json({ ok: true, id });
                        });
                    });
                });
        } else {
            res.status(400).json({ error: 'Acción no válida' });
        }
    });
    router.delete('/salidas/:id', (req, res) => {
        const { id } = req.params;
        getDb(req).query('DELETE FROM detalle_salidas_inv WHERE salida_id=?', [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            getDb(req).query('DELETE FROM salidas_inv WHERE id=?', [id], (err2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                if (typeof logAudit === 'function' && (req.body && req.body.usuario)) { logAudit((req.body && req.body.usuario), req.baseUrl ? req.baseUrl.split('/').pop() : 'sistema', req.method === 'POST' ? 'CREÓ' : req.method === 'PUT' ? 'MODIFICÓ' : req.method === 'DELETE' ? 'ELIMINÓ' : 'ACCIÓN', req.path); } res.json({ ok: true });
            });
        });
    });

    // ============================================================
    // ALMACÉN — Kardex (movimientos por artículo)
    // ============================================================
    router.get('/kardex/:inventario_id', (req, res) => {
        const id = req.params.inventario_id;
        const targetDb = getDb(req);

        targetDb.query("SELECT stock_regularizado, costo_referencial, moneda, DATE_FORMAT(fecha_regularizacion, '%Y-%m-%d %H:%i:%s') AS fecha_regularizacion FROM inventario WHERE id=?", [id], (e2, inv) => {
            if (e2) return res.status(500).json({ error: e2.message });
            const base = parseFloat(inv[0]?.stock_regularizado || 0);
            const regDate = inv[0]?.fecha_regularizacion || null;

            targetDb.query(`
            SELECT 'Entrada' AS tipo, e.fecha, e.created_at, e.id AS doc_id, e.proveedor_nombre AS contraparte, d.cantidad, d.costo_unitario, d.moneda, d.importe, e.tipo_cambio, ((? IS NULL) OR COALESCE(e.created_at, e.fecha) > ?) AS posterior
            FROM detalle_entradas_inv d JOIN entradas_inv e ON e.id=d.entrada_id
            WHERE d.inventario_id=? AND (e.estado IS NULL OR e.estado != 'Anulado') AND (e.tipo_orden = 'Entrada directa' OR e.tipo_orden = 'Ajuste')
            UNION ALL
            SELECT 'Recepción OC' AS tipo, DATE(r.fecha_recepcion) AS fecha, r.fecha_recepcion AS created_at, r.oc_id AS doc_id, CONCAT('Recepción OC / ', COALESCE(r.almacen,'ALM CENTRAL'), ' - ', COALESCE(r.usuario,'')) AS contraparte, dr.cantidad_recibida AS cantidad, dr.costo_unitario, dr.moneda, (dr.cantidad_recibida * dr.costo_unitario) AS importe, e.tipo_cambio, ((? IS NULL) OR COALESCE(r.created_at, r.fecha_recepcion) > ?) AS posterior
            FROM detalle_recepciones_oc dr 
            JOIN recepciones_oc r ON r.id=dr.recepcion_id
            JOIN entradas_inv e ON e.id=r.oc_id
            WHERE dr.inventario_id=? AND (e.estado IS NULL OR (e.estado != 'Anulado' AND LOWER(e.estado) NOT LIKE '%anul%' AND LOWER(e.estado) NOT LIKE '%rechaz%'))
            UNION ALL
            SELECT 'Salida' AS tipo, s.fecha, s.created_at, s.id AS doc_id, CONCAT(s.tipo_destino,' / ',COALESCE(s.placa,s.responsable,'—')) AS contraparte, d.cantidad, d.costo_unitario, d.moneda, d.importe, s.tipo_cambio, ((? IS NULL) OR COALESCE(s.created_at, s.fecha) > ?) AS posterior
            FROM detalle_salidas_inv d JOIN salidas_inv s ON s.id=d.salida_id
            WHERE d.inventario_id=? AND (s.estado IS NULL OR s.estado = 'Despachado')
            ORDER BY fecha ASC, created_at ASC, doc_id ASC
        `, [regDate, regDate, id, regDate, regDate, id, regDate, regDate, id], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                // Igual que el stock actual: el saldo arranca en la última regularización (stock_regularizado)
                // y solo suma o resta los movimientos posteriores a ella. Lo anterior ya está dentro de esa base.
                let saldo = base;
                let promedio = inv[0] && inv[0].moneda !== 'USD' ? (parseFloat(inv[0].costo_referencial) || 0) : 0;
                const movimientos = [];
                if (regDate) {
                    movimientos.push({
                        tipo: 'Regularización', fecha: regDate, created_at: regDate, doc_id: null,
                        contraparte: 'Stock físico (regularización)', cantidad: 0,
                        costo_unitario: null, costo_unitario_soles: null,
                        costo_promedio: +promedio.toFixed(4), saldo: parseFloat(saldo.toFixed(4)),
                        valor_saldo: +(Math.max(saldo, 0) * promedio).toFixed(2),
                    });
                }
                rows.filter(r => Number(r.posterior) === 1).forEach(r => {
                    const cant = parseFloat(r.cantidad || 0);
                    const tc = String(r.moneda || '').toUpperCase() === 'USD' ? (parseFloat(r.tipo_cambio) || 1) : 1;
                    if (r.tipo === 'Entrada' || r.tipo === 'Recepción OC') {
                        const unitSoles = (parseFloat(r.costo_unitario) || 0) * tc;
                        const nuevoSaldo = saldo + cant;
                        promedio = saldo > 0 ? (saldo * promedio + cant * unitSoles) / nuevoSaldo : unitSoles;
                        saldo = nuevoSaldo;
                        r.costo_unitario_soles = +unitSoles.toFixed(4);
                    } else {
                        saldo -= cant;
                        r.costo_unitario_soles = +promedio.toFixed(4);
                    }
                    r.costo_promedio = +promedio.toFixed(4);
                    r.valor_saldo = +(Math.max(saldo, 0) * promedio).toFixed(2);
                    r.saldo = parseFloat(saldo.toFixed(4));
                    movimientos.push(r);
                });
                res.json({ stock_base: base, fecha_regularizacion: regDate, movimientos });
            });
        });
    });

    // ============================================================
    // ALMACÉN — RECEPCIÓN DE ÓRDENES DE COMPRA
    // ============================================================
    router.get('/recepciones-oc', async (req, res) => {
        try {
            const targetDb = req.db || db;
            // 1. Órdenes que llegan a recepción:
            //    - Al contado: solo cuando ya están pagadas / procesadas (flujo de siempre).
            //    - A crédito: desde que Gerencia las aprueba (V°B), sin esperar el pago. Si se anulan o rechazan, no salen.
            const sqlOCs = `
            SELECT e.*, 
                   COALESCE(SUM(de.cantidad), 0) AS total_items_oc,
                   COUNT(DISTINCT de.id) AS total_renglones
            FROM entradas_inv e
            LEFT JOIN detalle_entradas_inv de ON de.entrada_id = e.id
            WHERE (
                LOWER(COALESCE(e.estado, '')) IN ('procesado', 'procesada', 'pagado', 'pagada')
                OR (
                    LOWER(COALESCE(e.condicion_pago, '')) LIKE 'a cr%'
                    AND (LOWER(COALESCE(e.estado, '')) LIKE 'aprob%' OR LOWER(COALESCE(e.estado, '')) LIKE 'autoriz%')
                )
            )
            GROUP BY e.id
            ORDER BY e.fecha DESC, e.id DESC
        `;

            targetDb.query(sqlOCs, async (errOC, ocs) => {
                if (errOC) return res.status(500).json({ error: errOC.message });
                const idsOC = (ocs || []).map(o => o.id);
                if (!idsOC.length) return res.json([]);

                // 2. Obtener todas las recepciones registradas agrupadas por OC
                const sqlRecs = `
                SELECT r.id AS recepcion_id, dr.id AS detalle_id, r.oc_id, r.fecha_recepcion, r.usuario, r.almacen, r.sustento_url, r.observacion, r.tipo_recepcion,
                       dr.inventario_id, dr.descripcion, dr.cantidad_recibida, dr.costo_unitario, dr.moneda
                FROM recepciones_oc r
                JOIN detalle_recepciones_oc dr ON dr.recepcion_id = r.id
                WHERE r.oc_id IN (?)
                ORDER BY r.fecha_recepcion ASC
            `;

                targetDb.query(sqlRecs, [idsOC], async (errRec, recRows) => {
                    if (errRec) return res.status(500).json({ error: errRec.message });

                    // Mapear recepciones por oc_id
                    const recMap = {};
                    (recRows || []).forEach(row => {
                        if (!recMap[row.oc_id]) recMap[row.oc_id] = { items_recibidos: 0, historial: [] };
                        recMap[row.oc_id].items_recibidos += parseFloat(row.cantidad_recibida || 0);
                        recMap[row.oc_id].historial.push(row);
                    });

                    // Traer detalle completo de ítems por cada OC
                    const sqlDetalle = `
                    SELECT de.entrada_id AS oc_id, de.inventario_id, de.descripcion, de.cantidad, de.costo_unitario, de.moneda, de.importe,
                           i.descripcion AS inv_nombre, i.unidad
                    FROM detalle_entradas_inv de
                    LEFT JOIN inventario i ON i.id = de.inventario_id
                    WHERE de.entrada_id IN (?)
                `;

                    targetDb.query(sqlDetalle, [idsOC], async (errDet, detRows) => {
                        if (errDet) return res.status(500).json({ error: errDet.message });

                        const itemsPorOC = {};
                        (detRows || []).forEach(d => {
                            if (!itemsPorOC[d.oc_id]) itemsPorOC[d.oc_id] = [];
                            itemsPorOC[d.oc_id].push(d);
                        });

                        const { getPresignedUrl, s3KeyFromUrl } = require('../utils/s3');

                        // Armar lista enriquecida con estado de progreso de recepción
                        const resultado = await Promise.all((ocs || []).map(async oc => {
                            const recInfo = recMap[oc.id] || { items_recibidos: 0, historial: [] };
                            const itemsOC = itemsPorOC[oc.id] || [];

                            let totalPedido = 0;
                            let totalRecibido = recInfo.items_recibidos;

                            // Detalle de ítems con sus saldos de recepción
                            const itemsCalculados = itemsOC.map(it => {
                                const cantPedida = parseFloat(it.cantidad || 0);
                                totalPedido += cantPedida;

                                // Cuánto se ha recibido de este ítem
                                const recibidosItem = recInfo.historial
                                    .filter(h => (h.inventario_id && h.inventario_id === it.inventario_id) || (h.descripcion === it.descripcion))
                                    .reduce((acc, h) => acc + parseFloat(h.cantidad_recibida || 0), 0);

                                const pendiente = Math.max(0, cantPedida - recibidosItem);
                                return {
                                    inventario_id: it.inventario_id || '',
                                    descripcion: it.descripcion || it.inv_nombre || 'Ítem sin descripción',
                                    unidad: it.unidad || 'UND',
                                    pedido: cantPedida,
                                    recepcionado: recibidosItem,
                                    pendiente: pendiente,
                                    costo_unitario: parseFloat(it.costo_unitario || 0),
                                    moneda: it.moneda || oc.moneda || 'PEN'
                                };
                            });

                            // Firmar URLs de fotos de sustento en S3 para el historial
                            const historialFirmado = await Promise.all((recInfo.historial || []).map(async h => {
                                let urlFirmada = h.sustento_url;
                                if (h.sustento_url) {
                                    const k = s3KeyFromUrl(h.sustento_url);
                                    if (k) {
                                        urlFirmada = await getPresignedUrl(k, 3600).catch(() => h.sustento_url);
                                    }
                                }
                                return {
                                    ...h,
                                    sustento_url_presigned: urlFirmada
                                };
                            }));

                            // Determinar estado de recepción
                            let estadoRecepcion = 'PENDIENTE';
                            if (totalRecibido > 0 && totalRecibido < totalPedido) {
                                estadoRecepcion = 'PARCIAL';
                            } else if (totalPedido > 0 && totalRecibido >= totalPedido) {
                                estadoRecepcion = 'COMPLETO';
                            }

                            let fechaOCFinal = oc.fecha;
                            const raw = oc.created_at || oc.fecha;
                            if (raw) {
                                try {
                                    const d = new Date(String(raw).includes('T') ? raw : String(raw).replace(' ', 'T'));
                                    if (!isNaN(d.getTime())) {
                                        const dateStr = d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
                                        const timeStr = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
                                        fechaOCFinal = (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) ? dateStr : `${dateStr} ${timeStr}`;
                                    }
                                } catch (e) {
                                    fechaOCFinal = String(raw);
                                }
                            }

                            return {
                                id: oc.id,
                                fecha: fechaOCFinal,
                                proveedor: oc.proveedor_nombre || 'PROVEEDOR GENERAL',
                                solicitante: oc.solicitante || oc.autoriza || 'ALMACÉN / MANTENIMIENTO',
                                usuario_creacion: oc.creado_por || 'SISTEMA',
                                autoriza: oc.autoriza || oc.solicitante || '-',
                                almacen: oc.almacen || 'ALM CENTRAL',
                                moneda: oc.moneda || 'PEN',
                                // TC de la compra (si es en dólares): la recepción valoriza con este mismo TC
                                tipo_cambio: parseFloat(oc.tipo_cambio) || null,
                                importe: parseFloat(oc.total_pen || 0),
                                condicion_pago: oc.condicion_pago || 'Al contado',
                                dias_credito: oc.dias_credito || null,
                                estado_oc: (oc.estado || 'PAGADA').toUpperCase(),
                                total_pedido: totalPedido,
                                total_recibido: totalRecibido,
                                estado_recepcion: estadoRecepcion,
                                progreso_label: `${estadoRecepcion} (${totalRecibido}/${totalPedido})`,
                                items: itemsCalculados,
                                historial_recepciones: historialFirmado
                            };
                        }));

                        res.json(resultado);
                    });
                });
            });
        } catch (e) {
            console.error('Error en GET /api/almacen/recepciones-oc:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // Registrar entrega / recepción (parcial o completa) de una OC
    router.post('/recepciones-oc/registrar', _multerInv.single('sustento'), async (req, res) => {
        try {
            const { oc_id, fecha_recepcion, usuario, almacen, observacion, items_json } = req.body;
            if (!oc_id) return res.status(400).json({ error: 'N° de Orden de Compra requerido' });

            let items = [];
            try { items = JSON.parse(items_json || '[]'); } catch (e) { items = []; }
            if (!items.length) return res.status(400).json({ error: 'No se recibieron productos a recepcionar' });

            const targetDb = req.db || db;
            let sustentoUrl = null;

            // Subir sustento / foto a AWS S3 si fue adjuntado
            if (req.file) {
                const { uploadToS3 } = require('../utils/s3');
                const ext = req.file.originalname.split('.').pop() || 'jpg';
                const s3Key = `almacen/recepciones_oc/${oc_id}/${Date.now()}.${ext}`;
                sustentoUrl = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
            }

            let fechaHoraSQL;
            if (fecha_recepcion) {
                // Reemplazar 'T' por espacio y asegurar formato YYYY-MM-DD HH:mm:ss
                fechaHoraSQL = fecha_recepcion.replace('T', ' ');
                if (fechaHoraSQL.length === 16) fechaHoraSQL += ':00';
            } else {
                const ahora = new Date();
                const yyyy = ahora.getFullYear();
                const mm = String(ahora.getMonth() + 1).padStart(2, '0');
                const dd = String(ahora.getDate()).padStart(2, '0');
                const hh = String(ahora.getHours()).padStart(2, '0');
                const min = String(ahora.getMinutes()).padStart(2, '0');
                const ss = String(ahora.getSeconds()).padStart(2, '0');
                fechaHoraSQL = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
            }

            // Determinar si esta entrega completa la orden o es parcial
            const totalRecepcionadoAhora = items.reduce((sum, it) => sum + (parseFloat(it.cantidad_recibida) || 0), 0);
            const tipoRecepcion = req.body.tipo_recepcion || 'TOTAL';

            // Triple afectación en UNA transacción: costo promedio del inventario, O/C (vencimiento y estado) y
            // cabecera + detalle de la recepción (de ahí salen el stock y el kardex). Si algo falla, no queda nada a medias.
            const conn = await targetDb.promise().getConnection();
            let recepcionId = null;
            try {
                await conn.beginTransaction();

                // Valorización: costo promedio ponderado en soles, tipo de cambio del día y vencimiento de la cuenta por pagar
                const [ocRows] = await conn.query('SELECT id, codigo, moneda, condicion_pago, dias_credito, estado FROM ordenes_compra WHERE codigo = ? LIMIT 1 FOR UPDATE', [oc_id]);
                const oc = ocRows[0] || null;
                const esUSD = oc ? oc.moneda === 'USD' : items.some(it => String(it.moneda || '').toUpperCase() === 'USD');
                let tipoCambio = parseFloat(req.body.tipo_cambio) || 0;
                // Si la compra en dólares tiene su propio TC (el de la entrada que generó la OC), la recepción usa ese:
                // así el costo del inventario y el total de la OC salen con el mismo tipo de cambio
                if (esUSD && oc) {
                    const [entOC] = await conn.query('SELECT tipo_cambio FROM entradas_inv WHERE id = ? LIMIT 1', [oc.codigo]);
                    const tcOC = parseFloat(entOC && entOC[0] && entOC[0].tipo_cambio) || 0;
                    if (tcOC > 0) tipoCambio = tcOC;
                }
                if (esUSD && !(tipoCambio > 0)) {
                    // Sin tipo de cambio: el de la SUNAT del día
                    tipoCambio = (await tipoCambioSunat()).venta;
                }
                const fechaDia = fechaHoraSQL.slice(0, 10);
                const idsInv = [...new Set(items.map(it => it.inventario_id).filter(Boolean))];
                const stockPrevio = new Map();
                if (idsInv.length) {
                    // Stock antes de esta recepción (mismo cálculo del inventario; se filtra por id dentro de la consulta)
                    const sqlIds = _stockSQL.replace(/WHERE i\.activo=1\s*ORDER BY i\.id\s*$/, 'WHERE i.activo=1 AND i.id IN (?) ORDER BY i.id');
                    const [filas] = await conn.query(sqlIds, [idsInv]);
                    (filas || []).forEach(fr => stockPrevio.set(String(fr.id), {
                        stock: Math.max(0, Number(fr.stock_actual) || 0),
                        costo: Number(fr.costo_soles) || Number(fr.costo_referencial) || 0,
                    }));
                }
                for (const it of items) {
                    const cant = parseFloat(it.cantidad_recibida) || 0;
                    if (!it.inventario_id || !(cant > 0)) continue;
                    const moneda = String(it.moneda || (oc && oc.moneda) || 'PEN').toUpperCase();
                    const unitarioSoles = (parseFloat(it.costo_unitario) || 0) * (moneda === 'USD' ? tipoCambio : 1);
                    const prev = stockPrevio.get(String(it.inventario_id)) || { stock: 0, costo: 0 };
                    const total = prev.stock + cant;
                    const promedio = total > 0 ? (prev.stock * prev.costo + cant * unitarioSoles) / total : unitarioSoles;
                    await conn.query(
                        'UPDATE inventario SET costo_soles = ?, tipo_cambio = COALESCE(?, tipo_cambio) WHERE id = ?',
                        [Math.round(promedio * 10000) / 10000, moneda === 'USD' ? tipoCambio : null, it.inventario_id]
                    );
                }
                if (oc) {
                    const vence = fechaVencimiento(fechaDia, oc.condicion_pago, oc.dias_credito);
                    const nuevoEstado = tipoRecepcion === 'TOTAL' ? 'RECIBIDA' : oc.estado;
                    await conn.query(
                        'UPDATE ordenes_compra SET fecha_vencimiento = COALESCE(fecha_vencimiento, ?), estado = ? WHERE id = ?',
                        [vence, nuevoEstado, oc.id]
                    );
                }

                // 1. Cabecera de la recepción
                const [cab] = await conn.query(
                    `INSERT INTO recepciones_oc (oc_id, fecha_recepcion, usuario, almacen, sustento_url, observacion, tipo_recepcion)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [oc_id, fechaHoraSQL, usuario || 'Almacén Central', almacen || 'ALM CENTRAL', sustentoUrl, observacion || null, tipoRecepcion]
                );
                recepcionId = cab.insertId;

                // 2. Detalle de la recepción
                const detalleVals = items.map(it => [
                    recepcionId,
                    oc_id,
                    it.inventario_id || null,
                    it.descripcion || 'Ítem recepcionado',
                    parseFloat(it.cantidad_recibida) || 0,
                    parseFloat(it.costo_unitario) || 0,
                    it.moneda || 'PEN',
                    it.almacen || almacen || 'ALM CENTRAL'
                ]);
                await conn.query(
                    `INSERT INTO detalle_recepciones_oc (recepcion_id, oc_id, inventario_id, descripcion, cantidad_recibida, costo_unitario, moneda, almacen)
                     VALUES ?`,
                    [detalleVals]
                );

                // 3. Llantas que llegan: cada unidad entra a Neumáticos como "Sin código de fuego" (flujo aprobado)
                const lineasLlanta = items.map((it, i) => ({ it, linea: i + 1 })).filter(x => x.it.inventario_id);
                if (lineasLlanta.length) {
                    const [arts] = await conn.query('SELECT id, familia, marca FROM inventario WHERE id IN (?)', [lineasLlanta.map(x => x.it.inventario_id)]);
                    const porId = new Map(arts.map(a => [a.id, a]));
                    for (const { it, linea } of lineasLlanta) {
                        const art = porId.get(it.inventario_id);
                        if (!art || String(art.familia || '').trim().toUpperCase() !== 'NEUMATICOS') continue;
                        await crearLlantasDeRecepcion(conn, {
                            recepcionId, linea, inventarioId: art.id, marca: art.marca,
                            cantidad: it.cantidad_recibida, costoUnitario: it.costo_unitario,
                            usuario: usuario || 'Almacén Central', fecha: fechaHoraSQL,
                        });
                    }
                }

                await conn.commit();
            } catch (errTx) {
                await conn.rollback().catch(() => {});
                throw errTx;
            } finally {
                conn.release();
            }

            // 3. Auditoría del sistema ERP
            if (typeof logAudit === 'function' && usuario) {
                logAudit(usuario, 'almacen/recepcion-compras', 'CREÓ', `/api/almacen/recepciones-oc/registrar (${oc_id})`);
            }

            res.json({
                ok: true,
                mensaje: 'Recepción registrada y stock actualizado con éxito',
                recepcion_id: recepcionId,
                sustento_url: sustentoUrl
            });
        } catch (err) {
            console.error('Error al registrar recepción de OC:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ── Eliminar una entrega / recepción de OC ──────────────────────
    router.delete('/recepciones-oc/:id', async (req, res) => {
        const { id } = req.params;
        const { usuario } = req.body || {};
        const targetDb = req.db || db;

        try {
            targetDb.query('SELECT * FROM recepciones_oc WHERE id = ?', [id], async (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!rows || rows.length === 0) return res.status(404).json({ error: 'Registro de recepción no encontrado' });

                const rec = rows[0];
                const oc_id = rec.oc_id;

                // Borrar foto de S3 si existe
                if (rec.sustento_url) {
                    try {
                        const { deleteFromS3, s3KeyFromUrl } = require('../utils/s3');
                        const key = s3KeyFromUrl(rec.sustento_url);
                        if (key) await deleteFromS3(key);
                    } catch (eS3) {
                        console.warn('Error al borrar sustento de S3:', eS3.message);
                    }
                }

                // Borrar detalle y cabecera
                targetDb.query('DELETE FROM detalle_recepciones_oc WHERE recepcion_id = ?', [id], (errDet) => {
                    if (errDet) return res.status(500).json({ error: errDet.message });

                    targetDb.query('DELETE FROM recepciones_oc WHERE id = ?', [id], (errCab) => {
                        if (errCab) return res.status(500).json({ error: errCab.message });

                        if (typeof logAudit === 'function' && usuario) {
                            logAudit(usuario, 'almacen/recepcion-compras', 'ELIMINÓ', `/api/almacen/recepciones-oc/${id} (OC: ${oc_id})`);
                        }

                        res.json({ ok: true, mensaje: 'Entrega eliminada y stock actualizado correctamente' });
                    });
                });
            });
        } catch (err) {
            console.error('Error al eliminar recepción de OC:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================================
    // ALMACÉN DE FLOTA — almacén virtual por unidad (asignar / devolver)
    // ============================================================
    require('./almacen-flota')(router, { getDb, logAudit, generarCodigo: _generarCodigoAlmacen, stockSQL: _stockSQL });

    router.use((err, req, res, next) => {
        console.error('Almacen Router Error:', err);
        res.status(500).json({ error: 'Router Error: ' + err.message, stack: err.stack });
    });

    return router;
};
