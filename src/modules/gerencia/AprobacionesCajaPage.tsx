import '../mantenimiento/mant.css';
import './gerencia.css';
import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowUpRight, CheckCircle, Coins, SearchX, XCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { abrirClasico } from '../../core/layout/navigation';
import { formatDolares, formatFechaPe, formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { esDolar } from '../tesoreria/mov-utilidades';

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
  estado?: string;
  orden_viaje?: string;
  usuario_creacion?: string;
  usuario_aprobacion?: string;
  [key: string]: unknown;
}

const QUERY_MOVIL = '(max-width: 767px)';
type Filtro = 'pendientes' | 'aprobados' | 'anulados' | 'todos';

/** Estado de caja → chip (PENDIENTE/REGISTRADO por decidir, APROBADO, PROCESADO, ANULADO). */
function chipCaja(estado: string | undefined) {
  const s = (estado ?? '').trim().toUpperCase();
  const clase = s === 'APROBADO' ? 'aprobada' : s === 'ANULADO' ? 'rechazada' : s === 'PENDIENTE' || s === 'REGISTRADO' || s === '' ? 'pendiente' : 'otra';
  const texto = s === '' ? 'PENDIENTE' : s;
  return <span className={`gerencia-chip gerencia-chip--${clase}`}>{texto}</span>;
}

function esPendiente(m: CajaMov): boolean {
  const s = (m.estado ?? '').toUpperCase();
  return s === 'PENDIENTE' || s === 'REGISTRADO' || s === '';
}

/** Como el clásico: ANULADO y RECHAZADO cuentan como anulados */
function esAnulado(m: CajaMov): boolean {
  const s = (m.estado ?? '').toUpperCase();
  return s === 'ANULADO' || s === 'RECHAZADO';
}

const numero = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Importes sumados por moneda: "S/ 1,200.00 · US$ 300.00" */
function montoPorMoneda(lista: CajaMov[]): string {
  let soles = 0;
  let dolares = 0;
  for (const m of lista) {
    if (esDolar(m.moneda)) dolares += numero(m.importe_total);
    else soles += numero(m.importe_total);
  }
  const partes = [soles !== 0 ? formatSoles(soles) : null, dolares !== 0 ? formatDolares(dolares) : null].filter(Boolean);
  return partes.length ? partes.join(' · ') : formatSoles(0);
}

const importeMov = (m: CajaMov) => (esDolar(m.moneda) ? formatDolares(numero(m.importe_total)) : formatSoles(numero(m.importe_total)));

