// PDF de la OT con el mismo diseño del clásico: el HTML sale de otPdfClasico.ts (copia de generarPDF_OT)
// y aquí solo se convierte a PDF con la misma librería de la app.
import { generarPDFBlob } from '../../core/lib/pdf';
import { generarPDF_OT } from './otPdfClasico';
import type { MaterialSalida, OrdenTrabajo, TrabajoOT } from './api';

export interface DatosOtPdf {
  ot: OrdenTrabajo;
  trabajos: TrabajoOT[];
  materiales: MaterialSalida[];
  usuario: string;
}

// Fuente del clásico (Oswald). Sin ella el PDF usa otra tipografía y no se ve igual.
const FUENTE_OSWALD = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap';

async function cargarFuenteOswald() {
  if (!document.querySelector(`link[href="${FUENTE_OSWALD}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FUENTE_OSWALD;
    await new Promise<void>(resolve => { link.onload = () => resolve(); link.onerror = () => resolve(); document.head.appendChild(link); });
  }
  // Sin la fuente cargada a tiempo, el PDF usa otra letra más ancha y la hoja se corta por la derecha
  await Promise.all([document.fonts.load('400 16px Oswald'), document.fonts.load('700 16px Oswald')]).catch(() => undefined);
}

/** Convierte el documento HTML del clásico a PDF. Quita el botón de imprimir, que no va en el PDF. */
async function blobDeHtml(html: string): Promise<Blob> {
  await cargarFuenteOswald();
  // Falla sin "• Falla Manual :" (solo en el PDF de /app; el HTML copiado del clásico no cambia)
  const limpio = html.replace(/•\s*Falla Manual\s*:\s*/gi, '');
  const doc = new DOMParser().parseFromString(limpio, 'text/html');
  doc.getElementById('btnPrint')?.remove();
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:-9999px;top:0;background:#fff;width:210mm;';
  el.innerHTML = doc.body.innerHTML;
  document.body.appendChild(el);
  // Se captura la hoja interior, no el contenedor: html2pdf copia los estilos del elemento y el left:-9999px
  // del contenedor dejaba la hoja en blanco (mismo criterio que el PDF de neumáticos)
  try {
    await document.fonts.ready;
    return await generarPDFBlob(el.querySelector('.page-container') as HTMLElement, { orientacion: 'portrait', escala: 3, margen: 0 });
  } finally { el.remove(); }
}

/** PDF de cierre de la OT (con trabajos, materiales y firmas), como el clásico */
export function pdfOt(d: DatosOtPdf): Promise<Blob> {
  return blobDeHtml(generarPDF_OT(d.ot, d.trabajos, d.materiales, false, undefined) as string);
}

/** Plantilla vacía para llenar a mano en taller (10 filas de trabajo y observaciones), como el clásico */
export function pdfPlantillaOt(ot: OrdenTrabajo): Promise<Blob> {
  return blobDeHtml(generarPDF_OT(ot, [], [], true, undefined) as string);
}
