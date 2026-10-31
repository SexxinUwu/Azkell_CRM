import type { CentroCosto, MotivoGasto } from '../tesoreria/api';

// Motivos, sub motivos y centros de costo de la orden de compra: salen del catálogo de Tesorería
// (el mismo que usa Caja), no de listas escritas en el código.

const activos = (filas: MotivoGasto[]) => filas.filter(f => f.estado === 'ACTIVO');

/** Motivos de gasto activos, en el orden en que aparecen en Tesorería */
export function motivosDe(filas: MotivoGasto[]): string[] {
  return [...new Set(activos(filas).map(f => f.motivo))];
}

/** Sub motivos activos de un motivo */
export function subMotivosDe(filas: MotivoGasto[], motivo: string): string[] {
  return [...new Set(activos(filas).filter(f => f.motivo === motivo).map(f => f.sub_motivo))];
}

/** Motivo (naturaleza del gasto) al que pertenece un sub motivo */
export function motivoDeSubMotivo(filas: MotivoGasto[], sub: string | null | undefined): string {
  if (!sub) return '';
  return activos(filas).find(f => f.sub_motivo === sub)?.motivo ?? '';
}

/** Centro de costo que Tesorería asigna al motivo (y, si hay, al sub motivo) */
export function centroSugerido(filas: MotivoGasto[], motivo: string, sub?: string | null): string | null {
  const del = activos(filas).filter(f => f.motivo === motivo && f.centro_costo_codigo);
  const exacto = sub ? del.find(f => f.sub_motivo === sub) : undefined;
  return (exacto ?? del[0])?.centro_costo_codigo ?? null;
}

/** Centros de costo activos (código y nombre) */
export function centrosActivos(centros: CentroCosto[]): CentroCosto[] {
  return centros.filter(c => c.estado === 'ACTIVO');
}
