// PDF de la orden de compra desde el detalle de Pago de requerimientos.
// Es el mismo documento que el clásico: _entGenerarHtmlPDF (modulos/almacen/entradas/logica.js), que es lo que
// abre "Imprimir / Ver PDF" en modulos/tesoreria/pago-requerimientos. Mismos datos, mismo orden y mismos estilos en línea.
// La hoja se genera con conElemento (flota/ce-pdf.ts): va en flujo normal, espera el logo y las fuentes, y se ajusta
// a una sola hoja A4, así no sale en blanco ni se corta a mitad de una fila.
import { generarPDFBlob } from '../../core/lib/pdf';
import { conElemento } from '../flota/ce-pdf';
import type { EmpresaDocumentos } from '../almacen/api';
import { codigoOC, esCredito, esUSD, num, numeroALetras, type OrdenPago } from './pago-datos';

/** Logo de la empresa del subdominio (el mismo de la barra lateral) */
export const LOGO_ORDEN = '/api/tenant-logo';
/** Tipo de cambio que usa el clásico cuando la orden no trae uno */
const TC_CLASICO = 3.4;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** dd/mm/aaaa desde aaaa-mm-dd (o aaaa-mm-ddThh:mm…). Vacío si no se puede leer. */
function fechaDMA(valor: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

const fmt = (n: number, min: number, max: number) => n.toLocaleString('es-PE', { minimumFractionDigits: min, maximumFractionDigits: max });

const ETIQUETA = 'font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;';
const celdaDato = (etiqueta: string, valor: string, ancho = '50%') =>
  `<div style="width:${ancho};margin-bottom:12px;"><span style="${ETIQUETA}">${etiqueta}</span><span style="font-weight:700;color:#0f172a;text-transform:uppercase;">${valor}</span></div>`;

/**
 * HTML del documento. `unidadDe` devuelve la unidad de medida del artículo (el clásico la lee del inventario);
 * sin dato se usa UND, igual que el clásico.
 */
export function htmlOrdenPago(
  oc: OrdenPago,
  empresa: EmpresaDocumentos | null,
  unidadDe: (inventarioId: string | null | undefined) => string | undefined,
  logo = LOGO_ORDEN,
): string {
  const usd = esUSD(oc.moneda);
  const sym = usd ? 'US$' : 'S/';
  const txtMoneda = usd ? 'DÓLARES' : 'SOLES';
  const tc = num(oc.tipo_cambio) || TC_CLASICO;

  // Mismo cálculo que el clásico: importe de la línea (o cantidad × costo) y total en soles convertido si es en US$
  const lineas = (oc.items ?? []).map(it => ({
    ...it,
    cant: num(it.cantidad),
    cu: num(it.costo_unitario),
    imp: num(it.importe) || num(it.cantidad) * num(it.costo_unitario),
  }));
  const subtotal = lineas.reduce((s, l) => s + l.imp, 0);
  let total = oc.tipo_igv === 'mas_igv' ? subtotal * 1.18 : subtotal;
  const totalPen = num(oc.total_pen);
  if (totalPen > 0) total = usd ? totalPen / tc : totalPen;

  const condicion = esCredito(oc)
    ? `CRÉDITO${oc.dias_credito ? ` / ${oc.dias_credito} DÍAS` : ''}`
    : (oc.condicion_pago || 'Al contado').toUpperCase();
  const titulo = (oc.tipo_orden || 'ORDEN DE COMPRA').toUpperCase();
  const solicitante = oc.solicitante && oc.solicitante !== '—' ? oc.solicitante : (oc.autoriza || '');
  const fechaFmt = fechaDMA(oc.fecha);
  const provRuc = oc.proveedor_ruc ? ` (${esc(oc.proveedor_ruc)})` : '';
  const empNombre = (empresa?.nombre || '').toUpperCase();
  const empDireccion = (empresa?.direccion || '').toUpperCase();
  const empTelefono = empresa?.telefono || '';
  const empRuc = empresa?.ruc || '';

  const filas = lineas.map((l, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    const um = unidadDe(l.inventario_id) || 'UND';
    return `<tr style="background-color: ${bg};">`
      + `<td style="padding:10px 12px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;width:55px;">${fmt(l.cant, 0, 3)}</td>`
      + `<td style="padding:10px 12px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:600;color:#475569;font-size:11px;width:65px;">${esc(um)}</td>`
      + `<td style="padding:10px 12px;text-transform:uppercase;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">${esc(l.descripcion || l.inventario_id || '')}</td>`
      + `<td style="padding:10px 12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#334155;width:95px;">${fmt(l.cu, 2, 4)}</td>`
      + `<td style="padding:10px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;width:115px;">${fmt(l.imp, 2, 2)}</td>`
      + '</tr>';
  }).join('');

  return `
  <div style="font-family:'Plus Jakarta Sans', 'Inter', Arial, sans-serif;width:100%;padding:35px 40px;color:#0f172a;box-sizing:border-box;background:#ffffff;">

    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:18px;margin-bottom:24px;">
      <div style="display:flex;flex-direction:column;gap:3px;max-width:440px;">
        <img src="${esc(logo)}" style="max-height:52px;max-width:180px;object-fit:contain;margin-bottom:4px;display:block;" alt="Logo Empresa" />
        <div style="font-size:16px;font-weight:900;color:#0f172a;letter-spacing:-0.3px;line-height:1.2;text-transform:uppercase;">${esc(empNombre)}</div>
        ${empDireccion ? `<div style="font-size:9.5px;color:#475569;line-height:1.35;text-transform:uppercase;">${esc(empDireccion)}</div>` : ''}
        ${empTelefono ? `<div style="font-size:9.5px;color:#475569;">${esc(empTelefono)}</div>` : ''}
      </div>
      <div style="min-width:210px;max-width:260px;background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;padding:12px 18px;text-align:center;">
        ${empRuc ? `<div style="font-size:12px;font-weight:700;color:#0284c7;letter-spacing:0.5px;margin-bottom:3px;">RUC: ${esc(empRuc)}</div>` : ''}
        <div style="font-size:15px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">${esc(titulo)}</div>
        <div style="font-size:14px;font-weight:800;color:#2563eb;letter-spacing:0.5px;">N° ${esc(codigoOC(oc))}</div>
      </div>
    </div>

    <div style="display:flex;gap:15px;margin-bottom:22px;">
      <div style="flex:0 0 30%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
        <div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;margin-bottom:4px;">Fecha de Emisión</div>
        <div style="font-size:14px;font-weight:800;color:#0f172a;">${esc(fechaFmt)}</div>
      </div>
      <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
        <div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;margin-bottom:4px;">Proveedor</div>
        <div style="font-size:14px;font-weight:800;color:#0f172a;text-transform:uppercase;">${esc((oc.proveedor_nombre || '').toUpperCase())}<span style="font-weight:600;color:#475569;font-size:12px;">${provRuc}</span></div>
      </div>
    </div>

    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;overflow:hidden;">
      <div style="background:#f1f5f9;padding:9px 15px;font-size:11px;font-weight:800;color:#334155;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.5px;">Detalles de la Orden</div>
      <div style="display:flex;flex-wrap:wrap;padding:14px 15px;font-size:12px;">
        ${celdaDato('Tipo de Orden', esc(oc.tipo_orden || 'ORDEN DE COMPRA'))}
        ${celdaDato('Condición de Pago', esc(condicion))}
        ${celdaDato('Moneda', `${txtMoneda}${usd ? ` (T/C: ${tc.toFixed(3)})` : ''}`)}
        ${celdaDato('Placa / Vehículo', esc(oc.placa || ''))}
        ${solicitante ? celdaDato('Solicitante', esc(solicitante)) : ''}
        ${oc.centro_costo ? celdaDato('Centro de Costo', esc(oc.centro_costo)) : ''}
        ${celdaDato('Motivo', esc(oc.motivo_entrada || ''), '100%')}
      </div>
    </div>

    <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            <th style="padding:11px 12px;text-align:center;width:55px;font-weight:700;letter-spacing:0.5px;">CANT</th>
            <th style="padding:11px 12px;text-align:center;width:65px;font-weight:700;letter-spacing:0.5px;">U.M.</th>
            <th style="padding:11px 12px;text-align:left;font-weight:700;letter-spacing:0.5px;">DESCRIPCIÓN</th>
            <th style="padding:11px 12px;text-align:right;width:95px;font-weight:700;letter-spacing:0.5px;">P. UNIT</th>
            <th style="padding:11px 12px;text-align:right;width:115px;font-weight:700;letter-spacing:0.5px;">IMPORTE</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <div style="background:#f8fafc;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-top:2px solid #e2e8f0;">
        <div style="font-size:11.5px;color:#64748b;max-width:380px;"><b style="color:#334155;">SON:</b> ${esc(numeroALetras(total))} ${txtMoneda}</div>
        <div style="font-size:18px;color:#0f172a;">
          <span style="font-weight:700;font-size:13px;color:#64748b;margin-right:12px;text-transform:uppercase;">Total General</span>
          <b>${sym} ${fmt(total, 2, 2)}</b>
        </div>
      </div>
    </div>
  </div>`;
}

/** PDF de la orden de compra (una hoja A4) */
export async function pdfOrdenPago(
  oc: OrdenPago,
  empresa: EmpresaDocumentos | null,
  unidadDe: (inventarioId: string | null | undefined) => string | undefined,
): Promise<Blob> {
  const html = htmlOrdenPago(oc, empresa, unidadDe);
  return conElemento(html, el => generarPDFBlob(el, { orientacion: 'portrait', margen: 0 }));
}
