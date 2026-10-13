import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

export interface AuditoriaEntrada {
  id?: number | string;
  modulo?: string | null;
  submodulo?: string | null;
  accion?: string | null;
  usuario?: string | null;
  ip?: string | null;
  detalle?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface Integracion {
  clave: string;
  valor?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  activo?: boolean | number;
  [key: string]: unknown;
}

export function useAuditoria(opts: { q?: string; modulo?: string; usuario?: string } = {}) {
  return useQuery<AuditoriaEntrada[]>({
    queryKey: ['sistema', 'auditoria', opts],
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.q) p.set('q', opts.q);
      if (opts.modulo) p.set('modulo', opts.modulo);
      if (opts.usuario) p.set('usuario', opts.usuario);
      const qs = p.toString();
      return api(`/auditoria${qs ? '?' + qs : ''}`).then((r: unknown): AuditoriaEntrada[] =>
        Array.isArray(r) ? r as AuditoriaEntrada[] : ((r as { data?: AuditoriaEntrada[] })?.data ?? [])
      );
    },
    staleTime: 30_000,
  });
}

export function useIntegraciones() {
  return useQuery<Integracion[]>({
    queryKey: ['sistema', 'integraciones'],
    queryFn: () =>
      api('/integraciones').then((r: unknown): Integracion[] =>
        Array.isArray(r) ? r as Integracion[] : ((r as { data?: Integracion[] })?.data ?? [])
      ),
    staleTime: 120_000,
  });
}
