// Tipos de unidad con nombre único. Espejo de utils/tipo_unidad.js (servidor): cambiar las dos listas juntas.
// Remolques: el semirremolque se acopla al tracto por la quinta rueda; el remolque se jala con barra de tiro.

export const TIPOS_UNIDAD = ['Camión', 'Tracto', 'Semirremolque', 'Remolque', 'Carreta', 'Cisterna', 'Furgón', 'Plataforma', 'Tolva'] as const;

const VARIANTES: Record<string, string> = {
  'camion': 'Camión',
  'tracto': 'Tracto',
  'tracto camion': 'Tracto',
  'semirremolque': 'Semirremolque',
  'semiremolque': 'Semirremolque',
  'semi remolque': 'Semirremolque',
  'remolque': 'Remolque',
  'carreta': 'Carreta',
  'cisterna': 'Cisterna',
  'furgon': 'Furgón',
  'plataforma': 'Plataforma',
  'tolva': 'Tolva',
};

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "CARRETA", "carreta" o "Carreta" → "Carreta". Un tipo desconocido solo cambia a mayúscula inicial. */
export function normalizarTipo(raw: string | null | undefined): string {
  const texto = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!texto) return '';
  const clave = sinTildes(texto).toLowerCase().replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (VARIANTES[clave]) return VARIANTES[clave];
  const sinEspacios = clave.replace(/ /g, '');
  const variante = Object.keys(VARIANTES).find(k => k.replace(/ /g, '') === sinEspacios);
  if (variante) return VARIANTES[variante];
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}
