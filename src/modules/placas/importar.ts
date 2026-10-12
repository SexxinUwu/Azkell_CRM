// Importar placas desde Excel: misma ruta que la versión actual (POST /api/importarPlacasMasivo,
// routes/legacy.js), que inserta o actualiza por placa. Aquí se lee el archivo en el navegador y se
// normalizan los encabezados ("Placa", "AÑO", "Nº Motor"…) a las claves que el servidor reconoce,
// así una fila no se pierde por cómo se escribió el encabezado.
import { api } from '../../core/api/client';
import type { Placa } from './api';

export class ArchivoInvalido extends Error {}

/** Sin tildes, minúsculas, "º" → "o", solo letras y números separados por un espacio */
const plegar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[º°]/g, 'o').replace(/[^a-z0-9]+/g, ' ').trim();

// Encabezado (plegado) → clave que lee el servidor
const COLUMNAS: Record<string, string> = {
  'placa': 'placa',
  'cliente': 'cliente',
  'ruc dni': 'ruc_dni', 'ruc': 'ruc_dni', 'dni': 'ruc_dni',
  'marca': 'marca',
  'modelo': 'modelo_uts', 'modelo uts': 'modelo_uts',
  'modelo motor': 'modelo_motor', 'modelo de motor': 'modelo_motor',
  'tipo': 'tipo',
  'sub tipo': 'sub_tipo', 'subtipo': 'sub_tipo',
  'color': 'color',
  'nro motor': 'nro_motor', 'no motor': 'nro_motor', 'n motor': 'nro_motor', 'numero de motor': 'nro_motor',
  'nro caja': 'nro_caja', 'no caja': 'nro_caja', 'n caja': 'nro_caja', 'numero de caja': 'nro_caja',
  'nro corona': 'nro_corona', 'no corona': 'nro_corona', 'n corona': 'nro_corona', 'numero de corona': 'nro_corona',
  'nro vin': 'nro_vin', 'no vin': 'nro_vin', 'n vin': 'nro_vin', 'vin': 'nro_vin',
  'configuracion': 'configuracion',
  'tanque 1': 'tanque_1', 'tanque1': 'tanque_1',
  'tanque 2': 'tanque_2', 'tanque2': 'tanque_2',
  'tanque 3': 'tanque_3', 'tanque3': 'tanque_3',
  'capacidad tanque total': 'capacidad_tanque', 'capacidad de tanque total': 'capacidad_tanque', 'capacidad total': 'capacidad_tanque', 'capacidad tanque': 'capacidad_tanque',
  'ano': 'anio', 'anio': 'anio',
  'combustible': 'combustible',
  'tara': 'tara',
  'carga util': 'carga_util',
  'peso neto': 'peso_neto',
  'peso bruto': 'peso_bruto',
  'estado': 'estado',
  'uts': 'uts',
  'motora': 'motora', 'motora o no motora': 'motora',
  'llantas': 'llantas',
  'en uso': 'en_uso',
};

const ENCABEZADOS = ['PLACA', 'CLIENTE', 'RUC/DNI', 'MARCA', 'MODELO', 'MODELO MOTOR', 'TIPO', 'SUB TIPO', 'COLOR', 'NRO MOTOR',
  'NRO CAJA', 'NRO CORONA', 'NRO VIN', 'CONFIGURACIÓN', 'TANQUE 1', 'TANQUE 2', 'TANQUE 3', 'AÑO', 'COMBUSTIBLE', 'TARA',
  'CARGA ÚTIL', 'PESO NETO', 'PESO BRUTO', 'ESTADO', 'UTS', 'MOTORA', 'LLANTAS', 'EN USO'];

export type Registro = Record<string, string>;

const valor = (v: unknown) => (v == null || v instanceof Date ? '' : String(v).trim());

