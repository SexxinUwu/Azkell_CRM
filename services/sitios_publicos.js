// Sitios públicos de Azkell, entregados por el mismo servidor según el dominio:
//   azkell.com · www.azkell.com  → cartera de Sthefano Avila Li
//   fleet.azkell.com             → página del producto Azkell Fleet
// Van antes de la resolución de empresa: no consultan ninguna base de datos.
// Se compilan con `npm run build:sitios` en dist/sitios. En desarrollo (localhost o IP) se ven con /?sitio=cartera o /?sitio=fleet.
const path = require('path');
const fs = require('fs');

const DIST = path.join(__dirname, '..', 'dist', 'sitios');
const SITIO_POR_HOST = { 'azkell.com': 'cartera', 'www.azkell.com': 'cartera', 'fleet.azkell.com': 'fleet' };
const SITIOS = new Set(['cartera', 'fleet']);
const esLocal = host => /localhost|^\d+\.\d+\.\d+\.\d+$/.test(host);

function sitiosPublicos() {
    const nombreDe = req => {
        const host = (req.headers.host || '').toLowerCase().split(':')[0];
        if (SITIO_POR_HOST[host]) return SITIO_POR_HOST[host];
        if (esLocal(host) && SITIOS.has(String(req.query.sitio || ''))) return String(req.query.sitio);
        return null;
    };

    return (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const host = (req.headers.host || '').toLowerCase().split(':')[0];
        const sitio = nombreDe(req);

        // Archivos compilados (compartidos por los dos sitios). Con nombre único: caché larga.
        if (req.path.startsWith('/assets/') && (sitio || esLocal(host))) {
            const archivo = path.normalize(path.join(DIST, req.path));
            if (!archivo.startsWith(path.join(DIST, 'assets'))) return res.status(404).end();
            return res.sendFile(archivo, { maxAge: '1y', immutable: true }, err => { if (err) res.status(404).end(); });
        }
        if (!sitio) return next();

        // Rutas de la API no existen en estos dominios
        if (req.path.startsWith('/api')) return res.status(404).json({ error: 'No disponible en este dominio.' });

        // Archivos sueltos de la carpeta public del sitio (logo, imagen para redes, robots)
        const nombre = path.basename(req.path);
        if (req.path !== '/' && /\.(png|ico|svg|webp|jpe?g|txt|xml|webmanifest)$/i.test(nombre)) {
            const archivo = path.join(DIST, sitio, nombre);
            if (fs.existsSync(archivo)) return res.sendFile(archivo, { maxAge: '1d' });
            const comun = path.join(DIST, nombre);
            if (fs.existsSync(comun)) return res.sendFile(comun, { maxAge: '1d' });
            return res.status(404).end();
        }

        // Página única: cualquier otra ruta devuelve el índice del sitio
        const indice = path.join(DIST, sitio, 'index.html');
        if (!fs.existsSync(indice)) {
            return res.status(503).type('text/plain').send('Sitio en preparación.');
        }
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(indice);
    };
}

module.exports = { sitiosPublicos };
