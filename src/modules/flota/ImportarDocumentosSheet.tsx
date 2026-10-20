import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Download, FileSpreadsheet } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { descargarPlantilla, leerArchivoDocumentos, type RegistroImportar } from './documentosExcel';

interface Resultado {
  ok: boolean; unidades: number; placasNuevas: string[]; historial: number; archivados: number; vaciados: number;
  omitidas: Array<{ fila: number; placa: string; motivo: string }>;
}

const normPlaca = (p: string | undefined) => String(p ?? '').toUpperCase().replace(/\s+/g, '').trim();

// Importar documentos desde la plantilla: placa que no existe → se crea solo la placa; placa que existe → los datos
// del archivo se escriben encima de los actuales (lo vacío no se toca) y cada documento que cambia queda en su historial.
export function ImportarDocumentosSheet({ open, onClose, placasConocidas }: { open: boolean; onClose: () => void; placasConocidas: string[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [registros, setRegistros] = useState<RegistroImportar[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => { if (open) { setArchivo(null); setRegistros([]); setError(null); setResultado(null); } }, [open]);

  const resumen = useMemo(() => {
    const conocidas = new Set(placasConocidas.map(normPlaca));
    const placas = [...new Set(registros.map(r => normPlaca(r.placa)).filter(Boolean))];
    return { placas: placas.length, nuevas: placas.filter(p => !conocidas.has(p)) };
  }, [registros, placasConocidas]);

  async function elegir(f: File | undefined) {
    if (!f) return;
    setArchivo(f); setRegistros([]); setError(null); setResultado(null); setLeyendo(true);
    try { setRegistros(await leerArchivoDocumentos(f)); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLeyendo(false); }
  }

  async function importar() {
    setEnviando(true); setError(null);
    try {
      const r = await api<Resultado>('/documentos-flota/importar', { method: 'POST', body: { registros } });
      setResultado(r);
      haptic(r.omitidas.length ? 'warning' : 'success');
      toast(`${r.unidades} unidades importadas${r.placasNuevas.length ? ` · ${r.placasNuevas.length} placas nuevas` : ''}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['flota'] }),
        qc.invalidateQueries({ queryKey: ['placas'] }),
      ]);
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Importar documentos desde Excel"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>{resultado ? 'Cerrar' : 'Cancelar'}</Button>
        {!resultado && <Button variant="primary" onClick={importar} loading={enviando} disabled={!registros.length || leyendo}>
          {registros.length ? `Importar ${resumen.placas} placas` : 'Importar'}</Button>}</>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <div className="field field--wide">
          <Notice>
            Usa la plantilla. Cada fila es el estado <strong>actual</strong> de documentos de esa placa: un documento que no venga en la fila queda vacío en la unidad,
            y todo lo anterior se conserva en su historial. Una placa que no exista se crea solo con su placa. Tipo, marca, modelo, color, año, serie y empresa no van en la plantilla: se toman siempre de Placas.
          </Notice>
          <div style={{ marginTop: 'var(--s-2)' }}>
            <Button variant="secondary" size="sm" icon={<Download size={15} />} onClick={() => descargarPlantilla().catch(e => toast(errorMessage(e), 'error'))}>Descargar plantilla</Button>
          </div>
        </div>

        <Field label="Archivo Excel (.xlsx)" wide hint={archivo ? `${archivo.name}${registros.length ? ` · ${registros.length} filas` : ''}` : 'Con los encabezados de la plantilla'}>
          {p => <TextInput {...p} type="file" accept=".xlsx" disabled={leyendo || enviando} onChange={e => elegir(e.target.files?.[0])} />}
        </Field>

        {leyendo && <div className="field field--wide"><Notice><FileSpreadsheet size={16} /> Leyendo el archivo…</Notice></div>}

        {!resultado && registros.length > 0 && (
          <div className="field field--wide tarjeta__lista" style={{ padding: 'var(--s-3)', fontSize: '0.8125rem' }}>
            <div style={{ fontWeight: 700, marginBottom: 'var(--s-2)' }}>Qué va a pasar</div>
            <div>{resumen.placas - resumen.nuevas.length} placas existentes se actualizan: sus documentos pasan a ser los del archivo (los que no vengan quedan vacíos; el historial se conserva).</div>
            <div>{resumen.nuevas.length} placas nuevas se crean{resumen.nuevas.length ? `: ${resumen.nuevas.slice(0, 8).join(', ')}${resumen.nuevas.length > 8 ? '…' : ''}` : '.'}</div>
          </div>
        )}

        {resultado && (
          <div className="field field--wide">
            <Notice tone={resultado.omitidas.length ? 'accent' : 'success'}>
              {resultado.unidades} unidades importadas · {resultado.placasNuevas.length} placas nuevas · {resultado.historial} documentos nuevos · {resultado.vaciados} documentos que quedaron vacíos · {resultado.archivados} anteriores guardados en el historial
              {resultado.omitidas.length ? ` · ${resultado.omitidas.length} filas omitidas` : ''}.
            </Notice>
            {resultado.omitidas.length > 0 && (
              <ul style={{ margin: 'var(--s-2) 0 0', paddingLeft: 18, fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                {resultado.omitidas.slice(0, 20).map((o, i) => <li key={i}>Fila {o.fila}{o.placa ? ` (${o.placa})` : ''}: {o.motivo}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
