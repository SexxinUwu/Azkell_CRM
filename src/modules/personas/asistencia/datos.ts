import { useQuery } from '@tanstack/react-query';
import { api } from '../../../core/api/client';

// Datos y utilidades compartidas por las vistas de Asistencia (del día, por área, por periodo, marcaciones y justificaciones).

export interface Persona { id: number; numero_documento: string; nombres: string; apellidos: string; categoria_rol: string; cargo: string | null; area?: string | null }
export interface RegistroDia {
  estado: string; minutos_tardanza?: number; observacion?: string | null;
  hora_entrada?: string | null; hora_salida?: string | null; horas_extras?: number | string | null;
}
export interface Matriz { ok: boolean; anio: number; mes: number; dias_mes: number; personal: Persona[]; tareo: Record<string, Record<string, RegistroDia>> }

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const DIAS_SEM = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
export const ROLES = ['TODOS', 'CONDUCTOR', 'OPERATIVO', 'ADMINISTRATIVO', 'MECANICO', 'SEGURIDAD'];

/** Estados del tareo: etiqueta y color (las clases asis-celda--X ya existen en asistencia.css) */
export const ESTADOS: Record<string, string> = {
  A: 'Asistió', R: 'En ruta', T: 'Tardanza', F: 'Falta', DM: 'Descanso médico', V: 'Vacaciones', P: 'Permiso', D: 'Descanso', FER: 'Feriado',
};
/** Días que no se esperan trabajados: no cuentan como falta ni como "sin marcar" */
export const NO_ESPERADOS = ['D', 'FER', 'V', 'DM', 'P'];
export const JUSTIFICADOS = ['V', 'DM', 'P'];

export const clave = (anio: number, mes: number, dia: number) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
export const isoLocal = (f: Date) => clave(f.getFullYear(), f.getMonth() + 1, f.getDate());
export const sumarDias = (iso: string, n: number) => { const [a, m, d] = iso.split('-').map(Number); const f = new Date(a, m - 1, d + n); return isoLocal(f); };
export const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
export const nombreCorto = (p: Persona) => `${p.apellidos}, ${p.nombres}`;
export const areaDe = (p: Persona) => (p.area && p.area.trim()) || 'Sin área';

/** Texto largo de un día: "miércoles 25 de noviembre" */
export function diaLargo(iso: string) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  return f.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function useTareoMes(anio: number, mes: number, rol = 'TODOS') {
  return useQuery<Matriz>({
    queryKey: ['rrhh', 'tareo', anio, mes, rol],
    queryFn: () => api<Matriz>(`/rrhh/tareo?anio=${anio}&mes=${mes}&rol=${rol}`),
    staleTime: 20_000,
  });
}

/** Estado "mostrable" de una persona en un día: el del tareo, "SIN" si debía marcar y no lo hizo, o '' si todavía no corresponde */
export function estadoEnDia(m: Matriz | undefined, p: Persona, fecha: string, hoy: string): string {
  const e = m?.tareo?.[p.id]?.[fecha]?.estado ?? '';
  if (e) return e;
  return fecha <= hoy ? 'SIN' : '';
}

export interface ResumenDia { esperados: number; asistieron: number; tardanzas: number; faltas: number; enRuta: number; justificados: number; sinMarcar: number; asistenciaPct: number | null; puntualidadPct: number | null }

export function resumir(estados: string[]): ResumenDia {
  const c = (e: string) => estados.filter(x => x === e).length;
  const justificados = estados.filter(x => JUSTIFICADOS.includes(x)).length;
  const sinMarcar = c('SIN');
  const esperados = estados.filter(x => x && !NO_ESPERADOS.includes(x)).length;
  const asistieron = c('A') + c('T') + c('R');
  return {
    esperados, asistieron, tardanzas: c('T'), faltas: c('F'), enRuta: c('R'), justificados, sinMarcar,
    asistenciaPct: esperados ? (asistieron / esperados) * 100 : null,
    puntualidadPct: c('A') + c('T') ? (c('A') / (c('A') + c('T'))) * 100 : null,
  };
}

export const pctTexto = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)} %`);
export const tonoPct = (n: number | null) => (n === null ? '' : n >= 90 ? 'ok' : n >= 75 ? 'med' : 'bajo');
