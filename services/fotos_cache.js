// Fotos del inventario "como un CDN propio": al subirse (o la primera vez que se piden) se reducen a dos tamaños (320 para listas, 960 para la ficha),
// se guardan para siempre en S3 (carpeta almacen/inventario-mini) y en el disco del servidor, y se sirven con caché de un año.
// Después de un despliegue el disco se vuelve a llenar con las miniaturas (kilobytes), no con las fotos originales.
// La dirección lleva la ruta de la foto firmada con HMAC: nadie puede pedir archivos que no sean fotos del inventario.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.FOTOS_CACHE_DIR || path.join(os.tmpdir(), 'azkell-fotos');
const TAMANOS = [320, 960];
let sharp = null;
try { sharp = require('sharp'); } catch (_) { /* sin sharp: se sirve la foto original */ }

const secreto = () => String(process.env.JWT_SECRET || 'azkell');
const firmar = (key) => crypto.createHmac('sha256', secreto()).update(key).digest('hex').slice(0, 20);
const hash = (key) => crypto.createHash('sha1').update(key).digest('hex');
const archivoDe = (key, w) => path.join(DIR, `${hash(key)}.${w}.${sharp ? 'webp' : 'img'}`);
const claveS3 = (key, w) => `almacen/inventario-mini/${w}/${hash(key)}.webp`;
const tipoDe = () => (sharp ? 'image/webp' : 'application/octet-stream');

/** Dirección propia de una foto (tamaño grande); la lista usa la misma con .320 */
function urlFoto(key, w = 960) {
    return `/fotos-inv/${Buffer.from(key).toString('base64url')}.${firmar(key)}.${w}.webp`;
}

/** { key, w } de una dirección propia (o null si la firma no coincide) */
function leerArchivo(nombre) {
    const m = /^([A-Za-z0-9_-]+)\.([0-9a-f]{20})\.(\d{3})\.webp$/.exec(nombre || '');
    if (!m) return null;
    const key = Buffer.from(m[1], 'base64url').toString('utf8');
    const w = Number(m[3]);
    const esperada = firmar(key);
    const ok = m[2].length === esperada.length && crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(esperada));
    return ok && TAMANOS.includes(w) && key.startsWith('almacen/inventario/') ? { key, w } : null;
}

const enCurso = new Map();
const escribir = (destino, datos) => {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = destino + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, datos);
    fs.renameSync(tmp, destino);
};
const reducir = (datos, w) => sharp(datos).rotate().resize({ width: w, height: w, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();

/** Deja un tamaño de la foto en disco: primero el disco, luego la miniatura guardada en S3, y solo si no existe se reduce la original */
async function asegurar(key, w = 960, bytesOriginales) {
    const destino = archivoDe(key, w);
    if (fs.existsSync(destino)) return destino;
    const id = key + '|' + w;
    if (enCurso.has(id)) return enCurso.get(id);
    const s3 = require('../utils/s3');
    const tarea = (async () => {
        if (sharp) {
            const guardada = await s3.leerDeS3SiExiste(claveS3(key, w)).catch(() => null);
            if (guardada) { escribir(destino, guardada); return destino; }
        }
        const original = bytesOriginales || await s3.descargarDeS3(key);
        if (!sharp) { escribir(destino, original); return destino; }
        const miniatura = await reducir(original, w);
        escribir(destino, miniatura);
        s3.uploadToS3(miniatura, claveS3(key, w), 'image/webp').catch(e => console.warn('[fotos] miniatura a S3:', e.message));
        return destino;
    })().finally(() => enCurso.delete(id));
    enCurso.set(id, tarea);
    return tarea;
}

/** Controlador de GET /fotos-inv/:archivo */
async function servir(req, res) {
    const a = leerArchivo(req.params.archivo);
    if (!a) return res.status(404).end();
    try {
        const ruta = await asegurar(a.key, a.w);
        res.set({ 'Content-Type': tipoDe(), 'Cache-Control': 'public, max-age=31536000, immutable' });
        fs.createReadStream(ruta).on('error', () => res.status(500).end()).pipe(res);
    } catch (e) {
        res.status(404).end();
    }
}

/** Prepara todos los tamaños de varias fotos en segundo plano (pocas a la vez) */
function precalentar(keys, paralelo = 4) {
    const tareas = [];
    for (const k of new Set(keys.filter(Boolean))) for (const w of TAMANOS) if (!fs.existsSync(archivoDe(k, w))) tareas.push([k, w]);
    let i = 0;
    const trabajador = async () => { while (i < tareas.length) { const [k, w] = tareas[i++]; await asegurar(k, w).catch(() => {}); } };
    return Promise.all(Array.from({ length: Math.min(paralelo, tareas.length) }, trabajador));
}

/** Al subir una foto: se generan y guardan sus dos tamaños de inmediato */
async function guardarNueva(key, bytes) {
    for (const w of TAMANOS) await asegurar(key, w, bytes);
}

module.exports = { urlFoto, servir, asegurar, precalentar, guardarNueva };
