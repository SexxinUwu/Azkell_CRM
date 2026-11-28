import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// Detracciones (Tesorería). Contrato del servidor: routes/detracciones.js (reportes, cruce, configuración) y routes/almacen.js (catálogo de tipos).

export type EstadoDetraccion = 'PENDIENTE' | 'DEPOSITADA' | 'POR_APROBAR';

export const ETIQUETA_ESTADO_DET: Record<EstadoDetraccion, string> = { PENDIENTE: 'Por depositar', DEPOSITADA: 'Depositada', POR_APROBAR: 'Orden por aprobar' };
export const TONO_ESTADO_DET: Record<EstadoDetraccion, 'amber' | 'green' | 'gray'> = { PENDIENTE: 'amber', DEPOSITADA: 'green', POR_APROBAR: 'gray' };

export interface DetraccionFila {
  id: string; fecha: string; proveedor_id: string | null; proveedor: string; ruc: string | null; factura: string | null;
  moneda: 'PEN' | 'USD'; total_origen: number; total_pen: number; estado_orden: string | null;
  codigo: string; tipo: string | null; pct: number; tc: number | null; monto_pen: number; monto_origen: number; neto_origen: number;
  estado: EstadoDetraccion; constancia: string | null; depositada_en: string | null;
}
interface Total { n: number; monto_pen: number }
export interface GrupoDetraccion { n: number; pendiente_pen: number; depositada_pen: number; por_aprobar_pen: number; total_pen: number }
export interface ReporteDetracciones {
  datos: DetraccionFila[];
  proveedores: Array<{ value: string; label: string }>;
  resumen: { pendiente: Total; depositada: Total; por_aprobar: Total; total: Total };
  por_proveedor: Array<GrupoDetraccion & { proveedor_id: string | null; proveedor: string; ruc: string | null }>;
  por_mes: Array<GrupoDetraccion & { mes: string }>;
}
export interface FiltroReporte { desde: string; hasta: string; proveedor: string; estado: '' | EstadoDetraccion; por: 'orden' | 'deposito' }

export function useReporteDetracciones(f: FiltroReporte) {
  return useQuery({
    queryKey: ['tesoreria', 'detracciones', 'reporte', f],
    queryFn: () => api<ReporteDetracciones>('/tesoreria/detracciones/reporte', { query: { ...f } }),
    staleTime: 30_000,
  });
}

export type NivelCruce = 'alta' | 'media' | 'info' | 'ok';
export interface HallazgoCruce { codigo: string; nivel: NivelCruce; texto: string }
export interface FilaCruce {
  clave: string; origen: 'ORDEN' | 'SIRE'; nivel: NivelCruce; hallazgos: HallazgoCruce[];
  orden: { id: string; fecha: string; proveedor: string | null; ruc: string | null; factura: string | null; moneda: 'PEN' | 'USD'; total: number; estado: string | null; detraccion: { codigo: string; pct: number; tc: number | null; monto_pen: number } | null } | null;
  sire: { id: number; periodo: string; fecha_emision: string; tipo_cp: string | null; serie: string | null; numero: string | null; moneda: string | null; total: number; detraccion: string | null; proveedor?: string | null; ruc?: string | null } | null;
}
export interface CruceSire {
  datos: FilaCruce[];
  resumen: { ordenes: number; con_diferencias: number; coinciden: number; sin_validar: number; por_hallazgo: Record<string, number> };
  periodos_sire: Array<{ periodo: string; filas: number }>;
  limitaciones: string[];
}
export function useCruceSire(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['tesoreria', 'detracciones', 'cruce', desde, hasta],
    queryFn: () => api<CruceSire>('/tesoreria/detracciones/cruce-sire', { query: { desde, hasta } }),
    staleTime: 30_000,
  });
}

export interface ConfigDetracciones { retencion_3_activa: boolean; nota: string; puede_editar: boolean }
export function useConfigDetracciones() {
  return useQuery({
    queryKey: ['tesoreria', 'detracciones', 'config'],
    queryFn: () => api<ConfigDetracciones>('/tesoreria/detracciones/config'),
    staleTime: 60_000,
  });
}

export interface TipoDetraccion {
  id: number; codigo: string; descripcion: string; porcentaje: number; monto_minimo: number; activo: boolean;
  actualizado_por: string | null; actualizado_en: string | null; usos: number;
}
export function useTiposDetraccion(habilitado: boolean) {
  return useQuery({
    queryKey: ['tesoreria', 'detracciones', 'tipos'],
    queryFn: () => api<{ data: TipoDetraccion[] }>('/almacen/detraccion-tipos/todos').then(r => r.data ?? []),
    enabled: habilitado,
    staleTime: 30_000,
  });
}
