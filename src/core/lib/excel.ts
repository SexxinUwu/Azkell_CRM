// Exportar tablas a Excel (.xlsx) desde cualquier pantalla. Carga la librería solo al usarla.
// Date = fecha nativa de Excel (aaaa-mm-dd, o aaaa-mm-dd hh:mm:ss si trae hora, como el clásico). Se arma con UTC para que la hora no cambie.
type Celda = string | number | Date | null | undefined;

// Fechas como fecha y hora reales de Excel (no texto): así las tablas dinámicas y los filtros por fecha funcionan.
// El texto 'AAAA-MM-DD' o 'AAAA-MM-DD HH:mm[:ss]' ya viene en hora local; se arma con UTC para que la hora no cambie.
const FECHA_HORA = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
function celdaDe(c: Celda) {
  if (c instanceof Date) {
    if (Number.isNaN(c.getTime())) return '';
    const conHora = c.getUTCHours() !== 0 || c.getUTCMinutes() !== 0 || c.getUTCSeconds() !== 0;
    return { value: c, format: conHora ? 'yyyy-mm-dd hh:mm:ss' : 'yyyy-mm-dd' };
  }
  if (typeof c === 'string') {
    const m = FECHA_HORA.exec(c.trim());
    if (m) {
      const conHora = m[4] !== undefined;
      const valor = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
      if (!Number.isNaN(valor.getTime())) return { value: valor, format: conHora ? 'yyyy-mm-dd hh:mm:ss' : 'yyyy-mm-dd' };
    }
  }
  return c ?? '';
}

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
    data: [encabezados.map(cab), ...filas.map(f => f.map(celdaDe))],
    sheet: hoja.slice(0, 31),
    columns: encabezados.map(h => ({ width: Math.max(12, h.length + 4) })),
    stickyRowsCount: 1,
  }))).toFile(`${nombre}-${fecha}.xlsx`);
}
