import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';

// Importación masiva de trabajos de OT (POST /api/ot-trabajos/bulk-import). Encabezados como en la
// plantilla del clásico: N° OT, Placa, F/H inicio, Trabajo realizado, Personal, F/H salida, Costo.
interface ItemTrabajo {
  ticket_visita: string; placa: string; fecha_trabajo: string; trabajo_realizado: string;
  personal: string; fecha_salida: string | null; costo: number; usuario: string;
}

type Celda = string | number | boolean | Date | null;

const plegar = (k: string) => k.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = (n: number) => String(n).padStart(2, '0');
const aFechaHora = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

function fechaTrabajo(val: Celda): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return aFechaHora(val);
  if (typeof val === 'number') return aFechaHora(new Date((val - 25569) * 86400 * 1000));
  const s = String(val).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))} ${pad(Number(m[4] ?? 0))}:${pad(Number(m[5] ?? 0))}:${pad(Number(m[6] ?? 0))}`;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))} ${pad(Number(iso[4] ?? 0))}:${pad(Number(iso[5] ?? 0))}:${pad(Number(iso[6] ?? 0))}`;
  return null;
}

async function leerTrabajos(archivo: File, usuario: string): Promise<ItemTrabajo[]> {
  const { readSheet } = await import('read-excel-file/browser');
  const filas = (await readSheet(archivo)) as Celda[][];
  if (filas.length < 2) throw new Error('El archivo Excel está vacío o no tiene el formato correcto.');
  const claves = filas[0].map(h => plegar(String(h ?? '')));
  const items: ItemTrabajo[] = [];
  for (const fila of filas.slice(1)) {
    const norm: Record<string, Celda> = {};
    claves.forEach((k, i) => { if (k && norm[k] === undefined) norm[k] = fila[i] ?? null; });
    const get = (...alias: string[]): Celda => {
      for (const a of alias) { const v = norm[a]; if (v !== undefined && v !== null && v !== '') return v; }
      return '';
    };
    const ot = String(get('n° ot', 'n ot', 'no ot', 'ot') ?? '').trim();
    const trabajo = String(get('trabajo realizado', 'trabajo') ?? '').trim();
    const personal = String(get('personal') ?? '').trim();
    if (!ot && !trabajo && !personal) continue;
    items.push({
      ticket_visita: ot,
      placa: String(get('placa') ?? '').trim(),
      fecha_trabajo: fechaTrabajo(get('f/h inicio', 'fh inicio', 'fecha inicio')) ?? aFechaHora(new Date()),
      trabajo_realizado: trabajo,
      personal,
      fecha_salida: fechaTrabajo(get('f/h salida', 'fh salida', 'fecha salida')),
      costo: Number(String(get('costo') || 0).replace(',', '.')) || 0,
      usuario,
    });
  }
  return items;
}

export function ImportarTrabajosSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [items, setItems] = useState<ItemTrabajo[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setArchivo(null); setItems([]); setError(null);
  }, [open]);

  async function elegir(f: File | undefined) {
    if (!f) return;
    setArchivo(f); setItems([]); setError(null); setLeyendo(true);
    try {
      const l = await leerTrabajos(f, user?.name ?? 'Importación Masiva');
      setItems(l);
      if (!l.length) setError('No se encontraron registros válidos para importar en el Excel.');
    } catch (err) { setError(errorMessage(err)); }
    finally { setLeyendo(false); }
  }

  async function importar() {
    if (!items.length) return;
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; creados?: number; error?: string }>('/ot-trabajos/bulk-import', { method: 'POST', body: { items, usuario: user?.name } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo importar');
      haptic('success');
      toast(`Se importaron ${r.creados ?? items.length} trabajo(s)`);
      await qc.invalidateQueries({ queryKey: ['mant', 'trabajos-ot'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Importar trabajos de OT"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={importar} loading={enviando} disabled={!items.length || leyendo}>
          {items.length ? `Importar ${items.length} trabajos` : 'Importar'}
        </Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Archivo Excel (.xlsx)" wide hint={archivo ? `${archivo.name}${items.length ? ` · ${items.length} trabajos` : ''}` : 'Usa la plantilla: N° OT, Placa, F/H inicio, Trabajo realizado, Personal, F/H salida, Costo'}>
          {p => <TextInput {...p} type="file" accept=".xlsx,.xls" disabled={leyendo || enviando} onChange={e => elegir(e.target.files?.[0])} />}
        </Field>
        {leyendo && <div className="field field--wide"><Notice><FileSpreadsheet size={16} /> Leyendo el archivo…</Notice></div>}
        {items.length > 0 && (
          <div className="field field--wide tarjeta__lista" style={{ padding: 'var(--s-3)', fontSize: '0.8125rem' }}>
            <div style={{ fontWeight: 700, marginBottom: 'var(--s-2)' }}>Vista previa (primeros 5)</div>
            {items.slice(0, 5).map((it, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', padding: '4px 0', borderTop: i ? '1px solid var(--separator)' : undefined }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{it.ticket_visita || '—'}</span>
                <span>{it.placa || '—'}</span>
                <span style={{ color: 'var(--label-2)', flex: 1, minWidth: 0 }}>{it.trabajo_realizado || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
