// Conducción por RPM (Marsisa): tipos y la puntuación, compartidos por su pantalla y por el Análisis de combustible.
export interface Conteos { ralenti: number; bajo: number; verde: number; potencia: number; sobre: number }
export interface ResultadoRpm {
  ok: boolean; placa: string; modelo_motor: string; sin_datos?: boolean; plantilla: string;
  rangos: { modelo: string; conocido: boolean; limites: [number, number, number, number] };
  desde?: string; hasta?: string; primera_lectura: string; ultima_lectura: string;
  filas_leidas: number; con_motor: number; conteos: Conteos; util: number;
  porcentajes: { bajo: number; verde: number; potencia: number };
  meta: { bajo: number; verde: number; potencia: number; sobre: number };
  rpm_media: number; rpm_max: number; km_recorridos: number | null;
}

/** Puntuación de 0 a 100: qué tan cerca está el reparto de bajo torque, zona verde y potencia de la meta (20 / 60 / 20).
 *  100 − (suma de las diferencias con la meta ÷ 2). La sobrerrevolución y el ralentí no entran: solo se muestran como número. */
export function ajusteAMeta(r: ResultadoRpm) {
  const desvio = Math.abs(r.porcentajes.bajo - r.meta.bajo) + Math.abs(r.porcentajes.verde - r.meta.verde) + Math.abs(r.porcentajes.potencia - r.meta.potencia);
  return Math.max(0, Math.round(100 - desvio / 2));
}

export const notaRpm = (p: number) => (p >= 85 ? { txt: 'Excelente', tono: 'ok', color: 'green' } : p >= 70 ? { txt: 'Buena', tono: 'ok', color: 'green' } : p >= 50 ? { txt: 'Regular', tono: 'medio', color: 'amber' } : { txt: 'A mejorar', tono: 'mal', color: 'red' });

