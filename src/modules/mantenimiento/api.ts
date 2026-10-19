// Mantenimiento: Órdenes de Trabajo, Trabajos OT, Status Rampa
import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import type { VehiculoDisponibilidad } from '../flota/api';

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
  comentario_cierre?: string | null;
  cerrado_por?: string | null;
  rampa_origen?: string | null;
  iniciado_por?: string | null;
  costo_total_pen?: number | null;
  // Hasta 3 pausas por OT (ordenes_trabajo.fecha_pausaN / fecha_fin_pausaN / motivo_pausaN / pausado_por N)
  fecha_pausa1?: string | null; fecha_fin_pausa1?: string | null; motivo_pausa1?: string | null; pausado_por1?: string | null;
  fecha_pausa2?: string | null; fecha_fin_pausa2?: string | null; motivo_pausa2?: string | null; pausado_por2?: string | null;
  fecha_pausa3?: string | null; fecha_fin_pausa3?: string | null; motivo_pausa3?: string | null; pausado_por3?: string | null;
}

/** Motivos de pausa que se usan en el taller (el servidor acepta cualquier texto) */
export const MOTIVOS_PAUSA = ['Falta de repuesto', 'Almuerzo', 'Esperando autorización', 'Fin de turno', 'Otro'] as const;

/** Etiquetas del tablero: la OT recién ingresada (estado "Pendiente") se muestra como "Recepción" */
export const FILTROS_OT = [
  { clave: 'Todas', etiqueta: 'Todas', estados: null },
  { clave: 'Recepción', etiqueta: 'Recepción', estados: ['Pendiente'] },
  { clave: 'En Proceso', etiqueta: 'En proceso', estados: ['En Proceso'] },
  { clave: 'Pausada', etiqueta: 'Pausada', estados: ['Pausada'] },
  { clave: 'Finalizada', etiqueta: 'Finalizada', estados: ['Finalizado', 'Cerrada'] },
  { clave: 'Anulada', etiqueta: 'Anulada', estados: ['Anulado'] },
] as const;

export function etiquetaEstado(estado: string): string {
  if (estado === 'Pendiente') return 'Recepción';
  if (estado === 'Cerrada') return 'Finalizada';
  return estado;
}

export interface PausaOT {
  n: number;
  inicio: string;
  fin: string | null;
  motivo: string;
  por: string | null;
}

/** Pausas registradas de la OT, en orden (la pausa en curso no tiene fin) */
export function pausasDe(o: OrdenTrabajo): PausaOT[] {
  const slots: Array<[number, string | null | undefined, string | null | undefined, string | null | undefined, string | null | undefined]> = [
    [1, o.fecha_pausa1, o.fecha_fin_pausa1, o.motivo_pausa1, o.pausado_por1],
    [2, o.fecha_pausa2, o.fecha_fin_pausa2, o.motivo_pausa2, o.pausado_por2],
    [3, o.fecha_pausa3, o.fecha_fin_pausa3, o.motivo_pausa3, o.pausado_por3],
  ];
  return slots
    .filter(([, inicio]) => !!inicio)
    .map(([n, inicio, fin, motivo, por]) => ({
      n, inicio: inicio as string, fin: fin ?? null, motivo: motivo || 'Sin motivo', por: por ?? null,
    }));
}

