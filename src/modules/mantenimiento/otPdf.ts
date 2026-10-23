// PDF de la OT: el HTML sale de otPdfClasico.ts (copia de generarPDF_OT, sin cambios de diseño)
// y el servidor lo convierte a PDF con Chromium (texto real, vectorial, igual de nítido que el clásico).
import { generarPDF_OT } from './otPdfClasico';
import { TAB_ID } from '../../core/api/client';
import type { MaterialSalida, OrdenTrabajo, TrabajoOT } from './api';

export interface DatosOtPdf {
  ot: OrdenTrabajo;
  trabajos: TrabajoOT[];
  materiales: MaterialSalida[];
  usuario: string;
}

/** Pide al servidor el PDF de un documento HTML. Usa la misma sesión que el resto de la app. */
async function pdfDeHtml(html: string, titulo: string): Promise<Blob> {
  const res = await fetch('/api/ot-pdf', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-azkell-tab': TAB_ID },
    body: JSON.stringify({ html, titulo }),
  });
  if (!res.ok) throw new Error(`No se pudo generar el PDF (HTTP ${res.status})`);
  return res.blob();
}

/** PDF de cierre de la OT (con trabajos, materiales y firmas), como el clásico */
export function pdfOt(d: DatosOtPdf): Promise<Blob> {
  const numero = d.ot.id_ot || d.ot.ticket_entrada || '';
  const html = generarPDF_OT(d.ot, d.trabajos, d.materiales, false, undefined) as string;
  return pdfDeHtml(html, `Orden de trabajo ${numero} ${d.ot.placa ?? ''}`.trim());
}

/** Plantilla vacía para llenar a mano en taller (10 filas de trabajo y observaciones), como el clásico */
export function pdfPlantillaOt(ot: OrdenTrabajo): Promise<Blob> {
  const html = generarPDF_OT(ot, [], [], true, undefined) as string;
  return pdfDeHtml(html, 'Plantilla orden de trabajo');
}

/** HTML del documento de la OT, igual que el clásico (generarPDF_OT): se muestra tal cual en una pestaña */
export function htmlOtPdf(d: DatosOtPdf): string {
  return generarPDF_OT(d.ot, d.trabajos, d.materiales, false, undefined) as string;
}

/** Plantilla vacía del clásico, tal cual */
export function htmlPlantillaOt(ot: OrdenTrabajo): string {
  return generarPDF_OT(ot, [], [], true, undefined) as string;
}
