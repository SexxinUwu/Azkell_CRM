// PDF oficial "Inventario físico estado de vehículo" (acta de entrega y recepción).
// Mismo formato que la versión actual (modulos/flota/entrega-vehiculos/logica.js › _evConstruirHtmlPDF), con estilos en línea
// (el clásico usaba Tailwind). Lo que no se califica sale como OK, igual que en el clásico.
import { exportarPDF, generarPDFBlob, montarParaPDF } from '../../core/lib/pdf';
import { nombreTipoDano, svgCroquisConDanos, type Dano } from './croquisDanos';
import { normalizarConfig } from './croquisEntrega';
import type { GrupoInventario } from './plantillaEntrega';

export interface ActaPdf {
  id: string; numero_inventario: string | null; fecha: string; motivo: string | null; quien_entrega: string; quien_recibe: string;
  clase: string | null; marca: string | null; tipo: string | null; modelo: string | null; placa: string; color: string | null;
  numero_motor: string | null; numero_serie: string | null; kilometraje: number | null; configuracion: string | null;
  estilo_cabina?: string | null; empresa: string | null; observaciones: string | null;
  firma_entrega?: string | null; firma_recibe?: string | null;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const clave = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '_');
const NAVY = '#0F172A';
const caja = `border:1.5px solid ${NAVY};border-radius:8px;overflow:hidden;background:#fff;margin-bottom:8px;`;
const lbl = 'font-weight:700;color:#475569;text-transform:uppercase;background:#f1f5f9;padding:4px;font-size:8px;text-align:center;';

