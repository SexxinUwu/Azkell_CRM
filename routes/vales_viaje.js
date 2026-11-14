// Vales de combustible ligados al viaje (Operaciones). Tabla: viaje_vales_combustible (migración 34).
// Registrar un vale crea su caja en tesoreria_caja (origen VALE_COMBUSTIBLE, estado PENDIENTE). Al aprobar la caja aparece en
// «Pago de requerimientos»; al pagarla queda PROCESADA. El estado del vale se deduce del estado de su caja (no se duplica).
// La foto del voucher se lee con IA (services/vale_lectura.js) y la persona solo confirma; nunca se guarda sin revisión.
const express = require('express');
const multer = require('multer');
const { uploadToS3, s3KeyFromUrl, getPresignedUrlEstable } = require('../utils/s3');
const { leerVoucher, combustibleDe } = require('../services/vale_lectura');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const redondear = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const fechaOpc = v => { const s = String(v ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const horaLima = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Lima' });

module.exports = (db, logAudit) => {
    const router = express.Router();
    const getDb = req => ((req && req.db) ? req.db : db);
    const P = req => getDb(req).promise();
    const usuarioDe = req => String((req.user && (req.user.nombre || req.user.correo)) || 'sistema').slice(0, 150);
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[vales] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: err && err.message ? err.message : 'Error del servidor' });
    };

    // Estado del vale según su caja: PENDIENTE → APROBADO → PAGADO (o ANULADO)
    const ESTADO_SQL = `CASE WHEN v.anulado = 1 OR UPPER(COALESCE(c.estado, '')) = 'ANULADO' THEN 'ANULADO'
        WHEN UPPER(COALESCE(c.estado, '')) IN ('PROCESADO', 'PAGADO') THEN 'PAGADO'
        WHEN UPPER(COALESCE(c.estado, '')) = 'APROBADO' THEN 'APROBADO' ELSE 'PENDIENTE' END`;
    const COLUMNAS = `v.id, v.codigo, v.viaje, v.placa, v.conductor, v.conductor_doc, DATE_FORMAT(v.fecha, '%Y-%m-%d') AS fecha, v.hora,
        v.estacion_nombre, v.estacion_ruc, v.combustible, v.galones, v.precio_galon, v.total, v.moneda, v.km_odometro, v.numero_voucher,
        v.voucher_url, v.pagar_a, v.beneficiario_nombre, v.beneficiario_doc, v.caja_id, v.alertas_json, v.observacion, v.usuario,
        DATE_FORMAT(v.creado_en, '%Y-%m-%d %H:%i') AS creado_en, ${ESTADO_SQL} AS estado,
        CONCAT(COALESCE(c.serie, ''), '-', COALESCE(c.numero, '')) AS caja_codigo`;
    const FROM = 'FROM viaje_vales_combustible v LEFT JOIN tesoreria_caja c ON c.id = v.caja_id';

    async function conUrl(fila) {
        let voucher_url_firmada = null;
        if (fila.voucher_url) { const k = s3KeyFromUrl(fila.voucher_url); try { voucher_url_firmada = k ? await getPresignedUrlEstable(k) : fila.voucher_url; } catch (e) { voucher_url_firmada = fila.voucher_url; } }
        let alertas = [];
        try { alertas = JSON.parse(fila.alertas_json || '[]'); } catch (e) { alertas = []; }
        const { alertas_json, ...resto } = fila;
        return { ...resto, alertas, voucher_url_firmada };
    }

    /** Avisos para revisar antes de confirmar; la persona decide (no bloquean) */
    async function alertasDe(p, v, ignorarId) {
        const al = [];
        const galones = num(v.galones), precio = num(v.precio_galon), total = num(v.total);
        if (galones > 0 && precio > 0 && total > 0 && Math.abs(galones * precio - total) > Math.max(0.5, total * 0.02)) {
            al.push({ nivel: 'rojo', texto: `Galones × precio da ${redondear(galones * precio).toFixed(2)} y el total dice ${total.toFixed(2)}` });
        }
        if (galones > 300) al.push({ nivel: 'rojo', texto: `${galones} galones es más de lo que carga un tanque normal` });
        if (v.placa_voucher && v.placa && String(v.placa_voucher).toUpperCase() !== String(v.placa).toUpperCase()) {
            al.push({ nivel: 'rojo', texto: `El voucher dice placa ${String(v.placa_voucher).toUpperCase()} y el viaje es ${v.placa}` });
        }
        if (v.numero_voucher) {
            const [dup] = await p.query("SELECT codigo FROM viaje_vales_combustible WHERE numero_voucher = ? AND COALESCE(estacion_ruc, '') = ? AND anulado = 0 AND id <> ? LIMIT 1",
                [v.numero_voucher, v.estacion_ruc || '', ignorarId || 0]);
            if (dup.length) al.push({ nivel: 'rojo', texto: `Este voucher ya está registrado en el vale ${dup[0].codigo}` });
        }
        if (v.placa && galones > 0 && v.fecha) {
            const [dup2] = await p.query("SELECT codigo FROM viaje_vales_combustible WHERE placa = ? AND fecha = ? AND ABS(galones - ?) < 0.01 AND anulado = 0 AND id <> ? LIMIT 1", [v.placa, v.fecha, galones, ignorarId || 0]);
            if (dup2.length && !al.some(a => /ya está registrado/.test(a.texto))) al.push({ nivel: 'ambar', texto: `Misma placa, fecha y galones que el vale ${dup2[0].codigo}` });
        }
        if (v.placa && v.km_odometro) {
            const [ult] = await p.query("SELECT km_odometro, codigo FROM viaje_vales_combustible WHERE placa = ? AND km_odometro IS NOT NULL AND anulado = 0 AND id <> ? ORDER BY fecha DESC, id DESC LIMIT 1", [v.placa, ignorarId || 0]);
            if (ult.length && Number(v.km_odometro) < Number(ult[0].km_odometro)) al.push({ nivel: 'ambar', texto: `El km (${v.km_odometro}) es menor al del vale ${ult[0].codigo} (${ult[0].km_odometro})` });
        }
        if (precio > 0) {
            const [med] = await p.query("SELECT AVG(precio_galon) AS m, COUNT(*) AS n FROM (SELECT precio_galon FROM viaje_vales_combustible WHERE anulado = 0 AND precio_galon > 0 AND id <> ? ORDER BY fecha DESC, id DESC LIMIT 30) t", [ignorarId || 0]);
            const m = Number(med[0] && med[0].m);
            if (med[0] && med[0].n >= 3 && m > 0 && Math.abs(precio - m) / m > 0.25) al.push({ nivel: 'ambar', texto: `El precio por galón (${precio.toFixed(2)}) se aleja de lo normal (${m.toFixed(2)})` });
        }
        if (!galones || !total) al.push({ nivel: 'ambar', texto: 'Faltan galones o el total' });
        return al;
    }

    // Lista (por viaje, placa o rango de fechas)
    router.get('/', async (req, res) => {
        try {
            const p = P(req);
            const cond = ['1=1'], par = [];
            if (req.query.viaje) { cond.push('v.viaje = ?'); par.push(String(req.query.viaje)); }
            if (req.query.placa) { cond.push('v.placa = ?'); par.push(String(req.query.placa).toUpperCase()); }
            if (fechaOpc(req.query.desde)) { cond.push('v.fecha >= ?'); par.push(req.query.desde); }
            if (fechaOpc(req.query.hasta)) { cond.push('v.fecha <= ?'); par.push(req.query.hasta); }
            const [rows] = await p.query(`SELECT ${COLUMNAS} ${FROM} WHERE ${cond.join(' AND ')} ORDER BY v.fecha DESC, v.id DESC LIMIT 1000`, par);
            res.json({ ok: true, data: await Promise.all(rows.map(conUrl)) });
        } catch (err) { responder(res, err, 'lista'); }
    });

    // Datos del viaje para llenar el vale solo (placa, conductor y DNI) + últimos km y viajes recientes para elegir
    router.get('/viajes', async (req, res) => {
        try {
            const p = P(req);
            const q = texto(req.query.q, 60);
            const [rows] = await p.query(
                `SELECT ov.viaje, ov.placa_tracto, ov.placa_remolque, ov.conductor, ov.ruta, DATE_FORMAT(ov.fecha_viaje, '%Y-%m-%d') AS fecha_viaje, ov.estado,
                    (SELECT dni FROM conductores WHERE UPPER(nombre) = UPPER(ov.conductor) LIMIT 1) AS conductor_doc,
                    (SELECT km_odometro FROM viaje_vales_combustible v WHERE v.placa = ov.placa_tracto AND v.km_odometro IS NOT NULL AND v.anulado = 0 ORDER BY v.fecha DESC, v.id DESC LIMIT 1) AS ultimo_km
                 FROM operaciones_ordenes_viaje ov
                 WHERE ov.estado <> 'ANULADO' ${q ? "AND (ov.viaje LIKE ? OR ov.placa_tracto LIKE ? OR ov.conductor LIKE ?)" : ''}
                 ORDER BY ov.fecha_viaje DESC, ov.id DESC LIMIT 40`, q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []);
            res.json({ ok: true, data: rows });
        } catch (err) { responder(res, err, 'viajes'); }
    });

    // Conductores o proveedores (estaciones) para elegir a quién se le paga
    router.get('/beneficiarios', async (req, res) => {
        try {
            const p = P(req);
            const q = texto(req.query.q, 60);
            const like = q ? `%${q}%` : null;
            if (String(req.query.tipo).toUpperCase() === 'CONDUCTOR') {
                const [rows] = await p.query(
                    `SELECT nombre, dni AS doc, banco, numero_cuenta FROM conductores WHERE estado = 'Activo' ${like ? 'AND (nombre LIKE ? OR dni LIKE ?)' : ''} ORDER BY nombre LIMIT 30`, like ? [like, like] : []);
                return res.json({ ok: true, data: rows });
            }
            const [rows] = await p.query(
                `SELECT nombre, numero_documento AS doc FROM proveedores_inv ${like ? 'WHERE nombre LIKE ? OR numero_documento LIKE ?' : ''} ORDER BY nombre LIMIT 30`, like ? [like, like] : []);
            res.json({ ok: true, data: rows });
        } catch (err) { responder(res, err, 'beneficiarios'); }
    });

    // Lee la foto del voucher con IA y propone los datos + avisos. No guarda nada.
    router.post('/leer', upload.single('archivo'), async (req, res) => {
        try {
            if (!req.file) throw aviso('Sube la foto del voucher.');
            const p = P(req);
            const d = await leerVoucher(req.file.buffer, req.file.mimetype);
            // La estación se enlaza con el proveedor registrado por RUC (si existe)
            let proveedor = null;
            if (d.estacion_ruc) {
                const [r] = await p.query('SELECT nombre, numero_documento AS doc FROM proveedores_inv WHERE numero_documento = ? LIMIT 1', [d.estacion_ruc]);
                proveedor = r[0] || null;
            }
            const placaViaje = texto(req.body.placa, 20);
            const alertas = await alertasDe(p, { ...d, placa: placaViaje || d.placa, placa_voucher: d.placa }, 0);
            res.json({ ok: true, datos: d, proveedor, alertas });
        } catch (err) { responder(res, err, 'leer'); }
    });

    // Crea el vale y su caja (PENDIENTE) en una sola transacción
    router.post('/', upload.single('voucher'), async (req, res) => {
        const conn = await getDb(req).promise().getConnection();
        try {
            const b = req.body || {};
            const viaje = texto(b.viaje, 60);
            if (!viaje) throw aviso('Elige el viaje del vale.');
            const [vj] = await conn.query('SELECT viaje, placa_tracto, conductor, ruta FROM operaciones_ordenes_viaje WHERE viaje = ?', [viaje]);
            if (!vj.length) throw aviso('El viaje no existe.', 404);
            const galones = redondear(num(b.galones), 3), precio = redondear(num(b.precio_galon), 4);
            let total = redondear(num(b.total));
            if (!(total > 0) && galones > 0 && precio > 0) total = redondear(galones * precio);
            if (!(galones > 0)) throw aviso('Indica los galones.');
            if (!(total > 0)) throw aviso('Indica el total del vale.');
            const fecha = fechaOpc(b.fecha) || hoyLima();
            if (fecha > hoyLima()) throw aviso('La fecha del vale no puede ser futura.');
            const pagarA = String(b.pagar_a).toUpperCase() === 'CONDUCTOR' ? 'CONDUCTOR' : 'ESTACION';
            const estacion = texto(b.estacion_nombre, 200) || '';
            const conductor = texto(b.conductor, 150) || vj[0].conductor || '';
            const benNombre = pagarA === 'CONDUCTOR' ? (texto(b.beneficiario_nombre, 200) || conductor) : (texto(b.beneficiario_nombre, 200) || estacion);
            if (!benNombre) throw aviso(pagarA === 'CONDUCTOR' ? 'Indica el conductor al que se le paga.' : 'Indica la estación a la que se le paga.');
            const benDoc = texto(b.beneficiario_doc, 20) || (pagarA === 'ESTACION' ? texto(b.estacion_ruc, 20) : texto(b.conductor_doc, 20));
            const placa = (texto(b.placa, 20) || vj[0].placa_tracto || '').toUpperCase();
            const moneda = /D[OÓ]L|USD/i.test(String(b.moneda || '')) ? 'DOLARES' : 'SOLES';
            if (!req.file && !texto(b.voucher_url, 600) && !texto(b.numero_voucher, 60)) throw aviso('Adjunta la foto del voucher o escribe su número: todo vale necesita su sustento.');

            const alertas = await alertasDe(conn, { galones, precio_galon: precio, total, placa, placa_voucher: texto(b.placa_voucher, 20), numero_voucher: texto(b.numero_voucher, 60), estacion_ruc: texto(b.estacion_ruc, 20), fecha, km_odometro: b.km_odometro ? Math.round(num(b.km_odometro)) : null }, 0);
            // Con avisos en rojo solo se guarda si la persona los confirmó en pantalla
            if (alertas.some(a => a.nivel === 'rojo') && !(b.confirmar_alertas === '1' || b.confirmar_alertas === 'true')) {
                return res.status(409).json({ ok: false, error: 'Hay avisos en rojo. Revísalos y confirma para guardar.', alertas });
            }

            let voucherUrl = texto(b.voucher_url, 600);
            if (req.file) {
                const ext = (String(req.file.originalname || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
                voucherUrl = await uploadToS3(req.file.buffer, `operaciones/vales/${viaje}/voucher_${Date.now()}.${ext}`, req.file.mimetype);
            }
            const usuario = usuarioDe(req);
            const anio = fecha.slice(0, 4);

            await conn.beginTransaction();
            const [maxV] = await conn.query("SELECT codigo FROM viaje_vales_combustible WHERE codigo LIKE ? ORDER BY id DESC LIMIT 1 FOR UPDATE", [`VC-${anio}-%`]);
            const sec = maxV.length ? parseInt(String(maxV[0].codigo).split('-').pop(), 10) + 1 : 1;
            const codigo = `VC-${anio}-${String(sec).padStart(5, '0')}`;

            const [ins] = await conn.query(
                `INSERT INTO viaje_vales_combustible (codigo, viaje, placa, conductor, conductor_doc, fecha, hora, estacion_nombre, estacion_ruc, combustible, galones, precio_galon, total, moneda,
                    km_odometro, numero_voucher, voucher_url, pagar_a, beneficiario_nombre, beneficiario_doc, ia_json, alertas_json, observacion, usuario)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [codigo, viaje, placa, conductor, texto(b.conductor_doc, 20), fecha, texto(b.hora, 10), estacion, texto(b.estacion_ruc, 20), combustibleDe(b.combustible) || texto(b.combustible, 40), galones, precio, total, moneda,
                    b.km_odometro ? Math.round(num(b.km_odometro)) : null, texto(b.numero_voucher, 60), voucherUrl, pagarA, benNombre, benDoc, texto(b.ia_json, 20000), JSON.stringify(alertas), texto(b.observacion, 500), usuario]);
            if (ins.affectedRows !== 1) throw new Error('No se pudo crear el vale.');

            // Caja automática (egreso PENDIENTE, ligado al viaje). Se aprueba en Tesorería y luego aparece en Pago de requerimientos.
            const serieCaja = hoyLima().slice(0, 4);
            const [uc] = await conn.query('SELECT numero FROM tesoreria_caja WHERE serie = ? ORDER BY id DESC LIMIT 1 FOR UPDATE', [serieCaja]);
            let n = 1;
            if (uc.length && uc[0].numero) { const m = /\d+$/.exec(uc[0].numero); if (m) n = parseInt(m[0], 10) + 1; }
            const descripcion = `Vale de combustible ${codigo} · ${galones} gal ${texto(b.combustible, 40) || ''} · ${estacion || 'estación'} · viaje ${viaje} · placa ${placa}`.replace(/\s+/g, ' ').trim();
            const [caja] = await conn.query(
                `INSERT INTO tesoreria_caja (fecha, hora, fecha_valuta, hora_valuta, numero_factura, serie, numero, orden_viaje, conductor, ruta_viaje, placa, autoriza, motivo, centro_costo, sub_motivo,
                    modalidad_pago, moneda, tipo_persona, persona, tipo_movimiento, subtotal, retencion_detraccion, importe_total, tipo_cambio, descripcion, tipo_comprobante, voucher_url, estado, usuario_creacion, origen, origen_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Gastos de Viaje y Ruta', 'CC-100', 'Combustible', 'TRANSFERENCIA', ?, ?, ?, 'EGRESO', ?, 0, ?, 1, ?, 'VALE DE COMBUSTIBLE', ?, 'PENDIENTE', ?, 'VALE_COMBUSTIBLE', ?)`,
                [fecha, horaLima(), fecha, '00:00:00', texto(b.numero_voucher, 100) || '', serieCaja, String(n).padStart(8, '0'), viaje, conductor, vj[0].ruta || '', placa, usuario,
                    moneda, pagarA === 'CONDUCTOR' ? 'CONDUCTOR' : 'PROVEEDOR', benNombre.slice(0, 190), total, total, descripcion, voucherUrl, usuario, ins.insertId]);
            if (caja.affectedRows !== 1) throw new Error('No se pudo crear la caja del vale.');
            const [upd] = await conn.query('UPDATE viaje_vales_combustible SET caja_id = ? WHERE id = ?', [caja.insertId, ins.insertId]);
            if (upd.affectedRows !== 1) throw new Error('No se pudo enlazar la caja con el vale.');
            await conn.commit();
            if (typeof logAudit === 'function') logAudit(req, 'OPERACIONES', 'VALES', 'CREÓ', `Vale ${codigo} · viaje ${viaje} · ${galones} gal · ${moneda} ${total}`);
            res.json({ ok: true, id: ins.insertId, codigo, caja_id: caja.insertId, alertas });
        } catch (err) {
            try { await conn.rollback(); } catch (e) { /* sin transacción */ }
            responder(res, err, 'crear');
        } finally { conn.release(); }
    });

    // Anula el vale y su caja, mientras esa caja no esté pagada
    router.post('/:id/anular', async (req, res) => {
        try {
            const p = P(req);
            const motivo = texto(req.body && req.body.motivo, 300);
            if (!motivo) throw aviso('Escribe el motivo de la anulación.');
            const [rows] = await p.query(`SELECT ${COLUMNAS} ${FROM} WHERE v.id = ?`, [Number(req.params.id)]);
            if (!rows.length) throw aviso('Vale no encontrado.', 404);
            const v = rows[0];
            if (v.estado === 'ANULADO') throw aviso('El vale ya está anulado.', 409);
            if (v.estado === 'PAGADO') throw aviso('El vale ya se pagó: no se puede anular. Anula primero el egreso en Tesorería.', 409);
            const usuario = usuarioDe(req);
            const [a] = await p.query("UPDATE viaje_vales_combustible SET anulado = 1, observacion = CONCAT(COALESCE(observacion, ''), ' [ANULADO: ', ?, ']') WHERE id = ? AND anulado = 0", [motivo, v.id]);
            if (a.affectedRows !== 1) throw aviso('El vale ya estaba anulado.', 409);
            if (v.caja_id) {
                await p.query("UPDATE tesoreria_caja SET estado = 'ANULADO', usuario_aprobacion = ?, observacion = CONCAT(COALESCE(observacion, ''), ' [ANULACIÓN]: ', ?, ' (Por ', ?, ')') WHERE id = ? AND UPPER(estado) NOT IN ('PROCESADO', 'PAGADO')", [usuario, motivo, usuario, v.caja_id]);
            }
            if (typeof logAudit === 'function') logAudit(req, 'OPERACIONES', 'VALES', 'ANULÓ', `Vale ${v.codigo}: ${motivo}`);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'anular'); }
    });

    return router;
};
