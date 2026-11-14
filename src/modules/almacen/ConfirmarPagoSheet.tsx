import type { OrdenPago } from '../tesoreria/pago-datos';
import { PagoProcesarSheet } from '../tesoreria/pago-procesar-sheet';
import type { EntradaInv } from './api';

interface Props {
  entrada: EntradaInv | null;
  open: boolean;
  onClose: () => void;
  /** Se llama cuando el pago quedó registrado */
  onPagado: () => void;
}

/** Misma hoja que Tesorería › Pago de requerimientos (datos a la izquierda, resumen a la derecha). Solo convierte la orden al formato de esa pantalla. */
function comoOrdenPago(e: EntradaInv): OrdenPago {
  return {
    id: e.id, folio: e.id, fecha: e.fecha, solicitante: e.solicitante ?? undefined, centro_costo: e.centro_costo ?? undefined, sub_motivo: e.sub_motivo ?? undefined,
    motivo: e.motivo_entrada ?? undefined, motivo_entrada: e.motivo_entrada ?? undefined, tipo_orden: e.tipo_orden ?? undefined, moneda: e.moneda,
    importe: e.total_oc ?? undefined, total_pen: e.total_pen, tipo_cambio: e.tipo_cambio ?? undefined, tipo_igv: e.tipo_igv ?? undefined,
    placa: e.placa ?? undefined, ot_id: e.ot_id ?? undefined, creador_nombre: e.creador_nombre ?? undefined, condicion_pago: e.condicion_pago ?? undefined, prioridad: e.prioridad ?? undefined,
    proveedor_id: e.proveedor_id, proveedor_nombre: e.proveedor_nombre ?? undefined, proveedor_ruc: e.proveedor_ruc ?? undefined,
    cuenta_bancaria_proveedor: e.cuenta_bancaria_proveedor ?? undefined, cuenta_bancaria_empresa: e.cuenta_bancaria_empresa ?? undefined,
    estado: e.estado ?? undefined, nc_sugeridas: e.nc_sugeridas ?? undefined,
    url_cotizacion_presigned: e.url_cotizacion_presigned, url_factura_presigned: e.url_factura_presigned, url_voucher_presigned: e.url_voucher_presigned,
    items: (e.items ?? []).map(it => ({ inventario_id: it.inventario_id ?? '', descripcion: it.descripcion, cantidad: it.cantidad, costo_unitario: it.costo_unitario, moneda: it.moneda, importe: it.importe })),
  };
}

export function ConfirmarPagoSheet({ entrada, open, onClose, onPagado }: Props) {
  return <PagoProcesarSheet oc={entrada ? comoOrdenPago(entrada) : null} open={open} onClose={onClose} onPagado={onPagado} />;
}
