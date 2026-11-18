// Contabilidad › SIRE de SUNAT: trae del SIRE la propuesta de ventas (RVIE) y de compras (RCE) de un período, la guarda en el sistema
// (sire_comprobantes) y permite consultarla y filtrarla. Las credenciales salen de Sistema › Integraciones › SUNAT · SIRE.
// Cada descarga reemplaza el período completo: la propuesta es una foto de lo que SUNAT tiene. Todo de solo lectura hacia SUNAT.
const express = require('express');
const S = require('../services/sire');
const { getPresignedUrlEstable, s3KeyFromUrl } = require('../utils/s3');

// SUNAT limita las peticiones por minuto: las descargas se hacen de una en una
let cola = Promise.resolve();
const LIBROS = ['VENTAS', 'COMPRAS'];
const COLUMNAS = ['libro', 'periodo', 'car_sunat', 'fecha_emision', 'fecha_vencimiento', 'tipo_cp', 'serie', 'anio_dua', 'numero', 'numero_final', 'doc_tipo', 'doc_numero', 'razon_social',
    'base_gravada', 'igv', 'exo_ina', 'otros', 'total', 'moneda', 'tipo_cambio', 'mod_fecha', 'mod_tipo', 'mod_serie', 'mod_numero', 'detraccion', 'tipo_nota', 'estado_comp', 'datos_json'];

