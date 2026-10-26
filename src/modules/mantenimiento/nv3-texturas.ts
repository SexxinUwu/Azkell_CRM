// Texturas del modelo cenital de neumáticos, generadas por código (canvas, sin imágenes externas):
// banda de rodadura con franjas de semáforo (R1 arriba, R2 en medio, R3 abajo), relieve y rugosidad de los surcos,
// y la etiqueta con el número de cada posición.
import * as THREE from 'three';
import { tonoMm, type Tono } from './neumaticosSemaforo';

/** Colores del semáforo para el lienzo (los mismos tonos que el resto del ERP) */
export const COLOR_SEMAFORO_CANVAS: Record<Tono, string> = {
  green: '#10b981', amber: '#f59e0b', red: '#ef4444', gray: '#c7c7cc',
};

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

/** Banda de un neumático: tres franjas de semáforo de arriba abajo (R1, R2, R3) con los surcos encima */
export function texturasBanda(valores: (number | null)[]): TexturasBanda {
  const ancho = 512;
  const alto = 256;
  const paso = 32;
  const color = lienzo(ancho, alto);
  const relieve = lienzo(ancho, alto);
  const rugosidad = lienzo(ancho, alto);

  if (color.ctx) {
    color.ctx.fillStyle = '#2b2b31';
    color.ctx.fillRect(0, 0, ancho, alto);
    // Fila superior del canvas = parte superior del cilindro (uv.y = 1 - v con flipY): R1 arriba, como el desgaste
    for (let i = 0; i < 3; i++) {
      color.ctx.globalAlpha = 0.45;
      color.ctx.fillStyle = COLOR_SEMAFORO_CANVAS[tonoMm(valores[i] ?? null)];
      color.ctx.fillRect(0, (i * alto) / 3, ancho, alto / 3 + 1);
    }
    color.ctx.globalAlpha = 1;
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
