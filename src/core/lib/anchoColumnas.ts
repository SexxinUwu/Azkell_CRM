/**
 * Ancho de columna según el texto: se mide con la fuente real de la tabla (canvas), no con un cálculo aproximado.
 * Si el texto es largo, la columna es más ancha (con un tope); el título también cuenta.
 */
let lienzo: CanvasRenderingContext2D | null = null;

export interface OpcionesMedida { mono?: boolean; bold?: boolean; espaciado?: number }

/** Ancho en píxeles que ocupa un texto con la fuente de la tabla */
export function medirTexto(texto: string, px: number, opciones: OpcionesMedida = {}): number {
  try {
    lienzo ??= document.createElement('canvas').getContext('2d');
    if (!lienzo) throw new Error('sin canvas');
    const raiz = getComputedStyle(document.documentElement);
    const familia = opciones.mono ? (raiz.getPropertyValue('--font-mono').trim() || 'monospace') : getComputedStyle(document.body).fontFamily || 'sans-serif';
    lienzo.font = `${opciones.bold ? 700 : 400} ${px}px ${familia}`;
    return lienzo.measureText(texto).width + (opciones.espaciado ?? 0) * texto.length;
  } catch {
    return texto.length * px * 0.58;
  }
}

export interface EspecColumna {
  titulo: string;
  textos: string[];
  /** Tamaño de letra del contenido (13 por defecto) */
  px?: number;
  mono?: boolean;
  bold?: boolean;
  /** Relleno extra de chips o insignias */
  extra?: number;
  min: number;
  max: number;
}

/** El ancho que cabe al texto más largo de la columna (o a su título), entre el mínimo y el tope */
export function anchoAjustado(c: EspecColumna): number {
  const px = c.px ?? 13;
  const contenido = c.textos.reduce((mx, t) => Math.max(mx, medirTexto(t, px, { mono: c.mono, bold: c.bold })), 0);
  const titulo = medirTexto(c.titulo.toUpperCase(), 11, { bold: true, espaciado: 0.22 }) + 14;
  return Math.min(c.max, Math.max(c.min, Math.ceil(Math.max(contenido + (c.extra ?? 0), titulo) + 28)));
}
