import { hoyLima } from '../../core/lib/format';

/** Primer día de hace `meses` meses ('AAAA-MM-01'), en hora de Lima */
export function inicioHaceMeses(meses: number): string {
  const [y, m] = hoyLima().split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - meses, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** '2026-10' → 'octubre de 2026' */
export function mesLargo(mes: string): string {
  const [y, m] = mes.split('-');
  return MESES[Number(m) - 1] ? `${MESES[Number(m) - 1]} de ${y}` : mes;
}
