import { claveEncabezado, textoCelda, type CeldaExcel, type FilaRevisada } from '../../core/ui/ImportarValidadoSheet';
import { formatSoles } from '../../core/lib/format';

// Lee la hoja «Registro de Siniestros» del Excel de control. Las columnas de tiempo de trabajo y costo total del Excel
// se ignoran: el sistema las calcula. Acepta fechas como fecha de Excel, texto aaaa-mm-dd o dd/mm/aaaa, y horas como
// hora de Excel o texto h:mm.

/** Lo que se envía al servidor por cada siniestro */
export interface FilaSiniestro {
  codigo: string; fecha: string; placa: string; marca: string; conductor: string; ubicacion: string; tipo_incidencia: string;
  detalle: string; tecnico: string; inicio: string; fin: string; costo_repuestos: number; costo_mano_obra: number; estado: string;
}

const d2 = (n: number) => String(n).padStart(2, '0');

/** Fecha de la celda → aaaa-mm-dd; null si está vacía o no se reconoce */
export function fechaDeCelda(c: CeldaExcel | undefined): string | null {
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10);
  if (typeof c === 'number') return c > 20000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000).toISOString().slice(0, 10) : null;
  const t = String(c ?? '').trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${d2(+m[2])}-${d2(+m[3])}`;
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/.exec(t);
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
    const [dia, mes] = +m[2] > 12 ? [m[2], m[1]] : [m[1], m[2]];
    return `${anio}-${d2(+mes)}-${d2(+dia)}`;
  }
  return null;
}

/** Hora de la celda → hh:mm; null si está vacía o no se reconoce */
export function horaDeCelda(c: CeldaExcel | undefined): string | null {
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : `${d2(c.getUTCHours())}:${d2(c.getUTCMinutes())}`;
  if (typeof c === 'number') {
    const fraccion = c % 1;
    const minutos = Math.round(fraccion * 24 * 60);
    return `${d2(Math.floor(minutos / 60) % 24)}:${d2(minutos % 60)}`;
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(String(c ?? '').trim());
  return m ? `${d2(+m[1])}:${m[2]}` : null;
}

/** Importe de la celda: número o texto como «S/. 1,450.00» */
export function importeDeCelda(c: CeldaExcel | undefined): number {
  if (typeof c === 'number') return Number.isFinite(c) && c > 0 ? c : 0;
  const n = Number(String(c ?? '').replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Cada campo con los encabezados que lo identifican (normalizados: sin tildes, espacios ni símbolos)
const EXACTO = { fecha: ['FECHA', 'FECHADELSINIESTRO', 'FECHASINIESTRO'], codigo: ['ID', 'CODIGO', 'N'] } as const;
const EMPIEZA = {
  placa: ['PLACA'], marca: ['MARCA'], conductor: ['NOMBREDELCONDUCTOR', 'CONDUCTOR', 'CHOFER'],
  ubicacion: ['UBICACION', 'LUGAR'], tipo: ['TIPODEINCIDENCIA', 'TIPODEDANO', 'INCIDENCIA'], detalle: ['DETALLEDEDANOS', 'DETALLE', 'CAUSA'],
  tecnico: ['TECNICORESPONSABLE', 'TECNICO'], fechaInicio: ['FECHAINICIO'], horaInicio: ['HORAINICIO'], fechaFin: ['FECHAFIN'], horaFin: ['HORAFIN'],
  repuestos: ['COSTOREPUESTOS'], manoObra: ['COSTOMANOOBRA', 'COSTOMANODEOBRA'], estado: ['ESTADO'],
} as const;

/** Busca la fila de encabezados (el Excel trae un título arriba) */
export function filaDeEncabezados(filas: CeldaExcel[][]): number {
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const claves = filas[i].map(claveEncabezado);
    if (claves.includes('PLACA') && claves.some(c => EXACTO.fecha.includes(c as never))) return i;
  }
  return -1;
}

/** Interpreta las filas de una hoja: devuelve cada siniestro con su error o aviso, listo para la vista previa */
export function interpretarSiniestros(filas: CeldaExcel[][], placasConocidas: Set<string> = new Set()): FilaRevisada<FilaSiniestro>[] {
  const cab = filaDeEncabezados(filas);
  if (cab < 0) throw new Error('No encontré los encabezados. La hoja debe tener al menos las columnas «Fecha» y «Placa».');
  const claves = filas[cab].map(claveEncabezado);
  const exacta = (alias: readonly string[]) => claves.findIndex(c => alias.includes(c));
  const empieza = (alias: readonly string[]) => claves.findIndex(c => alias.some(a => c.startsWith(a)));
  const i = {
    codigo: exacta(EXACTO.codigo), fecha: exacta(EXACTO.fecha), placa: empieza(EMPIEZA.placa), marca: empieza(EMPIEZA.marca), conductor: empieza(EMPIEZA.conductor),
    ubicacion: empieza(EMPIEZA.ubicacion), tipo: empieza(EMPIEZA.tipo), detalle: empieza(EMPIEZA.detalle), tecnico: empieza(EMPIEZA.tecnico),
    fechaInicio: empieza(EMPIEZA.fechaInicio), horaInicio: empieza(EMPIEZA.horaInicio), fechaFin: empieza(EMPIEZA.fechaFin), horaFin: empieza(EMPIEZA.horaFin),
    repuestos: empieza(EMPIEZA.repuestos), manoObra: empieza(EMPIEZA.manoObra), estado: empieza(EMPIEZA.estado),
  };
  const celda = (fila: CeldaExcel[], k: number) => (k >= 0 ? fila[k] : undefined);
  const texto = (fila: CeldaExcel[], k: number) => (k >= 0 ? textoCelda(fila[k]) : '');

  const resultado: FilaRevisada<FilaSiniestro>[] = [];
  filas.slice(cab + 1).forEach((fila, n) => {
    const numeroFila = cab + 2 + n;
    const placaCruda = texto(fila, i.placa).toUpperCase();
    const fechaCruda = celda(fila, i.fecha);
    // Filas vacías y la fila de totales del Excel (sin placa ni fecha) no son siniestros
    if (!placaCruda && (fechaCruda == null || fechaCruda === '')) return;

    const fecha = fechaDeCelda(fechaCruda);
    const fi = fechaDeCelda(celda(fila, i.fechaInicio)); const hi = horaDeCelda(celda(fila, i.horaInicio));
    const ff = fechaDeCelda(celda(fila, i.fechaFin)); const hf = horaDeCelda(celda(fila, i.horaFin));
    const dato: FilaSiniestro = {
      codigo: texto(fila, i.codigo), fecha: fecha ?? '', placa: placaCruda, marca: texto(fila, i.marca), conductor: texto(fila, i.conductor),
      ubicacion: texto(fila, i.ubicacion), tipo_incidencia: texto(fila, i.tipo), detalle: texto(fila, i.detalle), tecnico: texto(fila, i.tecnico),
      inicio: fi ? `${fi} ${hi ?? '00:00'}` : '', fin: ff ? `${ff} ${hf ?? '00:00'}` : '',
      costo_repuestos: importeDeCelda(celda(fila, i.repuestos)), costo_mano_obra: importeDeCelda(celda(fila, i.manoObra)), estado: texto(fila, i.estado),
    };

    let error: string | undefined;
    if (!dato.placa) error = 'Falta la placa';
    else if (!fecha) error = fechaCruda == null || fechaCruda === '' ? 'Falta la fecha' : `Fecha no reconocida: ${textoCelda(fechaCruda)}`;
    else if (!dato.tipo_incidencia) error = 'Falta el tipo de incidencia';
    else if (dato.inicio && dato.fin && dato.fin < dato.inicio) error = 'El fin del trabajo es anterior a su inicio';
    let nota: string | undefined;
    if (!error && placasConocidas.size && !placasConocidas.has(dato.placa.replace(/[^A-Z0-9]/g, ''))) nota = 'La placa no está en la flota; se guarda igual';

    resultado.push({
      fila: numeroFila,
      celdas: [dato.codigo || '(nuevo)', dato.fecha, dato.placa, dato.tipo_incidencia, formatSoles(dato.costo_repuestos + dato.costo_mano_obra)],
      error, nota, dato,
    });
  });
  if (!resultado.length) throw new Error('El archivo no contiene siniestros debajo de los encabezados.');
  return resultado;
}
