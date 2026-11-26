/**
 * Etiquetas de artículos para la etiquetadora térmica CBX T40 / HPRT HT400 (203 dpi, lenguaje ZPL).
 * El rollo es de 3 etiquetas por fila: cada etiqueta mide unos 33 × 25 mm. Se arma una fila (hasta 3 etiquetas) por formato.
 * El texto sale con tipografía de impresora y el código en CODE128, que lee cualquier lector de código de barras.
 */

export interface EtiquetaArticulo {
  /** Lo que lleva el código de barras: el código de barras del artículo o, si no tiene, su código interno (INV-0212) */
  codigo: string;
  /** Texto corto del artículo (hasta 2 líneas) */
  descripcion: string;
  /** Código interno que se lee debajo del código de barras */
  id: string;
  /** Ubicación o anaquel, en letra chica al pie */
  ubicacion?: string;
  /** Número de lote: la etiqueta lleva un QR con «INV-0212-L2» (el lote no cabe en un código de barras angosto) y el nombre del lote en grande */
  lote?: number;
}

/** Medidas en puntos (203 dpi = 8 puntos por mm). Se ajustan aquí si cambia el rollo. */
export const MEDIDAS_ETIQUETA = {
  /** Etiquetas por fila */
  columnas: 3,
  /** Ancho útil de la fila: la T40 imprime hasta 832 puntos (104 mm) */
  anchoFila: 832,
  /** Largo de cada etiqueta (25 mm) */
  alto: 200,
  /** Distancia desde el borde izquierdo del papel hasta el borde de la 1.ª etiqueta, y de una etiqueta a la siguiente */
  inicioX: 40,
  paso: 269,
  /** Ancho de cada etiqueta (33 mm) y margen interno */
  ancho: 255,
  /** Margen del código de barras (el CODE128 de 8 caracteres mide 246 puntos y casi llena la etiqueta) y del texto */
  margen: 4,
  margenTexto: 9,
} as const;

/** ZPL usa ^ y ~ como comandos, y el texto de la etiqueta va sin tildes para no depender de la tabla de caracteres de la impresora */
const limpio = (t: string, max: number) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\^~\\]/g, ' ').replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Módulos (barras angostas) que ocupa un CODE128: los dígitos se comprimen de a pares en subconjunto C */
function modulosCode128(texto: string) {
  const n = texto.length;
  const simbolos = /^\d+$/.test(texto) ? (n % 2 === 0 ? n / 2 + 1 : (n - 1) / 2 + 3) : n + 1;
  return 11 * (simbolos + 1) + 13; // + dígito de control y final
}

function formatoFila(fila: EtiquetaArticulo[]): string {
  const { alto, inicioX, paso, ancho, margen, margenTexto } = MEDIDAS_ETIQUETA;
  const util = ancho - margen * 2;
  const utilTexto = ancho - margenTexto * 2;
  const l: string[] = ['^XA', `^PW${MEDIDAS_ETIQUETA.anchoFila}`, `^LL${alto}`, '^LH0,0', '^PR3'];
  fila.forEach((e, k) => {
    const x = inicioX + k * paso + margen;
    const xt = inicioX + k * paso + margenTexto;
    if (e.lote != null) {
      // Etiqueta de lote: descripción arriba, QR a la izquierda y a la derecha el lote, el código y el anaquel
      const qr = limpio(`${e.id}-L${e.lote}`, 30);
      l.push(`^FO${xt},12^A0N,24,22^FB${utilTexto},2,0,L,0^FD${limpio(e.descripcion, 44)}^FS`);
      l.push(`^FO${xt},72^BQN,2,4^FDQA,${qr}^FS`);
      l.push(`^FO${xt + 118},78^A0N,40,36^FB${utilTexto - 118},1,0,L,0^FDLOTE ${e.lote}^FS`);
      l.push(`^FO${xt + 118},124^A0N,24,22^FB${utilTexto - 118},1,0,L,0^FD${limpio(e.id, 24)}^FS`);
      if (e.ubicacion) l.push(`^FO${xt + 118},156^A0N,20,18^FB${utilTexto - 118},1,0,L,0^FD${limpio(e.ubicacion, 28)}^FS`);
      return;
    }
    const codigo = limpio(e.codigo, 24) || limpio(e.id, 24);
    // Barra lo más ancha posible sin pasarse de la etiqueta (2 puntos es lo ideal para leer bien; 1 solo si el código es largo)
    const ancha = Math.max(1, Math.min(3, Math.floor(util / modulosCode128(codigo))));
    l.push(`^FO${xt},12^A0N,24,22^FB${utilTexto},2,0,L,0^FD${limpio(e.descripcion, 44)}^FS`);
    l.push(`^BY${ancha},3,0`);
    l.push(`^FO${x},66^BCN,56,N,N,N^FD${codigo}^FS`);
    l.push(`^FO${xt},128^A0N,24,22^FB${utilTexto},1,0,C,0^FD${limpio(e.id, 24)}^FS`);
    if (e.ubicacion) l.push(`^FO${xt},160^A0N,20,18^FB${utilTexto},1,0,C,0^FD${limpio(e.ubicacion, 28)}^FS`);
  });
  l.push('^PQ1', '^XZ');
  return l.join('\r\n') + '\r\n';
}

/**
 * ZPL para imprimir las etiquetas dadas, de a 3 por fila. `copias` repite cada artículo.
 * Empieza fijando el modo térmico directo (etiquetas sin cinta) y la oscuridad; no guarda nada en la impresora.
 */
export function zplEtiquetas(articulos: EtiquetaArticulo[], copias = 1): string {
  const todas = articulos.flatMap(a => Array.from({ length: Math.max(1, Math.floor(copias)) }, () => a));
  const filas: EtiquetaArticulo[][] = [];
  for (let i = 0; i < todas.length; i += MEDIDAS_ETIQUETA.columnas) filas.push(todas.slice(i, i + MEDIDAS_ETIQUETA.columnas));
  return '^XA^MTD^MD16^XZ\r\n' + filas.map(formatoFila).join('');
}
