// Flota: Disponibilidad, Documentos, Entrega de vehículos, Checklist de fallas
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// ─── Disponibilidad ──────────────────────────────────────────────────────────

export interface VehiculoDisponibilidad {
  placa: string;
  tipo: string | null;
  sub_tipo: string | null;
  conductor: string | null;
  estado: string;
  ubicacion: string | null;
  fecha_actualizacion: string | null;
  observaciones: string | null;
  [key: string]: unknown;
}

export const ESTADOS_DISP = ['Disponible', 'En uso', 'En mantenimiento', 'Inactivo'] as const;
export type EstadoDisp = typeof ESTADOS_DISP[number];

export function estadoDispColor(estado: string): string {
  switch (estado) {
    case 'Disponible':       return 'green';
    case 'En uso':           return 'blue';
    case 'En mantenimiento': return 'amber';
    case 'Inactivo':         return 'neutral';
    default:                 return 'neutral';
  }
}

export function useDisponibilidad() {
  return useQuery<VehiculoDisponibilidad[]>({
    queryKey: ['flota', 'disponibilidad'],
    queryFn: () =>
      api('/flota/disponibilidad').then((r: unknown) => {
        if (Array.isArray(r)) return r as VehiculoDisponibilidad[];
        return (r as { data?: VehiculoDisponibilidad[] }).data ?? [];
      }),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}

// ─── Documentos de flota ─────────────────────────────────────────────────────

export interface DocumentoFlota {
  id: number | string;
  placa: string;
  tipo_documento: string;
  numero: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  estado: string | null;
  archivo_url: string | null;
  observaciones: string | null;
  [key: string]: unknown;
}

export function docEstadoColor(doc: DocumentoFlota): string {
  if (!doc.fecha_vencimiento) return 'neutral';
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const venc = new Date(doc.fecha_vencimiento.split('T')[0] + 'T00:00:00');
  if (venc < hoy) return 'red';
  const diff = Math.round((venc.getTime() - hoy.getTime()) / 86_400_000);
  if (diff <= 30) return 'amber';
  return 'green';
}

export function docEstadoLabel(doc: DocumentoFlota): string {
  const c = docEstadoColor(doc);
  if (c === 'red') return 'Vencido';
  if (c === 'amber') return 'Por vencer';
  return 'Vigente';
}

export function useDocumentosFlota() {
  return useQuery<DocumentoFlota[]>({
    queryKey: ['flota', 'documentos'],
    queryFn: () =>
      api('/flota/documentos').then((r: unknown) => {
        if (Array.isArray(r)) return r as DocumentoFlota[];
        return (r as { data?: DocumentoFlota[] }).data ?? [];
      }),
    staleTime: 60_000,
  });
}

// ─── Entrega de vehículos ─────────────────────────────────────────────────────

export interface EntregaVehiculo {
  id: number | string;
  placa: string;
  conductor: string | null;
  responsable: string | null;
  fecha_entrega: string | null;
  fecha_devolucion: string | null;
  km_entrega: number | null;
  km_devolucion: number | null;
  estado: string;
  observaciones: string | null;
  [key: string]: unknown;
}

export function entregaEstadoColor(e: EntregaVehiculo): string {
  if (e.estado === 'Cerrada' || e.estado === 'Devuelto') return 'green';
  if (e.estado === 'Activa' || e.estado === 'En uso') return 'blue';
  return 'neutral';
}

export function useEntregas() {
  return useQuery<EntregaVehiculo[]>({
    queryKey: ['flota', 'entregas'],
    queryFn: () =>
      api('/flota/entregas').then((r: unknown) => {
        if (Array.isArray(r)) return r as EntregaVehiculo[];
        return (r as { data?: EntregaVehiculo[] }).data ?? [];
      }),
    staleTime: 30_000,
  });
}

// ─── Checklist / Reporte de fallas ───────────────────────────────────────────

export interface ChecklistFalla {
  id: number | string;
  placa: string | null;
  conductor: string | null;
  fecha: string | null;
  tipo_falla: string | null;
  descripcion: string | null;
  prioridad: string | null;
  estado: string;
  area_responsable: string | null;
  imagen_url: string | null;
  observaciones: string | null;
  [key: string]: unknown;
}

export function fallaEstadoColor(f: ChecklistFalla): string {
  if (f.estado === 'Resuelto' || f.estado === 'Cerrado') return 'green';
  if (f.estado === 'En proceso') return 'blue';
  if (f.prioridad === 'Alta' || f.prioridad === 'Crítica') return 'red';
  return 'amber';
}

export function fallaEstadoLabel(f: ChecklistFalla): string {
  return f.estado || 'Pendiente';
}

export function useChecklist(pagina = 1, limit = 50, busqueda = '') {
  return useQuery<{ data: ChecklistFalla[]; total: number }>({
    queryKey: ['flota', 'checklist', pagina, limit, busqueda],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(pagina), limit: String(limit) });
      if (busqueda) p.set('search', busqueda);
      return api(`/mantenimiento/checklist?${p.toString()}`).then((r: unknown) => {
        if (Array.isArray(r)) return { data: r as ChecklistFalla[], total: (r as ChecklistFalla[]).length };
        const obj = r as { data?: ChecklistFalla[]; total?: number };
        return { data: obj.data ?? [], total: obj.total ?? 0 };
      });
    },
    staleTime: 30_000,
    placeholderData: prev => prev,
  });
}
