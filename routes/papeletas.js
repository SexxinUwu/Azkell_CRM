// Módulo Papeletas (Flota): papeletas, multas y actas de control de las unidades.
// Tablas: papeletas, papeletas_pagos, papeletas_historial, papeletas_entidades, papeletas_infracciones, papeletas_config (migración 19).
// Automatiza lo que se pueda para que se escriba lo mínimo: la placa trae la unidad, la empresa dueña y el conductor del viaje de ese día;
// el DNI trae el nombre y la licencia; el código de infracción trae descripción, gravedad, puntos y multa; la entidad trae los plazos;
// y una foto de la papeleta se lee con IA (el usuario revisa y confirma).
const express = require('express');
const multer = require('multer');
const { uploadToS3, deleteFromS3, s3KeyFromUrl, getPresignedUrlEstable } = require('../utils/s3');
const { leerPapeletaConIA } = require('../services/papeleta_ia');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

const ESTADOS_BASE = ['PENDIENTE', 'EN_DESCARGO', 'PAGADA', 'ANULADA'];
const TIPOS_DOC = ['PAPELETA', 'ACTA_CONTROL', 'RESOLUCION_MULTA', 'FOTOPAPELETA', 'NOTIFICACION', 'OTRO'];
const GRAVEDADES = ['LEVE', 'GRAVE', 'MUY_GRAVE'];
const QUIEN_ASUME = ['EMPRESA', 'CONDUCTOR', 'ALQUILADA', 'TERCERO'];

