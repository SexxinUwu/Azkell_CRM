// Endpoints de los avisos en el teléfono (Web Push). Solo el propio usuario firmado puede activar o quitar sus dispositivos.
const express = require('express');
const push = require('../services/push');

module.exports = (db) => {
    const router = express.Router();
    const tdb = req => req.db || db;

    // Clave pública VAPID para que el navegador cree la suscripción
    router.get('/push/clave', (req, res) => {
        const clave = push.CLAVE_PUBLICA();
        res.json({ ok: !!clave, clave: clave || null });
    });

    router.post('/push/suscribir', async (req, res) => {
        const correo = req.user && req.user.correo;
        const s = req.body && req.body.suscripcion;
        if (!correo) return res.status(401).json({ ok: false, error: 'Sesión sin correo' });
        if (!s || !s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth) {
            return res.status(400).json({ ok: false, error: 'Suscripción incompleta' });
        }
        if (!push.configurar()) return res.status(503).json({ ok: false, error: 'Las notificaciones no están configuradas en el servidor' });
        try {
            await push.guardar(tdb(req), correo, s, req.headers['user-agent']);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    router.post('/push/quitar', async (req, res) => {
        const correo = req.user && req.user.correo;
        const endpoint = req.body && req.body.endpoint;
        if (!correo || !endpoint) return res.status(400).json({ ok: false, error: 'Falta el dispositivo' });
        try {
            await push.quitar(tdb(req), correo, endpoint);
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    router.post('/push/prueba', async (req, res) => {
        const correo = req.user && req.user.correo;
        if (!correo) return res.status(401).json({ ok: false, error: 'Sesión sin correo' });
        const enviados = await push.enviarA(tdb(req), correo, {
            titulo: 'Azkell Fleet',
            cuerpo: 'Las notificaciones de este dispositivo están activas.',
            url: '/app',
            tag: 'prueba',
        });
        res.json({ ok: enviados > 0, enviados });
    });

    return router;
};
