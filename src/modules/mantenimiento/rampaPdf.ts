// PDF de una rampa (parte de visita): membrete con el logo de la empresa, placa, tiempos reales, técnico responsable,
// OT ejecutadas, trabajos, materiales y evidencia de S3. Parte de la estructura de generarPDF_OT de la versión actual
// (Modulos/mantenimiento/reportes-ot/logica.js) y la enriquece con el diseño de Azkell.
import { generarPDFBlob, montarParaPDF } from '../../core/lib/pdf';
import type { OrdenTrabajo, RampaEntrada, TrabajoOT } from './api';

/** Logo de la empresa del subdominio (el mismo de la barra lateral) */
export const LOGO_RAMPA = '/api/tenant-logo';

export interface MaterialOT {
  id: string;
  fecha: string;
  responsable: string | null;
  estado: string;
  total_pen: number;
  moneda: string;
  items: Array<{ descripcion: string; cantidad: number; costo_unitario: number; importe: number }>;
}

export interface DatosRampaPdf {
  entrada: RampaEntrada;
  /** OT de la visita (ordenes de trabajo completas) */
  ots: OrdenTrabajo[];
  /** Trabajos de esas OT */
  trabajos: TrabajoOT[];
  /** Solicitudes de material por OT */
  materiales: Array<{ id_ot: string; solicitud: MaterialOT }>;
  /** URL firmada de la evidencia (o null) */
  evidenciaFirmada: string | null;
  usuario: string;
  logo?: string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const fecha = (v: string | null | undefined) => {
  const t = String(v ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t.split('-').reverse().join('/') : '—';
};
const hora = (v: string | null | undefined) => (String(v ?? '').match(/(\d{2}:\d{2})/)?.[1]) ?? '—';
const soles = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Placa con la estética de LicensePlate: fondo blanco, borde oscuro, dígitos monoespaciados */
const placa = (p: string | null | undefined) => `<span style="display:inline-block;padding:3px 12px;border:2px solid #0f172a;border-radius:6px;background:#ffffff;font-family:'Courier New',monospace;font-weight:700;font-size:20px;letter-spacing:2px;color:#0f172a">${esc(p || '—')}</span>`;

function detalle(ot: OrdenTrabajo): Record<string, unknown> {
  const d = ot.detalles_json;
  if (!d) return {};
  if (typeof d === 'string') { try { return JSON.parse(d) as Record<string, unknown>; } catch { return {}; } }
  return d as Record<string, unknown>;
}

/** Tiempo en rampa en horas y texto (días/horas) */
function tiempo(e: RampaEntrada): string {
  const ini = e.fecha_ingreso ? new Date(`${String(e.fecha_ingreso).slice(0, 10)}T${e.hora_ingreso ?? '00:00'}`) : null;
  if (!ini || Number.isNaN(ini.getTime())) return '—';
  const fin = e.fecha_salida ? new Date(e.fecha_salida) : new Date();
  const h = Math.max(0, (fin.getTime() - ini.getTime()) / 3_600_000);
  return h >= 24 ? `${Math.floor(h / 24)} d ${Math.round(h % 24)} h` : `${h.toFixed(1)} h`;
}

const celda = (t: unknown, extra = '') => `<td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top;${extra}">${esc(t ?? '—')}</td>`;
const encabezados = (cols: string[]) => `<tr>${cols.map(c => `<th style="padding:6px 8px;text-align:left;background:#eef4fb;color:#0056b3;font-size:11px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #0056b3">${esc(c)}</th>`).join('')}</tr>`;
const seccion = (titulo: string, cuerpo: string) => `
  <div style="margin-top:16px">
    <div style="font-size:12px;font-weight:700;color:#0056b3;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #93c5fd;padding-bottom:3px;margin-bottom:6px">${esc(titulo)}</div>
    ${cuerpo}
  </div>`;

/** HTML del PDF de la rampa */
export function htmlRampaPdf(d: DatosRampaPdf): string {
  const e = d.entrada;
  const otsVisita = d.ots.filter(o => (o.ticket_entrada && o.ticket_entrada === e.ticket_entrada) || (o.id_rampa && o.id_rampa === e.id));
  const idsOt = new Set(otsVisita.map(o => o.id_ot));
  const trabajos = d.trabajos.filter(t => idsOt.has(t.id_ot) || (e.ticket_entrada && t.ticket_visita === e.ticket_entrada));
  const materiales = d.materiales.filter(m => idsOt.has(m.id_ot));
  const tecnico = otsVisita.map(o => o.tecnico ?? o.supervisor).find(Boolean) ?? '—';
  const totalMat = materiales.reduce((s, m) => s + (Number(m.solicitud.total_pen) || 0), 0);

  const datos = [
    ['Ingreso', `${fecha(e.fecha_ingreso)} · ${hora(e.hora_ingreso)}`],
    ['Salida programada', `${fecha(e.salida_programada)} · ${hora(e.hora_salida_programada)}`],
    ['Salida real', e.fecha_salida ? `${fecha(e.fecha_salida)} · ${hora(e.fecha_salida)}` : 'En curso'],
    ['Tiempo en rampa', tiempo(e)],
    ['Conductor', e.conductor ?? e.chofer ?? '—'],
    ['Kilometraje', e.km ? String(e.km) : '—'],
    ['Situación', e.situacion ?? '—'],
    ['Técnico responsable', tecnico],
  ];
  const grilla = datos.map(([k, v]) => `<div style="padding:6px 0;border-bottom:1px dotted #cbd5e1"><div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">${esc(k)}</div><div style="font-size:13px;font-weight:600">${esc(v)}</div></div>`).join('');

  const tablaOts = otsVisita.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px">${encabezados(['N° OT', 'Tipo', 'Sub tipo', 'Estado', 'Técnico'])}${otsVisita.map(o => {
      const det = detalle(o);
      return `<tr>${celda(o.id_ot)}${celda(det.tipo_ot ?? '—')}${celda(det.sub_tipo ?? '—')}${celda(o.estado)}${celda(o.tecnico ?? o.supervisor ?? '—')}</tr>`;
    }).join('')}</table>`
    : '<p style="font-size:12px;color:#64748b;margin:0">Sin órdenes de trabajo en esta visita.</p>';

  const tablaTrab = trabajos.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px">${encabezados(['OT', 'Trabajo realizado', 'Técnico', 'Estado'])}${trabajos.map(t => `<tr>${celda(t.id_ot)}${celda(t.trabajo_realizado)}${celda(t.tecnico)}${celda(t.estado)}</tr>`).join('')}</table>`
    : '<p style="font-size:12px;color:#64748b;margin:0">Sin trabajos registrados.</p>';

  const filasMat = materiales.flatMap(m => m.solicitud.items.map(it => `<tr>${celda(m.id_ot)}${celda(it.descripcion)}${celda(it.cantidad, 'text-align:right')}${celda(soles(it.costo_unitario), 'text-align:right')}${celda(soles(it.importe), 'text-align:right')}</tr>`));
  const tablaMat = filasMat.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px">${encabezados(['OT', 'Repuesto / material', 'Cant.', 'Costo U.', 'Importe'])}${filasMat.join('')}
        <tr><td colspan="4" style="padding:6px 8px;text-align:right;font-weight:700">Total materiales</td><td style="padding:6px 8px;text-align:right;font-weight:700">${soles(totalMat)}</td></tr></table>`
    : '<p style="font-size:12px;color:#64748b;margin:0">Sin repuestos ni materiales solicitados.</p>';

  const evidencia = d.evidenciaFirmada
    ? `<img src="${esc(d.evidenciaFirmada)}" alt="Evidencia de la rampa" style="max-width:100%;max-height:260px;border-radius:8px;border:1px solid #e2e8f0">`
    : '<p style="font-size:12px;color:#64748b;margin:0">Sin evidencia fotográfica.</p>';

  const emitido = new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;width:190mm;padding:6mm 6mm 4mm;background:#ffffff">
    <div style="display:flex;align-items:center;gap:12px;padding-bottom:8px;border-bottom:3px solid #0056b3">
      <img src="${esc(d.logo ?? LOGO_RAMPA)}" alt="Logo" style="height:46px;max-width:120px;object-fit:contain">
      <div style="flex:1">
        <div style="font-size:18px;font-weight:700;color:#0056b3;letter-spacing:.4px">PARTE DE RAMPA · TALLER</div>
        <div style="font-size:11px;color:#64748b">Ticket ${esc(e.ticket_entrada ?? '—')} · ${esc(e.rampa)}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#64748b">Emitido ${esc(emitido)}</div>
    </div>

    <div style="display:flex;align-items:center;gap:14px;margin-top:12px">
      ${placa(e.placa)}
      <span style="font-size:12px;color:#334155">${esc(e.rampa)} · ${esc(e.situacion ?? '')}</span>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:24px;margin-top:10px">${grilla}</div>

    ${seccion('Órdenes de trabajo ejecutadas', tablaOts)}
    ${seccion('Trabajos realizados', tablaTrab)}
    ${seccion('Repuestos y materiales', tablaMat)}
    ${seccion('Observaciones', `<p style="font-size:12px;margin:0;white-space:pre-wrap">${esc(e.observaciones ?? '—')}</p>`)}
    ${seccion('Evidencia', evidencia)}

    <div style="margin-top:22px;padding-top:6px;border-top:1px solid #cbd5e1;font-size:10px;color:#64748b;display:flex;justify-content:space-between">
      <span>Generado en Azkell Fleet por ${esc(d.usuario || 'sistema')}</span>
      <span>Documento de control de taller</span>
    </div>
  </div>`;
}

/** PDF de la rampa para descargar o compartir */
export async function pdfRampa(d: DatosRampaPdf): Promise<Blob> {
  const el = document.createElement('div');
  el.innerHTML = htmlRampaPdf(d);
  const quitar = montarParaPDF(el);
  try {
    return await generarPDFBlob(el, { orientacion: 'portrait' });
  } finally { quitar(); }
}