const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const texto = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };
const hoyLima = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());
const esFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
const fechaOpc = v => { const s = String(v ?? '').slice(0, 10); return esFecha(s) ? s : null; };
const sumarDias = (f, d) => { const x = new Date(`${f}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + Number(d)); return x.toISOString().slice(0, 10); };
const limpiaPlaca = v => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const redondear = n => Math.round(n * 100) / 100;

// Fechas en texto desde SQL (sin desfase de zona horaria)
const COLS = `p.id, p.codigo, p.entidad_codigo, p.entidad_otra, p.tipo_documento, p.numero,
    DATE_FORMAT(p.fecha_infraccion, '%Y-%m-%dT%H:%i') AS fecha_infraccion, p.departamento, p.lugar, p.agente,
    p.placa, p.empresa_unidad, p.conductor_nombre, p.conductor_dni, p.licencia,
    p.infraccion_codigo, p.infraccion_desc, p.gravedad, p.puntos, p.medida,
    p.moneda, p.monto, p.descuento_monto, p.recargos,
    DATE_FORMAT(p.fecha_limite_descuento, '%Y-%m-%d') AS fecha_limite_descuento,
    DATE_FORMAT(p.fecha_notificacion, '%Y-%m-%d') AS fecha_notificacion,
    DATE_FORMAT(p.fecha_limite_descargo, '%Y-%m-%d') AS fecha_limite_descargo,
    DATE_FORMAT(p.fecha_limite_pago, '%Y-%m-%d') AS fecha_limite_pago,
    p.quien_asume, p.asume_nombre, p.estado,
    DATE_FORMAT(p.descargo_fecha, '%Y-%m-%d') AS descargo_fecha, p.descargo_expediente, p.descargo_resultado, p.anulada_motivo,
    DATE_FORMAT(p.reembolso_fecha, '%Y-%m-%d') AS reembolso_fecha, p.reembolso_monto,
    p.observaciones, p.creado_por, p.created_at, p.updated_at`;

const SQL_LISTA = `
    SELECT ${COLS}, e.nombre AS entidad_nombre, COALESCE(pg.pagado, 0) AS pagado, COALESCE(pg.n_pagos, 0) AS n_pagos,
           (LENGTH(COALESCE(p.evidencias_json, '')) > 2) AS tiene_evidencias
    FROM papeletas p
    LEFT JOIN papeletas_entidades e ON e.codigo = p.entidad_codigo
    LEFT JOIN (SELECT papeleta_id, SUM(monto) AS pagado, COUNT(*) AS n_pagos FROM papeletas_pagos GROUP BY papeleta_id) pg ON pg.papeleta_id = p.id`;

/**
 * Datos derivados de una papeleta: lo pagado, lo que falta, si el descuento sigue vigente, los días que quedan y el estado que se muestra.
 * El total a pagar depende de la fecha: con el descuento vigente es menor.
 */
function enriquecer(r, hoy = hoyLima()) {
    const monto = num(r.monto), recargos = num(r.recargos), descuento = num(r.descuento_monto), pagado = num(r.pagado);
    const descuentoVigente = descuento > 0 && !!r.fecha_limite_descuento && r.fecha_limite_descuento >= hoy;
    const totalSinDescuento = redondear(monto + recargos);
    const totalVigente = redondear(totalSinDescuento - (descuentoVigente ? descuento : 0));
    const saldo = r.estado === 'ANULADA' ? 0 : Math.max(0, redondear(totalVigente - pagado));
    const dias = f => (f ? Math.round((Date.parse(`${f}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000) : null);
    const vencida = ['PENDIENTE', 'EN_DESCARGO'].includes(r.estado) && saldo > 0 && !!r.fecha_limite_pago && r.fecha_limite_pago < hoy;
    let efectivo = r.estado;
    if (r.estado === 'PENDIENTE') efectivo = vencida ? 'VENCIDA' : pagado > 0 ? 'PARCIAL' : descuentoVigente ? 'CON_DESCUENTO' : 'PENDIENTE';
    return {
        ...r,
        monto, recargos, descuento_monto: descuento, pagado,
        total_sin_descuento: totalSinDescuento, total_vigente: totalVigente, saldo,
        descuento_vigente: descuentoVigente,
        dias_descuento: dias(r.fecha_limite_descuento), dias_descargo: dias(r.fecha_limite_descargo), dias_pago: dias(r.fecha_limite_pago),
        vencida, estado_efectivo: efectivo,
        tiene_evidencias: !!Number(r.tiene_evidencias),
    };
}

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
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[papeletas] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: err && err.message ? err.message : 'Error del servidor' });
    };
    const historial = (p, id, accion, detalle, usuario) =>
        p.query('INSERT INTO papeletas_historial (papeleta_id, accion, detalle, usuario) VALUES (?, ?, ?, ?)', [id, accion, texto(detalle, 2000), usuario]);

    const leerEvidencias = txt => { try { const v = JSON.parse(txt || '[]'); return Array.isArray(v) ? v.filter(u => typeof u === 'string') : []; } catch (e) { return []; } };
    const firmar = async urls => Promise.all(urls.map(async (u, i) => {
        const key = s3KeyFromUrl(u);
        let url = u;
        if (key) { try { url = await getPresignedUrlEstable(key); } catch (e) { /* queda la URL guardada */ } }
        return { key: u, url, orden: i + 1 };
    }));

    async function siguienteCodigo(p) {
        const anio = hoyLima().slice(0, 4);
        const [r] = await p.query("SELECT codigo FROM papeletas WHERE codigo LIKE ? ORDER BY id DESC LIMIT 1", [`PAP-${anio}-%`]);
        let n = 1;
        if (r.length) { const m = /(\d+)$/.exec(r[0].codigo); if (m) n = parseInt(m[1], 10) + 1; }
        return `PAP-${anio}-${String(n).padStart(4, '0')}`;
    }

    // ── Catálogos ──────────────────────────────────────────────────────────────────────────────
    router.get('/papeletas/catalogos', async (req, res) => {
        try {
            const p = P(req);
            const [entidades] = await p.query('SELECT * FROM papeletas_entidades ORDER BY (codigo = \'OTRA\'), nombre');
            const [infracciones] = await p.query('SELECT * FROM papeletas_infracciones ORDER BY entidad_codigo, codigo');
            const [cfg] = await p.query('SELECT clave, valor FROM papeletas_config');
            const config = Object.fromEntries(cfg.map(c => [c.clave, c.valor]));
            res.json({ ok: true, entidades, infracciones, config });
        } catch (err) { responder(res, err, 'catalogos'); }
    });

    router.put('/papeletas/config', async (req, res) => {
        try {
            const uit = num(req.body && req.body.uit_valor);
            if (!(uit > 0)) throw aviso('Escribe el valor de la UIT (mayor a 0).');
            await P(req).query("INSERT INTO papeletas_config (clave, valor) VALUES ('uit_valor', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [String(uit)]);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'config'); }
    });

    function datosEntidad(b) {
        const codigo = String(b.codigo || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 30);
        const nombre = texto(b.nombre, 200);
        if (!codigo || !nombre) throw aviso('La entidad necesita un código y un nombre.');
        const entero = v => (v === '' || v == null ? null : Math.max(0, Math.round(num(v))));
        return {
            codigo, nombre, ambito: texto(b.ambito, 80),
            dias_descargo: entero(b.dias_descargo), dias_descuento: entero(b.dias_descuento), dias_pago: entero(b.dias_pago),
            pct_descuento: b.pct_descuento === '' || b.pct_descuento == null ? null : Math.min(100, Math.max(0, num(b.pct_descuento))),
            activo: b.activo === 0 || b.activo === '0' || b.activo === false ? 0 : 1,
        };
    }
    router.post('/papeletas/entidades', async (req, res) => {
        try {
            const d = datosEntidad(req.body || {});
            const [e] = await P(req).query('SELECT id FROM papeletas_entidades WHERE codigo = ?', [d.codigo]);
            if (e.length) throw aviso(`Ya existe una entidad con el código ${d.codigo}.`);
            const [r] = await P(req).query('INSERT INTO papeletas_entidades SET ?', [d]);
            res.json({ ok: true, id: r.insertId });
        } catch (err) { responder(res, err, 'entidad+'); }
    });
    router.put('/papeletas/entidades/:id', async (req, res) => {
        try {
            const d = datosEntidad(req.body || {});
            const [r] = await P(req).query('UPDATE papeletas_entidades SET ? WHERE id = ?', [d, Number(req.params.id)]);
            if (!r.affectedRows) throw aviso('Entidad no encontrada.', 404);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'entidad~'); }
    });
    router.delete('/papeletas/entidades/:id', async (req, res) => {
        try {
            const p = P(req);
            const [e] = await p.query('SELECT codigo FROM papeletas_entidades WHERE id = ?', [Number(req.params.id)]);
            if (!e.length) throw aviso('Entidad no encontrada.', 404);
            const [u] = await p.query('SELECT COUNT(*) AS n FROM papeletas WHERE entidad_codigo = ?', [e[0].codigo]);
            if (Number(u[0].n) > 0) throw aviso(`No se puede borrar: ${u[0].n} papeleta(s) usan esta entidad. Desactívala en su lugar.`, 409);
            await p.query('DELETE FROM papeletas_entidades WHERE id = ?', [Number(req.params.id)]);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'entidad-'); }
    });

    function datosInfraccion(b) {
        const codigo = texto(b.codigo, 30);
        const descripcion = texto(b.descripcion, 500);
        if (!codigo || !descripcion) throw aviso('La infracción necesita un código y una descripción.');
        const gravedad = GRAVEDADES.includes(String(b.gravedad || '').toUpperCase()) ? String(b.gravedad).toUpperCase() : null;
        return {
            entidad_codigo: String(b.entidad_codigo || '').trim().toUpperCase().slice(0, 30), codigo: codigo.toUpperCase(), descripcion, gravedad,
            puntos: b.puntos === '' || b.puntos == null ? null : Math.max(0, Math.round(num(b.puntos))),
            multa_uit: b.multa_uit === '' || b.multa_uit == null ? null : Math.max(0, num(b.multa_uit)),
            multa_soles: b.multa_soles === '' || b.multa_soles == null ? null : Math.max(0, num(b.multa_soles)),
            medida: texto(b.medida, 200),
            activo: b.activo === 0 || b.activo === '0' || b.activo === false ? 0 : 1,
        };
    }
    router.post('/papeletas/infracciones', async (req, res) => {
        try {
            const d = datosInfraccion(req.body || {});
            const [e] = await P(req).query('SELECT id FROM papeletas_infracciones WHERE entidad_codigo = ? AND codigo = ?', [d.entidad_codigo, d.codigo]);
            if (e.length) throw aviso(`Ya existe la infracción ${d.codigo} para esa entidad.`);
            const [r] = await P(req).query('INSERT INTO papeletas_infracciones SET ?', [d]);
            res.json({ ok: true, id: r.insertId });
        } catch (err) { responder(res, err, 'infraccion+'); }
    });
    router.put('/papeletas/infracciones/:id', async (req, res) => {
        try {
            const d = datosInfraccion(req.body || {});
            const [r] = await P(req).query('UPDATE papeletas_infracciones SET ? WHERE id = ?', [d, Number(req.params.id)]);
            if (!r.affectedRows) throw aviso('Infracción no encontrada.', 404);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'infraccion~'); }
    });
    router.delete('/papeletas/infracciones/:id', async (req, res) => {
        try {
            await P(req).query('DELETE FROM papeletas_infracciones WHERE id = ?', [Number(req.params.id)]);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'infraccion-'); }
    });
    // Carga masiva del catálogo de infracciones (desde Excel): inserta las nuevas y actualiza las que ya existen
    router.post('/papeletas/infracciones/importar-masivo', async (req, res) => {
        try {
            const filas = Array.isArray(req.body && req.body.filas) ? req.body.filas.slice(0, 5000) : [];
            if (!filas.length) throw aviso('No hay filas para importar.');
            const p = P(req);
            let nuevas = 0, actualizadas = 0; const errores = [];
            for (let i = 0; i < filas.length; i++) {
                try {
                    const d = datosInfraccion(filas[i]);
                    const [e] = await p.query('SELECT id FROM papeletas_infracciones WHERE entidad_codigo = ? AND codigo = ?', [d.entidad_codigo, d.codigo]);
                    if (e.length) { await p.query('UPDATE papeletas_infracciones SET ? WHERE id = ?', [d, e[0].id]); actualizadas++; }
                    else { await p.query('INSERT INTO papeletas_infracciones SET ?', [d]); nuevas++; }
                } catch (err) { errores.push({ fila: i + 2, error: err.message }); }
            }
            res.json({ ok: true, nuevas, actualizadas, errores });
        } catch (err) { responder(res, err, 'infracciones-masivo'); }
    });

    // ── Autocompletar: la placa trae la unidad y el conductor; el DNI trae el nombre ─────────────
    router.get('/papeletas/autocompletar', async (req, res) => {
        try {
            const p = P(req);
            const placa = limpiaPlaca(req.query.placa);
            const fecha = fechaOpc(req.query.fecha) || hoyLima();
            if (placa.length < 5) return res.json({ ok: true, unidad: null, conductor: null });
            const [u] = await p.query(
                `SELECT placa, cliente, marca, modelo_uts, tipo, alquilada_a, docs_responsable FROM placas
                 WHERE REPLACE(REPLACE(UPPER(placa), '-', ''), ' ', '') = ? LIMIT 1`, [placa]).catch(() => [[]]);
            const unidad = u[0] ? {
                placa: u[0].placa, empresa: u[0].cliente || null, marca: u[0].marca || null, modelo: u[0].modelo_uts || null, tipo: u[0].tipo || null,
                alquilada_a: u[0].alquilada_a || null,
            } : null;

            // Conductor: el del viaje de esa unidad el día de la infracción (o el más cercano en los 3 días siguientes y anteriores)
            let conductor = null;
            for (const tabla of ['operaciones_ordenes_viaje', 'marsisa_ordenes_viaje']) {
                if (conductor) break;
                try {
                    const [v] = await p.query(
                        `SELECT id_conductor, conductor, DATE_FORMAT(fecha_viaje, '%Y-%m-%d') AS fecha_viaje,
                                ABS(DATEDIFF(DATE(fecha_viaje), ?)) AS distancia
                         FROM \`${tabla}\`
                         WHERE (REPLACE(UPPER(placa_tracto), '-', '') = ? OR REPLACE(UPPER(placa_remolque), '-', '') = ?)
                           AND DATE(fecha_viaje) BETWEEN DATE_SUB(?, INTERVAL 3 DAY) AND DATE_ADD(?, INTERVAL 3 DAY)
                           AND conductor IS NOT NULL AND conductor <> ''
                         ORDER BY distancia ASC, fecha_viaje DESC LIMIT 1`, [fecha, placa, placa, fecha, fecha]);
                    if (v.length) {
                        const [c] = await p.query('SELECT nombre, dni, licencia FROM conductores WHERE idConductor = ? OR nombre = ? LIMIT 1', [v[0].id_conductor, v[0].conductor]).catch(() => [[]]);
                        conductor = {
                            nombre: (c[0] && c[0].nombre) || v[0].conductor, dni: (c[0] && c[0].dni) || null, licencia: (c[0] && c[0].licencia) || null,
                            origen: Number(v[0].distancia) === 0 ? 'Viaje del mismo día' : `Viaje del ${v[0].fecha_viaje}`,
                        };
                    }
                } catch (e) { /* la tabla de viajes no existe en esta empresa */ }
            }

            // Quién asume: la empresa; si la unidad está alquilada, quien la alquila
            const asume = unidad && unidad.alquilada_a
                ? { quien_asume: 'ALQUILADA', asume_nombre: unidad.alquilada_a }
                : { quien_asume: 'EMPRESA', asume_nombre: unidad ? unidad.empresa : null };
            res.json({ ok: true, unidad, conductor, ...asume });
        } catch (err) { responder(res, err, 'autocompletar'); }
    });

    router.get('/papeletas/conductor', async (req, res) => {
        try {
            const dni = String(req.query.dni || '').replace(/\D/g, '');
            if (dni.length < 8) return res.json({ ok: true, encontrado: false });
            const [c] = await P(req).query('SELECT nombre, dni, licencia, empresa FROM conductores WHERE dni = ? LIMIT 1', [dni]);
            res.json({ ok: true, encontrado: !!c.length, conductor: c[0] || null });
        } catch (err) { responder(res, err, 'conductor'); }
    });

    // Leer una foto de la papeleta con IA: devuelve los datos para que la persona los revise y confirme (no guarda nada)
    router.post('/papeletas/leer-foto', upload.single('foto'), async (req, res) => {
        try {
            if (!req.file || !/^image\//.test(req.file.mimetype)) throw aviso('Sube una foto de la papeleta (imagen).');
            const entidades = (await P(req).query('SELECT codigo, nombre FROM papeletas_entidades WHERE activo = 1'))[0];
            const datos = await leerPapeletaConIA(req.file.buffer, req.file.mimetype, entidades);
            res.json({ ok: true, datos });
        } catch (err) { responder(res, err, 'leer-foto'); }
    });

    // ── Listado y detalle ───────────────────────────────────────────────────────────────────────
    router.get('/papeletas', async (req, res) => {
        try {
            const hoy = hoyLima();
            const [rows] = await P(req).query(`${SQL_LISTA} ORDER BY p.fecha_infraccion DESC, p.id DESC LIMIT 5000`);
            res.json({ ok: true, hoy, data: rows.map(r => enriquecer(r, hoy)) });
        } catch (err) { responder(res, err, 'lista'); }
    });

    // Indicador del menú: papeletas con saldo que vencen pronto o ya vencieron
    router.get('/papeletas/indicador', async (req, res) => {
        try {
            const hoy = hoyLima();
            const [rows] = await P(req).query(`${SQL_LISTA} WHERE p.estado IN ('PENDIENTE', 'EN_DESCARGO')`);
            const lista = rows.map(r => enriquecer(r, hoy));
            const urgentes = lista.filter(x => x.saldo > 0 && (x.vencida || (x.descuento_vigente && x.dias_descuento != null && x.dias_descuento <= 3) || (x.dias_pago != null && x.dias_pago <= 3))).length;
            res.json({ ok: true, pendientes: lista.filter(x => x.saldo > 0).length, urgentes, saldo: redondear(lista.reduce((s, x) => s + x.saldo, 0)) });
        } catch (err) { responder(res, err, 'indicador'); }
    });

    router.get('/papeletas/:id', async (req, res) => {
        try {
            const p = P(req);
            const [rows] = await p.query(`${SQL_LISTA} WHERE p.id = ?`, [Number(req.params.id)]);
            if (!rows.length) throw aviso('Papeleta no encontrada.', 404);
            const [ev] = await p.query('SELECT evidencias_json FROM papeletas WHERE id = ?', [Number(req.params.id)]);
            const [pagos] = await p.query(
                `SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, monto, medio, nro_operacion, comprobante_url, pagado_por, caja_id, observacion, registrado_por, created_at
                 FROM papeletas_pagos WHERE papeleta_id = ? ORDER BY fecha, id`, [Number(req.params.id)]);
            const [hist] = await p.query('SELECT id, accion, detalle, usuario, created_at FROM papeletas_historial WHERE papeleta_id = ? ORDER BY id DESC', [Number(req.params.id)]);
            const pagosFirmados = await Promise.all(pagos.map(async pg => {
                const key = pg.comprobante_url && s3KeyFromUrl(pg.comprobante_url);
                let url = pg.comprobante_url || null;
                if (key) { try { url = await getPresignedUrlEstable(key); } catch (e) { /* queda la guardada */ } }
                return { ...pg, monto: num(pg.monto), comprobante: url };
            }));
            res.json({ ok: true, data: { ...enriquecer(rows[0]), evidencias: await firmar(leerEvidencias(ev[0] && ev[0].evidencias_json)), pagos: pagosFirmados, historial: hist } });
        } catch (err) { responder(res, err, 'detalle'); }
    });

    // ── Crear y editar ─────────────────────────────────────────────────────────────────────────
    /**
     * Normaliza lo que llega y completa lo que falte con los catálogos: la infracción trae su descripción, gravedad, puntos y multa;
     * la entidad trae los plazos (descargo, descuento y pago) contados desde la notificación (o desde la infracción) y el descuento.
     */
    async function normalizar(p, b, previo) {
        const d = {};
        const ent = String(b.entidad_codigo ?? (previo && previo.entidad_codigo) ?? '').trim().toUpperCase();
        if (!ent) throw aviso('Elige la entidad que impuso la papeleta.');
        const [entRows] = await p.query('SELECT * FROM papeletas_entidades WHERE codigo = ?', [ent]);
        if (!entRows.length) throw aviso(`La entidad ${ent} no existe en el catálogo.`);
        const entidad = entRows[0];
        d.entidad_codigo = ent;
        d.entidad_otra = ent === 'OTRA' ? texto(b.entidad_otra, 200) : null;
        if (ent === 'OTRA' && !d.entidad_otra) throw aviso('Escribe el nombre de la entidad.');

        d.tipo_documento = TIPOS_DOC.includes(String(b.tipo_documento || '').toUpperCase()) ? String(b.tipo_documento).toUpperCase() : 'PAPELETA';
        d.numero = texto(b.numero, 60);
        if (!d.numero) throw aviso('Escribe el número del documento.');

        const fi = String(b.fecha_infraccion || '').replace('T', ' ').slice(0, 16);
        if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(fi)) throw aviso('Indica la fecha de la infracción.');
        d.fecha_infraccion = fi.length === 10 ? `${fi} 00:00:00` : `${fi}:00`;
        if (d.fecha_infraccion.slice(0, 10) > hoyLima()) throw aviso('La fecha de la infracción no puede ser futura.');
        d.departamento = texto(b.departamento, 60);
        d.lugar = texto(b.lugar, 300);
        d.agente = texto(b.agente, 150);

        d.placa = String(b.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
        if (d.placa.length < 5) throw aviso('Indica la placa de la unidad.');
        d.empresa_unidad = texto(b.empresa_unidad, 150);
        d.conductor_nombre = texto(b.conductor_nombre, 150);
        d.conductor_dni = String(b.conductor_dni || '').replace(/\D/g, '').slice(0, 15) || null;
        d.licencia = texto(b.licencia, 30);

        // Infracción del catálogo: completa lo que no se escribió
        let inf = null;
        const codInf = texto(b.infraccion_codigo, 30);
        d.infraccion_codigo = codInf ? codInf.toUpperCase() : null;
        if (d.infraccion_codigo) {
            const [i] = await p.query('SELECT * FROM papeletas_infracciones WHERE codigo = ? AND activo = 1 AND entidad_codigo IN (?, \'\') ORDER BY (entidad_codigo = ?) DESC LIMIT 1', [d.infraccion_codigo, ent, ent]);
            inf = i[0] || null;
        }
        d.infraccion_desc = texto(b.infraccion_desc, 500) || (inf ? inf.descripcion : null);
        const grav = String(b.gravedad || '').toUpperCase();
        d.gravedad = GRAVEDADES.includes(grav) ? grav : (inf ? inf.gravedad : null);
        d.puntos = b.puntos === '' || b.puntos == null ? (inf ? inf.puntos : null) : Math.max(0, Math.round(num(b.puntos)));
        d.medida = texto(b.medida, 200) || (inf ? inf.medida : null);

        d.moneda = String(b.moneda || 'PEN').toUpperCase() === 'USD' ? 'USD' : 'PEN';
        let monto = b.monto === '' || b.monto == null ? null : num(b.monto);
        if (monto == null && inf) {
            if (num(inf.multa_soles) > 0) monto = num(inf.multa_soles);
            else if (num(inf.multa_uit) > 0) {
                const [c] = await p.query("SELECT valor FROM papeletas_config WHERE clave = 'uit_valor'");
                const uit = c.length ? num(c[0].valor) : 0;
                if (uit > 0) monto = redondear(num(inf.multa_uit) * uit);
            }
        }
        d.monto = Math.max(0, redondear(monto || 0));
        d.recargos = Math.max(0, redondear(num(b.recargos)));

        // Plazos desde la notificación (o desde la infracción) con los días de la entidad
        d.fecha_notificacion = fechaOpc(b.fecha_notificacion);
        const base = d.fecha_notificacion || d.fecha_infraccion.slice(0, 10);
        const plazo = (campo, dias) => fechaOpc(b[campo]) || (dias != null && dias !== '' ? sumarDias(base, dias) : null);
        d.fecha_limite_descargo = plazo('fecha_limite_descargo', entidad.dias_descargo);
        d.fecha_limite_pago = plazo('fecha_limite_pago', entidad.dias_pago);
        d.fecha_limite_descuento = plazo('fecha_limite_descuento', entidad.dias_descuento);
        let descuento = b.descuento_monto === '' || b.descuento_monto == null ? null : num(b.descuento_monto);
        if (descuento == null) descuento = entidad.pct_descuento != null && d.fecha_limite_descuento ? redondear(d.monto * num(entidad.pct_descuento) / 100) : 0;
        d.descuento_monto = Math.min(Math.max(0, descuento), d.monto);
        if (!d.descuento_monto) d.fecha_limite_descuento = null; // sin descuento no hay fecha límite de descuento

        d.quien_asume = QUIEN_ASUME.includes(String(b.quien_asume || '').toUpperCase()) ? String(b.quien_asume).toUpperCase() : 'EMPRESA';
        d.asume_nombre = texto(b.asume_nombre, 150) || (d.quien_asume === 'CONDUCTOR' ? d.conductor_nombre : (d.quien_asume === 'EMPRESA' ? d.empresa_unidad : null));
        d.observaciones = texto(b.observaciones, 4000);
        return d;
    }

    router.post('/papeletas', async (req, res) => {
        try {
            const p = P(req);
            const d = await normalizar(p, req.body || {}, null);
            const [dup] = await p.query('SELECT codigo FROM papeletas WHERE entidad_codigo = ? AND numero = ?', [d.entidad_codigo, d.numero]);
            if (dup.length) throw aviso(`Ya está registrada: ${dup[0].codigo} tiene el mismo número (${d.numero}) de esa entidad.`, 409);
            const usuario = usuarioDe(req);
            const codigo = await siguienteCodigo(p);
            const [r] = await p.query('INSERT INTO papeletas SET ?', [{ ...d, codigo, estado: 'PENDIENTE', creado_por: usuario }]);
            await historial(p, r.insertId, 'REGISTRÓ', `${d.tipo_documento} N° ${d.numero} · ${d.entidad_codigo} · ${d.placa} · ${d.moneda} ${d.monto}`, usuario);
            res.json({ ok: true, id: r.insertId, codigo });
        } catch (err) { responder(res, err, 'crear'); }
    });

    router.put('/papeletas/:id', async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const [prev] = await p.query('SELECT * FROM papeletas WHERE id = ?', [id]);
            if (!prev.length) throw aviso('Papeleta no encontrada.', 404);
            if (prev[0].estado === 'ANULADA') throw aviso('Una papeleta anulada no se edita.', 409);
            const d = await normalizar(p, req.body || {}, prev[0]);
            const [dup] = await p.query('SELECT codigo FROM papeletas WHERE entidad_codigo = ? AND numero = ? AND id <> ?', [d.entidad_codigo, d.numero, id]);
            if (dup.length) throw aviso(`${dup[0].codigo} ya tiene ese número de esa entidad.`, 409);
            await p.query('UPDATE papeletas SET ? WHERE id = ?', [d, id]);
            await historial(p, id, 'EDITÓ', 'Se modificaron los datos de la papeleta', usuarioDe(req));
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'editar'); }
    });

    // Carga masiva (Excel): cada fila pasa por las mismas reglas que un registro manual; las repetidas se omiten
    router.post('/papeletas/importar-masivo', async (req, res) => {
        try {
            const filas = Array.isArray(req.body && req.body.filas) ? req.body.filas.slice(0, 3000) : [];
            if (!filas.length) throw aviso('No hay filas para importar.');
            const p = P(req);
            const usuario = usuarioDe(req);
            let insertadas = 0, repetidas = 0; const errores = [];
            for (let i = 0; i < filas.length; i++) {
                try {
                    const f = filas[i] || {};
                    const d = await normalizar(p, { ...f, entidad_codigo: String(f.entidad_codigo || '').toUpperCase() }, null);
                    const [dup] = await p.query('SELECT id FROM papeletas WHERE entidad_codigo = ? AND numero = ?', [d.entidad_codigo, d.numero]);
                    if (dup.length) { repetidas++; continue; }
                    const codigo = await siguienteCodigo(p);
                    const estado = ['PAGADA', 'ANULADA', 'EN_DESCARGO'].includes(String(f.estado || '').toUpperCase()) ? String(f.estado).toUpperCase() : 'PENDIENTE';
                    const [r] = await p.query('INSERT INTO papeletas SET ?', [{ ...d, codigo, estado, creado_por: usuario }]);
                    await historial(p, r.insertId, 'IMPORTÓ', `Cargada desde Excel (estado ${estado})`, usuario);
                    // Una papeleta que ya venía pagada se carga con su pago, para que el saldo salga en cero
                    if (estado === 'PAGADA') {
                        const total = redondear(d.monto + d.recargos - (d.descuento_monto && d.fecha_limite_descuento && fechaOpc(f.fecha_pago) && fechaOpc(f.fecha_pago) <= d.fecha_limite_descuento ? d.descuento_monto : 0));
                        await p.query('INSERT INTO papeletas_pagos (papeleta_id, fecha, monto, medio, nro_operacion, pagado_por, observacion, registrado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                            [r.insertId, fechaOpc(f.fecha_pago) || hoyLima(), num(f.monto_pagado) > 0 ? num(f.monto_pagado) : total, texto(f.medio_pago, 40), texto(f.nro_operacion, 80), texto(f.pagado_por, 150), 'Pago cargado desde Excel', usuario]);
                    }
                    insertadas++;
                } catch (err) { errores.push({ fila: i + 2, error: err.message }); }
            }
            res.json({ ok: true, insertadas, repetidas, errores });
        } catch (err) { responder(res, err, 'importar'); }
    });

    // ── Descargo, anulación y reembolso ──────────────────────────────────────────────────────────
    router.post('/papeletas/:id/descargo', async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const [prev] = await p.query('SELECT estado FROM papeletas WHERE id = ?', [id]);
            if (!prev.length) throw aviso('Papeleta no encontrada.', 404);
            if (['ANULADA', 'PAGADA'].includes(prev[0].estado)) throw aviso(`No se puede registrar un descargo en una papeleta ${prev[0].estado === 'PAGADA' ? 'pagada' : 'anulada'}.`, 409);
            const b = req.body || {};
            const resultado = ['PENDIENTE', 'FUNDADO', 'INFUNDADO'].includes(String(b.resultado || '').toUpperCase()) ? String(b.resultado).toUpperCase() : 'PENDIENTE';
            const expediente = texto(b.expediente, 80);
            if (!expediente) throw aviso('Escribe el número de expediente del descargo.');
            const fecha = fechaOpc(b.fecha) || hoyLima();
            // Fundado: la papeleta queda sin efecto. Infundado: vuelve a pendiente de pago. Pendiente: en descargo.
            const estado = resultado === 'FUNDADO' ? 'ANULADA' : resultado === 'INFUNDADO' ? 'PENDIENTE' : 'EN_DESCARGO';
            await p.query('UPDATE papeletas SET estado = ?, descargo_fecha = ?, descargo_expediente = ?, descargo_resultado = ?, anulada_motivo = ? WHERE id = ?',
                [estado, fecha, expediente, resultado, resultado === 'FUNDADO' ? 'Descargo fundado: queda sin efecto' : null, id]);
            await historial(p, id, 'DESCARGO', `Expediente ${expediente} · resultado ${resultado.toLowerCase()}${texto(b.observacion, 300) ? ` · ${texto(b.observacion, 300)}` : ''}`, usuarioDe(req));
            res.json({ ok: true, estado });
        } catch (err) { responder(res, err, 'descargo'); }
    });

    router.post('/papeletas/:id/anular', async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const motivo = texto(req.body && req.body.motivo, 300);
            if (!motivo) throw aviso('Escribe el motivo de la anulación.');
            const [prev] = await p.query('SELECT estado FROM papeletas WHERE id = ?', [id]);
            if (!prev.length) throw aviso('Papeleta no encontrada.', 404);
            if (prev[0].estado === 'ANULADA') throw aviso('Ya está anulada.', 409);
            const [pg] = await p.query('SELECT COUNT(*) AS n FROM papeletas_pagos WHERE papeleta_id = ?', [id]);
            if (Number(pg[0].n) > 0) throw aviso('Tiene pagos registrados. Quita primero los pagos (o regístrala como pagada).', 409);
            await p.query("UPDATE papeletas SET estado = 'ANULADA', anulada_motivo = ? WHERE id = ?", [motivo, id]);
            await historial(p, id, 'ANULÓ', motivo, usuarioDe(req));
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'anular'); }
    });

    router.post('/papeletas/:id/reactivar', async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const [r] = await p.query("UPDATE papeletas SET estado = 'PENDIENTE', anulada_motivo = NULL WHERE id = ? AND estado = 'ANULADA'", [id]);
            if (!r.affectedRows) throw aviso('Solo se reactiva una papeleta anulada.', 409);
            await historial(p, id, 'REACTIVÓ', 'Volvió a pendiente', usuarioDe(req));
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'reactivar'); }
    });

    router.post('/papeletas/:id/reembolso', async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const monto = num(req.body && req.body.monto);
            if (!(monto > 0)) throw aviso('Indica el monto que reembolsó el conductor.');
            const fecha = fechaOpc(req.body && req.body.fecha) || hoyLima();
            const [r] = await p.query('UPDATE papeletas SET reembolso_fecha = ?, reembolso_monto = ? WHERE id = ?', [fecha, monto, id]);
            if (!r.affectedRows) throw aviso('Papeleta no encontrada.', 404);
            await historial(p, id, 'REEMBOLSO', `El conductor reembolsó ${monto} el ${fecha}`, usuarioDe(req));
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'reembolso'); }
    });

    router.delete('/papeletas/:id', async (req, res) => {
        try {
            if (!esAdmin(req)) throw aviso('Solo un administrador puede eliminar una papeleta. Puedes anularla.', 403);
            const p = P(req);
            const id = Number(req.params.id);
            const [pg] = await p.query('SELECT COUNT(*) AS n FROM papeletas_pagos WHERE papeleta_id = ?', [id]);
            if (Number(pg[0].n) > 0) throw aviso('Tiene pagos registrados: no se puede eliminar.', 409);
            const [ev] = await p.query('SELECT evidencias_json FROM papeletas WHERE id = ?', [id]);
            const [r] = await p.query('DELETE FROM papeletas WHERE id = ?', [id]);
            if (!r.affectedRows) throw aviso('Papeleta no encontrada.', 404);
            await p.query('DELETE FROM papeletas_historial WHERE papeleta_id = ?', [id]);
            for (const u of leerEvidencias(ev[0] && ev[0].evidencias_json)) { const k = s3KeyFromUrl(u); if (k) await deleteFromS3(k).catch(() => { }); }
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'eliminar'); }
    });

    // ── Evidencias (fotos de la papeleta, de la foto-detección, del descargo…) ──────────────────────
    router.post('/papeletas/:id/evidencias', upload.array('fotos', 20), async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const archivos = (req.files || []).filter(f => /^(image\/|application\/pdf)/.test(f.mimetype));
            if (!archivos.length) throw aviso('Adjunta al menos una imagen o PDF.');
            const [fila] = await p.query('SELECT evidencias_json FROM papeletas WHERE id = ?', [id]);
            if (!fila.length) throw aviso('Papeleta no encontrada.', 404);
            const marca = Date.now();
            const nuevas = await Promise.all(archivos.map((a, i) => {
                const ext = (String(a.originalname || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
                return uploadToS3(a.buffer, `flota/papeletas/${id}/${marca}_${i + 1}.${ext}`, a.mimetype);
            }));
            const todas = [...leerEvidencias(fila[0].evidencias_json), ...nuevas];
            await p.query('UPDATE papeletas SET evidencias_json = ? WHERE id = ?', [JSON.stringify(todas), id]);
            await historial(p, id, 'EVIDENCIA', `Se agregaron ${nuevas.length} archivo(s)`, usuarioDe(req));
            res.json({ ok: true, evidencias: await firmar(todas) });
        } catch (err) { responder(res, err, 'evidencias+'); }
    });

    router.delete('/papeletas/:id/evidencias', async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const quitar = String((req.body && req.body.key) || '');
            const [fila] = await p.query('SELECT evidencias_json FROM papeletas WHERE id = ?', [id]);
            if (!fila.length) throw aviso('Papeleta no encontrada.', 404);
            const actuales = leerEvidencias(fila[0].evidencias_json);
            if (!actuales.includes(quitar)) throw aviso('Ese archivo no pertenece a la papeleta.', 404);
            const restantes = actuales.filter(u => u !== quitar);
            await p.query('UPDATE papeletas SET evidencias_json = ? WHERE id = ?', [JSON.stringify(restantes), id]);
            const k = s3KeyFromUrl(quitar);
            if (k) await deleteFromS3(k).catch(() => { });
            await historial(p, id, 'EVIDENCIA', 'Se quitó un archivo', usuarioDe(req));
            res.json({ ok: true, evidencias: await firmar(restantes) });
        } catch (err) { responder(res, err, 'evidencias-'); }
    });

    // ── Pagos ────────────────────────────────────────────────────────────────────────────────────
    router.post('/papeletas/:id/pagos', upload.single('comprobante'), async (req, res) => {
        try {
            const p = P(req);
            const id = Number(req.params.id);
            const b = req.body || {};
            const [rows] = await p.query(`${SQL_LISTA} WHERE p.id = ?`, [id]);
            if (!rows.length) throw aviso('Papeleta no encontrada.', 404);
            const pap = rows[0];
            if (pap.estado === 'ANULADA') throw aviso('No se registran pagos en una papeleta anulada.', 409);
            const fecha = fechaOpc(b.fecha) || hoyLima();
            if (fecha > hoyLima()) throw aviso('La fecha del pago no puede ser futura.');
            const monto = redondear(num(b.monto));
            if (!(monto > 0)) throw aviso('Indica el monto pagado.');
            if (!texto(b.nro_operacion, 80) && !req.file) throw aviso('Adjunta el comprobante o escribe el número de operación: todo pago necesita su respaldo.');

            // El descuento cuenta si el pago es hasta su fecha límite
            const descuentoAplica = num(pap.descuento_monto) > 0 && !!pap.fecha_limite_descuento && fecha <= pap.fecha_limite_descuento;
            const totalEnFecha = redondear(num(pap.monto) + num(pap.recargos) - (descuentoAplica ? num(pap.descuento_monto) : 0));
            const saldo = redondear(totalEnFecha - num(pap.pagado));
            if (monto > saldo + 0.01) throw aviso(`El pago (${monto}) supera lo que falta (${Math.max(0, saldo)}).`);

            let comprobante = null;
            if (req.file) {
                const ext = (String(req.file.originalname || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
                comprobante = await uploadToS3(req.file.buffer, `flota/papeletas/${id}/pago_${Date.now()}.${ext}`, req.file.mimetype);
            }
            const usuario = usuarioDe(req);
            const [ins] = await p.query(
                'INSERT INTO papeletas_pagos (papeleta_id, fecha, monto, medio, nro_operacion, comprobante_url, pagado_por, observacion, registrado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, fecha, monto, texto(b.medio, 40), texto(b.nro_operacion, 80), comprobante, texto(b.pagado_por, 150), texto(b.observacion, 300), usuario]);

            const pagadoTotal = redondear(num(pap.pagado) + monto);
            const completa = pagadoTotal >= totalEnFecha - 0.01;
            if (completa) await p.query("UPDATE papeletas SET estado = 'PAGADA' WHERE id = ?", [id]);
            await historial(p, id, 'PAGO', `${pap.moneda} ${monto} · ${texto(b.medio, 40) || 'sin medio'}${descuentoAplica ? ' · con descuento' : ''}${completa ? ' · cancelada' : ' · pago parcial'}`, usuario);

            // Egreso en Caja de Tesorería: el pago queda también en sus movimientos
            let avisoCaja = null;
            if (b.generar_egreso === '1' || b.generar_egreso === 1 || b.generar_egreso === true || b.generar_egreso === 'true') {
                try {
                    const serie = hoyLima().slice(0, 4);
                    const [u] = await p.query('SELECT numero FROM tesoreria_caja WHERE serie = ? ORDER BY id DESC LIMIT 1', [serie]);
                    let n = 1;
                    if (u.length && u[0].numero) { const m = /\d+$/.exec(u[0].numero); if (m) n = parseInt(m[0], 10) + 1; }
                    const entNombre = pap.entidad_codigo === 'OTRA' ? (pap.entidad_otra || 'Otra entidad') : (pap.entidad_nombre || pap.entidad_codigo);
                    const [caja] = await p.query(
                        `INSERT INTO tesoreria_caja (fecha, hora, fecha_valuta, hora_valuta, numero_constancia_deposito, serie, numero, conductor, placa, autoriza, motivo, sub_motivo,
                            modalidad_pago, moneda, tipo_persona, persona, tipo_movimiento, subtotal, retencion_detraccion, importe_total, tipo_cambio, descripcion, voucher_url, estado, usuario_creacion)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Papeletas y multas', ?, ?, ?, 'ENTIDAD', ?, 'EGRESO', ?, 0, ?, 1, ?, ?, 'REGISTRADO', ?)`,
                        [fecha, new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Lima' }), fecha, '00:00:00', texto(b.nro_operacion, 80) || '', serie, String(n).padStart(8, '0'),
                            pap.conductor_nombre || '', pap.placa, usuario, pap.entidad_codigo, texto(b.medio, 40) || 'TRANSFERENCIA', pap.moneda === 'USD' ? 'USD' : 'SOLES', entNombre.slice(0, 190),
                            monto, monto, `Pago de papeleta ${pap.codigo} (${pap.tipo_documento} N° ${pap.numero}) · placa ${pap.placa}`, comprobante, usuario]);
                    await p.query('UPDATE papeletas_pagos SET caja_id = ? WHERE id = ?', [caja.insertId, ins.insertId]);
                } catch (e) {
                    console.error('[papeletas] egreso en caja:', e.message);
                    avisoCaja = 'El pago se registró, pero no se pudo crear el egreso en Caja. Regístralo desde Tesorería.';
                }
            }
            res.json({ ok: true, completa, aviso: avisoCaja });
        } catch (err) { responder(res, err, 'pago'); }
    });

    router.delete('/papeletas/:id/pagos/:pagoId', async (req, res) => {
        try {
            if (!esAdmin(req)) throw aviso('Solo un administrador puede quitar un pago.', 403);
            const p = P(req);
            const id = Number(req.params.id);
            const [pg] = await p.query('SELECT * FROM papeletas_pagos WHERE id = ? AND papeleta_id = ?', [Number(req.params.pagoId), id]);
            if (!pg.length) throw aviso('Pago no encontrado.', 404);
            if (pg[0].caja_id) throw aviso('Este pago tiene un egreso en Caja. Anula primero ese egreso en Tesorería.', 409);
            await p.query('DELETE FROM papeletas_pagos WHERE id = ?', [pg[0].id]);
            await p.query("UPDATE papeletas SET estado = 'PENDIENTE' WHERE id = ? AND estado = 'PAGADA'", [id]);
            await historial(p, id, 'PAGO QUITADO', `Se quitó el pago de ${pg[0].monto}`, usuarioDe(req));
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'pago-'); }
    });

    // PDF (ficha de una papeleta o reporte): el cliente arma el HTML y el servidor lo convierte con Chromium (texto real). No guarda nada.
    router.post('/papeletas/pdf', async (req, res) => {
        const html = typeof (req.body && req.body.html) === 'string' ? req.body.html : '';
        if (!html.includes('<html')) return res.status(400).json({ ok: false, error: 'Documento no válido' });
        try {
            const { htmlAPdf } = require('../services/ot_pdf');
            const pdf = await htmlAPdf(html, String(req.body.titulo || 'Papeletas').slice(0, 150), req.body.horizontal === true, req.body.unaHoja === true);
            res.set('Content-Type', 'application/pdf').send(Buffer.from(pdf));
        } catch (err) { responder(res, err, 'pdf'); }
    });

    return router;
};
