// Salidas de la lista de placas: Excel (mismas columnas que la importación), reporte PDF y envío
// por WhatsApp. Todo parte de las unidades ya filtradas.
import { exportarExcel } from '../../core/lib/excel';
import { exportarPDF, generarPDFBlob } from '../../core/lib/pdf';
import type { Placa } from './api';
import { ENCABEZADOS } from './importar';

const hoy = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD en hora local
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/** Una unidad como fila de la plantilla de importación (mismo orden de columnas) */
function filaExcel(p: Placa): string[] {
  return [
    p.placa, p.cliente, p.ruc, p.marca, p.modelo, p.modeloMotor, p.tipo, p.subTipo, p.color, p.nroMotor,
    p.nroCaja, p.nroCorona, p.vin, p.configuracion, p.tanque1, p.tanque2, p.tanque3, p.anio, p.combustible, p.tara,
    p.cargaUtil, p.pesoNeto, p.pesoBruto, p.estado, p.uts, p.motora ? 'Motora' : 'No Motora', p.llantas, p.enUso ? 'Si' : 'No',
  ];
}

/** Excel con las unidades filtradas. Tiene las mismas columnas que la importación, así se puede volver a cargar. */
export function exportarPlacasExcel(placas: Placa[]) {
  return exportarExcel('Placas', 'Placas', ENCABEZADOS, placas.map(filaExcel));
}

/** Reporte en horizontal: encabezado, criterios usados, cifras y tabla de unidades */
function construirReporte(placas: Placa[], filtros: string[], empresa: string): { el: HTMLElement; retirar: () => void } {
  const fecha = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
  const motoras = placas.filter(p => p.motora).length;
  const activas = placas.filter(p => p.estado.toLowerCase() === 'activa').length;
  const cifras: Array<[string, number]> = [
    ['Total', placas.length], ['Motoras', motoras], ['No motoras', placas.length - motoras],
    ['Activas', activas], ['Inactivas', placas.length - activas],
  ];
  const cabeceras = ['Placa', 'Tipo', 'Marca y modelo', 'Cliente', 'Año', 'Combustible', 'UTS', 'Clase', 'Estado'];

  const el = document.createElement('div');
  el.style.cssText = 'box-sizing:border-box;width:1080px;padding:28px 0;background:#fff;color:#1d1d1f;font-family:Arial,Helvetica,sans-serif;';
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1d1d1f;padding-bottom:12px;margin-bottom:14px">
      <div>
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6e6e73">${esc(empresa)} · Azkell Fleet</div>
        <div style="font-size:24px;font-weight:700;margin-top:2px">Reporte de placas</div>
      </div>
      <div style="text-align:right;font-size:12px;color:#6e6e73">${esc(fecha)}<br>${placas.length} ${placas.length === 1 ? 'unidad' : 'unidades'}</div>
    </div>
    <div style="font-size:12px;color:#424245;margin-bottom:14px"><strong>Filtros:</strong> ${filtros.length ? filtros.map(esc).join(' · ') : 'ninguno, todas las unidades'}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px"><tr>${cifras
      .map(([etiqueta, valor]) => `<td style="padding:8px 12px;background:#f5f5f7;text-align:center"><div style="font-size:18px;font-weight:700">${valor}</div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6e6e73">${etiqueta}</div></td>`)
      .join('<td style="width:8px"></td>')}</tr></table>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr>${cabeceras.map(h => `<th style="text-align:left;padding:7px 8px;background:#f5f5f7;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6e6e73;border-bottom:1px solid #d2d2d7">${h}</th>`).join('')}</tr></thead>
      <tbody>${placas.map(p => `<tr style="page-break-inside:avoid">${[
        `<strong style="letter-spacing:.06em">${esc(p.placa)}</strong>`,
        esc(p.tipo), esc([p.marca, p.modelo].filter(Boolean).join(' ')), esc(p.cliente), esc(p.anio),
        esc(p.combustible), esc(p.uts), p.motora ? 'Motora' : 'No motora', esc(p.estado),
      ].map(c => `<td style="padding:6px 8px;border-bottom:1px solid #e5e5ea">${c || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  // html2canvas no dibuja un elemento posicionado fuera de flujo: va dentro de una caja de 0×0 que lo oculta
  const caja = document.createElement('div');
  caja.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;';
  caja.appendChild(el);
  document.body.appendChild(caja);
  return { el, retirar: () => caja.remove() };
}

const OPCIONES_PDF = { orientacion: 'landscape' as const, paginado: true };

/** Descarga el reporte de las unidades filtradas */
export async function descargarReportePDF(placas: Placa[], filtros: string[], empresa: string) {
  const { el, retirar } = construirReporte(placas, filtros, empresa);
  try {
    await exportarPDF(el, `Reporte de placas ${hoy()}`, OPCIONES_PDF);
  } finally {
    retirar();
  }
}

function descargarArchivo(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Envía el PDF por WhatsApp.
 * - Celular (y navegadores que permiten compartir archivos): hoja de compartir del sistema, con WhatsApp.
 * - Escritorio: el PDF se descarga y se abre WhatsApp con el texto, para adjuntarlo ahí.
 */
export async function compartirReportePDF(placas: Placa[], filtros: string[], empresa: string): Promise<'compartido' | 'descargado' | 'cancelado'> {
  const { el, retirar } = construirReporte(placas, filtros, empresa);
  let blob: Blob;
  try {
    blob = await generarPDFBlob(el, OPCIONES_PDF);
  } finally {
    retirar();
  }
  const nombre = `Reporte de placas ${hoy()}.pdf`;
  const archivo = new File([blob], nombre, { type: 'application/pdf' });
  const texto = `Reporte de placas: ${placas.length} ${placas.length === 1 ? 'unidad' : 'unidades'} (${hoy()})`;

  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: 'Reporte de placas', text: texto });
      return 'compartido';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelado';
      // Si el sistema no permite compartir, se sigue por la descarga
    }
  }
  descargarArchivo(blob, nombre);
  window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}. Adjunta el PDF descargado.`)}`, '_blank', 'noopener');
  return 'descargado';
}
