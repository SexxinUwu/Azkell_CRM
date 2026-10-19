// Actividad de auditoría (GET /api/audit): registro estructurado, filtrado y paginado en el servidor.
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

export interface EventoAudit {
  id: number;
  user_id: number | null;
  user_name: string;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  ip: string | null;
  created_at: string;
}

export interface FiltrosAudit {
  q: string;
  entity: string;
  action: string;
  userId: string;
  from: string;
  to: string;
}

interface PaginaAudit { items: EventoAudit[]; total: number; page: number; hasMore: boolean }

/** Etiquetas en español. Si una entidad o acción no está aquí, se muestra tal cual. */
export const ENTIDAD_LABELS: Record<string, string> = {
  session: 'Sesión',
  user: 'Usuario',
  role: 'Rol',
  client: 'Cliente',
  vehicle: 'Unidad',
  driver: 'Conductor',
  price: 'Precio',
  fueling: 'Abastecimiento',
  tank: 'Cisterna',
  'stock-movement': 'Movimiento de stock',
  'tank-measurement': 'Medición de cisterna',
  supplier: 'Proveedor',
  general: 'General',
};

export const ACCION_LABELS: Record<string, string> = {
  LOGIN: 'Ingreso',
  LOGIN_FAILED: 'Ingreso fallido',
  LOGOUT: 'Cierre de sesión',
  CREATE: 'Creación',
  UPDATE: 'Edición',
  DELETE: 'Eliminación',
  PASSWORD_CHANGE: 'Cambio de contraseña',
  PASSWORD_RESET: 'Restablecer contraseña',
  QR_REGENERATE: 'Regenerar QR',
  IMPORT: 'Importación',
  CORRECT: 'Corrección',
  VALIDATE: 'Validación',
  REOPEN: 'Reapertura',
  ANNUL: 'Anulación',
};

/** Nombres de campo en español para la tabla de cambios */
export const CAMPO_LABELS: Record<string, string> = {
  nombre: 'Nombre',
  name: 'Nombre',
  tradeName: 'Nombre comercial',
  ruc: 'RUC',
  dni: 'DNI',
  correo: 'Correo',
  telefono: 'Teléfono',
  direccion: 'Dirección',
  creditDays: 'Días de crédito',
  active: 'Activo',
  activo: 'Activo',
  placa: 'Placa',
  capacidad: 'Capacidad (gal)',
  producto: 'Producto',
  rol: 'Rol',
  precio: 'Precio',
  galones: 'Galones',
  guia: 'Guía',
  estado: 'Estado',
  observaciones: 'Observaciones',
  fecha: 'Fecha',
};

export function etiquetaEntidad(e: string): string { return ENTIDAD_LABELS[e] ?? e; }
export function etiquetaAccion(a: string): string { return ACCION_LABELS[a] ?? a; }
export function etiquetaCampo(c: string): string { return CAMPO_LABELS[c] ?? c; }

/** Lista de personas que aparecen en la bitácora (filtro por persona) */
export function usePersonasAudit() {
  return useQuery<{ user_id: number; user_name: string }[]>({
    queryKey: ['sistema', 'audit-personas'],
    queryFn: () => api('/audit/personas'),
    staleTime: 60_000,
  });
}

/** Eventos paginados de 40 en 40, del más reciente al más antiguo */
export function useActividadAudit(f: FiltrosAudit) {
  return useInfiniteQuery<PaginaAudit>({
    queryKey: ['sistema', 'audit', f],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ page: String(pageParam) });
      if (f.q.trim()) qs.set('q', f.q.trim());
      if (f.entity) qs.set('entity', f.entity);
      if (f.action) qs.set('action', f.action);
      if (f.userId) qs.set('userId', f.userId);
      if (f.from) qs.set('from', f.from);
      if (f.to) qs.set('to', f.to);
      return api(`/audit?${qs.toString()}`);
    },
    getNextPageParam: last => (last.hasMore ? last.page + 1 : undefined),
  });
}
