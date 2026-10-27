import { useQuery } from '@tanstack/react-query';
import { api } from '../../core/api/client';

// Fleetrun: escritura y consultas de apoyo (mismos endpoints que modulos/mantenimiento/fleetrun/logica.js)

/** Registro de la tabla `fleetrun` tal como lo guarda /api/script/guardarFleetrun */
export interface FleetrunCampos {
  id?: string;
  fecha: string;
  placa: string;
  marca: string;
  dueno: string;
  uts: string;
  tipomp: string;
  kmact: string;
  freckm: string;
  kmprox: string;
  obs: string;
  tec: string;
  kmgps: string;
  combustible: string;
  modelo: string;
}

const mesAnio = (fecha: string) => {
  const d = new Date(`${fecha}T00:00:00`);
  return Number.isNaN(d.getTime()) ? { mes: '', anio: '' } : { mes: String(d.getMonth() + 1), anio: String(d.getFullYear()) };
};

async function enviar(metodo: 'guardarFleetrun' | 'actualizarFleetrun', form: Record<string, string>) {
  const r = await api<{ data?: string }>(`/script/${metodo}`, { method: 'POST', body: { args: [form] } });
  if (r.data !== 'Éxito') throw new Error(r.data || 'No se pudo guardar el registro');
}

/** Un registro nuevo (el servidor genera el código si no se envía) */
export function guardarFleetrun(c: FleetrunCampos, usuario: string) {
  const { mes, anio } = mesAnio(c.fecha);
  return enviar('guardarFleetrun', {
    f_id: c.id ?? '', f_fecha: c.fecha, f_mes: mes, f_anio: anio, f_placa: c.placa, f_marca: c.marca, f_dueno: c.dueno,
    f_uts: c.uts, f_tipomp: c.tipomp, f_kmact: c.kmact, f_freckm: c.freckm, f_kmprox: c.kmprox, f_obs: c.obs, f_tec: c.tec,
    f_kmgps: c.kmgps, f_combustible: c.combustible, f_modelo: c.modelo, usuarioAutor: usuario,
  });
}

/** Edita un registro existente (también sincroniza la planificación vinculada) */
export function actualizarFleetrun(c: FleetrunCampos, usuario: string) {
  const { mes, anio } = mesAnio(c.fecha);
  return enviar('actualizarFleetrun', {
    editF_id: c.id ?? '', editF_fecha: c.fecha, editF_mes: mes, editF_anio: anio, editF_placa: c.placa, editF_marca: c.marca,
    editF_dueno: c.dueno, editF_uts: c.uts, editF_tipomp: c.tipomp, editF_kmact: c.kmact, editF_freckm: c.freckm,
    editF_kmprox: c.kmprox, editF_obs: c.obs, editF_tec: c.tec, editF_kmgps: c.kmgps, editF_combustible: c.combustible,
    editF_modelo: c.modelo, usuarioAutor: usuario,
  });
}

/** Fila de la importación masiva (POST /api/importarFleetrunMasivo) */
export interface RegistroImportar {
  id: string; fecha: string; placa: string; tipomp: string; kmact: string; freckm: string; kmprox: string;
  tec: string; obs: string; mes: string; anio: string; marca: string; dueno: string; uts: string;
  combustible: string; modelo: string; km_gps: string;
}
export const importarFleetrunMasivo = (registros: RegistroImportar[]) =>
  api<{ ok: number; errores: number; detalle?: string; error?: string }>('/importarFleetrunMasivo', { method: 'POST', body: { registros } });

// ─── Frecuencias por tipo de MP (tabla tipos_mantenimiento) ────────────────────
export interface FrecuenciaMp {
  marca: string | null; tipo_mp: string | null; uts: string | null; combustible: string | null; modelo: string | null;
  frecuencia_km: number | string | null; frecuencia_horas: number | string | null;
}
export function useFrecuenciasMp() {
  return useQuery<FrecuenciaMp[]>({
    queryKey: ['mant', 'tipos-mantenimiento', 'fleetrun'],
    queryFn: () => api<unknown>('/tipos-mantenimiento').then(r => (Array.isArray(r) ? r : ((r as { data?: FrecuenciaMp[] }).data ?? [])) as FrecuenciaMp[]),
    staleTime: 5 * 60_000,
  });
}

