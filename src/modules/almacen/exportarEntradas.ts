import { exportarExcel, type CeldaEnlace } from '../../core/lib/excel';
import type { EntradaInv, ItemEntrada } from './api';
import { codigoLimpio, fechaOrden } from './entradaReglas';

// Excel de las órdenes de compra, con las mismas columnas que el clásico (modulos/almacen/entradas):
// - Consolidado: una fila por orden (20 columnas), como la vista «Por órdenes».
// - Por artículos: una fila por artículo (22 columnas), como la vista «Por artículos».
// Los adjuntos van como enlaces. Se exporta lo que está filtrado en pantalla.

// Campos que el servidor envía pero el tipo EntradaInv no declara (centro de costo, aprobador)
type EntradaExtendida = EntradaInv & { centro_costo?: string | null; aprobador_nombre?: string | null };

/** Quita el código de inventario del inicio de la descripción: "INV-0001 — Filtro" → "Filtro" */
const descripcionLimpia = (it: ItemEntrada) => {
  const d = String(it.descripcion ?? '');
  return it.inventario_id ? d.replace(new RegExp(`^${it.inventario_id}\\s*[—-]?\\s*`, 'i'), '') : d;
};

/** Enlace a un adjunto, o vacío si no hay archivo */
const enlace = (texto: string, url: string | null | undefined): CeldaEnlace | string => (url ? { texto, enlace: url } : '');

const adjuntos = (e: EntradaInv) => ({
  voucher: enlace('Ver Voucher', e.url_voucher_presigned || e.url_voucher),
  cotizacion: enlace('Ver Cotización', e.url_cotizacion_presigned || e.url_cotizacion),
  factura: enlace('Ver Factura', e.url_factura_presigned || e.url_factura),
});

const aprobadorDe = (e: EntradaExtendida) => e.aprobador_nombre || e.aprobado_por || e.autoriza || e.solicitante || '';
const creditoDias = (e: EntradaInv) => (e.condicion_pago === 'A crédito' ? (parseInt(String(e.dias_credito ?? ''), 10) || 30) : 0);

export async function exportarConsolidadoOC(lista: EntradaInv[]) {
  const encabezados = [
    'Código Orden', 'Fecha', 'Tipo Orden', 'Estado', 'Aprobador / Solicitante', 'Placa', 'Motivo', 'Proveedor',
    'Ítems (Cant.)', 'Resumen Artículos', 'Total Unidades', 'Total Monto PEN', 'Centro de Costo', 'Condición Pago',
    'Días Crédito', 'Moneda', 'Voucher', 'Cotización', 'Factura', 'Observaciones',
  ];

  const filas = lista.map(e => {
    const x = e as EntradaExtendida;
    const items = e.items ?? [];
    const adj = adjuntos(e);
    const resumen = items.length
      ? items.map(it => `${descripcionLimpia(it)} (${Number(it.cantidad) || 0})`).join('; ')
      : 'Sin artículos';
    return [
      codigoLimpio(e.id),
      fechaOrden(e),
      e.tipo_orden || 'Orden de compra',
      String(e.estado || 'REGISTRADA').toUpperCase(),
      aprobadorDe(x),
      e.placa || '',
      e.motivo_entrada || '',
      e.proveedor_nombre || '',
      items.length,
      resumen,
      items.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0),
      Number(e.total_pen ?? 0),
      x.centro_costo || 'CC-100',
      e.condicion_pago || 'Al contado',
      creditoDias(e),
      e.moneda || 'PEN',
      adj.voucher,
      adj.cotizacion,
      adj.factura,
      e.observaciones || '',
    ];
  });

  await exportarExcel('Ordenes_Compra_Consolidado_Azkell', 'Órdenes (Consolidado)', encabezados, filas);
}

export async function exportarDetalleArticulosOC(lista: EntradaInv[]) {
  const encabezados = [
    'Código Orden', 'Tipo Orden', 'Fecha', 'Estado', 'Aprobador / Solicitante', 'Placa', 'Motivo', 'Proveedor',
    'Centro de Costo', 'Cód. Artículo', 'Descripción Artículo', 'Cantidad', 'Costo Unit.', 'Importe Ítem',
    'Total Orden PEN', 'Condición Pago', 'Días Crédito', 'Moneda', 'Voucher', 'Cotización', 'Factura', 'Observaciones',
  ];

  const filas: Array<Array<string | number | CeldaEnlace>> = [];
  for (const e of lista) {
    const x = e as EntradaExtendida;
    const adj = adjuntos(e);
    // Cabecera de la orden que se repite en cada artículo
    const cab = [
      codigoLimpio(e.id),
      e.tipo_orden || 'Orden de compra',
      fechaOrden(e),
      String(e.estado || 'REGISTRADA').toUpperCase(),
      aprobadorDe(x),
      e.placa || '',
      e.motivo_entrada || '',
      e.proveedor_nombre || '',
      x.centro_costo || 'CC-100',
    ];
    const cola = [
      Number(e.total_pen ?? 0),
      e.condicion_pago || 'Al contado',
      creditoDias(e),
      e.moneda || 'PEN',
      adj.voucher,
      adj.cotizacion,
      adj.factura,
      e.observaciones || '',
    ];
    const items = e.items ?? [];
    if (!items.length) {
      filas.push([...cab, '', 'Sin artículos', 0, 0, 0, ...cola]);
      continue;
    }
    for (const it of items) {
      const cant = Number(it.cantidad) || 0;
      const cu = Number(it.costo_unitario) || 0;
      const imp = Number(it.importe) || cant * cu;
      filas.push([...cab, it.inventario_id || '', it.descripcion || '', cant, cu, imp, ...cola]);
    }
  }

  await exportarExcel('Ordenes_Compra_Detalle_Articulos_Azkell', 'Órdenes (Por Artículos)', encabezados, filas);
}

/** Plantilla para importar órdenes desde Excel (mismas columnas y ejemplos que el clásico) */
export const ENCABEZADOS_IMPORTAR_OC = ['fecha', 'proveedor_nombre', 'documento_referencia', 'inventario_id', 'descripcion', 'cantidad', 'costo_unitario', 'moneda'];
export const EJEMPLO_IMPORTAR_OC = [
  ['2025-01-15', 'PROVEEDOR EJEMPLO', 'FACTURA F001-12345', 'INV-0001', 'FILTRO ACEITE MOTOR', 5, 45, 'PEN'],
  ['2025-01-15', 'PROVEEDOR EJEMPLO', 'FACTURA F001-12345', 'INV-0002', 'ACEITE MOTOR 15W40', 20, 12.5, 'PEN'],
];

export const descargarPlantillaEntradas = () =>
  exportarExcel('Plantilla_Entradas', 'Plantilla', ENCABEZADOS_IMPORTAR_OC, EJEMPLO_IMPORTAR_OC);
