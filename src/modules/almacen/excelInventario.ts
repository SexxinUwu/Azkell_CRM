// Inventario ↔ Excel, nativo (sin abrir la versión actual).
// Exporta lo que está filtrado en pantalla; importa con POST /api/almacen/inventario/importar,
// el mismo endpoint de la versión actual (siempre CREA artículos: no actualiza los existentes).
import { api } from '../../core/api/client';
import type { ArticuloInv } from './api';

export class ArchivoInvalido extends Error {}

const plegar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const texto = (v: unknown) => (v == null || v instanceof Date ? '' : String(v).trim());
const numero = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

/** Encabezados de la plantilla = claves que lee el servidor */
export const COLUMNAS_PLANTILLA = [
  'articulo', 'codigo_articulo', 'marca', 'marca_unidad', 'familia', 'unidad', 'moneda', 'costo', 'estado_art',
  'almacen', 'sistema', 'sub_sistema', 'tipo', 'sub_tipo', 'ubicacion', 'anaquel', 'stock_min', 'stock_max',
  'cantidad_inicial', 'codigo_barras', 'observaciones',
] as const;

// Alias aceptados (ya plegados) → clave del servidor
const ALIAS: Record<string, string> = {
  codigo: 'codigo_articulo',
  costo_referencial: 'costo', costo_ref: 'costo',
  estado: 'estado_art',
  descripcion: 'articulo', nombre: 'articulo',
  stock_minimo: 'stock_min', stock_maximo: 'stock_max',
  stock_inicial: 'cantidad_inicial',
};

export interface FilaImport {
  articulo: string; codigo_articulo: string; marca: string; marca_unidad: string; familia: string; unidad: string;
  moneda: string; costo_referencial: number; estado_art: string; almacen: string | null; sistema: string | null;
  sub_sistema: string | null; tipo: string | null; sub_tipo: string | null; ubicacion: string | null;
  anaquel: string | null; stock_min: number; stock_max: number; cantidad_inicial: number;
  codigo_barras: string | null; observaciones: string;
}

export async function leerExcel(archivo: File): Promise<{ filas: FilaImport[]; ignoradas: string[] }> {
  if (!/\.xlsx$/i.test(archivo.name)) {
    throw new ArchivoInvalido('El archivo debe ser Excel (.xlsx). Si tienes un .xls o .csv, guárdalo como .xlsx.');
  }
  const { readSheet } = await import('read-excel-file/browser');
  let hoja: unknown[][];
  try { hoja = (await readSheet(archivo)) as unknown[][]; }
  catch { throw new ArchivoInvalido('No se pudo leer el archivo. Verifica que sea un Excel válido y sin contraseña.'); }

  const claveDe = (t: string) => {
    const p = plegar(t);
    return ALIAS[p] ?? ((COLUMNAS_PLANTILLA as readonly string[]).includes(p) ? p : null);
  };
  const cab = hoja.findIndex(f => f.some(c => claveDe(texto(c)) === 'articulo'));
  if (cab < 0) throw new ArchivoInvalido('No encontré la columna "articulo". Usa la plantilla para no equivocarte de columnas.');

  const claves = new Map<number, string>();
  const ignoradas: string[] = [];
  hoja[cab].forEach((c, i) => {
    const t = texto(c);
    if (!t) return;
    const k = claveDe(t);
    if (k && ![...claves.values()].includes(k)) claves.set(i, k);
    else if (!k) ignoradas.push(t);
  });

  const filas: FilaImport[] = [];
  for (let i = cab + 1; i < hoja.length; i++) {
    const r: Record<string, unknown> = {};
    claves.forEach((k, col) => { r[k] = hoja[i][col]; });
    if (!Object.values(r).some(v => texto(v))) continue;
    const opt = (k: string) => texto(r[k]) || null;
    filas.push({
      articulo: texto(r.articulo),
      codigo_articulo: texto(r.codigo_articulo),
      marca: texto(r.marca).toUpperCase(),
      marca_unidad: texto(r.marca_unidad),
      familia: texto(r.familia).toUpperCase(),
      unidad: texto(r.unidad).toUpperCase(),
      moneda: (texto(r.moneda) || 'PEN').toUpperCase(),
      costo_referencial: numero(r.costo),
      estado_art: texto(r.estado_art) || 'Activo',
      almacen: opt('almacen'), sistema: opt('sistema'), sub_sistema: opt('sub_sistema'),
      tipo: opt('tipo'), sub_tipo: opt('sub_tipo'), ubicacion: opt('ubicacion'), anaquel: opt('anaquel'),
      stock_min: numero(r.stock_min), stock_max: numero(r.stock_max), cantidad_inicial: numero(r.cantidad_inicial),
      codigo_barras: opt('codigo_barras'), observaciones: texto(r.observaciones),
    });
  }
  return { filas, ignoradas };
}

