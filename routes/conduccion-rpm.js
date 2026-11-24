'use strict';
// Operaciones Marsisa › Combustible › Conducción por RPM.
// Consulta a Wialon (informe «10. Detallado de Sensores Para Consumo») cuántas lecturas de cada unidad caen en cada rango de RPM
// según su modelo de motor, para ver cómo maneja el conductor en un viaje o un rango de fechas. Solo lectura en Wialon; solo Marsisa.
// Los rangos por modelo de motor y la meta se guardan en la base y se editan desde la pantalla (conduccion_rpm_rangos / _config).
//
//   GET    /placas            unidades activas con su modelo de motor
//   GET    /rangos            rangos por modelo, rangos generales y meta de reparto
//   PUT    /rangos/:modelo    crea o cambia los rangos de un modelo { limites: [ralentí, bajo torque, zona verde, potencia] }
//   DELETE /rangos/:modelo    quita un modelo (vuelve a usar los rangos generales)
//   PUT    /config            { meta: {bajo, verde, potencia, sobre}, generico: [4 límites] }
//   POST   /analizar          { placa, desde, hasta } (hora de Lima, "AAAA-MM-DDTHH:mm") o { placa, desdeUnix, hastaUnix }
const express = require('express');
const { analizarRpm } = require('../services/wialon_rpm');
const { cargarConfig, invalidar, rangosDe, limitesValidos, clave } = require('../services/rpm_rangos');

