// PDF de la orden de compra. Es una copia del documento del clásico: _entGenerarHtmlPDF
// (modulos/almacen/entradas/logica.js), con la misma estructura, los mismos estilos en línea y el mismo contenido.
// Lo usan Almacén > Entradas y Tesorería > Pago de requerimientos (el clásico de pagos usa el mismo documento).
// Se renderiza con html2canvas/jsPDF (core/lib/pdf.ts) en su tamaño natural: no se reduce la escala.
import { generarPDFBlob, montarParaPDF } from '../../core/lib/pdf';
import type { EmpresaDocumentos, EntradaInv } from './api';
import { codigoLimpio, numeroALetras } from './entradaReglas';
import type { OrdenPago } from '../tesoreria/pago-datos';

/** Tipo de cambio que usa el clásico cuando la orden no trae uno */
const TC_CLASICO = 3.4;
/** Logo de la empresa del subdominio, cuando no hay uno guardado en el navegador */
const LOGO_RESPALDO = '/api/tenant-logo';
const FUENTE_URL = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap';

/** Renglón de la orden (el clásico lee cant, cu, imp, descripción y U.M.) */
export interface LineaOC {
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  costoUnitario: number;
  importe: number;
}

/** Datos del documento, con los nombres que usa el clásico para cada campo */
export interface OrdenCompraPdf {
  /** Código sin el prefijo ENT- */
  id: string;
  tipoOrden: string | null;
  fecha: string | null;
  usd: boolean;
  tipoCambio: number | null;
  condicionPago: string | null;
  diasCredito: number | string | null;
  placa: string | null;
  solicitante: string | null;
  centroCosto: string | null;
  motivoEntrada: string | null;
  tipoIgv: string | null;
  totalPen: number;
  proveedorNombre: string | null;
  proveedorRuc: string | null;
  lineas: LineaOC[];
  empresa: EmpresaDocumentos | null;
}

type UnidadDe = (id: string | null | undefined) => string | undefined;

/** Forma común de un renglón (detalle_entradas_inv o los items de Tesorería) */
interface LineaFuente {
  inventario_id?: string | null;
  descripcion?: string | null;
  cantidad?: number | string | null;
  costo_unitario?: number | string | null;
  importe?: number | string | null;
  item_unidad?: string | null;
}

