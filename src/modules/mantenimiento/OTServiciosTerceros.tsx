import './otServicios.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, ScrollText, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

// Servicios de terceros de una OT: las OC de servicio que el usuario agrega a mano. Solo estas suman al costo.
export interface ServicioOt {
  id: string; fecha: string | null; proveedor_nombre: string | null; moneda: string | null;
  total_pen: number | string | null; estado: string; numero_operacion?: string | null; ot_id?: string | null;
  /** 1 = la OC ya se agregó a la OT que dice ot_id */
  ot_servicio_agregado?: number | null;
  placa?: string | null;
  /** Qué se contrató: las líneas de la OC (o, si no tiene, el motivo) */
  descripcion?: string | null; motivo_entrada?: string | null;
}

const queServicio = (s: ServicioOt) => (s.descripcion || s.motivo_entrada || '').trim();

const n = (v: unknown) => Number(v) || 0;
const monto = (s: ServicioOt) => `${/DOL/i.test(String(s.moneda ?? '')) ? 'US$' : 'S/'} ${n(s.total_pen).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dia = (f: string | null) => (f ? String(f).slice(0, 10) : '—');

export function OTServiciosTerceros({ ot, puedeEditar, cerrada = false }: { ot: string; puedeEditar: boolean; cerrada?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [agregando, setAgregando] = useState(false);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [buscar, setBuscar] = useState('');
  // Por defecto solo salen los servicios de la placa de la OT y los que no tienen placa
  const [otrasPlacas, setOtrasPlacas] = useState(false);
  const [quitar, setQuitar] = useState<ServicioOt | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const agregados = useQuery<ServicioOt[]>({
    queryKey: ['mant', 'ot-servicios', ot],
    enabled: !!ot,
    queryFn: () => api<{ data: ServicioOt[] }>(`/taller/ot-servicios?ot=${encodeURIComponent(ot)}`).then(r => r.data ?? []),
    staleTime: 20_000,
  });
  const disponibles = useQuery<{ data: ServicioOt[]; placa: string | null; ocultas: number }>({
    queryKey: ['mant', 'ot-servicios-disponibles', ot, otrasPlacas],
    enabled: agregando && !!ot,
    queryFn: () => api<{ data?: ServicioOt[]; placa?: string | null; ocultas?: number }>(`/taller/ot-servicios-disponibles?ot=${encodeURIComponent(ot)}&todas=${otrasPlacas ? 1 : 0}`).then(r => ({ data: r.data ?? [], placa: r.placa ?? null, ocultas: r.ocultas ?? 0 })),
    staleTime: 0,
  });

  // Búsqueda: por proveedor, número de OC, fecha, estado, OT sugerida o monto (sin tildes ni mayúsculas)
  const limpio = (x: unknown) => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const filtradas = useMemo(() => {
    const q = limpio(buscar).trim();
    const todas = disponibles.data?.data ?? [];
    if (!q) return todas;
    return todas.filter(s => [s.proveedor_nombre, s.id, dia(s.fecha), s.estado, s.ot_id, queServicio(s), monto(s), s.numero_operacion].some(v => limpio(v).includes(q)));
  }, [disponibles.data, buscar]);
  const placaOT = disponibles.data?.placa ?? null;
  const normPlaca = (p: string | null | undefined) => String(p ?? '').toUpperCase().replace(/[\s-]/g, '');
  const deOtraPlaca = (s: ServicioOt) => !!placaOT && !!normPlaca(s.placa) && normPlaca(s.placa) !== placaOT;
  // Las OC que ya están en una OT salen en la lista, tachadas, y no se pueden marcar
  const yaAsignada = (s: ServicioOt) => Number(s.ot_servicio_agregado) === 1;
  const elegibles = filtradas.filter(s => !yaAsignada(s));
  const todasMarcadas = elegibles.length > 0 && elegibles.every(s => seleccion.includes(s.id));

  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: ['mant', 'ot-servicios'] });
    await qc.invalidateQueries({ queryKey: ['mant', 'ots'] });
  };

  async function agregar() {
    setOcupado(true);
    try {
      const r = await api<{ ok?: boolean; error?: string; agregados?: number }>('/taller/ot-servicios', { method: 'POST', body: { ot, ids: seleccion, otraPlaca: otrasPlacas } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo agregar');
      haptic('success'); toast(`${r.agregados ?? seleccion.length} servicio(s) agregado(s) a la OT`);
      setAgregando(false); setSeleccion([]);
      await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  async function confirmarQuitar() {
    if (!quitar) return;
    setOcupado(true);
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/taller/ot-servicios/${encodeURIComponent(quitar.id)}?ot=${encodeURIComponent(ot)}`, { method: 'DELETE' });
      if (r.ok === false) throw new Error(r.error || 'No se pudo quitar');
      haptic('success'); toast('Servicio quitado de la OT');
      setQuitar(null);
      await refrescar();
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setOcupado(false); }
  }

  const lista = agregados.data ?? [];
  const total = lista.reduce((s, x) => s + n(x.total_pen), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-2)' }}>
        <p className="tarjeta__grupo-titulo" style={{ margin: 0 }}>Servicios ({lista.length}) · S/ {total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        {puedeEditar && <Button variant="primary" icon={<Plus size={15} />} onClick={() => { setSeleccion([]); setOtrasPlacas(false); setAgregando(true); }}>Agregar servicio</Button>}
      </div>
      <p className="t-footnote c-secondary" style={{ margin: 0 }}>Solo suman al costo los servicios agregados aquí. Una OC de servicio procesada no entra a la OT hasta que la agregas.</p>

      {agregados.isLoading ? <PageLoader /> : agregados.isError ? <Notice tone="error">{errorMessage(agregados.error)}</Notice> : lista.length === 0 ? (
        <EmptyState icon={<ScrollText size={22} />} title="Sin servicios">Agrega las OC de servicio ya procesadas que correspondan a esta OT.</EmptyState>
      ) : (
        <div className="ots-tabla-wrap">
          <table className="ots-tabla">
            <thead>
              <tr>
                <th>Fecha</th><th>OC</th><th>Proveedor</th><th>Descripción del servicio</th><th className="ots-num">Monto</th><th>Estado</th><th><span className="ots-sr">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map(s => (
                <tr key={s.id}>
                  <td className="ots-mono">{dia(s.fecha)}</td>
                  <td className="ots-mono">{s.id}</td>
                  <td>{s.proveedor_nombre || 'Sin proveedor'}</td>
                  <td className="ots-desc">{queServicio(s) || '—'}</td>
                  <td className="ots-num ots-mono">{monto(s)}</td>
                  <td>{s.estado}{s.numero_operacion ? <small className="ots-op">Op. {s.numero_operacion}</small> : null}</td>
                  <td>
                    {puedeEditar && !cerrada && <Button variant="plain" iconOnly icon={<Trash2 size={14} />} aria-label={`Quitar ${s.id}`} title="Quitar de la OT" onClick={() => setQuitar(s)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={agregando} onClose={() => !ocupado && setAgregando(false)} title={`Agregar servicios a la OT ${ot}`} ancho
        footer={<><Button variant="secondary" onClick={() => setAgregando(false)} disabled={ocupado}>Cancelar</Button>
          <Button variant="primary" icon={<Check size={15} />} onClick={agregar} loading={ocupado} disabled={seleccion.length === 0}>Agregar {seleccion.length || ''}</Button></>}>
        {disponibles.isLoading ? <PageLoader /> : disponibles.isError ? <Notice tone="error">{errorMessage(disponibles.error)}</Notice> : (disponibles.data?.data ?? []).length === 0 && !otrasPlacas && !(disponibles.data?.ocultas) ? (
          <EmptyState icon={<ScrollText size={22} />} title="Nada para agregar">No hay OC de servicio procesadas sin agregar a una OT.</EmptyState>
        ) : (
          <div className="ots-elegir">
          <div className="ots-placa">
            <span>{placaOT ? <>Servicios de la placa <b>{placaOT}</b> y servicios sin placa.</> : 'Esta OT no tiene placa: salen todos los servicios.'}</span>
            {placaOT && (otrasPlacas || (disponibles.data?.ocultas ?? 0) > 0) && (
              <label className="ots-placa__otras">
                <input type="checkbox" checked={otrasPlacas} onChange={e => { setOtrasPlacas(e.target.checked); setSeleccion([]); }} />
                Incluir otras placas{!otrasPlacas && disponibles.data?.ocultas ? ` (${disponibles.data.ocultas} más)` : ''}
              </label>
            )}
          </div>
          <SearchField value={buscar} onChange={setBuscar} placeholder="Buscar por proveedor, OC, servicio, fecha o monto…" />
          {filtradas.length === 0 && <p className="ots-sin-res">Ninguna OC coincide con «{buscar}».</p>}
          <div className="ots-tabla-wrap ots-tabla-wrap--elegir">
            <table className="ots-tabla ots-tabla--elegir">
              <thead>
                <tr>
                  <th className="ots-check">
                    <input type="checkbox" aria-label="Elegir todas" checked={todasMarcadas} ref={el => { if (el) el.indeterminate = !todasMarcadas && elegibles.some(s => seleccion.includes(s.id)); }}
                      onChange={() => setSeleccion(prev => (todasMarcadas ? prev.filter(id => !elegibles.some(s => s.id === id)) : [...new Set([...prev, ...elegibles.map(s => s.id)])]))} />
                  </th>
                  <th>Fecha</th><th>OC</th><th>Proveedor</th><th>Descripción del servicio</th><th className="ots-num">Monto</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(s => {
                  const asignada = yaAsignada(s);
                  const marcado = !asignada && seleccion.includes(s.id);
                  const alternar = () => { if (!asignada) setSeleccion(prev => (marcado ? prev.filter(x => x !== s.id) : [...prev, s.id])); };
                  const enEstaOt = asignada && s.ot_id === ot;
                  return (
                    <tr key={s.id} className={asignada ? 'ots-fila--asignada' : marcado ? 'ots-fila--on' : undefined} onClick={alternar} aria-disabled={asignada || undefined}>
                      <td className="ots-check"><input type="checkbox" aria-label={asignada ? `${s.id} ya está asignada` : `Elegir ${s.id}`} checked={marcado} disabled={asignada} onChange={alternar} onClick={e => e.stopPropagation()} /></td>
                      <td className="ots-mono">{dia(s.fecha)}</td>
                      <td className="ots-mono">{s.id}</td>
                      <td className="ots-prov"><strong>{s.proveedor_nombre || 'Sin proveedor'}</strong>{deOtraPlaca(s) ? <small className="ots-otra">Placa {s.placa}</small> : null}</td>
                      <td className="ots-desc">{queServicio(s) || '—'}</td>
                      <td className="ots-num ots-mono">{monto(s)}</td>
                      <td className="ots-estado">
                        {asignada
                          ? <span className="ots-asignada" title="Esta OC ya está asignada y no se puede agregar de nuevo">{enEstaOt ? 'Ya está en esta OT' : `Ya asignada a ${s.ot_id || 'otra OT'}`}<small>No se puede agregar</small></span>
                          : s.estado}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </Sheet>

      <ConfirmSheet open={!!quitar} onClose={() => !ocupado && setQuitar(null)} loading={ocupado} onConfirm={confirmarQuitar}
        title={`¿Quitar la OC ${quitar?.id ?? ''} de la OT?`} message="Deja de sumar al costo de la OT y queda libre para agregarla a otra OT." confirmLabel="Quitar" />
    </div>
  );
}
