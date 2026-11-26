/** Las etiquetas por lote llevan el código del artículo y el lote: «INV-0212-L2» es el artículo INV-0212, lote 2. */
export function separarLote(texto: string): { codigo: string; lote: number | null } {
  const m = /^(.+?)-L(\d{1,4})$/i.exec(String(texto ?? '').trim());
  return m ? { codigo: m[1], lote: Number(m[2]) } : { codigo: String(texto ?? '').trim(), lote: null };
}
/** Contenido del código de una etiqueta de lote */
export const codigoDeLote = (inventarioId: string, lote: number) => `${inventarioId}-L${lote}`;