const aNumero = (v: unknown) => Number(v) || 0;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** dd/mm/aaaa desde aaaa-mm-dd (como el clásico: split('T')[0] y se invierte) */
function fechaDMA(f: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

const esDolares = (moneda: string | null | undefined) => /DOL|USD|US\$/i.test(String(moneda ?? ''));

const lineasDe = (items: LineaFuente[] | null | undefined, unidadDe?: UnidadDe): LineaOC[] =>
  (items ?? []).map(it => {
    const cantidad = aNumero(it.cantidad);
    const costoUnitario = aNumero(it.costo_unitario);
    return {
      codigo: it.inventario_id || '—',
      descripcion: it.descripcion || it.inventario_id || '',
      unidad: it.item_unidad || unidadDe?.(it.inventario_id) || 'UND',
      cantidad,
      costoUnitario,
      importe: aNumero(it.importe) || cantidad * costoUnitario,
    };
  });

/** Orden de Almacén > Entradas (EntradaInv) */
export function ordenDesdeEntrada(p: {
  entrada: EntradaInv;
  empresa: EmpresaDocumentos | null;
  unidadDe?: UnidadDe;
}): OrdenCompraPdf {
  const e = p.entrada;
  return {
    id: codigoLimpio(e.id),
    tipoOrden: e.tipo_orden,
    fecha: e.fecha,
    usd: esDolares(e.moneda),
    tipoCambio: aNumero(e.tipo_cambio) || null,
    condicionPago: e.condicion_pago,
    diasCredito: e.dias_credito,
    placa: e.placa,
    solicitante: e.solicitante || e.autoriza,
    centroCosto: e.centro_costo ?? null,
    motivoEntrada: e.motivo_entrada,
    tipoIgv: e.tipo_igv,
    totalPen: aNumero(e.total_pen),
    proveedorNombre: e.proveedor_nombre,
    proveedorRuc: e.proveedor_ruc ?? null,
    lineas: lineasDe(e.items, p.unidadDe),
    empresa: p.empresa,
  };
}

/** Orden de Tesorería > Pago de requerimientos (OrdenPago, la misma orden vista desde pagos) */
export function ordenDesdeOrdenPago(p: {
  oc: OrdenPago;
  empresa: EmpresaDocumentos | null;
  unidadDe?: UnidadDe;
}): OrdenCompraPdf {
  const o = p.oc;
  return {
    id: String(o.folio ?? o.id).replace(/^ENT-/i, ''),
    tipoOrden: o.tipo_orden ?? null,
    fecha: o.fecha ?? null,
    usd: esDolares(o.moneda),
    tipoCambio: aNumero(o.tipo_cambio) || null,
    condicionPago: o.condicion_pago ?? null,
    diasCredito: o.dias_credito ?? null,
    placa: o.placa ?? null,
    solicitante: o.solicitante || o.autoriza || null,
    centroCosto: o.centro_costo ?? null,
    motivoEntrada: o.motivo_entrada || o.motivo || null,
    tipoIgv: o.tipo_igv ?? null,
    totalPen: aNumero(o.total_pen),
    proveedorNombre: o.proveedor_nombre ?? null,
    proveedorRuc: o.proveedor_ruc ?? null,
    lineas: lineasDe(o.items, p.unidadDe),
    empresa: p.empresa,
  };
}

/**
 * Total del documento, igual que el clásico: suma de renglones (con +18 % si es "mas_igv"); si la orden tiene
 * total en soles, ese manda (en dólares se divide entre el tipo de cambio).
 */
export function totalOrdenCompra(d: OrdenCompraPdf): number {
  const tc = Number(d.tipoCambio) || TC_CLASICO;
  const subtotalItems = d.lineas.reduce((s, l) => s + (l.importe > 0 ? l.importe : l.cantidad * l.costoUnitario), 0);
  let totalReal = d.tipoIgv === 'mas_igv' ? subtotalItems * 1.18 : subtotalItems;
  if (d.totalPen > 0) {
    totalReal = d.usd && tc > 0 ? d.totalPen / tc : d.totalPen;
  }
  if (totalReal === 0 && d.totalPen) {
    totalReal = d.usd && tc > 0 ? d.totalPen / tc : d.totalPen;
  }
  return totalReal;
}

/** HTML del documento: misma estructura y estilos en línea que _entGenerarHtmlPDF del clásico */
export function htmlOrdenCompra(d: OrdenCompraPdf): string {
  const emp = d.empresa;
  const tc = Number(d.tipoCambio) || TC_CLASICO;
  const totalReal = totalOrdenCompra(d);
  const usd = d.usd;
  const txtMoneda = usd ? 'DÓLARES' : 'SOLES';
  const txtMonedaS = usd ? 'US$' : 'S/';
  const totalText = totalReal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const itemsHTML = d.lineas.map((it, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    return '<tr style="background-color: ' + bg + ';">' +
      '<td style="padding:10px 12px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;width:55px;">' + it.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 3 }) + '</td>' +
      '<td style="padding:10px 12px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:600;color:#475569;font-size:11px;width:65px;">' + esc(it.unidad) + '</td>' +
      '<td style="padding:10px 12px;text-transform:uppercase;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">' + esc(it.descripcion) + '</td>' +
      '<td style="padding:10px 12px;text-align:right;border-bottom:1px solid #e2e8f0;color:#334155;width:95px;">' + it.costoUnitario.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '</td>' +
      '<td style="padding:10px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;width:115px;">' + it.importe.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>' +
      '</tr>';
  }).join('');

  let condPagoText = (d.condicionPago || 'AL CONTADO').toUpperCase();
  if (d.condicionPago && d.condicionPago.toLowerCase() === 'a crédito') {
    condPagoText = 'CRÉDITO' + (d.diasCredito ? ' / ' + d.diasCredito + ' DÍAS' : '');
  }

  const numDisplay = d.id;
  const tipoDocTitle = (d.tipoOrden || 'ORDEN DE COMPRA').toUpperCase();

  // Datos de la empresa: el clásico los lee del navegador (sincronizados con /api/configuracion)
  const logoGuardado = (() => { try { return localStorage.getItem('fleet_empresa_logo') || ''; } catch { return ''; } })();
  const correo = (() => { try { return localStorage.getItem('fleet_empresa_correo') || ''; } catch { return ''; } })();
  const empLogo = logoGuardado || LOGO_RESPALDO;
  const empNombre = (emp?.nombre || '').toUpperCase();
  const empRuc = emp?.ruc || '';
  const empDireccion = (emp?.direccion || '').toUpperCase();
  const empTelefono = emp?.telefono || '';

  // Header Left: Logo + Info Empresa
  let headerLeftHtml = '<div style="display:flex;flex-direction:column;gap:3px;max-width:440px;">';
  if (empLogo) {
    headerLeftHtml += '<img src="' + esc(empLogo) + '" style="max-height:52px;max-width:180px;object-fit:contain;margin-bottom:4px;display:block;" alt="Logo Empresa" />';
  }
  headerLeftHtml += '<div style="font-size:16px;font-weight:900;color:#0f172a;letter-spacing:-0.3px;line-height:1.2;text-transform:uppercase;">' + esc(empNombre) + '</div>';
  if (empDireccion) {
    headerLeftHtml += '<div style="font-size:9.5px;color:#475569;line-height:1.35;text-transform:uppercase;">' + esc(empDireccion) + '</div>';
  }
  if (empTelefono) {
    headerLeftHtml += '<div style="font-size:9.5px;color:#475569;">' + esc(empTelefono) + '</div>';
  }
  if (correo) {
    headerLeftHtml += '<div style="font-size:9.5px;color:#475569;">' + esc(correo) + '</div>';
  }
  headerLeftHtml += '</div>';

  // Header Right: Tarjeta Recuadro RUC + Tipo Documento + Correlativo
  const headerRightHtml = '<div style="min-width:210px;max-width:260px;background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;padding:12px 18px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.02);">' +
    (empRuc ? '<div style="font-size:12px;font-weight:700;color:#0284c7;letter-spacing:0.5px;margin-bottom:3px;">RUC: ' + esc(empRuc) + '</div>' : '') +
    '<div style="font-size:15px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">' + esc(tipoDocTitle) + '</div>' +
    '<div style="font-size:14px;font-weight:800;color:#2563eb;letter-spacing:0.5px;">N° ' + esc(numDisplay) + '</div>' +
    '</div>';

  // Formatear Fecha y Proveedor
  const fechaFmt = fechaDMA(d.fecha);
  const provNombre = (d.proveedorNombre || '').toUpperCase();
  const provRuc = d.proveedorRuc ? (' (' + d.proveedorRuc + ')') : '';

  const solicitante = d.solicitante || '';
  const placaVehiculo = d.placa || '';
  const motivoEntrada = d.motivoEntrada || '';

  return '' +
    '<div style="font-family:\'Plus Jakarta Sans\', \'Inter\', Arial, sans-serif;width:100%;margin:0 auto;padding:35px 40px;color:#0f172a;box-sizing:border-box;">' +

      '<!-- HEADER -->' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:18px;margin-bottom:24px;">' +
        headerLeftHtml +
        headerRightHtml +
      '</div>' +

      '<!-- RESUMEN FECHA Y PROVEEDOR -->' +
      '<div style="display:flex;gap:15px;margin-bottom:22px;">' +
        '<div style="flex:0 0 30%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">' +
          '<div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;margin-bottom:4px;">Fecha de Emisión</div>' +
          '<div style="font-size:14px;font-weight:800;color:#0f172a;">' + esc(fechaFmt) + '</div>' +
        '</div>' +
        '<div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">' +
          '<div style="font-size:10px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;margin-bottom:4px;">Proveedor</div>' +
          '<div style="font-size:14px;font-weight:800;color:#0f172a;text-transform:uppercase;">' + esc(provNombre) + '<span style="font-weight:600;color:#475569;font-size:12px;">' + esc(provRuc) + '</span></div>' +
        '</div>' +
      '</div>' +

      '<!-- DETALLES DE LA ORDEN -->' +
      '<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;overflow:hidden;">' +
        '<div style="background:#f1f5f9;padding:9px 15px;font-size:11px;font-weight:800;color:#334155;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.5px;">' +
          'Detalles de la Orden' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;padding:14px 15px;font-size:12px;">' +
          '<div style="width:50%;margin-bottom:12px;">' +
            '<span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Tipo de Orden</span>' +
            '<span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + esc(d.tipoOrden || 'ORDEN DE COMPRA') + '</span>' +
          '</div>' +
          '<div style="width:50%;margin-bottom:12px;">' +
            '<span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Condición de Pago</span>' +
            '<span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + esc(condPagoText) + '</span>' +
          '</div>' +
          '<div style="width:50%;margin-bottom:12px;">' +
            '<span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Moneda</span>' +
            '<span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + txtMoneda + (usd ? ' (T/C: ' + tc.toFixed(3) + ')' : '') + '</span>' +
          '</div>' +
          '<div style="width:50%;margin-bottom:12px;">' +
            '<span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Placa / Vehículo</span>' +
            '<span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + esc(placaVehiculo) + '</span>' +
          '</div>' +
          (solicitante ? '<div style="width:50%;margin-bottom:12px;"><span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Solicitante</span><span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + esc(solicitante) + '</span></div>' : '') +
          (d.centroCosto ? '<div style="width:50%;margin-bottom:12px;"><span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Centro de Costo</span><span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + esc(d.centroCosto) + '</span></div>' : '') +
          '<div style="width:100%;margin-top:2px;">' +
            '<span style="font-size:10.5px;color:#64748b;display:block;margin-bottom:2px;text-transform:uppercase;font-weight:600;">Motivo</span>' +
            '<span style="font-weight:700;color:#0f172a;text-transform:uppercase;">' + esc(motivoEntrada) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- TABLA DE ARTÍCULOS -->' +
      '<div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">' +
        '<table style="width:100%;font-size:12px;border-collapse:collapse;">' +
          '<thead>' +
            '<tr style="background:#0f172a;color:#ffffff;">' +
              '<th style="padding:11px 12px;text-align:center;width:55px;font-weight:700;letter-spacing:0.5px;">CANT</th>' +
              '<th style="padding:11px 12px;text-align:center;width:65px;font-weight:700;letter-spacing:0.5px;">U.M.</th>' +
              '<th style="padding:11px 12px;text-align:left;font-weight:700;letter-spacing:0.5px;">DESCRIPCIÓN</th>' +
              '<th style="padding:11px 12px;text-align:right;width:95px;font-weight:700;letter-spacing:0.5px;">P. UNIT</th>' +
              '<th style="padding:11px 12px;text-align:right;width:115px;font-weight:700;letter-spacing:0.5px;">IMPORTE</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            itemsHTML +
          '</tbody>' +
        '</table>' +
        '<div style="background:#f8fafc;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-top:2px solid #e2e8f0;">' +
          '<div style="font-size:11.5px;color:#64748b;max-width:380px;">' +
            '<b style="color:#334155;">SON:</b> ' + numeroALetras(totalReal) + ' ' + txtMoneda +
          '</div>' +
          '<div style="font-size:18px;color:#0f172a;">' +
            '<span style="font-weight:700;font-size:13px;color:#64748b;margin-right:12px;text-transform:uppercase;">Total General</span>' +
            '<b>' + txtMonedaS + ' ' + totalText + '</b>' +
          '</div>' +
        '</div>' +
      '</div>' +

    '</div>';
}

/** Espera imágenes (logo) y fuentes antes de capturar; si no, la primera captura sale sin ellas */
async function esperarRecursos(el: HTMLElement): Promise<void> {
  await Promise.all(Array.from(el.querySelectorAll('img')).map(img =>
    img.complete ? null : new Promise(r => { img.onload = r; img.onerror = r; }),
  ));
  await document.fonts?.ready;
}

/** Carga la fuente del clásico (Plus Jakarta Sans) una sola vez; sin red sale con Inter o Arial */
function cargarFuente(): void {
  if (document.querySelector('link[data-orden-compra-fuente]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FUENTE_URL;
  link.setAttribute('data-orden-compra-fuente', '');
  document.head.appendChild(link);
}

/** PDF de la orden de compra, en su tamaño natural (sin reducir la escala para caber en una hoja) */
export async function generarPdfOrdenCompra(d: OrdenCompraPdf): Promise<Blob> {
  cargarFuente();
  const el = document.createElement('div');
  el.style.cssText = 'width:210mm;background:#ffffff;';
  el.innerHTML = htmlOrdenCompra(d);
  const quitar = montarParaPDF(el);
  try {
    await esperarRecursos(el);
    return await generarPDFBlob(el, { orientacion: 'portrait', margen: 0, paginado: true, titulo: `Orden de compra ${d.id}` });
  } finally {
    quitar();
  }
}
