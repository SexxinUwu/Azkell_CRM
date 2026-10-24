// Excel del ciclo de neumáticos para gerencia.
// Las fechas salen como fecha de Excel, los costos, el CPK y el remanente como número con 2 decimales,
// y los km y el conteo de vida como entero, para que las fórmulas y tablas dinámicas del usuario funcionen.
// Se usa write-excel-file directamente (exportarExcel de core/lib/excel no acepta formato de número).

import type { CellObject, Row, Sheet } from 'write-excel-file/browser';
import { api } from '../../core/api/client';

export interface FilaCicloNeumatico {
  codigo: string;
  marca: string;
  medida: string;
  modelo: string;
  estado: string;
  almacen: string;
  placa_actual: string | null;
  posicion_actual: string | number | null;
  vida: number | null;
  reencauches: number | null;
  fecha_compra: string | Date | null;
  costo_compra: number | null;
  costo_reencauches: number | null;
  km_acumulado: number | null;
  cpk: number | null;
  remanente_actual: number | null;
  fecha_ultima_medicion: string | Date | null;
}

const FMT_FECHA = 'yyyy-mm-dd';
const FMT_FECHA_HORA = 'yyyy-mm-dd hh:mm:ss';
const FMT_DOS_DECIMALES = '#,##0.00';
const FMT_ENTERO = '#,##0';

const ENC_IDENTIDAD = ['Código', 'Marca', 'Medida', 'Modelo', 'Estado', 'Almacén'];
const ENC_UBICACION = ['Placa actual', 'Posición actual'];
const ENC_METRICAS = [
  'Vida', 'Reencauches', 'Fecha compra', 'Costo compra (S/)', 'Costo reencauches (S/)',
  'Km acumulado', 'CPK (S/ por km)', 'Remanente actual (mm)', 'Fecha última medición',
];

// Texto vacío → celda en blanco (null), no cadena vacía.
const texto = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

// Número real de Excel. Lo que no sea número finito queda en blanco.
function numero(v: number | string | null | undefined, format: string): CellObject | null {
  const n = typeof v === 'number' ? v : v == null || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? { value: n, format } : null;
}

// Fecha nativa de Excel. Acepta 'AAAA-MM-DD' o 'AAAA-MM-DDTHH:mm[:ss][.mmm][Z]' y Date.
// Se arma en UTC para que la hora no cambie (igual que core/lib/excel.ts).
function fechaCelda(v: string | Date | null | undefined): CellObject | string | null {
  if (v == null || v === '') return null;
  let d: Date | null = null;
  let conHora = false;
  if (v instanceof Date) {
    d = v;
    conHora = d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0;
  } else {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v.trim());
    if (m) {
      conHora = m[4] !== undefined && (+m[4] !== 0 || +(m[5] ?? 0) !== 0 || +(m[6] ?? 0) !== 0);
      d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
    }
  }
  if (!d || Number.isNaN(d.getTime())) return texto(v);
  return { value: d, format: conHora ? FMT_FECHA_HORA : FMT_FECHA };
}

const identidad = (f: FilaCicloNeumatico): Row => [
  texto(f.codigo), texto(f.marca), texto(f.medida), texto(f.modelo), texto(f.estado), texto(f.almacen),
];
const ubicacion = (f: FilaCicloNeumatico): Row => [texto(f.placa_actual), texto(f.posicion_actual)];
const metricas = (f: FilaCicloNeumatico): Row => [
  numero(f.vida, FMT_ENTERO),
  numero(f.reencauches, FMT_ENTERO),
  fechaCelda(f.fecha_compra),
  numero(f.costo_compra, FMT_DOS_DECIMALES),
  numero(f.costo_reencauches, FMT_DOS_DECIMALES),
  numero(f.km_acumulado, FMT_ENTERO),
  numero(f.cpk, FMT_DOS_DECIMALES),
  numero(f.remanente_actual, FMT_DOS_DECIMALES),
  fechaCelda(f.fecha_ultima_medicion),
];

function hoja(nombre: string, encabezados: string[], filas: Row[]): Sheet<never> {
  return {
    sheet: nombre,
    data: [
      encabezados.map(h => ({ value: h, fontWeight: 'bold' as const, backgroundColor: '#F5F5F7' })),
      ...filas,
    ],
    columns: encabezados.map(h => ({ width: Math.max(12, h.length + 4) })),
    stickyRowsCount: 1,
  };
}

/**
 * Descarga el libro con dos hojas:
 * - "Llantas": una fila por llanta, en el orden del contrato del reporte.
 * - "Por unidad": solo las llantas instaladas hoy (con placa), ordenadas por placa y posición.
 */
export async function exportarCicloNeumaticos(filas: FilaCicloNeumatico[]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const fecha = new Date().toISOString().slice(0, 10);

  const instaladas = filas
    .filter(f => texto(f.placa_actual) !== null)
    .sort((a, b) =>
      (a.placa_actual ?? '').localeCompare(b.placa_actual ?? '', 'es', { numeric: true })
      || String(a.posicion_actual ?? '').localeCompare(String(b.posicion_actual ?? ''), 'es', { numeric: true }));

  await writeExcelFile([
    hoja('Llantas', [...ENC_IDENTIDAD, ...ENC_UBICACION, ...ENC_METRICAS],
      filas.map(f => [...identidad(f), ...ubicacion(f), ...metricas(f)])),
    hoja('Por unidad', [...ENC_UBICACION, ...ENC_IDENTIDAD, ...ENC_METRICAS],
      instaladas.map(f => [...ubicacion(f), ...identidad(f), ...metricas(f)])),
  ]).toFile(`Neumaticos-ciclo-${fecha}.xlsx`);
}

/** Pide el reporte de ciclo a la API y descarga el Excel. Devuelve las filas recibidas. */
export async function obtenerReporteCiclo(): Promise<FilaCicloNeumatico[]> {
  const filas = await api<FilaCicloNeumatico[]>('/neumaticos/reporte-ciclo');
  if (!Array.isArray(filas)) throw new Error('El reporte de neumáticos no llegó en el formato esperado');
  await exportarCicloNeumaticos(filas);
  return filas;
}
