import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, RefreshCw, Trash2, Truck } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { Field, SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { usePlacas } from '../placas/api';

interface Base {
  id: number; fecha: string; corte: string; corte_hora: string | null; placa_camion: string | null; placa_carreta: string | null;
  conductor: string | null; zona: string | null; estado: string | null; observacion: string | null; usuario: string | null;
}

const CORTES = ['Corte 1', 'Corte 2'];
const ZONAS = ['Base', 'Mantenimiento', 'Lavado'];
const ESTADOS = ['Cargado', 'Con Devolución', 'Vacío', 'En Ruta'];
const dia = (s?: string | null) => (s ? String(s).slice(0, 10) : '');
const hoy = () => new Date().toISOString().slice(0, 10);

/** Corte vigente: Corte 1 de 05:00 a 16:59, Corte 2 de 17:00 a 04:59 */
const corteActual = () => { const h = new Date().getHours(); return h >= 5 && h < 17 ? 'Corte 1' : 'Corte 2'; };

const colorEstado = (e: string | null) => ({ Cargado: 'green', 'Con Devolución': 'amber', 'Vacío': 'gray', 'En Ruta': 'accent' }[e ?? ''] ?? 'gray');

// Registro de unidades presentes en base, por fecha y corte.
export function UnidadesBase() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [fecha, setFecha] = useState(hoy());
  const [corte, setCorte] = useState('ALL');
  const [estado, setEstado] = useState('ALL');
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState<{ reg: Base | null } | null>(null);
  const [porEliminar, setPorEliminar] = useState<Base | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const q = useQuery<Base[]>({
    queryKey: ['personas', 'unidades-base', fecha, corte, estado],
    queryFn: () => {
      const p = new URLSearchParams();
      if (fecha) p.set('fecha', fecha);
      p.set('corte', corte); p.set('estado', estado);
      return api<{ data?: Base[] }>(`/seguridad/unidades-base?${p}`).then(r => r.data ?? []);
    },
    staleTime: 15_000,
  });

  const t = busqueda.trim().toUpperCase();
  const lista = (q.data ?? []).filter(r => !t || [r.placa_camion, r.placa_carreta, r.conductor, r.zona, r.observacion].some(x => String(x ?? '').toUpperCase().includes(t)));
  const puedeEditar = can('seg_unidades.crear', 'seguridad_unidades.crear', 'seg_unidades.editar');
  const refrescar = () => qc.invalidateQueries({ queryKey: ['personas', 'unidades-base'] });

  async function sincronizar() {
    setOcupado(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>('/seguridad/unidades-base/sincronizar-corte', { method: 'POST', body: { fecha: hoy(), corte: corteActual() } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo sincronizar');
      haptic('success'); toast(`Sincronizado el ${corteActual()}`); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function eliminar() {
    if (!porEliminar) return;
    setOcupado(true);
    try {
      await api(`/seguridad/unidades-base/${porEliminar.id}`, { method: 'DELETE' });
      haptic('success'); toast('Registro eliminado'); setPorEliminar(null); await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="aud-fecha"><span>Fecha</span><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
        <SelectInput value={corte} onChange={e => setCorte(e.target.value)} aria-label="Corte" style={{ width: 'auto' }}>
          <option value="ALL">Todos los cortes</option>{CORTES.map(c => <option key={c} value={c}>{c}</option>)}
        </SelectInput>
        <SelectInput value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado" style={{ width: 'auto' }}>
          <option value="ALL">Todos los estados</option>{ESTADOS.map(c => <option key={c} value={c}>{c}</option>)}
        </SelectInput>
        {puedeEditar && (
          <>
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={sincronizar} loading={ocupado}>Sincronizar {corteActual()}</Button>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setForm({ reg: null })}>Agregar unidad</Button>
          </>
        )}
      </div>
      <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, conductor, zona…" />

      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : lista.length === 0 ? (
        <EmptyState icon={<Truck size={22} />} title="Sin unidades en este corte">Usa <strong>Sincronizar</strong> o agrega una unidad.</EmptyState>
      ) : (
        <>
          <p className="t-footnote c-secondary">{lista.length} unidades</p>
          <div className="tarjeta__lista">
            {lista.map(r => (
              <div key={r.id} className="mov-fila" style={{ cursor: puedeEditar ? 'pointer' : undefined }} onClick={puedeEditar ? () => setForm({ reg: r }) : undefined}>
                <div className="mov-fila__icon" style={{ background: `var(--${colorEstado(r.estado)}-tint)`, color: `var(--${colorEstado(r.estado)}-ink)` }}><Truck size={16} /></div>
                <div className="mov-fila__cuerpo">
                  <span className="mov-fila__titulo">{[r.placa_camion, r.placa_carreta].filter(Boolean).join(' + ')}{r.conductor ? ` · ${r.conductor}` : ''}</span>
                  <span className="mov-fila__sub">{[r.corte, r.zona, r.observacion].filter(Boolean).join(' · ')}</span>
                </div>
                <div className="mov-fila__derecha">
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${colorEstado(r.estado)}-ink)` }}>{r.estado}</span>
                </div>
                {puedeEditar && (
                  <button type="button" className="placas-limpiar" style={{ color: 'var(--red-ink)', marginLeft: 'var(--s-2)' }} aria-label="Eliminar"
                    onClick={e => { e.stopPropagation(); setPorEliminar(r); }}><Trash2 size={16} /></button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <FormBase abierto={form} fechaInicial={fecha} usuario={user?.name ?? ''} onClose={() => setForm(null)} onGuardado={refrescar} />
      <ConfirmSheet open={!!porEliminar} onClose={() => !ocupado && setPorEliminar(null)} onConfirm={eliminar} loading={ocupado}
        title="¿Eliminar este registro?" message={porEliminar ? `${porEliminar.placa_camion ?? ''} ${porEliminar.placa_carreta ?? ''} · ${porEliminar.corte}` : ''} confirmLabel="Eliminar" />
    </div>
  );
}

function FormBase({ abierto, fechaInicial, usuario, onClose, onGuardado }: {
  abierto: { reg: Base | null } | null; fechaInicial: string; usuario: string; onClose: () => void; onGuardado: () => Promise<unknown>;
}) {
  const toast = useToast();
  const placas = usePlacas();
  const [v, setV] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reg = abierto?.reg ?? null;

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setV({
      fecha: dia(reg?.fecha) || fechaInicial, corte: reg?.corte ?? corteActual(), placa_camion: reg?.placa_camion ?? '', placa_carreta: reg?.placa_carreta ?? '',
      conductor: reg?.conductor ?? '', zona: reg?.zona ?? 'Base', estado: reg?.estado ?? 'Cargado', observacion: reg?.observacion ?? '',
    });
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));
  const camiones = (placas.data ?? []).filter(p => p.motora).map(p => p.placa);
  const carretas = (placas.data ?? []).filter(p => !p.motora).map(p => p.placa);

  async function guardar() {
    if (!v.placa_camion.trim() && !v.placa_carreta.trim()) { setError('Indica al menos una placa (camión o carreta).'); return; }
    setEnviando(true); setError(null);
    try {
      const body = { ...v, usuario };
      const r = reg
        ? await api<{ ok?: boolean; error?: string }>(`/seguridad/unidades-base/${reg.id}`, { method: 'PUT', body })
        : await api<{ ok?: boolean; error?: string }>('/seguridad/unidades-base', { method: 'POST', body });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast(reg ? 'Registro actualizado' : 'Unidad agregada');
      await onGuardado(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const sel = (k: string, label: string, ops: string[]) => (
    <Field label={label}>{p => <SelectInput {...p} value={v[k] ?? ''} onChange={e => set(k, e.target.value)}>{[...new Set([...ops, ...(v[k] ? [v[k]] : [])])].map(o => <option key={o} value={o}>{o}</option>)}</SelectInput>}</Field>
  );

  return (
    <Sheet open={!!abierto} onClose={() => !enviando && onClose()} title={reg ? 'Editar unidad en base' : 'Agregar unidad en base'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <datalist id="ub-camiones">{camiones.map(x => <option key={x} value={x} />)}</datalist>
        <datalist id="ub-carretas">{carretas.map(x => <option key={x} value={x} />)}</datalist>
        <Field label="Fecha">{p => <TextInput {...p} type="date" value={v.fecha ?? ''} onChange={e => set('fecha', e.target.value)} />}</Field>
        {sel('corte', 'Corte', CORTES)}
        <Field label="Camión">{p => <TextInput {...p} list="ub-camiones" value={v.placa_camion ?? ''} onChange={e => set('placa_camion', e.target.value.toUpperCase())} />}</Field>
        <Field label="Carreta">{p => <TextInput {...p} list="ub-carretas" value={v.placa_carreta ?? ''} onChange={e => set('placa_carreta', e.target.value.toUpperCase())} />}</Field>
        <Field label="Conductor" wide>{p => <TextInput {...p} value={v.conductor ?? ''} onChange={e => set('conductor', e.target.value)} />}</Field>
        {sel('zona', 'Zona', ZONAS)}
        {sel('estado', 'Estado', ESTADOS)}
        <Field label="Observación" wide>{p => <TextInput {...p} value={v.observacion ?? ''} onChange={e => set('observacion', e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}
