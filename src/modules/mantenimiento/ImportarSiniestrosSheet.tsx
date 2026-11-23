import { ImportarValidadoSheet } from '../../core/ui/ImportarValidadoSheet';
import { exportarExcel } from '../../core/lib/excel';
import { importarSiniestros, type CatalogoSiniestros } from './siniestrosApi';
import { filaDeEncabezados, interpretarSiniestros, type FilaSiniestro } from './siniestrosImportar';

// Importar siniestros desde el Excel de control. Acepta el archivo tal como está (con su título arriba, la hoja «Registro de
// Siniestros» y las columnas de tiempo y costo total, que se ignoran porque el sistema las calcula). Cada fila se revisa antes de enviar.

const ENCABEZADOS = [
  'ID', 'Fecha', 'Placa', 'MARCA', 'Nombre del Conductor', 'Ubicación del Evento', 'Tipo de Incidencia', 'Detalle de Daños / Causa', 'Técnico Responsable',
  'Fecha Inicio', 'Hora Inicio', 'Fecha Fin', 'Hora Fin', 'Costo Repuestos (S/.)', 'Costo Mano Obra (S/.)', 'Estado',
];
const EJEMPLO = [
  ['SIN-001', '2026-10-02', 'ABC-123', '', 'Juan Pérez', 'Av. Principal km 14', 'Choque / Colisión', 'Impacto en retroceso contra poste', 'Carlos Mendoza (Mecánico)',
    '2026-10-02', '14:00', '2026-10-03', '18:00', 1450, 480, 'Concluido'],
];

export const descargarPlantillaSiniestros = () => exportarExcel('Plantilla_Siniestros', 'Registro de Siniestros', ENCABEZADOS, EJEMPLO);

/** Busca la hoja con los siniestros: «Registro de Siniestros» o la primera que tenga las columnas Fecha y Placa */
async function leerFilas(archivo: File) {
  const { readSheet } = await import('read-excel-file/browser');
  for (const hoja of ['Registro de Siniestros', 'Registro', 'Siniestros', 1, 2, 3, 4]) {
    try {
      const filas = (await readSheet(archivo, hoja as never)) as never as import('../../core/ui/ImportarValidadoSheet').CeldaExcel[][];
      if (filaDeEncabezados(filas) >= 0) return filas;
    } catch { /* esa hoja no existe: se prueba la siguiente */ }
  }
  throw new Error('No encontré la hoja con los siniestros. Debe tener al menos las columnas «Fecha» y «Placa».');
}

async function enviar(validas: FilaSiniestro[]) {
  const r = await importarSiniestros(validas);
  return `${r.insertados} nuevos · ${r.actualizados} actualizados${r.errores ? ` · ${r.errores} con error${r.detalle_errores?.length ? ` (${r.detalle_errores[0]})` : ''}` : ''}`;
}

export function ImportarSiniestrosSheet({ open, onClose, catalogo, alTerminar }: { open: boolean; onClose: () => void; catalogo: CatalogoSiniestros | undefined; alTerminar: () => void }) {
  const conocidas = new Set((catalogo?.placas ?? []).map(p => p.placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()));
  return (
    <ImportarValidadoSheet<FilaSiniestro>
      open={open}
      onClose={onClose}
      titulo="Importar siniestros desde Excel"
      plural="siniestros"
      columnas={['ID', 'Fecha', 'Placa', 'Tipo', 'Costo total']}
      leer={async archivo => interpretarSiniestros(await leerFilas(archivo), conocidas)}
      enviar={enviar}
      alTerminar={alTerminar}
      plantilla={descargarPlantillaSiniestros}
      ayuda="Sirve el mismo Excel de control. Si el ID ya existe, el siniestro se actualiza; si no, se crea. Las horas de taller, el costo total y la marca se calculan solos."
    />
  );
}
