// Importar conductores desde Excel: POST /api/conductores/importarMasivo (versión actual), que SOLO
// inserta. Para no duplicar personas, aquí se omiten los DNI que ya existen y los repetidos en el archivo.
import { api } from '../../core/api/client';
import type { Conductor } from './api';

export class ArchivoInvalido extends Error {}

const plegar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const COLUMNAS: Record<string, keyof Fila> = {
  'nombre completo': 'nombre', 'nombre': 'nombre', 'nombres y apellidos': 'nombre', 'conductor': 'nombre',
  'empresa': 'empresa', 'cliente': 'empresa',
  'telefono': 'telefono', 'celular': 'telefono', 'movil': 'telefono',
  'dni': 'dni', 'documento': 'dni',
  'licencia': 'licencia', 'brevete': 'licencia', 'licencia de conducir': 'licencia',
  'estado': 'estado',
};

export interface Fila { nombre: string; empresa: string; telefono: string; dni: string; licencia: string; estado: string }

const valor = (v: unknown) => (v == null || v instanceof Date ? '' : String(v).trim());

export async function leerExcel(archivo: File): Promise<Fila[]> {
  if (!/\.xlsx$/i.test(archivo.name)) {
    throw new ArchivoInvalido('El archivo debe ser Excel (.xlsx). Si tienes un .xls o .csv, ábrelo en Excel y guárdalo como .xlsx.');
  }
  const { readSheet } = await import('read-excel-file/browser');
  let filas: unknown[][];
  try { filas = (await readSheet(archivo)) as unknown[][]; }
  catch { throw new ArchivoInvalido('No se pudo leer el archivo. Verifica que sea un Excel válido y que no tenga contraseña.'); }

  const cab = filas.findIndex(f => f.some(c => COLUMNAS[plegar(valor(c))] === 'nombre'));
  if (cab < 0) throw new ArchivoInvalido('No encontré la columna "Nombre completo". Usa la plantilla para no equivocarte de columnas.');
  const claves = new Map<number, keyof Fila>();
  filas[cab].forEach((c, i) => {
    const k = COLUMNAS[plegar(valor(c))];
    if (k && ![...claves.values()].includes(k)) claves.set(i, k);
  });

  const salida: Fila[] = [];
  for (let i = cab + 1; i < filas.length; i++) {
    const f: Fila = { nombre: '', empresa: '', telefono: '', dni: '', licencia: '', estado: '' };
    claves.forEach((k, col) => { f[k] = valor(filas[i][col]); });
    if (!Object.values(f).some(Boolean)) continue;
    // Mismo formato que la versión actual
    f.nombre = f.nombre.toUpperCase();
    f.empresa = f.empresa.toUpperCase();
    f.licencia = f.licencia.toUpperCase();
    f.dni = f.dni.replace(/\D/g, '');
    if (f.dni.length === 7) f.dni = '0' + f.dni; // Excel quita el cero inicial
    f.estado = /inactiv/i.test(f.estado) ? 'Inactivo' : 'Activo';
    salida.push(f);
  }
  return salida;
}

export interface Analisis { nuevos: Fila[]; yaExisten: Fila[]; sinNombre: number; repetidos: number }

export function analizar(filas: Fila[], existentes: Conductor[]): Analisis {
  const dnis = new Set(existentes.map(c => c.dni).filter(Boolean));
  const nombres = new Set(existentes.map(c => c.nombre.trim().toUpperCase()));
  const vistos = new Set<string>();
  const a: Analisis = { nuevos: [], yaExisten: [], sinNombre: 0, repetidos: 0 };
  for (const f of filas) {
    if (!f.nombre) { a.sinNombre++; continue; }
    const clave = f.dni || f.nombre;
    if (vistos.has(clave)) { a.repetidos++; continue; }
    vistos.add(clave);
    if ((f.dni && dnis.has(f.dni)) || (!f.dni && nombres.has(f.nombre))) a.yaExisten.push(f);
    else a.nuevos.push(f);
  }
  return a;
}

export async function importar(nuevos: Fila[]) {
  return api<{ insertados: number; errores: number }>('/conductores/importarMasivo', { method: 'POST', body: { conductores: nuevos } });
}

export async function descargarPlantilla() {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const cab = (value: string) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#F5F5F7' });
  await writeExcelFile([
    {
      sheet: 'Conductores',
      data: [
        ['Nombre completo', 'DNI', 'Licencia', 'Celular', 'Empresa', 'Estado'].map(cab),
        ['JUAN PÉREZ QUISPE', '45678912', 'Q45678912', '987654321', 'EMPRESA EJEMPLO SAC', 'Activo'],
      ],
      columns: [{ width: 32 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 28 }, { width: 10 }],
      stickyRowsCount: 1,
    },
    {
      sheet: 'Instrucciones',
      data: [
        [cab('Cómo llenar la plantilla')],
        ['Cada fila es una persona. Borra la fila de ejemplo antes de cargar tus datos.'],
        ['Obligatorio: Nombre completo. El DNI evita registrar dos veces a la misma persona: si ya existe, la fila se omite.'],
        ['Estado: "Activo" o "Inactivo" (si lo dejas vacío, queda Activo).'],
      ],
      columns: [{ width: 100 }],
    },
  ]).toFile('Plantilla-conductores-Azkell.xlsx');
}
