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
  id?: number;
  id_ot: string;                    // TR-2026-001
  ticket_visita: string | null;     // ticket de entrada de la OT a la que pertenece
  ot_id?: string | null;
  placa: string | null;
  estado: string | null;            // Pendiente | Aprobado | …
  trabajo_realizado: string | null;
  tecnico: string | null;           // personal separado por coma
  fecha_trabajo: string | null;
  fecha_salida: string | null;
  creado_por: string | null;
  fecha_creacion?: string | null;
  detalles_json: string | null;     // { personal, costo, … }
  ot_detalles_json: string | null;
}

/** Costo declarado en los detalles del trabajo */
export function trabajoCosto(t: TrabajoOT): number {
  try { const d = JSON.parse(t.detalles_json ?? '{}'); return Number(d.costo) || 0; } catch { return 0; }
}

export const editarTrabajo = (id: string, d: {
  trabajo_realizado: string; fecha_trabajo: string | null; fecha_salida: string | null; personal: string; costo: number; estado: string;
}) => api<{ ok: boolean }>(`/ot-trabajos/${encodeURIComponent(id)}`, { method: 'PUT', body: { accion: 'editar', ...d } });

export const aprobarTrabajo = (id: string, usuario: string) =>
  api<{ ok: boolean }>(`/ot-trabajos/${encodeURIComponent(id)}`, { method: 'PUT', body: { accion: 'aprobar', usuario } });

export const eliminarTrabajo = (id: string) =>
  api<{ ok: boolean }>(`/ot-trabajos/${encodeURIComponent(id)}`, { method: 'DELETE' });

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

// ─── OTs hijas de una visita (rampa) ────────────────────────────────────────

export interface OTHija {
  id_ot: string;
  ticket_visita: string | null;
  tipo_ot: string | null;
  sub_tipo: string | null;
  estado: string | null;
  fecha_creacion?: string | null;
}

/** Órdenes de trabajo hijas de una visita, por su ticket de entrada */
export function useOTsHijas(ticket: string | null) {
  return useQuery<OTHija[]>({
    queryKey: ['mant', 'ots-hijas', ticket],
    enabled: !!ticket,
    queryFn: () => api<{ data?: OTHija[] }>(`/taller/trabajos/${encodeURIComponent(ticket ?? '')}`).then(r => r.data ?? []),
    staleTime: 10_000,
  });
}

export const crearOTHija = (ticket: string, tipo_ot: string, sub_tipo: string, usuario: string) =>
  api<{ data?: string; id_ot?: string }>('/taller/generar_ot', { method: 'POST', body: { ticket_visita: ticket, tipo_ot, sub_tipo, usuario } });

/** Elimina la rampa y, con ella, todas sus OTs, trabajos e inspecciones (el servidor lo hace en cadena) */
export const eliminarRampaRegistro = (id: string, usuario: string) =>
  api<{ ok: boolean }>(`/taller-rampas/${encodeURIComponent(id)}`, { method: 'DELETE', body: { usuario } });

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
  rampa: string;                 // nombre de la rampa (del catálogo)
  rampaCatId: string;            // id de la rampa en el catálogo
  placa: string | null;
  conductor: string | null;
  chofer: string | null;
  reportado_por: string | null;
  ticket_entrada: string | null;
  fecha_ingreso: string | null;
  hora_ingreso: string | null;
  fecha_salida: string | null;   // salida REAL (solo si ya fue liberada)
  salida_programada: string | null;
  hora_salida_programada: string | null;
  situacion: string | null;
  estado: string | null;         // Activo | Liberado
  color: string | null;
  km: string | number | null;
  observaciones: string | null;
  evidencia_url: string | null;
  liberado_por: string | null;
}

export function rampaId(e: RampaEntrada): string {
  return String(e._id || e.id || '');
}

export function rampaConductor(e: RampaEntrada): string {
  return e.conductor || e.chofer || e.reportado_por || '—';
}

