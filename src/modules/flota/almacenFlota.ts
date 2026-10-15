import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// Almacén de flota: stock propio (artículos, documentos y kardex en flota_*). Contrato en routes/almacen-flota.js.

export type TipoMov = 'INGRESO' | 'ASIGNACION' | 'REINGRESO';

export interface PlacaCantidad { placa: string; cantidad: number }

export interface ArticuloBase {
  id: number;
  descripcion: string;
  unidad: string | null;
  familia: string | null;
  costo_referencial: number;
  stock_minimo: number;
}

export interface ArticuloFlota extends ArticuloBase {
  almacen: number;
  en_unidades: number;
  total: number;
  placas: PlacaCantidad[];
}

export interface UnidadFlota {
  placa: string;
  articulos: number;
  piezas: number;
  valor: number;
  ultimo: string | null;
}

export interface MovimientoFlota {
  id: number;
  fecha: string;
  tipo: TipoMov;
  codigo: string;
  placa?: string | null;
  articulo_id: number;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  costo_unitario: number;
  referencia: string | null;
  observaciones: string | null;
  usuario: string | null;
}

export interface KardexFila {
  id: number;
  fecha: string;
  codigo: string;
  tipo: TipoMov;
  placa: string | null;
  referencia: string | null;
  observaciones: string | null;
  usuario: string | null;
  costo_unitario: number;
  entrada: number;
  salida: number;
  saldo: number;
}

export interface ArticuloFicha {
  articulo: ArticuloBase;
  almacen: number;
  placas: PlacaCantidad[];
  kardex: KardexFila[];
}

export interface SaldoUnidad {
  articulo_id: number;
  saldo: number;
  descripcion: string;
  unidad: string | null;
  familia: string | null;
  costo_referencial: number;
}

export interface UnidadDetalle { placa: string; saldo: SaldoUnidad[]; movimientos: MovimientoFlota[] }

export interface FiltrosHistorial { desde: string; hasta: string; tipo: TipoMov | 'TODOS'; placa: string; q: string }

export interface DatosArticulo {
  descripcion: string;
  unidad: string;
  familia: string;
  costo_referencial: number;
  stock_minimo: number;
}

export interface LineaCantidad { articulo_id: number; cantidad: number; costo_unitario?: number }

export const num = (v: unknown) => Number(v) || 0;

const RAIZ = ['flota', 'almacen'] as const;

export function useArticulosFlota() {
  return useQuery({
    queryKey: [...RAIZ, 'articulos'],
    queryFn: () => api<{ articulos: ArticuloFlota[] }>('/almacen/flota/articulos').then(r => r.articulos ?? []),
    staleTime: 15_000,
  });
}

export function useArticuloFlota(id: number | null) {
  return useQuery({
    queryKey: [...RAIZ, 'articulo', id],
    enabled: id != null,
    queryFn: () => api<ArticuloFicha>(`/almacen/flota/articulos/${id}`),
    staleTime: 15_000,
  });
}

export function useUnidadesFlota() {
  return useQuery({
    queryKey: [...RAIZ, 'unidades'],
    queryFn: () => api<{ unidades: UnidadFlota[] }>('/almacen/flota/unidades').then(r => r.unidades ?? []),
    staleTime: 15_000,
  });
}

export function useUnidadFlota(placa: string | null) {
  return useQuery({
    queryKey: [...RAIZ, 'unidad', placa],
    enabled: !!placa,
    queryFn: () => api<UnidadDetalle>(`/almacen/flota/unidades/${encodeURIComponent(placa ?? '')}`),
    staleTime: 15_000,
  });
}

export function useHistorialFlota(f: FiltrosHistorial) {
  return useQuery({
    queryKey: [...RAIZ, 'historial', f],
    queryFn: () => {
      const p = new URLSearchParams();
      if (f.desde) p.set('desde', f.desde);
      if (f.hasta) p.set('hasta', f.hasta);
      if (f.tipo !== 'TODOS') p.set('tipo', f.tipo);
      if (f.placa.trim()) p.set('placa', f.placa.trim());
      if (f.q.trim()) p.set('q', f.q.trim());
      return api<{ movimientos: MovimientoFlota[] }>(`/almacen/flota/historial?${p.toString()}`).then(r => r.movimientos ?? []);
    },
    staleTime: 15_000,
  });
}

// Respuesta común de las escrituras
interface RespuestaEscritura { ok: boolean; codigo?: string; mensaje?: string }

export const guardarArticulo = (id: number | null, datos: DatosArticulo, usuario: string) =>
  id == null
    ? api<RespuestaEscritura>('/almacen/flota/articulos', { method: 'POST', body: { ...datos, usuario } })
    : api<RespuestaEscritura>(`/almacen/flota/articulos/${id}`, { method: 'PUT', body: { ...datos, usuario } });

export const ingresarAFlota = (items: LineaCantidad[], fecha: string, referencia: string, observaciones: string, usuario: string) =>
  api<RespuestaEscritura>('/almacen/flota/ingreso', { method: 'POST', body: { items, fecha, referencia, observaciones, usuario } });

export const asignarAUnidad = (placa: string, items: LineaCantidad[], fecha: string, observaciones: string, usuario: string) =>
  api<RespuestaEscritura>('/almacen/flota/asignar', { method: 'POST', body: { placa, items, fecha, observaciones, usuario } });

export const reingresarDeUnidad = (placa: string, items: LineaCantidad[], fecha: string, observaciones: string, usuario: string) =>
  api<RespuestaEscritura>('/almacen/flota/reingresar', { method: 'POST', body: { placa, items, fecha, observaciones, usuario } });
