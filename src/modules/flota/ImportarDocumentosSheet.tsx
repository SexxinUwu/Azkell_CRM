import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../core/api/client';
import { ImportarValidadoSheet, type FilaRevisada } from '../../core/ui/ImportarValidadoSheet';
import { COLUMNAS, descargarPlantilla, leerArchivoConFilas, type RegistroImportar } from './documentosExcel';

interface Resultado {
  ok: boolean; unidades: number; placasNuevas: string[]; historial: number; archivados: number; vaciados: number;
  omitidas: Array<{ fila: number; placa: string; motivo: string }>;
}

const normPlaca = (p: string | undefined) => String(p ?? '').toUpperCase().replace(/\s+/g, '').trim();
const ES_FECHA = new Set(COLUMNAS.map(c => c[1]).filter(c => /vencimiento|emision/.test(c)));
const ETIQUETA = new Map(COLUMNAS.map(([h, c]) => [c, h]));

/** Misma regla que el servidor (routes/documentos_flota_import.js): AAAA-MM-DD con día real y año 1990-2100 */
function fechaValida(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (a < 1990 || a > 2100) return false;
  const f = new Date(Date.UTC(a, me - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === me - 1 && f.getUTCDate() === d;
}

// Importar documentos desde la plantilla con revisión previa. Valida igual que el servidor y envía solo las filas válidas
// a POST /api/documentos-flota/importar (la fila del archivo pasa a ser el estado actual; lo anterior queda en el historial).
export function ImportarDocumentosSheet({ open, onClose, placasConocidas }: { open: boolean; onClose: () => void; placasConocidas: string[] }) {
  const qc = useQueryClient();

  async function leer(archivo: File): Promise<FilaRevisada<RegistroImportar>[]> {
    const filas = await leerArchivoConFilas(archivo);
    const conocidas = new Set(placasConocidas.map(normPlaca));
    const ultima = new Map<string, number>(); // placa → última fila del archivo (la que gana)
    filas.forEach(({ fila, registro }) => { const p = normPlaca(registro.placa); if (p) ultima.set(p, fila); });

    return filas.map(({ fila, registro }) => {
      const placa = normPlaca(registro.placa);
      const dato: RegistroImportar = { ...registro, placa };
      let error: string | undefined;
      let nota: string | undefined;
      if (!placa) error = 'Sin placa.';
      else if (!/^[A-Z0-9-]{5,12}$/.test(placa)) error = 'Placa no válida.';
      else {
        for (const [campo, valor] of Object.entries(dato)) {
          if (ES_FECHA.has(campo) && !fechaValida(valor)) { error = `Fecha no válida en ${ETIQUETA.get(campo) ?? campo}: ${valor} (usa AAAA-MM-DD).`; break; }
        }
        const prop = dato.propiedad?.toUpperCase();
        if (!error && prop && !/^PROPI/.test(prop) && !/^TERCER/.test(prop)) error = `Propiedad debe ser PROPIA o TERCERA: ${dato.propiedad}.`;
        if (!error && dato.ext_cantidad !== undefined && !Number.isFinite(Number(dato.ext_cantidad))) error = 'Cantidad de extintores no válida.';
        if (!error && ultima.get(placa) !== fila) error = `Placa repetida: se usa la fila ${ultima.get(placa)} del archivo.`;
        if (!error) nota = conocidas.has(placa) ? 'Placa existente: sus documentos pasan a ser los del archivo' : 'Placa nueva: se crea solo la placa';
      }
      const docs = Object.keys(dato).filter(k => /vencimiento$/.test(k)).length;
      return { fila, dato, error, nota, celdas: [placa, dato.propiedad ?? '', `${docs} vencimientos`] };
    });
  }

  async function enviar(validas: RegistroImportar[]) {
    const r = await api<Resultado>('/documentos-flota/importar', { method: 'POST', body: { registros: validas } });
    const omitidas = r.omitidas?.length ? ` · ${r.omitidas.length} omitidas por el servidor` : '';
    return `${r.unidades} unidades importadas · ${r.placasNuevas.length} placas nuevas · ${r.historial} documentos nuevos · ${r.vaciados} vaciados · ${r.archivados} anteriores guardados en el historial${omitidas}`;
  }

  return (
    <ImportarValidadoSheet<RegistroImportar>
      open={open} onClose={onClose} titulo="Importar documentos desde Excel" plural="documentos de unidades"
      columnas={['Placa', 'Propiedad', 'Documentos']}
      leer={leer} enviar={enviar} plantilla={descargarPlantilla}
      alTerminar={() => Promise.all([qc.invalidateQueries({ queryKey: ['flota'] }), qc.invalidateQueries({ queryKey: ['placas'] })])}
      ayuda="Cada fila es el estado actual de documentos de la placa: lo que no venga queda vacío y lo anterior se conserva en el historial."
    />
  );
}
