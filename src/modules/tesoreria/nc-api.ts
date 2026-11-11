import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// Notas de crédito de proveedores (Tesorería). Contrato del servidor: routes/notas_credito_proveedor.js
export type EstadoNc = 'REGISTRADA' | 'APROBADA' | 'APLICADA_PARCIAL' | 'APLICADA' | 'REEMBOLSADA' | 'ANULADA';

export interface NotaCredito {
  id: number; codigo: string; proveedor_id: string | null; proveedor_nombre: string; proveedor_ruc: string | null;
  serie: string; numero: string; fecha_emision: string; moneda: 'PEN' | 'USD';
  base: number; igv: number; total: number; saldo: number; aplicado: number;
  motivo_sunat: string | null; motivo_texto: string | null; oc_origen: string | null; referencia_devolucion: string | null;
  forma: 'APLICAR' | 'REEMBOLSO'; estado: EstadoNc; tiene_archivo: boolean; archivo_url: string | null; observaciones: string | null;
  registrado_por: string | null; aprobado_por: string | null; fecha_aprobacion: string | null;
  anulado_por: string | null; motivo_anulacion: string | null;
  reembolso_fecha: string | null; reembolso_constancia: string | null; reembolso_url: string | null; creada_en: string;
}

export interface AplicacionNc { id: number; entrada_id: string; monto: number; moneda: string; estado: string; usuario: string | null; observacion?: string | null; fecha: string; orden_proveedor?: string | null; orden_motivo?: string | null }
export interface HistorialNc { id: number; accion: string; detalle: string | null; usuario: string | null; fecha: string }
export interface DetalleNc { ok: boolean; data: NotaCredito; aplicaciones: AplicacionNc[]; historial: HistorialNc[] }
export interface ResumenProveedorNc { clave: string; proveedor_id: string | null; proveedor_nombre: string; moneda: 'PEN' | 'USD'; notas: number; por_aprobar: number; saldo_a_favor: number; aplicado: number; total: number }
export interface NcDisponible { id: number; codigo: string; serie: string; numero: string; fecha_emision: string; moneda: string; total: number; saldo: number; motivo_texto: string | null; oc_origen: string | null }

/** Catálogo SUNAT 09: motivos de la nota de crédito */
export const MOTIVOS_SUNAT: Array<{ value: string; label: string }> = [
  { value: '01', label: 'Anulación de la operación' }, { value: '02', label: 'Anulación por error en el RUC' }, { value: '03', label: 'Corrección por error en la descripción' },
  { value: '04', label: 'Descuento global' }, { value: '05', label: 'Descuento por ítem' }, { value: '06', label: 'Devolución total' }, { value: '07', label: 'Devolución por ítem' },
  { value: '08', label: 'Bonificación' }, { value: '09', label: 'Disminución en el valor' }, { value: '10', label: 'Otros conceptos' },
];

export const ETIQUETA_ESTADO: Record<EstadoNc, string> = {
  REGISTRADA: 'Por aprobar', APROBADA: 'Aprobada', APLICADA_PARCIAL: 'Aplicada en parte', APLICADA: 'Aplicada', REEMBOLSADA: 'Reembolsada', ANULADA: 'Anulada',
};
export const TONO_ESTADO: Record<EstadoNc, 'amber' | 'green' | 'blue' | 'gray' | 'red'> = {
  REGISTRADA: 'amber', APROBADA: 'green', APLICADA_PARCIAL: 'blue', APLICADA: 'gray', REEMBOLSADA: 'gray', ANULADA: 'red',
};

export const simboloMoneda = (m: string) => (m === 'USD' ? 'US$' : 'S/');
export const montoNc = (n: number, m: string) => `${simboloMoneda(m)} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function useNotasCredito() {
  return useQuery({
    queryKey: ['tesoreria', 'notas-credito'],
    queryFn: () => api<{ data: NotaCredito[] }>('/compras/notas-credito').then(r => r.data ?? []),
    staleTime: 30_000,
  });
}

export function useResumenProveedoresNc() {
  return useQuery({
    queryKey: ['tesoreria', 'notas-credito', 'proveedores'],
    queryFn: () => api<{ data: ResumenProveedorNc[] }>('/compras/notas-credito/proveedores').then(r => r.data ?? []),
    staleTime: 30_000,
  });
}

export function useDetalleNc(id: number | null) {
  return useQuery({
    queryKey: ['tesoreria', 'notas-credito', 'detalle', id],
    queryFn: () => api<DetalleNc>(`/compras/notas-credito/${id}`),
    enabled: id != null,
  });
}

/** Notas que se pueden aplicar al pago de una orden (mismo proveedor y moneda). El proveedor lo toma el servidor de la propia orden. */
export function useNcDisponibles(entradaId: string | number | null, moneda: 'PEN' | 'USD', activo: boolean) {
  return useQuery({
    queryKey: ['tesoreria', 'notas-credito', 'disponibles', entradaId, moneda],
    queryFn: () => api<{ data: NcDisponible[] }>('/compras/notas-credito/disponibles', { query: { entrada_id: String(entradaId), moneda } }).then(r => r.data ?? []),
    enabled: activo && entradaId != null,
    staleTime: 0,
  });
}

export function useNcDeOrden(entradaId: string | number | null) {
  return useQuery({
    queryKey: ['tesoreria', 'notas-credito', 'por-oc', entradaId],
    queryFn: () => api<{ data: Array<{ id: number; nc_id: number; codigo: string; serie: string; numero: string; monto: number; moneda: string; usuario: string | null; fecha: string }> }>(`/compras/notas-credito/por-oc/${encodeURIComponent(String(entradaId))}`).then(r => r.data ?? []),
    enabled: entradaId != null,
    staleTime: 15_000,
  });
}

/** Enlaza la salida de almacén de la devolución a una nota que se registró sin ella */
export async function enlazarSalida(id: number, referencia: string) {
  return api(`/compras/notas-credito/${id}/enlazar-salida`, { method: 'POST', body: { referencia } });
}

/** ¿La nota es por una devolución y todavía no tiene su salida de almacén? */
export const faltaSalida = (n: Pick<NotaCredito, 'motivo_sunat' | 'referencia_devolucion' | 'estado'>) =>
  ['06', '07'].includes(n.motivo_sunat ?? '') && !n.referencia_devolucion && n.estado !== 'ANULADA';

export async function accionNc(id: number, accion: 'aprobar' | 'anular', cuerpo?: Record<string, unknown>) {
  return api(`/compras/notas-credito/${id}/${accion}`, { method: 'POST', body: cuerpo ?? {} });
}
