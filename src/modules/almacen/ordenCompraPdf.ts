// PDF de la orden de compra. Es una copia del documento del clásico: _entGenerarHtmlPDF
// (modulos/almacen/entradas/logica.js), con la misma estructura, los mismos estilos en línea y el mismo contenido.
// Lo usan Almacén > Entradas y Tesorería > Pago de requerimientos (el clásico de pagos usa el mismo documento).
// Se renderiza con html2canvas/jsPDF (core/lib/pdf.ts) en su tamaño natural: no se reduce la escala.
// Diseño propio, limpio y moderno (tarjetas suaves, líneas finas); mantiene los mismos datos y columnas del documento anterior.
import { generarPDFBlob, montarParaPDF } from '../../core/lib/pdf';
import type { EmpresaDocumentos, EntradaInv } from './api';
import { codigoLimpio, desgloseIgv, numeroALetras } from './entradaReglas';
import type { OrdenPago } from '../tesoreria/pago-datos';

/** Tipo de cambio que usa el clásico cuando la orden no trae uno */
const TC_CLASICO = 3.4;
/** Logo de la empresa del subdominio, cuando no hay uno guardado en el navegador */
const LOGO_RESPALDO = '/api/tenant-logo';
const FUENTE_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';

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
  /** Tamaño del logo en píxeles, ya ajustado a su proporción (lo calcula generarPdfOrdenCompra) */
  logoAncho?: number;
  logoAlto?: number;
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

/** Colores del documento: neutros y suaves (papel blanco, texto casi negro, grises de apoyo y un único acento) */
const C = {
  texto: '#1d1d1f', suave: '#6e6e73', tenue: '#8e8e93', linea: '#e5e5ea', fondo: '#f5f5f7', acento: '#0a66c2',
};
const FUENTE = "'Inter','Plus Jakarta Sans',-apple-system,'SF Pro Text','Segoe UI',Roboto,Arial,sans-serif";

/** Dato con título pequeño en mayúsculas y valor debajo */
const dato = (titulo: string, valor: string, ancho = '33.33%') =>
  '<div style="width:' + ancho + ';box-sizing:border-box;padding:0 10px 10px 0;">' +
    '<div style="font-size:8.5px;font-weight:600;letter-spacing:0.7px;text-transform:uppercase;color:' + C.tenue + ';margin-bottom:2px;">' + esc(titulo) + '</div>' +
    '<div style="font-size:11px;font-weight:600;color:' + C.texto + ';line-height:1.3;">' + (esc(valor) || '—') + '</div>' +
  '</div>';

