// Facturación electrónica (Operaciones): factura, boleta y nota de crédito emitidas por APISUNAT.
// Tablas: facturacion_comprobantes y facturacion_items (migración 38). Se factura desde los servicios entregados (uno o varios del mismo cliente)
// o libre (sin servicio). Las credenciales y el ambiente (prueba o producción) son los de Sistema › Integraciones de cada empresa.
const express = require('express');
const Apisunat = require('../services/apisunatService');
const { calcular, buildComprobanteUbl, buildNotaCreditoUbl, r2 } = require('../services/facturacion_ubl');

const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fechaOpc = v => { const s = String(v ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const COL = 'COLLATE utf8mb4_unicode_ci';
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const horaLima = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Lima', hour12: false });
const sumarDias = (iso, d) => { const f = new Date(`${iso}T12:00:00Z`); f.setUTCDate(f.getUTCDate() + d); return f.toISOString().slice(0, 10); };
const TIPOS = { '01': 'FACTURA', '03': 'BOLETA', '07': 'NOTA DE CRÉDITO' };
// Motivos de nota de crédito (catálogo 09 de SUNAT) que soportamos: los totales devuelven todas las líneas; los parciales bajan el valor
const MOTIVOS_NC = { '01': { texto: 'Anulación de la operación', total: true }, '02': { texto: 'Anulación por error en el RUC', total: true }, '06': { texto: 'Devolución total', total: true }, '09': { texto: 'Disminución en el valor', total: false }, '13': { texto: 'Ajustes de operaciones de exportación o posteriores', total: false } };
const DETRACCION_TRANSPORTE = { pct: 4, minimo: 400 }; // transporte de bienes por vía terrestre (SPOT): 4 % desde S/ 400

module.exports = (db, logAudit) => {
    const router = express.Router();
    const getDb = req => ((req && req.db) ? req.db : db);
    const P = req => getDb(req).promise();
    const usuarioDe = req => String((req.user && (req.user.nombre || req.user.correo)) || 'sistema').slice(0, 150);
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[facturacion] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: err && err.message ? err.message : 'Error del servidor' });
    };

    // RUC peruano: 11 dígitos y dígito verificador
    const rucValido = r => {
        if (!/^\d{11}$/.test(String(r))) return false;
        const f = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]; let s = 0;
        for (let i = 0; i < 10; i++) s += Number(r[i]) * f[i];
        const dv = (11 - (s % 11)) % 10;
        return dv === Number(r[10]);
    };

    // Series y cuenta de detracciones de la empresa (Sistema › Integraciones), con las series habituales por defecto
    async function config(req) {
        const cfg = await Apisunat.getConfigEmpresa(getDb(req));
        const [rows] = await P(req).query(`SELECT clave, valor FROM integraciones_api WHERE clave LIKE 'apisunat_serie_%' OR clave = 'apisunat_cuenta_detraccion'`).catch(() => [[]]);
        const m = {}; (rows || []).forEach(r => { m[r.clave] = String(r.valor || '').trim(); });
        cfg.series = {
            '01': (m.apisunat_serie_factura || 'F001').toUpperCase(), '03': (m.apisunat_serie_boleta || 'B001').toUpperCase(),
            '07F': (m.apisunat_serie_nc_factura || 'FC01').toUpperCase(), '07B': (m.apisunat_serie_nc_boleta || 'BC01').toUpperCase(),
        };
        cfg.cuenta_detraccion = m.apisunat_cuenta_detraccion || '';
        return cfg;
    }

    // En modo prueba, APISUNAT debe confirmar que la cuenta NO es de producción; si lo es (o no responde) no se envía nada
    async function verificarPrueba(cfg, tipo, serie) {
        if (cfg.modo !== 'prueba') return;
        const r = await Apisunat.lastDocument({ personaId: cfg.persona_id, personaToken: cfg.persona_token, type: tipo, serie, base: cfg.base_url });
        if (!r.ok) throw aviso(`No se pudo comprobar la cuenta de pruebas en APISUNAT: ${String(typeof r.error === 'object' ? JSON.stringify(r.error) : r.error).slice(0, 200)}`, 422);
        if (r.production !== false) throw aviso('Esta cuenta de APISUNAT es de PRODUCCIÓN, no de pruebas: no se envía nada. Usa una cuenta de pruebas o cambia el ambiente a Producción a propósito.', 409);
    }

    // Siguiente número de una serie: el mayor entre lo local y lo que dice APISUNAT
    async function siguienteNumero(p, cfg, tipo, serie) {
        const [u] = await p.query(`SELECT COALESCE(MAX(CAST(numero AS UNSIGNED)), 0) AS ultimo FROM facturacion_comprobantes WHERE tipo_doc = ? AND serie = ?`, [tipo, serie]);
        let n = (Number(u[0].ultimo) || 0) + 1;
        try {
            const ap = await Apisunat.lastDocument({ personaId: cfg.persona_id, personaToken: cfg.persona_token, type: tipo, serie, base: cfg.base_url });
            if (ap.ok && ap.suggestedNumber) n = Math.max(n, parseInt(ap.suggestedNumber, 10) || 0);
        } catch (e) { /* si APISUNAT no responde se usa el local */ }
        return String(n).padStart(8, '0');
    }

    const mensajeError = r => (typeof r.error === 'object' ? JSON.stringify(r.error) : String(r.error || 'Error desconocido'));

    // ───────────── Configuración y estado ─────────────
    router.get('/config', async (req, res) => {
        try {
            const cfg = await config(req);
            res.json({ ok: true, modo: cfg.modo, lista: !cfg.bloqueo, motivo: cfg.bloqueo, ruc_emisor: cfg.ruc_emisor, razon_social: cfg.razon_social, series: cfg.series,
                detraccion: { ...DETRACCION_TRANSPORTE, cuenta: !!cuentaDetraccion(cfg) }, motivos_nc: Object.entries(MOTIVOS_NC).map(([codigo, v]) => ({ codigo, texto: v.texto, total: v.total })) });
        } catch (err) { responder(res, err, 'config'); }
    });
    const cuentaDetraccion = cfg => String(cfg.cuenta_detraccion || '').replace(/\s/g, '');

    // ───────────── Servicios por facturar ─────────────
    router.get('/por-facturar', async (req, res) => {
        try {
            const [rows] = await P(req).query(
                `SELECT os.id, os.codigo_orden, DATE_FORMAT(os.fecha, '%Y-%m-%d') AS fecha, os.cliente_id, os.cliente_nombre, os.ruta, os.es_retorno, os.tipo_servicio, os.estado_servicio,
                        os.moneda, os.tipo_cambio, os.costo_flete, os.impuesto, os.descripcion_carga,
                        (SELECT c.ruc_dni FROM clientes c WHERE c.id = os.cliente_id OR c.razon_social ${COL} = os.cliente_nombre ${COL} ORDER BY (c.id = os.cliente_id) DESC LIMIT 1) AS cliente_doc,
                        (SELECT c.direccion FROM clientes c WHERE c.id = os.cliente_id OR c.razon_social ${COL} = os.cliente_nombre ${COL} ORDER BY (c.id = os.cliente_id) DESC LIMIT 1) AS cliente_direccion,
                        (SELECT r.viaje FROM operaciones_ordenes_viaje_rutas r WHERE r.orden ${COL} = os.codigo_orden ${COL} LIMIT 1) AS viaje
                 FROM operaciones_ordenes_servicio os
                 WHERE os.estado_servicio IN ('ENTREGADO', 'EN_EJECUCION') AND COALESCE(os.costo_flete, 0) > 0
                   AND NOT EXISTS (SELECT 1 FROM facturacion_items fi JOIN facturacion_comprobantes fc ON fc.id = fi.comprobante_id
                                   WHERE fi.orden_servicio ${COL} = os.codigo_orden ${COL} AND fc.tipo_doc IN ('01', '03') AND fc.estado NOT IN ('ANULADO', 'RECHAZADO'))
                 ORDER BY os.cliente_nombre, os.fecha DESC, os.id DESC LIMIT 800`);
            res.json({ ok: true, data: rows });
        } catch (err) { responder(res, err, 'por-facturar'); }
    });

    // ───────────── Lista y detalle ─────────────
    router.get('/', async (req, res) => {
        try {
            const cond = ['1 = 1']; const par = [];
            if (['01', '03', '07'].includes(String(req.query.tipo || ''))) { cond.push('tipo_doc = ?'); par.push(req.query.tipo); }
            if (req.query.estado) { cond.push('estado = ?'); par.push(String(req.query.estado).toUpperCase()); }
            if (fechaOpc(req.query.desde)) { cond.push('fecha_emision >= ?'); par.push(req.query.desde); }
            if (fechaOpc(req.query.hasta)) { cond.push('fecha_emision <= ?'); par.push(req.query.hasta); }
            const q = String(req.query.q || '').trim();
            if (q) { cond.push('(numero_completo LIKE ? OR cliente_nombre LIKE ? OR cliente_doc LIKE ? OR referencia LIKE ?)'); par.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
            const [rows] = await P(req).query(
                `SELECT id, tipo_doc, numero_completo, DATE_FORMAT(fecha_emision, '%Y-%m-%d') AS fecha_emision, DATE_FORMAT(fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento, cliente_doc, cliente_nombre, moneda,
                        base, igv, total, detraccion_monto, neto_pendiente, forma_pago, estado, apisunat_status, apisunat_faults, pdf_url, xml_url, cdr_url, doc_ref_numero, motivo_texto, modo_emision, usuario, referencia,
                        (SELECT GROUP_CONCAT(DISTINCT fi.orden_servicio ORDER BY fi.linea SEPARATOR ', ') FROM facturacion_items fi WHERE fi.comprobante_id = facturacion_comprobantes.id AND fi.orden_servicio IS NOT NULL) AS servicios
                 FROM facturacion_comprobantes WHERE ${cond.join(' AND ')} ORDER BY fecha_emision DESC, id DESC LIMIT 500`, par);
            res.json({ ok: true, data: rows });
        } catch (err) { responder(res, err, 'lista'); }
    });

    router.get('/:id(\\d+)', async (req, res) => {
        try {
            const p = P(req);
            const [c] = await p.query(`SELECT * FROM facturacion_comprobantes WHERE id = ?`, [req.params.id]);
            if (!c.length) throw aviso('Comprobante no encontrado.', 404);
            const { datos_json, ...fila } = c[0];
            const [items] = await p.query(`SELECT linea, orden_servicio, descripcion, unidad, cantidad, valor_unitario, base, igv FROM facturacion_items WHERE comprobante_id = ? ORDER BY linea`, [req.params.id]);
            const [notas] = await p.query(`SELECT id, numero_completo, motivo_texto, total, estado, apisunat_status FROM facturacion_comprobantes WHERE doc_ref_id = ? ORDER BY id`, [req.params.id]);
            res.json({ ok: true, data: { ...fila, items, notas } });
        } catch (err) { responder(res, err, 'detalle'); }
    });

    // ───────────── Emitir factura o boleta ─────────────
    router.post('/emitir', async (req, res) => {
        const p = P(req);
        let id = null;
        try {
            const cfg = await config(req);
            if (cfg.bloqueo) throw aviso(cfg.bloqueo, 409);
            const b = req.body || {};
            const tipo = String(b.tipo_doc || '01');
            if (!['01', '03'].includes(tipo)) throw aviso('Tipo de comprobante no válido.', 400);
            const moneda = String(b.moneda || 'PEN').toUpperCase() === 'USD' ? 'USD' : 'PEN';
            const tipoCambio = moneda === 'USD' ? num(b.tipo_cambio) : null;
            if (moneda === 'USD' && !(tipoCambio >= 1 && tipoCambio <= 20)) throw aviso('Indica el tipo de cambio (soles por dólar).', 422);

            // Cliente
            const cl = b.cliente || {};
            const doc = String(cl.doc || '').replace(/\D/g, '');
            const nombre = texto(cl.nombre, 255);
            if (tipo === '01') {
                if (!rucValido(doc)) throw aviso('El RUC del cliente no es válido (11 dígitos).', 422);
            } else if (doc && !/^\d{8}$/.test(doc)) throw aviso('El DNI del cliente debe tener 8 dígitos.', 422);
            if (!nombre) throw aviso('Falta la razón social o el nombre del cliente.', 422);
            const docTipo = tipo === '01' ? '6' : (doc ? '1' : '0');
            const docFinal = tipo === '01' || doc ? doc : '00000000';

            // Líneas: cada una puede venir de un servicio (que debe existir, no estar facturado y ser del mismo cliente)
            const itemsIn = Array.isArray(b.items) ? b.items : [];
            if (!itemsIn.length) throw aviso('Agrega al menos una línea.', 422);
            const items = itemsIn.map((it, i) => {
                const d = texto(it.descripcion, 500);
                if (!d) throw aviso(`La línea ${i + 1} no tiene descripción.`, 422);
                const v = num(it.valor_unitario); const c = num(it.cantidad || 1);
                if (!(v > 0) || !(c > 0)) throw aviso(`La línea ${i + 1} necesita cantidad y valor mayores a cero.`, 422);
                return { orden_servicio: texto(it.orden_servicio, 40), descripcion: d, unidad: texto(it.unidad, 5) || 'ZZ', cantidad: c, valor_unitario: Math.round(v * 10000) / 10000 };
            });
            const codigos = [...new Set(items.map(i => i.orden_servicio).filter(Boolean))];
            if (codigos.length) {
                const [os] = await p.query(`SELECT codigo_orden, cliente_nombre, moneda, estado_servicio FROM operaciones_ordenes_servicio WHERE codigo_orden IN (?)`, [codigos]);
                if (os.length !== codigos.length) throw aviso('Alguno de los servicios elegidos no existe.', 404);
                if (os.some(s => s.estado_servicio === 'ANULADO')) throw aviso('Hay un servicio anulado entre las líneas.', 409);
                if (new Set(os.map(s => String(s.cliente_nombre || '').trim().toUpperCase())).size > 1) throw aviso('Una factura es de un solo cliente: los servicios elegidos son de clientes distintos.', 422);
                const monedas = new Set(os.map(s => (/D[OÓ]L|USD/i.test(String(s.moneda || '')) ? 'USD' : 'PEN')));
                if (monedas.size > 1 || (monedas.size === 1 && !monedas.has(moneda))) throw aviso(`Los servicios están en ${[...monedas].join('/')} y el comprobante en ${moneda}. Deben coincidir.`, 422);
                const [ya] = await p.query(
                    `SELECT fi.orden_servicio, fc.numero_completo FROM facturacion_items fi JOIN facturacion_comprobantes fc ON fc.id = fi.comprobante_id
                     WHERE fi.orden_servicio IN (?) AND fc.tipo_doc IN ('01', '03') AND fc.estado NOT IN ('ANULADO', 'RECHAZADO')`, [codigos]);
                if (ya.length) throw aviso(`El servicio ${ya[0].orden_servicio} ya está facturado en ${ya[0].numero_completo}.`, 409);
            }

            // Fecha, forma de pago y detracción
            const hoy = hoyLima();
            const fecha = fechaOpc(b.fecha_emision) || hoy;
            if (fecha > hoy) throw aviso('La fecha de emisión no puede ser futura.', 422);
            if (fecha < sumarDias(hoy, -3)) throw aviso('SUNAT solo acepta enviar facturas con hasta 3 días de antigüedad: usa una fecha más reciente.', 422);
            const credito = String(b.forma_pago || 'CONTADO').toUpperCase() === 'CREDITO';
            const dias = credito ? Math.max(1, Math.min(365, parseInt(b.dias_credito, 10) || 0)) : 0;
            if (credito && !dias) throw aviso('Indica los días de crédito.', 422);
            const vence = credito ? sumarDias(fecha, dias) : null;
            const detPct = tipo === '01' ? Math.max(0, Math.min(100, num(b.detraccion_pct))) : 0;
            if (detPct > 0 && !cuentaDetraccion(cfg)) throw aviso('Falta la cuenta de detracciones del Banco de la Nación de la empresa (Sistema › Integraciones › APISUNAT).', 409);
            const calc = calcular(items, { afectoIgv: b.afecto_igv !== false, detraccionPct: detPct, tipoCambio: tipoCambio || 1, moneda });
            if (!(calc.total > 0)) throw aviso('El total debe ser mayor a cero.', 422);
            if (tipo === '03' && !doc && (moneda === 'USD' ? calc.total * tipoCambio : calc.total) >= 700) throw aviso('Una boleta de S/ 700 o más necesita el DNI del cliente.', 422);

            const serie = cfg.series[tipo];
            await verificarPrueba(cfg, tipo, serie);
            const numero = await siguienteNumero(p, cfg, tipo, serie);
            const numeroCompleto = `${serie}-${numero}`;
            const hora = horaLima();

            const [ins] = await p.query(
                `INSERT INTO facturacion_comprobantes (tipo_doc, serie, numero, numero_completo, fecha_emision, hora_emision, fecha_vencimiento, cliente_id, cliente_doc_tipo, cliente_doc, cliente_nombre, cliente_direccion,
                    moneda, tipo_cambio, forma_pago, dias_credito, base, igv, total, detraccion_pct, detraccion_monto, neto_pendiente, orden_compra, referencia, observacion, estado, modo_emision, usuario)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?)`,
                [tipo, serie, numero, numeroCompleto, fecha, hora, vence, Number.isInteger(Number(cl.id)) ? Number(cl.id) : null, docTipo, docFinal, nombre, texto(cl.direccion, 255), moneda, tipoCambio, credito ? 'CREDITO' : 'CONTADO', dias,
                    calc.base, calc.igv, calc.total, detPct, calc.detraccion, calc.neto_pendiente, texto(b.orden_compra, 60), texto(b.referencia, 120), texto(b.observacion, 1000), cfg.modo, usuarioDe(req)]);
            id = ins.insertId;
            for (let i = 0; i < calc.lineas.length; i++) {
                const l = calc.lineas[i];
                await p.query(`INSERT INTO facturacion_items (comprobante_id, linea, orden_servicio, descripcion, unidad, cantidad, valor_unitario, base, igv) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [id, i + 1, l.orden_servicio, l.descripcion, l.unidad, l.cantidad, l.valor_unitario, l.base, l.igv]);
            }

            const body = buildComprobanteUbl({
                tipo_doc: tipo, serie, numero, fecha_emision: fecha, hora_emision: hora, fecha_vencimiento: vence, moneda, forma_pago: credito ? 'CREDITO' : 'CONTADO',
                cliente: { doc_tipo: docTipo, doc: docFinal, nombre, direccion: texto(cl.direccion, 255) }, orden_compra: texto(b.orden_compra, 60),
                calculo: calc, detraccion_pct: detPct, cuenta_detraccion: cuentaDetraccion(cfg), afecto_igv: b.afecto_igv !== false,
            }, { ruc: cfg.ruc_emisor, razon_social: cfg.razon_social });
            const fileName = `${cfg.ruc_emisor}-${tipo}-${serie}-${numero}`;
            const r = await Apisunat.sendBill({ personaId: cfg.persona_id, personaToken: cfg.persona_token, fileName, documentBody: body, base: cfg.base_url });
            if (!r.ok) {
                // No se guarda: así el número queda libre y los servicios siguen por facturar
                await p.query(`DELETE FROM facturacion_items WHERE comprobante_id = ?`, [id]);
                await p.query(`DELETE FROM facturacion_comprobantes WHERE id = ?`, [id]);
                id = null;
                throw aviso(`APISUNAT no aceptó el comprobante: ${mensajeError(r).slice(0, 400)}`, 422);
            }
            await p.query(`UPDATE facturacion_comprobantes SET estado = 'EMITIDO', apisunat_document_id = ?, apisunat_status = 'PENDIENTE', datos_json = ?, pdf_url = ? WHERE id = ?`,
                [r.documentId, JSON.stringify(body), Apisunat.getPdfUrl(r.documentId, fileName, 'A4', cfg.base_url), id]);
            if (codigos.length) await p.query(`UPDATE operaciones_ordenes_servicio SET factura = ? WHERE codigo_orden IN (?)`, [numeroCompleto, codigos]).catch(() => {});
            if (logAudit) logAudit({ req, accion: 'EMITIR_COMPROBANTE', modulo: 'OPERACIONES', detalle: `${TIPOS[tipo]} ${numeroCompleto} (${cfg.modo}) a ${nombre} por ${moneda} ${calc.total}` });
            res.json({ ok: true, id, numero: numeroCompleto, total: calc.total, message: `${TIPOS[tipo]} ${numeroCompleto} enviada a APISUNAT (${cfg.modo === 'produccion' ? 'producción' : 'prueba'}).` });
        } catch (err) {
            if (id) { await p.query(`DELETE FROM facturacion_items WHERE comprobante_id = ?`, [id]).catch(() => {}); await p.query(`DELETE FROM facturacion_comprobantes WHERE id = ? AND apisunat_document_id IS NULL`, [id]).catch(() => {}); }
            responder(res, err, 'emitir');
        }
    });

    // ───────────── Nota de crédito ─────────────
    router.post('/:id(\\d+)/nota-credito', async (req, res) => {
        const p = P(req);
        let nid = null;
        try {
            const cfg = await config(req);
            if (cfg.bloqueo) throw aviso(cfg.bloqueo, 409);
            const b = req.body || {};
            const motivo = MOTIVOS_NC[String(b.motivo_codigo || '')];
            if (!motivo) throw aviso('Elige el motivo de la nota de crédito.', 422);
            const [c] = await p.query(`SELECT * FROM facturacion_comprobantes WHERE id = ?`, [req.params.id]);
            if (!c.length) throw aviso('Comprobante no encontrado.', 404);
            const o = c[0];
            if (!['01', '03'].includes(o.tipo_doc)) throw aviso('Solo se emite nota de crédito de una factura o una boleta.', 409);
            if (o.estado !== 'EMITIDO' || !o.apisunat_document_id) throw aviso('El comprobante no está emitido o ya fue anulado.', 409);
            if (o.apisunat_status === 'RECHAZADO') throw aviso('SUNAT rechazó este comprobante: no necesita nota de crédito, emítelo de nuevo.', 409);
            const [prev] = await p.query(`SELECT numero_completo FROM facturacion_comprobantes WHERE doc_ref_id = ? AND tipo_doc = '07' AND estado NOT IN ('RECHAZADO') AND motivo_codigo IN ('01', '02', '06') LIMIT 1`, [o.id]);
            if (prev.length) throw aviso(`Este comprobante ya tiene la nota de crédito total ${prev[0].numero_completo}.`, 409);

            const [its] = await p.query(`SELECT orden_servicio, descripcion, unidad, cantidad, valor_unitario FROM facturacion_items WHERE comprobante_id = ? ORDER BY linea`, [o.id]);
            let lineas;
            if (motivo.total) lineas = its.map(i => ({ orden_servicio: i.orden_servicio, descripcion: i.descripcion, unidad: i.unidad, cantidad: num(i.cantidad), valor_unitario: num(i.valor_unitario) }));
            else {
                const monto = num(b.monto_base);
                if (!(monto > 0) || monto > num(o.base)) throw aviso(`Indica el monto sin IGV a descontar (hasta ${num(o.base).toFixed(2)}).`, 422);
                lineas = [{ orden_servicio: null, descripcion: texto(b.descripcion, 250) || `${motivo.texto.toUpperCase()} - ${o.numero_completo}`, unidad: 'ZZ', cantidad: 1, valor_unitario: monto }];
            }
            const afecto = num(o.igv) > 0;
            const calc = calcular(lineas, { afectoIgv: afecto, moneda: o.moneda });
            const serie = cfg.series[o.tipo_doc === '01' ? '07F' : '07B'];
            await verificarPrueba(cfg, '07', serie);
            const numero = await siguienteNumero(p, cfg, '07', serie);
            const numeroCompleto = `${serie}-${numero}`;
            const hoy = hoyLima(); const hora = horaLima();
            const textoMotivo = texto(b.motivo_texto, 250) || motivo.texto;

            const [ins] = await p.query(
                `INSERT INTO facturacion_comprobantes (tipo_doc, serie, numero, numero_completo, fecha_emision, hora_emision, cliente_id, cliente_doc_tipo, cliente_doc, cliente_nombre, cliente_direccion, moneda, tipo_cambio,
                    forma_pago, base, igv, total, neto_pendiente, doc_ref_id, doc_ref_numero, motivo_codigo, motivo_texto, estado, modo_emision, usuario)
                 VALUES ('07', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONTADO', ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?)`,
                [serie, numero, numeroCompleto, hoy, hora, o.cliente_id, o.cliente_doc_tipo, o.cliente_doc, o.cliente_nombre, o.cliente_direccion, o.moneda, o.tipo_cambio,
                    calc.base, calc.igv, calc.total, calc.total, o.id, o.numero_completo, String(b.motivo_codigo), textoMotivo, cfg.modo, usuarioDe(req)]);
            nid = ins.insertId;
            for (let i = 0; i < calc.lineas.length; i++) {
                const l = calc.lineas[i];
                await p.query(`INSERT INTO facturacion_items (comprobante_id, linea, orden_servicio, descripcion, unidad, cantidad, valor_unitario, base, igv) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [nid, i + 1, null, l.descripcion, l.unidad, l.cantidad, l.valor_unitario, l.base, l.igv]);
            }
            const body = buildNotaCreditoUbl({
                serie, numero, fecha_emision: hoy, hora_emision: hora, moneda: o.moneda, calculo: calc, ref_numero: o.numero_completo, ref_tipo: o.tipo_doc,
                motivo_codigo: String(b.motivo_codigo), motivo_texto: textoMotivo, afecto_igv: afecto,
                cliente: { doc_tipo: o.cliente_doc_tipo, doc: o.cliente_doc, nombre: o.cliente_nombre, direccion: o.cliente_direccion },
            }, { ruc: cfg.ruc_emisor, razon_social: cfg.razon_social });
            const fileName = `${cfg.ruc_emisor}-07-${serie}-${numero}`;
            const r = await Apisunat.sendBill({ personaId: cfg.persona_id, personaToken: cfg.persona_token, fileName, documentBody: body, base: cfg.base_url });
            if (!r.ok) {
                await p.query(`DELETE FROM facturacion_items WHERE comprobante_id = ?`, [nid]);
                await p.query(`DELETE FROM facturacion_comprobantes WHERE id = ?`, [nid]);
                nid = null;
                throw aviso(`APISUNAT no aceptó la nota de crédito: ${mensajeError(r).slice(0, 400)}`, 422);
            }
            await p.query(`UPDATE facturacion_comprobantes SET estado = 'EMITIDO', apisunat_document_id = ?, apisunat_status = 'PENDIENTE', datos_json = ?, pdf_url = ? WHERE id = ?`,
                [r.documentId, JSON.stringify(body), Apisunat.getPdfUrl(r.documentId, fileName, 'A4', cfg.base_url), nid]);
            if (logAudit) logAudit({ req, accion: 'EMITIR_NOTA_CREDITO', modulo: 'OPERACIONES', detalle: `Nota de crédito ${numeroCompleto} (${cfg.modo}) sobre ${o.numero_completo}: ${textoMotivo}` });
            res.json({ ok: true, id: nid, numero: numeroCompleto, message: `Nota de crédito ${numeroCompleto} enviada a APISUNAT. Cuando SUNAT la acepte, ${motivo.total ? 'el comprobante queda anulado y sus servicios vuelven a «por facturar».' : 'el valor del comprobante queda descontado.'}` });
        } catch (err) {
            if (nid) { await p.query(`DELETE FROM facturacion_items WHERE comprobante_id = ?`, [nid]).catch(() => {}); await p.query(`DELETE FROM facturacion_comprobantes WHERE id = ? AND apisunat_document_id IS NULL`, [nid]).catch(() => {}); }
            responder(res, err, 'nota-credito');
        }
    });

    // ───────────── Estado en APISUNAT/SUNAT ─────────────
    async function sincronizar(p, cfg, fila) {
        const x = await Apisunat.getById(fila.apisunat_document_id, cfg.base_url);
        if (!x.ok) throw aviso(`APISUNAT respondió: ${String(x.error).slice(0, 200)}`, 422);
        const fileName = `${cfg.ruc_emisor}-${fila.tipo_doc}-${fila.serie}-${fila.numero}`;
        const rechazado = x.status === 'RECHAZADO';
        await p.query(`UPDATE facturacion_comprobantes SET apisunat_status = ?, xml_url = ?, cdr_url = ?, apisunat_faults = ?, pdf_url = ?, estado = ? WHERE id = ?`,
            [x.status || null, x.xml || null, x.cdr || null, x.faults && x.faults.length ? JSON.stringify(x.faults).slice(0, 2000) : null, Apisunat.getPdfUrl(fila.apisunat_document_id, fileName, 'A4', cfg.base_url),
                rechazado ? 'RECHAZADO' : fila.estado, fila.id]);
        if (rechazado && ['01', '03'].includes(fila.tipo_doc)) {
            await p.query(`UPDATE operaciones_ordenes_servicio os JOIN facturacion_items fi ON fi.orden_servicio ${COL} = os.codigo_orden ${COL} SET os.factura = NULL WHERE fi.comprobante_id = ? AND os.factura = ?`, [fila.id, fila.numero_completo]).catch(() => {});
        }
        // Nota de crédito total aceptada: el comprobante original queda anulado y sus servicios vuelven a «por facturar»
        if (fila.tipo_doc === '07' && x.status === 'ACEPTADO' && ['01', '02', '06'].includes(fila.motivo_codigo) && fila.doc_ref_id) {
            await p.query(`UPDATE facturacion_comprobantes SET estado = 'ANULADO' WHERE id = ?`, [fila.doc_ref_id]);
            await p.query(`UPDATE operaciones_ordenes_servicio os JOIN facturacion_items fi ON fi.orden_servicio ${COL} = os.codigo_orden ${COL} SET os.factura = NULL WHERE fi.comprobante_id = ?`, [fila.doc_ref_id]).catch(() => {});
        }
        return x.status;
    }

    router.post('/:id(\\d+)/sincronizar', async (req, res) => {
        try {
            const p = P(req); const cfg = await config(req);
            const [r] = await p.query(`SELECT id, tipo_doc, serie, numero, numero_completo, estado, motivo_codigo, doc_ref_id, apisunat_document_id FROM facturacion_comprobantes WHERE id = ?`, [req.params.id]);
            if (!r.length) throw aviso('Comprobante no encontrado.', 404);
            if (!r[0].apisunat_document_id) throw aviso('Este comprobante aún no se envió a APISUNAT.', 409);
            const st = await sincronizar(p, cfg, r[0]);
            res.json({ ok: true, apisunat_status: st, message: `${r[0].numero_completo}: ${st || 'sin estado'}` });
        } catch (err) { responder(res, err, 'sincronizar'); }
    });

    // Actualiza todos los comprobantes que siguen pendientes de respuesta de SUNAT
    router.post('/sincronizar-pendientes', async (req, res) => {
        try {
            const p = P(req); const cfg = await config(req);
            const [rows] = await p.query(`SELECT id, tipo_doc, serie, numero, numero_completo, estado, motivo_codigo, doc_ref_id, apisunat_document_id FROM facturacion_comprobantes
                                          WHERE apisunat_document_id IS NOT NULL AND (apisunat_status IS NULL OR apisunat_status IN ('PENDIENTE', 'EXCEPCION')) ORDER BY id DESC LIMIT 40`);
            let n = 0;
            for (const f of rows) { try { await sincronizar(p, cfg, f); n++; } catch (e) { /* se reintenta la próxima vez */ } }
            res.json({ ok: true, actualizados: n, total: rows.length });
        } catch (err) { responder(res, err, 'sincronizar-pendientes'); }
    });

    return router;
};
