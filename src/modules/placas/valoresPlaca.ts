// Listas fijas del formulario de placas y normalización de lo que ya está guardado.
// Un valor se guarda con un solo nombre: "DIESEL", "diesel" y "Diésel" son lo mismo.

export const COMBUSTIBLES = ['Diésel', 'Gasolina', 'GNV', 'GNL'] as const;
export const UTS_OPCIONES = ['Local', 'Nacional'] as const;

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (s: string) => sinTildes(s).trim().toLowerCase().replace(/\s+/g, '');

const COMBUSTIBLE_NOMBRE: Record<string, string> = { diesel: 'Diésel', gasolina: 'Gasolina', gnv: 'GNV', gnl: 'GNL' };
const UTS_NOMBRE: Record<string, string> = { local: 'Local', nacional: 'Nacional' };

/** Combustible con su nombre único. Vacío se queda vacío. */
export function normalizarCombustible(raw: string | null | undefined): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  return COMBUSTIBLE_NOMBRE[clave(t)] ?? t;
}

/** UTS: Local o Nacional. Vacío se queda vacío. */
export function normalizarUts(raw: string | null | undefined): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  return UTS_NOMBRE[clave(t)] ?? t;
}