/** Artículos que ya existen en inventario (mismo nombre + código): se duplicarían al importar */
export function repetidos(filas: FilaImport[], existentes: ArticuloInv[]): string[] {
  const clave = (a: string, c: string | null) => `${a.trim().toUpperCase()}|${(c ?? '').trim().toUpperCase()}`;
  const hay = new Set(existentes.map(e => clave(e.articulo, e.codigo_articulo)));
  return filas.filter(f => f.articulo && hay.has(clave(f.articulo, f.codigo_articulo))).map(f => f.articulo);
}

export async function importar(filas: FilaImport[]) {
  const r = await api<{ ok?: boolean; insertados?: number; errores?: string[] }>(
    '/almacen/inventario/importar', { method: 'POST', body: { filas } });
  return { insertados: r.insertados ?? 0, errores: r.errores ?? [] };
}

const cab = (value: string) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#F5F5F7' });

export async function descargarPlantilla() {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const ejemplo = ['Filtro Aceite Motor', 'LF3000', 'WIX', 'VOLVO,SCANIA', 'FILTROS', 'UND', 'PEN', 45, 'Activo',
    'Principal', 'MOTOR', 'LUBRICACION', 'Original', 'Nuevo', 'Estante B3', '2', 3, 30, 10, '7501234567890', 'Stock apertura'];
  const ayuda = [
    [cab('Cómo llenar la plantilla')],
    ['Cada fila es un artículo. Borra la fila de ejemplo antes de cargar tus datos.'],
    ['Obligatoria: articulo. cantidad_inicial: stock de apertura (si es mayor que 0 se crea la regularización).'],
    ['marca_unidad: marcas compatibles separadas por coma. moneda: PEN o USD.'],
    ['Importar siempre CREA artículos nuevos: no actualiza los que ya existen.'],
  ];
  await writeExcelFile([
    { data: [COLUMNAS_PLANTILLA.map(cab), ejemplo], sheet: 'Plantilla', columns: COLUMNAS_PLANTILLA.map(h => ({ width: Math.max(12, h.length + 4) })), stickyRowsCount: 1 },
    { data: ayuda, sheet: 'Instrucciones', columns: [{ width: 100 }] },
  ]).toFile('Plantilla-inventario-Azkell.xlsx');
}

const ENCABEZADOS_EXPORT = ['Código', 'Artículo', 'Código artículo', 'Familia', 'Almacén', 'Unidad', 'Moneda', 'Costo ref.',
  'TC última OC', 'Costo final (S/)', 'Stock actual', 'Stock mín.', 'Stock máx.', 'Marca', 'Sistema', 'Tipo', 'Sub-tipo', 'Ubicación', 'Anaquel', 'Estado', 'Observaciones'];

export async function exportar(articulos: ArticuloInv[]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  // Costo final en soles: los dólares se multiplican por la TC de su última OC; lo que está en soles queda igual
  const costoFinalSoles = (a: ArticuloInv) => {
    const costo = Number(a.costo_referencial) || 0;
    if (a.moneda !== 'USD') return Math.round(costo * 100) / 100;
    const tc = Number(a.tc_ultima_oc) || Number(a.tipo_cambio) || 0;
    const soles = tc > 0 ? costo * tc : (Number(a.costo_soles) || 0);
    return Math.round(soles * 100) / 100;
  };
  const filas = articulos.map(a => [
    a.id, a.articulo || a.descripcion, a.codigo_articulo ?? '', a.familia ?? '', a.almacen ?? '', a.unidad ?? '', a.moneda,
    Number(a.costo_referencial) || 0, Number(a.tc_ultima_oc) || '', costoFinalSoles(a), Number(a.stock_actual) || 0, Number(a.stock_min) || 0, Number(a.stock_max) || 0,
    a.marca ?? '', a.sistema ?? '', a.tipo ?? '', a.sub_tipo ?? '', a.ubicacion ?? '', a.anaquel ?? '', a.estado_art ?? '', a.observaciones ?? '',
  ]);
  const fecha = new Date().toISOString().slice(0, 10);
  await writeExcelFile([
    { data: [ENCABEZADOS_EXPORT.map(cab), ...filas], sheet: 'Inventario', columns: ENCABEZADOS_EXPORT.map(h => ({ width: Math.max(12, h.length + 4) })), stickyRowsCount: 1 },
  ]).toFile(`Inventario-Azkell-${fecha}.xlsx`);
}
