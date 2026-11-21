// Salidas de Frecuencias de mantenimiento: Excel y PDF con lo que se ve en pantalla (filtros y búsqueda aplicados).
import { ahoraLimaMin, hoyLima } from '../../core/lib/format';
import { exportarExcel } from '../../core/lib/excel';
import { exportarPDF } from '../../core/lib/pdf';

export interface FilaFrecuencia {
  marca: string; modelo: string | null; tipo_mp: string; tipo: string | null; sistema: string | null; combustible: string | null;
  uts: string | null; frecuencia_km: number | null; frecuencia_horas: number | null; frecuencia_dias: number | null; descripcion: string | null;
}

const ENCABEZADOS = ['Marca', 'Modelo', 'Tipo de MP', 'Tipo', 'Sistema', 'Combustible', 'UTS', 'Cada (km)', 'Cada (horas)', 'Cada (días)', 'Descripción'];
const num = (v: number | null) => (v ? Number(v) : null);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/** Excel con las frecuencias que se ven en pantalla */
export function exportarFrecuenciasExcel(filas: FilaFrecuencia[]) {
  return exportarExcel('Frecuencias_de_mantenimiento', 'Frecuencias', ENCABEZADOS, filas.map(f => [
    f.marca, f.modelo ?? '', f.tipo_mp, f.tipo ?? '', f.sistema ?? '', f.combustible ?? '', f.uts ?? '',
    num(f.frecuencia_km), num(f.frecuencia_horas), num(f.frecuencia_dias), f.descripcion ?? '',
  ]));
}

function construir(filas: FilaFrecuencia[], filtros: string[], empresa: string): { el: HTMLElement; retirar: () => void } {
  const fecha = ahoraLimaMin();
  const n = (v: number | null) => (v ? Number(v).toLocaleString('es-PE') : '—');
  const el = document.createElement('div');
  el.style.cssText = 'box-sizing:border-box;width:1080px;padding:28px 0;background:#fff;color:#1d1d1f;font-family:Arial,Helvetica,sans-serif;';
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1d1d1f;padding-bottom:12px;margin-bottom:14px">
      <div>
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6e6e73">${esc(empresa)} · Azkell Fleet</div>
        <div style="font-size:24px;font-weight:700;margin-top:2px">Frecuencias de mantenimiento</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#6e6e73">${esc(fecha)}<br>${filas.length} ${filas.length === 1 ? 'frecuencia' : 'frecuencias'}</div>
    </div>
    <div style="font-size:12px;color:#424245;margin-bottom:14px"><strong>Filtros:</strong> ${filtros.length ? filtros.map(esc).join(' · ') : 'ninguno, todas las frecuencias'}</div>
    <table style="width:100%;border-collapse:collapse;font-size:10px">
      <thead><tr>${ENCABEZADOS.map(h => `<th style="text-align:left;padding:6px 6px;background:#f5f5f7;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#6e6e73;border-bottom:1px solid #d2d2d7">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${filas.map(f => `<tr style="page-break-inside:avoid">${[
        esc(f.marca), esc(f.modelo), `<strong>${esc(f.tipo_mp)}</strong>`, esc(f.tipo), esc(f.sistema), esc(f.combustible), esc(f.uts),
        n(f.frecuencia_km), n(f.frecuencia_horas), n(f.frecuencia_dias), esc(f.descripcion),
      ].map(c => `<td style="padding:4px 6px;border-bottom:1px solid #e5e5ea">${c || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  // html2canvas no dibuja un elemento fuera de flujo: va dentro de una caja de 0×0 que lo oculta
  const caja = document.createElement('div');
  caja.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;';
  caja.appendChild(el);
  document.body.appendChild(caja);
  return { el, retirar: () => caja.remove() };
}

/** PDF con las frecuencias que se ven en pantalla */
export async function descargarFrecuenciasPDF(filas: FilaFrecuencia[], filtros: string[], empresa: string) {
  const { el, retirar } = construir(filas, filtros, empresa);
  try {
    await exportarPDF(el, `Frecuencias de mantenimiento ${hoyLima()}`, { orientacion: 'landscape', paginado: true });
  } finally {
    retirar();
  }
}
