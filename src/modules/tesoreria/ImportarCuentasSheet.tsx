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
import { fmtMonto } from './api';
import { leerCuentasExcel, type FilaCuenta } from './importarCuentas';

// Importación masiva de cuentas por cobrar desde Excel (POST /api/tesoreria/cuentas/importar-masivo)
export function ImportarCuentasSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [filas, setFilas] = useState<FilaCuenta[]>([]);
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
    try {
      const l = await leerCuentasExcel(f);
      setFilas(l);
      if (!l.length) setError('No se reconocieron columnas válidas en el archivo.');
    } catch (err) { setError(errorMessage(err)); }
    finally { setLeyendo(false); }
  }

  async function importar() {
    if (!filas.length) return;
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; message?: string; insertados?: number }>('/tesoreria/cuentas/importar-masivo', { method: 'POST', body: { filas } });
      haptic('success');
      toast(r.message ?? `Se importaron ${filas.length} registros`);
      await qc.invalidateQueries({ queryKey: ['tesoreria', 'cuentas'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Importar cuentas por cobrar"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={importar} loading={enviando} disabled={!filas.length || leyendo}>
          {filas.length ? `Importar ${filas.length} registros` : 'Importar'}
        </Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}

        <Field label="Archivo Excel (.xlsx)" wide hint={archivo ? `${archivo.name}${filas.length ? ` · ${filas.length} registros` : ''}` : 'La primera hoja, con los encabezados en la fila 1'}>
          {p => <TextInput {...p} type="file" accept=".xlsx,.xls" disabled={leyendo || enviando} onChange={e => elegir(e.target.files?.[0])} />}
        </Field>

        {leyendo && <div className="field field--wide"><Notice><FileSpreadsheet size={16} /> Leyendo el archivo…</Notice></div>}

        {filas.length > 0 && (
          <div className="field field--wide tarjeta__lista" style={{ padding: 'var(--s-3)', fontSize: '0.8125rem' }}>
            <div style={{ fontWeight: 700, marginBottom: 'var(--s-2)' }}>Vista previa (primeros 5 registros)</div>
            {filas.slice(0, 5).map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', padding: '4px 0', borderTop: i ? '1px solid var(--separator)' : undefined }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{f.serie && f.factura ? `${f.serie}-${f.factura}` : f.factura || f.codigo_liquidacion || '—'}</span>
                <strong>{f.razon_social || '—'}</strong>
                <span style={{ color: 'var(--label-2)' }}>{f.placa_camion || '—'}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>S/ {fmtMonto(f.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
