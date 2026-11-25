// Telemetría CAN Bus por viaje/placa
// Persiste los datos de GPS/CAN en MySQL para no llamar a Wialon en cada visita.
// El botón "Consultar CAN (GPS)" del frontend usa POST /api/telemetria/guardar.
// Lecturas posteriores usan GET /api/telemetria/:placa.

const express = require('express');
const { listarGeocercas } = require('../services/wialon_geocercas');
const { hoyLima } = require('../services/horaLima');
const { sensoresEnMensaje, direccionDe } = require('../services/wialon_mensaje');

module.exports = function(db) {
    const router = express.Router();

    function getDb(req) { return req.db || db; }

    // ── GET /api/telemetria/geocercas — geocercas de Wialon para dibujar en el mapa (en memoria 1 h) ─
    router.get('/geocercas', async (req, res) => {
        const r = await listarGeocercas(getDb(req), req.tenantSlug || (req.tenantInfo && req.tenantInfo.db_name) || 'default');
        if (!r.ok) return res.status(502).json({ error: r.error });
        res.json({ geocercas: r.geocercas });
    });

    // ── GET /api/telemetria/sensores-mensaje?unitId=&t= — sensores de la unidad en un instante del recorrido (panel del Track player) ─
    router.get('/sensores-mensaje', async (req, res) => {
        const r = await sensoresEnMensaje(getDb(req), req.query.unitId, req.query.t);
        if (!r.ok) return res.status(502).json({ error: r.error });
        res.json(r);
    });

    // ── GET /api/telemetria/direccion?lat=&lng= — dirección del punto (debajo de la hora en el reproductor) ─
    router.get('/direccion', async (req, res) => {
        const d = await direccionDe(getDb(req), req.query.lat, req.query.lng);
        res.json({ direccion: d });
    });

    // ── GET /api/telemetria/streetview?lat=&lng=&heading= — foto de la calle (Google Street View Static) ─
    // La clave vive solo en el servidor (GOOGLE_MAPS_KEY). Antes de pedir la foto se consulta el metadato (gratis) para no pagar donde no hay
    // cobertura; las fotos se guardan en memoria y hay un tope diario (STREETVIEW_LIMITE_DIARIO, 800 por defecto) para cuidar el gasto.
    const svCache = new Map();           // clave → { tipo: 'img'|'no', buf }
    let svDia = { dia: '', n: 0 };
    router.get('/streetview', async (req, res) => {
        const clave = process.env.GOOGLE_MAPS_KEY || '';
        if (!clave) return res.status(501).json({ error: 'sin_clave' });
        const lat = Number(req.query.lat), lng = Number(req.query.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ error: 'Coordenadas no válidas' });
        const rumbo = ((Math.round((Number(req.query.heading) || 0) / 15) * 15) % 360 + 360) % 360;
        const ancho = Math.min(640, Math.max(200, parseInt(req.query.w, 10) || 480)), alto = Math.min(640, Math.max(150, parseInt(req.query.h, 10) || 300));
        const k = `${lat.toFixed(5)}|${lng.toFixed(5)}|${rumbo}|${ancho}x${alto}`;
        const guardada = svCache.get(k);
        const enviar = (c) => {
            if (c.tipo === 'no') return res.status(404).json({ error: 'sin_cobertura' });
            res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' }).send(c.buf);
        };
        if (guardada) return enviar(guardada);
        const hoy = hoyLima();
        if (svDia.dia !== hoy) svDia = { dia: hoy, n: 0 };
        const tope = parseInt(process.env.STREETVIEW_LIMITE_DIARIO || '800', 10);
        if (svDia.n >= tope) return res.status(429).json({ error: 'limite_diario' });
        try {
            const meta = await (await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&radius=50&source=outdoor&key=${encodeURIComponent(clave)}`, { signal: AbortSignal.timeout(8000) })).json();
            let c;
            if (!meta || meta.status !== 'OK') {
                c = { tipo: 'no' };
            } else {
                svDia.n++;
                const r = await fetch(`https://maps.googleapis.com/maps/api/streetview?size=${ancho}x${alto}&location=${lat},${lng}&heading=${rumbo}&fov=90&pitch=0&radius=50&source=outdoor&key=${encodeURIComponent(clave)}`, { signal: AbortSignal.timeout(10000) });
                if (!r.ok) return res.status(502).json({ error: 'Google no respondió' });
                c = { tipo: 'img', buf: Buffer.from(await r.arrayBuffer()) };
            }
            svCache.set(k, c);
            if (svCache.size > 400) svCache.delete(svCache.keys().next().value);
            enviar(c);
        } catch (err) { res.status(502).json({ error: 'No se pudo obtener la foto de la calle' }); }
    });

    // ── GET /api/telemetria — resumen de todas las placas (última entrada por placa) ─
    router.get('/', async (req, res) => {
        try {
            const tdb = getDb(req);
            const { placa } = req.query;
            let sql = `
                SELECT t.*
                FROM telemetria_can t
                INNER JOIN (
                    SELECT placa, MAX(fecha) AS ultima_fecha
                    FROM telemetria_can
                    GROUP BY placa
                ) m ON t.placa = m.placa AND t.fecha = m.ultima_fecha
            `;
            const params = [];
            if (placa) {
                sql = `SELECT * FROM telemetria_can WHERE placa = ? ORDER BY fecha DESC LIMIT 30`;
                params.push(String(placa).toUpperCase());
            }
            const [rows] = await tdb.promise().query(sql, params);
            res.json(rows || []);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/telemetria/:placa — historial de una placa ──────────────────────
    router.get('/:placa', async (req, res) => {
        try {
            const tdb = getDb(req);
            const placa = String(req.params.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const limit = Math.min(parseInt(req.query.limit || '30', 10), 90);
            const [rows] = await tdb.promise().query(
                'SELECT * FROM telemetria_can WHERE placa=? ORDER BY fecha DESC LIMIT ?',
                [placa, limit]
            );
            res.json(rows || []);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/telemetria/guardar — guarda/actualiza snapshot CAN ─────────────
    // Body: { placa, fecha?, recorrido_km, horas_motor, velocidad_max, consumo_ralenti,
    //         combustible_con, rendimiento, lat_ultimo, lng_ultimo, estado_motor, raw_json }
    router.post('/guardar', async (req, res) => {
        try {
            const tdb = getDb(req);
            const b = req.body || {};
            const placa = String(b.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (!placa) return res.status(400).json({ error: 'placa requerida' });

            const fecha = b.fecha || hoyLima();
            const raw = b.raw_json ? JSON.stringify(b.raw_json) : null;

            await tdb.promise().query(`
                INSERT INTO telemetria_can
                    (placa, fecha, recorrido_km, horas_motor, velocidad_max, consumo_ralenti,
                     combustible_con, rendimiento, lat_ultimo, lng_ultimo, estado_motor, raw_json, synced_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())
                ON DUPLICATE KEY UPDATE
                    recorrido_km    = VALUES(recorrido_km),
                    horas_motor     = VALUES(horas_motor),
                    velocidad_max   = VALUES(velocidad_max),
                    consumo_ralenti = VALUES(consumo_ralenti),
                    combustible_con = VALUES(combustible_con),
                    rendimiento     = VALUES(rendimiento),
                    lat_ultimo      = VALUES(lat_ultimo),
                    lng_ultimo      = VALUES(lng_ultimo),
                    estado_motor    = VALUES(estado_motor),
                    raw_json        = VALUES(raw_json),
                    synced_at       = NOW()
            `, [
                placa, fecha,
                b.recorrido_km ?? b.km ?? null,
                b.horas_motor ?? b.horas ?? null,
                b.velocidad_max ?? null,
                b.consumo_ralenti ?? null,
                b.combustible_con ?? null,
                b.rendimiento ?? null,
                b.lat_ultimo ?? b.lat ?? null,
                b.lng_ultimo ?? b.lng ?? null,
                b.estado_motor ?? null,
                raw
            ]);

            res.json({ ok: true, placa, fecha });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/telemetria/guardar-lote — guarda múltiples vehículos a la vez ──
    // Body: { items: [{ placa, recorrido_km, horas_motor, ... }] }
    router.post('/guardar-lote', async (req, res) => {
        try {
            const tdb = getDb(req);
            const items = Array.isArray(req.body?.items) ? req.body.items : [];
            if (!items.length) return res.json({ ok: true, guardados: 0 });

            const fecha = hoyLima();
            let guardados = 0;

            for (const b of items) {
                const placa = String(b.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (!placa) continue;
                const raw = b.raw_json ? JSON.stringify(b.raw_json) : null;
                await tdb.promise().query(`
                    INSERT INTO telemetria_can
                        (placa, fecha, recorrido_km, horas_motor, velocidad_max, consumo_ralenti,
                         combustible_con, rendimiento, lat_ultimo, lng_ultimo, estado_motor, raw_json, synced_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())
                    ON DUPLICATE KEY UPDATE
                        recorrido_km    = VALUES(recorrido_km),
                        horas_motor     = VALUES(horas_motor),
                        velocidad_max   = VALUES(velocidad_max),
                        consumo_ralenti = VALUES(consumo_ralenti),
                        combustible_con = VALUES(combustible_con),
                        rendimiento     = VALUES(rendimiento),
                        lat_ultimo      = VALUES(lat_ultimo),
                        lng_ultimo      = VALUES(lng_ultimo),
                        estado_motor    = VALUES(estado_motor),
                        raw_json        = VALUES(raw_json),
                        synced_at       = NOW()
                `, [
                    placa, b.fecha || fecha,
                    b.recorrido_km ?? b.km ?? null,
                    b.horas_motor ?? b.horas ?? null,
                    b.velocidad_max ?? null,
                    b.consumo_ralenti ?? null,
                    b.combustible_con ?? null,
                    b.rendimiento ?? null,
                    b.lat_ultimo ?? b.lat ?? null,
                    b.lng_ultimo ?? b.lng ?? null,
                    b.estado_motor ?? null,
                    raw
                ]);
                guardados++;
            }

            res.json({ ok: true, guardados });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
