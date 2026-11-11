// Informe de una inspección en PDF: sencillo de leer, con el medidor de combustible, las fallas con su observación y foto,
// las fotos de evidencia y la firma del inspector. El HTML se arma aquí y el servidor lo convierte con Chromium (texto real);
// las fotos se incrustan en el servidor (por eso el HTML lleva marcas @@FOTO:n@@).
import { apiFetch } from '../../core/api/client';
import { pestanaConCamion } from '../../core/ui/CargaCamion';
import { htmlInspeccion, type DatosInspeccionPdf } from './inspeccionPdfHtml';

export type { DatosInspeccionPdf };

/** Logo de la empresa como data URL (el servidor lo incrusta en el PDF); null si no hay */
async function logoComoDataUrl(): Promise<string | null> {
  try {
    const res = await apiFetch('/tenant-logo');
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise<string>((ok, mal) => { const l = new FileReader(); l.onload = () => ok(String(l.result)); l.onerror = () => mal(l.error); l.readAsDataURL(blob); });
  } catch { return null; }
}

/** PDF del informe (lo genera el servidor) */
export async function pdfInspeccion(d: DatosInspeccionPdf): Promise<Blob> {
  const { html, fotos } = htmlInspeccion(d, await logoComoDataUrl());
  const res = await apiFetch('/mantenimiento/inspecciones/pdf', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, fotos, titulo: `Inspección ${d.inspeccion.id} · ${d.inspeccion.placa}` }),
  });
  if (!res.ok) throw new Error(`No se pudo generar el PDF (HTTP ${res.status})`);
  return res.blob();
}

/** Abre el PDF en otra pestaña (visor del navegador), con el cargador del camión mientras se genera */
export async function abrirPdfInspeccion(d: DatosInspeccionPdf): Promise<void> {
  const ventana = window.open('', '_blank');
  pestanaConCamion(ventana);
  try {
    const url = URL.createObjectURL(await pdfInspeccion(d));
    if (ventana) ventana.location.href = url; else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) { ventana?.close(); throw err; }
}
