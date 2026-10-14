import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

type Fila = Record<string, string | number>;

// Primera hoja del Excel: la fila 1 son los encabezados (FECHA, VIAJE, VEHICULO, GALONES…) tal como
// los usa el clásico, y el servidor los lee por su nombre. Las fechas salen como AAAA-MM-DD.
async function leerValesExcel(archivo: File): Promise<Fila[]> {
  const { readSheet } = await import('read-excel-file/browser');
  let filas: unknown[][];
  try {
    filas = (await readSheet(archivo)) as unknown[][];
  } catch {
    throw new Error('No se pudo leer el archivo. Verifica que sea un Excel válido y que no tenga contraseña.');
  }
  if (filas.length < 2) throw new Error('El archivo no contiene filas de datos.');
  const encabezados = filas[0].map(h => String(h ?? '').trim());
  return filas.slice(1)
    .filter(f => f.some(c => c !== null && c !== undefined && c !== ''))
    .map(f => {
      const fila: Fila = {};
      encabezados.forEach((h, i) => {
        if (!h) return;
        const c = f[i];
        if (c instanceof Date) fila[h] = c.toISOString().slice(0, 10);
        else fila[h] = c == null ? '' : (c as string | number);
      });
      return fila;
    });
}

// Muestra las primeras filas tal como se van a importar, con los mismos nombres de columna del clásico
const campo = (f: Fila, ...claves: string[]) => {
  for (const c of claves) { const v = f[c]; if (v !== undefined && v !== '') return String(v); }
  return '—';
};

// Importación masiva de vales desde Excel (POST /api/combustible/vales/importar-masivo)
export function ImportarValesSheet({ open, onClose, marsisa }: { open: boolean; onClose: () => void; marsisa: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setArchivo(null); setFilas([]); setError(null);
  }, [open]);

  async function elegir(f: File | undefined) {
    if (!f) return;
    setArchivo(f); setFilas([]); setError(null); setLeyendo(true);
    try { setFilas(await leerValesExcel(f)); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLeyendo(false); }
  }

  async function importar() {
    if (!filas.length) return;
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; mensaje?: string }>('/combustible/vales/importar-masivo', { method: 'POST', body: { vales: filas } });
      haptic('success');
      toast(r.mensaje ?? `Se importaron ${filas.length} vales`);
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={`Importar vales${marsisa ? ' · Marsisa' : ''}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={importar} loading={enviando} disabled={!filas.length || leyendo}>
          {filas.length ? `Importar ${filas.length} vales` : 'Importar'}
        </Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <Field label="Archivo Excel (.xlsx)" wide hint={archivo ? `${archivo.name}${filas.length ? ` · ${filas.length} filas` : ''}` : 'La primera hoja, con los encabezados en la fila 1'}>
          {p => <TextInput {...p} type="file" accept=".xlsx,.xls" disabled={leyendo || enviando} onChange={e => elegir(e.target.files?.[0])} />}
        </Field>

        {leyendo && <div className="field field--wide"><Notice><FileSpreadsheet size={16} /> Leyendo el archivo…</Notice></div>}

        {filas.length > 0 && (
          <div className="field field--wide tarjeta__lista" style={{ padding: 'var(--s-3)', fontSize: '0.8125rem' }}>
            <div style={{ fontWeight: 700, marginBottom: 'var(--s-2)' }}>Vista previa (primeras 5 filas)</div>
            {filas.slice(0, 5).map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', padding: '4px 0', borderTop: i ? '1px solid var(--separator)' : undefined }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{campo(f, 'FECHA', 'fecha')}</span>
                <strong>{campo(f, 'VEHICULO', 'vehiculo', 'PLACA', 'placa')}</strong>
                <span style={{ color: 'var(--label-2)' }}>{campo(f, 'CONDUCTOR', 'conductor')}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>{campo(f, 'GALONES', 'galones')} gal · {campo(f, 'IMPORTE', 'importe')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
