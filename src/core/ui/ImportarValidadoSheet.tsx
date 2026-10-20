import { useEffect, useRef, useState } from 'react';
import { CircleAlert, FileSpreadsheet, Upload } from 'lucide-react';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { Notice } from './Display';
import { errorMessage } from '../api/client';
import { haptic } from '../lib/haptics';

// Importar desde Excel con revisión previa: elegir archivo → ver filas válidas y con error (con el motivo) → confirmar.
// Solo se envían las filas válidas. Cada pantalla aporta cómo leer el archivo y cómo enviar.

export type CeldaExcel = string | number | boolean | Date | null;

export interface FilaRevisada<T> {
  /** Número de fila en el Excel (la 1 es el encabezado) */
  fila: number;
  /** Texto corto de la fila para la vista previa, una celda por columna de `columnas` */
  celdas: string[];
  /** Si existe, la fila no se importa */
  error?: string;
  /** Aviso que no impide importar (p. ej. "se actualiza el existente") */
  nota?: string;
  dato: T;
}

/** Mayúsculas, sin tildes y solo letras y números: "N° Documento" → "NDOCUMENTO" */
export const claveEncabezado = (h: unknown) =>
  String(h ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

export const textoCelda = (v: CeldaExcel | undefined) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? '').trim();
};

/** Lee la primera hoja y devuelve encabezados normalizados + filas con su número de fila en el Excel */
export async function leerTabla(archivo: File) {
  const { readSheet } = await import('read-excel-file/browser');
  const filas = (await readSheet(archivo)) as CeldaExcel[][];
  if (filas.length < 2) throw new Error('El archivo no contiene filas de datos debajo de los encabezados.');
  const claves = filas[0].map(claveEncabezado);
  const datos = filas.slice(1)
    .map((celdas, i) => ({ fila: i + 2, celdas }))
    .filter(f => f.celdas.some(c => textoCelda(c) !== ''));
  if (!datos.length) throw new Error('El archivo no contiene filas de datos debajo de los encabezados.');
  return { claves, datos };
}

type Paso =
  | { paso: 'elegir'; error?: string }
  | { paso: 'revisar'; archivo: string; filas: FilaRevisada<unknown>[] }
  | { paso: 'listo'; mensaje: string };

interface Props<T> {
  open: boolean;
  onClose: () => void;
  titulo: string;
  /** Encabezados de la vista previa (uno por celda de cada fila revisada) */
  columnas: string[];
  /** Nombre de lo que se importa, en plural: "proveedores" */
  plural: string;
  leer: (archivo: File) => Promise<FilaRevisada<T>[]>;
  /** Envía solo las filas válidas; devuelve el mensaje de resultado */
  enviar: (validas: T[]) => Promise<string>;
  alTerminar?: () => unknown;
  plantilla: () => Promise<unknown>;
  ayuda?: string;
}

const MAX_ERRORES = 100;
const MAX_VALIDAS = 10;

