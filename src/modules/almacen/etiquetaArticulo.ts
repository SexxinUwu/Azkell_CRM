import JsBarcode from 'jsbarcode';
import type { ArticuloInv } from './api';

const esc = (texto: string) => texto.replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c] as string));

/**
 * Abre una ventana con la etiqueta del artículo (55 × 35 mm, CODE128) y lanza la impresión.
 * Devuelve false si el navegador bloquea la ventana o el código no se puede codificar.
 */
export function imprimirEtiqueta(a: ArticuloInv): boolean {
  const codigo = a.codigo_barras?.trim() || a.id;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, codigo, { format: 'CODE128', width: 1.6, height: 40, displayValue: true, fontSize: 10, margin: 0 });
  } catch {
    return false;
  }

  const ventana = window.open('', '_blank', 'width=600,height=500');
  if (!ventana) return false;

  const descripcion = a.descripcion || a.articulo || '';
  const ubicacion = [a.ubicacion, a.anaquel ? `Anq: ${a.anaquel}` : ''].filter(Boolean).join(' ');

  ventana.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta ${esc(a.id)}</title><style>
@page { size: 55mm 35mm; margin: 0; }
body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #000; background: #fff; }
.etiqueta { width: 49mm; height: 29mm; padding: 2mm; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
.cab { font-size: 7.5pt; font-weight: 800; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.desc { font-size: 6.5pt; font-weight: 600; color: #333; max-height: 14pt; overflow: hidden; line-height: 1.1; }
.codigo { text-align: center; }
.codigo svg { max-width: 100%; height: 14mm; }
.pie { display: flex; justify-content: space-between; font-size: 6pt; font-weight: 700; color: #444; border-top: 0.5px solid #ccc; padding-top: 0.5mm; }
</style></head><body><div class="etiqueta">
<div class="cab">${esc(a.almacen || 'Almacén')}</div>
<div class="desc">${esc(descripcion)}</div>
<div class="codigo">${svg.outerHTML}</div>
<div class="pie"><span>${esc(a.id)}</span><span>${esc(ubicacion)}</span></div>
</div></body></html>`);
  ventana.document.close();
  ventana.focus();
  ventana.print();
  return true;
}
