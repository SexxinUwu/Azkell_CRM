import { ImportarValidadoSheet, leerTabla, textoCelda, type CeldaExcel, type FilaRevisada } from '../../core/ui/ImportarValidadoSheet';
import { exportarExcel } from '../../core/lib/excel';
import { formatSoles } from '../../core/lib/format';
import { importarIncidencias, type CatalogoIncidencias } from './api';

// Importar incidencias desde Excel. Mismos encabezados y reglas que el clásico (incidencias-ruta/logica.js):
// la fecha acepta serial de Excel, 06-ene-26 o dd/mm/aaaa; marca y clase se completan desde la placa.
// A diferencia del clásico, cada fila se revisa antes de enviar y las filas con error no se suben.

export interface RegistroIncidencia {
  fecha_falla: string;
  placa: string;
  conductor: string;
  marca: string;
  ubicacion: string;
  tipo_unidad: string;
  transbordo: string;
  motivo: string;
  falla: string;
  area_responsable: string;
  responsable: string;
  costo_individual_texto: string;
  total_costo: number;
  solucionado: string;
}

const ENCABEZADOS = [
  'FECHA FALLA', 'PLACA', 'CONDUCTOR', 'UBICACION', 'TRANSBORDO', 'MOTIVO', 'FALLA',
  'Responsabilidad de Area', 'RESPONSABLE', 'COSTO', 'TOTAL COSTO', 'Se dio solucion?',
];

const EJEMPLOS = [
  ['2026-08-20', 'ADH982', 'CARLOS MENDOZA', 'MATUCANA', 'NO', 'FUGA REFRIGERANTE', 'SE SALIO MANGUERA DEL RADIADOR',
    'Mantenimiento', 'FALLA MECANICA', '- PAGO DE HORA EXTRA PERSONAL 50\n- PAGO DE PEAJE 20', 70, 'Atendido'],
  ['2026-08-21', 'AZP977', 'JORGE RAMIREZ', 'PUCALLPA', 'SI', 'UNIDAD NO ARRANCA', 'SE SALIO PIÑON DEL ARRANCADOR',
    'Mantenimiento', 'FALLA MECANICA', '- PIÑON 120\n- MANO DE OBRA 120\n- OTROS GASTOS 100', 340, 'Pendiente'],
];

export const descargarPlantillaIncidencias = () =>
  exportarExcel('Plantilla_Incidencias_Ruta', 'Incidencias', ENCABEZADOS, EJEMPLOS);

// Encabezado normalizado (sin tildes ni símbolos) → campo. Se toma la primera columna que coincida.
const ALIAS = {
  fecha: ['FECHAFALLA', 'FECHA', 'DIA'],
  placa: ['PLACA', 'VEHICULO', 'UNIDAD'],
  conductor: ['CONDUCTOR', 'CHOFER'],
  marca: ['MARCA'],
  ubicacion: ['UBICACION', 'LUGAR', 'RUTA'],
  tipo: ['UNIDADDENEGOCIO', 'TIPO', 'CLASE'],
  transbordo: ['TRANSBORDO'],
  motivo: ['MOTIVO', 'PROBLEMA'],
  falla: ['FALLA', 'DIAGNOSTICO', 'FALLADETALLADA'],
  area: ['RESPONSABILIDADDEAREA', 'AREA', 'RESPONSABILIDAD'],
  responsable: ['RESPONSABLE', 'CAUSA'],
  costo: ['COSTO', 'DESGLOSE'],
  total: ['TOTALCOSTO', 'TOTAL'],
  solucion: ['SEDIOSOLUCION', 'SOLUCION', 'ESTADO', 'ATENDIDO'],
} as const;

const MESES: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', set: '09', sep: '09', oct: '10', nov: '11', dic: '12',
};

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** Fecha del Excel → aaaa-mm-dd. Devuelve null si no se reconoce. */
function fechaIso(texto: string): string | null {
  const t = texto.trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${dosDigitos(+m[2])}-${dosDigitos(+m[3])}`;
  if (/^\d{5}$/.test(t)) {
    // Serial de Excel: días desde 1899-12-30
    const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  m = /^(\d{1,2})[-/ ]([a-z]{3,4})[-/ ](\d{2,4})$/i.exec(t);
  if (m && MESES[m[2].slice(0, 3).toLowerCase()]) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${anio}-${MESES[m[2].slice(0, 3).toLowerCase()]}-${dosDigitos(+m[1])}`;
  }
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(t);
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
    // Por defecto dd/mm (Perú); si el segundo número es mayor que 12, es mm/dd
    const [dia, mes] = +m[2] > 12 ? [m[2], m[1]] : [m[1], m[2]];
    return `${anio}-${dosDigitos(+mes)}-${dosDigitos(+dia)}`;
  }
  return null;
}

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
};

