// Comprobante de salida (PDF). Mismo diseño y mismos campos que el clásico (salBuildPDFHtml):
// cabecera, OT, tipo destino, placa, responsable, motivo de anulación, artículos, total y observaciones.
import { generarPDFBlob, montarParaPDF } from '../../core/lib/pdf';
import { estadoSalida, type SalidaInv } from './api';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const n2 = (v: number) => v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Fecha de la salida como AAAA-MM-DD (sin hora) */
const fechaSalida = (s: SalidaInv) => (s.fecha ? String(s.fecha).split('T')[0] : '—');

export function htmlSalidaPdf(m: SalidaInv): string {
  const items = m.items ?? [];
  const totalPen = Number(m.total_pen) || 0;
  const anulada = estadoSalida(m) === 'Anulado';

  const filas = items.map((it, i) => {
    const cant = Number(it.cantidad) || 0;
    const cu = Number(it.costo_unitario) || 0;
    const imp = Number(it.importe) || cant * cu;
    const fondo = i % 2 === 0 ? '#f9fafb' : '#ffffff';
    return `<tr style="background:${fondo}">`
      + `<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">${esc(it.descripcion || it.inventario_id || '—')}</td>`
      + `<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:center">${cant.toLocaleString('es-PE', { maximumFractionDigits: 3 })}</td>`
      + `<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right">S/ ${cu.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>`
      + `<td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:600">S/ ${n2(imp)}</td>`
      + '</tr>';
  }).join('');

  const badgeAnulada = anulada
    ? '<span style="display:inline-block;padding:2px 10px;background:#fee2e2;color:#dc2626;border-radius:12px;font-size:11px;font-weight:700;margin-left:8px;">ANULADA</span>'
    : '';
  const motivo = anulada && m.motivo_anulacion
    ? `<div style="padding:10px 14px;background:#fee2e2;border-radius:6px;border-left:3px solid #dc2626;font-size:12px;margin-bottom:12px"><b>Motivo anulación: </b>${esc(m.motivo_anulacion)}</div>`
    : '';
  const campo = (k: string, v: string) => `<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:3px">${k}</div><div style="font-size:13px;font-weight:600">${esc(v)}</div></div>`;

  return '<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#1e293b">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #2563eb">'
    + '<div><div style="font-size:22px;font-weight:700;color:#2563eb">AZKELL FLEET</div><div style="font-size:11px;color:#64748b;margin-top:2px">Sistema de Gestión de Flotas</div></div>'
    + `<div style="text-align:right"><div style="font-size:18px;font-weight:700">COMPROBANTE DE SALIDA${badgeAnulada}</div>`
    + `<div style="font-size:13px;color:#2563eb;font-weight:600;margin-top:4px">${esc(m.id ?? '—')}</div>`
    + `<div style="font-size:11px;color:#64748b;margin-top:2px">Fecha: ${esc(fechaSalida(m))}</div></div>`
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;padding:14px 16px;background:#f1f5f9;border-radius:8px">'
    + campo('OT Referencia', m.ticket_ot || '—')
    + campo('Tipo Destino', m.tipo_destino || '—')
    + campo('Placa', m.placa || '—')
    + campo('Responsable', m.responsable || '—')
    + '</div>'
    + motivo
    + '<table style="width:100%;border-collapse:collapse;margin-bottom:16px"><thead><tr style="background:#2563eb;color:#fff">'
    + '<th style="padding:9px 10px;text-align:left;font-size:11px;text-transform:uppercase">Artículo</th>'
    + '<th style="padding:9px 10px;text-align:center;font-size:11px;text-transform:uppercase">Cantidad</th>'
    + '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase">Costo Unit.</th>'
    + '<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase">Importe</th>'
    + `</tr></thead><tbody>${filas}</tbody></table>`
    + '<div style="display:flex;justify-content:flex-end;margin-bottom:20px"><div style="min-width:220px">'
    + '<div style="display:flex;justify-content:space-between;padding:10px 12px;background:#2563eb;color:#fff;border-radius:6px;font-size:14px;font-weight:700">'
    + `<span>TOTAL PEN</span><span>S/ ${n2(totalPen)}</span></div></div></div>`
    + (m.observaciones ? `<div style="padding:10px 14px;background:#fef9c3;border-radius:6px;border-left:3px solid #eab308;font-size:12px;margin-bottom:12px"><b>Obs.: </b>${esc(m.observaciones)}</div>` : '')
    + '<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8">'
    + `<span>Generado: ${esc(new Date().toLocaleString('es-PE'))}</span>`
    + '<span>Azkell Fleet — Sistema de Gestión de Flotas</span></div>'
    + '</div>';
}

/** Genera el PDF del comprobante (el elemento se monta fuera de la vista solo mientras se genera) */
export async function pdfSalida(m: SalidaInv): Promise<Blob> {
  const caja = document.createElement('div');
  caja.innerHTML = htmlSalidaPdf(m);
  const hoja = caja.firstElementChild as HTMLElement;
  hoja.style.width = '700px';
  hoja.style.background = '#ffffff';
  const quitar = montarParaPDF(hoja);
  try {
    return await generarPDFBlob(hoja, { margen: 8, titulo: `Salida ${m.id}` });
  } finally {
    quitar();
  }
}
