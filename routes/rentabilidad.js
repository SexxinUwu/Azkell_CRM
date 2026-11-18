// Rentabilidad por servicio: ingreso (flete sin IGV) menos los gastos directos del servicio.
//   Ingreso  = flete de la orden de servicio SIN IGV (si «incluye IGV» se divide entre 1.18; «más IGV» y «no aplica» ya vienen sin IGV), en soles (si es en dólares, × tipo de cambio)
//   Gastos   = combustible (vales) + gastos rendidos del viaje + costo del tercero (si lo hizo un tercero; se reparte entre los servicios del viaje)
//   Utilidad = ingreso − gastos        Margen = utilidad ÷ ingreso
// Cada vale y cada gasto rendido lleva el servicio al que pertenece (columna orden_servicio, migración 37_servicio_en_gastos).
const express = require('express');

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = v => Math.round(num(v) * 100) / 100;

module.exports = (db) => {
    const router = express.Router();
    const getDb = req => ((req && req.db) ? req.db : db);
    const P = req => getDb(req).promise();
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[rentabilidad] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: err && err.message ? err.message : 'Error del servidor' });
    };
    const COL = 'COLLATE utf8mb4_unicode_ci';

    /** Ingreso en soles de una orden de servicio (el flete va sin IGV) */
    const ingresoSoles = os => {
        const t = String(os.impuesto || '').toUpperCase();
        const incluyeIgv = !(/NO APLICA|INAFECT|EXONER/.test(t) || /M.S IGV/.test(t)); // por defecto el flete incluye IGV
        const flete = incluyeIgv ? num(os.costo_flete) / 1.18 : num(os.costo_flete);
        const usd = /D[OÓ]L|USD/i.test(String(os.moneda || ''));
        return r2(usd ? flete * (num(os.tipo_cambio) || 1) : flete);
    };

    /** Gastos de varios servicios a la vez: { codigo → { combustible, gastos_viaje, tercero } } */
    async function gastosDe(p, codigos) {
        const out = {};
        codigos.forEach(c => { out[c] = { combustible: 0, gastos_viaje: 0, tercero: 0 }; });
        if (!codigos.length) return out;
        const [vales] = await p.query(`SELECT orden_servicio AS os, COALESCE(SUM(total), 0) AS t FROM viaje_vales_combustible WHERE anulado = 0 AND orden_servicio IN (?) GROUP BY orden_servicio`, [codigos]);
        vales.forEach(v => { if (out[v.os]) out[v.os].combustible = r2(v.t); });
        const [gast] = await p.query(`SELECT orden_servicio AS os, COALESCE(SUM(importe), 0) AS t FROM tesoreria_liquidaciones_gastos WHERE UPPER(estado) <> 'RECHAZADO' AND orden_servicio IN (?) GROUP BY orden_servicio`, [codigos]);
        gast.forEach(g => { if (out[g.os]) out[g.os].gastos_viaje = r2(g.t); });
        // Tercero: el costo del viaje se reparte en partes iguales entre los servicios que lleva
        const [ter] = await p.query(
            `SELECT r.orden AS os, ov.tercero_costo AS costo, ov.tercero_moneda AS moneda,
                    (SELECT COUNT(DISTINCT r2.orden) FROM operaciones_ordenes_viaje_rutas r2 WHERE r2.viaje ${COL} = r.viaje ${COL}) AS n
             FROM operaciones_ordenes_viaje_rutas r
             JOIN operaciones_ordenes_viaje ov ON ov.viaje ${COL} = r.viaje ${COL}
             WHERE r.orden IN (?) AND UPPER(COALESCE(ov.ejecucion, 'PROPIO')) = 'TERCERO' AND COALESCE(ov.tercero_costo, 0) > 0`, [codigos]);
        ter.forEach(t => { if (out[t.os]) out[t.os].tercero = r2(out[t.os].tercero + num(t.costo) / Math.max(1, num(t.n))); });
        return out;
    }

    const resumir = (os, g, km) => {
        const ingreso = ingresoSoles(os);
        const total = r2(g.combustible + g.gastos_viaje + g.tercero);
        const utilidad = r2(ingreso - total);
        return {
            codigo: os.codigo_orden, fecha: os.fecha, cliente: os.cliente_nombre, ruta: os.ruta, es_retorno: !!os.es_retorno, estado: os.estado_servicio,
            ejecucion: os.ejecucion, ingreso, combustible: g.combustible, gastos_viaje: g.gastos_viaje, tercero: g.tercero, gastos: total, utilidad,
            margen: ingreso > 0 ? r2((utilidad / ingreso) * 100) : null, km: km || null, gasto_por_km: km > 0 ? r2(total / km) : null, ingreso_por_km: km > 0 ? r2(ingreso / km) : null,
        };
    };

    // Lista de servicios con su rentabilidad. ?desde ?hasta (fecha del servicio) ?q (cliente, ruta o código)
    router.get('/', async (req, res) => {
        try {
            const p = P(req);
            const cond = ["COALESCE(os.estado_servicio, '') <> 'ANULADO'"]; const par = [];
            if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.desde || ''))) { cond.push('os.fecha >= ?'); par.push(req.query.desde); }
            if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.hasta || ''))) { cond.push('os.fecha <= ?'); par.push(req.query.hasta); }
            const q = String(req.query.q || '').trim();
            if (q) { cond.push('(os.cliente_nombre LIKE ? OR os.ruta LIKE ? OR os.codigo_orden LIKE ?)'); par.push(`%${q}%`, `%${q}%`, `%${q}%`); }
            const [rows] = await p.query(
                `SELECT os.codigo_orden, DATE_FORMAT(os.fecha, '%Y-%m-%d') AS fecha, os.cliente_nombre, os.ruta, os.es_retorno, os.estado_servicio, os.ejecucion, os.moneda, os.tipo_cambio, os.costo_flete, os.impuesto,
                    (SELECT COALESCE(SUM(r.distancia_km), 0) FROM operaciones_ordenes_viaje_rutas r WHERE r.orden ${COL} = os.codigo_orden ${COL}) AS km
                 FROM operaciones_ordenes_servicio os WHERE ${cond.join(' AND ')} ORDER BY os.fecha DESC, os.id DESC LIMIT 600`, par);
            const gastos = await gastosDe(p, rows.map(r => r.codigo_orden));
            res.json({ ok: true, data: rows.map(r => resumir(r, gastos[r.codigo_orden], num(r.km))) });
        } catch (e) { responder(res, e, 'GET /'); }
    });

    // Detalle de un servicio: resumen y cada gasto con su documento
    router.get('/servicio/:codigo', async (req, res) => {
        try {
            const p = P(req);
            const [os] = await p.query(
                `SELECT os.codigo_orden, DATE_FORMAT(os.fecha, '%Y-%m-%d') AS fecha, os.cliente_nombre, os.ruta, os.origen, os.destino, os.es_retorno, os.estado_servicio, os.ejecucion, os.moneda, os.tipo_cambio, os.costo_flete, os.impuesto,
                    (SELECT COALESCE(SUM(r.distancia_km), 0) FROM operaciones_ordenes_viaje_rutas r WHERE r.orden ${COL} = os.codigo_orden ${COL}) AS km
                 FROM operaciones_ordenes_servicio os WHERE os.codigo_orden = ?`, [req.params.codigo]);
            if (!os.length) throw Object.assign(new Error('Servicio no encontrado.'), { status: 404 });
            const s = os[0];
            const g = (await gastosDe(p, [s.codigo_orden]))[s.codigo_orden];
            const [vales] = await p.query(`SELECT codigo, viaje, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, estacion_nombre, combustible, galones, total FROM viaje_vales_combustible WHERE anulado = 0 AND orden_servicio = ? ORDER BY fecha, id`, [s.codigo_orden]);
            const [gast] = await p.query(`SELECT id, orden_viaje AS viaje, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, tipo_gasto, sub_motivo, detalle, proveedor_nombre, importe FROM tesoreria_liquidaciones_gastos WHERE UPPER(estado) <> 'RECHAZADO' AND orden_servicio = ? ORDER BY fecha, id`, [s.codigo_orden]);
            const [viajes] = await p.query(`SELECT r.viaje, ov.ejecucion, ov.tercero_nombre, ov.tercero_costo FROM operaciones_ordenes_viaje_rutas r LEFT JOIN operaciones_ordenes_viaje ov ON ov.viaje ${COL} = r.viaje ${COL} WHERE r.orden = ?`, [s.codigo_orden]);
            // Gastos del mismo viaje que todavía no tienen servicio: avisan que la rentabilidad puede estar incompleta
            let sinAsignar = 0;
            if (viajes.length) {
                const vs = viajes.map(v => v.viaje);
                const [a] = await p.query(`SELECT COUNT(*) n FROM viaje_vales_combustible WHERE anulado = 0 AND orden_servicio IS NULL AND viaje IN (?)`, [vs]);
                const [b] = await p.query(`SELECT COUNT(*) n FROM tesoreria_liquidaciones_gastos WHERE UPPER(estado) <> 'RECHAZADO' AND orden_servicio IS NULL AND orden_viaje IN (?)`, [vs]);
                sinAsignar = num(a[0].n) + num(b[0].n);
            }
            res.json({ ok: true, data: { ...resumir(s, g, num(s.km)), origen: s.origen, destino: s.destino, vales, gastos_rendidos: gast, viajes, sin_asignar: sinAsignar } });
        } catch (e) { responder(res, e, 'GET /servicio/:codigo'); }
    });

    return router;
};
