'use strict';
// Operaciones Marsisa › Combustible › Conducción por RPM.
// Consulta a Wialon (informe «10. Detallado de Sensores Para Consumo») cuántas lecturas de cada unidad caen en cada rango de RPM
// según su modelo de motor, para ver cómo maneja el conductor en un viaje o un rango de fechas. Solo lectura; solo Marsisa.
//
//   GET  /placas     unidades activas con su modelo de motor
//   GET  /rangos     tabla de rangos por modelo de motor y la meta de reparto
//   POST /analizar   { placa, desde, hasta } (hora de Lima, "AAAA-MM-DDTHH:mm") → conteos y porcentajes por rango
const express = require('express');
const { analizarRpm } = require('../services/wialon_rpm');
const { tablaRangos, rangosDe, META } = require('../services/rpm_rangos');

module.exports = (db) => {
    const router = express.Router();
    const D = req => (req && req.db) ? req.db : db;
    const responder = (res, err, etiqueta) => {
        if (err && err.status) return res.status(err.status).json({ ok: false, error: err.message });
        console.error(`[conduccion-rpm] ${etiqueta}:`, err && err.message);
        return res.status(500).json({ ok: false, error: 'No se pudo completar la operación.' });
    };

    // Solo para Marsisa
    router.use((req, res, next) => {
        const slug = String(req.tenantSlug || (req.headers && req.headers['x-tenant-id']) || (req.headers && req.headers.host ? req.headers.host.split('.')[0] : '')).toLowerCase();
        if (slug !== 'marsisa') return res.status(403).json({ ok: false, error: 'Este análisis es solo para Marsisa.' });
        next();
    });

    router.get('/placas', async (req, res) => {
        try {
            const [rows] = await D(req).promise().query(
                "SELECT placa, tipo, sub_tipo, modelo_motor FROM placas WHERE estado = 'Activa' AND tipo IN ('Tracto', 'Camión', 'Camion', 'Cisterna', 'Furgón', 'Furgon') ORDER BY placa");
            res.json({ ok: true, data: rows.map(r => ({ placa: r.placa, tipo: r.tipo, sub_tipo: r.sub_tipo, modelo_motor: r.modelo_motor || '', modelo_conocido: rangosDe(r.modelo_motor).conocido })) });
        } catch (err) { responder(res, err, 'placas'); }
    });

    router.get('/rangos', (req, res) => res.json({ ok: true, meta: META, data: tablaRangos() }));

    router.post('/analizar', async (req, res) => {
        try {
            const { placa, desde, hasta, desdeUnix, hastaUnix } = req.body || {};
            const r = await analizarRpm(D(req), { placa, desde, hasta, desdeUnix, hastaUnix });
            res.json(r);
        } catch (err) { responder(res, err, 'analizar'); }
    });

    return router;
};
