// PDF de la OT: el HTML sale de otPdfClasico.ts (copia de generarPDF_OT, sin cambios de diseño)
// y el servidor lo convierte a PDF con Chromium (texto real, vectorial, igual de nítido que el clásico).
import { generarPDF_OT } from './otPdfClasico';
import { htmlPlantillaInspeccion, htmlPlantillaLlantas } from './otPlantillasClasico';
import { apiFetch } from '../../core/api/client';
import { aObjeto, type MaterialSalida, type OrdenTrabajo, type TrabajoOT } from './api';

/** Datos que el PDF toma de otras tablas: marca (placas), rampa (catálogo) y kilometraje */
export interface ExtrasPdf {
  marca?: string;
  rampa?: string;
  kmTablero?: string | number;
  kmGps?: string | number;
}

export interface DatosOtPdf {
  ot: OrdenTrabajo;
  trabajos: TrabajoOT[];
  materiales: MaterialSalida[];
  usuario: string;
  extras?: ExtrasPdf;
}

/** La OT con los datos extra puestos en sus detalles, que es donde el documento del clásico los lee */
function otConExtras(ot: OrdenTrabajo, extras: ExtrasPdf = {}): OrdenTrabajo {
  const det: Record<string, unknown> = { ...aObjeto(ot.detalles_json) };
  if (extras.marca) det.marca = extras.marca;
  if (extras.rampa) det.rampa_origen = extras.rampa;
  if (extras.kmTablero !== undefined && extras.kmTablero !== '') det.km_tablero = extras.kmTablero;
  if (extras.kmGps !== undefined && extras.kmGps !== '') det.km_gps = extras.kmGps;
  return { ...ot, detalles_json: det as OrdenTrabajo['detalles_json'] };
}

/** Logo de la empresa del subdominio como data URL. Los documentos clásicos lo leen de window._LOGO_BASE64
 *  y, sin él, caían al logo de Marsisa que está fijo en el código. */
let logoCache: Promise<string> | null = null;
async function ponerLogoEmpresa(): Promise<void> {
  logoCache ??= (async () => {
    try {
      const res = await apiFetch('/tenant-logo');
      if (!res.ok) return '';
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) return '';
      return await new Promise<string>((ok, mal) => { const l = new FileReader(); l.onload = () => ok(String(l.result)); l.onerror = () => mal(l.error); l.readAsDataURL(blob); });
    } catch { return ''; }
  })();
  const logo = await logoCache;
  if (!logo) logoCache = null;
  else (window as unknown as { _LOGO_BASE64?: string })._LOGO_BASE64 = logo;
}

/** Pide al servidor el PDF de un documento HTML. Usa la misma sesión que el resto de la app. */
export async function pdfDeHtml(html: string, titulo: string, horizontal = false): Promise<Blob> {
  // La falla se muestra sin "• Falla Manual :" (el resto del documento queda como en el clásico)
  const limpio = html.replace(/•\s*Falla Manual\s*:\s*/gi, '');
  const res = await apiFetch('/ot-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: limpio, titulo, horizontal }),
  });
  if (!res.ok) throw new Error(`No se pudo generar el PDF (HTTP ${res.status})`);
  return res.blob();
}

/** PDF de cierre de la OT (con trabajos, materiales y firmas), como el clásico */
export async function pdfOt(d: DatosOtPdf): Promise<Blob> {
  await ponerLogoEmpresa();
  const numero = d.ot.id_ot || d.ot.ticket_entrada || '';
  const ot = otConExtras(d.ot, d.extras);
  const html = generarPDF_OT(ot, d.trabajos, d.materiales, false, undefined) as string;
  return pdfDeHtml(html, `Orden de trabajo ${numero} ${d.ot.placa ?? ''}`.trim());
}

/** Plantilla vacía para llenar a mano en taller (10 filas de trabajo y observaciones), como el clásico */
export async function pdfPlantillaOt(ot: OrdenTrabajo, extras?: ExtrasPdf): Promise<Blob> {
  await ponerLogoEmpresa();
  const html = generarPDF_OT(otConExtras(ot, extras), [], [], true, undefined) as string;
  return pdfDeHtml(html, 'Plantilla orden de trabajo');
}

/** Plantilla de inspecciones F-MAN-001 (checklist), como el clásico */
export async function pdfPlantillaInspeccion(idOt: string, placa: string, fechaIng: string | null, km: string | number | undefined, rampa: string | undefined): Promise<Blob> {
  await ponerLogoEmpresa();
  return htmlPlantillaInspeccion(idOt, placa, fechaIng ?? '', km ?? '', rampa ?? '').then((html: string) => pdfDeHtml(html, `Plantilla inspecciones ${idOt}`));
}

/** Plantilla de llantas A4 en blanco, como el clásico */
export async function pdfPlantillaLlantas(ot: OrdenTrabajo, extras?: ExtrasPdf): Promise<Blob> {
  await ponerLogoEmpresa();
  const numero = ot.id_ot || ot.ticket_entrada || '';
  return htmlPlantillaLlantas(numero, otConExtras(ot, extras)).then((html: string) => pdfDeHtml(html, `Plantilla de llantas ${numero}`));
}