/** HTML del documento: diseño limpio y moderno (tarjetas suaves, líneas finas, cifras alineadas) */
export function htmlOrdenCompra(d: OrdenCompraPdf): string {
  const emp = d.empresa;
  const tc = Number(d.tipoCambio) || TC_CLASICO;
  const totalReal = totalOrdenCompra(d);
  const usd = d.usd;
  const txtMoneda = usd ? 'DÓLARES' : 'SOLES';
  const txtMonedaS = usd ? 'US$' : 'S/';
  const fmt2 = (n: number) => n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalText = fmt2(totalReal);

  // Desglose de IGV solo cuando la orden lo declara (el total ya incluye el 18 %)
  const { gravado: base, igv, conIgv } = desgloseIgv(totalReal, d.tipoIgv);

  const th = 'padding:7px 8px;font-size:8.5px;font-weight:600;letter-spacing:0.7px;text-transform:uppercase;color:' + C.tenue + ';border-bottom:1px solid ' + C.linea + ';line-height:1.25;';
  const itemsHTML = d.lineas.map(it => {
    const td = 'padding:5.5px 8px;border-bottom:1px solid ' + C.linea + ';vertical-align:top;';
    return '<tr>' +
      '<td style="' + td + 'text-align:left;font-size:9.5px;font-weight:500;color:' + C.suave + ';white-space:nowrap;">' + esc(it.codigo) + '</td>' +
      '<td style="' + td + 'text-align:center;font-weight:600;color:' + C.texto + ';">' + it.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 3 }) + '</td>' +
      '<td style="' + td + 'text-align:center;font-size:10px;color:' + C.suave + ';">' + esc(it.unidad) + '</td>' +
      '<td style="' + td + 'text-transform:uppercase;font-weight:600;color:' + C.texto + ';line-height:1.3;">' + esc(it.descripcion) + '</td>' +
      '<td style="' + td + 'text-align:right;color:' + C.suave + ';">' + it.costoUnitario.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '</td>' +
      '<td style="' + td + 'text-align:right;font-weight:700;color:' + C.texto + ';">' + fmt2(it.importe) + '</td>' +
      '</tr>';
  }).join('');

  let condPagoText = (d.condicionPago || 'AL CONTADO').toUpperCase();
  if (d.condicionPago && d.condicionPago.toLowerCase() === 'a crédito') {
    condPagoText = 'CRÉDITO' + (d.diasCredito ? ' / ' + d.diasCredito + ' DÍAS' : '');
  }

  const tipoDocTitle = (d.tipoOrden || 'ORDEN DE COMPRA').toUpperCase();

  // Datos de la empresa: se leen del navegador (sincronizados con /api/configuracion)
  const logoGuardado = (() => { try { return localStorage.getItem('fleet_empresa_logo') || ''; } catch { return ''; } })();
  const correo = (() => { try { return localStorage.getItem('fleet_empresa_correo') || ''; } catch { return ''; } })();
  const empLogo = logoGuardado || LOGO_RESPALDO;
  const empNombre = (emp?.nombre || '').toUpperCase();
  const empRuc = emp?.ruc || '';
  const empDireccion = (emp?.direccion || '').toUpperCase();
  const empTelefono = emp?.telefono || '';

  // Logo: con ancho y alto en píxeles que respetan su proporción (html2canvas no respeta object-fit ni width:auto y lo estiraba)
  const logoHtml = empLogo
    ? '<img src="' + esc(empLogo) + '" style="' + (d.logoAncho && d.logoAlto ? 'width:' + d.logoAncho + 'px;height:' + d.logoAlto + 'px;' : 'height:40px;') + 'display:block;margin-bottom:6px;" alt="Logo" />'
    : '';

  const izquierda = '<div style="max-width:380px;">' + logoHtml +
    '<div style="font-size:13px;font-weight:700;color:' + C.texto + ';letter-spacing:-0.1px;line-height:1.25;">' + esc(empNombre) + '</div>' +
    '<div style="font-size:9px;color:' + C.suave + ';line-height:1.45;margin-top:2px;">' +
      (empRuc ? 'RUC ' + esc(empRuc) : '') +
      (empDireccion ? '<br/>' + esc(empDireccion) : '') +
      (empTelefono || correo ? '<br/>' + esc([empTelefono, correo].filter(Boolean).join('  ·  ')) : '') +
    '</div></div>';

  const derecha = '<div style="text-align:right;">' +
    '<div style="font-size:9px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:' + C.acento + ';">' + esc(tipoDocTitle) + '</div>' +
    '<div style="font-size:24px;font-weight:700;letter-spacing:-0.6px;color:' + C.texto + ';line-height:1.15;margin-top:2px;">N° ' + esc(d.id) + '</div>' +
    '<div style="font-size:10px;color:' + C.suave + ';margin-top:4px;">Emitida el ' + esc(fechaDMA(d.fecha)) + '</div>' +
  '</div>';

  const provNombre = (d.proveedorNombre || '').toUpperCase();
  const provRuc = d.proveedorRuc ? 'RUC ' + d.proveedorRuc : '';

  const detalles =
    dato('Tipo de orden', d.tipoOrden || 'ORDEN DE COMPRA') +
    dato('Condición de pago', condPagoText) +
    dato('Moneda', txtMoneda + (usd ? ' (T/C ' + tc.toFixed(3) + ')' : '')) +
    dato('Placa / vehículo', d.placa || '') +
    dato('Solicitante', d.solicitante || '') +
    dato('Centro de costo', d.centroCosto || '');

  return '' +
    '<div style="font-family:' + FUENTE + ';width:100%;margin:0 auto;padding:26px 32px 22px;color:' + C.texto + ';box-sizing:border-box;-webkit-font-smoothing:antialiased;">' +

      // Encabezado
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid ' + C.linea + ';margin-bottom:14px;">' +
        izquierda + derecha +
      '</div>' +

      // Proveedor
      '<div style="background:' + C.fondo + ';border-radius:12px;padding:11px 14px;margin-bottom:10px;">' +
        '<div style="font-size:8.5px;font-weight:600;letter-spacing:0.7px;text-transform:uppercase;color:' + C.tenue + ';margin-bottom:2px;">Proveedor</div>' +
        '<div style="font-size:13px;font-weight:700;color:' + C.texto + ';">' + esc(provNombre) +
          (provRuc ? '<span style="font-weight:500;color:' + C.suave + ';font-size:10.5px;margin-left:8px;">' + esc(provRuc) + '</span>' : '') +
        '</div>' +
      '</div>' +

      // Detalles de la orden
      '<div style="background:' + C.fondo + ';border-radius:12px;padding:11px 4px 1px 14px;margin-bottom:14px;">' +
        '<div style="display:flex;flex-wrap:wrap;">' + detalles + '</div>' +
        (d.motivoEntrada
          ? '<div style="padding:0 10px 10px 0;"><div style="font-size:8.5px;font-weight:600;letter-spacing:0.7px;text-transform:uppercase;color:' + C.tenue + ';margin-bottom:2px;">Motivo</div>' +
            '<div style="font-size:11px;font-weight:600;color:' + C.texto + ';line-height:1.3;text-transform:uppercase;">' + esc(d.motivoEntrada) + '</div></div>'
          : '') +
      '</div>' +

      // Tabla
      '<table style="width:100%;font-size:10.5px;border-collapse:collapse;table-layout:fixed;">' +
        '<thead><tr>' +
          '<th style="' + th + 'text-align:left;width:68px;">Código</th>' +
          '<th style="' + th + 'text-align:center;width:42px;">Cant</th>' +
          '<th style="' + th + 'text-align:center;width:62px;">Unidad de medida</th>' +
          '<th style="' + th + 'text-align:left;">Descripción</th>' +
          '<th style="' + th + 'text-align:right;width:70px;">Precio unitario</th>' +
          '<th style="' + th + 'text-align:right;width:82px;">Importe</th>' +
        '</tr></thead>' +
        '<tbody>' + itemsHTML + '</tbody>' +
      '</table>' +

      // Totales
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-top:14px;">' +
        '<div style="font-size:9.5px;color:' + C.suave + ';max-width:340px;line-height:1.4;">' +
          '<span style="font-weight:600;color:' + C.texto + ';">Son:</span> ' + numeroALetras(totalReal) + ' ' + txtMoneda +
        '</div>' +
        '<div style="min-width:210px;background:' + C.fondo + ';border-radius:12px;padding:10px 14px;">' +
          (conIgv
            ? '<div style="display:flex;justify-content:space-between;font-size:10px;color:' + C.suave + ';margin-bottom:3px;"><span>Subtotal</span><span>' + txtMonedaS + ' ' + fmt2(base) + '</span></div>' +
              '<div style="display:flex;justify-content:space-between;font-size:10px;color:' + C.suave + ';margin-bottom:6px;"><span>IGV 18 %</span><span>' + txtMonedaS + ' ' + fmt2(igv) + '</span></div>'
            : '') +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;' + (conIgv ? 'border-top:1px solid ' + C.linea + ';padding-top:6px;' : '') + '">' +
            '<span style="font-size:9px;font-weight:600;letter-spacing:0.7px;text-transform:uppercase;color:' + C.tenue + ';">Total</span>' +
            '<span style="font-size:17px;font-weight:700;letter-spacing:-0.3px;color:' + C.texto + ';">' + txtMonedaS + ' ' + totalText + '</span>' +
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
/** Mide el logo y lo ajusta a una caja de 150 × 44 px sin deformarlo; null si no se pudo cargar */
function medirLogo(src: string): Promise<{ ancho: number; alto: number } | null> {
  return new Promise(ok => {
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return ok(null);
      const k = Math.min(150 / img.naturalWidth, 44 / img.naturalHeight);
      ok({ ancho: Math.round(img.naturalWidth * k), alto: Math.round(img.naturalHeight * k) });
    };
    img.onerror = () => ok(null);
    img.src = src;
  });
}

export async function generarPdfOrdenCompra(d: OrdenCompraPdf): Promise<Blob> {
  cargarFuente();
  const logoGuardado = (() => { try { return localStorage.getItem('fleet_empresa_logo') || ''; } catch { return ''; } })();
  const medida = await medirLogo(logoGuardado || LOGO_RESPALDO);
  if (medida) d = { ...d, logoAncho: medida.ancho, logoAlto: medida.alto };
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