export function AprobacionesCajaPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  // Solo lectura sin este permiso: se ven los movimientos, sin botones de decisión.
  const puedeAccionar = can('gerencia_aprobaciones_caja.editar');
  const movil = useMediaQuery(QUERY_MOVIL);

  const [busqueda, setBusqueda] = useState('');
  const [soloBusqueda, setSoloBusqueda] = useState(false);
  const [accion, setAccion] = useState<{ id: string | number; tipo: 'aprobar' | 'anular'; resumen: string } | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
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

  const lista = useMemo(() => data ?? [], [data]);
  const pendientes = useMemo(() => lista.filter(esPendiente), [lista]);
  const aprobados = useMemo(() => lista.filter(m => (m.estado ?? '').toUpperCase() === 'APROBADO'), [lista]);
  const anulados = useMemo(() => lista.filter(esAnulado), [lista]);

  const visibles = useMemo(() => {
    const base = filtro === 'pendientes' ? pendientes : filtro === 'aprobados' ? aprobados : filtro === 'anulados' ? anulados : lista;
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
  }, [lista, pendientes, aprobados, anulados, busqueda, soloBusqueda, filtro]);

  const kpis: Array<{ key: Filtro; etiqueta: string; items: CajaMov[]; color: string }> = [
    { key: 'pendientes', etiqueta: 'Pendientes', items: pendientes, color: 'var(--amber-ink)' },
    { key: 'aprobados', etiqueta: 'Aprobados', items: aprobados, color: 'var(--green-ink)' },
    { key: 'anulados', etiqueta: 'Anulados', items: anulados, color: 'var(--red-ink)' },
    { key: 'todos', etiqueta: 'Total', items: lista, color: 'var(--label-1)' },
  ];

  function abrirAccion(id: string | number, tipo: 'aprobar' | 'anular', m: CajaMov) {
    if (!puedeAccionar) return;
    haptic('selection');
    setMsg(null);
    setErrMotivo(undefined);
    setMotivoAnulacion('');
    setAccion({ id, tipo, resumen: `${m.conductor || m.persona || '—'} · ${importeMov(m)}` });
  }

  function cerrarAccion() {
    setAccion(null);
    setMotivoAnulacion('');
    setErrMotivo(undefined);
  }

  async function ejecutarAccion() {
    if (!accion || procesando) return;
    if (accion.tipo === 'anular' && !motivoAnulacion.trim()) {
      setErrMotivo('Escribe el motivo de la anulación.');
      haptic('warning');
      return;
    }
    setProcesando(true);
    try {
      const usuario = localStorage.getItem('fleet_user') ?? 'Gerencia';
      const endpoint = accion.tipo === 'aprobar' ? `/tesoreria/caja/${accion.id}/aprobar` : `/tesoreria/caja/${accion.id}/anular`;
      await api(endpoint, {
        method: 'POST',
        body: accion.tipo === 'anular'
          ? { motivo: motivoAnulacion.trim(), usuario_anulacion: usuario }
          : { usuario_aprobacion: usuario },
      });
      setMsg({ tipo: 'ok', texto: `Movimiento ${accion.tipo === 'aprobar' ? 'aprobado' : 'anulado'} correctamente.` });
      haptic(accion.tipo === 'aprobar' ? 'success' : 'warning');
      qc.invalidateQueries({ queryKey: ['gerencia', 'aprobaciones-caja'] });
      cerrarAccion();
    } catch (e) {
      setMsg({ tipo: 'error', texto: errorMessage(e) });
      haptic('warning');
    } finally {
      setProcesando(false);
    }
  }

  const titulo = accion?.tipo === 'aprobar' ? 'Aprobar movimiento' : 'Anular movimiento';

  return (
    <Page>
      <PageHeader
        eyebrow="Gerencia"
        title="Aprobación de caja"
        subtitle={pendientes.length > 0 ? `${pendientes.length} pendientes · ${montoPorMoneda(pendientes)}` : 'Sin pendientes'}
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
          {/* KPI bento: tocarlos filtra la lista */}
          <div className="gerencia-kpis">
            {kpis.map(k => (
              <button
                key={k.key}
                type="button"
                className="gerencia-kpi pressable"
                aria-pressed={filtro === k.key}
                style={{ '--kpi': k.color } as CSSProperties}
                onClick={() => { haptic('selection'); setFiltro(k.key); }}
              >
                <span className="gerencia-kpi__valor">{k.items.length}</span>
                <span className="gerencia-kpi__etiqueta">{k.etiqueta}</span>
                <span className="gerencia-kpi__monto">{montoPorMoneda(k.items)}</span>
              </button>
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
          ) : movil ? (
            <div className="gerencia-lista-tarjetas">
              {visibles.map((m, i) => {
                const pend = esPendiente(m);
                return (
                  <article key={String(m.id || i)} className="gerencia-tarjeta">
                    <div className="gerencia-tarjeta__cuerpo" style={{ cursor: 'default' }}>
                      <span className="gerencia-tarjeta__fila">
                        <span className="gerencia-tarjeta__meta" style={{ marginTop: 0 }}>{formatFechaPe(m.fecha)}</span>
                        {chipCaja(m.estado)}
                      </span>
                      <span className="gerencia-tarjeta__proveedor">{m.conductor || m.persona || '—'}</span>
                      {m.placa && (
                        <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.78rem' }}>{m.placa}</span>
                      )}
                      <span className="gerencia-tarjeta__fila" style={{ marginTop: 4 }}>
                        <span className="gerencia-tarjeta__meta" style={{ marginTop: 0 }}>
                          {m.motivo ?? '—'}{m.sub_motivo ? ` · ${m.sub_motivo}` : ''}
                        </span>
                        <span className="gerencia-tarjeta__importe">{importeMov(m)}</span>
                      </span>
                    </div>
                    {pend && puedeAccionar && (
                      <div className="gerencia-tarjeta__acciones">
                        <button type="button" className="gerencia-accion gerencia-accion--aprobar pressable" onClick={() => abrirAccion(m.id, 'aprobar', m)}>
                          <CheckCircle size={16} aria-hidden /> Aprobar
                        </button>
                        <button type="button" className="gerencia-accion gerencia-accion--rechazar pressable" onClick={() => abrirAccion(m.id, 'anular', m)}>
                          <XCircle size={16} aria-hidden /> Anular
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="gerencia-tabla-wrap">
              <table className="gerencia-tabla" style={{ minWidth: '44rem' }}>
                <thead>
                  <tr>
                    {['Fecha', 'Conductor / persona', 'Motivo', 'Importe', 'Estado', 'Acciones'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((m, i) => {
                    const pend = esPendiente(m);
                    return (
                      <tr key={String(m.id || i)}>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--label-2)', fontSize: '0.8rem' }}>{formatFechaPe(m.fecha)}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{m.conductor || m.persona || '—'}</div>
                          {m.placa && <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{m.placa}</div>}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--label-2)', maxWidth: '12rem' }}>
                          <div className="gerencia-celda-recorte">{m.motivo ?? '—'}</div>
                          {m.sub_motivo && <div style={{ fontSize: '0.72rem' }}>{m.sub_motivo}</div>}
                        </td>
                        <td className="gerencia-tabla__num">{importeMov(m)}</td>
                        <td>{chipCaja(m.estado)}</td>
                        <td>
                          {pend && puedeAccionar && (
                            <div className="gerencia-acciones-fila">
                              <button type="button" className="gerencia-accion gerencia-accion--aprobar pressable" onClick={() => abrirAccion(m.id, 'aprobar', m)}>
                                <CheckCircle size={14} aria-hidden /> Aprobar
                              </button>
                              <button type="button" className="gerencia-accion gerencia-accion--rechazar pressable" onClick={() => abrirAccion(m.id, 'anular', m)}>
                                <XCircle size={14} aria-hidden /> Anular
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

      {/* Confirmación: aprobar, o anular con motivo obligatorio */}
      <Sheet
        open={!!accion}
        onClose={cerrarAccion}
        title={titulo}
        footer={accion && (
          <>
            <Button variant="secondary" onClick={cerrarAccion}>Cancelar</Button>
            <Button variant={accion.tipo === 'aprobar' ? 'primary' : 'danger'} onClick={ejecutarAccion} loading={procesando}>
              {accion.tipo === 'aprobar' ? 'Confirmar aprobación' : 'Confirmar anulación'}
            </Button>
          </>
        )}
      >
        {accion && (accion.tipo === 'anular' ? (
          <div>
            <p style={{ margin: '0 0 var(--s-3)', fontSize: '0.9rem', color: 'var(--label-2)' }}>{accion.resumen}</p>
            <Field label="Motivo de anulación (obligatorio)" error={errMotivo}>
              {p => (
                <textarea {...p} value={motivoAnulacion} onChange={e => { setMotivoAnulacion(e.target.value); setErrMotivo(undefined); }}
                  placeholder="Describe el motivo…" rows={3} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', padding: '8px 10px', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }} />
              )}
            </Field>
          </div>
        ) : (
          <div style={{ padding: '12px 0', color: 'var(--label-2)', fontSize: '0.875rem' }}>
            <p style={{ margin: '0 0 var(--s-2)' }}>{accion.resumen}</p>
            Confirma que deseas aprobar este movimiento de caja.
          </div>
        ))}
      </Sheet>
    </Page>
  );
}
