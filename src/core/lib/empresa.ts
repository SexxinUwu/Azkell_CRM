// Nombres de empresa: una sola empresa aunque se haya escrito distinto
// ("MARSISA SAC", "Marsisa SAC", "MARSISA S.A.C." son la misma).

/** Clave de comparación: sin tildes, mayúsculas, sin puntos ni comas, y siglas pegadas (S A C → SAC) */
export function claveEmpresa(nombre: string | null | undefined): string {
  let s = String(nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/&/g, ' Y ')
    .replace(/[.,;:'"()\-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Une letras sueltas consecutivas: "S A C" → "SAC", "E I R L" → "EIRL"
  let anterior = '';
  while (anterior !== s) {
    anterior = s;
    s = s.replace(/\b([A-Z]) (?=[A-Z]\b)/g, '$1');
  }
  return s;
}

export interface EmpresaAgrupada {
  clave: string;
  /** La forma de escribirla más usada */
  nombre: string;
  total: number;
}

/** Agrupa nombres que son la misma empresa; ordenadas de la más frecuente a la menos */
export function agruparEmpresas(nombres: Array<string | null | undefined>): EmpresaAgrupada[] {
  const grupos = new Map<string, Map<string, number>>();
  for (const n of nombres) {
    const limpio = String(n ?? '').trim();
    if (!limpio) continue;
    const k = claveEmpresa(limpio);
    if (!k) continue;
    if (!grupos.has(k)) grupos.set(k, new Map());
    const v = grupos.get(k)!;
    v.set(limpio, (v.get(limpio) ?? 0) + 1);
  }
  return [...grupos.entries()].map(([clave, variantes]) => {
    const orden = [...variantes.entries()].sort((a, b) =>
      b[1] - a[1] || (b[0] === b[0].toUpperCase() ? 1 : 0) - (a[0] === a[0].toUpperCase() ? 1 : 0) || a[0].localeCompare(b[0]));
    return { clave, nombre: orden[0][0], total: [...variantes.values()].reduce((a, b) => a + b, 0) };
  }).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
}

/** Nombre canónico de una empresa según los datos conocidos (o el mismo si no está) */
export function nombreCanonico(nombre: string | null | undefined, grupos: EmpresaAgrupada[]): string {
  const k = claveEmpresa(nombre);
  return grupos.find(g => g.clave === k)?.nombre ?? String(nombre ?? '');
}