/** Nombres de los tipos de MP activos (tipos_preventivo), ordenados */
export function useTiposPreventivo() {
  return useQuery<string[]>({
    queryKey: ['mant', 'tipos-preventivo'],
    queryFn: async () => {
      const r = await api<unknown>('/tipos-preventivo');
      const lista = (Array.isArray(r) ? r : ((r as { data?: unknown[] }).data ?? [])) as Array<{ nombre?: string; activo?: number }>;
      return lista.filter(t => t.activo !== 0).map(t => String(t.nombre ?? '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
    },
    staleTime: 5 * 60_000,
  });
}

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Frecuencia de un tipo de MP para una unidad. Regla igual que el servidor (routes/planificacion.js):
 * vacío o "TODOS" en la tabla = comodín; de las reglas que coinciden gana la más específica
 * (la que fija más columnas: marca, UTS, combustible, modelo).
 */
export function buscarFrecuencia(
  tabla: FrecuenciaMp[], u: { marca: string; uts: string; combustible: string; modelo: string }, tipoMp: string, horas: boolean,
): number {
  const marca = norm(u.marca), tipo = norm(tipoMp);
  if (!marca || !tipo) return 0;
  const comodin = (v: unknown) => !norm(v) || norm(v) === 'todos';
  const coincide = (regla: unknown, valor: string, f: (s: unknown) => string = norm) => comodin(regla) || f(regla) === valor;
  // Modelo sin espacios, guiones ni puntos: "FTT XF 105" y "FTT XF105" son el mismo modelo
  const soloLetras = (s: unknown) => norm(s).replace(/[^a-z0-9]/g, '');
  let m: FrecuenciaMp | undefined;
  let mejor = -1;
  for (const t of tabla) {
    if (!coincide(t.marca, marca) || !coincide(t.tipo_mp, tipo) || !coincide(t.uts, norm(u.uts))
      || !coincide(t.combustible, norm(u.combustible)) || !coincide(t.modelo, soloLetras(u.modelo), soloLetras)) continue;
    const fijas = [t.marca, t.uts, t.combustible, t.modelo].filter(v => !comodin(v)).length;
    if (fijas > mejor) { m = t; mejor = fijas; }
  }
  if (!m) return 0;
  const km = parseFloat(String(m.frecuencia_km)) || 0, hr = parseFloat(String(m.frecuencia_horas)) || 0;
  return horas ? hr || km : km || hr;
}

// ─── Km/día por placa (últimos 30 días, de los snapshots del GPS) ──────────────
export interface KmDia { placa: string; km_dia: number | null; horas_dia: number | null }
export function useKmHistorico() {
  return useQuery({
    queryKey: ['mant', 'km-historico'],
    queryFn: async () => {
      const filas = await api<KmDia[]>('/km-historico').catch(() => [] as KmDia[]);
      return new Map((Array.isArray(filas) ? filas : []).filter(f => f.placa).map(f => [String(f.placa).toUpperCase(), f]));
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Umbrales por tipo de UTS (configuracion_erp › fleetrun_uts_umbrales) ──────
export function useUmbralesConfig() {
  return useQuery<Record<string, number>>({
    queryKey: ['conf', 'fleetrun-umbrales-cfg'],
    queryFn: async () => {
      const c = await api<Record<string, string>>('/configuracion');
      try { return JSON.parse(c.fleetrun_uts_umbrales || '{}') as Record<string, number>; } catch { return {}; }
    },
  });
}
export const guardarUmbrales = (umbrales: Record<string, number>) =>
  api('/configuracion', { method: 'POST', body: { fleetrun_uts_umbrales: JSON.stringify(umbrales) } });

// ─── Planificación: proyección, requerimientos y búsqueda por código ───────────
export interface Proyeccion {
  placa: string; marca: string; cliente: string; uts: string; tipo_mp: string;
  frecuencia_km: number | null; frecuencia_dias: number | null;
  ultima_fecha: string | null; ultimo_km: number | null; km_proximo: number | null; costo_kit: number;
  fecha_proyectada: string | null; metodo: 'dias' | 'km' | null; vencida: boolean; dias_restantes: number | null;
}
export function useProyeccion(meses: number) {
  return useQuery<Proyeccion[]>({
    queryKey: ['mant', 'planificacion-proyeccion', meses],
    queryFn: () => api<{ data?: Proyeccion[] }>(`/planificacion-proyeccion?meses=${meses}`).then(r => r.data ?? []),
    staleTime: 60_000,
  });
}

export interface Requerimiento {
  marca: string | null; tipo_mp: string | null; nombre_kit: string | null; item_codigo: string | null; item_nombre: string | null;
  total_cantidad: number | string | null; unidad_medida: string | null; costo_unitario: number | string | null;
  total_costo: number | string | null; num_planes: number | null;
}
export function useRequerimientos(mes: number, anio: number) {
  return useQuery<Requerimiento[]>({
    queryKey: ['mant', 'requerimientos-resumen', mes, anio],
    queryFn: () => api<{ data?: Requerimiento[] }>(`/requerimientos-resumen?mes=${mes}&anio=${anio}`).then(r => r.data ?? []),
    staleTime: 60_000,
  });
}

export interface FleetrunBuscado { idRegistro: string; fecha: string | null; placa: string; tipo_mp: string; km_actual: number | null }
/** null si el código no existe (el servidor responde 404) */
export async function buscarFleetrunPorCodigo(codigo: string): Promise<FleetrunBuscado | null> {
  try {
    const r = await api<{ data?: FleetrunBuscado }>(`/fleetrun/buscar/${encodeURIComponent(codigo)}`);
    return r.data ?? null;
  } catch { return null; }
}

/** Genera planes "Programada" desde la proyección de un mes (POST /api/planificacion/lote) */
export const crearPlanesLote = (planes: Array<Record<string, unknown>>) =>
  api<{ creados?: number; ignorados?: number }>('/planificacion/lote', { method: 'POST', body: { planes } });
