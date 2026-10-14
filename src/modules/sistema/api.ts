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

/** Fila de log_auditoria: mutación HTTP firmada con HMAC, con estado antes/después */
export interface LogFirmado {
  id: number;
  created_at: string;
  usuario: string;
  correo: string;
  ip: string;
  metodo: string;
  ruta: string;
  modulo: string;
  accion: string;
  detalle: string | null;
  status_codigo: number | null;
  firma: string;
  antes?: string | null;
  despues?: string | null;
  firma_estado?: string | null;
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

export function useLogFirmado(q?: string, activo = true) {
  return useQuery<LogFirmado[]>({
    queryKey: ['sistema', 'log-firmado', q ?? ''],
    enabled: activo,
    queryFn: () =>
      api(`/log-auditoria${q ? '?q=' + encodeURIComponent(q) : ''}`).then((r: unknown): LogFirmado[] =>
        Array.isArray(r) ? r as LogFirmado[] : ((r as { data?: LogFirmado[] })?.data ?? [])
      ),
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
