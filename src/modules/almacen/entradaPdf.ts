// PDF de la orden de compra (entrada): membrete con el logo de la empresa, datos de la empresa y del proveedor,
// condición de pago y vencimiento, líneas con código y unidad, subtotal, IGV (si aplica), total y firmas.
// Sustituye al PDF clásico (_entGenerarHtmlPDF) con el mismo lenguaje visual de los PDF de OT e inspecciones.
import { generarPDFBlob, montarParaPDF } from '../../core/lib/pdf';
import type { EmpresaDocumentos, EntradaInv, ProveedorInv } from './api';
import { desgloseIgv, numeroALetras } from './entradaReglas';

/** Logo de la empresa del subdominio (el mismo de la barra lateral) */
export const LOGO_ENTRADA = '/api/tenant-logo';
/** IGV vigente en Perú */
export const TASA_IGV = 0.18;

export interface DatosEntradaPdf {
  entrada: EntradaInv;
  proveedor: ProveedorInv | null;
  empresa: EmpresaDocumentos | null;
  usuario: string;
  logo?: string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const fechaTexto = (s: string | null | undefined) => {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
/** Suma días a una fecha YYYY-MM-DD sin desfase de zona horaria */
function sumarDias(s: string | null | undefined, dias: number): string | null {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dias);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
const num = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const celda = (contenido: string, extra = '') => `<td style="padding:6px 8px;border-bottom:1px solid #f0f0f3;vertical-align:top;${extra}">${contenido}</td>`;
const encabezados = (cols: Array<[string, string?]>) => `<tr>${cols.map(([c, align]) => `<th style="padding:6px 8px;text-align:${align ?? 'left'};background:#f5f5f7;color:#6e6e73;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e5ea">${esc(c)}</th>`).join('')}</tr>`;
const dato = (k: string, v: string) => `<div style="padding:5px 0;border-bottom:1px dotted #d2d2d7"><div style="font-size:10px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px">${esc(k)}</div><div style="font-size:12px;font-weight:600">${esc(v)}</div></div>`;

/**
 * Cálculo del documento. Los importes de las líneas ya llevan el IGV cuando la orden lo tiene (así los guarda el clásico),
 * así que el total es la suma de las líneas y el IGV se desglosa desde el total.
 */
export function totalesEntrada(e: EntradaInv) {
  const total = (e.items ?? []).reduce((s, i) => s + (Number(i.importe) || (Number(i.cantidad) || 0) * (Number(i.costo_unitario) || 0)), 0);
  const { gravado, igv, conIgv } = desgloseIgv(total, e.tipo_igv);
  return { subtotal: gravado, igv, conIgv, total };
}

/** HTML del PDF de la orden de compra */
export function htmlEntradaPdf(d: DatosEntradaPdf): string {
  const e = d.entrada;
  const p = d.proveedor;
  const emp = d.empresa;
  const sym = e.moneda === 'USD' ? 'US$' : 'S/';
  const { subtotal, igv, conIgv, total } = totalesEntrada(e);
  const credito = (e.condicion_pago ?? '').toLowerCase().startsWith('a cr');
  const condicion = credito ? `CRÉDITO${e.dias_credito ? ` / ${e.dias_credito} DÍAS` : ''}` : 'CONTADO';
  const vencimiento = credito ? sumarDias(e.fecha, Number(e.dias_credito) || 0) : fechaTexto(e.fecha);
  const equivalenteSoles = e.moneda === 'USD' && e.tipo_cambio ? total * e.tipo_cambio : null;
  const aprobado = !!(e.autoriza || e.aprobado_por) && (e.estado ?? '').toLowerCase().startsWith('aprob');
  // Título del documento: "ORDEN DE COMPRA" para las compras; otros tipos muestran su nombre
  const titulo = e.tipo_orden && !/orden de compra/i.test(e.tipo_orden) ? e.tipo_orden.toUpperCase() : 'ORDEN DE COMPRA';

  const datosProveedor = [
    dato('Razón social', p?.razon_social || p?.nombre || e.proveedor_nombre || '—'),
    dato('RUC', p?.ruc || 'Sin RUC registrado'),
    dato('Contacto', p?.contacto || '—'),
    dato('Teléfono', p?.telefono || '—'),
  ].join('');

  const datosOrden = [
    dato('Fecha de emisión', fechaTexto(e.fecha)),
    dato('Moneda', e.moneda === 'USD' ? 'Dólares (US$)' : 'Soles (S/)'),
    dato('Tipo de cambio SUNAT', e.moneda === 'USD' && e.tipo_cambio ? String(e.tipo_cambio) : 'No aplica'),
    dato('Condición de pago', condicion),
    dato('Fecha de vencimiento', vencimiento ?? '—'),
    dato('N° documento proveedor', e.documento_referencia || '—'),
  ].join('');

  const filas = (e.items ?? []).map((it, i) => {
    const cant = Number(it.cantidad) || 0;
    const cu = Number(it.costo_unitario) || 0;
    const imp = Number(it.importe) || cant * cu;
    const unidad = it.item_unidad || 'UND';
    return `<tr style="background:${i % 2 ? '#fafafa' : '#ffffff'}">${celda(String(i + 1), 'text-align:center;width:28px')}${celda(esc(it.inventario_id || '—'), 'font-family:\'SF Mono\',Menlo,monospace;font-size:11px;width:80px')}${celda(esc(it.descripcion || '—'))}${celda(esc(unidad), 'text-align:center;width:50px')}${celda(esc(cant.toLocaleString('es-PE', { maximumFractionDigits: 3 })), 'text-align:right;width:60px')}${celda(num(cu), 'text-align:right;width:80px')}${celda(num(imp), 'text-align:right;width:90px;font-weight:600')}</tr>`;
  }).join('');
  const tablaLineas = (e.items ?? []).length
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px">${encabezados([['N°', 'center'], ['Código'], ['Descripción'], ['Unidad', 'center'], ['Cant.', 'right'], ['P. unit.', 'right'], ['Total', 'right']])}${filas}</table>`
    : '<p style="font-size:12px;color:#6e6e73;margin:0">Sin artículos.</p>';

  const resumen = [
    ['Subtotal', `${sym}\u00A0${num(subtotal)}`],
    [conIgv ? 'IGV (18 %)' : 'IGV', conIgv ? `${sym}\u00A0${num(igv)}` : 'No aplica'],
  ].map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span style="color:#6e6e73">${esc(k)}</span><span style="font-family:'SF Mono',Menlo,monospace">${esc(v)}</span></div>`).join('')
    + `<div style="display:flex;justify-content:space-between;padding:8px 0 0;font-size:15px;font-weight:700;border-top:1px solid #d2d2d7;margin-top:4px"><span>TOTAL</span><span style="font-family:'SF Mono',Menlo,monospace">${esc(sym)}\u00A0${num(total)}</span></div>`
    + (equivalenteSoles != null ? `<div style="font-size:11px;color:#6e6e73;text-align:right;margin-top:4px">Equivalente S/\u00A0${num(equivalenteSoles)} (TC ${esc(e.tipo_cambio)})</div>` : '');

  const firmaSolicitante = e.solicitante || e.creado_por || '';
  const firmaGerencia = aprobado ? (e.autoriza || e.aprobado_por || '') : '';
  const bloqueFirma = (titulo: string, nombre: string, extra = '') => `
    <div style="flex:1;text-align:center">
      <div style="height:56px"></div>
      <div style="border-top:1px solid #1d1d1f;padding-top:4px;font-size:11px;font-weight:600">${esc(titulo)}</div>
      <div style="font-size:11px;color:#6e6e73">${esc(nombre || ' ')}</div>
      ${extra ? `<div style="font-size:10px;color:#6e6e73">${esc(extra)}</div>` : ''}
    </div>`;

  const emitido = new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter','Segoe UI',Roboto,sans-serif;color:#1d1d1f;width:190mm;padding:6mm 6mm 4mm;background:#ffffff">
    <div style="display:flex;align-items:flex-start;gap:12px;padding-bottom:10px;border-bottom:1px solid #e5e5ea">
      <img src="${esc(d.logo ?? LOGO_ENTRADA)}" alt="Logo" style="height:50px;max-width:130px;object-fit:contain">
      <div style="flex:1">
        <div style="font-size:14px;font-weight:700">${esc(emp?.nombre || '')}</div>
        ${emp?.direccion ? `<div style="font-size:11px;color:#6e6e73">${esc(emp.direccion)}</div>` : ''}
        ${emp?.telefono ? `<div style="font-size:11px;color:#6e6e73">Tel. ${esc(emp.telefono)}</div>` : ''}
      </div>
      <div style="text-align:center;border:1.5px solid #1d1d1f;border-radius:10px;padding:8px 14px;min-width:200px">
        <div style="font-size:11px;font-weight:700">RUC ${esc(emp?.ruc || 'sin RUC')}</div>
        <div style="font-size:13px;font-weight:800;margin-top:3px">${esc(titulo)}</div>
        <div style="font-size:12px;font-family:'SF Mono',Menlo,monospace;margin-top:2px">N° ${esc(e.id)}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:24px;margin-top:12px">
      <div>
        <div style="font-size:11px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Proveedor</div>
        ${datosProveedor}
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Orden</div>
        ${datosOrden}
      </div>
    </div>

    <div style="margin-top:14px">${tablaLineas}</div>

    <div style="margin-top:10px;font-size:11px;color:#334155"><strong>SON:</strong> ${esc(numeroALetras(total))} ${e.moneda === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES'}</div>

    <div style="display:flex;justify-content:flex-end;margin-top:10px">
      <div style="width:320px">${resumen}</div>
    </div>

    ${e.observaciones || e.motivo_entrada ? `<div style="margin-top:12px;font-size:11px;color:#334155"><strong>Motivo:</strong> ${esc(e.motivo_entrada || '—')}${e.observaciones ? `<br><strong>Observaciones:</strong> ${esc(e.observaciones)}` : ''}</div>` : ''}

    <div style="display:flex;gap:24px;margin-top:26px">
      ${bloqueFirma('Solicitante / Almacén', firmaSolicitante)}
      ${bloqueFirma('V°B° Aprobación Gerencia', firmaGerencia, aprobado && e.fecha_aprobacion ? fechaTexto(e.fecha_aprobacion) : 'Pendiente de aprobación')}
    </div>

    <div style="margin-top:18px;padding-top:6px;border-top:1px solid #d2d2d7;font-size:10px;color:#6e6e73;display:flex;justify-content:space-between">
      <span>Generado en Azkell Fleet por ${esc(d.usuario || 'sistema')}</span>
      <span>Emitido ${esc(emitido)}</span>
    </div>
  </div>`;
}

/** PDF de la orden de compra para descargar o compartir */
export async function pdfEntrada(d: DatosEntradaPdf): Promise<Blob> {
  const el = document.createElement('div');
  el.innerHTML = htmlEntradaPdf(d);
  const quitar = montarParaPDF(el);
  try {
    return await generarPDFBlob(el, { orientacion: 'portrait' });
  } finally { quitar(); }
}
