import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle, ClipboardCheck, SearchX, XCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { formatFechaPe, formatMoneda } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';

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
  return !v || isNaN(n) ? '—' : formatMoneda(n, moneda);
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
  const [filtro, setFiltro] = useState<'pendientes' | 'aprobadas' | 'todas'>('pendientes');
  const [errMotivo, setErrMotivo] = useState<string | undefined>();

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
    const aprobadas = procesadas.filter(o => (o.estado ?? '').toLowerCase().includes('aprobad'));
    const base = filtro === 'pendientes' ? pendientes : filtro === 'aprobadas' ? aprobadas : lista;
    const fuente = busqueda ? lista : base;
    if (!busqueda) return fuente;
    const q = busqueda.toUpperCase();
    return lista.filter(o =>
      String(o.codigo_oc ?? o.id ?? '').toUpperCase().includes(q) ||
      String(o.proveedor ?? '').toUpperCase().includes(q) ||
      String(o.estado ?? '').toUpperCase().includes(q)
    );
  }, [lista, pendientes, procesadas, busqueda, filtro]);

  async function ejecutarAccion() {
    if (!accion) return;
    if (accion.tipo === 'rechazar' && !comentario.trim()) { setErrMotivo('Escribe el motivo del rechazo.'); haptic('warning'); return; }
    setProcesando(true);
    try {
      const nuevoEstado = accion.tipo === 'aprobar' ? 'Aprobado' : 'Rechazado';
      await api(`/almacen/entradas/${accion.id}/estado`, {
        method: 'PUT',
        body: { estado: nuevoEstado, comentario, usuario: localStorage.getItem('fleet_user') ?? 'Gerencia' },
      });
      setMsg({ tipo: 'ok', texto: `OC ${nuevoEstado.toLowerCase()} correctamente.` });
      haptic(accion.tipo === 'aprobar' ? 'success' : 'warning');
      qc.invalidateQueries({ queryKey: ['gerencia', 'aprobaciones-oc'] });
      setAccion(null);
      setComentario('');
    } catch (e) {
      setMsg({ tipo: 'error', texto: errorMessage(e) });
      haptic('warning');
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
                    {/* KPIs: tocarlos filtra la lista */}
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
              <button key="pendientes" type="button" className="pressable" aria-pressed={filtro === 'pendientes'}
                onClick={() => { haptic('selection'); setFiltro('pendientes'); }}
                style={{ background: 'var(--fill-1)', borderRadius: 8, padding: '10px 14px', flex: 1, textAlign: 'center', cursor: 'pointer', border: filtro === 'pendientes' ? '2px solid var(--ink)' : '2px solid transparent' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.25rem', color: 'var(--amber-ink)' }}>{pendientes.length}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', fontWeight: 600 }}>Pendientes</div>
              </button>
              <button key="aprobadas" type="button" className="pressable" aria-pressed={filtro === 'aprobadas'}
                onClick={() => { haptic('selection'); setFiltro('aprobadas'); }}
                style={{ background: 'var(--fill-1)', borderRadius: 8, padding: '10px 14px', flex: 1, textAlign: 'center', cursor: 'pointer', border: filtro === 'aprobadas' ? '2px solid var(--ink)' : '2px solid transparent' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.25rem', color: 'var(--green-ink)' }}>{procesadas.filter(o => (o.estado ?? '').toLowerCase().includes('aprobad')).length}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', fontWeight: 600 }}>Aprobadas</div>
              </button>
              <button key="todas" type="button" className="pressable" aria-pressed={filtro === 'todas'}
                onClick={() => { haptic('selection'); setFiltro('todas'); }}
                style={{ background: 'var(--fill-1)', borderRadius: 8, padding: '10px 14px', flex: 1, textAlign: 'center', cursor: 'pointer', border: filtro === 'todas' ? '2px solid var(--ink)' : '2px solid transparent' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.25rem', color: 'var(--label-1)' }}>{lista.length}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', fontWeight: 600 }}>Total</div>
              </button>
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
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--label-1)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {o.codigo_oc ?? `#${o.id}`}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '0.85rem' }}>{o.proveedor ?? '—'}</td>
                        <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--label-2)', whiteSpace: 'nowrap' }}>
                          {formatFechaPe(o.fecha)}
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
                                className="pressable"
                                onClick={() => { haptic('selection'); setAccion({ id: o.id, tipo: 'aprobar' }); setMsg(null); setErrMotivo(undefined); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: 'var(--green-tint)', color: 'var(--green-ink)', border: '1px solid var(--green-ink)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                <CheckCircle size={13} /> Aprobar
                              </button>
                              <button type="button"
                                className="pressable"
                                onClick={() => { haptic('selection'); setAccion({ id: o.id, tipo: 'rechazar' }); setMsg(null); setErrMotivo(undefined); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: 'var(--red-tint)', color: 'var(--red-ink)', border: '1px solid var(--red-ink)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
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
      <Sheet
        open={!!accion}
        onClose={() => { setAccion(null); setComentario(''); }}
        title={accion?.tipo === 'aprobar' ? 'Aprobar OC' : 'Rechazar OC'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAccion(null); setComentario(''); }}>Cancelar</Button>
            <Button variant={accion?.tipo === 'aprobar' ? 'primary' : 'danger'} onClick={ejecutarAccion} loading={procesando}>
              {accion?.tipo === 'aprobar' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
            </Button>
          </>
        }
      >
        <div>
          <Field label={accion?.tipo === 'rechazar' ? 'Motivo del rechazo' : 'Comentario (opcional)'} error={errMotivo}>
            {p => (
              <textarea {...p} value={comentario} onChange={e => { setComentario(e.target.value); setErrMotivo(undefined); }}
                placeholder="Observación o motivo…" rows={3} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', padding: '8px 10px', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }} />
            )}
          </Field>
        </div>
      </Sheet>
    </Page>
  );
}
