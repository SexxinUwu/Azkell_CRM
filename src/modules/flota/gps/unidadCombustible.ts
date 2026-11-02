// Unidad del sensor de combustible → factor para mostrarlo en % (si hay capacidad de tanque) o en galones.
const LITROS_POR_GALON = 3.78541;

/**
 * unidad: la del sensor en Wialon ('%', 'gal', 'L'…). capacidad: tanque de la placa en galones.
 * Devuelve el factor que multiplica la lectura y la unidad resultante.
 */
export function factorCombustible(unidadSensor: string | null | undefined, capacidadGal: number | null): { factor: number; unidad: '%' | 'gal' } {
  const u = (unidadSensor ?? '%').trim().toLowerCase();
  if (u === '%' || u === '') return { factor: 1, unidad: '%' };
  const aGal = /^(l|lt|lts|litros|liters|litres)$/.test(u) ? 1 / LITROS_POR_GALON : 1;
  if (capacidadGal && capacidadGal > 0) return { factor: aGal * 100 / capacidadGal, unidad: '%' };
  return { factor: aGal, unidad: 'gal' };
}
