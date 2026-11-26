// Lugares de Perú (colegios, grifos, hospitales, hoteles, parques…) guardados en el servidor, a partir de Overture Maps.
// Se generan con scripts/lugares_peru.py y se sirven como teselas vectoriales propias: el mapa no depende de ningún servicio externo.
// En memoria solo hay arreglos compactos (≈20 MB): los puntos se agrupan por casilla de zoom 12 y cada tesela se arma al pedirla.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ARCHIVO = path.join(__dirname, 'datos', 'lugares_peru.json.gz');
const ZOOM_BASE = 12;   // casilla de agrupación; por debajo no se dibujan lugares
const ZOOM_MAX = 16;    // más cerca el mapa reutiliza la tesela de 16
const EXTENT = 4096;
let datos = null;

function mercator(lon, lat) {
    const s = Math.sin(lat * Math.PI / 180);
    return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}

function cargar() {
    if (datos !== null) return datos;
    if (!fs.existsSync(ARCHIVO)) return (datos = false);
    try {
        const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(ARCHIVO)).toString('utf8'));
        const n = j.puntos.length, N = 2 ** ZOOM_BASE;
        const mx = new Float64Array(n), my = new Float64Array(n), g = new Uint8Array(n), q = new Uint8Array(n), nombre = new Array(n);
        const cubos = new Map();
        j.puntos.forEach((p, i) => {
            const [u, v] = mercator(p[0], p[1]);
            mx[i] = u; my[i] = v; g[i] = p[2]; q[i] = p[3]; nombre[i] = p[4];
            const k = Math.floor(u * N) * N + Math.floor(v * N);
            (cubos.get(k) || cubos.set(k, []).get(k)).push(i);
        });
        console.log(`[mapa lugares] ${n} lugares cargados (Overture ${j.version})`);
        return (datos = { mx, my, g, q, nombre, cubos, grupos: j.grupos });
    } catch (err) { console.error('[mapa lugares] no se pudo cargar:', err.message); return (datos = false); }
}

/** Tesela vectorial (pbf) con los lugares de esa casilla; vacía si no hay datos */
function tesela(z, x, y) {
    if (z < ZOOM_BASE || z > ZOOM_MAX) return Buffer.alloc(0);
    const d = cargar();
    if (!d) return Buffer.alloc(0);
    const z0 = Math.min(z, ZOOM_MAX), N = 2 ** z0;
    const x0 = x, y0 = y;
    const sh = z0 - ZOOM_BASE;
    const cubo = d.cubos.get((x0 >> sh) * 2 ** ZOOM_BASE + (y0 >> sh));
    if (!cubo) return Buffer.alloc(0);
    const features = [];
    for (const i of cubo) {
        const fx = d.mx[i] * N - x0, fy = d.my[i] * N - y0;
        if (fx < -0.01 || fx >= 1.01 || fy < -0.01 || fy >= 1.01) continue;
        features.push({ type: 1, geometry: [[Math.round(fx * EXTENT), Math.round(fy * EXTENT)]], tags: { g: d.grupos[d.g[i]], q: d.q[i], n: d.nombre[i] } });
    }
    if (!features.length) return Buffer.alloc(0);
    return Buffer.from(require('vt-pbf').fromGeojsonVt({ lugares: { features } }, { version: 2, extent: EXTENT }));
}

module.exports = { tesela, ZOOM_BASE, ZOOM_MAX };
