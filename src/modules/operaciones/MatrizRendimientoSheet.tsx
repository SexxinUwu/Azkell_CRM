import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet, Pencil, Plus, Trash2 } from 'lucide-react';
import { Sheet, ConfirmSheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

// Matriz de rendimiento teórico (D2): consumo esperado por ruta según carga y motor.
// Contrato del servidor: /api/combustible/matriz (GET, POST, PUT/:id, DELETE/:id, importar, vaciar-todo).
export interface FilaMatriz {
  id: number; sentido: string; ruta: string; motor: string; confg: string;
  km_0: number | string; km_5: number | string; km_10: number | string; km_15: number | string;
  km_20: number | string; km_25: number | string; km_30: number | string; km: number | string;
}

const TRAMOS = ['km_0', 'km_5', 'km_10', 'km_15', 'km_20', 'km_25', 'km_30'] as const;
const ETIQUETA_TRAMO: Record<string, string> = { km_0: '0', km_5: '5', km_10: '10', km_15: '15', km_20: '20', km_25: '25', km_30: '30' };
const num = (v: unknown) => Number(v) || 0;

type Vacio = Omit<FilaMatriz, 'id'> & { id?: number };
const VACIO: Vacio = { sentido: 'IDA', ruta: '', motor: 'MC11.44', confg: 'T3', km_0: '', km_5: '', km_10: '', km_15: '', km_20: '', km_25: '', km_30: '', km: '' };

function FormularioFila({ fila, onClose }: { fila: Vacio | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState<Vacio>(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editando = !!fila?.id;

  useEffect(() => {
    if (!fila) return;
    setV({ ...VACIO, ...fila });
    setError(null);
  }, [fila]);

  async function guardar() {
    setError(null);
    if (!v.ruta.trim()) { setError('Escribe el nombre de la ruta.'); return; }
    setEnviando(true);
    try {
      await api(editando ? `/combustible/matriz/${v.id}` : '/combustible/matriz', { method: editando ? 'PUT' : 'POST', body: v });
      haptic('success');
      toast(editando ? 'Ruta actualizada' : 'Ruta agregada a la matriz');
      await qc.invalidateQueries({ queryKey: ['operaciones', 'matriz'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const set = (k: keyof Vacio, val: string) => setV(prev => ({ ...prev, [k]: val }));

  return (
    <Sheet open={!!fila} onClose={() => !enviando && onClose()} title={editando ? `Editar ${v.ruta || 'ruta'}` : 'Nueva ruta'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Ruta" wide>{p => <TextInput {...p} value={v.ruta} onChange={e => set('ruta', e.target.value.toUpperCase())} />}</Field>
        <Field label="Sentido">
          {p => (
            <SelectInput {...p} value={v.sentido} onChange={e => set('sentido', e.target.value)}>
              <option value="IDA">IDA</option><option value="RETORNO">RETORNO</option>
            </SelectInput>
          )}
        </Field>
        <Field label="Configuración">{p => <TextInput {...p} value={v.confg} onChange={e => set('confg', e.target.value.toUpperCase())} />}</Field>
        <Field label="Motor">{p => <TextInput {...p} value={v.motor} onChange={e => set('motor', e.target.value)} />}</Field>
        <Field label="Km total">{p => <TextInput {...p} inputMode="decimal" value={String(v.km)} onChange={e => set('km', e.target.value)} />}</Field>
        {TRAMOS.map(t => (
          <Field key={t} label={`Consumo a ${ETIQUETA_TRAMO[t]}% carga`}>
            {p => <TextInput {...p} inputMode="decimal" value={String(v[t])} onChange={e => set(t, e.target.value)} />}
          </Field>
        ))}
      </div>
    </Sheet>
  );
}

// Importación desde Excel: los encabezados se pasan tal cual, igual que el clásico (el servidor los reconoce)
async function leerMatriz(archivo: File): Promise<Record<string, string | number>[]> {
  const { readSheet } = await import('read-excel-file/browser');
  const filas = (await readSheet(archivo)) as (string | number | boolean | Date | null)[][];
  if (filas.length < 2) throw new Error('El archivo no contiene filas de datos.');
  const encabezados = filas[0].map(h => String(h ?? '').trim());
  return filas.slice(1).filter(f => f.some(c => c !== null && c !== '')).map(f => {
    const o: Record<string, string | number> = {};
    encabezados.forEach((h, i) => { if (h) { const c = f[i]; o[h] = c == null ? '' : (c instanceof Date ? c.toISOString().slice(0, 10) : (c as string | number)); } });
    return o;
  });
}

export function MatrizRendimientoSheet({ open, onClose, puedeEditar }: { open: boolean; onClose: () => void; puedeEditar: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sentido, setSentido] = useState('');
  const [editar, setEditar] = useState<Vacio | null>(null);
  const [borrar, setBorrar] = useState<FilaMatriz | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [vaciar, setVaciar] = useState(false);
  const [importando, setImportando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [filasImp, setFilasImp] = useState<Record<string, string | number>[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matriz = useQuery({
    queryKey: ['operaciones', 'matriz'],
    enabled: open,
    queryFn: () => api<{ data?: FilaMatriz[] }>('/combustible/matriz').then(r => r.data ?? []),
    staleTime: 30_000,
  });

  const visibles = useMemo(() => (matriz.data ?? []).filter(f =>
    (!sentido || f.sentido === sentido) &&
    (!q || `${f.ruta} ${f.motor} ${f.confg}`.toUpperCase().includes(q.toUpperCase()))), [matriz.data, q, sentido]);

  async function eliminar() {
    if (!borrar) return;
    setBorrando(true);
    try {
      await api(`/combustible/matriz/${borrar.id}`, { method: 'DELETE' });
      haptic('success'); toast(`Ruta ${borrar.ruta} eliminada`);
      setBorrar(null);
      await qc.invalidateQueries({ queryKey: ['operaciones', 'matriz'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setBorrando(false); }
  }

  async function vaciarTodo() {
    setBorrando(true);
    try {
      await api('/combustible/matriz/vaciar-todo', { method: 'DELETE' });
      haptic('success'); toast('Matriz vaciada');
      setVaciar(false);
      await qc.invalidateQueries({ queryKey: ['operaciones', 'matriz'] });
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setBorrando(false); }
  }

  async function elegirArchivo(f: File | undefined) {
    if (!f) return;
    setArchivo(f); setFilasImp([]); setError(null); setLeyendo(true);
    try { setFilasImp(await leerMatriz(f)); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLeyendo(false); }
  }

  async function importar() {
    if (!filasImp.length) return;
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; message?: string; insertados?: number; error?: string }>('/combustible/matriz/importar', { method: 'POST', body: { items: filasImp } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo importar');
      haptic('success'); toast(r.message ?? `Se importaron ${r.insertados ?? filasImp.length} registros`);
      setImportando(false); setFilasImp([]); setArchivo(null);
      await qc.invalidateQueries({ queryKey: ['operaciones', 'matriz'] });
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <>
      <Sheet open={open && !editar && !importando} onClose={onClose} title="Matriz de rendimiento (D2)"
        footer={puedeEditar ? (
          <>
            <Button variant="secondary" icon={<Trash2 size={16} />} onClick={() => setVaciar(true)} disabled={!(matriz.data ?? []).length}>Vaciar</Button>
            <Button variant="secondary" icon={<FileSpreadsheet size={16} />} onClick={() => setImportando(true)}>Importar Excel</Button>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditar(VACIO)}>Nueva ruta</Button>
          </>
        ) : <Button variant="secondary" onClick={onClose}>Cerrar</Button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={q} onChange={setQ} placeholder="Ruta, motor o configuración…" />
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            {['', 'IDA', 'RETORNO'].map(s => (
              <button key={s || 'todos'} type="button" className={`chip${sentido === s ? ' chip--active' : ''}`} onClick={() => setSentido(s)}>{s || 'Todos'}</button>
            ))}
          </div>

          {matriz.isLoading ? <PageLoader /> : matriz.isError ? <Notice tone="error">{errorMessage(matriz.error)}</Notice>
            : visibles.length === 0 ? <EmptyState title="Sin rutas" icon={<FileSpreadsheet size={22} />}>Agrega rutas o importa el Excel de la matriz.</EmptyState> : (
            <div className="tarjeta__lista">
              {visibles.map(f => (
                <div key={f.id} className="dato" style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{f.ruta}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{f.sentido} · {f.motor} · {f.confg} · {num(f.km).toLocaleString('es-PE')} km</div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--s-1)' }}>
                    {puedeEditar && <Button variant="secondary" icon={<Pencil size={15} />} onClick={() => setEditar({ ...f })}>{''}</Button>}
                    {puedeEditar && <Button variant="secondary" icon={<Trash2 size={15} />} onClick={() => setBorrar(f)}>{''}</Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Sheet>

      <FormularioFila fila={editar} onClose={() => setEditar(null)} />

      <Sheet open={importando} onClose={() => !enviando && setImportando(false)} title="Importar matriz desde Excel"
        footer={<><Button variant="secondary" onClick={() => setImportando(false)} disabled={enviando}>Cancelar</Button>
          <Button variant="primary" onClick={importar} loading={enviando} disabled={!filasImp.length || leyendo}>
            {filasImp.length ? `Importar ${filasImp.length} filas` : 'Importar'}</Button></>}>
        <div className="form-grid">
          {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
          <Field label="Archivo Excel (.xlsx)" wide hint={archivo ? archivo.name : 'Primera hoja con los encabezados en la fila 1'}>
            {p => <TextInput {...p} type="file" accept=".xlsx,.xls,.csv" disabled={leyendo || enviando} onChange={e => elegirArchivo(e.target.files?.[0])} />}
          </Field>
          {leyendo && <div className="field field--wide"><Notice>Leyendo el archivo…</Notice></div>}
          {filasImp.length > 0 && <div className="field field--wide"><Notice tone="accent">Las filas se agregan a la matriz actual. Usa "Vaciar" antes si quieres empezar de cero.</Notice></div>}
        </div>
      </Sheet>

      <ConfirmSheet open={!!borrar} onClose={() => !borrando && setBorrar(null)} onConfirm={eliminar} loading={borrando}
        title={`¿Eliminar la ruta ${borrar?.ruta ?? ''}?`} message="Se quita de la matriz de rendimiento." confirmLabel="Eliminar" />
      <ConfirmSheet open={vaciar} onClose={() => !borrando && setVaciar(false)} onConfirm={vaciarTodo} loading={borrando}
        title="¿Vaciar toda la matriz?" message="Se eliminan todas las rutas y consumos teóricos. Esta acción no se puede deshacer." confirmLabel="Vaciar matriz" />
    </>
  );
}
