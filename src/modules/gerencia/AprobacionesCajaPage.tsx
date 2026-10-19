import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle, Coins, SearchX, XCircle } from 'lucide-react';
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

interface CajaMov {
  id: string | number;
  fecha?: string;
  conductor?: string;
  placa?: string;
  motivo?: string;
  sub_motivo?: string;
  importe_total?: number | string;
  moneda?: string;
  tipo_movimiento?: string;
  persona?: string;
  descripcion?: string;
  estado?: string;
  orden_viaje?: string;
  usuario_creacion?: string;
  usuario_aprobacion?: string;
  [key: string]: unknown;
}

function estadoColor(estado: string): string {
  const s = (estado ?? '').toLowerCase();
  if (s === 'aprobado') return 'green';
  if (s === 'anulado') return 'neutral';
  if (s === 'procesado') return 'blue';
  if (s === 'pendiente' || s === 'registrado') return 'amber';
  return 'amber';
}

function esPendiente(m: CajaMov): boolean {
  const s = (m.estado ?? '').toUpperCase();
  return s === 'PENDIENTE' || s === 'REGISTRADO' || s === '';
}

function fmtMonto(v: unknown, moneda = 'PEN'): string {
  const n = Number(v);
  return !v || isNaN(n) ? '—' : formatMoneda(n, moneda);
}

