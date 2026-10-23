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

function cargarFuenteOswald() {
  if (document.querySelector(`link[href="${FUENTE_OSWALD}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FUENTE_OSWALD;
  document.head.appendChild(link);
}

/** Convierte el documento HTML del clásico a PDF. Quita el botón de imprimir, que no va en el PDF. */
async function blobDeHtml(html: string): Promise<Blob> {
  cargarFuenteOswald();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.getElementById('btnPrint')?.remove();
  const el = document.createElement('div');
  el.innerHTML = doc.body.innerHTML;
  // El documento mide 210 mm: la caja de montaje de core/lib/pdf (0×0 con overflow oculto) lo recorta y sale en blanco.
  // Aquí la caja deja ver todo el contenido, detrás del resto de la app y sin interacción.
  const caja = document.createElement('div');
  caja.style.cssText = 'position:absolute;left:0;top:0;width:210mm;height:0;overflow:visible;z-index:-1;pointer-events:none;';
  caja.appendChild(el);
  document.body.appendChild(caja);
  try {
    await document.fonts?.ready;
    return await generarPDFBlob(el, { orientacion: 'portrait' });
  } finally { caja.remove(); }
}

/** PDF de cierre de la OT (con trabajos, materiales y firmas), como el clásico */
export function pdfOt(d: DatosOtPdf): Promise<Blob> {
  return blobDeHtml(generarPDF_OT(d.ot, d.trabajos, d.materiales, false, undefined) as string);
}

/** Plantilla vacía para llenar a mano en taller (10 filas de trabajo y observaciones), como el clásico */
export function pdfPlantillaOt(ot: OrdenTrabajo): Promise<Blob> {
  return blobDeHtml(generarPDF_OT(ot, [], [], true, undefined) as string);
}
