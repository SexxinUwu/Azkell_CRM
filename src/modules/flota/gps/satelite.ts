// Satélite nítido sin el aviso "Map data not yet available".
// Esri no tiene imágenes cercanas en todas partes (Lima llega al zoom 19; el campo, al 17) y en esos sitios responde siempre con la
// misma lámina gris. Aquí las teselas de zoom alto pasan por un protocolo propio que cambia esa lámina por una imagen transparente:
// así se ve la capa de abajo (la de menos zoom, agrandada) y, donde sí hay imágenes, se ve la nítida.
import maplibregl from 'maplibre-gl';
import { MAPA_URLS, SAT_PLACEHOLDER_BYTES } from './mapaConfig';

/** Esquema de las teselas de detalle: esri://{z}/{y}/{x} */
export const ESQUEMA_ESRI = 'esri';

// PNG transparente de 1×1, generado con un canvas (un PNG escrito a mano salió azul semitransparente)
let transparente: Promise<ArrayBuffer> | null = null;
function imagenTransparente(): Promise<ArrayBuffer> {
  if (!transparente) {
    const c = new OffscreenCanvas(1, 1);
    transparente = c.convertToBlob({ type: 'image/png' }).then(b => b.arrayBuffer());
  }
  return transparente;
}

const plantilla = (t: string, z: string, y: string, x: string) => t.replace('{z}', z).replace('{y}', y).replace('{x}', x);
const url = (z: string, y: string, x: string) => plantilla(MAPA_URLS.satelite, z, y, x);
const sha1 = async (b: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', b))].map(n => n.toString(16).padStart(2, '0')).join('');

// Firma de la lámina de "sin imágenes": se aprende pidiendo una tesela a un zoom que Esri no tiene
let firma: Promise<string | null> | null = null;
function aprenderFirma(): Promise<string | null> {
  if (!firma) {
    firma = fetch(url('22', '1', '1')).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? sha1(b) : null)).catch(() => null);
  }
  return firma;
}

let registrado = false;
export function registrarEsri() {
  if (registrado) return;
  registrado = true;
  maplibregl.addProtocol(ESQUEMA_ESRI, async (params, controlador) => {
    const [z, y, x] = params.url.replace(`${ESQUEMA_ESRI}://`, '').split('/');
    try {
      // Primero Clarity (más reciente); si no tiene la tesela (404), la imagen estándar de Esri
      const c = await fetch(plantilla(MAPA_URLS.sateliteClarity, z, y, x), { signal: controlador.signal });
      if (c.ok) {
        const d = await c.arrayBuffer();
        if (d.byteLength !== SAT_PLACEHOLDER_BYTES) return { data: d };
      }
      const r = await fetch(url(z, y, x), { signal: controlador.signal });
      if (!r.ok) return { data: (await imagenTransparente()).slice(0) };
      const data = await r.arrayBuffer();
      // Solo las láminas del tamaño del aviso se comparan con la firma (así no se calcula en todas las teselas)
      if (data.byteLength === SAT_PLACEHOLDER_BYTES) {
        const f = await aprenderFirma();
        if (!f || f === await sha1(data)) return { data: (await imagenTransparente()).slice(0) };
      }
      return { data };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      return { data: (await imagenTransparente()).slice(0) };
    }
  });
}
