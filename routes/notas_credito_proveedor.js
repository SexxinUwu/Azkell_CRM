// Notas de crédito de proveedores (Tesorería): registrar la nota que emite el proveedor, aprobarla, aplicar su saldo al pago de otra orden
// de compra o cobrar el reembolso, y llevar el estado de cuenta por proveedor. Reglas contables en services/notas_credito_proveedor.js.
// Tablas: compras_notas_credito, compras_nc_aplicaciones, compras_nc_historial (migración 21).
const express = require('express');
const multer = require('multer');
const { uploadToS3, s3KeyFromUrl, getPresignedUrlEstable } = require('../utils/s3');
const nc = require('../services/notas_credito_proveedor');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const { num, redondear, norm, aviso, aMoneda } = nc;

const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const hoyLima = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());
const esFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
const ARCHIVO_OK = /^(image\/|application\/pdf|text\/xml|application\/xml)/;

const COLS = `n.id, n.codigo, n.proveedor_id, n.proveedor_nombre, n.proveedor_ruc, n.serie, n.numero,
    DATE_FORMAT(n.fecha_emision, '%Y-%m-%d') AS fecha_emision, n.moneda, n.base, n.igv, n.total, n.saldo,
    n.motivo_sunat, n.motivo_texto, n.oc_origen, n.referencia_devolucion, n.forma, n.estado, n.archivo_url, n.observaciones,
    n.registrado_por, n.aprobado_por, DATE_FORMAT(n.fecha_aprobacion, '%Y-%m-%d %H:%i') AS fecha_aprobacion,
    n.anulado_por, n.motivo_anulacion, DATE_FORMAT(n.reembolso_fecha, '%Y-%m-%d') AS reembolso_fecha, n.reembolso_constancia, n.reembolso_url,
    DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i') AS creada_en`;

const enriquecer = r => {
    const total = num(r.total), saldo = num(r.saldo);
    const anulada = r.estado === 'ANULADA';
    return { ...r, base: num(r.base), igv: num(r.igv), total, saldo, aplicado: anulada ? 0 : redondear(total - saldo), tiene_archivo: !!r.archivo_url };
};

