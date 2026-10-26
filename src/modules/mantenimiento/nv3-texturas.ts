// Texturas del modelo cenital de neumáticos. La banda usa la foto recortada del neumático (assets/neumatico-banda.png)
// cuando ya cargó; si no, se genera por código (canvas): surcos y tacos. En ambos casos las franjas de semáforo
// (R1 arriba, R2 en medio, R3 abajo) tiñen la banda. La etiqueta con el número de cada posición también sale de aquí.
import * as THREE from 'three';
import bandaUrl from './assets/neumatico-banda.png';
import { tonoMm, type Tono } from './neumaticosSemaforo';

/** Colores del semáforo para el lienzo (los mismos tonos que el resto del ERP) */
export const COLOR_SEMAFORO_CANVAS: Record<Tono, string> = {
  green: '#10b981', amber: '#f59e0b', red: '#ef4444', gray: '#c7c7cc',
};

/** Foto de la banda: se carga una sola vez; mientras no esté lista se usa la textura por código */
let foto: HTMLImageElement | null = null;
let cargaFoto: Promise<boolean> | null = null;

/** Descarga la foto de la banda (una vez). Resuelve true si ya se puede usar. */
export function cargarFotoBanda(): Promise<boolean> {
  if (!cargaFoto) {
    cargaFoto = new Promise<boolean>(resolver => {
      const img = new Image();
      img.onload = () => { foto = img; resolver(true); };
      img.onerror = () => resolver(false);
      img.src = bandaUrl;
    });
  }
  return cargaFoto;
}

/** Si la foto ya está descargada */
export function fotoBandaLista(): boolean {
  return foto !== null;
}

function lienzo(ancho: number, alto: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  return { canvas, ctx: canvas.getContext('2d') };
}

/** Surcos de rodadura: líneas que dan la vuelta a la llanta y tacos cortos entre ellas (sipes) */
function dibujarSurcos(ctx: CanvasRenderingContext2D, ancho: number, alto: number, paso: number, surco: string, taco: string) {
  let fila = 0;
  for (let y = paso / 2; y < alto; y += paso, fila++) {
    ctx.fillStyle = surco;
    ctx.fillRect(0, y - 5, ancho, 10);
    ctx.fillStyle = taco;
    for (let x = (fila % 2) * 32; x < ancho; x += 64) {
      ctx.fillRect(x, y + 7, 4, paso - 14);
    }
  }
}

export interface TexturasBanda {
  color: THREE.CanvasTexture;
  relieve: THREE.CanvasTexture;
  rugosidad: THREE.CanvasTexture;
}

/**
 * La foto está de frente con los surcos en vertical: se gira 90° para que los surcos den la vuelta a la llanta
 * (eje x del lienzo = circunferencia). Se dibuja una copia en espejo a continuación para que cierre sin costura.
 */
function dibujarFoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, alto: number, filtro: string) {
  const s = alto / img.naturalWidth;
  const largo = img.naturalHeight * s;
  ctx.save();
  ctx.filter = filtro;
  ctx.setTransform(0, s, s, 0, 0, 0);
  ctx.drawImage(img, 0, 0);
  // Copia en espejo: x = 2L - s·py, así el borde 0 y el borde 2L coinciden
  ctx.setTransform(0, s, -s, 0, 2 * largo, 0);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** Ancho del lienzo con foto: dos largos de la foto (cierre sin costura) */
function anchoFoto(img: HTMLImageElement, alto: number): number {
  return Math.round(2 * img.naturalHeight * (alto / img.naturalWidth));
}

/**
 * Franjas de semáforo sobre la banda (R1 arriba, R2 en medio, R3 abajo). Color pleno sobre el caucho: un mezclado con
 * la luminosidad de la foto quedaba oscuro y no se distinguía el verde, el amarillo y el rojo.
 */
function tintarFranjas(ctx: CanvasRenderingContext2D, ancho: number, alto: number, valores: (number | null)[], alfa: number) {
  ctx.save();
  ctx.globalAlpha = alfa;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = COLOR_SEMAFORO_CANVAS[tonoMm(valores[i] ?? null)];
    ctx.fillRect(0, (i * alto) / 3, ancho, alto / 3 + 1);
  }
  ctx.restore();
}

