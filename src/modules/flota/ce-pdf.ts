// PDF oficial del acta "Inventario físico estado de vehículo" (F-SEG-004) y envío por WhatsApp.
// Mismo documento que el clásico (modulos/flota/entrega-vehiculos/logica.js › _evConstruirHtmlPDF, _evRenderPdfBlob,
// _evGetPdfFilename, evCompartirWhatsApp). El clásico usa Tailwind; aquí los estilos van en línea para que el PDF
// salga igual en cualquier pantalla. html2pdf se carga desde /libs/html2pdf.bundle.min.js (core/lib/pdf.ts).
import { compartirPDF, generarPDFBlob, montarParaPDF } from '../../core/lib/pdf';
import { svgDiagramaEntrega, type EstiloCarroceria } from './ce-croquis';
import { cargarPlantilla, calificacionDe, leerPartes, PLANTILLA_FABRICA, type Calificacion } from './ce-plantilla';
import type { CategoriaPlantilla, EntregaVehiculo } from './ce-tipos';

const NAVY = '#0F172A';
const caja = `border:1.5px solid ${NAVY};border-radius:8px;overflow:hidden;background:#fff;margin-bottom:8px;`;
const lbl = 'font-weight:700;color:#475569;text-transform:uppercase;background:#f1f5f9;padding:4px;font-size:8px;text-align:center;';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** dd/mm/aaaa a partir de una fecha aaaa-mm-dd (o aaaa-mm-ddThh:mm…). Vacío si no se puede leer. */
function fechaDMA(f: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Configuración del croquis según configuracion, modelo y tipo (igual que _evObtenerConfiguracion del clásico) */
export function codigoConfiguracion(r: EntregaVehiculo): string {
  const str = `${String(r.configuracion || '')} ${String(r.modelo || '')} ${String(r.tipo || r.clase || '')}`.toUpperCase();
  if (str.includes('4X2') || str.includes('T2')) return 'T2';
  if (str.includes('T3') || str.includes('6X4') || str.includes('6X2')) return 'T3';
  if (str.includes('C3') || str.includes('VOLQUETE')) return 'C3';
  if (str.includes('C2') || str.includes('RIGIDO')) return 'C2';
  if (str.includes('S3') || str.includes('SE3') || str.includes('3 EJES')) return 'S3';
  if (str.includes('S2') || str.includes('SE2') || str.includes('2 EJES')) return 'S2';
  if (str.includes('R2') || str.includes('REMOLQUE') || str.includes('CARRETA')) return 'R2';
  return 'T3';
}

/** Nombre del archivo, igual que el clásico: "Entrega de Vehiculo - PLACA - dd-mm-aaaa.pdf" */
export function nombrePdfEntrega(r: EntregaVehiculo): string {
  const placa = (r.placa || 'UNIDAD').toUpperCase().trim();
  const p = String(r.fecha || '').slice(0, 10).split('-');
  const fecha = p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : new Date().toLocaleDateString('es-PE').replace(/\//g, '-');
  return `Entrega de Vehiculo - ${placa} - ${fecha}.pdf`;
}

const BADGE: Record<Calificacion, { txt: string; bg: string; fg: string; bd: string }> = {
  B: { txt: 'OK', bg: '#d1fae5', fg: '#065f46', bd: '#6ee7b7' },
  R: { txt: 'REG', bg: '#fef3c7', fg: '#92400e', bd: '#fcd34d' },
  M: { txt: 'MAL', bg: '#ffe4e6', fg: '#9f1239', bd: '#fda4af' },
};

function badge(estado: Calificacion): string {
  const b = BADGE[estado];
  return `<span style="padding:0 5px;border-radius:4px;font-weight:800;font-size:7.5px;background:${b.bg};color:${b.fg};border:1px solid ${b.bd}">${b.txt}</span>`;
}

function logoEmpresa(): string {
  try { return localStorage.getItem('fleet_empresa_logo') || ''; } catch { return ''; }
}

/** HTML del acta. `grupos` es la plantilla con la que se calificó (la vigente de la empresa). */
export function htmlActaEntrega(r: EntregaVehiculo, grupos: CategoriaPlantilla[], logo = ''): string {
  const partes = leerPartes(r.inventario_partes_json);
  const config = codigoConfiguracion(r);
  const cabina = r.estilo_cabina === 'trompa' ? 'trompa' : 'chata';
  const carroceria: EstiloCarroceria = r.estilo_carroceria === 'plataforma' ? 'plataforma' : 'furgon';
  const km = (Number(r.kilometraje) || 0).toLocaleString('es-PE');
  const emision = fechaDMA(r.fecha) || new Date().toLocaleDateString('es-PE');
  const ahora = `${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE')}`;

  // Solo se imprimen los ítems que se calificaron; las categorías sin ninguno no salen
  const marcados = grupos
    .map(g => ({ ...g, items: g.items.filter(it => calificacionDe(partes, g, it).estado) }))
    .filter(g => g.items.length > 0);
  const tercio = Math.ceil(marcados.length / 3);
  const columnas = [marcados.slice(0, tercio), marcados.slice(tercio, tercio * 2), marcados.slice(tercio * 2)];

  const celdaMeta = (k: string, v: unknown, fondo = '#fff', mono = false, ultima = false) =>
    `<div style="padding:4px 10px;display:flex;justify-content:space-between;gap:6px;background:${fondo};${ultima ? '' : `border-bottom:1.5px solid ${NAVY};`}">`
    + `<span style="font-weight:700;color:#334155;font-size:8.5px;text-transform:uppercase">${k}:</span>`
    + `<span style="font-weight:700;color:#0F172A;font-size:9.5px;${mono ? 'font-family:monospace;' : ''}">${esc(v)}</span></div>`;

  const fila = (cols: string, cabecera: boolean, celdas: Array<[string, string]>) =>
    `<div style="display:grid;grid-template-columns:${cols};text-align:center;${cabecera ? `border-bottom:1.5px solid ${NAVY}` : ''}">`
    + celdas.map(([t, estilo], i) => `<div style="${cabecera ? lbl : `padding:4px;font-weight:700;font-size:9px;text-transform:uppercase;color:#1e293b;${estilo}`}${i < celdas.length - 1 ? `border-right:1.5px solid ${NAVY};` : ''}">${t}</div>`).join('')
    + '</div>';

  const columna = (gs: CategoriaPlantilla[]) => `
    <div style="${caja}margin-bottom:0"><table style="width:100%;border-collapse:collapse;font-size:8px">
      <thead><tr style="background:${NAVY};color:#fff"><th style="padding:2px 4px;text-align:left;font-size:8px;text-transform:uppercase">PARTES Y ACCESORIOS</th>
        <th style="padding:2px 3px;width:22px;font-size:7.5px">CANT</th><th style="padding:2px 3px;width:34px;font-size:7.5px">ESTADO</th></tr></thead>
      <tbody>${gs.map(g => `
        <tr style="background:#E2E8F0;border-top:1px solid ${NAVY};border-bottom:1px solid ${NAVY}"><td colspan="3" style="padding:2px 4px;font-weight:800;font-size:8px;text-transform:uppercase">• ${esc(g.titulo)}</td></tr>
        ${g.items.map(it => {
          const { estado, cantidad } = calificacionDe(partes, g, it);
          return `<tr style="border-bottom:1px solid #E2E8F0"><td style="padding:1px 4px;color:#334155;font-weight:500;font-size:7.8px">${esc(it)}</td>
          <td style="padding:1px 3px;text-align:center;font-family:monospace;font-weight:700;color:#64748B;font-size:7.8px">${cantidad}</td>
          <td style="padding:1px 3px;text-align:center">${badge(estado as Calificacion)}</td></tr>`;
        }).join('')}`).join('')}
      </tbody></table></div>`;

  const firma = (src: string | null | undefined, nombre: string, rol: string) => `
    <div style="padding:8px;border:1px solid #CBD5E1;background:#F8FAFC;border-radius:8px;text-align:center;min-height:64px">
      <div style="height:38px;display:flex;align-items:center;justify-content:center">${src ? `<img src="${esc(src)}" style="max-height:34px;max-width:160px;object-fit:contain">` : '<span style="color:#cbd5e1;font-style:italic;font-size:8px">Firma digitalizada</span>'}</div>
      <div style="padding-top:6px;border-top:1px solid #CBD5E1"><div style="font-weight:700;font-size:9px;text-transform:uppercase">${esc(nombre)}</div>
        <div style="font-size:7.5px;color:#64748b;font-weight:600;text-transform:uppercase">${rol}</div></div></div>`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;width:900px;background:#fff;padding:12px;box-sizing:border-box">
    <div style="${caja}">
      <div style="display:grid;grid-template-columns:3fr 6fr 3fr;border-bottom:1.5px solid ${NAVY}">
        <div style="padding:8px;text-align:center;border-right:1.5px solid ${NAVY};display:flex;flex-direction:column;align-items:center;justify-content:center">
          ${logo ? `<img src="${esc(logo)}" style="max-height:36px;max-width:130px;object-fit:contain" crossorigin="anonymous">` : `<div style="font-size:14px;font-weight:800">${esc(r.empresa || 'MARSISA')}</div>`}
          <span style="font-size:8px;font-weight:700;letter-spacing:.06em;color:#64748b;text-transform:uppercase">Transporte &amp; Logística</span></div>
        <div style="padding:8px;text-align:center;background:#f8fafc;border-right:1.5px solid ${NAVY};display:flex;flex-direction:column;justify-content:center">
          <div style="font-size:14px;font-weight:800;text-transform:uppercase">INVENTARIO FÍSICO ESTADO DE VEHÍCULO</div>
          <div style="font-size:9.5px;font-weight:700;color:#475569;text-transform:uppercase;margin-top:2px">Acta de Entrega y Recepción Técnica de Unidades</div></div>
        <div>${celdaMeta('Código', 'F-SEG-004', '#fff', true)}${celdaMeta('Versión', '01', '#fff', true)}${celdaMeta('Fecha', '10/11/2025', '#fff', true, true)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr">
        <div style="border-right:1.5px solid ${NAVY}">${celdaMeta('Nº Inventario', r.numero_inventario || r.id, '#fff', true)}${celdaMeta('Entregado Por', r.quien_entrega, '#fff', false, true)}</div>
        <div style="border-right:1.5px solid ${NAVY}">${celdaMeta('Motivo', r.motivo || 'ENTREGA DE UNIDAD')}${celdaMeta('Recibido Por', r.quien_recibe, '#fff', false, true)}</div>
        <div>${celdaMeta('Fecha Emisión', emision, '#fff', true)}${celdaMeta('Estado', 'Conforme', '#ecfdf5', false, true)}</div>
      </div>
    </div>

    <div style="${caja}">
      <div style="padding:4px 12px;background:${NAVY};color:#fff;display:flex;justify-content:space-between">
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Ficha Técnica y Datos del Vehículo</span>
        <span style="font-size:8.5px;font-family:monospace;color:#7dd3fc">REGISTRO FLOTA</span></div>
      ${fila('15% 18% 18% 18% 16% 15%', true, ['CLASE', 'MARCA', 'TIPO', 'MODELO', 'PLACA', 'COLOR'].map(t => [t, '']))}
      ${fila('15% 18% 18% 18% 16% 15%', false, [
        [esc(r.clase || 'TRACTO'), ''], [esc(r.marca || '---'), ''], [esc(r.tipo || r.clase || 'TRACTO'), ''], [esc(r.modelo || '---'), ''],
        [esc(r.placa), 'font-family:monospace;color:#075985;font-weight:800;font-size:10.5px;background:#f0f9ff;'], [esc(r.color || '---'), '']])}
      ${fila('35% 35% 30%', true, ['NÚMERO DEL MOTOR', 'NÚMERO DE SERIE / VIN', 'KILOMETRAJE ACTUAL'].map(t => [t, '']))}
      ${fila('35% 35% 30%', false, [[esc(r.numero_motor || '---'), 'font-family:monospace;'], [esc(r.numero_serie || '---'), 'font-family:monospace;'],
        [`${km} KM`, 'font-family:monospace;color:#065f46;font-weight:800;font-size:10px;background:#ecfdf5;']])}
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:8px">${columnas.map(columna).join('')}</div>

    <div style="${caja}padding:6px;text-align:center;background:#f8fafc">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 12px 4px;border-bottom:1px solid #cbd5e1;margin-bottom:4px">
        <span style="font-weight:800;color:#1e293b;font-size:9px;text-transform:uppercase">Diagrama Técnico del Estado de la Unidad</span>
        <span style="font-family:monospace;font-weight:800;font-size:8.5px;padding:2px 10px;border-radius:99px;text-transform:uppercase;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7">CONFIGURACIÓN: ${config}</span></div>
      <div style="padding:4px 0"><div style="width:820px;margin:0 auto">${svgDiagramaEntrega(config, cabina, carroceria)}</div></div>
    </div>

    <div style="${caja}padding:8px">
      <span style="font-weight:700;color:#334155;font-size:8.5px;text-transform:uppercase;display:block;margin-bottom:2px">Observaciones Técnicas Registradas:</span>
      <p style="font-size:8px;margin:0;font-weight:500;line-height:1.35">${r.observaciones ? esc(String(r.observaciones).toUpperCase()) : 'LA UNIDAD VEHICULAR SE ENTREGA EN CONDICIONES OPERATIVAS Y CON SU EQUIPAMIENTO COMPLETO SEGÚN DETALLE SUPERIOR.'}</p>
    </div>

    <div style="${caja}padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${firma(r.firma_entrega, r.quien_entrega, 'ENTREGADO POR (CONTROL DE FLOTA)')}
      ${firma(r.firma_recibe, r.quien_recibe, 'RECIBIDO POR (CONDUCTOR ASIGNADO)')}
    </div>

    <div style="display:flex;justify-content:space-between;font-size:7px;color:#94a3b8;font-family:monospace;padding:0 4px">
      <span>ERP AZKELL FLEET • SISTEMA DE GESTIÓN INTEGRAL DE TRANSPORTE</span>
      <span>FECHA DE IMPRESIÓN: ${ahora}</span></div>
  </div>`;
}

const OPCIONES = { orientacion: 'portrait' as const, margen: 0, escala: 2.8 };

/** Monta el acta fuera de la vista, la convierte a PDF y la desmonta */
async function conElemento<T>(html: string, usar: (el: HTMLElement) => Promise<T>): Promise<T> {
  const el = document.createElement('div');
  el.innerHTML = html;
  const quitar = montarParaPDF(el);
  try { return await usar(el); } finally { quitar(); }
}

/**
 * PDF del acta. Las partes se califican con la plantilla vigente de la empresa; si el servidor no responde,
 * se usa la de fábrica (el clásico usaba la copia local).
 */
export async function generarPdfEntrega(r: EntregaVehiculo): Promise<Blob> {
  const grupos = (await cargarPlantilla()) ?? PLANTILLA_FABRICA;
  const html = htmlActaEntrega(r, grupos, logoEmpresa());
  return conElemento(html, el => generarPDFBlob(el, OPCIONES));
}

/** Genera el PDF y lo comparte por WhatsApp (hoja de compartir del sistema o app de WhatsApp), como el clásico */
export async function compartirEntregaWhatsApp(r: EntregaVehiculo): Promise<void> {
  const blob = await generarPdfEntrega(r);
  await compartirPDF(blob, nombrePdfEntrega(r), `Entrega de vehículo ${r.placa}`);
}
