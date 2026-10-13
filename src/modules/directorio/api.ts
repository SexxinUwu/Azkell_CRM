import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

export interface Cliente {
  id: number | string;
  nombre?: string | null;
  razon_social?: string | null;
  ruc?: string | null;
  contacto?: string | null;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  empresa?: string | null;
  activo?: boolean | number | null;
  [key: string]: unknown;
}

export function useClientes() {
  return useQuery<Cliente[]>({
    queryKey: ['directorio', 'clientes'],
    queryFn: () =>
      api('/clientes').then((r: unknown): Cliente[] =>
        Array.isArray(r) ? r as Cliente[] : ((r as { data?: Cliente[] })?.data ?? [])
      ),
    staleTime: 60_000,
  });
}