export async function leerExcel(archivo: File): Promise<{ registros: Registro[]; ignoradas: string[] }> {
  if (!/\.xlsx$/i.test(archivo.name)) {
    throw new ArchivoInvalido('El archivo debe ser Excel (.xlsx). Si tienes un .xls o .csv, ábrelo en Excel y guárdalo como .xlsx.');
  }
  const { readSheet } = await import('read-excel-file/browser');
  let filas: unknown[][];
  try {
    filas = (await readSheet(archivo)) as unknown[][];
  } catch {
    throw new ArchivoInvalido('No se pudo leer el archivo. Verifica que sea un Excel válido y que no tenga contraseña.');
  }
  const cab = filas.findIndex(f => f.some(c => plegar(valor(c)) === 'placa'));
  if (cab < 0) throw new ArchivoInvalido('No encontré la columna "PLACA". Usa la plantilla para no equivocarte de columnas.');

  const claves = new Map<number, string>();
  const ignoradas: string[] = [];
  filas[cab].forEach((c, i) => {
    const texto = valor(c);
    if (!texto) return;
    const clave = COLUMNAS[plegar(texto)];
    if (clave && ![...claves.values()].includes(clave)) claves.set(i, clave);
    else if (!clave) ignoradas.push(texto);
  });

  const registros: Registro[] = [];
  for (let i = cab + 1; i < filas.length; i++) {
    const r: Registro = {};
    claves.forEach((clave, col) => { r[clave] = valor(filas[i][col]); });
    if (Object.values(r).some(Boolean)) registros.push(r);
  }
  return { registros, ignoradas };
}

const sinGuion = (s: string) => s.replace(/[-\s]/g, '').toUpperCase();

export interface Analisis {
  nuevas: string[];
  actualizar: string[];
  /** Ya existe con otro formato (ABC123 vs ABC-123): se crearía una unidad distinta */
  parecidas: string[];
  sinPlaca: number;
  repetidasEnArchivo: string[];
}

export function analizar(registros: Registro[], existentes: Placa[]): Analisis {
  const exactas = new Set(existentes.map(p => p.placa.toUpperCase()));
  const normales = new Set(existentes.map(p => sinGuion(p.placa)));
  const vistas = new Set<string>();
  const a: Analisis = { nuevas: [], actualizar: [], parecidas: [], sinPlaca: 0, repetidasEnArchivo: [] };
  for (const r of registros) {
    const placa = (r.placa ?? '').toUpperCase();
    if (!placa) { a.sinPlaca++; continue; }
    if (vistas.has(placa)) { a.repetidasEnArchivo.push(placa); continue; }
    vistas.add(placa);
    if (exactas.has(placa)) a.actualizar.push(placa);
    else if (normales.has(sinGuion(placa))) a.parecidas.push(placa);
    else a.nuevas.push(placa);
  }
  return a;
}

export async function importar(registros: Registro[]) {
  return api<{ ok: number; errores: number }>('/importarPlacasMasivo', { method: 'POST', body: { registros } });
}

export async function descargarPlantilla() {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const cab = (value: string) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#F5F5F7' });
  const datos = [
    ENCABEZADOS.map(cab),
    ['ABC-123', 'EMPRESA EJEMPLO SAC', '20123456789', 'VOLVO', 'FH 460', 'D13', 'Tracto', 'FURGON', 'BLANCO', 'MOT-999', 'CAJ-888',
      'COR-777', 'VIN-555', '6X4', 100, 80, 50, 2024, 'Diésel', 7.5, 30.5, 8.2, 38.7, 'Activa', 'NACIONAL', 'Motora', 10, 'Si'],
  ];
  const ayuda = [
    [cab('Cómo llenar la plantilla')],
    ['Cada fila es una unidad. Borra la fila de ejemplo antes de cargar tus datos.'],
    ['Obligatoria: PLACA. Si la placa ya existe, sus datos se reemplazan por los del Excel.'],
    ['MOTORA: "Motora" o "No Motora". EN USO: "Si" o "No". ESTADO: "Activa" o "Inactiva".'],
    ['La capacidad total se calcula sola sumando TANQUE 1, 2 y 3.'],
    ['Escribe la placa igual que está registrada (con o sin guion): ABC123 y ABC-123 se guardan como unidades distintas.'],
  ];
  await writeExcelFile([
    { data: datos, sheet: 'Placas', columns: ENCABEZADOS.map(h => ({ width: Math.max(10, h.length + 4) })), stickyRowsCount: 1 },
    { data: ayuda, sheet: 'Instrucciones', columns: [{ width: 100 }] },
  ]).toFile('Plantilla-placas-Azkell.xlsx');
}
