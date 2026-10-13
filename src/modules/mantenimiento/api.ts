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

// ─── Fleetrun ────────────────────────────────────────────────────────────────
// La API legada devuelve arrays posicionales: [id, ?, ?, fecha, placa, ?, cliente, uts, tipo_mp, km_cambio, frecuencia, km_prox, obs, ?, km_gps]
export type FleetrunFila = (string | number | null)[];

export function frPlaca(r: FleetrunFila)   { return String(r[4] ?? '') || '—'; }
export function frFecha(r: FleetrunFila)   { return String(r[3] ?? '') || '—'; }
export function frTipo(r: FleetrunFila)    { return String(r[8] ?? '') || '—'; }
export function frKmCambio(r: FleetrunFila){ return Number(r[9]) || 0; }
export function frKmProx(r: FleetrunFila)  { return Number(r[11]) || 0; }
export function frObs(r: FleetrunFila)     { return String(r[12] ?? ''); }
export function frId(r: FleetrunFila)      { return String(r[0] ?? ''); }

export function useFleetrun() {
  return useQuery<FleetrunFila[]>({
    queryKey: ['mant', 'fleetrun'],
    queryFn: () =>
      api('/script/obtenerDatosFleetrun', { method: 'POST', body: { args: [] } }).then(
        (r: unknown) => (r as { data?: FleetrunFila[] })?.data ?? []
      ),
    staleTime: 60_000,
  });
}

// ─── Neumáticos ──────────────────────────────────────────────────────────────
export interface NeumaticosUltimas {
  ok: boolean;
  data: NeuVehiculo[];
}

export interface NeuVehiculo {
  placa: string;
  dueno: string | null;
  tipo_unidad: string | null;
  fecha_inspeccion: string | null;
  inspector: string | null;
  estado_general: string | null;
  total_llantas: number | null;
  llantas_ok: number | null;
  llantas_reparar: number | null;
  llantas_cambiar: number | null;
  [key: string]: unknown;
}

export interface NeuRequerimiento {
  placa: string;
  dueno: string | null;
  tipo_llanta: string | null;
  medida: string | null;
  cantidad: number | null;
  motivo: string | null;
  fecha_solicitud: string | null;
  estado: string | null;
  [key: string]: unknown;
}

export function useNeumaticos() {
  return useQuery<{ ultimas: NeuVehiculo[]; requerimientos: NeuRequerimiento[] }>({
    queryKey: ['mant', 'neumaticos'],
    queryFn: async () => {
      const [u, r] = await Promise.all([
        api('/neumaticos/ultimas') as Promise<NeumaticosUltimas>,
        api('/neumaticos/requerimientos') as Promise<{ ok: boolean; data: NeuRequerimiento[] }>,
      ]);
      return { ultimas: u?.data ?? [], requerimientos: r?.data ?? [] };
    },
    staleTime: 60_000,
  });
}

// ─── Planificación ───────────────────────────────────────────────────────────
export interface PlanificacionItem {
  id: number | string;
  placa: string;
  tipo_mp: string;
  estado: string | null;
  fecha_inicio_ventana: string | null;
  fecha_fin_ventana: string | null;
  km_actual: number | null;
  km_objetivo: number | null;
  responsable: string | null;
  observaciones: string | null;
  [key: string]: unknown;
}

export type EstadoPlan = 'completada' | 'cancelada' | 'diferida' | 'atrasada' | 'porvencer' | 'vigente' | 'programada';

export function planEstado(p: PlanificacionItem): EstadoPlan {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const fin = p.fecha_fin_ventana ? new Date(p.fecha_fin_ventana.split('T')[0] + 'T00:00:00') : null;
  const ini = p.fecha_inicio_ventana ? new Date(p.fecha_inicio_ventana.split('T')[0] + 'T00:00:00') : null;
  const est = (p.estado ?? '').toLowerCase();
  if (est === 'completada') return 'completada';
  if (est === 'cancelada')  return 'cancelada';
  if (est === 'diferida')   return 'diferida';
  if (fin && hoy > fin) return 'atrasada';
  if (fin) {
    const diff = Math.round((fin.getTime() - hoy.getTime()) / 86_400_000);
    if (diff <= 3) return 'porvencer';
  }
  if (ini && fin && hoy >= ini && hoy <= fin) return 'vigente';
  return 'programada';
}

export function planEstadoColor(e: EstadoPlan): string {
  switch (e) {
    case 'completada': return 'green';
    case 'cancelada':  return 'neutral';
    case 'diferida':   return 'amber';
    case 'atrasada':   return 'red';
    case 'porvencer':  return 'amber';
    case 'vigente':    return 'blue';
    default:           return 'neutral';
  }
}

export function usePlanificacion(mes: number, anio: number) {
  return useQuery<PlanificacionItem[]>({
    queryKey: ['mant', 'planificacion', mes, anio],
    queryFn: () =>
      api(`/planificacion?mes=${mes}&anio=${anio}`).then(
        (r: unknown) => {
          if (Array.isArray(r)) return r as PlanificacionItem[];
          return (r as { data?: PlanificacionItem[] }).data ?? [];
        }
      ),
    staleTime: 30_000,
  });
}

// ─── Incidencias en ruta ──────────────────────────────────────────────────────
export interface IncidenciaRuta {
  id: number | string;
  fecha_falla: string | null;
  placa: string | null;
  conductor: string | null;
  ubicacion: string | null;
  motivo: string | null;
  falla: string | null;
  area_responsable: string | null;
  total_costo: number | string | null;
  solucionado: string | null;
  [key: string]: unknown;
}

export function useIncidencias(pagina = 1, limit = 50, busqueda = '') {
  return useQuery<{ data: IncidenciaRuta[]; total: number }>({
    queryKey: ['mant', 'incidencias', pagina, limit, busqueda],
    queryFn: () => {
      const p = new URLSearchParams({ limit: String(limit), page: String(pagina) });
      if (busqueda) p.set('search', busqueda);
      return api(`/mantenimiento/incidencias-ruta?${p.toString()}`).then(
        (r: unknown) => {
          if (Array.isArray(r)) return { data: r as IncidenciaRuta[], total: (r as IncidenciaRuta[]).length };
          const obj = r as { data?: IncidenciaRuta[]; total?: number };
          return { data: obj.data ?? [], total: obj.total ?? 0 };
        }
      );
    },
    staleTime: 30_000,
    placeholderData: prev => prev,
  });
}