module.exports = (db, logAudit) => {
    const router = express.Router();
    const getDb = req => ((req && req.db) ? req.db : db);
    const P = req => getDb(req).promise();
    const usuarioDe = req => String((req.user && (req.user.nombre || req.user.correo)) || (req.body && req.body.usuario) || 'sistema').slice(0, 150);
    const esAdmin = req => {
        const u = req.user || {};
        if (String(u.rol || '') === 'Fundador') return true;
        try { const p = typeof u.permisos === 'string' ? JSON.parse(u.permisos || '{}') : (u.permisos || {}); return p.admin === true; } catch (e) { return false; }
    };
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[notas-credito] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: err && err.message ? err.message : 'Error del servidor' });
    };
    const auditar = (req, accion, detalle) => { try { if (typeof logAudit === 'function') logAudit(req, 'tesoreria/notas-credito', accion, detalle); } catch (e) { /* sin auditoría */ } };

    const firmar = async url => {
        if (!url) return null;
        const key = s3KeyFromUrl(url);
        if (!key) return url;
        try { return await getPresignedUrlEstable(key); } catch (e) { return url; }
    };

    async function siguienteCodigo(p) {
        const anio = hoyLima().slice(0, 4);
        const [r] = await p.query('SELECT codigo FROM compras_notas_credito WHERE codigo LIKE ? ORDER BY id DESC LIMIT 1', [`NCP-${anio}-%`]);
        let n = 1;
        if (r.length) { const m = /(\d+)$/.exec(r[0].codigo); if (m) n = parseInt(m[1], 10) + 1; }
        return `NCP-${anio}-${String(n).padStart(4, '0')}`;
    }

    /** Importe de una orden de compra en la moneda de la nota (en dólares: total en soles ÷ tipo de cambio) */
    const importeOrden = (oc, moneda) => {
        const totalPen = num(oc.total_pen), tc = num(oc.tipo_cambio);
        return aMoneda(moneda) === 'USD' ? (tc > 0 ? redondear(totalPen / tc) : null) : totalPen;
    };

    // ── Listado y resúmenes ───────────────────────────────────────────────────────────────────────
    router.get('/compras/notas-credito', async (req, res) => {
        try {
            const [rows] = await P(req).query(`SELECT ${COLS} FROM compras_notas_credito n ORDER BY n.id DESC LIMIT 3000`);
            res.json({ ok: true, hoy: hoyLima(), data: rows.map(enriquecer) });
        } catch (err) { responder(res, err, 'lista'); }
    });

    // Saldo a favor por proveedor (solo notas aprobadas que todavía se pueden aplicar) y notas por aprobar
    router.get('/compras/notas-credito/proveedores', async (req, res) => {
        try {
            const [rows] = await P(req).query(
                `SELECT COALESCE(NULLIF(proveedor_id, ''), proveedor_nombre) AS clave, MAX(proveedor_id) AS proveedor_id, MAX(proveedor_nombre) AS proveedor_nombre, moneda,
                        COUNT(*) AS notas, SUM(estado = 'REGISTRADA') AS por_aprobar,
                        SUM(CASE WHEN estado IN ('APROBADA', 'APLICADA_PARCIAL') AND forma = 'APLICAR' THEN saldo ELSE 0 END) AS saldo_a_favor,
                        SUM(CASE WHEN estado <> 'ANULADA' THEN total - saldo ELSE 0 END) AS aplicado,
                        SUM(CASE WHEN estado <> 'ANULADA' THEN total ELSE 0 END) AS total
                 FROM compras_notas_credito GROUP BY clave, moneda ORDER BY saldo_a_favor DESC, proveedor_nombre`);
            res.json({ ok: true, data: rows.map(r => ({ ...r, notas: Number(r.notas), por_aprobar: Number(r.por_aprobar) || 0, saldo_a_favor: num(r.saldo_a_favor), aplicado: num(r.aplicado), total: num(r.total) })) });
        } catch (err) { responder(res, err, 'proveedores'); }
    });

    // Notas que se pueden aplicar al pago de una orden (mismo proveedor y moneda)
    router.get('/compras/notas-credito/disponibles', async (req, res) => {
        try {
            let proveedorId = req.query.proveedor_id, proveedorNombre = req.query.proveedor_nombre;
            // Con la orden de la que se trata, el proveedor sale de la propia orden (no de lo que mande la pantalla)
            if (req.query.entrada_id) {
                const [oc] = await P(req).query('SELECT proveedor_id, proveedor_nombre FROM entradas_inv WHERE id = ?', [String(req.query.entrada_id)]);
                if (oc.length) { proveedorId = oc[0].proveedor_id; proveedorNombre = oc[0].proveedor_nombre; }
            }
            const data = await nc.disponibles(P(req), { proveedorId, proveedorNombre, moneda: req.query.moneda });
            res.json({ ok: true, data });
        } catch (err) { responder(res, err, 'disponibles'); }
    });

    // Notas aplicadas al pago de una orden
    router.get('/compras/notas-credito/por-oc/:id', async (req, res) => {
        try { res.json({ ok: true, data: await nc.porOrden(P(req), req.params.id) }); }
        catch (err) { responder(res, err, 'por-oc'); }
    });

    // Estado de cuenta de un proveedor: notas, aplicaciones y reembolsos en orden cronológico
    router.get('/compras/notas-credito/estado-cuenta', async (req, res) => {
        try {
            const p = P(req);
            const prov = String(req.query.proveedor || '').trim();
            if (!prov) throw aviso('Elige el proveedor.');
            const [notas] = await p.query(`SELECT ${COLS} FROM compras_notas_credito n WHERE COALESCE(NULLIF(n.proveedor_id, ''), n.proveedor_nombre) = ? ORDER BY n.fecha_emision, n.id`, [prov]);
            const ids = notas.map(n => n.id);
            const [apps] = ids.length ? await p.query(
                `SELECT a.id, a.nc_id, a.entrada_id, a.monto, a.moneda, a.estado, a.usuario, DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS fecha FROM compras_nc_aplicaciones a WHERE a.nc_id IN (?) ORDER BY a.id`, [ids]) : [[]];
            res.json({ ok: true, notas: notas.map(enriquecer), aplicaciones: apps.map(a => ({ ...a, monto: num(a.monto) })) });
        } catch (err) { responder(res, err, 'estado-cuenta'); }
    });

    // ── Detalle ───────────────────────────────────────────────────────────────────────────────────
    router.get('/compras/notas-credito/:id', async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const [f] = await p.query(`SELECT ${COLS} FROM compras_notas_credito n WHERE n.id = ?`, [id]);
            if (!f.length) throw aviso('Nota de crédito no encontrada.', 404);
            const [apps] = await p.query(
                `SELECT a.id, a.entrada_id, a.monto, a.moneda, a.estado, a.usuario, a.observacion, DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS fecha,
                        e.proveedor_nombre AS orden_proveedor, e.motivo_entrada AS orden_motivo
                 FROM compras_nc_aplicaciones a LEFT JOIN entradas_inv e ON e.id COLLATE utf8mb4_unicode_ci = a.entrada_id COLLATE utf8mb4_unicode_ci
                 WHERE a.nc_id = ? ORDER BY a.id`, [id]);
            const [hist] = await p.query("SELECT id, accion, detalle, usuario, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS fecha FROM compras_nc_historial WHERE nc_id = ? ORDER BY id DESC", [id]);
            const fila = enriquecer(f[0]);
            res.json({ ok: true, data: { ...fila, archivo_url: await firmar(fila.archivo_url), reembolso_url: await firmar(fila.reembolso_url) }, aplicaciones: apps.map(a => ({ ...a, monto: num(a.monto) })), historial: hist });
        } catch (err) { responder(res, err, 'detalle'); }
    });

    // ── Registrar ─────────────────────────────────────────────────────────────────────────────────
    router.post('/compras/notas-credito', upload.single('archivo'), async (req, res) => {
        try {
            const p = P(req);
            const b = req.body || {};
            const proveedorNombre = texto(b.proveedor_nombre, 200);
            if (!proveedorNombre) throw aviso('Elige el proveedor.');
            const serie = String(b.serie || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
            const numero = String(b.numero || '').trim().replace(/\D/g, '').slice(0, 20);
            if (!serie || !numero) throw aviso('Escribe la serie y el número de la nota de crédito (ej. FC01 y 123).');
            const fecha = String(b.fecha_emision || '').slice(0, 10);
            if (!esFecha(fecha)) throw aviso('Indica la fecha de emisión de la nota.');
            if (fecha > hoyLima()) throw aviso('La fecha de emisión no puede ser futura.');
            const moneda = aMoneda(b.moneda);
            const base = redondear(num(b.base)), igv = redondear(num(b.igv));
            const total = redondear(num(b.total) > 0 ? num(b.total) : base + igv);
            if (!(total > 0)) throw aviso('El total de la nota debe ser mayor a 0.');
            if (num(b.total) > 0 && base + igv > 0 && Math.abs(base + igv - total) > 0.02) throw aviso('La base más el IGV no coinciden con el total.');
            const forma = String(b.forma || 'APLICAR').toUpperCase() === 'REEMBOLSO' ? 'REEMBOLSO' : 'APLICAR';
            if (!req.file) throw aviso('Adjunta el archivo de la nota de crédito (PDF, XML o foto): sin él no se puede registrar.');
            if (!ARCHIVO_OK.test(req.file.mimetype)) throw aviso('El archivo debe ser PDF, XML o imagen.');

            // La misma nota (proveedor + serie + número) no se registra dos veces
            const proveedorId = texto(b.proveedor_id, 20);
            const [dup] = await p.query('SELECT codigo, proveedor_id, proveedor_nombre FROM compras_notas_credito WHERE serie = ? AND numero = ? AND estado <> \'ANULADA\'', [serie, numero]);
            const igual = dup.find(d => nc.mismoProveedor(d, proveedorId, proveedorNombre));
            if (igual) throw aviso(`Esa nota ya está registrada: ${igual.codigo}.`, 409);

            // Una salida de devolución respalda una sola nota: así no se descuenta dos veces
            const referencia = texto(b.referencia_devolucion, 150);
            if (referencia) {
                const [usada] = await p.query("SELECT codigo FROM compras_notas_credito WHERE referencia_devolucion = ? AND estado <> 'ANULADA' LIMIT 1", [referencia]);
                if (usada.length) throw aviso(`La devolución ${referencia} ya respalda la nota ${usada[0].codigo}.`, 409);
            }

            // Si se indica la orden de origen, la nota no puede superar su importe
            const ocOrigen = texto(b.oc_origen, 20);
            if (ocOrigen) {
                const [oc] = await p.query('SELECT id, proveedor_id, proveedor_nombre, total_pen, tipo_cambio FROM entradas_inv WHERE id = ?', [ocOrigen]);
                if (!oc.length) throw aviso(`La orden de origen ${ocOrigen} no existe.`, 404);
                if (!nc.mismoProveedor({ proveedor_id: oc[0].proveedor_id, proveedor_nombre: oc[0].proveedor_nombre }, proveedorId, proveedorNombre)) throw aviso('La orden de origen es de otro proveedor.', 409);
                const tope = importeOrden(oc[0], moneda);
                if (tope != null && total > tope + 0.02) throw aviso(`La nota (${moneda} ${total.toFixed(2)}) supera el importe de la orden ${ocOrigen} (${moneda} ${tope.toFixed(2)}).`, 409);
            }

            const usuario = usuarioDe(req);
            const codigo = await siguienteCodigo(p);
            const ext = (String(req.file.originalname || '').split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
            const url = await uploadToS3(req.file.buffer, `tesoreria/notas-credito/${codigo}_${Date.now()}.${ext}`, req.file.mimetype);
            const [r] = await p.query('INSERT INTO compras_notas_credito SET ?', [{
                codigo, proveedor_id: proveedorId, proveedor_nombre: proveedorNombre, proveedor_ruc: texto(b.proveedor_ruc, 20), serie, numero, fecha_emision: fecha,
                moneda, base, igv, total, saldo: total, motivo_sunat: texto(b.motivo_sunat, 2), motivo_texto: texto(b.motivo_texto, 255), oc_origen: ocOrigen,
                referencia_devolucion: referencia, forma, estado: 'REGISTRADA', archivo_url: url, observaciones: texto(b.observaciones, 2000), registrado_por: usuario,
            }]);
            await nc.historial(p, r.insertId, 'REGISTRADA', `${serie}-${numero} · ${moneda} ${total.toFixed(2)} · ${proveedorNombre}${ocOrigen ? ` · orden ${ocOrigen}` : ''}`, usuario);
            auditar(req, 'REGISTRÓ NC PROVEEDOR', `${codigo} ${serie}-${numero} ${moneda} ${total} (${proveedorNombre})`);
            res.json({ ok: true, id: r.insertId, codigo });
        } catch (err) { responder(res, err, 'crear'); }
    });

    // ── Enlazar la salida de almacén de la devolución a una nota que se registró sin ella ───────────────────
    router.post('/compras/notas-credito/:id/enlazar-salida', async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const referencia = texto(req.body && req.body.referencia, 150);
            if (!referencia) throw aviso('Indica la salida de la devolución.');
            const [f] = await p.query('SELECT codigo, estado, referencia_devolucion FROM compras_notas_credito WHERE id = ?', [id]);
            if (!f.length) throw aviso('La nota no existe.', 404);
            if (f[0].estado === 'ANULADA') throw aviso('La nota está anulada.', 409);
            if (f[0].referencia_devolucion) throw aviso(`La nota ya tiene su devolución: ${f[0].referencia_devolucion}.`, 409);
            const [usada] = await p.query("SELECT codigo FROM compras_notas_credito WHERE referencia_devolucion = ? AND estado <> 'ANULADA' AND id <> ? LIMIT 1", [referencia, id]);
            if (usada.length) throw aviso(`La devolución ${referencia} ya respalda la nota ${usada[0].codigo}.`, 409);
            const [r] = await p.query('UPDATE compras_notas_credito SET referencia_devolucion = ? WHERE id = ? AND referencia_devolucion IS NULL', [referencia, id]);
            if (r.affectedRows !== 1) throw aviso('No se pudo enlazar: la nota cambió, vuelve a abrirla.', 409);
            const usuario = usuarioDe(req);
            await nc.historial(p, id, 'SALIDA ENLAZADA', referencia, usuario);
            auditar(req, 'ENLAZÓ SALIDA A NC PROVEEDOR', `${f[0].codigo} ← ${referencia}`);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'enlazar la salida'); }
    });

    // ── Aprobar (quien la registra no la aprueba; el administrador puede, y queda anotado) ──────────────────
    router.post('/compras/notas-credito/:id/aprobar', async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const [f] = await p.query('SELECT * FROM compras_notas_credito WHERE id = ?', [id]);
            if (!f.length) throw aviso('Nota de crédito no encontrada.', 404);
            const n = f[0];
            if (n.estado !== 'REGISTRADA') throw aviso(`La nota está ${n.estado}: solo se aprueba una nota registrada.`, 409);
            if (!n.archivo_url) throw aviso('La nota no tiene archivo adjunto: no se puede aprobar.', 409);
            const usuario = usuarioDe(req);
            const mismo = norm(n.registrado_por) === norm(usuario);
            if (mismo && !esAdmin(req)) throw aviso('La nota debe aprobarla otra persona (Tesorería o Contabilidad), no quien la registró.', 403);
            const [upd] = await p.query("UPDATE compras_notas_credito SET estado = 'APROBADA', aprobado_por = ?, fecha_aprobacion = NOW() WHERE id = ? AND estado = 'REGISTRADA'", [usuario, id]);
            if (!upd || upd.affectedRows !== 1) throw aviso('La nota ya fue aprobada o cambió de estado.', 409);
            await nc.historial(p, id, 'APROBADA', mismo ? 'Aprobada por el mismo usuario que la registró (administrador)' : 'Aprobada', usuario);
            auditar(req, 'APROBÓ NC PROVEEDOR', `${n.codigo}${mismo ? ' (autoaprobación de administrador)' : ''}`);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'aprobar'); }
    });

    // ── Anular (con motivo; si ya se aplicó, primero se revierte la aplicación desde el pago) ───────────────
    router.post('/compras/notas-credito/:id/anular', async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const motivo = texto(req.body && req.body.motivo, 255);
            if (!motivo || motivo.length < 5) throw aviso('Escribe el motivo de la anulación.');
            const [f] = await p.query('SELECT * FROM compras_notas_credito WHERE id = ?', [id]);
            if (!f.length) throw aviso('Nota de crédito no encontrada.', 404);
            const n = f[0];
            if (!['REGISTRADA', 'APROBADA'].includes(n.estado)) throw aviso(`Una nota ${n.estado} no se puede anular: ya se usó o ya está cerrada.`, 409);
            const [uso] = await p.query("SELECT COUNT(*) AS c FROM compras_nc_aplicaciones WHERE nc_id = ? AND estado = 'VIGENTE'", [id]);
            if (uso[0].c > 0) throw aviso('La nota tiene aplicaciones vigentes: no se puede anular.', 409);
            const usuario = usuarioDe(req);
            await p.query("UPDATE compras_notas_credito SET estado = 'ANULADA', saldo = 0, anulado_por = ?, motivo_anulacion = ? WHERE id = ?", [usuario, motivo, id]);
            await nc.historial(p, id, 'ANULADA', motivo, usuario);
            auditar(req, 'ANULÓ NC PROVEEDOR', `${n.codigo}: ${motivo}`);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'anular'); }
    });

    // ── Reembolso: el proveedor devuelve el dinero en lugar de dejar saldo a favor (ingreso en Caja) ──────────
    router.post('/compras/notas-credito/:id/reembolso', upload.single('voucher'), async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const b = req.body || {};
            const [f] = await p.query('SELECT * FROM compras_notas_credito WHERE id = ?', [id]);
            if (!f.length) throw aviso('Nota de crédito no encontrada.', 404);
            const n = f[0];
            if (!nc.ESTADOS_APLICABLES.includes(n.estado) || num(n.saldo) <= 0) throw aviso('Solo se cobra el reembolso de una nota aprobada con saldo.', 409);
            const constancia = texto(b.numero_constancia, 100);
            if (!constancia) throw aviso('Escribe el número de la operación o depósito.');
            const cuenta = texto(b.cuenta_destino, 200);
            if (!cuenta) throw aviso('Elige la cuenta de la empresa donde ingresó el dinero.');
            const monto = redondear(num(n.saldo));
            const usuario = usuarioDe(req);

            let voucherUrl = null;
            if (req.file) {
                if (!ARCHIVO_OK.test(req.file.mimetype)) throw aviso('El voucher debe ser PDF o imagen.');
                const ext = (String(req.file.originalname || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
                voucherUrl = await uploadToS3(req.file.buffer, `tesoreria/notas-credito/reembolso_${n.codigo}_${Date.now()}.${ext}`, req.file.mimetype);
            }

            // Primero se cierra la nota con una actualización protegida; si otra persona la usó, no se registra el ingreso
            const [upd] = await p.query(
                "UPDATE compras_notas_credito SET estado = 'REEMBOLSADA', saldo = 0, reembolso_fecha = CURDATE(), reembolso_constancia = ?, reembolso_url = ? WHERE id = ? AND estado IN ('APROBADA', 'APLICADA_PARCIAL') AND saldo > 0",
                [constancia, voucherUrl, id]);
            if (!upd || upd.affectedRows !== 1) throw aviso('La nota ya no tiene saldo para reembolsar.', 409);

            const anio = String(new Date().getFullYear());
            const [mx] = await p.query('SELECT numero FROM tesoreria_caja WHERE serie = ? ORDER BY id DESC LIMIT 1', [anio]);
            let sig = 1;
            if (mx[0] && mx[0].numero) { const m = String(mx[0].numero).match(/\d+$/); if (m) sig = parseInt(m[0], 10) + 1; }
            const [caja] = await p.query(
                `INSERT INTO tesoreria_caja (fecha, hora, fecha_valuta, hora_valuta, numero_constancia_deposito, numero_factura, serie, numero, autoriza, motivo, centro_costo, sub_motivo,
                     modalidad_pago, moneda, tipo_persona, persona, tipo_movimiento, subtotal, retencion_detraccion, importe_total, tipo_cambio, descripcion, tipo_comprobante,
                     cuenta_bancaria_empresa, voucher_url, observacion, no_aplica_liquidacion, estado, usuario_creacion, usuario_aprobacion, fecha_aprobacion)
                 VALUES (CURDATE(), CURTIME(), CURDATE(), CURTIME(), ?, ?, ?, ?, ?, 'DEVOLUCIÓN PROVEEDOR', 'CC-100', 'REEMBOLSO NOTA DE CRÉDITO',
                     'TRANSFERENCIA', ?, 'PROVEEDOR', ?, 'INGRESO', ?, 0, ?, 1, ?, 'NOTA DE CRÉDITO',
                     ?, ?, ?, 0, 'PROCESADO', ?, ?, NOW())`,
                [constancia, `${n.serie}-${n.numero}`, anio, String(sig).padStart(8, '0'), usuario, n.moneda === 'USD' ? 'DOLARES' : 'SOLES', n.proveedor_nombre, monto, monto,
                    `REEMBOLSO NOTA DE CRÉDITO ${n.codigo} (${n.serie}-${n.numero})`, cuenta, voucherUrl, `Reembolso de la nota ${n.codigo} | Operación ${constancia}`, usuario, usuario]);
            await p.query('UPDATE compras_notas_credito SET reembolso_caja_id = ? WHERE id = ?', [caja.insertId, id]);
            await nc.historial(p, id, 'REEMBOLSADA', `Ingreso a Caja de ${n.moneda} ${monto.toFixed(2)} · operación ${constancia} · ${cuenta}`, usuario);
            auditar(req, 'REEMBOLSO NC PROVEEDOR', `${n.codigo}: ${n.moneda} ${monto} (operación ${constancia})`);
            res.json({ ok: true, caja_id: caja.insertId });
        } catch (err) { responder(res, err, 'reembolso'); }
    });

    return router;
};
