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

const tildes = (s: string) => (s !== sinTildes(s) ? 1 : 0);
const todoMayus = (s: string) => (s === s.toUpperCase() && s !== s.toLowerCase() ? 1 : 0);

/**
 * Valores de una lista sin repetidos, aunque difieran en mayúsculas, espacios o tildes
 * ("Carreta", "CARRETA", "carreta" son uno solo). De cada grupo se muestra la forma más usada;
 * si empatan, la que lleva tildes y no está toda en mayúsculas.
 */
export function opcionesUnicas(valores: string[]): string[] {
  const grupos = new Map<string, Map<string, number>>();
  for (const raw of valores) {
    const v = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!v) continue;
    const k = clave(v);
    const g = grupos.get(k) ?? new Map<string, number>();
    g.set(v, (g.get(v) ?? 0) + 1);
    grupos.set(k, g);
  }
  return [...grupos.values()]
    .map(g => [...g.entries()].sort(([a, na], [b, nb]) => nb - na || tildes(b) - tildes(a) || todoMayus(a) - todoMayus(b))[0][0])
    .sort((a, b) => a.localeCompare(b, 'es'));
}

/** Si el texto escrito ya existe en la lista (sin importar mayúsculas o tildes), usa esa forma */
export function valorExistente(texto: string, lista: string[]): string {
  const v = texto.trim().replace(/\s+/g, ' ');
  const k = clave(v);
  return lista.find(x => clave(x) === k) ?? v;
}