/** Nombre del archivo, igual que el clásico: "Entrega de Vehiculo - PLACA - dd-mm-aaaa.pdf" */
export function nombreArchivoActa(a: Pick<ActaPdf, 'placa' | 'fecha'>): string {
  const placa = (a.placa || 'UNIDAD').toUpperCase().trim();
  const p = String(a.fecha || '').slice(0, 10).split('-');
  const f = p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : new Date().toLocaleDateString('es-PE').replace(/\//g, '-');
  return `Entrega de Vehiculo - ${placa} - ${f}.pdf`;
}

function badge(est: string): string {
  const [txt, bg, fg, bd] = est === 'M' ? ['MAL', '#ffe4e6', '#9f1239', '#fda4af'] : est === 'R' ? ['REG', '#fef3c7', '#92400e', '#fcd34d'] : ['OK', '#d1fae5', '#065f46', '#6ee7b7'];
  return `<span style="padding:0 5px;border-radius:4px;font-weight:800;font-size:7.5px;background:${bg};color:${fg};border:1px solid ${bd}">${txt}</span>`;
}

export function htmlActaOficial(a: ActaPdf, partes: Record<string, string>, grupos: GrupoInventario[], danos: Dano[], logo = ''): string {
  const fecha = String(a.fecha || '').slice(0, 10).split('-').reverse().join('-');
  const km = (Number(a.kilometraje) || 0).toLocaleString('es-PE');
  const config = normalizarConfig(a.configuracion);
  const cabina = a.estilo_cabina === 'trompa' ? 'trompa' : 'chata';
  const tercio = Math.ceil(grupos.length / 3);
  const cols = [grupos.slice(0, tercio), grupos.slice(tercio, tercio * 2), grupos.slice(tercio * 2)];

  const celdaMeta = (k: string, v: unknown, fondo = '#fff', mono = false, ultima = false) =>
    `<div style="padding:4px 10px;display:flex;justify-content:space-between;gap:6px;background:${fondo};${ultima ? '' : `border-bottom:1.5px solid ${NAVY};`}">`
    + `<span style="font-weight:700;color:#334155;font-size:8.5px;text-transform:uppercase">${k}:</span>`
    + `<span style="font-weight:700;color:#0F172A;font-size:9.5px;${mono ? 'font-family:monospace;' : ''}">${esc(v)}</span></div>`;
  const fila = (cols3: string, cab: boolean, vals: Array<[string, string]>) =>
    `<div style="display:grid;grid-template-columns:${cols3};text-align:center;border-bottom:${cab ? `1.5px solid ${NAVY}` : '0'}">`
    + vals.map(([t, estilo], i) => `<div style="${cab ? lbl : `padding:4px;font-weight:700;font-size:9px;text-transform:uppercase;color:#1e293b;${estilo}`}${i < vals.length - 1 ? `border-right:1.5px solid ${NAVY};` : ''}">${t}</div>`).join('') + '</div>';

  const columna = (gs: GrupoInventario[]) => `
    <div style="${caja}margin-bottom:0"><table style="width:100%;border-collapse:collapse;font-size:8px">
      <thead><tr style="background:${NAVY};color:#fff"><th style="padding:2px 4px;text-align:left;font-size:8px;text-transform:uppercase">PARTES Y ACCESORIOS</th>
        <th style="padding:2px 3px;width:22px;font-size:7.5px">CANT</th><th style="padding:2px 3px;width:34px;font-size:7.5px">ESTADO</th></tr></thead>
      <tbody>${gs.map(g => `
        <tr style="background:#E2E8F0;border-top:1px solid ${NAVY};border-bottom:1px solid ${NAVY}"><td colspan="3" style="padding:2px 4px;font-weight:800;font-size:8px;text-transform:uppercase">• ${esc(g.titulo)}</td></tr>
        ${g.items.map(it => `<tr style="border-bottom:1px solid #E2E8F0"><td style="padding:1px 4px;color:#334155;font-weight:500;font-size:7.8px">${esc(it)}</td>
          <td style="padding:1px 3px;text-align:center;font-family:monospace;font-weight:700;color:#64748B;font-size:7.8px">1</td>
          <td style="padding:1px 3px;text-align:center">${badge(partes[clave(it)] || 'B')}</td></tr>`).join('')}`).join('')}
      </tbody></table></div>`;

  const lista = danos.length
    ? `<div style="text-align:left;font-size:8px;padding:2px 10px 0;color:#1e293b;line-height:1.5">${danos.map(d =>
      `<b>${d.n}</b> · ${esc(nombreTipoDano(d.tipo))}${d.obs ? ` — ${esc(d.obs)}` : ''}`).join(' &nbsp;|&nbsp; ')}</div>`
    : '';

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
          ${logo ? `<img src="${esc(logo)}" style="max-height:36px;max-width:130px;object-fit:contain" crossorigin="anonymous">` : `<div style="font-size:14px;font-weight:800">${esc(a.empresa || 'MARSISA')}</div>`}
          <span style="font-size:8px;font-weight:700;letter-spacing:.06em;color:#64748b;text-transform:uppercase">Transporte &amp; Logística</span></div>
        <div style="padding:8px;text-align:center;background:#f8fafc;border-right:1.5px solid ${NAVY};display:flex;flex-direction:column;justify-content:center">
          <div style="font-size:14px;font-weight:800;text-transform:uppercase">INVENTARIO FÍSICO ESTADO DE VEHÍCULO</div>
          <div style="font-size:9.5px;font-weight:700;color:#475569;text-transform:uppercase;margin-top:2px">Acta de Entrega y Recepción Técnica de Unidades</div></div>
        <div>${celdaMeta('Código', 'F-SEG-004', '#fff', true)}${celdaMeta('Versión', '01', '#fff', true)}${celdaMeta('Fecha', '10/11/2025', '#fff', true, true)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr">
        <div style="border-right:1.5px solid ${NAVY}">${celdaMeta('Nº Inventario', a.numero_inventario || a.id, '#fff', true)}${celdaMeta('Entregado Por', a.quien_entrega, '#fff', false, true)}</div>
        <div style="border-right:1.5px solid ${NAVY}">${celdaMeta('Motivo', a.motivo || 'ENTREGA DE UNIDAD')}${celdaMeta('Recibido Por', a.quien_recibe, '#fff', false, true)}</div>
        <div>${celdaMeta('Fecha Emisión', fecha, '#fff', true)}${celdaMeta('Estado', 'Conforme', '#ecfdf5', false, true)}</div>
      </div>
    </div>

    <div style="${caja}">
      <div style="padding:4px 12px;background:${NAVY};color:#fff;display:flex;justify-content:space-between">
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Ficha Técnica y Datos del Vehículo</span>
        <span style="font-size:8.5px;font-family:monospace;color:#7dd3fc">REGISTRO FLOTA</span></div>
      ${fila('15% 18% 18% 18% 16% 15%', true, ['CLASE', 'MARCA', 'TIPO', 'MODELO', 'PLACA', 'COLOR'].map(t => [t, '']))}
      ${fila('15% 18% 18% 18% 16% 15%', false, [
        [esc(a.clase || 'TRACTO'), ''], [esc(a.marca || '---'), ''], [esc(a.tipo || a.clase || 'TRACTO'), ''], [esc(a.modelo || '---'), ''],
        [esc(a.placa), 'font-family:monospace;color:#075985;font-weight:800;font-size:10.5px;background:#f0f9ff;'], [esc(a.color || '---'), '']])}
      ${fila('35% 35% 30%', true, ['NÚMERO DEL MOTOR', 'NÚMERO DE SERIE / VIN', 'KILOMETRAJE ACTUAL'].map(t => [t, '']))}
      ${fila('35% 35% 30%', false, [[esc(a.numero_motor || '---'), 'font-family:monospace;'], [esc(a.numero_serie || '---'), 'font-family:monospace;'],
        [`${km} KM`, 'font-family:monospace;color:#065f46;font-weight:800;font-size:10px;background:#ecfdf5;']])}
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:8px">${cols.map(columna).join('')}</div>

    <div style="${caja}padding:6px;text-align:center;background:#f8fafc">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 12px 4px;border-bottom:1px solid #cbd5e1;margin-bottom:4px">
        <span style="font-weight:800;color:#1e293b;font-size:9px;text-transform:uppercase">Diagrama Técnico del Estado de la Unidad</span>
        <span style="font-family:monospace;font-weight:800;font-size:8.5px;padding:2px 10px;border-radius:99px;text-transform:uppercase;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7">CONFIGURACIÓN: ${config}</span></div>
      <div style="padding:4px 0">${svgCroquisConDanos(config, cabina, true, danos, true).replace('width="100%"', 'width="820"')}</div>
      ${lista}
    </div>

    <div style="${caja}padding:8px">
      <span style="font-weight:700;color:#334155;font-size:8.5px;text-transform:uppercase;display:block;margin-bottom:2px">Observaciones Técnicas Registradas:</span>
      <p style="font-size:8px;margin:0;font-weight:500;line-height:1.35">${a.observaciones ? esc(a.observaciones.toUpperCase()) : 'LA UNIDAD VEHICULAR SE ENTREGA EN CONDICIONES OPERATIVAS Y CON SU EQUIPAMIENTO COMPLETO SEGÚN DETALLE SUPERIOR.'}</p>
    </div>

    <div style="${caja}padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${firma(a.firma_entrega, a.quien_entrega, 'ENTREGADO POR (CONTROL DE FLOTA)')}
      ${firma(a.firma_recibe, a.quien_recibe, 'RECIBIDO POR (CONDUCTOR ASIGNADO)')}
    </div>

    <div style="display:flex;justify-content:space-between;font-size:7px;color:#94a3b8;font-family:monospace;padding:0 4px">
      <span>ERP AZKELL FLEET • SISTEMA DE GESTIÓN INTEGRAL DE TRANSPORTE</span>
      <span>FECHA DE IMPRESIÓN: ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE')}</span></div>
  </div>`;
}

function logoEmpresa(): string {
  try { return localStorage.getItem('fleet_empresa_logo') || ''; } catch { return ''; }
}

async function conElemento<T>(html: string, usar: (el: HTMLElement) => Promise<T>): Promise<T> {
  const el = document.createElement('div');
  el.innerHTML = html;
  const quitar = montarParaPDF(el);
  try { return await usar(el); } finally { quitar(); }
}

const OPC = { orientacion: 'portrait' as const, margen: 0, escala: 2.8 };

export function descargarActaPDF(a: ActaPdf, partes: Record<string, string>, grupos: GrupoInventario[], danos: Dano[]) {
  return conElemento(htmlActaOficial(a, partes, grupos, danos, logoEmpresa()), el => exportarPDF(el, nombreArchivoActa(a), OPC));
}

export function blobActaPDF(a: ActaPdf, partes: Record<string, string>, grupos: GrupoInventario[], danos: Dano[]): Promise<Blob> {
  return conElemento(htmlActaOficial(a, partes, grupos, danos, logoEmpresa()), el => generarPDFBlob(el, OPC));
}