export interface CatalogosTaller {
  situaciones: Array<{ id?: number; descripcion?: string; nombre?: string }>;
  rampas: Array<{ id: number | string; nombre_rampa?: string; nombre?: string; color?: string }>;
}

const txt = (v: unknown) => (v == null ? null : String(v));

export function useCatalogosTaller() {
  return useQuery<CatalogosTaller>({
    queryKey: ['mant', 'catalogos-taller'],
    queryFn: () => api<CatalogosTaller>('/catalogos_taller'),
    staleTime: 300_000,
  });
}

/** Ocupación de rampas (taller_rampas): las activas y el historial de liberadas, con el nombre y color del catálogo */
export function useStatusRampa() {
  return useQuery<RampaEntrada[]>({
    queryKey: ['mant', 'rampas'],
    queryFn: async () => {
      const [act, his, cat] = await Promise.all([
        api<unknown>('/taller-rampas'),
        api<unknown>('/taller-rampas?historial=1'),
        api<CatalogosTaller>('/catalogos_taller').catch(() => ({ rampas: [], situaciones: [] }) as CatalogosTaller),
      ]);
      const lista = (r: unknown) => (Array.isArray(r) ? r : ((r as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[];
      const nombre = (id: unknown) => {
        const c = (cat.rampas ?? []).find(x => String(x.id) === String(id));
        return { nombre: c ? (c.nombre_rampa ?? c.nombre ?? String(id)) : String(id ?? '—'), color: c?.color ?? null };
      };
      return [...lista(act), ...lista(his)].map(row => {
        const n = nombre(row.rampa);
        const liberada = String(row.estado ?? '') === 'Liberado';
        return {
          _id: String(row.id ?? ''), id: String(row.id ?? ''),
          rampa: n.nombre, rampaCatId: String(row.rampa ?? ''), color: n.color,
          placa: txt(row.placa), conductor: txt(row.conductor), chofer: null, reportado_por: txt(row.creado_por),
          ticket_entrada: null,
          fecha_ingreso: txt(row.fecha_ingreso), hora_ingreso: txt(row.hora_ingreso),
          fecha_salida: liberada ? (txt(row.fecha_salida_real) ?? txt(row.fecha_liberado)) : null,
          salida_programada: txt(row.fecha_salida), hora_salida_programada: txt(row.hora_salida),
          situacion: txt(row.situacion), estado: txt(row.estado) ?? 'Activo',
          km: row.km == null ? null : String(row.km), observaciones: txt(row.obs),
          evidencia_url: txt(row.evidencia_url), liberado_por: txt(row.liberado_por),
        } as RampaEntrada;
      });
    },
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
}

export interface RampaPayload {
  rampa: string; placa: string; km?: string; conductor?: string;
  fecha_ingreso?: string | null; hora_ingreso?: string | null; fecha_salida?: string | null; hora_salida?: string | null;
  situacion?: string; obs?: string; creado_por?: string; evidencia_url?: string | null;
}

export const ingresarRampa = (d: RampaPayload) => api<{ ok: boolean; id: number }>('/taller-rampas', { method: 'POST', body: d });
export const actualizarRampa = (id: string, d: RampaPayload) => api<{ ok: boolean }>(`/taller-rampas/${id}`, { method: 'PUT', body: d });
export const liberarRampa = (id: string, d: { liberado_por: string; fecha_salida_real: string; hora_salida_real: string; situacion?: string; usuario?: string }) =>
  api<{ ok: boolean }>(`/taller-rampas/${id}`, { method: 'PUT', body: { accion: 'liberar', ...d } });
export const reactivarRampa = (id: string, usuario: string) =>
  api<{ ok: boolean }>(`/taller-rampas/${id}`, { method: 'PUT', body: { accion: 'reactivar', usuario } });

// ─── Fleetrun ────────────────────────────────────────────────────────────────
// La API legada devuelve arrays posicionales: [id, ?, ?, fecha, placa, ?, cliente, uts, tipo_mp, km_cambio, frecuencia, km_prox, obs, ?, km_gps]
export type FleetrunFila = (string | number | null)[];

export function frPlaca(r: FleetrunFila)     { return String(r[4] ?? '') || '—'; }
export function frFecha(r: FleetrunFila)     { return String(r[3] ?? '') || '—'; }
export function frTipo(r: FleetrunFila)      { return String(r[8] ?? '') || '—'; }
export function frUts(r: FleetrunFila)       { return String(r[7] ?? ''); }      // modelo/uts
export function frKmCambio(r: FleetrunFila)  { return Number(r[9])  || 0; }
export function frFrecuencia(r: FleetrunFila){ return Number(r[10]) || 0; }
export function frKmProx(r: FleetrunFila)    { return Number(r[11]) || 0; }
export function frObs(r: FleetrunFila)       { return String(r[12] ?? ''); }
export function frId(r: FleetrunFila)        { return String(r[0]  ?? ''); }
export function frKmGps(r: FleetrunFila)     { return Number(r[14]) || 0; }     // km_gps Wialon

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
  estado: string | null;            // Programada | Completada | Cancelada | Diferida
  fecha_inicio_ventana: string | null;
  fecha_fin_ventana: string | null;
  mes_ejecucion: number | null;
  anio_ejecucion: number | null;
  km_estimado: number | null;
  km_minimo: number | null;
  km_maximo: number | null;
  tecnico_asignado: string | null;
  prioridad: string | null;         // Normal | Alta | Urgente …
  observaciones_plan: string | null;
  motivo_cancelacion: string | null;
  fleetrun_id_ejecutado: string | null;
  fecha_real_ejecucion: string | null;
  km_real_ejecucion: number | null;
  desviacion_km: number | null;
  desviacion_dias: number | null;
  marca: string | null;
  cliente: string | null;
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

export interface PlanNuevo {
  placa: string; tipo_mp: string; fecha_inicio_ventana: string; fecha_fin_ventana: string;
  mes_ejecucion: number; anio_ejecucion: number; km_estimado?: number; km_minimo?: number | null; km_maximo?: number | null;
  tecnico_asignado?: string; prioridad?: string; observaciones_plan?: string; created_by?: string;
}

export const crearPlan = (d: PlanNuevo) => api<{ ok: boolean; id: string }>('/planificacion', { method: 'POST', body: d });

export const editarPlan = (id: string | number, d: Partial<PlanNuevo> & { estado?: string; motivo_cancelacion?: string }) =>
  api<{ ok: boolean }>(`/planificacion/${id}`, { method: 'PUT', body: d });

export const completarPlan = (id: string | number, d: { fleetrun_id: string; fecha_real?: string; km_real?: number; usuario?: string }) =>
  api<{ ok: boolean; ya_completado?: boolean }>(`/planificacion/${id}/completar`, { method: 'POST', body: d });

export const cancelarPlan = (id: string | number, d: { motivo: string; usuario?: string }) =>
  api<{ ok: boolean }>(`/planificacion/${id}`, { method: 'DELETE', body: d });

export interface TipoMantenimiento { id: number; marca: string | null; tipo_mp: string; uts: string | null; frecuencia_km: number | null; frecuencia_dias: number | null }
export function useTiposMantenimiento() {
  return useQuery<TipoMantenimiento[]>({
    queryKey: ['mant', 'tipos-mantenimiento'],
    queryFn: () => api('/tipos-mantenimiento').then((r: unknown) => (Array.isArray(r) ? r : ((r as { data?: TipoMantenimiento[] }).data ?? [])) as TipoMantenimiento[]),
    staleTime: 5 * 60_000,
  });
}

export interface SugerenciaPlan {
  ok: boolean; mensaje?: string; fecha_sugerida?: string | null; fecha_fin_sugerida?: string | null; km_sugerido?: number | null;
}
export const sugerirPlan = (placa: string, tipomp: string) =>
  api<SugerenciaPlan>(`/planificacion-sugerir?placa=${encodeURIComponent(placa)}&tipomp=${encodeURIComponent(tipomp)}`);

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
