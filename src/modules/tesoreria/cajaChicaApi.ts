import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// Caja chica: fondos por responsable y moneda, sus gastos, sustentos, descuentos y reposiciones.
const BASE = '/tesoreria/caja-chica';

export interface MovimientoChica {
  id: number;
  fondo_id: number;
  tipo: 'INGRESO' | 'EGRESO';
  concepto: 'ASIGNACION' | 'GASTO' | 'REPOSICION' | 'DESCUENTO';
  fecha: string;
  monto: number | string;
  descripcion: string | null;
  motivo: string | null;
  sub_motivo: string | null;
  centro_costo: string | null;
  placa: string | null;
  proveedor: string | null;
  oc_id: string | null;
  comprobante_url: string | null;
  estado_sustento: 'PENDIENTE' | 'SUSTENTADO' | 'DESCONTADO' | null;
  plazo_vence: string | null;
  aprob_tesoreria_por: string | null;
  aprob_gerencia_por: string | null;
  reposicion_id: number | null;
  creado_por: string | null;
}

export interface FondoChica {
  id: number;
  responsable: string;
  moneda: 'SOLES' | 'DOLARES';
  monto_asignado: number | string;
  cuenta_origen: string | null;
  descripcion: string | null;
  estado: 'PENDIENTE' | 'ACTIVA' | 'CERRADA' | 'RECHAZADA';
  aprob_tesoreria_por: string | null;
  aprob_gerencia_por: string | null;
  saldo: number;
  pendientes: number;
  vencidos: number;
  movimientos?: MovimientoChica[];
}

export interface ReposicionChica {
  id: number;
  fondo_id: number;
  responsable: string;
  moneda: 'SOLES' | 'DOLARES';
  monto: number | string;
  cuenta_origen: string | null;
  estado: 'PENDIENTE' | 'APROBADA';
  aprob_tesoreria_por: string | null;
  aprob_gerencia_por: string | null;
  creado_por: string | null;
}

export interface OcChica {
  id: string;
  proveedor: string | null;
  documento: string | null;
  moneda: string;
  total: number;
  pagado: number;
  pendiente: number;
  estado: string;
}

export const numero = (v: number | string | null | undefined) => Number(v) || 0;

export function useFondosChica() {
  return useQuery<FondoChica[]>({
    queryKey: ['tesoreria', 'caja-chica', 'fondos'],
    queryFn: () => api<FondoChica[]>(`${BASE}/fondos`),
    staleTime: 30_000,
  });
}

export function useFondoChica(id: number | null) {
  return useQuery<FondoChica>({
    queryKey: ['tesoreria', 'caja-chica', 'fondo', id],
    queryFn: () => api<FondoChica>(`${BASE}/fondos/${id}`),
    enabled: id != null,
  });
}

export function useReposicionesChica() {
  return useQuery<ReposicionChica[]>({
    queryKey: ['tesoreria', 'caja-chica', 'reposiciones'],
    queryFn: () => api<ReposicionChica[]>(`${BASE}/reposiciones`),
    staleTime: 30_000,
  });
}

export function useOcsChica(fondoId: number | null) {
  return useQuery<OcChica[]>({
    queryKey: ['tesoreria', 'caja-chica', 'ocs', fondoId],
    queryFn: () => api<OcChica[]>(`${BASE}/ocs`, { query: { fondo_id: fondoId ?? undefined } }),
    enabled: fondoId != null,
    staleTime: 30_000,
  });
}

/** Invalida todo lo de caja chica después de una acción */
export function useRefrescarChica() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['tesoreria', 'caja-chica'] });
}

/** Envía un formulario (con o sin archivo) a una acción de caja chica */
export function enviarChica(path: string, datos?: FormData | Record<string, unknown>) {
  return api<{ ok?: boolean; id?: number; estado?: string }>(`${BASE}${path}`, { method: 'POST', body: datos as never });
}