/** Banda de un neumático: tres franjas de semáforo de arriba abajo (R1, R2, R3) con los surcos encima */
export function texturasBanda(valores: (number | null)[]): TexturasBanda {
  const alto = 256;
  const usarFoto = foto !== null;
  const ancho = usarFoto && foto ? anchoFoto(foto, alto) : 512;
  const paso = 32;
  const color = lienzo(ancho, alto);
  const relieve = lienzo(ancho, alto);
  const rugosidad = lienzo(ancho, alto);

  if (usarFoto && foto) {
    // Color: foto real tintada por franjas; relieve y rugosidad: la foto en gris (surcos bajos, caucho alto)
    if (color.ctx) {
      dibujarFoto(color.ctx, foto, alto, 'none');
      tintarFranjas(color.ctx, ancho, alto, valores, 0.8);
    }
    if (relieve.ctx) dibujarFoto(relieve.ctx, foto, alto, 'grayscale(1) contrast(1.2)');
    if (rugosidad.ctx) dibujarFoto(rugosidad.ctx, foto, alto, 'grayscale(1) contrast(0.6) brightness(1.15)');
  } else {
    if (color.ctx) {
      color.ctx.fillStyle = '#2b2b31';
      color.ctx.fillRect(0, 0, ancho, alto);
      // Fila superior del canvas = parte superior del cilindro (uv.y = 1 - v con flipY): R1 arriba, como el desgaste
      tintarFranjas(color.ctx, ancho, alto, valores, 0.85);
      dibujarSurcos(color.ctx, ancho, alto, paso, '#0c0c0f', '#16161a');
    }
    if (relieve.ctx) {
      relieve.ctx.fillStyle = '#c4c4c4';
      relieve.ctx.fillRect(0, 0, ancho, alto);
      dibujarSurcos(relieve.ctx, ancho, alto, paso, '#3a3a3a', '#8a8a8a');
    }
    if (rugosidad.ctx) {
      // Caucho gastado en la banda y más áspero en los surcos (el material multiplica por su roughness)
      rugosidad.ctx.fillStyle = '#9a9a9a';
      rugosidad.ctx.fillRect(0, 0, ancho, alto);
      dibujarSurcos(rugosidad.ctx, ancho, alto, paso, '#ffffff', '#c8c8c8');
    }
  }

  const crear = (cv: HTMLCanvasElement, esColor: boolean) => {
    const t = new THREE.CanvasTexture(cv);
    if (esColor) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { color: crear(color.canvas, true), relieve: crear(relieve.canvas, false), rugosidad: crear(rugosidad.canvas, false) };
}

/** Etiqueta de la posición: círculo blanco con el número y un anillo del color del semáforo */
export function texturaEtiqueta(texto: string, color: string): THREE.CanvasTexture {
  const { canvas, ctx } = lienzo(128, 128);
  if (ctx) {
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.lineWidth = 14;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = '#1c1c1e';
    ctx.font = `700 ${texto.length > 2 ? 36 : 54}px system-ui, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, 64, 68);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Letrero de la marca para el capó: texto en relieve con brillo. Tres mapas: color (letras plateadas con sombra
 * para que parezcan elevadas), relieve (letras blancas difuminadas sobre negro) y rugosidad (letras lisas, fondo mate).
 * El texto se ajusta al ancho del lienzo.
 */
export function texturasMarca(texto: string): TexturasBanda {
  const ancho = 1024;
  const alto = 432;
  const nombre = texto.trim().toUpperCase().slice(0, 24);
  const color = lienzo(ancho, alto);
  const relieve = lienzo(ancho, alto);
  const rugosidad = lienzo(ancho, alto);
  const fuente = (px: number) => `900 ${px}px "Arial Black", "Segoe UI", system-ui, sans-serif`;

  // Tamaño: el mayor que entra en el 90% del ancho
  let px = 300;
  const medir = (ctx: CanvasRenderingContext2D) => {
    ctx.font = fuente(px);
    return ctx.measureText(nombre).width;
  };
  if (color.ctx) {
    while (px > 40 && medir(color.ctx) > ancho * 0.9) px -= 8;
  }
  const y = alto / 2 + px * 0.04;

  if (color.ctx) {
    const ctx = color.ctx;
    ctx.font = fuente(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Sombra: da la sensación de letra elevada sobre la pintura
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillText(nombre, ancho / 2 + 4, y + 10);
    // Cuerpo: plateado con brillo de arriba abajo
    const degradado = ctx.createLinearGradient(0, y - px / 2, 0, y + px / 2);
    degradado.addColorStop(0, '#ffffff');
    degradado.addColorStop(0.5, '#e8edf4');
    degradado.addColorStop(1, '#9aa6b6');
    ctx.fillStyle = degradado;
    ctx.fillText(nombre, ancho / 2, y);
    // Filo de luz en el borde superior de las letras
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(nombre, ancho / 2, y - 2);
  }
  if (relieve.ctx) {
    const ctx = relieve.ctx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.filter = 'blur(5px)';
    ctx.font = fuente(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(nombre, ancho / 2, y);
    ctx.filter = 'none';
  }
  if (rugosidad.ctx) {
    const ctx = rugosidad.ctx;
    // Pintura mate alrededor y letras muy lisas (el material multiplica su roughness por este mapa)
    ctx.fillStyle = '#a6a6a6';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.font = fuente(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#141414';
    ctx.fillText(nombre, ancho / 2, y);
  }

  const crear = (cv: HTMLCanvasElement, esColor: boolean) => {
    const t = new THREE.CanvasTexture(cv);
    if (esColor) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { color: crear(color.canvas, true), relieve: crear(relieve.canvas, false), rugosidad: crear(rugosidad.canvas, false) };
}
