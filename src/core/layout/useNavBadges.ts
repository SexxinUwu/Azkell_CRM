import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

// Pendientes que se muestran junto al menú. Usa las mismas consultas (y la misma caché) que las pantallas
// de Aprobación, y el mismo criterio de "pendiente" que cada una.

interface Estado { estado?: string | null }

const lista = <T,>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : ((r as { data?: T[] } | null)?.data ?? []));

const pendienteOC = (o: Estado) => {
  const s = (o.estado ?? '').toLowerCase();
  return s.includes('pendiente') || s.includes('registrad') || s === '' || !o.estado;
};

const pendienteCaja = (m: Estado) => {
  const s = (m.estado ?? '').toUpperCase();
  return s === 'PENDIENTE' || s === 'REGISTRADO' || s === '';
};

export function useNavBadges(activo: boolean): Record<string, number> {
  const oc = useQuery({
    queryKey: ['gerencia', 'aprobaciones-oc'],
    queryFn: () => api('/almacen/entradas').then(r => lista<Estado>(r)),
    enabled: activo,
    staleTime: 30_000,
  });
  const caja = useQuery({
    queryKey: ['gerencia', 'aprobaciones-caja'],
    queryFn: () => api('/tesoreria/caja').then(r => lista<Estado>(r)),
    enabled: activo,
    staleTime: 30_000,
  });
  return {
    'aprob-oc': (oc.data ?? []).filter(pendienteOC).length,
    'aprob-caja': (caja.data ?? []).filter(pendienteCaja).length,
  };
}
