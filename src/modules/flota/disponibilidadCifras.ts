// Cifras consolidadas de disponibilidad: las usan la pantalla de Disponibilidad y el dashboard de taller,
// para que el "% flota operativa" sea el mismo en los dos lados.
import type { VehiculoDisponibilidad } from './api';

// Un vehículo está "En Base", "En Ruta" o "En Mantenimiento" según el texto de su estado (igual que la versión actual)
export type Estado = 'En Base' | 'En Ruta' | 'En Mantenimiento';

// Mantenimiento o taller primero; ruta o viaje después; el resto es base (igual que la versión actual)
export const estadoDeTexto = (texto: string | null | undefined): Estado => {
  const e = (texto || '').trim().toLowerCase();
  if (e.includes('mant') || e.includes('taller')) return 'En Mantenimiento';
  if (e.includes('ruta') || e.includes('viaje')) return 'En Ruta';
  return 'En Base';
};

/** Cada placa cuenta como una unidad, como en la versión actual: el tracto con su estado y la carreta con el suyo */
export interface Unidad { placa: string; estado: Estado; sub: string }
export const unidadesDe = (v: VehiculoDisponibilidad): Unidad[] => [
  ...(v.placa_camion ? [{ placa: v.placa_camion, estado: estadoDeTexto(v.estado), sub: v.sub_tipo || v.tipo_unidad || '—' }] : []),
  ...(v.placa_carreta ? [{ placa: v.placa_carreta, estado: estadoDeTexto(v.estado_carreta || v.estado), sub: v.sub_tipo_carreta || v.sub_tipo || '—' }] : []),
];

export interface CifrasDisponibilidad { total: number; base: number; ruta: number; mantenimiento: number }

export function cifrasDisponibilidad(vehiculos: VehiculoDisponibilidad[]): CifrasDisponibilidad {
  const c: CifrasDisponibilidad = { total: 0, base: 0, ruta: 0, mantenimiento: 0 };
  for (const v of vehiculos) for (const u of unidadesDe(v)) {
    c.total++;
    if (u.estado === 'En Base') c.base++;
    else if (u.estado === 'En Ruta') c.ruta++;
    else c.mantenimiento++;
  }
  return c;
}

/** % flota operativa = (En Ruta + En Base) / flota activa. Sin unidades, no hay porcentaje (null). */
export function porcentajeOperativa(c: CifrasDisponibilidad): number | null {
  return c.total > 0 ? Math.round(((c.ruta + c.base) / c.total) * 100) : null;
}
