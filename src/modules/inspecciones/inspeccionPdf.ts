// Informe técnico ejecutivo de una inspección: membrete con el logo de la empresa, placa, km, fecha, técnico,
// evaluación por sistemas (✓ / ✕ / %), observaciones bajo cada falla, evidencia fotográfica y firma del inspector.
import { generarPDFBlob, montarParaPDF } from '../../core/lib/pdf';
import type { Inspeccion, PuntoRevisado } from './api';

/** Logo de la empresa del subdominio (el mismo de la barra lateral) */
export const LOGO_INSPECCION = '/api/tenant-logo';

export interface DatosInspeccionPdf {
  inspeccion: Inspeccion;
  /** URL firmada por foto (clave = URL guardada); si falta una, se usa la original */
  fotos: Record<string, string>;
  usuario: string;
  logo?: string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const fechaCorta = (d: Date | null) => (d ? d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const sumarDias = (d: Date | null, dias: number) => (d ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias) : null);

const placa = (p: string) => `<span style="display:inline-block;padding:3px 12px;border:1.5px solid #1d1d1f;border-radius:10px;background:#ffffff;font-family:'SF Mono','Cascadia Mono',Menlo,monospace;font-weight:700;font-size:20px;letter-spacing:2px;color:#1d1d1f">${esc(p || '—')}</span>`;

/** Marca de cada punto: ✓ OK, ✕ falla, % si se midió un porcentaje, — sin datos */
function marca(estado: string): string {
  const e = estado.toUpperCase();
  if (e === 'OK') return '<span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:10px;background:#dcfce7;color:#15803d;font-weight:700;text-align:center;font-size:12px">✓</span>';
  if (e === 'FALLA') return '<span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:10px;background:#fee2e2;color:#b91c1c;font-weight:700;text-align:center;font-size:12px">✕</span>';
  const pct = estado.match(/^(\d{1,3})%$/);
  if (pct) return `<span style="display:inline-block;min-width:38px;padding:2px 6px;border-radius:10px;background:#f5f5f7;color:#1d1d1f;font-weight:600;text-align:center;font-size:11px;font-family:'SF Mono',Menlo,monospace">${esc(pct[0])}</span>`;
  return '<span style="color:#a1a1a6;font-size:12px">—</span>';
}

const celda = (contenido: string, extra = '') => `<td style="padding:6px 8px;border-bottom:1px solid #f0f0f3;vertical-align:top;${extra}">${contenido}</td>`;
const encabezados = (cols: string[]) => `<tr>${cols.map(c => `<th style="padding:6px 8px;text-align:left;background:#f5f5f7;color:#6e6e73;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e5ea">${esc(c)}</th>`).join('')}</tr>`;
const seccion = (titulo: string, cuerpo: string) => `
  <div style="margin-top:16px">
    <div style="font-size:11px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">${esc(titulo)}</div>
    ${cuerpo}
  </div>`;

/** Agrupa los puntos por sistema (categoría), con las fallas primero dentro de cada grupo */
function porCategoria(puntos: PuntoRevisado[]): Array<[string, PuntoRevisado[]]> {
  const g = new Map<string, PuntoRevisado[]>();
  puntos.forEach(p => g.set(p.categoria, [...(g.get(p.categoria) ?? []), p]));
  const orden = (p: PuntoRevisado) => (p.estado.toUpperCase() === 'FALLA' ? 0 : 1);
  return [...g.entries()].map(([cat, ps]) => [cat, [...ps].sort((a, b) => orden(a) - orden(b))]);
}

/** HTML del informe técnico */
export function htmlInspeccionPdf(d: DatosInspeccionPdf): string {
  const i = d.inspeccion;
  const puntos = i.puntos;
  const ok = puntos.filter(p => p.estado.toUpperCase() === 'OK').length;
  const falla = puntos.filter(p => p.estado.toUpperCase() === 'FALLA').length;
  const medidos = puntos.filter(p => /^\d{1,3}%$/.test(p.estado)).length;
  const vigencia = sumarDias(i.fecha, i.diasPropuestos);
  const foto = (url: string) => d.fotos[url] ?? url;

  const datos: Array<[string, string]> = [
    ['Cliente', i.cliente || '—'],
    ['Fecha de inspección', fechaCorta(i.fecha)],
    ['Kilometraje', i.km !== null ? `${i.km.toLocaleString('es-PE')} km` : '—'],
    ['Técnico inspector', i.tecnico || '—'],
    ['Tipo de inspección', i.tipo || '—'],
    ['Vigente hasta', fechaCorta(vigencia)],
  ];
  const grilla = datos.map(([k, v]) => `<div style="padding:6px 0;border-bottom:1px dotted #d2d2d7"><div style="font-size:10px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px">${esc(k)}</div><div style="font-size:13px;font-weight:600">${esc(v)}</div></div>`).join('');

  const resumen = [
    ['En buen estado', String(ok), '#15803d'],
    ['Con falla', String(falla), '#b91c1c'],
    ['Medidos', String(medidos), '#1d1d1f'],
  ].map(([k, v, c]) => `<div style="flex:1;padding:8px 10px;border:1px solid #e5e5ea;border-radius:10px"><div style="font-size:18px;font-weight:700;color:${c}">${v}</div><div style="font-size:10px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px">${k}</div></div>`).join('');

  const evaluacion = porCategoria(puntos).map(([cat, ps]) => {
    const filas = ps.map(p => {
      const esFalla = p.estado.toUpperCase() === 'FALLA';
      const obs = p.observacion
        ? `<div style="margin-top:3px;font-size:11px;color:${esFalla ? '#b91c1c' : '#6e6e73'};white-space:pre-wrap">${esc(p.observacion)}</div>`
        : '';
      return `<tr>${celda(esc(p.item), `font-weight:${esFalla ? 600 : 400}`)}${celda(marca(p.estado), 'text-align:center;width:90px')}${celda(obs || '<span style="color:#a1a1a6">—</span>')}</tr>`;
    }).join('');
    const n = ps.filter(p => p.estado.toUpperCase() === 'FALLA').length;
    return seccion(`${cat}${n ? ` · ${n} falla${n === 1 ? '' : 's'}` : ''}`, `<table style="width:100%;border-collapse:collapse;font-size:12px">${encabezados(['Punto revisado', 'Estado', 'Observación'])}${filas}</table>`);
  }).join('') || '<p style="font-size:12px;color:#6e6e73;margin:0">Sin puntos revisados.</p>';

  const conFoto = puntos.filter(p => p.foto);
  const evidencia = conFoto.length
    ? `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">${conFoto.map(p => `
        <div style="border:1px solid #e5e5ea;border-radius:8px;overflow:hidden;background:#ffffff">
          <img src="${esc(foto(p.foto))}" alt="${esc(p.item)}" style="display:block;width:100%;height:120px;object-fit:cover">
          <div style="padding:4px 6px;font-size:10px;color:#6e6e73">${esc(p.categoria)} · ${esc(p.item)}</div>
        </div>`).join('')}</div>`
    : '<p style="font-size:12px;color:#6e6e73;margin:0">Sin evidencia fotográfica.</p>';

  const firma = i.firma
    ? `<img src="${esc(foto(i.firma))}" alt="Firma del inspector" style="max-height:90px;max-width:260px;object-fit:contain">`
    : '<p style="font-size:12px;color:#6e6e73;margin:0">Sin firma registrada.</p>';

  const emitido = new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter','Segoe UI',Roboto,sans-serif;color:#1d1d1f;width:190mm;padding:6mm 6mm 4mm;background:#ffffff">
    <div style="display:flex;align-items:center;gap:12px;padding-bottom:10px;border-bottom:1px solid #e5e5ea">
      <img src="${esc(d.logo ?? LOGO_INSPECCION)}" alt="Logo" style="height:46px;max-width:120px;object-fit:contain">
      <div style="flex:1">
        <div style="font-size:18px;font-weight:700;letter-spacing:-.2px">INFORME TÉCNICO EJECUTIVO</div>
        <div style="font-size:11px;color:#6e6e73">Inspección N° ${esc(i.id)} · ${esc(i.tipo || 'General')}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#6e6e73">Emitido ${esc(emitido)}</div>
    </div>

    <div style="display:flex;align-items:center;gap:14px;margin-top:12px">
      ${placa(i.placa)}
      ${i.idOt ? `<span style="font-size:12px;color:#334155">OT vinculada ${esc(i.idOt)}</span>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:24px;margin-top:10px">${grilla}</div>

    <div style="display:flex;gap:8px;margin-top:12px">${resumen}</div>

    ${evaluacion}
    ${seccion('Evidencia fotográfica', evidencia)}

    <div style="margin-top:22px;padding-top:10px;border-top:1px solid #d2d2d7;display:flex;justify-content:space-between;align-items:flex-end;gap:16px">
      <div>
        <div style="font-size:10px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Firma del inspector</div>
        ${firma}
        <div style="font-size:12px;font-weight:600;margin-top:4px">${esc(i.tecnico || '—')}</div>
      </div>
      <div style="font-size:10px;color:#6e6e73;text-align:right">Generado en Azkell Fleet por ${esc(d.usuario || 'sistema')}</div>
    </div>
  </div>`;
}

/** PDF del informe técnico para descargar o compartir */
export async function pdfInspeccion(d: DatosInspeccionPdf): Promise<Blob> {
  const el = document.createElement('div');
  el.innerHTML = htmlInspeccionPdf(d);
  const quitar = montarParaPDF(el);
  try {
    return await generarPDFBlob(el, { orientacion: 'portrait' });
  } finally { quitar(); }
}
