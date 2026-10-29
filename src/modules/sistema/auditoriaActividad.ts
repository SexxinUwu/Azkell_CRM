// Actividad de auditoría (GET /api/audit): registro estructurado, filtrado y paginado en el servidor.
import { useEffect } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
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

export interface PaginaAudit { items: EventoAudit[]; total: number; page: number; pageSize: number; hasMore: boolean }

/** Orden por fecha/ID: del más reciente al más antiguo (desc) o al revés (asc), como la columna # ID del clásico */
export type OrdenAudit = 'desc' | 'asc';

/** Tamaños de página, como el selector «Mostrar» del clásico (sin «Todos»: el servidor limita a 250) */
export const TAMANOS_AUDIT = [25, 50, 100, 250] as const;
export const TAMANO_AUDIT_DEFAULT = 50;

/** Query string de GET /api/audit con los filtros, la página, el tamaño y el orden */
function qsAudit(f: FiltrosAudit, page: number, pageSize: number, orden: OrdenAudit): string {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), orden });
  if (f.q.trim()) qs.set('q', f.q.trim());
  if (f.entity) qs.set('entity', f.entity);
  if (f.action) qs.set('action', f.action);
  if (f.userId) qs.set('userId', f.userId);
  if (f.from) qs.set('from', f.from);
  if (f.to) qs.set('to', f.to);
  return qs.toString();
}

/** Trae todas las páginas que cumplen los filtros (para exportar a Excel) */
export async function todosLosEventosAudit(f: FiltrosAudit, orden: OrdenAudit): Promise<EventoAudit[]> {
  const todos: EventoAudit[] = [];
  for (let page = 1; ; page++) {
    const pagina = await api<PaginaAudit>(`/audit?${qsAudit(f, page, TAMANOS_AUDIT[TAMANOS_AUDIT.length - 1], orden)}`);
    todos.push(...pagina.items);
    if (!pagina.hasMore) return todos;
  }
}

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
  'work-order': 'Orden de trabajo',
  'work-job': 'Trabajo de OT',
  ramp: 'Rampa de taller',
  'petty-cash': 'Caja chica',
  bank: 'Banco',
  'payment-request': 'Requerimiento de pago',
  receivable: 'Cuenta por cobrar/pagar',
  'warehouse-entry': 'Entrada de almacén',
  'warehouse-exit': 'Salida de almacén',
  'stock-adjustment': 'Regularización de stock',
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
  APPROVE: 'Aprobación',
  PAYMENT: 'Pago',
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

/** Total de eventos sin filtros (el subtítulo del clásico: «filtrados (de N totales)») */
export function useTotalAuditSinFiltros() {
  return useQuery<PaginaAudit>({
    queryKey: ['sistema', 'audit', 'total'],
    queryFn: () => api<PaginaAudit>('/audit?page=1&pageSize=1'),
  });
}

/** Una página de eventos con paginación numerada; mantiene la anterior mientras carga la siguiente */
export function useActividadAudit(f: FiltrosAudit, page: number, pageSize: number, orden: OrdenAudit) {
  return useQuery<PaginaAudit>({
    queryKey: ['sistema', 'audit', f, page, pageSize, orden],
    queryFn: () => api<PaginaAudit>(`/audit?${qsAudit(f, page, pageSize, orden)}`),
    placeholderData: keepPreviousData,
  });
}

/** Actualización en vivo: al llegar un evento de auditoría, la lista se refresca sola. Sin avisos. */
export function useAuditoriaEnVivo() {
  const qc = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const sse = new EventSource('/api/eventos');
    const alLlegar = (ev: MessageEvent) => {
      try {
        const d = JSON.parse(ev.data) as { modulo?: string };
        if (d.modulo === 'auditoria') qc.invalidateQueries({ queryKey: ['sistema', 'audit'] });
      } catch { /* mensaje que no es nuestro */ }
    };
    sse.addEventListener('datos-actualizados', alLlegar);
    return () => { sse.removeEventListener('datos-actualizados', alLlegar); sse.close(); };
  }, [qc]);
}
