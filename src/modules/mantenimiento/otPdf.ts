// PDF de cierre de una orden de trabajo: datos de la OT, mano de obra, repuestos valorizados,
// pausas con su duración, costos totales y firma del técnico. Mismo lenguaje visual que el PDF de rampa.
import { generarPDFBlob, montarParaPDF } from '../../core/lib/pdf';
import {
  costosOT, duracionPausa, etiquetaEstado, formatoDuracion, otDetalles, otId, pausasDe, trabajoCosto, trabajosDeOT,
  type MaterialSalida, type OrdenTrabajo, type TrabajoOT,
} from './api';

/** Logo de la empresa del subdominio (el mismo de la barra lateral) */
export const LOGO_OT = '/api/tenant-logo';

export interface DatosOtPdf {
  ot: OrdenTrabajo;
  trabajos: TrabajoOT[];
  materiales: MaterialSalida[];
  usuario: string;
  logo?: string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const soles = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaHora = (s: string | null | undefined) => {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
};

const placa = (p: string | null | undefined) => `<span style="display:inline-block;padding:3px 12px;border:1.5px solid #1d1d1f;border-radius:10px;background:#ffffff;font-family:'SF Mono','Cascadia Mono',Menlo,monospace;font-weight:700;font-size:20px;letter-spacing:2px;color:#1d1d1f">${esc(p || '—')}</span>`;
const celda = (contenido: string, extra = '') => `<td style="padding:5px 8px;border-bottom:1px solid #f0f0f3;vertical-align:top;${extra}">${contenido}</td>`;
const encabezados = (cols: Array<[string, string?]>) => `<tr>${cols.map(([c, align]) => `<th style="padding:6px 8px;text-align:${align ?? 'left'};background:#f5f5f7;color:#6e6e73;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e5ea">${esc(c)}</th>`).join('')}</tr>`;
const seccion = (titulo: string, cuerpo: string) => `
  <div style="margin-top:16px">
    <div style="font-size:11px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">${esc(titulo)}</div>
    ${cuerpo}
  </div>`;
const vacio = (texto: string) => `<p style="font-size:12px;color:#6e6e73;margin:0">${esc(texto)}</p>`;

/** HTML del PDF de cierre de la OT */
export function htmlOtPdf(d: DatosOtPdf): string {
  const { ot } = d;
  const det = otDetalles(ot);
  const trabajos = trabajosDeOT(ot, d.trabajos);
  const materiales = d.materiales.filter(m => m.estado !== 'Anulado');
  const pausas = pausasDe(ot);
  const costos = costosOT(ot, d.trabajos, d.materiales);
  const enPausa = pausas.reduce((s, p) => s + duracionPausa(p), 0);
  const firma = typeof det.firma === 'string' ? det.firma : '';

  const datos: Array<[string, string]> = [
    ['Tipo', [det.tipo_ot, det.sub_tipo].filter(Boolean).join(' / ') || '—'],
    ['Técnico', ot.tecnico || '—'],
    ['Supervisor', ot.supervisor || '—'],
    ['Kilometraje', det.km ? `${Number(det.km).toLocaleString('es-PE')} km` : '—'],
    ['Ingreso', fechaHora(ot.fecha_ingreso)],
    ['Inicio de trabajo', fechaHora(ot.fecha_inicio_ot)],
    ['Salida', fechaHora(ot.fecha_hora_salida)],
    ['Tiempo en pausa', enPausa ? formatoDuracion(enPausa) : 'Sin pausas'],
  ];
  const grilla = datos.map(([k, v]) => `<div style="padding:6px 0;border-bottom:1px dotted #d2d2d7"><div style="font-size:10px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px">${esc(k)}</div><div style="font-size:13px;font-weight:600">${esc(v)}</div></div>`).join('');

  const tablaTrabajos = trabajos.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px">${encabezados([['Trabajo realizado'], ['Técnico'], ['Fecha'], ['Mano de obra', 'right']])}${trabajos.map(t => `<tr>${celda(esc(t.trabajo_realizado || '—'))}${celda(esc(t.tecnico || '—'))}${celda(esc(t.fecha_trabajo?.split('T')[0] ?? '—'))}${celda(soles(trabajoCosto(t)), 'text-align:right')}</tr>`).join('')}
        <tr><td colspan="3" style="padding:6px 8px;text-align:right;font-weight:700">Total mano de obra</td><td style="padding:6px 8px;text-align:right;font-weight:700">${soles(costos.manoObra)}</td></tr></table>`
    : vacio('Sin trabajos registrados.');

  const filasMat = materiales.flatMap(m => m.items.map(it => `<tr>${celda(esc(m.id), 'font-family:\'SF Mono\',Menlo,monospace;font-size:11px')}${celda(esc(it.descripcion || '—'))}${celda(esc(it.cantidad), 'text-align:right')}${celda(soles(it.costo_unitario), 'text-align:right')}${celda(soles(it.importe), 'text-align:right')}</tr>`));
  const tablaMat = filasMat.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px">${encabezados([['Salida'], ['Repuesto / material'], ['Cant.', 'right'], ['Costo U.', 'right'], ['Importe', 'right']])}${filasMat.join('')}
        <tr><td colspan="4" style="padding:6px 8px;text-align:right;font-weight:700">Total repuestos y materiales</td><td style="padding:6px 8px;text-align:right;font-weight:700">${soles(costos.repuestos)}</td></tr></table>`
    : vacio('Sin repuestos ni materiales despachados.');

  const tablaPausas = pausas.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px">${encabezados([['#'], ['Motivo'], ['Desde'], ['Hasta'], ['Duración', 'right']])}${pausas.map(p => `<tr>${celda(String(p.n))}${celda(esc(p.motivo))}${celda(esc(fechaHora(p.inicio)))}${celda(esc(p.fin ? fechaHora(p.fin) : 'En curso'))}${celda(formatoDuracion(duracionPausa(p)), 'text-align:right;font-family:\'SF Mono\',Menlo,monospace')}</tr>`).join('')}</table>`
    : vacio('Sin pausas registradas.');

  const costosBox = [
    ['Mano de obra', costos.manoObra],
    ['Repuestos y materiales', costos.repuestos],
    ['Otros', costos.otros],
  ].map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #d2d2d7;font-size:12px"><span style="color:#6e6e73">${esc(k)}</span><span style="font-family:'SF Mono',Menlo,monospace">${soles(Number(v))}</span></div>`).join('')
    + `<div style="display:flex;justify-content:space-between;padding:8px 0 0;font-size:15px;font-weight:700"><span>Costo total</span><span style="font-family:'SF Mono',Menlo,monospace">${soles(costos.total)}</span></div>`;

  const obs = [ot.observaciones, ot.comentario_cierre].filter(Boolean).join('\n\n');

  const emitido = new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter','Segoe UI',Roboto,sans-serif;color:#1d1d1f;width:190mm;padding:6mm 6mm 4mm;background:#ffffff">
    <div style="display:flex;align-items:center;gap:12px;padding-bottom:10px;border-bottom:1px solid #e5e5ea">
      <img src="${esc(d.logo ?? LOGO_OT)}" alt="Logo" style="height:46px;max-width:120px;object-fit:contain">
      <div style="flex:1">
        <div style="font-size:18px;font-weight:700;letter-spacing:-.2px">ORDEN DE TRABAJO · CIERRE</div>
        <div style="font-size:11px;color:#6e6e73">OT ${esc(otId(ot))} · Estado ${esc(etiquetaEstado(ot.estado))}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#6e6e73">Emitido ${esc(emitido)}</div>
    </div>

    <div style="display:flex;align-items:center;gap:14px;margin-top:12px">
      ${placa(ot.placa)}
      ${ot.id_rampa ? `<span style="font-size:12px;color:#334155">Rampa ${esc(ot.id_rampa)}</span>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:24px;margin-top:10px">${grilla}</div>

    ${seccion('Trabajos realizados', tablaTrabajos)}
    ${seccion('Repuestos y materiales', tablaMat)}
    ${seccion('Pausas', tablaPausas)}
    ${seccion('Costos', `<div style="max-width:320px;margin-left:auto">${costosBox}</div>`)}
    ${obs ? seccion('Observaciones', `<p style="font-size:12px;margin:0;white-space:pre-wrap">${esc(obs)}</p>`) : ''}

    <div style="margin-top:22px;padding-top:10px;border-top:1px solid #d2d2d7;display:flex;justify-content:space-between;align-items:flex-end;gap:16px">
      <div>
        <div style="font-size:10px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Firma del técnico</div>
        ${firma.startsWith('data:image') ? `<img src="${esc(firma)}" alt="Firma" style="max-height:90px;max-width:260px;object-fit:contain">` : vacio('Sin firma registrada.')}
        <div style="font-size:12px;font-weight:600;margin-top:4px">${esc(ot.cerrado_por || ot.tecnico || '—')}</div>
      </div>
      <div style="font-size:10px;color:#6e6e73;text-align:right">Generado en Azkell Fleet por ${esc(d.usuario || 'sistema')}</div>
    </div>
  </div>`;
}

/** PDF de cierre de la OT para descargar o compartir */
export async function pdfOt(d: DatosOtPdf): Promise<Blob> {
  const el = document.createElement('div');
  el.innerHTML = htmlOtPdf(d);
  const quitar = montarParaPDF(el);
  try {
    return await generarPDFBlob(el, { orientacion: 'portrait' });
  } finally { quitar(); }
}
