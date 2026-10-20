// Documentos de flota ↔ Excel. La plantilla trae solo la PLACA y los documentos: tipo, marca, modelo, color, año, serie y empresa
// ya están en Placas y de ahí salen. Un archivo con la plantilla antigua también sirve: esas columnas se ignoran. Se importa con POST /api/documentos-flota/importar.
import { exportarExcel } from '../../core/lib/excel';

/** [encabezado de la plantilla, campo que recibe el servidor] */
export const COLUMNAS: Array<[string, string]> = [
  ['PLACA', 'placa'],
  ['TC N° CONST.', 'tc_constancia'], ['TC F. VENC.', 'tc_vencimiento'],
  ['SOAT ENTIDAD', 'soat_entidad'], ['SOAT PAGO', 'soat_pago'], ['SOAT F. VENC.', 'soat_vencimiento'],
  ['MATPEL N° CONST.', 'matpel_constancia'], ['MATPEL F. VENC.', 'matpel_vencimiento'],
  ['RT F. EMISIÓN', 'rt_emision'], ['RT F. VENC.', 'rt_vencimiento'],
  ['BONI F. EMISIÓN', 'boni_emision'], ['BONI F. VENC.', 'boni_vencimiento'],
  ['SV ENTIDAD', 'sv_entidad'], ['SV ASESOR', 'sv_asesor'], ['SV F. VENC.', 'sv_vencimiento'],
  ['SC ENTIDAD', 'sc_entidad'], ['SC ASESOR', 'sc_asesor'], ['SC F. VENC.', 'sc_vencimiento'],
  ['FUM F. EMISIÓN', 'fum_emision'], ['FUM F. VENC.', 'fum_vencimiento'],
  ['EXT CANTIDAD', 'ext_cantidad'], ['EXT F. EMISIÓN', 'ext_emision'], ['EXT F. VENC.', 'ext_vencimiento'],
];

const EJEMPLO = [
  'ABC-123',
  '123456', '2027-01-15', 'PACIFICO', '120.50', '2027-01-15', 'MAT-987', '2027-01-15', '2026-01-15', '2027-01-15',
  '2026-01-15', '2027-01-15', 'MAPFRE', 'JUAN PEREZ', '2027-01-15', 'RIMAC', 'MARIA GOMEZ', '2027-01-15',
  '2026-01-15', '2026-07-15', '1', '2026-01-15', '2027-01-15',
];

/** Descarga la plantilla (una fila de ejemplo; las fechas salen como fecha de Excel) */
export function descargarPlantilla() {
  return exportarExcel('Plantilla-documentos-flota', 'Plantilla_Documentos_Flota', COLUMNAS.map(c => c[0]), [EJEMPLO]);
}

export type RegistroImportar = Record<string, string>;

const plegar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const POR_ENCABEZADO = new Map(COLUMNAS.map(([h, c]) => [plegar(h), c]));
COLUMNAS.forEach(([, c]) => POR_ENCABEZADO.set(plegar(c), c)); // también acepta el nombre del campo (placa, soat_vencimiento…)

const dos = (n: number) => String(n).padStart(2, '0');

/** Celda de fecha → AAAA-MM-DD sin desfase de zona. Devuelve el texto original si no la entiende (el servidor lo rechaza con su fila). */
function aFecha(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    const utc = v.getUTCHours() === 0 && v.getUTCMinutes() === 0 && v.getUTCSeconds() === 0;
    return utc ? `${v.getUTCFullYear()}-${dos(v.getUTCMonth() + 1)}-${dos(v.getUTCDate())}` : `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}`;
  }
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86_400_000));
    return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  if (s === '-' || s === '---') return '';
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${dos(+iso[2])}-${dos(+iso[3])}`;
  const peru = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (peru) return `${peru[3]}-${dos(+peru[2])}-${dos(+peru[1])}`;
  return s;
}

const ES_FECHA = new Set(COLUMNAS.map(c => c[1]).filter(c => /vencimiento|emision|fecha_entrega/.test(c)));

export class ArchivoInvalido extends Error {}

/** Lee el Excel y devuelve una fila por placa con los campos del servidor (solo los que traen dato) */
export async function leerArchivoDocumentos(archivo: File): Promise<RegistroImportar[]> {
  if (!/\.xlsx$/i.test(archivo.name)) throw new ArchivoInvalido('El archivo debe ser Excel (.xlsx). Si tienes un .xls o .csv, guárdalo como .xlsx.');
  const { readSheet } = await import('read-excel-file/browser');
  let hoja: unknown[][];
  try { hoja = (await readSheet(archivo)) as unknown[][]; }
  catch { throw new ArchivoInvalido('No se pudo leer el archivo. Verifica que sea un Excel válido y sin contraseña.'); }

  const cab = hoja.findIndex(f => f.some(c => POR_ENCABEZADO.get(plegar(String(c ?? ''))) === 'placa'));
  if (cab < 0) throw new ArchivoInvalido('No encontré la columna PLACA. Descarga la plantilla para no equivocarte de columnas.');
  const campos = hoja[cab].map(c => POR_ENCABEZADO.get(plegar(String(c ?? ''))) ?? null);

  const filas: RegistroImportar[] = [];
  for (const f of hoja.slice(cab + 1)) {
    const r: RegistroImportar = {};
    campos.forEach((campo, i) => {
      if (!campo || r[campo] !== undefined) return;
      const v = f[i];
      const t = ES_FECHA.has(campo) ? aFecha(v) : (v == null || v instanceof Date ? '' : String(v).trim());
      if (t) r[campo] = t;
    });
    if (Object.keys(r).length) filas.push(r);
  }
  if (!filas.length) throw new ArchivoInvalido('El archivo no tiene filas con datos.');
  return filas;
}
