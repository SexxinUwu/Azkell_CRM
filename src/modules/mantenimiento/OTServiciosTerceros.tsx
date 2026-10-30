import './otServicios.css';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, ScrollText, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice } from '../../core/ui/Display';
import { ConfirmSheet, Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

// Servicios de terceros de una OT: las OC de servicio que el usuario agrega a mano. Solo estas suman al costo.
export interface ServicioOt {
  id: string; fecha: string | null; proveedor_nombre: string | null; moneda: string | null;
  total_pen: number | string | null; estado: string; numero_operacion?: string | null; ot_id?: string | null;
}

const n = (v: unknown) => Number(v) || 0;
const monto = (s: ServicioOt) => `${/DOL/i.test(String(s.moneda ?? '')) ? 'US$' : 'S/'} ${n(s.total_pen).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dia = (f: string | null) => (f ? String(f).slice(0, 10) : '—');

export function OTServiciosTerceros({ ot, puedeEditar }: { ot: string; puedeEditar: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [agregando, setAgregando] = useState(false);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [quitar, setQuitar] = useState<ServicioOt | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const agregados = useQuery<ServicioOt[]>({
    queryKey: ['mant', 'ot-servicios', ot],
    enabled: !!ot,
    queryFn: () => api<{ data: ServicioOt[] }>(`/taller/ot-servicios?ot=${encodeURIComponent(ot)}`).then(r => r.data ?? []),
    staleTime: 20_000,
  });
  const disponibles = useQuery<ServicioOt[]>({
    queryKey: ['mant', 'ot-servicios-disponibles', ot],
    enabled: agregando && !!ot,
    queryFn: () => api<{ data: ServicioOt[] }>(`/taller/ot-servicios-disponibles?ot=${encodeURIComponent(ot)}`).then(r => r.data ?? []),
    staleTime: 0,
  });

  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: ['mant', 'ot-servicios'] });
    await qc.invalidateQueries({ queryKey: ['mant', 'ordenes-trabajo'] });
  };

  async function agregar() {
    setOcupado(true);
    try {
      const r = await api<{ ok?: boolean; error?: string; agregados?: number }>('/taller/ot-servicios', { method: 'POST', body: { ot, ids: seleccion } });
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
        {puedeEditar && <Button variant="primary" icon={<Plus size={15} />} onClick={() => { setSeleccion([]); setAgregando(true); }}>Agregar servicio</Button>}
      </div>
      <p className="t-footnote c-secondary" style={{ margin: 0 }}>Solo suman al costo los servicios agregados aquí. Una OC de servicio procesada no entra a la OT hasta que la agregas.</p>

      {agregados.isLoading ? <PageLoader /> : agregados.isError ? <Notice tone="error">{errorMessage(agregados.error)}</Notice> : lista.length === 0 ? (
        <EmptyState icon={<ScrollText size={22} />} title="Sin servicios">Agrega las OC de servicio ya procesadas que correspondan a esta OT.</EmptyState>
      ) : (
        <div className="ots-tabla-wrap">
          <table className="ots-tabla">
            <thead>
              <tr>
                <th>Proveedor</th><th>OC</th><th>Fecha</th><th>Estado</th><th>Operación</th><th className="ots-num">Monto</th><th><span className="ots-sr">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map(s => (
                <tr key={s.id}>
                  <td>{s.proveedor_nombre || 'Sin proveedor'}</td>
                  <td className="ots-mono">{s.id}</td>
                  <td className="ots-mono">{dia(s.fecha)}</td>
                  <td>{s.estado}</td>
                  <td className="ots-mono">{s.numero_operacion || '—'}</td>
                  <td className="ots-num ots-mono">{monto(s)}</td>
                  <td>
                    {puedeEditar && <Button variant="plain" iconOnly icon={<Trash2 size={14} />} aria-label={`Quitar ${s.id}`} title="Quitar de la OT" onClick={() => setQuitar(s)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={agregando} onClose={() => !ocupado && setAgregando(false)} title={`Agregar servicios a la OT ${ot}`}
        footer={<><Button variant="secondary" onClick={() => setAgregando(false)} disabled={ocupado}>Cancelar</Button>
          <Button variant="primary" icon={<Check size={15} />} onClick={agregar} loading={ocupado} disabled={seleccion.length === 0}>Agregar {seleccion.length || ''}</Button></>}>
        {disponibles.isLoading ? <PageLoader /> : disponibles.isError ? <Notice tone="error">{errorMessage(disponibles.error)}</Notice> : (disponibles.data ?? []).length === 0 ? (
          <EmptyState icon={<ScrollText size={22} />} title="Nada para agregar">No hay OC de servicio procesadas sin agregar a una OT.</EmptyState>
        ) : (
          <div className="tarjeta__lista">
            {(disponibles.data ?? []).map(s => {
              const marcado = seleccion.includes(s.id);
              return (
                <label key={s.id} className="dato" style={{ alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={marcado} onChange={() => setSeleccion(prev => (marcado ? prev.filter(x => x !== s.id) : [...prev, s.id]))} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{s.proveedor_nombre || 'Sin proveedor'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>OC {s.id} · {dia(s.fecha)} · {s.estado}{s.ot_id ? ` · sugerida para ${s.ot_id}` : ''}</div>
                  </div>
                  <span className="t-numeric">{monto(s)}</span>
                </label>
              );
            })}
          </div>
        )}
      </Sheet>

      <ConfirmSheet open={!!quitar} onClose={() => !ocupado && setQuitar(null)} loading={ocupado} onConfirm={confirmarQuitar}
        title={`¿Quitar la OC ${quitar?.id ?? ''} de la OT?`} message="Deja de sumar al costo de la OT. Puedes volver a agregarla cuando quieras." confirmLabel="Quitar" />
    </div>
  );
}