export function ImportarValidadoSheet<T>({ open, onClose, titulo, columnas, plural, leer, enviar, alTerminar, plantilla, ayuda }: Props<T>) {
  const input = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Paso>({ paso: 'elegir' });
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { if (open) setEstado({ paso: 'elegir' }); }, [open]);

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setOcupado(true);
    try {
      const filas = await leer(archivo);
      if (!filas.length) throw new Error('No se encontraron filas para revisar.');
      setEstado({ paso: 'revisar', archivo: archivo.name, filas });
      haptic('selection');
    } catch (err) {
      setEstado({ paso: 'elegir', error: errorMessage(err) });
      haptic('warning');
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = '';
    }
  }

  async function confirmar() {
    if (estado.paso !== 'revisar') return;
    const validas = (estado.filas as FilaRevisada<T>[]).filter(f => !f.error).map(f => f.dato);
    if (!validas.length) return;
    setOcupado(true);
    try {
      const mensaje = await enviar(validas);
      await alTerminar?.();
      setEstado({ paso: 'listo', mensaje });
      haptic('success');
    } catch (err) {
      setEstado({ paso: 'elegir', error: errorMessage(err) });
      haptic('warning');
    } finally {
      setOcupado(false);
    }
  }

  const filas = estado.paso === 'revisar' ? estado.filas : [];
  const conError = filas.filter(f => f.error);
  const validas = filas.filter(f => !f.error);

  const footer = estado.paso === 'elegir' ? (
    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
  ) : estado.paso === 'revisar' ? (
    <>
      <Button variant="secondary" onClick={() => setEstado({ paso: 'elegir' })} disabled={ocupado}>Elegir otro archivo</Button>
      <Button variant="primary" onClick={confirmar} loading={ocupado} disabled={!validas.length}>
        {validas.length ? `Importar ${validas.length} ${validas.length === 1 ? 'fila válida' : 'filas válidas'}` : 'Nada que importar'}
      </Button>
    </>
  ) : (
    <Button variant="primary" onClick={onClose}>Listo</Button>
  );

  const celdaStyle = { padding: '0.35rem 0.5rem', textAlign: 'left' as const, borderBottom: '1px solid var(--separator, rgba(128,128,128,.2))', verticalAlign: 'top' as const };

  return (
    <Sheet open={open} onClose={() => !ocupado && onClose()} title={titulo} footer={footer}>
      {estado.paso === 'elegir' && (
        <div className="importar">
          <button type="button" className="importar__zona pressable" onClick={() => input.current?.click()} disabled={ocupado}>
            <span className="importar__icono">{ocupado ? <FileSpreadsheet size={30} /> : <Upload size={30} />}</span>
            <span className="importar__titulo">{ocupado ? 'Leyendo el archivo…' : 'Elige tu Excel'}</span>
            <span className="t-footnote c-secondary">toca para buscarlo · solo archivos .xlsx</span>
          </button>
          <input ref={input} type="file" accept=".xlsx" hidden onChange={e => elegir(e.target.files?.[0])} />
          {estado.error && <Notice tone="error" icon={<CircleAlert size={16} />}>{estado.error}</Notice>}
          <p className="t-footnote c-secondary importar__ayuda">
            ¿No tienes el formato? <button type="button" className="placas-limpiar" onClick={() => { plantilla().catch(() => undefined); }}>Descargar plantilla</button>.
            {ayuda ? ` ${ayuda}` : ''}
          </p>
        </div>
      )}

      {estado.paso === 'revisar' && (
        <div className="importar">
          <p className="t-footnote c-secondary">
            <FileSpreadsheet size={14} style={{ verticalAlign: '-2px' }} /> {estado.archivo} · {filas.length} filas leídas
          </p>
          <div className="importar__resumen" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div className="importar__cifra importar__cifra--nuevas"><span className="t-numeric">{validas.length}</span><span>válidas</span></div>
            <div className="importar__cifra"><span className="t-numeric" style={conError.length ? { color: 'var(--red-ink)' } : undefined}>{conError.length}</span><span>con error</span></div>
          </div>

          {conError.length > 0 && (
            <>
              <Notice tone="error" icon={<CircleAlert size={16} />}>
                Las filas con error no se importan. Corrígelas en el Excel y vuelve a subirlo, o importa solo las válidas.
              </Notice>
              <div style={{ overflowX: 'auto' }}>
                <table className="t-footnote" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={celdaStyle}>Fila</th><th style={celdaStyle}>Dato</th><th style={celdaStyle}>Motivo</th></tr></thead>
                  <tbody>
                    {conError.slice(0, MAX_ERRORES).map(f => (
                      <tr key={f.fila}>
                        <td style={celdaStyle} className="t-numeric">{f.fila}</td>
                        <td style={celdaStyle}>{f.celdas.filter(Boolean).slice(0, 2).join(' · ') || '—'}</td>
                        <td style={{ ...celdaStyle, color: 'var(--red-ink)' }}>{f.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {conError.length > MAX_ERRORES && <p className="t-footnote c-secondary">Se muestran las primeras {MAX_ERRORES} de {conError.length} filas con error.</p>}
            </>
          )}

          {validas.length > 0 && (
            <>
              <p className="t-footnote c-secondary">Vista previa de los {plural} válidos{validas.length > MAX_VALIDAS ? ` (primeros ${MAX_VALIDAS})` : ''}:</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="t-footnote" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={celdaStyle}>Fila</th>{columnas.map(c => <th key={c} style={celdaStyle}>{c}</th>)}<th style={celdaStyle}>Aviso</th></tr></thead>
                  <tbody>
                    {validas.slice(0, MAX_VALIDAS).map(f => (
                      <tr key={f.fila}>
                        <td style={celdaStyle} className="t-numeric">{f.fila}</td>
                        {f.celdas.map((c, i) => <td key={i} style={celdaStyle}>{c || '—'}</td>)}
                        <td style={{ ...celdaStyle, color: 'var(--amber-ink)' }}>{f.nota ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validas.filter(f => f.nota).length > MAX_VALIDAS && <p className="t-footnote c-secondary">Hay {validas.filter(f => f.nota).length} filas con aviso en total.</p>}
            </>
          )}
        </div>
      )}

      {estado.paso === 'listo' && (
        <div className="importar importar--listo">
          <div className="importar__titulo">{estado.mensaje}</div>
        </div>
      )}
    </Sheet>
  );
}
