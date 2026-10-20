import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// Dashboard financiero de almacén: los agregados los calcula el servidor (GET /api/almacen/dashboard-financiero)
export interface ArticuloValorado { id: string; articulo: string; familia: string; unidad: string; stock: number; costo: number; valor: number }
export interface CriticoFin { id: string; articulo: string; unidad: string; stock: number; min: number; max: number; valor: number }
export interface MuertoFin { id: string; articulo: string; familia: string; unidad: string; stock: number; valor: number; ultima: string | null }

export interface DashboardFinanciero {
  dias: 90 | 180;
  kpis: { capital: number; reposicion: number; criticos: number; muerto: number; muertos: number; articulos: number };
  topCapital: ArticuloValorado[];
  familias: { familia: string; valor: number }[];
  consumo: { familia: string; total: number }[];
  criticos: CriticoFin[];
  muertos: MuertoFin[];
  tendencia: { mes: string; entradas: number; salidas: number }[];
  proveedores: { proveedor: string; total: number }[];
  proveedoresTotal: number;
}

export interface FiltrosDashboard { dias: 90 | 180; anio: string; mes: string }

export function useDashboardFinanciero(f: FiltrosDashboard) {
  return useQuery<DashboardFinanciero>({
    queryKey: ['almacen', 'dashboard-financiero', f],
    queryFn: () => {
      const p = new URLSearchParams({ dias: String(f.dias) });
      if (f.anio) p.set('anio', f.anio);
      if (f.mes) p.set('mes', f.mes);
      return api<DashboardFinanciero>(`/almacen/dashboard-financiero?${p.toString()}`);
    },
    staleTime: 5 * 60_000,
  });
}

// Detalle de un segmento: inventario valorizado de la familia, o las salidas (consumo) de la familia en el período
export type DetalleFinanciero =
  | { tipo: 'inventario'; filas: ArticuloValorado[] }
  | { tipo: 'salidas'; filas: { fecha: string; placa: string | null; ticket_ot: string | null; articulo: string; cantidad: number; costo_unitario: number; total: number }[] };

export function useDetalleFinanciero(familia: string | null, tipo: 'inventario' | 'salidas', anio: string, mes: string) {
  return useQuery<DetalleFinanciero>({
    queryKey: ['almacen', 'dashboard-financiero-detalle', familia, tipo, anio, mes],
    enabled: !!familia,
    queryFn: () => {
      const p = new URLSearchParams({ familia: familia ?? '', tipo });
      if (anio) p.set('anio', anio);
      if (mes) p.set('mes', mes);
      return api<DetalleFinanciero>(`/almacen/dashboard-financiero/detalle?${p.toString()}`);
    },
    staleTime: 60_000,
  });
}
