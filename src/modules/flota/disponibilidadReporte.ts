// Reporte PDF de la disponibilidad: lo que se ve con los filtros, en horizontal.
// Mismo formato que el reporte de placas (encabezado, criterios, cifras y tabla).
import { compartirPDF, exportarPDF, generarPDFBlob, montarParaPDF } from '../../core/lib/pdf';
import type { VehiculoDisponibilidad } from './api';

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const hoy = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD en hora local
const OPCIONES = { orientacion: 'landscape' as const, paginado: true };

export interface CifrasDisponibilidad { total: number; base: number; ruta: number; mantenimiento: number }

function construirReporte(filas: VehiculoDisponibilidad[], cifras: CifrasDisponibilidad, criterios: string[], empresa: string): HTMLElement {
  const fecha = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
  const hora = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  const bloques: Array<[string, number]> = [
    ['Total', cifras.total], ['En base', cifras.base], ['En ruta', cifras.ruta], ['En mantenimiento', cifras.mantenimiento],
  ];
  const cabeceras = ['Camión', 'Carreta', 'Conductor', 'Estado', 'Marca', 'Tipo', 'Capacidad', 'Empresa', 'Observaciones'];

  const el = document.createElement('div');
  el.style.cssText = 'box-sizing:border-box;width:1080px;padding:28px 0;background:#fff;color:#1d1d1f;font-family:Arial,Helvetica,sans-serif;';
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1d1d1f;padding-bottom:12px;margin-bottom:14px">
      <div>
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6e6e73">${esc(empresa)} · Azkell Fleet</div>
        <div style="font-size:24px;font-weight:700;margin-top:2px">Disponibilidad de flota</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#6e6e73">${esc(fecha)} · ${esc(hora)}<br>${filas.length} ${filas.length === 1 ? 'unidad' : 'unidades'}</div>
    </div>
    <div style="font-size:12px;color:#424245;margin-bottom:14px"><strong>Filtros:</strong> ${criterios.length ? criterios.map(esc).join(' · ') : 'ninguno, toda la flota'}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px"><tr>${bloques
      .map(([etiqueta, valor]) => `<td style="padding:8px 12px;background:#f5f5f7;text-align:center"><div style="font-size:18px;font-weight:700">${valor}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6e6e73">${etiqueta}</div></td>`)
      .join('<td style="width:8px"></td>')}</tr></table>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr>${cabeceras.map(h => `<th style="text-align:left;padding:7px 8px;background:#f5f5f7;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6e6e73;border-bottom:1px solid #d2d2d7">${h}</th>`).join('')}</tr></thead>
      <tbody>${filas.map(v => `<tr style="page-break-inside:avoid">${[
        `<strong style="letter-spacing:.06em">${esc(v.placa_camion || '')}</strong>`,
        esc(v.placa_carreta || ''), esc(v.conductor_asignado || ''), esc(v.estado || ''), esc(v.marca || ''),
        esc(v.tipo_unidad || ''), esc(v.capacidad_tanque || ''), esc(v.empresa || ''), esc(v.observaciones || ''),
      ].map(c => `<td style="padding:6px 8px;border-bottom:1px solid #e5e5ea">${c || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  return el;
}

/** Descarga el PDF de la disponibilidad que se ve */
export async function descargarDisponibilidadPDF(filas: VehiculoDisponibilidad[], cifras: CifrasDisponibilidad, criterios: string[], empresa: string) {
  const el = construirReporte(filas, cifras, criterios, empresa);
  const retirar = montarParaPDF(el);
  try {
    await exportarPDF(el, `Disponibilidad de flota ${hoy()}`, OPCIONES);
  } finally {
    retirar();
  }
}

/** Envía por WhatsApp el PDF de la disponibilidad que se ve */
export async function compartirDisponibilidadPDF(filas: VehiculoDisponibilidad[], cifras: CifrasDisponibilidad, criterios: string[], empresa: string) {
  const el = construirReporte(filas, cifras, criterios, empresa);
  const retirar = montarParaPDF(el);
  let blob: Blob;
  try {
    blob = await generarPDFBlob(el, OPCIONES);
  } finally {
    retirar();
  }
  const texto = `Disponibilidad de flota: ${filas.length} ${filas.length === 1 ? 'unidad' : 'unidades'} (${hoy()})`;
  return compartirPDF(blob, `Disponibilidad de flota ${hoy()}.pdf`, texto);
}
