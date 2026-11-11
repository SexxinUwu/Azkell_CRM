// PDF del informe de una inspección: el cliente arma el HTML y el servidor lo convierte con Chromium (texto real, A4).
// Las fotos (guardadas en S3) las descarga el servidor y las incrusta, porque el navegador del PDF no sale a internet.
const express = require('express');
const { s3KeyFromUrl, getPresignedUrlEstable } = require('../utils/s3');

const LIMITE_FOTO = 6 * 1024 * 1024;
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

async function fotoComoDataUrl(url) {
    if (typeof url !== 'string' || !url) return '';
    if (url.startsWith('data:image/')) return url;
    const key = s3KeyFromUrl(url);
    if (!key) return ''; // solo se descargan fotos propias del almacenamiento
    try {
        const r = await fetch(await getPresignedUrlEstable(key));
        if (!r.ok) return '';
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > LIMITE_FOTO) return '';
        const ext = (key.split('.').pop() || 'jpg').toLowerCase();
        const mime = r.headers.get('content-type') && r.headers.get('content-type').startsWith('image/') ? r.headers.get('content-type') : (MIME[ext] || 'image/jpeg');
        return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (e) { return ''; }
}

module.exports = () => {
    const router = express.Router();
    router.post('/mantenimiento/inspecciones/pdf', async (req, res) => {
        try {
            let html = typeof (req.body && req.body.html) === 'string' ? req.body.html : '';
            if (!html.includes('<html')) return res.status(400).json({ error: 'Documento no válido' });
            const fotos = Array.isArray(req.body.fotos) ? req.body.fotos.slice(0, 60) : [];
            const datos = await Promise.all(fotos.map(fotoComoDataUrl));
            html = html.replace(/@@FOTO:(\d+)@@/g, (m, n) => datos[Number(n)] || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==');
            const { htmlAPdf } = require('../services/ot_pdf');
            const pdf = await htmlAPdf(html, String(req.body.titulo || 'Inspección').slice(0, 150), false, false, { margenV: 8 });
            res.set('Content-Type', 'application/pdf').send(Buffer.from(pdf));
        } catch (err) {
            console.error('[inspeccion-pdf]', err.message);
            res.status(500).json({ error: 'No se pudo generar el PDF' });
        }
    });
    return router;
};
