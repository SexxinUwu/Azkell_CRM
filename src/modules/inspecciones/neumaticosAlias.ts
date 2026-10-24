// Autocorrección de la marca de la llanta: si lo escrito está a una o dos letras de una marca del catálogo
// (por ejemplo GODYEAR → GOODYEAR), se usa la del catálogo al salir del campo.

/** Distancia de edición (Levenshtein) entre dos textos */
function distancia(a: string, b: string): number {
  let fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const nueva = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      nueva[j] = Math.min(nueva[j - 1] + 1, fila[j] + 1, fila[j - 1] + costo);
    }
    fila = nueva;
  }
  return fila[b.length];
}

/** Marca corregida contra el catálogo; si no hay una parecida, se devuelve tal cual en mayúsculas */
export function corregirMarca(valor: string, catalogo: string[]): string {
  const limpio = valor.trim().toUpperCase();
  if (!limpio || catalogo.some(c => c.toUpperCase() === limpio)) return limpio;
  let mejor: string | null = null;
  let menor = Infinity;
  for (const c of catalogo) {
    const d = distancia(limpio, c.toUpperCase());
    if (d < menor) { menor = d; mejor = c; }
  }
  const umbral = limpio.length >= 6 ? 2 : 1;
  return mejor !== null && menor <= umbral ? mejor.toUpperCase() : limpio;
}
