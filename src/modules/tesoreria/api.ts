import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

function arr<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { data?: T[] })?.data) ?? [];
}

export interface CajaMovimiento {
  id?: number | string;
  numero?: string | null;
  concepto?: string | null;
  importe?: number | string | null;
  tipo?: string | null;
  estado?: string | null;
  fecha?: string | null;
  solicitante?: string | null;
  aprobado_por?: string | null;
  [key: string]: unknown;
}

export function useCaja() {
  return useQuery<CajaMovimiento[]>({
    queryKey: ['tesoreria', 'caja'],
    queryFn: () => api('/tesoreria/caja').then(r => arr<CajaMovimiento>(r)),
    staleTime: 30_000,
  });
}

export interface Liquidacion {
  id?: number | string;
  numero?: string | null;
  solicitante?: string | null;
  importe_total?: number | string | null;
  estado?: string | null;
  fecha?: string | null;
  descripcion?: string | null;
  [key: string]: unknown;
}

export function useLiquidaciones() {
  return useQuery<Liquidacion[]>({
    queryKey: ['tesoreria', 'liquidaciones'],
    queryFn: () => api('/tesoreria/liquidaciones-gastos').then(r => arr<Liquidacion>(r)),
    staleTime: 30_000,
  });
}

export interface CuentaPorCobrar {
  id: number;
  codigo_liquidacion: string | null;
  orden_servicio: string | null;
  fecha_liquidacion: string | null;
  numero_viaje: string | null;
  fecha_servicio: string | null;
  razon_social: string | null;
  placa_camion: string | null;
  placa_carreta: string | null;
  conductor: string | null;
  cliente: string | null;
  lugar: string | null;
  flete: number | string | null;
  comision_porcentaje: number | string | null;
  tarifa: number | string | null;
  gastos_operativos: number | string | null;
  base_imponible: number | string | null;
  igv: number | string | null;
  total: number | string | null;
  adelanto: number | string | null;
  detraccion: number | string | null;
  neto_cobrar: number | string | null;
  neto_cobrado: number | string | null;
  mes_facturacion: string | null;
  fecha_factura: string | null;
  serie: string | null;
  factura: string | null;
  factura_documento_url: string | null;
  nota_credito: string | null;
  nota_credito_url: string | null;
  credito_dias: number | null;
  fecha_cobrar: string | null;
  fecha_deposito: string | null;
  estado_servicio: string | null;    // PENDIENTE | PAGADO | ANULADO
  diferencia: number | string | null;
  observacion: string | null;
  documento_url: string | null;
  sustento_pago_url: string | null;
  [key: string]: unknown;
}

export function useCuentas() {
  return useQuery<CuentaPorCobrar[]>({
    queryKey: ['tesoreria', 'cuentas'],
    queryFn: () => api('/tesoreria/cuentas').then(r => arr<CuentaPorCobrar>(r)),
    staleTime: 30_000,
  });
}

export interface Banco {
  id?: number | string;
  banco?: string | null;
  titular?: string | null;
  moneda?: string | null;           // SOLES | DOLARES
  tipo_cuenta?: string | null;      // CORRIENTE | AHORROS | …
  numero_cuenta?: string | null;
  cci?: string | null;
  saldo_inicial?: number | string | null;
  estado?: string | null;           // ACTIVO | INACTIVO
  [key: string]: unknown;
}

export function useBancos() {
  return useQuery<Banco[]>({
    queryKey: ['tesoreria', 'bancos'],
    queryFn: () => api('/tesoreria/bancos').then(r => arr<Banco>(r)),
    staleTime: 120_000,
  });
}

export interface CentroCosto {
  id: number;
  codigo: string;
  nombre: string;
  nivel: string | null;
  cuenta_contable: string | null;
  requiere_placa: number | boolean;
  descripcion: string | null;
  estado: string;
  [key: string]: unknown;
}

export interface MotivoGasto {
  id: number;
  motivo: string;
  sub_motivo: string;
  centro_costo_codigo: string | null;
  estado: string;
}

export function useMotivosGastos() {
  return useQuery<MotivoGasto[]>({
    queryKey: ['tesoreria', 'motivos-gastos'],
    queryFn: () => api('/tesoreria/motivos-gastos').then(r => arr<MotivoGasto>(r)),
    staleTime: 120_000,
  });
}

/** Las escrituras de tesorería responden { ok, error }: un ok:false se convierte en excepción */
export async function escribirTesoreria(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) {
  const r = await api<{ ok?: boolean; error?: string; message?: string; id?: number }>(path, { method, body });
  if (r && r.ok === false) throw new Error(r.error || 'No se pudo guardar');
  return r;
}
export const guardarCentroCosto = (id: number | null, d: Record<string, unknown>) =>
  id ? escribirTesoreria(`/tesoreria/centros-costos/${id}`, 'PUT', d) : escribirTesoreria('/tesoreria/centros-costos', 'POST', d);
export const eliminarCentroCosto = (id: number) => escribirTesoreria(`/tesoreria/centros-costos/${id}`, 'DELETE');
export const guardarMotivoGasto = (id: number | null, d: Record<string, unknown>) =>
  id ? escribirTesoreria(`/tesoreria/motivos-gastos/${id}`, 'PUT', d) : escribirTesoreria('/tesoreria/motivos-gastos', 'POST', d);
export const eliminarMotivoGasto = (id: number) => escribirTesoreria(`/tesoreria/motivos-gastos/${id}`, 'DELETE');

export function useCentrosCostos() {
  return useQuery<CentroCosto[]>({
    queryKey: ['tesoreria', 'centros-costos'],
    queryFn: () => api('/tesoreria/centros-costos').then(r => arr<CentroCosto>(r)),
    staleTime: 120_000,
  });
}

export function fmtMonto(m: number | string | null | undefined): string {
  const n = Number(m);
  if (isNaN(n) || m === null || m === undefined || m === '') return '—';
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function estadoColor(estado: string | null | undefined): string {
  if (!estado) return 'neutral';
  const e = estado.toLowerCase();
  if (e.includes('aprobad') || e.includes('pagad') || e.includes('completad')) return 'green';
  if (e.includes('anulad') || e.includes('rechazad') || e.includes('vencid')) return 'red';
  if (e.includes('pend') || e.includes('proceso') || e.includes('parcial')) return 'amber';
  return 'blue';
}
