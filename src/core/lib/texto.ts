// Texto y fechas para mostrar en pantalla. Los datos se guardaron a mano en distintos formatos
// (todo en mayúsculas, sin tildes, con fecha ISO), así que se normalizan solo al mostrarlos.

const pad = (n: number) => String(n).padStart(2, '0');

/** "Percy Jhordan Malpartida" — cada palabra con mayúscula inicial (nombres de personas) */
export function nombrePropio(s: string | null | undefined): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-PE')
    .replace(/(^|[\s(\-/])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase('es-PE'));
}

/** "Lavado de unidad" — solo la primera letra en mayúscula (descripciones de trabajo) */
export function oracion(s: string | null | undefined): string {
  const t = String(s ?? '').trim().toLocaleLowerCase('es-PE');
  return t.charAt(0).toLocaleUpperCase('es-PE') + t.slice(1);
}

/** "27-10-2026" desde "2026-10-27", "2026-10-27T00:00:00.000Z" o un Date. Sin '—' si no hay fecha */
export function fechaDMY(v: string | Date | null | undefined): string {
  if (v == null || v === '') return '—';
  if (v instanceof Date) return isNaN(v.getTime()) ? '—' : `${pad(v.getDate())}-${pad(v.getMonth() + 1)}-${v.getFullYear()}`;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '—';
}

/** Clave para comparar nombres: sin tildes, sin signos, en mayúsculas y con espacios simples */
export const claveNombre = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

/** Distancia de Levenshtein: cuántas letras hay que cambiar para que dos textos sean iguales */
export function distancia(a: string, b: string): number {
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + costo);
    }
    previa = actual;
  }
  return previa[b.length];
}