/** 1 h 05 min 09 s → "01:05:09" (las horas pueden pasar de 24) */
export function formatoDuracion(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

/** Milisegundos de una pausa; si sigue en curso, cuenta hasta `ahora` */
export function duracionPausa(p: PausaOT, ahora = Date.now()): number {
  const ini = new Date(p.inicio.replace(' ', 'T')).getTime();
  const fin = p.fin ? new Date(p.fin.replace(' ', 'T')).getTime() : ahora;
  return Number.isNaN(ini) || Number.isNaN(fin) ? 0 : Math.max(0, fin - ini);
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

/** `editar` no cambia el estado: actualiza datos de la OT (p. ej. el kilometraje) */
export async function ejecutarAccionOT(idOT: string, accion: AccionOT | 'editar', extra: Record<string, unknown> = {}) {
  return api(`/ordenes-trabajo/${encodeURIComponent(idOT)}`, { method: 'PUT', body: { accion, ...extra } });
}

/** Pausa la OT con su motivo (el servidor lo exige) y quien la pausa */
export function pausarOT(idOT: string, motivo: string, pausadoPor: string) {
  return ejecutarAccionOT(idOT, 'pausar', { motivo, pausado_por: pausadoPor });
}

// ─── Materiales despachados a la OT (salidas de almacén, valorizadas) ───────

export interface MaterialSalida {
  id: string;
  fecha: string;
  placa: string | null;
  responsable: string | null;
  moneda: string;
  total_pen: number;
  estado: string;
  items: { descripcion: string; cantidad: number; costo_unitario: number; importe: number }[];
}

export function useMateriales(ticketOt?: string) {
  return useQuery<MaterialSalida[]>({
    queryKey: ['mant', 'ot-materiales', ticketOt],
    queryFn: () => api<MaterialSalida[]>(`/taller/ot-materiales?ticket_ot=${encodeURIComponent(ticketOt ?? '')}`),
    enabled: !!ticketOt,
    staleTime: 30_000,
  });
}

/** Trabajos (mano de obra) de una OT: se enlazan por su ticket de entrada o su id */
export function trabajosDeOT(ot: OrdenTrabajo, trabajos: TrabajoOT[]): TrabajoOT[] {
  const claves = new Set([ot.ticket_entrada, ot.id_ot].filter(Boolean) as string[]);
  return trabajos.filter(t => !!t.ticket_visita && claves.has(t.ticket_visita));
}

/** Tiempos de la OT: bruto (inicio → salida, o hasta `ahora`), pausado y neto (bruto − pausas) */
export function tiempoNetoOT(ot: OrdenTrabajo, ahora = Date.now()) {
  if (!ot.fecha_inicio_ot) return { bruto: 0, pausado: 0, neto: 0, iniciado: false };
  const inicio = new Date(ot.fecha_inicio_ot.replace(' ', 'T')).getTime();
  const fin = ot.fecha_hora_salida ? new Date(ot.fecha_hora_salida.replace(' ', 'T')).getTime() : ahora;
  const bruto = Number.isNaN(inicio) || Number.isNaN(fin) ? 0 : Math.max(0, fin - inicio);
  const pausado = Math.min(bruto, pausasDe(ot).reduce((s, p) => s + duracionPausa(p, ahora), 0));
  return { bruto, pausado, neto: bruto - pausado, iniciado: true };
}

/** Fecha y hora en el formato que acepta MySQL (YYYY-MM-DD HH:MM:SS) */
const fechaMysql = (s: string | null | undefined) => (s ? s.replace('T', ' ').slice(0, 19) : null);

/** Marca un trabajo de la OT como realizado o pendiente (checklist de avance) sin tocar sus demás datos */
export function marcarTrabajo(t: TrabajoOT, realizado: boolean) {
  return editarTrabajo(trabajoId(t), {
    trabajo_realizado: t.trabajo_realizado ?? '',
    fecha_trabajo: fechaMysql(t.fecha_trabajo),
    fecha_salida: fechaMysql(t.fecha_salida),
    personal: t.tecnico ?? '',
    costo: trabajoCosto(t),
    estado: realizado ? 'Realizado' : 'Pendiente',
  });
}

/** Inspecciones enlazadas a la OT (ids) */
export function useInspeccionesDeOT(idOt: string) {
  return useQuery<string[]>({
    queryKey: ['mant', 'inspecciones-ot', idOt],
    enabled: !!idOt,
    staleTime: 60_000,
    queryFn: () => api<Array<{ id?: unknown }>>(`/inspecciones-por-ot?id_ot=${encodeURIComponent(idOt)}`)
      .then(rows => (Array.isArray(rows) ? rows : []).map(r => String(r.id ?? '')).filter(Boolean)),
  });
}

/**
 * Pone la unidad "En Base" si tiene un registro guardado en Disponibilidad. El guardado reemplaza
 * todos los campos, así que se reenvía el registro completo. Sin registro guardado, el estado se
 * deriva solo de las rampas y OT (devuelve 'derivada').
 */
export async function marcarDisponibilidadEnBase(placa: string, usuario: string): Promise<'actualizada' | 'derivada'> {
  const r = await api<unknown>('/disponibilidad-flota');
  const lista = Array.isArray(r) ? r as VehiculoDisponibilidad[] : ((r as { data?: VehiculoDisponibilidad[] }).data ?? []);
  const clave = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const reg = lista.find(v => v.id != null && [v.placa_camion, v.placa_carreta].some(p => (p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') === clave));
  if (!reg) return 'derivada';
  await api('/disponibilidad-flota', {
    method: 'POST',
    body: {
      id: reg.id, placa_camion: reg.placa_camion, placa_carreta: reg.placa_carreta,
      conductor_asignado: reg.conductor_asignado, marca: reg.marca, capacidad_tanque: reg.capacidad_tanque,
      tipo_unidad: reg.tipo_unidad, observaciones: reg.observaciones, estado: 'En Base', actualizado_por: usuario,
    },
  });
  return 'actualizada';
}

/**
 * Costos de la OT. El total lo calcula el servidor (lista de OT); mano de obra y repuestos
 * se suman aquí a partir de los trabajos y las salidas de almacén. "Otros" es lo que queda
 * del total (servicios externos, materiales directos).
 */
export function costosOT(ot: OrdenTrabajo, trabajos: TrabajoOT[], materiales: MaterialSalida[]) {
  const manoObra = trabajosDeOT(ot, trabajos).reduce((s, t) => s + trabajoCosto(t), 0);
  const repuestos = materiales.filter(m => m.estado !== 'Anulado').reduce((s, m) => s + Number(m.total_pen || 0), 0);
  const total = Number(ot.costo_total ?? 0);
  return { manoObra, repuestos, otros: Math.max(0, total - manoObra - repuestos), total };
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

/** Estados oficiales del trabajo de OT (vocabulario único de la pantalla y de la ficha) */
export const ESTADOS_TRABAJO = ['Pendiente', 'En Proceso', 'Realizado', 'Aprobado'] as const;
export type EstadoTrabajo = typeof ESTADOS_TRABAJO[number];

/**
 * Estado oficial de un trabajo, sin distinguir mayúsculas. 'Finalizado' (datos históricos) cuenta como 'Realizado'.
 * Lo que no se reconoce se muestra como 'Pendiente', para que ningún trabajo quede oculto por un filtro.
 */
export function estadoTrabajo(e: string | null | undefined): EstadoTrabajo {
  const l = (e ?? '').trim().toLowerCase();
  if (l.startsWith('aprob')) return 'Aprobado';
  if (l.startsWith('realiz') || l.startsWith('final')) return 'Realizado';
  if (l.includes('proceso')) return 'En Proceso';
  return 'Pendiente';
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

/** Horas por técnico y día, calculadas en el servidor (services/horas_tecnicos.js) */
export interface HorasTecnico {
  nombre: string;
  porDia: Record<string, number>;   // "AAAA-MM-DD" → horas reales ese día
  reales: number;
  proyectadas: number;
  eficiencia: number;              // porcentaje, un decimal
  enCurso: number;
}

export interface HorasTecnicosRespuesta {
  desde: string;
  hasta: string;
  dias: Array<{ fecha: string; laborable: boolean }>;
  diasLaborables: number;
  horasPorDiaLaborable: number;
  proyectadasPorTecnico: number;
  tecnicos: HorasTecnico[];
  resumen: { trabajos: number; enCurso: number; sinTecnico: number };
  trabajos: Array<TrabajoOT & { horas: number | null }>;
}

export function useHorasTecnicos(desde: string, hasta: string, activo = true) {
  return useQuery<HorasTecnicosRespuesta>({
    queryKey: ['mant', 'horas-tecnicos', desde, hasta],
    queryFn: () => api(`/ot-horas-tecnicos?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`),
    enabled: activo && !!desde && !!hasta && hasta >= desde,
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
