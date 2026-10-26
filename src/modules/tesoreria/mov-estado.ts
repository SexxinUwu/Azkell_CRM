// Tono visual del estado de un movimiento (Badge de core/ui)
export type TonoEstado = 'gray' | 'accent' | 'green' | 'amber' | 'red' | 'ink';

export function tonoEstado(estado: string): TonoEstado {
  const e = String(estado ?? '').toUpperCase();
  if (e === 'APROBADO') return 'accent';
  if (e === 'PROCESADO' || e === 'PAGADO') return 'green';
  if (e === 'REGISTRADO' || e === 'PENDIENTE') return 'amber';
  if (e === 'ANULADO') return 'red';
  return 'gray';
}
