// Cambio estimado de un neumático según su desgaste (modelo lineal: el neumático se gasta a un ritmo parejo).
//
//   km por mm        = (km de la última inspección − km al montar) / (cocada inicial − remanente de la última inspección)
//   vida total (km)  = (cocada inicial − remanente de retén) × km por mm
//   le quedan (km)   = (remanente de la última inspección − remanente de retén) × km por mm  (menos lo recorrido desde esa inspección)
//
// Ejemplo (M2600001): (18 152 − 0) / (19 − 16) = 6 050 km por mm → vida total (19 − 4) × 6 050 = 90 760 km → le quedan (16 − 4) × 6 050 = 72 608 km.

/** Remanente (mm) con el que se saca el neumático para reencauche: es la regla de la empresa */
export const MM_RETEN = 4;
/** Con menos desgaste o recorrido que esto, el ritmo calculado no es confiable (una medición se hace en pasos de 1 mm) */
export const MIN_MM_GASTADOS = 2;
export const MIN_KM_TRAMO = 3000;
/** Alerta ámbar: queda poco para el retén */
export const KM_ALERTA = 15000;
export const MM_ALERTA = 2;

export type NivelCambio = 'green' | 'amber' | 'red';

export interface EntradaVida {
  /** Cocada con la que entró (alta) */
  inicial: number | null;
  /** Remanente mínimo de la última inspección */
  minimoUltima: number | null;
  /** Km del vehículo en la última inspección */
  kmUltima: number | null;
  /** Km del vehículo al montar el neumático */
  kmMontaje: number | null;
  /** Km recorridos por el neumático hasta hoy (desde el montaje) */
  kmRecorridos: number | null;
  reten?: number;
}

export type Estimacion =
  | { ok: true; kmPorMm: number; vidaTotalKm: number; mmGastados: number; kmTramo: number; mmHastaReten: number; restantesAlInspeccion: number; restantesHoy: number; nivel: NivelCambio; reten: number }
  | { ok: false; motivo: string };

export function estimarCambio(e: EntradaVida): Estimacion {
  const reten = e.reten ?? MM_RETEN;
  if (e.inicial == null || e.minimoUltima == null) return { ok: false, motivo: 'Falta la cocada inicial o una inspección con medidas.' };
  if (e.kmUltima == null || e.kmUltima <= 0) return { ok: false, motivo: 'La última inspección no tiene el km de la unidad: no se puede calcular el ritmo de desgaste.' };
  const kmMontaje = e.kmMontaje ?? 0;
  const kmTramo = e.kmUltima - kmMontaje;
  const mmGastados = e.inicial - e.minimoUltima;
  if (kmTramo < MIN_KM_TRAMO) return { ok: false, motivo: `Todavía recorrió pocos km (${Math.max(0, Math.round(kmTramo)).toLocaleString('es-PE')}): se necesitan al menos ${MIN_KM_TRAMO.toLocaleString('es-PE')} para estimar.` };
  if (mmGastados < MIN_MM_GASTADOS) return { ok: false, motivo: `Se ha gastado menos de ${MIN_MM_GASTADOS} mm: con tan poco desgaste la estimación no sería confiable. Se calculará con la próxima inspección.` };

  const kmPorMm = kmTramo / mmGastados;
  const vidaTotalKm = (e.inicial - reten) * kmPorMm;
  const mmHastaReten = e.minimoUltima - reten;
  const restantesAlInspeccion = mmHastaReten * kmPorMm;
  // Lo recorrido después de la inspección ya no está disponible
  const desdeInspeccion = e.kmRecorridos != null ? Math.max(0, e.kmRecorridos - kmTramo) : 0;
  const restantesHoy = restantesAlInspeccion - desdeInspeccion;
  const nivel: NivelCambio = mmHastaReten <= 0 || restantesHoy <= 0 ? 'red' : restantesHoy <= KM_ALERTA || mmHastaReten <= MM_ALERTA ? 'amber' : 'green';
  return { ok: true, kmPorMm, vidaTotalKm, mmGastados, kmTramo, mmHastaReten, restantesAlInspeccion, restantesHoy, nivel, reten };
}
