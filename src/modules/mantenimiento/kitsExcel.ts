import { api } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';

// Excel de kits: copia del clásico (modulos/mantenimiento/kits-mp): mismos encabezados, misma plantilla,
// misma lectura (columnas por nombre, con alias minúsculas) y mismos mensajes.

export interface ItemKitImport {
  marca_vehiculo: string;
  modelo_vehiculo: string;
  tipo_mp: string;
  nombre_kit: string;
  item_nombre: string;
  cantidad: number;
  unidad_medida: string;
  costo_unitario: number;
  costo_total: number;
  observaciones: string;
}

const CABECERA_PLANTILLA = ['Marca', 'Modelo', 'Tipo MP', 'Alias Kit', 'Repuesto / Ítem', 'Cantidad', 'Unidad', 'Costo Unitario', 'Observaciones'];
const EJEMPLO_PLANTILLA: (string | number)[][] = [
  ['VOLVO', 'FH 500', 'MP1', 'Kit Filtros Motor', 'FILTRO DE ACEITE', 2, 'UND', 65, 'Cambio preventivo'],
  ['VOLVO', 'FH 500', 'MP1', 'Kit Filtros Motor', 'ACEITE DE MOTOR 15W-40', 10, 'GAL', 85, ''],
];

export const descargarPlantillaKits = () =>
  exportarExcel('Plantilla_Kits_Mantenimiento', 'Plantilla_Kits', CABECERA_PLANTILLA, EJEMPLO_PLANTILLA);

type Registro = Record<string, unknown>;

// Primer valor "verdadero" entre las columnas aceptadas (igual que `r['Marca'] || r['marca'] || ''`)
const pick = (r: Registro, ...claves: string[]): unknown => {
  let valor: unknown = '';
  for (const c of claves) {
    valor = r[c];
    if (valor) return valor;
  }
  return valor;
};
const texto = (v: unknown) => String(v ?? '').trim();

/** Lee la primera hoja: la fila 1 son los encabezados y se omiten las filas vacías (como sheet_to_json). */
async function registrosDeHoja(archivo: File): Promise<Registro[]> {
  const { readSheet } = await import('read-excel-file/browser');
  let filas: unknown[][];
  try {
    filas = (await readSheet(archivo)) as unknown[][];
  } catch {
    throw new Error('Error leyendo el archivo Excel.');
  }
  const [cabecera, ...datos] = filas;
  if (!cabecera) return [];
  const claves = cabecera.map(c => String(c ?? ''));
  return datos
    .filter(f => f.some(c => c !== null && c !== undefined && String(c) !== ''))
    .map(f => Object.fromEntries(claves.map((k, i) => [k, f[i] ?? ''])));
}

/** Convierte el Excel en ítems listos para POST /mantenimiento-kits/importarMasivo. Lanza error con el mensaje del clásico. */
export async function leerKitsExcel(archivo: File): Promise<ItemKitImport[]> {
  const registros = await registrosDeHoja(archivo);
  if (!registros.length) throw new Error('El archivo Excel está vacío.');

  const items = registros.map(r => {
    const cantidad = parseFloat(String(pick(r, 'Cantidad', 'cantidad') || 1)) || 1;
    const costo = parseFloat(String(pick(r, 'Costo Unitario', 'costo_unitario') || 0)) || 0;
    return {
      marca_vehiculo: texto(pick(r, 'Marca', 'marca')).toUpperCase(),
      modelo_vehiculo: texto(pick(r, 'Modelo', 'modelo') || 'TODOS LOS MODELOS').toUpperCase(),
      tipo_mp: texto(pick(r, 'Tipo MP', 'tipo_mp') || 'MP1').toUpperCase(),
      nombre_kit: texto(pick(r, 'Alias Kit', 'nombre_kit')),
      item_nombre: texto(pick(r, 'Repuesto / Ítem', 'item_nombre', 'Repuesto')),
      cantidad,
      unidad_medida: texto(pick(r, 'Unidad', 'unidad_medida') || 'UND').toUpperCase(),
      costo_unitario: costo,
      costo_total: cantidad * costo,
      observaciones: texto(pick(r, 'Observaciones', 'observaciones')),
    };
  }).filter(x => x.marca_vehiculo && x.item_nombre);

  if (!items.length) throw new Error('No se encontraron registros válidos con columnas Marca y Repuesto.');
  return items;
}

/** Envía los ítems (el servidor inserta cada uno como ítem nuevo). */
export async function importarKitsMasivo(items: ItemKitImport[]) {
  await api('/mantenimiento-kits/importarMasivo', { method: 'POST', body: { items } });
}
