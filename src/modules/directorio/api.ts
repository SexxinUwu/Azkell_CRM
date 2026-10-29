import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../core/api/client';

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
  ruc_dni?: string | null;
  estado?: string | null;          // Activo | Inactivo
  notas?: string | null;
  total_flota?: number | string | null;
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

export interface DatosSunat {
  razon_social: string;
  direccion: string;
  estado: string;
  condicion: string;
}

/**
 * Consulta un RUC en SUNAT con el endpoint del servidor (/api/proxy/documento, el mismo que usa Proveedores).
 * Sin credenciales en el navegador. Lanza un error con mensaje para la persona si no hay datos.
 */
export async function consultarRucSunat(ruc: string): Promise<DatosSunat> {
  let d: Record<string, string | undefined>;
  try {
    d = await api<Record<string, string | undefined>>('/proxy/documento', { query: { tipo: 'RUC', numero: ruc } });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw new Error('SUNAT no encontró este RUC. Escribe los datos a mano.');
    throw new Error('No se pudo consultar SUNAT. Puedes escribir los datos a mano.');
  }
  const razon = (d.razon_social || d.nombre || d.razonSocial || '').trim();
  if (!razon) throw new Error('SUNAT no devolvió la razón social de este RUC.');
  return {
    razon_social: razon,
    direccion: (d.direccion ?? '').trim(),
    estado: (d.estado ?? '').trim(),
    condicion: (d.condicion ?? '').trim(),
  };
}
