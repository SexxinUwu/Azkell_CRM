import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { Sheet, ConfirmSheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { ETIQUETA_PUNTO, usePuntos, type Punto } from './puntosApi';
import { useOpcionesUbigeo } from './ubigeos';

interface Form { cliente_nombre: string; tipo: Punto['tipo']; codigo: string; nombre: string; direccion: string; ubigeo: string; referencia: string }
const VACIO: Form = { cliente_nombre: '', tipo: 'CARGA', codigo: '', nombre: '', direccion: '', ubigeo: '', referencia: '' };

/** Catálogo de puntos de carga y descarga de cada cliente: se crean una vez y se eligen al registrar guías */
export function PuntosSheet({ open, onClose, puedeEditar }: { open: boolean; onClose: () => void; puedeEditar: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const puntos = usePuntos(open);
  const ubi = useOpcionesUbigeo();
  const clientes = useQuery({
    queryKey: ['directorio', 'clientes'], enabled: open, staleTime: 5 * 60_000,
    queryFn: () => api<unknown>('/clientes').then(r => (Array.isArray(r) ? r : ((r as { data?: unknown[] })?.data ?? [])) as { nombre?: string; razon_social?: string }[]),
  });
  const [f, setF] = useState<Form | null>(null);
  const [id, setId] = useState<number | null>(null);
  const [busca, setBusca] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [porEliminar, setPorEliminar] = useState<Punto | null>(null);

  const opcionesCliente = useMemo(() => {
    const n = new Set<string>();
    (clientes.data ?? []).forEach(c => { const t = (c.nombre ?? c.razon_social ?? '').trim(); if (t) n.add(t); });
    (puntos.data ?? []).forEach(p => n.add(p.cliente_nombre));
    return [...n].sort((a, b) => a.localeCompare(b)).map(v => ({ value: v, label: v }));
  }, [clientes.data, puntos.data]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (puntos.data ?? []).filter(p => !q || `${p.cliente_nombre} ${p.codigo ?? ''} ${p.nombre} ${p.direccion}`.toLowerCase().includes(q));
  }, [puntos.data, busca]);
  const porCliente = useMemo(() => {
    const m = new Map<string, Punto[]>();
    lista.forEach(p => m.set(p.cliente_nombre, [...(m.get(p.cliente_nombre) ?? []), p]));
    return [...m.entries()];
  }, [lista]);

  const set = (p: Partial<Form>) => setF(x => (x ? { ...x, ...p } : x));
  const nuevo = () => { setId(null); setF({ ...VACIO }); setError(null); };
  const editar = (p: Punto) => { setId(p.id); setF({ cliente_nombre: p.cliente_nombre, tipo: p.tipo, codigo: p.codigo ?? '', nombre: p.nombre, direccion: p.direccion, ubigeo: p.ubigeo ?? '', referencia: p.referencia ?? '' }); setError(null); };
  const cerrarForm = () => { setF(null); setId(null); setError(null); };

  async function guardar() {
    if (!f) return;
    if (!f.cliente_nombre.trim()) { setError('Elige o escribe el cliente.'); return; }
    if (!f.nombre.trim()) { setError('Escribe el nombre del punto.'); return; }
    if (!f.direccion.trim()) { setError('Escribe la dirección.'); return; }
    setGuardando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string; message?: string }>(id ? `/operaciones/puntos/${id}` : '/operaciones/puntos', { method: id ? 'PUT' : 'POST', body: f });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar el punto');
      haptic('success'); toast(r.message || 'Punto guardado');
      await qc.invalidateQueries({ queryKey: ['operaciones', 'puntos'] });
      cerrarForm();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  async function eliminar() {
    if (!porEliminar) return;
    setGuardando(true);
    try {
      const r = await api<{ ok?: boolean; error?: string; message?: string }>(`/operaciones/puntos/${porEliminar.id}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
      haptic('success'); toast('Punto eliminado');
      await qc.invalidateQueries({ queryKey: ['operaciones', 'puntos'] });
      setPorEliminar(null);
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setGuardando(false); }
  }

  return (
    <>
      <Sheet ancho open={open} onClose={() => !guardando && onClose()} title="Puntos de carga y descarga"
        footer={f
          ? <><Button variant="secondary" onClick={cerrarForm} disabled={guardando}>Cancelar</Button><Button variant="primary" onClick={guardar} loading={guardando}>Guardar punto</Button></>
          : <><Button variant="secondary" onClick={onClose}>Cerrar</Button>{puedeEditar && <Button variant="primary" icon={<Plus size={16} />} onClick={nuevo}>Nuevo punto</Button>}</>}>
        <div className="gr gr--compacto">
          {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

          {f ? (
            <section className="os-seccion">
              <h3 className="os-seccion__titulo">{id ? 'Editar punto' : 'Nuevo punto'}</h3>
              <div className="os-seccion__cuerpo">
                <Field label="Cliente *">
                  {p => <Combobox {...p} options={opcionesCliente} value={f.cliente_nombre || null} loading={clientes.isLoading} placeholder="Busca o escribe el cliente" createLabel="Usar este nombre"
                    onChange={v => set({ cliente_nombre: v ?? '' })} onCreate={t => set({ cliente_nombre: t.trim() })} />}
                </Field>
                <SegmentedControl block label="Tipo de punto" value={f.tipo} onChange={v => set({ tipo: v })} options={[{ value: 'CARGA', label: 'Punto de carga' }, { value: 'DESCARGA', label: 'Punto de descarga' }]} />
                <div className="gr__g4">
                  <Field label="Código (opcional)">{p => <TextInput {...p} value={f.codigo} placeholder="CD01" style={{ textTransform: 'uppercase' }} onChange={e => set({ codigo: e.target.value })} />}</Field>
                  <div className="gr__s3"><Field label="Nombre *">{p => <TextInput {...p} value={f.nombre} placeholder="CD Huachipa" onChange={e => set({ nombre: e.target.value })} />}</Field></div>
                </div>
                <Field label="Dirección *">{p => <TextInput {...p} value={f.direccion} onChange={e => set({ direccion: e.target.value })} />}</Field>
                <Field label="Distrito" hint="Opcional, pero SUNAT lo pide en la guía">
                  {p => <Combobox {...p} options={ubi.opciones} value={f.ubigeo || null} loading={ubi.cargando} placeholder="Busca el distrito" onChange={v => set({ ubigeo: v ?? '' })} />}
                </Field>
                <Field label="Referencia (opcional)">{p => <TextInput {...p} value={f.referencia} placeholder="Puerta, andén, horario…" onChange={e => set({ referencia: e.target.value })} />}</Field>
              </div>
            </section>
          ) : (
            <>
              <TextInput aria-label="Buscar punto" value={busca} placeholder="Buscar por cliente, código, nombre o dirección" onChange={e => setBusca(e.target.value)} />
              {puntos.isLoading ? <PageLoader /> : porCliente.length === 0 ? (
                <EmptyState icon={<MapPin size={22} />} title={busca ? 'Sin coincidencias' : 'Aún no hay puntos'}>
                  {busca ? 'Prueba con otra búsqueda.' : 'Crea los lugares de carga y descarga de tus clientes y elígelos al registrar una guía.'}
                </EmptyState>
              ) : porCliente.map(([cliente, ps]) => (
                <section key={cliente} className="os-seccion">
                  <h3 className="os-seccion__titulo">{cliente} <span className="gr__nota">· {ps.length} {ps.length === 1 ? 'punto' : 'puntos'}</span></h3>
                  <div className="os-seccion__cuerpo">
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {ps.map(p => (
                        <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="t-footnote" style={{ minWidth: 64, fontWeight: 700 }}>{ETIQUETA_PUNTO[p.tipo]}</span>
                          <span style={{ flex: 1 }}>
                            <strong>{p.codigo ? `${p.codigo} · ` : ''}{p.nombre}</strong><br />
                            <span className="t-footnote c-secondary">{p.direccion}{p.ubigeo && ubi.porCodigo.get(p.ubigeo) ? ` · ${ubi.porCodigo.get(p.ubigeo)!.distrito}` : ''}{p.referencia ? ` · ${p.referencia}` : ''}</span>
                          </span>
                          {puedeEditar && <Button variant="plain" size="sm" iconOnly icon={<Pencil size={15} />} aria-label="Editar punto" onClick={() => editar(p)} />}
                          {puedeEditar && <Button variant="plain" size="sm" iconOnly icon={<Trash2 size={15} />} aria-label="Eliminar punto" onClick={() => setPorEliminar(p)} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </Sheet>
      <ConfirmSheet open={!!porEliminar} onClose={() => !guardando && setPorEliminar(null)} onConfirm={eliminar} loading={guardando}
        title="¿Eliminar este punto?" message="Deja de ofrecerse al registrar guías. Las guías que ya lo usaron no cambian." confirmLabel="Eliminar" />
    </>
  );
}
