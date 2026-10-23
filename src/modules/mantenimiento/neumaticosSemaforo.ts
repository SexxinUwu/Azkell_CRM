// Semáforo único de remanente de neumáticos (todo el ERP): más de 6 mm verde, de 3 a 6 mm ámbar, menos de 3 mm rojo; sin dato, gris.
export type Tono = 'green' | 'amber' | 'red' | 'gray';

/** Debajo de este remanente (mm) la llanta es crítica: reencauche o cambio inmediato */
export const MM_CRITICO = 3;
/** Hasta este remanente (mm) inclusive la llanta está en seguimiento preventivo; encima de él es óptima */
export const MM_PREVENTIVO = 6;

export function tonoMm(mm: number | null | undefined): Tono {
  if (mm === null || mm === undefined || Number.isNaN(mm)) return 'gray';
  return mm > MM_PREVENTIVO ? 'green' : mm >= MM_CRITICO ? 'amber' : 'red';
}

/** Una llanta es crítica con menos de 3 mm */
export const esCriticaMm = (mm: number): boolean => mm < MM_CRITICO;

/** Requerimiento de reposición: remanente MENOR O IGUAL al umbral elegido (3 mm por defecto). No cambia el semáforo global. */
export const esRequerimientoMm = (mm: number, umbral: number): boolean => mm <= umbral;

export const ETIQUETA_TONO: Record<Tono, string> = {
  green: 'Óptimo', amber: 'Alerta preventiva', red: 'Crítico para cambio', gray: 'Sin dato',
};

/** Color de tinta (variable CSS) para un tono */
export const TINTA_TONO: Record<Tono, string> = {
  green: 'var(--green-ink)', amber: 'var(--amber-ink)', red: 'var(--red-ink)', gray: 'var(--label-3)',
};
