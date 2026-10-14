import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// Almacén de flota: un almacén virtual por unidad. Asignar = salida del almacén a la placa.
// Devolver = lo que se saca de la unidad vuelve al almacén. Contrato en routes/almacen-flota.js.

export interface UnidadFlota {
  placa: string;
  articulos: number;
  piezas: number;
  valor: number | string;
  ultimo: string | null;
}

export interface SaldoFlota {
  inventario_id: string;
  saldo: number | string;
  descripcion: string | null;
  unidad: string | null;
  familia: string | null;
  costo_referencial: number | string;
}

export interface MovimientoFlota {
  fecha: string | null;
  tipo: 'ASIGNACION' | 'DEVOLUCION';
  documento: string | null;
  inventario_id: string | null;
  descripcion: string | null;
  cantidad: number | string;
  usuario: string | null;
  observaciones: string | null;
}

export interface LineaFlota { inventario_id: string; cantidad: number }

export function useAlmacenFlotaResumen() {
  return useQuery({
    queryKey: ['flota', 'almacen', 'resumen'],
    queryFn: () => api<{ unidades: UnidadFlota[] }>('/almacen/flota/resumen').then(r => r.unidades ?? []),
    staleTime: 15_000,
  });
}

export function useAlmacenFlotaUnidad(placa: string | null) {
  return useQuery({
    queryKey: ['flota', 'almacen', 'unidad', placa],
    enabled: !!placa,
    queryFn: () => api<{ saldo: SaldoFlota[]; movimientos: MovimientoFlota[] }>(`/almacen/flota/unidades/${encodeURIComponent(placa ?? '')}`),
    staleTime: 15_000,
  });
}

export const asignarAUnidad = (placa: string, items: LineaFlota[], observaciones: string, usuario: string) =>
  api<{ ok: boolean; mensaje?: string }>('/almacen/flota/asignar', {
    method: 'POST', body: { placa, items, observaciones, usuario, fecha: new Date().toISOString().slice(0, 10) },
  });

export const devolverDeUnidad = (placa: string, items: LineaFlota[], observaciones: string, usuario: string) =>
  api<{ ok: boolean; mensaje?: string }>('/almacen/flota/devolver', {
    method: 'POST', body: { placa, items, observaciones, usuario, fecha: new Date().toISOString().slice(0, 10) },
  });

export const num = (v: unknown) => Number(v) || 0;
