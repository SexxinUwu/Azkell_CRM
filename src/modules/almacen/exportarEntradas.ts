import { exportarExcel } from '../../core/lib/excel';
import type { EntradaInv, ItemEntrada } from './api';

// Consolidado de órdenes de compra (una fila por orden). Mismas 20 columnas y orden que el clásico
// (modulos/almacen/entradas, modo 'ordenes'). Fechas nativas, montos numéricos y moneda tal como viene del servidor.

// Campos que el servidor envía pero el tipo EntradaInv no declara (adjuntos y centro de costo)
type EntradaExtendida = EntradaInv & {
  centro_costo?: string | null;
  aprobador_nombre?: string | null;
  url_voucher?: string | null; url_voucher_presigned?: string | null;
  url_cotizacion?: string | null; url_cotizacion_presigned?: string | null;
  url_factura?: string | null; url_factura_presigned?: string | null;
};

// Quita el código de inventario del inicio de la descripción: "INV-0001 — Filtro" -> "Filtro"
const descripcionLimpia = (it: ItemEntrada) => {
  const d = String(it.descripcion ?? '');
  return it.inventario_id ? d.replace(new RegExp(`^${it.inventario_id}\\s*[—-]?\\s*`, 'i'), '') : d;
};

export async function exportarConsolidadoOC(lista: EntradaInv[]) {
  const encabezados = [
    'Código Orden', 'Fecha', 'Tipo Orden', 'Estado', 'Aprobador / Solicitante', 'Placa', 'Motivo', 'Proveedor',
    'Ítems (Cant.)', 'Resumen Artículos', 'Total Unidades', 'Total Monto PEN', 'Centro de Costo', 'Condición Pago',
    'Días Crédito', 'Moneda', 'Voucher', 'Cotización', 'Factura', 'Observaciones',
  ];

  const filas = lista.map(e => {
    const x = e as EntradaExtendida;
    const items = e.items ?? [];
    const fecha = e.fecha ? String(e.fecha).split('T')[0].split(' ')[0] : '';
    const resumen = items.length
      ? items.map(it => `${descripcionLimpia(it)} (${Number(it.cantidad) || 0})`).join('; ')
      : 'Sin artículos';
    const credito = e.condicion_pago === 'A crédito';
    return [
      String(e.id ?? '').replace(/^ENT-/i, ''),
      fecha,
      e.tipo_orden || 'Orden de compra',
      String(e.estado || 'REGISTRADA').toUpperCase(),
      x.aprobador_nombre || e.aprobado_por || e.autoriza || e.solicitante || '',
      e.placa || '',
      e.motivo_entrada || '',
      e.proveedor_nombre || '',
      items.length,
      resumen,
      items.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0),
      Number(e.total_pen ?? 0),
      x.centro_costo || 'CC-100',
      e.condicion_pago || 'Al contado',
      credito ? (parseInt(String(e.dias_credito ?? ''), 10) || 30) : 0,
      e.moneda || 'PEN',
      x.url_voucher_presigned || x.url_voucher || '',
      x.url_cotizacion_presigned || x.url_cotizacion || '',
      x.url_factura_presigned || x.url_factura || '',
      e.observaciones || '',
    ];
  });

  await exportarExcel('Ordenes_Compra_Consolidado', 'Órdenes (Consolidado)', encabezados, filas);
}
