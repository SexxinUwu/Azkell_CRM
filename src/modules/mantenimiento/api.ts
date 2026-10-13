// Mantenimiento: Órdenes de Trabajo, Trabajos OT, Status Rampa
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// ─── Órdenes de Trabajo ──────────────────────────────────────────────────────

export const ESTADOS_OT = ['Pendiente', 'En Proceso', 'Pausada', 'Finalizado', 'Cerrada', 'Anulado'] as const;
export type EstadoOT = typeof ESTADOS_OT[number];

export interface DetallesOT {
  tipo_ot?: string;
  sub_tipo?: string;
  km?: string | number;
  horas_motor?: string | number;
  id_rampa?: string;
  [key: string]: unknown;
}

export interface OrdenTrabajo {
  id_ot: string;
  ticket_entrada: string | null;
  placa: string;
  tecnico: string | null;
  supervisor: string | null;
  situacion: string | null;
  estado: string;
  detalles_json: string | DetallesOT | null;
  fecha_ingreso: string | null;
  creado_en: string | null;
  created_at: string | null;
  fecha_inicio_ot: string | null;
  fecha_hora_salida: string | null;
  costo_total: number | null;
  aprobacion: string | null;
  id_rampa: string | null;
  observaciones: string | null;
}

export function otId(o: OrdenTrabajo): string {
  return o.id_ot || o.ticket_entrada || '';
}

export function otDetalles(o: OrdenTrabajo): DetallesOT {
  if (!o.detalles_json) return {};
  if (typeof o.detalles_json === 'object') return o.detalles_json as DetallesOT;
  try { return JSON.parse(o.detalles_json) as DetallesOT; } catch { return {}; }
}

export function otTipo(o: OrdenTrabajo): string {
  const d = otDetalles(o);
  const partes = [d.tipo_ot, d.sub_tipo].filter(Boolean);
  return partes.join(' / ') || '—';
}

export function otFecha(o: OrdenTrabajo): string {
  const f = o.fecha_ingreso || o.creado_en || o.created_at;
  return f ? f.split('T')[0] : '—';
}

export type AccionOT = 'iniciar' | 'pausar' | 'reanudar' | 'cerrar' | 'anular' | 'reactivar';

export function accionesDisponibles(estado: string): AccionOT[] {
  switch (estado) {
    case 'Pendiente':   return ['iniciar', 'anular'];
    case 'En Proceso':  return ['pausar', 'cerrar', 'anular'];
    case 'Pausada':     return ['reanudar', 'cerrar', 'anular'];
    case 'Finalizado':  return ['cerrar', 'reactivar'];
    case 'Cerrada':     return ['reactivar'];
    default:            return [];
  }
}

export function estadoColor(estado: string): string {
  switch (estado) {
    case 'En Proceso': return 'green';
    case 'Pausada':    return 'amber';
    case 'Finalizado': return 'blue';
    case 'Cerrada':    return 'neutral';
    case 'Anulado':    return 'red';
    default:           return 'neutral';
  }
}

export function useOrdenesTrabajoData() {
  return useQuery<OrdenTrabajo[]>({
    queryKey: ['mant', 'ots'],
    queryFn: () => api('/ordenes-trabajo'),
    staleTime: 30_000,
  });
}

export async function ejecutarAccionOT(idOT: string, accion: AccionOT) {
  return api(`/ordenes-trabajo/${encodeURIComponent(idOT)}`, { method: 'PUT', body: { accion } });
}

export async function eliminarOT(idOT: string) {
  return api(`/ordenes-trabajo/${encodeURIComponent(idOT)}`, { method: 'DELETE' });
}

// ─── Trabajos de OT ─────────────────────────────────────────────────────────

export interface TrabajoOT {
  id_ot: string;
  ticket_visita: string | null;
  placa: string | null;
  tecnico: string | null;
  supervisor: string | null;
  tipo_trabajo: string | null;
  descripcion: string | null;
  estado: string | null;
  costo_material: number | null;
  costo_mano_obra: number | null;
  costo_total: number | null;
  detalles_json: string | null;
  ot_detalles_json: string | null;
  fecha_ingreso: string | null;
  created_at: string | null;
}

export function trabajoId(t: TrabajoOT): string {
  return String(t.id_ot || '').trim() || String(t.ticket_visita || '').trim() || '';
}

export function trabajoKmHoras(t: TrabajoOT): string {
  let det: Record<string, unknown> = {};
  try {
    if (t.ot_detalles_json) det = JSON.parse(t.ot_detalles_json as string);
  } catch {}
  let det2: Record<string, unknown> = {};
  try {
    if (t.detalles_json) det2 = JSON.parse(t.detalles_json as string);
  } catch {}
  const horas = det.horas_motor ?? det2.horas_motor ?? t.detalles_json;
  if (horas && !isNaN(Number(horas))) return `${Number(horas).toLocaleString('es-PE')} hrs`;
  const km = det.km ?? det.kilometraje ?? det2.km;
  if (km && !isNaN(Number(km))) return `${Number(km).toLocaleString('es-PE')} km`;
  return '—';
}

export function useTrabajosOT() {
  return useQuery<TrabajoOT[]>({
    queryKey: ['mant', 'trabajos-ot'],
    queryFn: () => api('/ot-trabajos'),
    staleTime: 30_000,
  });
}

// ─── Status Rampa ────────────────────────────────────────────────────────────

export interface RampaEntrada {
  _id?: string;
  id?: string;
  rampa: string;
  placa: string | null;
  conductor: string | null;
  chofer: string | null;
  reportado_por: string | null;
  ticket_entrada: string | null;
  fecha_ingreso: string | null;
  hora_ingreso: string | null;
  fecha_salida: string | null;
  situacion: string | null;
  estado: string | null;
  color: string | null;
  km: string | number | null;
  observaciones: string | null;
}

export function rampaId(e: RampaEntrada): string {
  return String(e._id || e.id || '');
}

export function rampaConductor(e: RampaEntrada): string {
  return e.conductor || e.chofer || e.reportado_por || '—';
}

export interface CatalogosTaller {
  situaciones: Array<{ descripcion?: string; nombre?: string }>;
  rampas: Array<{ nombre?: string; color?: string }>;
}

export function useStatusRampa() {
  return useQuery<RampaEntrada[]>({
    queryKey: ['mant', 'rampas'],
    queryFn: () => api('/taller-rampas'),
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
}

export function useCatalogosTaller() {
  return useQuery<CatalogosTaller>({
    queryKey: ['mant', 'catalogos-taller'],
    queryFn: () => api('/catalogos_taller'),
    staleTime: 300_000,
  });
}
