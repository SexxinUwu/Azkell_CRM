import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

/** Lugar de carga o de descarga de un cliente: sirve para llenar la dirección y el distrito de las guías sin escribirlos */
export interface Punto {
  id: number; cliente_nombre: string; tipo: 'CARGA' | 'DESCARGA'; codigo: string | null; nombre: string; direccion: string; ubigeo: string | null; referencia: string | null;
}

export function usePuntos(habilitado = true) {
  return useQuery<Punto[]>({
    queryKey: ['operaciones', 'puntos'], enabled: habilitado, staleTime: 60_000,
    queryFn: () => api<{ data?: Punto[] }>('/operaciones/puntos').then(r => r.data ?? []),
  });
}

export const ETIQUETA_PUNTO: Record<Punto['tipo'], string> = { CARGA: 'Carga', DESCARGA: 'Descarga' };
