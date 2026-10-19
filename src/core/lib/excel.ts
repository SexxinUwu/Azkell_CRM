// Exportar tablas a Excel (.xlsx) desde cualquier pantalla. Carga la librería solo al usarla.
type Celda = string | number | null | undefined;

const cab = (value: string) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#F5F5F7' });

/**
 * Descarga un .xlsx con una hoja. `encabezados` y cada fila deben tener el mismo largo.
 * El nombre recibe la fecha de hoy: `exportarExcel('Kardex', …)` → `Kardex-2026-10-14.xlsx`.
 */
export async function exportarExcel(nombre: string, hoja: string, encabezados: string[], filas: Celda[][]) {
  await exportarExcelHojas(nombre, [{ hoja, encabezados, filas }]);
}

export interface HojaExcel { hoja: string; encabezados: string[]; filas: Celda[][] }

/** Un .xlsx con varias hojas, en el orden dado. */
export async function exportarExcelHojas(nombre: string, hojas: HojaExcel[]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const fecha = new Date().toISOString().slice(0, 10);
  await writeExcelFile(hojas.map(({ hoja, encabezados, filas }) => ({
    data: [encabezados.map(cab), ...filas.map(f => f.map(c => c ?? ''))],
    sheet: hoja.slice(0, 31),
    columns: encabezados.map(h => ({ width: Math.max(12, h.length + 4) })),
    stickyRowsCount: 1,
  }))).toFile(`${nombre}-${fecha}.xlsx`);
}
