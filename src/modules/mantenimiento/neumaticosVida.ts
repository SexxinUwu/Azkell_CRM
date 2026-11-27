// Kilometraje proyectado de un neumático. Son las dos fórmulas de la empresa y nada más:
//
//   Km/MM    = (Km_insp − Km_mont) / (MM_ini − MM_insp)
//   Km_proy  = (MM_ini − MM_ret) × Km/MM
//
// Ejemplo (M2600001): Km/MM = (18 152 − 0) / (19 − 16) = 6 050  →  Km_proy = (19 − 4) × 6 050 = 90 750 km.

/** MM_ret: remanente con el que se saca el neumático (retén) */
export const MM_RETEN = 4;

export interface EntradaVida {
  /** MM_ini: cocada con la que entró (alta) */
  inicial: number | null;
  /** MM_insp: remanente mínimo de la última inspección */
  minimoUltima: number | null;
  /** Km_insp: km de la unidad en la última inspección */
  kmUltima: number | null;
  /** Km_mont: km de la unidad al montar el neumático */
  kmMontaje: number | null;
  reten?: number;
}

export type Estimacion =
  | { ok: true; inicial: number; minimoUltima: number; kmUltima: number; kmMontaje: number; reten: number; kmPorMm: number; kmProyectado: number }
  | { ok: false; motivo: string };

export function estimarCambio(e: EntradaVida): Estimacion {
  const reten = e.reten ?? MM_RETEN;
  if (e.inicial == null || e.minimoUltima == null) return { ok: false, motivo: 'Falta la cocada inicial o una inspección con medidas.' };
  if (e.kmUltima == null || e.kmUltima <= 0) return { ok: false, motivo: 'La última inspección no tiene el km de la unidad: no se puede calcular.' };
  const kmMontaje = e.kmMontaje ?? 0;
  const mmGastados = e.inicial - e.minimoUltima;
  const kmTramo = e.kmUltima - kmMontaje;
  if (mmGastados <= 0) return { ok: false, motivo: 'Todavía no hay desgaste: la última inspección no baja de la cocada inicial.' };
  if (kmTramo <= 0) return { ok: false, motivo: 'El km de la última inspección no es mayor al km de montaje.' };
  // Sin decimales, como en el cálculo de la empresa: 18 152 / 3 = 6 050
  const kmPorMm = Math.floor(kmTramo / mmGastados);
  const kmProyectado = (e.inicial - reten) * kmPorMm;
  return { ok: true, inicial: e.inicial, minimoUltima: e.minimoUltima, kmUltima: e.kmUltima, kmMontaje, reten, kmPorMm, kmProyectado };
}
