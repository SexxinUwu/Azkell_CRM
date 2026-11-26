// Fotos del inventario guardadas en el servidor: se bajan de S3 una sola vez, se reducen (si hay sharp) y se sirven desde disco
// con caché de un año. La dirección lleva la ruta de S3 firmada con HMAC: nadie puede pedir archivos que no sean fotos del inventario.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.FOTOS_CACHE_DIR || path.join(os.tmpdir(), 'azkell-fotos');
const ANCHO = 640;
let sharp = null;
try { sharp = require('sharp'); } catch (_) { /* sin sharp: se sirve la foto original, igual guardada en disco */ }

const secreto = () => String(process.env.JWT_SECRET || 'azkell');
const firmar = (key) => crypto.createHmac('sha256', secreto()).update(key).digest('hex').slice(0, 20);
const archivoDe = (key) => path.join(DIR, crypto.createHash('sha1').update(key).digest('hex') + (sharp ? '.webp' : '.img'));
const tipoDe = () => (sharp ? 'image/webp' : 'application/octet-stream');

/** Dirección propia de una foto: /fotos-inv/<ruta en base64>.<firma>.webp */
function urlFoto(key) {
    return `/fotos-inv/${Buffer.from(key).toString('base64url')}.${firmar(key)}.webp`;
}

/** Ruta de S3 de una dirección propia (o null si la firma no coincide) */
function keyDeArchivo(nombre) {
    const m = /^([A-Za-z0-9_-]+)\.([0-9a-f]{20})\.webp$/.exec(nombre || '');
    if (!m) return null;
    const key = Buffer.from(m[1], 'base64url').toString('utf8');
    const ok = m[2].length === firmar(key).length && crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(firmar(key)));
    return ok && key.startsWith('almacen/inventario/') ? key : null;
}

const enCurso = new Map();

/** Deja la foto en disco (si no estaba) y devuelve su ruta */
async function asegurar(key, bytesOriginales) {
    const destino = archivoDe(key);
    if (fs.existsSync(destino)) return destino;
    if (enCurso.has(key)) return enCurso.get(key);
    const tarea = (async () => {
        fs.mkdirSync(DIR, { recursive: true });
        let datos = bytesOriginales;
        if (!datos) datos = await require('../utils/s3').descargarDeS3(key);
        if (sharp) datos = await sharp(datos).rotate().resize({ width: ANCHO, height: ANCHO, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
        const tmp = destino + '.' + process.pid + '.tmp';
        fs.writeFileSync(tmp, datos);
        fs.renameSync(tmp, destino);
        return destino;
    })().finally(() => enCurso.delete(key));
    enCurso.set(key, tarea);
    return tarea;
}

/** Controlador de GET /fotos-inv/:archivo */
async function servir(req, res) {
    const key = keyDeArchivo(req.params.archivo);
    if (!key) return res.status(404).end();
    try {
        const ruta = await asegurar(key);
        res.set({ 'Content-Type': tipoDe(), 'Cache-Control': 'public, max-age=31536000, immutable' });
        fs.createReadStream(ruta).on('error', () => res.status(500).end()).pipe(res);
    } catch (e) {
        res.status(404).end();
    }
}

/** Baja y deja listas varias fotos en segundo plano (pocas a la vez para no saturar S3 ni el servidor) */
function precalentar(keys, paralelo = 4) {
    const pendientes = [...new Set(keys.filter(Boolean))].filter(k => !fs.existsSync(archivoDe(k)));
    let i = 0;
    const trabajador = async () => { while (i < pendientes.length) { const k = pendientes[i++]; await asegurar(k).catch(() => {}); } };
    return Promise.all(Array.from({ length: Math.min(paralelo, pendientes.length) }, trabajador));
}

module.exports = { urlFoto, servir, asegurar, precalentar };
