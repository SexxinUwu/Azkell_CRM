import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle, ClipboardCheck, SearchX, XCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';

interface OC {
  id: string | number;
  codigo_oc?: string;
  fecha?: string;
  proveedor?: string;
  proveedor_id?: number;
  estado?: string;
  moneda?: string;
  total_monto?: number | string;
  monto_total?: number | string;
  subtotal?: number | string;
  observaciones?: string;
  aprobado_por?: string;
  autoriza?: string;
  fecha_aprobacion?: string;
  tipo?: string;
  [key: string]: unknown;
}

function estadoColor(estado: string): string {
  const s = (estado ?? '').toLowerCase();
  if (s.includes('aprobad') || s.includes('autoriza')) return 'green';
  if (s.includes('rechaz') || s.includes('anulad')) return 'neutral';
  if (s.includes('pendiente') || s.includes('registrad')) return 'amber';
  if (s.includes('observ')) return 'blue';
  return 'neutral';
}

function fmtMonto(v: unknown, moneda = 'PEN'): string {
  const n = Number(v);
  if (!v || isNaN(n)) return '—';
  const sym = moneda === 'USD' ? '$' : 'S/';
  return `${sym} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function esPendiente(o: OC): boolean {
  const s = (o.estado ?? '').toLowerCase();
  return s.includes('pendiente') || s.includes('registrad') || s === '' || !o.estado;
}

export function AprobacionesOCPage() {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [accion, setAccion] = useState<{ id: string | number; tipo: 'aprobar' | 'rechazar' } | null>(null);
  const [comentario, setComentario] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const { data, isLoading, isError, error } = useQuery<OC[]>({
    queryKey: ['gerencia', 'aprobaciones-oc'],
    queryFn: () =>
      api('/almacen/entradas').then((r: unknown) => {
        if (Array.isArray(r)) return r as OC[];
        return (r as { data?: OC[] }).data ?? [];
      }),
    staleTime: 30_000,
  });

  const lista = data ?? [];
  const pendientes = lista.filter(esPendiente);
  const procesadas = lista.filter(o => !esPendiente(o));

  const visibles = useMemo(() => {
    const fuente = busqueda ? lista : pendientes;
    if (!busqueda) return fuente;
    const q = busqueda.toUpperCase();
    return lista.filter(o =>
      String(o.codigo_oc ?? o.id ?? '').toUpperCase().includes(q) ||
      String(o.proveedor ?? '').toUpperCase().includes(q) ||
      String(o.estado ?? '').toUpperCase().includes(q)
    );
  }, [lista, pendientes, busqueda]);

  async function ejecutarAccion() {
    if (!accion) return;
    setProcesando(true);
    try {
      const nuevoEstado = accion.tipo === 'aprobar' ? 'Aprobado' : 'Rechazado';
      await api(`/almacen/entradas/${accion.id}/estado`, {
        method: 'PUT',
        body: { estado: nuevoEstado, comentario, usuario: localStorage.getItem('fleet_user') ?? 'Gerencia' },
      });
      setMsg({ tipo: 'ok', texto: `OC ${nuevoEstado.toLowerCase()} correctamente.` });
      qc.invalidateQueries({ queryKey: ['gerencia', 'aprobaciones-oc'] });
      setAccion(null);
      setComentario('');
    } catch (e) {
      setMsg({ tipo: 'error', texto: errorMessage(e) });
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Gerencia"
        title="Aprobación de compras"
        subtitle={pendientes.length > 0 ? `${pendientes.length} pendientes de aprobación` : 'Sin pendientes'}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('gerencia/aprobaciones-oc') },
          ]} />
        }
      />

      {msg && (
        <div style={{ cursor: 'pointer' }} onClick={() => setMsg(null)}>
          <Notice tone={msg.tipo === 'ok' ? 'success' : 'error'}>{msg.texto}</Notice>
        </div>
      )}
      {isError && <Notice tone="error">{errorMessage(error)}</Notice>}

      {isLoading ? <PageLoader /> : lista.length === 0 ? (
        <EmptyState icon={<ClipboardCheck size={28} />} title="Sin órdenes de compra">
          No hay registros disponibles.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            {[
              { label: 'Pendientes', valor: pendientes.length, color: pendientes.length > 0 ? 'var(--amber-ink)' : 'var(--green-ink)' },
              { label: 'Aprobadas', valor: procesadas.filter(o => (o.estado ?? '').toLowerCase().includes('aprobad')).length, color: 'var(--green-ink)' },
              { label: 'Total', valor: lista.length, color: 'var(--label-1)' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--fill-1)', borderRadius: 8, padding: '10px 14px', flex: 1, textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.25rem', color: k.color }}>{k.valor}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', fontWeight: 600 }}>{k.label}</div>
              </div>
            ))}
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar por código, proveedor o estado…" />

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
              <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Limpiar</button>
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '38rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--separator)' }}>
                    {['Código', 'Proveedor', 'Fecha', 'Monto', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((o, i) => {
                    const color = estadoColor(String(o.estado ?? ''));
                    const monto = o.total_monto ?? o.monto_total ?? o.subtotal;
                    const isPend = esPendiente(o);
                    return (
                      <tr key={String(o.id || i)} style={{ borderBottom: '1px solid var(--separator)' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {o.codigo_oc ?? `#${o.id}`}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '0.85rem' }}>{o.proveedor ?? '—'}</td>
                        <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--label-2)', whiteSpace: 'nowrap' }}>
                          {String(o.fecha ?? '').split('T')[0] || '—'}
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {fmtMonto(monto, String(o.moneda ?? 'PEN'))}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span className={`ot-estado ot-estado--${color}`}>{o.estado ?? 'Pendiente'}</span>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {isPend && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button type="button"
                                onClick={() => { setAccion({ id: o.id, tipo: 'aprobar' }); setMsg(null); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: 'var(--green-tint)', color: 'var(--green-ink)', border: '1px solid var(--green-ink)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                <CheckCircle size={13} /> Aprobar
                              </button>
                              <button type="button"
                                onClick={() => { setAccion({ id: o.id, tipo: 'rechazar' }); setMsg(null); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: 'var(--fill-2)', color: 'var(--label-2)', border: '1px solid var(--separator)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                <XCircle size={13} /> Rechazar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmación */}
      {accion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
          <div style={{ background: 'var(--bg-1)', borderRadius: 14, padding: 'var(--s-4)', maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 'var(--s-2)' }}>
              {accion.tipo === 'aprobar' ? '✅ Aprobar OC' : '❌ Rechazar OC'}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--label-2)', marginBottom: 'var(--s-3)' }}>
              {accion.tipo === 'aprobar'
                ? 'Se marcará esta orden de compra como aprobada.'
                : 'Se marcará como rechazada. Esta acción se registrará en el sistema.'}
            </div>
            <div style={{ marginBottom: 'var(--s-3)' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--label-2)', display: 'block', marginBottom: 4 }}>
                Comentario (opcional)
              </label>
              <textarea
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                placeholder="Observación o motivo…"
                rows={2}
                style={{ width: '100%', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', padding: '8px 10px', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setAccion(null); setComentario(''); }}
                style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-2)', color: 'var(--label-1)', fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button type="button" onClick={ejecutarAccion} disabled={procesando}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: accion.tipo === 'aprobar' ? 'var(--green-ink)' : 'var(--accent)', color: '#fff', fontWeight: 700, cursor: procesando ? 'not-allowed' : 'pointer', opacity: procesando ? 0.6 : 1 }}>
                {procesando ? 'Procesando…' : accion.tipo === 'aprobar' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
