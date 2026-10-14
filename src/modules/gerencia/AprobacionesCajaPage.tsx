import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle, Coins, SearchX, XCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { SlideUpModal, ModalBtn } from '../../core/ui/SlideUpModal';

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
  if (!v || isNaN(n)) return '—';
  const sym = moneda === 'USD' ? '$' : 'S/';
  return `${sym} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AprobacionesCajaPage() {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [soloBusqueda, setSoloBusqueda] = useState(false);
  const [accion, setAccion] = useState<{ id: string | number; tipo: 'aprobar' | 'anular' } | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

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
    const fuente = soloBusqueda || busqueda ? lista : pendientes;
    if (!busqueda) return fuente;
    const q = busqueda.toUpperCase();
    return lista.filter(m =>
      String(m.conductor ?? '').toUpperCase().includes(q) ||
      String(m.placa ?? '').toUpperCase().includes(q) ||
      String(m.motivo ?? '').toUpperCase().includes(q) ||
      String(m.orden_viaje ?? '').toUpperCase().includes(q) ||
      String(m.persona ?? '').toUpperCase().includes(q)
    );
  }, [lista, pendientes, busqueda, soloBusqueda]);

  async function ejecutarAccion() {
    if (!accion) return;
    setProcesando(true);
    try {
      const endpoint = accion.tipo === 'aprobar'
        ? `/tesoreria/caja/${accion.id}/aprobar`
        : `/tesoreria/caja/${accion.id}/anular`;
      await api(endpoint, {
        method: 'POST',
        body: accion.tipo === 'anular'
          ? { motivo: motivoAnulacion || 'Anulado por Gerencia', usuario_anulacion: localStorage.getItem('fleet_user') ?? 'Gerencia' }
          : { usuario_aprobacion: localStorage.getItem('fleet_user') ?? 'Gerencia' },
      });
      setMsg({ tipo: 'ok', texto: `Movimiento ${accion.tipo === 'aprobar' ? 'aprobado' : 'anulado'} correctamente.` });
      qc.invalidateQueries({ queryKey: ['gerencia', 'aprobaciones-caja'] });
      setAccion(null);
      setMotivoAnulacion('');
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
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            {[
              { label: 'Pendientes', valor: pendientes.length, color: pendientes.length > 0 ? 'var(--amber-ink)' : 'var(--green-ink)' },
              { label: 'Aprobados', valor: lista.filter(m => (m.estado ?? '').toUpperCase() === 'APROBADO').length, color: 'var(--green-ink)' },
              { label: 'Total', valor: lista.length, color: 'var(--label-1)' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--fill-1)', borderRadius: 8, padding: '10px 14px', flex: 1, textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.25rem', color: k.color }}>{k.valor}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--label-2)', fontWeight: 600 }}>{k.label}</div>
              </div>
            ))}
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
                          {String(m.fecha ?? '').split('T')[0] || '—'}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
                          <div style={{ fontWeight: 600 }}>{nombrePrimario}</div>
                          {m.placa && <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{m.placa}</div>}
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
                                onClick={() => { setAccion({ id: m.id, tipo: 'aprobar' }); setMsg(null); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: 'var(--green-tint)', color: 'var(--green-ink)', border: '1px solid var(--green-ink)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                <CheckCircle size={13} /> Aprobar
                              </button>
                              <button type="button"
                                onClick={() => { setAccion({ id: m.id, tipo: 'anular' }); setMsg(null); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: 'var(--fill-2)', color: 'var(--label-2)', border: '1px solid var(--separator)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
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
      <SlideUpModal
        open={!!accion}
        onClose={() => { setAccion(null); setMotivoAnulacion(''); }}
        title={accion?.tipo === 'aprobar' ? 'Aprobar movimiento' : 'Anular movimiento'}
        subtitle={accion?.tipo === 'aprobar' ? 'Se marcará este movimiento como APROBADO.' : 'Se marcará como ANULADO. Esta acción no se puede deshacer.'}
        footer={
          <>
            <ModalBtn variant="ghost" onClick={() => { setAccion(null); setMotivoAnulacion(''); }}>Cancelar</ModalBtn>
            <ModalBtn variant={accion?.tipo === 'aprobar' ? 'primary' : 'danger'} onClick={ejecutarAccion} loading={procesando}>
              {accion?.tipo === 'aprobar' ? 'Confirmar aprobación' : 'Confirmar anulación'}
            </ModalBtn>
          </>
        }
      >
        {accion?.tipo === 'anular' ? (
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--label-2)', display: 'block', marginBottom: 6 }}>
              Motivo de anulación
            </label>
            <textarea
              value={motivoAnulacion}
              onChange={e => setMotivoAnulacion(e.target.value)}
              placeholder="Describe el motivo…"
              rows={3}
              style={{ width: '100%', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', padding: '8px 10px', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
        ) : (
          <div style={{ padding: '12px 0', color: 'var(--label-2)', fontSize: '0.875rem' }}>
            Confirma que deseas aprobar este movimiento de caja.
          </div>
        )}
      </SlideUpModal>
    </Page>
  );
}
