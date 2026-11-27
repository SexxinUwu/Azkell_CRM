'use strict';
// Herramientas PDF › conversiones que necesitan el servidor (Word, PowerPoint, Excel, HTML ↔ PDF).
// Las demás herramientas trabajan dentro del navegador y no llegan aquí. Los archivos no se guardan: ver services/herramientas_convertir.js
//   GET  /estado      qué conversiones están disponibles en este servidor
//   POST /convertir   multipart: archivo + destino (pdf | docx | pptx | pdf-html) → el archivo convertido
const express = require('express');
const multer = require('multer');
const { convertir, estado, DESTINOS } = require('../services/herramientas_convertir');

const MAX_MB = 50;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 } });

// Tope por persona para que nadie sature el servidor: 30 conversiones por hora
const POR_HORA = 30;
const usos = new Map();
function dentroDelTope(clave) {
    const ahora = Date.now();
    const lista = (usos.get(clave) || []).filter(t => ahora - t < 3600 * 1000);
    if (lista.length >= POR_HORA) { usos.set(clave, lista); return false; }
    lista.push(ahora); usos.set(clave, lista);
    return true;
}

module.exports = (db, logAudit) => {
    const router = express.Router();
    const quien = req => String((req.user && (req.user.id || req.user.correo || req.user.email || req.user.nombre)) || req.ip || 'anonimo');

    router.use((req, res, next) => (req.user ? next() : res.status(401).json({ ok: false, error: 'No autenticado' })));

    router.get('/estado', async (req, res) => {
        try { res.json({ ok: true, ...(await estado()) }); }
        catch (e) { res.status(500).json({ ok: false, error: 'No se pudo consultar el estado.' }); }
    });

    router.post('/convertir', (req, res) => {
        upload.single('archivo')(req, res, async errSubida => {
            if (errSubida) return res.status(errSubida.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ ok: false, error: errSubida.code === 'LIMIT_FILE_SIZE' ? `El archivo pesa más de ${MAX_MB} MB.` : 'No se pudo recibir el archivo.' });
            try {
                const destino = String((req.body && req.body.destino) || '');
                if (!DESTINOS[destino]) return res.status(400).json({ ok: false, error: 'Conversión no disponible.' });
                if (!req.file) return res.status(400).json({ ok: false, error: 'Adjunta un archivo.' });
                if (!dentroDelTope(quien(req))) return res.status(429).json({ ok: false, error: `Llegaste al tope de ${POR_HORA} conversiones por hora. Intenta más tarde.` });
                const r = await convertir({ buffer: req.file.buffer, nombre: req.file.originalname, destino });
                // Solo se deja constancia del tipo de conversión (no del nombre ni del contenido del archivo)
                if (typeof logAudit === 'function') { try { logAudit(req, 'herramientas', 'CONVIRTIÓ', `/herramientas/convertir ${destino}`); } catch (e) { /* la auditoría no debe frenar la conversión */ } }
                res.set({ 'Content-Type': r.mime, 'Cache-Control': 'no-store', 'X-Azkell-Extension': r.extension });
                res.send(r.buffer);
            } catch (e) {
                if (e && e.status) return res.status(e.status).json({ ok: false, error: e.message });
                console.error('[herramientas] convertir:', e && e.message);
                res.status(500).json({ ok: false, error: 'No se pudo convertir el archivo.' });
            }
        });
    });

    return router;
};