module.exports = (db, logAudit) => {
    const router = express.Router();
    const D = req => (req && req.db) ? req.db : db;
    const aviso = (msg, status = 400) => Object.assign(new Error(msg), { status });
    const usuarioDe = req => String((req.user && (req.user.nombre || req.user.correo || req.user.email)) || 'sistema').slice(0, 150);
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        if (err && err.code === 'ER_NO_SUCH_TABLE') return res.status(409).json({ ok: false, error: 'Falta aplicar la actualización de la base de datos de esta empresa.' });
        console.error(`[conduccion-rpm] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo completar la operación.' });
    };
    const auditar = (req, accion, detalle) => { try { if (logAudit) logAudit({ req, accion, modulo: 'OPERACIONES', detalle }); } catch { /* la auditoría no frena la operación */ } };

    // Solo para Marsisa
    router.use((req, res, next) => {
        const slug = String(req.tenantSlug || (req.headers && req.headers['x-tenant-id']) || (req.headers && req.headers.host ? req.headers.host.split('.')[0] : '')).toLowerCase();
        if (slug !== 'marsisa') return res.status(403).json({ ok: false, error: 'Este análisis es solo para Marsisa.' });
        next();
    });

    router.get('/placas', async (req, res) => {
        try {
            const cfg = await cargarConfig(D(req));
            const [rows] = await D(req).promise().query(
                "SELECT placa, tipo, sub_tipo, modelo_motor FROM placas WHERE estado = 'Activa' AND tipo IN ('Tracto', 'Camión', 'Camion', 'Cisterna', 'Furgón', 'Furgon') ORDER BY placa");
            res.json({ ok: true, data: rows.map(r => ({ placa: r.placa, tipo: r.tipo, sub_tipo: r.sub_tipo, modelo_motor: r.modelo_motor || '', modelo_conocido: rangosDe(cfg, r.modelo_motor).conocido })) });
        } catch (err) { responder(res, err, 'placas'); }
    });

    router.get('/rangos', async (req, res) => {
        try {
            const cfg = await cargarConfig(D(req));
            // Cuántas placas activas usan cada modelo (para saber qué modelos de la flota aún no tienen rangos)
            const [uso] = await D(req).promise().query("SELECT UPPER(TRIM(modelo_motor)) AS modelo, COUNT(*) AS n FROM placas WHERE estado = 'Activa' AND modelo_motor IS NOT NULL AND TRIM(modelo_motor) <> '' GROUP BY UPPER(TRIM(modelo_motor))");
            const enUso = new Map(uso.map(u => [clave(u.modelo), Number(u.n)]));
            const data = [...cfg.porModelo.values()].map(r => ({ modelo: r.modelo, limites: r.limites, placas: enUso.get(clave(r.modelo)) || 0 }));
            const sinRangos = uso.filter(u => !cfg.porModelo.has(clave(u.modelo))).map(u => ({ modelo: u.modelo, placas: Number(u.n) }));
            res.json({ ok: true, origen: cfg.origen, meta: cfg.meta, generico: cfg.generico, data, sin_rangos: sinRangos });
        } catch (err) { responder(res, err, 'rangos'); }
    });

    router.put('/rangos/:modelo', async (req, res) => {
        try {
            const modelo = String(req.params.modelo || '').trim().toUpperCase().slice(0, 60);
            if (!modelo) throw aviso('Indica el modelo del motor.');
            const limites = (req.body && Array.isArray(req.body.limites) ? req.body.limites : []).map(Number);
            if (!limitesValidos(limites)) throw aviso('Los cuatro límites deben ser números enteros crecientes (ralentí < bajo torque < zona verde < potencia), hasta 6000 RPM.');
            const usuario = usuarioDe(req);
            // Si ya existe con otra escritura (mayúsculas o espacios distintos), se actualiza esa misma fila
            const cfg = await cargarConfig(D(req));
            const previo = cfg.porModelo.get(clave(modelo));
            const nombre = previo ? previo.modelo : modelo;
            await D(req).promise().query(
                `INSERT INTO conduccion_rpm_rangos (modelo, lim_ralenti, lim_bajo, lim_verde, lim_potencia, actualizado_por) VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE lim_ralenti = VALUES(lim_ralenti), lim_bajo = VALUES(lim_bajo), lim_verde = VALUES(lim_verde), lim_potencia = VALUES(lim_potencia), actualizado_por = VALUES(actualizado_por)`,
                [nombre, ...limites, usuario]);
            invalidar(D(req));
            auditar(req, 'RPM_RANGOS_MODELO', `${nombre}: ${previo ? previo.limites.join('/') : 'nuevo'} → ${limites.join('/')} (por ${usuario})`);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'guardar-rangos'); }
    });

    router.delete('/rangos/:modelo', async (req, res) => {
        try {
            const modelo = String(req.params.modelo || '').trim();
            const [r] = await D(req).promise().query('DELETE FROM conduccion_rpm_rangos WHERE modelo = ?', [modelo]);
            if (!r.affectedRows) throw aviso('Ese modelo no está en la tabla.', 404);
            invalidar(D(req));
            auditar(req, 'RPM_RANGOS_QUITAR', `${modelo} (por ${usuarioDe(req)})`);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'quitar-rangos'); }
    });

    router.put('/config', async (req, res) => {
        try {
            const b = req.body || {};
            const m = b.meta || {};
            const meta = { bajo: Number(m.bajo), verde: Number(m.verde), potencia: Number(m.potencia), sobre: Number(m.sobre) };
            if (![meta.bajo, meta.verde, meta.potencia, meta.sobre].every(v => Number.isFinite(v) && v >= 0 && v <= 100)) throw aviso('La meta debe estar entre 0 y 100.');
            if (Math.round(meta.bajo + meta.verde + meta.potencia) !== 100) throw aviso('Bajo torque, zona verde y potencia deben sumar 100 %.');
            const generico = (Array.isArray(b.generico) ? b.generico : []).map(Number);
            if (!limitesValidos(generico)) throw aviso('Los rangos generales deben ser cuatro enteros crecientes.');
            const usuario = usuarioDe(req);
            const p = D(req).promise();
            const filas = [['meta_bajo', meta.bajo], ['meta_verde', meta.verde], ['meta_potencia', meta.potencia], ['meta_sobre', meta.sobre], ['rangos_generico', generico.join(',')]];
            for (const [k, v] of filas) {
                await p.query('INSERT INTO conduccion_rpm_config (clave, valor, actualizado_por) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_por = VALUES(actualizado_por)', [k, String(v), usuario]);
            }
            invalidar(D(req));
            auditar(req, 'RPM_CONFIG', `Meta ${meta.bajo}/${meta.verde}/${meta.potencia} · sobre ${meta.sobre} · generales ${generico.join('/')} (por ${usuario})`);
            res.json({ ok: true });
        } catch (err) { responder(res, err, 'config'); }
    });

    router.post('/analizar', async (req, res) => {
        try {
            const { placa, desde, hasta, desdeUnix, hastaUnix } = req.body || {};
            const r = await analizarRpm(D(req), { placa, desde, hasta, desdeUnix, hastaUnix });
            res.json(r);
        } catch (err) { responder(res, err, 'analizar'); }
    });

    return router;
};