export function AprobacionesCajaPage() {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [soloBusqueda, setSoloBusqueda] = useState(false);
  const [accion, setAccion] = useState<{ id: string | number; tipo: 'aprobar' | 'anular' } | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [filtro, setFiltro] = useState<'pendientes' | 'aprobados' | 'todos'>('pendientes');
  const [errMotivo, setErrMotivo] = useState<string | undefined>();

  const { data, isLoading, isError, error } = useQuery<CajaMov[]>({
    queryKey: ['gerencia', 'aprobaciones-caja'],
    queryFn: () =>
      api('/tesoreria/caja').then((r: unknown) => {
        if (Array.isArray(r)) return r as CajaMov[];
        return (r as { data?: CajaMov[] }).data ?? [];
      }),
    staleTime: 30_000,
  });

  const lista = data ?? [];
  const pendientes = lista.filter(esPendiente);

  const visibles = useMemo(() => {
    const aprobados = lista.filter(m => (m.estado ?? '').toUpperCase() === 'APROBADO');
    const base = filtro === 'pendientes' ? pendientes : filtro === 'aprobados' ? aprobados : lista;
    const fuente = soloBusqueda || busqueda ? lista : base;
    if (!busqueda) return fuente;
    const q = busqueda.toUpperCase();
    return lista.filter(m =>
      String(m.conductor ?? '').toUpperCase().includes(q) ||
      String(m.placa ?? '').toUpperCase().includes(q) ||
      String(m.motivo ?? '').toUpperCase().includes(q) ||
      String(m.orden_viaje ?? '').toUpperCase().includes(q) ||
      String(m.persona ?? '').toUpperCase().includes(q)
    );
  }, [lista, pendientes, busqueda, soloBusqueda, filtro]);

  async function ejecutarAccion() {
    if (!accion) return;
    if (accion.tipo === 'anular' && !motivoAnulacion.trim()) { setErrMotivo('Escribe el motivo de la anulación.'); haptic('warning'); return; }
    setProcesando(true);
    try {
      const endpoint = accion.tipo === 'aprobar'
        ? `/tesoreria/caja/${accion.id}/aprobar`
        : `/tesoreria/caja/${accion.id}/anular`;
      await api(endpoint, {
        method: 'POST',
        body: accion.tipo === 'anular'
          ? { motivo: motivoAnulacion.trim(), usuario_anulacion: localStorage.getItem('fleet_user') ?? 'Gerencia' }
          : { usuario_aprobacion: localStorage.getItem('fleet_user') ?? 'Gerencia' },
      });
      setMsg({ tipo: 'ok', texto: `Movimiento ${accion.tipo === 'aprobar' ? 'aprobado' : 'anulado'} correctamente.` });
      haptic(accion.tipo === 'aprobar' ? 'success' : 'warning');
      qc.invalidateQueries({ queryKey: ['gerencia', 'aprobaciones-caja'] });
      setAccion(null);
      setMotivoAnulacion('');
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
        title="Aprobación de caja"
        subtitle={pendientes.length > 0 ? `${pendientes.length} pendientes de aprobación` : 'Sin pendientes'}
        actions={
          <MenuOtros opciones={[
            { label: 'Ver todos los registros', icon: <Coins size={17} />, onSelect: () => setSoloBusqueda(s => !s) },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('gerencia/aprobaciones-caja') },
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
        <EmptyState icon={<Coins size={28} />} title="Sin movimientos de caja">
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
              <button key="aprobados" type="button" className="pressable" aria-pressed={filtro === 'aprobados'}
                onClick={() => { haptic('selection'); setFiltro('aprobados'); }}
                style={{ background: 'var(--fill-1)', borderRadius: 8, padding: '10px 14px', flex: 1, textAlign: 'center', cursor: 'pointer', border: filtro === 'aprobados' ? '2px solid var(--ink)' : '2px solid transparent' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.25rem', color: 'var(--green-ink)' }}>{lista.filter(m => (m.estado ?? '').toUpperCase() === 'APROBADO').length}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', fontWeight: 600 }}>Aprobados</div>
              </button>
              <button key="todos" type="button" className="pressable" aria-pressed={filtro === 'todos'}
                onClick={() => { haptic('selection'); setFiltro('todos'); }}
                style={{ background: 'var(--fill-1)', borderRadius: 8, padding: '10px 14px', flex: 1, textAlign: 'center', cursor: 'pointer', border: filtro === 'todos' ? '2px solid var(--ink)' : '2px solid transparent' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.25rem', color: 'var(--label-1)' }}>{lista.length}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', fontWeight: 600 }}>Total</div>
              </button>
          </div>

          {!busqueda && !soloBusqueda && pendientes.length === 0 && (
            <Notice tone="success">No hay movimientos pendientes de aprobación.</Notice>
          )}

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar por conductor, placa, motivo u OV…" />

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
              <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Limpiar</button>
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '40rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--separator)' }}>
                    {['Fecha', 'Conductor / Persona', 'Motivo', 'Importe', 'Estado', 'Acciones'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((m, i) => {
                    const color = estadoColor(String(m.estado ?? ''));
                    const isPend = esPendiente(m);
                    const nombrePrimario = m.conductor || m.persona || '—';
                    return (
                      <tr key={String(m.id || i)} style={{ borderBottom: '1px solid var(--separator)' }}>
                        <td style={{ padding: '8px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'var(--label-2)' }}>
                          {formatFechaPe(m.fecha)}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
                          <div style={{ fontWeight: 600 }}>{nombrePrimario}</div>
                          {m.placa && <div style={{ fontSize: '0.75rem', color: 'var(--label-1)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{m.placa}</div>}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--label-2)', maxWidth: '12rem' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.motivo ?? '—'}
                          </div>
                          {m.sub_motivo && <div style={{ fontSize: '0.72rem' }}>{m.sub_motivo}</div>}
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                          {fmtMonto(m.importe_total, String(m.moneda ?? 'PEN'))}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span className={`ot-estado ot-estado--${color}`}>{m.estado ?? 'PENDIENTE'}</span>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {isPend && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button type="button"
                                className="pressable"
                                onClick={() => { haptic('selection'); setAccion({ id: m.id, tipo: 'aprobar' }); setMsg(null); setErrMotivo(undefined); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: 'var(--green-tint)', color: 'var(--green-ink)', border: '1px solid var(--green-ink)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                <CheckCircle size={13} /> Aprobar
                              </button>
                              <button type="button"
                                className="pressable"
                                onClick={() => { haptic('selection'); setAccion({ id: m.id, tipo: 'anular' }); setMsg(null); setErrMotivo(undefined); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: 'var(--red-tint)', color: 'var(--red-ink)', border: '1px solid var(--red-ink)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                <XCircle size={13} /> Anular
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
        onClose={() => { setAccion(null); setMotivoAnulacion(''); }}
        title={accion?.tipo === 'aprobar' ? 'Aprobar movimiento' : 'Anular movimiento'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAccion(null); setMotivoAnulacion(''); }}>Cancelar</Button>
            <Button variant={accion?.tipo === 'aprobar' ? 'primary' : 'danger'} onClick={ejecutarAccion} loading={procesando}>
              {accion?.tipo === 'aprobar' ? 'Confirmar aprobación' : 'Confirmar anulación'}
            </Button>
          </>
        }
      >
        {accion?.tipo === 'anular' ? (
          <div>
            <Field label="Motivo de anulación" error={errMotivo}>
              {p => (
                <textarea {...p} value={motivoAnulacion} onChange={e => { setMotivoAnulacion(e.target.value); setErrMotivo(undefined); }}
                  placeholder="Describe el motivo…" rows={3} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', padding: '8px 10px', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }} />
              )}
            </Field>
          </div>
        ) : (
          <div style={{ padding: '12px 0', color: 'var(--label-2)', fontSize: '0.875rem' }}>
            Confirma que deseas aprobar este movimiento de caja.
          </div>
        )}
      </Sheet>
    </Page>
  );
}