module.exports = (db, logAudit) => {
    const router = express.Router();
    const getDb = req => ((req && req.db) ? req.db : db);
    const P = req => getDb(req).promise();
    const usuarioDe = req => String((req.user && (req.user.nombre || req.user.correo || req.user.email)) || 'sistema').slice(0, 150);
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[contabilidad] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo completar la operación.' });
    };
    const periodoValido = p => /^\d{6}$/.test(p) && Number(p.slice(4)) >= 1 && Number(p.slice(4)) <= 12;

    // Una descarga: pide la propuesta a SUNAT, la lee y reemplaza el período en una sola transacción
    async function ejecutar(pool, id, libro, periodo) {
        const p = pool.promise();
        const mensaje = t => p.query('UPDATE sire_sincronizaciones SET mensaje = ? WHERE id = ?', [String(t).slice(0, 300), id]).catch(() => {});
        const cerrar = (estado, filas, texto, ticket) => p.query('UPDATE sire_sincronizaciones SET estado = ?, filas = ?, mensaje = ?, ticket = COALESCE(?, ticket), terminado_en = NOW() WHERE id = ?', [estado, filas, String(texto).slice(0, 300), ticket || null, id]).catch(() => {});
        try {
            const cfg = await S.credencialesDe(p);
            const faltan = S.faltantes(cfg);
            if (faltan.length) return cerrar('ERROR', 0, `Faltan las credenciales del SIRE (${faltan.join(', ')}) en Sistema › Integraciones.`);
            const r = await S.descargarPropuesta(cfg, libro, periodo, mensaje);
            let filas = [];
            if (r.ok) filas = S.parsearPropuesta(libro, periodo, r.texto);
            else if (!r.vacio) return cerrar('ERROR', 0, r.error);
            // Sin datos en SUNAT para ese período: se vacía la copia local del período y se avisa
            await mensaje('Guardando en el sistema…');
            const conn = await p.getConnection();
            try {
                await conn.beginTransaction();
                await conn.query('DELETE FROM sire_comprobantes WHERE libro = ? AND periodo = ?', [libro, periodo]);
                for (let i = 0; i < filas.length; i += 200) {
                    const lote = filas.slice(i, i + 200).map(f => COLUMNAS.map(c => (f[c] === undefined ? null : f[c])));
                    await conn.query(`INSERT INTO sire_comprobantes (${COLUMNAS.join(', ')}) VALUES ?`, [lote]);
                }
                await conn.commit();
            } catch (e) { await conn.rollback().catch(() => {}); throw e; } finally { conn.release(); }
            return cerrar(filas.length ? 'OK' : 'SIN_DATOS', filas.length, filas.length ? `${filas.length} comprobantes guardados.` : 'SUNAT no tiene comprobantes en este período.', r.ticket);
        } catch (e) {
            console.error('[contabilidad] descarga SIRE:', e && e.message);
            return cerrar('ERROR', 0, 'No se pudo completar la descarga. Inténtalo de nuevo.');
        }
    }

    // Estado: períodos ya descargados y descargas en curso (la pantalla lo consulta cada pocos segundos mientras hay una)
    router.get('/sire/estado', async (req, res) => {
        try {
            const p = P(req);
            const cfg = await S.credencialesDe(p);
            const [periodos] = await p.query(`SELECT libro, periodo, COUNT(*) AS filas, DATE_FORMAT(MAX(sincronizado_en), '%Y-%m-%d %H:%i') AS ultima FROM sire_comprobantes GROUP BY libro, periodo ORDER BY periodo DESC, libro`);
            const [curso] = await p.query(`SELECT id, libro, periodo, mensaje FROM sire_sincronizaciones WHERE estado = 'EN_PROCESO' AND iniciado_en > DATE_SUB(NOW(), INTERVAL 15 MINUTE) ORDER BY id`);
            const [ultimas] = await p.query(`SELECT s.libro, s.periodo, s.estado, s.filas, s.mensaje, DATE_FORMAT(s.terminado_en, '%Y-%m-%d %H:%i') AS terminado_en
                                             FROM sire_sincronizaciones s JOIN (SELECT libro, periodo, MAX(id) AS id FROM sire_sincronizaciones GROUP BY libro, periodo) m ON m.id = s.id WHERE s.estado <> 'EN_PROCESO' ORDER BY s.id DESC LIMIT 30`);
            res.json({ ok: true, configurado: S.faltantes(cfg).length === 0, periodos, en_proceso: curso, ultimas });
        } catch (err) { responder(res, err, 'estado'); }
    });

    // Traer de SUNAT: libro VENTAS, COMPRAS o AMBOS. Responde de inmediato; el avance se ve en /sire/estado.
    router.post('/sire/sincronizar', async (req, res) => {
        try {
            const b = req.body || {};
            const periodo = String(b.periodo || '').trim();
            if (!periodoValido(periodo)) throw aviso('El período debe ser AAAAMM, por ejemplo 202610.');
            const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }).slice(0, 7).replace('-', '');
            if (periodo > hoy) throw aviso('No se puede pedir un período futuro.');
            const libros = String(b.libro || 'AMBOS').toUpperCase() === 'AMBOS' ? LIBROS : [String(b.libro).toUpperCase()];
            if (libros.some(l => !LIBROS.includes(l))) throw aviso('Libro no válido.');
            const p = P(req);
            const cfg = await S.credencialesDe(p);
            const faltan = S.faltantes(cfg);
            if (faltan.length) throw aviso(`Faltan las credenciales del SIRE (${faltan.join(', ')}): Sistema › Integraciones › SUNAT · SIRE.`, 409);
            const [ya] = await p.query(`SELECT id FROM sire_sincronizaciones WHERE estado = 'EN_PROCESO' AND libro IN (?) AND periodo = ? AND iniciado_en > DATE_SUB(NOW(), INTERVAL 15 MINUTE) LIMIT 1`, [libros, periodo]);
            if (ya.length) throw aviso('Ya hay una descarga de ese período en curso. Espera a que termine.', 409);
            const pool = getDb(req);
            const ids = [];
            for (const libro of libros) {
                const [ins] = await p.query(`INSERT INTO sire_sincronizaciones (libro, periodo, estado, mensaje, usuario) VALUES (?, ?, 'EN_PROCESO', 'En espera…', ?)`, [libro, periodo, usuarioDe(req)]);
                ids.push(ins.insertId);
                cola = cola.then(() => ejecutar(pool, ins.insertId, libro, periodo)).then(() => new Promise(r => setTimeout(r, 4000))).catch(() => {});
            }
            if (logAudit) logAudit({ req, accion: 'SIRE_DESCARGAR', modulo: 'CONTABILIDAD', detalle: `Descarga del SIRE (${libros.join(' y ')}) del período ${periodo}` });
            res.json({ ok: true, ids, message: 'Descarga iniciada. SUNAT prepara el archivo y se guarda en el sistema.' });
        } catch (err) { responder(res, err, 'sincronizar'); }
    });

    // ───────────── Cruce de compras: ¿esta factura de proveedor ya está en el sistema? ─────────────
    // Se compara con las órdenes de compra (RUC del proveedor + número de su documento), los vales de combustible (RUC de la estación + voucher),
    // las notas de crédito de proveedores y la caja (sin RUC: por número y monto, así que es «probable»).
    const sinCeros = v => String(v || '').replace(/\D/g, '').replace(/^0+/, '');
    const partes = t => {
        const s = String(t || '').toUpperCase();
        const m = /([A-Z0-9]{4})\s*[-–]\s*0*(\d+)/.exec(s);
        return m ? { serie: m[1], n: m[2] } : { serie: '', n: sinCeros(s) };
    };
    const enlaceDe = async url => {
        if (!url) return null;
        try { return /amazonaws\.com/.test(String(url)) ? await getPresignedUrlEstable(s3KeyFromUrl(url)) : String(url); } catch (e) { return null; }
    };
    async function cruceCompras(p, filas) {
        const leer = async (sql) => { try { const [r] = await p.query(sql); return r; } catch (e) { return []; } };
        const porRuc = new Map(); const caja = new Map();
        const agregar = (mapa, clave, d) => { if (!clave.endsWith('|') && !mapa.has(clave)) mapa.set(clave, []); if (mapa.has(clave)) mapa.get(clave).push(d); };
        for (const o of await leer(`SELECT e.id, e.serie, e.numero_correlativo, e.documento_referencia AS ref, e.total_pen, e.url_factura, pv.numero_documento AS ruc
                                    FROM entradas_inv e LEFT JOIN proveedores_inv pv ON CAST(pv.id AS CHAR) = CAST(e.proveedor_id AS CHAR)
                                    WHERE COALESCE(e.documento_referencia, '') <> '' AND UPPER(COALESCE(e.estado, '')) NOT LIKE 'ANUL%'`)) {
            const r = partes(o.ref);
            agregar(porRuc, `${String(o.ruc || '').trim()}|${r.n}`, { origen: 'OC', codigo: `OC ${o.serie || ''}-${String(o.numero_correlativo || o.id).padStart(5, '0')}`, serie: r.serie, url: o.url_factura });
        }
        for (const v of await leer(`SELECT codigo, numero_voucher AS ref, estacion_ruc AS ruc, total, voucher_url FROM viaje_vales_combustible WHERE anulado = 0 AND COALESCE(numero_voucher, '') <> ''`)) {
            const r = partes(v.ref);
            agregar(porRuc, `${String(v.ruc || '').trim()}|${r.n}`, { origen: 'VALE', codigo: `Vale ${v.codigo}`, serie: r.serie, url: v.voucher_url });
        }
        for (const nc of await leer(`SELECT codigo, serie, numero, proveedor_ruc AS ruc, archivo_url FROM compras_notas_credito WHERE UPPER(COALESCE(estado, '')) NOT LIKE 'ANUL%'`)) {
            agregar(porRuc, `${String(nc.ruc || '').trim()}|${sinCeros(nc.numero)}`, { origen: 'NC', codigo: `Nota de crédito ${nc.codigo}`, serie: String(nc.serie || '').toUpperCase(), url: nc.archivo_url });
        }
        for (const c of await leer(`SELECT serie, numero, numero_factura AS ref, importe_total, sustento_url FROM tesoreria_caja
                                    WHERE COALESCE(numero_factura, '') <> '' AND UPPER(COALESCE(estado, '')) NOT LIKE 'ANUL%' AND UPPER(COALESCE(estado, '')) NOT LIKE 'RECHAZ%'`)) {
            const r = partes(c.ref);
            agregar(caja, r.n, { origen: 'CAJA', codigo: `Caja ${c.serie}-${String(c.numero).padStart(5, '0')}`, serie: r.serie, total: Number(c.importe_total) || 0, url: c.sustento_url });
        }
        for (const f of filas) {
            const n = sinCeros(f.numero);
            let hit = null; let estado = 'NO';
            const candidatos = n ? (porRuc.get(`${String(f.doc_numero || '').trim()}|${n}`) || []) : [];
            if (candidatos.length) {
                const exacto = candidatos.find(c => !c.serie || c.serie === String(f.serie || '').toUpperCase());
                hit = exacto || candidatos[0]; estado = exacto ? 'EXACTO' : 'PROBABLE';
            } else if (n) {
                const c = (caja.get(n) || []).find(x => Math.abs(x.total - Math.abs(Number(f.total))) < 0.01 && (!x.serie || x.serie === String(f.serie || '').toUpperCase()));
                if (c) { hit = c; estado = 'PROBABLE'; }
            }
            f.cruce = hit ? { estado, origen: hit.origen, codigo: hit.codigo, archivo: await enlaceDe(hit.url) } : { estado: 'NO', origen: null, codigo: null, archivo: null };
        }
    }

    // Comprobantes de un libro, por período (AAAAMM) o por rango de fechas de emisión (sobre lo ya descargado). Ventas: marca si la factura está en nuestro sistema;
    // compras: cruza cada factura de proveedor con lo registrado.
    router.get('/sire/comprobantes', async (req, res) => {
        try {
            const libro = String(req.query.libro || 'VENTAS').toUpperCase();
            if (!LIBROS.includes(libro)) throw aviso('Libro no válido.');
            const periodo = String(req.query.periodo || '').trim();
            if (periodo && !periodoValido(periodo)) throw aviso('El período debe ser AAAAMM.');
            const fecha = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
            const desde = fecha(req.query.desde); const hasta = fecha(req.query.hasta);
            const cond = ['s.libro = ?']; const par = [libro];
            if (desde || hasta) { if (desde) { cond.push('s.fecha_emision >= ?'); par.push(desde); } if (hasta) { cond.push('s.fecha_emision <= ?'); par.push(hasta); } }
            else if (periodo) { cond.push('s.periodo = ?'); par.push(periodo); }
            const enSistema = libro === 'VENTAS'
                ? `, (SELECT COUNT(*) FROM facturacion_comprobantes fc WHERE fc.modo_emision = 'produccion' AND fc.estado <> 'RECHAZADO' AND fc.tipo_doc = s.tipo_cp AND fc.serie = s.serie AND CAST(fc.numero AS UNSIGNED) = CAST(s.numero AS UNSIGNED)) AS en_sistema,
                    (SELECT fc.id FROM facturacion_comprobantes fc WHERE fc.modo_emision = 'produccion' AND fc.estado <> 'RECHAZADO' AND fc.tipo_doc = s.tipo_cp AND fc.serie = s.serie AND CAST(fc.numero AS UNSIGNED) = CAST(s.numero AS UNSIGNED) ORDER BY fc.id DESC LIMIT 1) AS sistema_id`
                : '';
            const p = P(req);
            const [rows] = await p.query(
                `SELECT s.id, s.libro, s.periodo, s.car_sunat, DATE_FORMAT(s.fecha_emision, '%Y-%m-%d') AS fecha_emision, DATE_FORMAT(s.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
                        s.tipo_cp, s.serie, s.numero, s.doc_tipo, s.doc_numero, s.razon_social, s.base_gravada, s.igv, s.exo_ina, s.otros, s.total, s.moneda, s.tipo_cambio,
                        s.mod_tipo, s.mod_serie, s.mod_numero, s.detraccion, s.tipo_nota, s.estado_comp${enSistema}
                 FROM sire_comprobantes s WHERE ${cond.join(' AND ')} ORDER BY s.fecha_emision DESC, s.serie, CAST(s.numero AS UNSIGNED) DESC LIMIT 6000`, par);
            if (libro === 'COMPRAS') await cruceCompras(p, rows);
            res.json({ ok: true, data: rows });
        } catch (err) { responder(res, err, 'comprobantes'); }
    });

    // Todos los datos de un comprobante tal como los entrega SUNAT
    router.get('/sire/comprobantes/:id', async (req, res) => {
        try {
            const [r] = await P(req).query('SELECT id, libro, periodo, datos_json FROM sire_comprobantes WHERE id = ?', [Number(req.params.id) || 0]);
            if (!r.length) throw aviso('Comprobante no encontrado.', 404);
            let datos = []; try { datos = JSON.parse(r[0].datos_json || '[]'); } catch (e) { datos = []; }
            res.json({ ok: true, data: { id: r[0].id, libro: r[0].libro, periodo: r[0].periodo, datos } });
        } catch (err) { responder(res, err, 'detalle'); }
    });

    return router;
};