async function leerIncidencias(archivo: File, catalogo: CatalogoIncidencias | undefined): Promise<FilaRevisada<RegistroIncidencia>[]> {
  const { claves, datos } = await leerTabla(archivo);
  const columna = (alias: readonly string[]) => claves.findIndex(c => (alias as readonly string[]).includes(c));
  const idx = {
    fecha: columna(ALIAS.fecha), placa: columna(ALIAS.placa), conductor: columna(ALIAS.conductor),
    marca: columna(ALIAS.marca), ubicacion: columna(ALIAS.ubicacion), tipo: columna(ALIAS.tipo),
    transbordo: columna(ALIAS.transbordo), motivo: columna(ALIAS.motivo), falla: columna(ALIAS.falla),
    area: columna(ALIAS.area), responsable: columna(ALIAS.responsable), costo: columna(ALIAS.costo),
    total: columna(ALIAS.total), solucion: columna(ALIAS.solucion),
  };
  const texto = (celdas: CeldaExcel[], i: number) => (i >= 0 ? textoCelda(celdas[i]) : '');
  const placas = catalogo?.data ?? [];

  return datos.map(({ fila, celdas }) => {
    const brutaFecha = texto(celdas, idx.fecha);
    const fechaNormal = brutaFecha ? fechaIso(brutaFecha) : hoyIso();
    const placaLimpia = texto(celdas, idx.placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Si la placa existe en el catálogo se usa tal como está ahí (con guion o sin él)
    const info = placas.find(p => p.placa.replace(/[^A-Z0-9]/g, '') === placaLimpia);
    const placa = info?.placa ?? placaLimpia;
    const total = parseFloat(texto(celdas, idx.total).replace(/[^0-9.]/g, '')) || 0;

    const dato: RegistroIncidencia = {
      fecha_falla: fechaNormal ?? '',
      placa,
      conductor: texto(celdas, idx.conductor),
      marca: texto(celdas, idx.marca) || info?.marca || '',
      ubicacion: texto(celdas, idx.ubicacion),
      tipo_unidad: texto(celdas, idx.tipo) || info?.tipo || '',
      transbordo: texto(celdas, idx.transbordo),
      motivo: texto(celdas, idx.motivo),
      falla: texto(celdas, idx.falla),
      area_responsable: texto(celdas, idx.area),
      responsable: texto(celdas, idx.responsable),
      costo_individual_texto: texto(celdas, idx.costo),
      total_costo: total,
      solucionado: texto(celdas, idx.solucion),
    };

    const error = !placaLimpia
      ? 'Falta la placa'
      : brutaFecha && !fechaNormal ? `Fecha no reconocida: ${brutaFecha}` : undefined;
    const nota = !brutaFecha ? 'Sin fecha: se usa la de hoy' : undefined;

    return {
      fila,
      celdas: [dato.fecha_falla, dato.placa, dato.motivo || '—', formatSoles(dato.total_costo)],
      error,
      nota,
      dato,
    };
  });
}

async function enviarIncidencias(validas: RegistroIncidencia[]) {
  const r = await importarIncidencias(validas);
  return `${r.insertados} incidencias importadas${r.errores ? ` · ${r.errores} omitidas` : ''}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  catalogo: CatalogoIncidencias | undefined;
  alTerminar: () => void;
}

export function ImportarIncidenciasSheet({ open, onClose, catalogo, alTerminar }: Props) {
  return (
    <ImportarValidadoSheet<RegistroIncidencia>
      open={open}
      onClose={onClose}
      titulo="Importar incidencias desde Excel"
      plural="incidencias"
      columnas={['Fecha', 'Placa', 'Motivo', 'Costo total']}
      leer={archivo => leerIncidencias(archivo, catalogo)}
      enviar={enviarIncidencias}
      alTerminar={alTerminar}
      plantilla={descargarPlantillaIncidencias}
      ayuda="Mismos encabezados que el archivo del clásico. La marca y la clase se completan desde la placa."
    />
  );
}
