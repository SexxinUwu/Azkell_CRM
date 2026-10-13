import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

function arr<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { data?: T[] })?.data) ?? [];
}

export interface TareoEntrada {
  id?: number | string;
  personal_id?: number | string | null;
  nombre?: string | null;
  apellido?: string | null;
  fecha?: string | null;
  estado?: string | null;
  horas?: number | string | null;
  turno?: string | null;
  cargo?: string | null;
  empresa?: string | null;
  [key: string]: unknown;
}

export function useTareo() {
  return useQuery<TareoEntrada[]>({
    queryKey: ['rrhh', 'tareo'],
    queryFn: () => api('/rrhh/tareo').then(r => arr<TareoEntrada>(r)),
    staleTime: 30_000,
  });
}

export interface NominaResumen {
  mes?: number | null;
  anio?: number | null;
  total_empleados?: number | null;
  total_neto?: number | string | null;
  total_bruto?: number | string | null;
  total_descuentos?: number | string | null;
  [key: string]: unknown;
}

export function useNominaResumen() {
  return useQuery<NominaResumen>({
    queryKey: ['rrhh', 'nomina-resumen'],
    queryFn: () => api('/rrhh/nomina/resumen').then(r => (r as NominaResumen) ?? {}),
    staleTime: 300_000,
  });
}

export function tareoEstadoColor(estado: string | null | undefined): string {
  if (!estado) return 'neutral';
  const e = estado.toLowerCase();
  if (e.includes('present') || e.includes('trabaj')) return 'green';
  if (e.includes('falt') || e.includes('ausen') || e.includes('injust')) return 'red';
  if (e.includes('tard') || e.includes('permiso') || e.includes('licenc')) return 'amber';
  if (e.includes('descanso') || e.includes('libre')) return 'blue';
  return 'neutral';
}
