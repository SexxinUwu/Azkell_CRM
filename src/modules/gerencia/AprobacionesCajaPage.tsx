import '../mantenimiento/mant.css';
import './gerencia.css';
import './gerencia-oc.css';
import { useMemo, useRef, useState } from 'react';
import {
  Building2, CalendarDays, CheckCircle, ClipboardList, Coins, Eye, FileCheck, LayoutGrid, List, Receipt, RefreshCw,
  SearchX, ShieldCheck, ThumbsUp, Truck, User, Wallet, XCircle,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page } from '../../core/ui/Display';
import { Sheet } from '../../core/ui/Sheet';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { formatDolares, formatFechaPe, formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { esDolar } from '../tesoreria/mov-utilidades';
import { categoriaOc } from './api';
import { chipEstado, nombreLimpio } from './presentacion';

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
  serie?: string;
  numero?: string;
  hora?: string;
  tipo_persona?: string;
  cuenta_bancaria_persona?: string;
  ruta_viaje?: string;
  centro_costo?: string;
  descripcion?: string;
  observacion?: string;
  modalidad_pago?: string;
  tipo_cambio?: number | string;
  tipo_comprobante?: string;
  cuenta_bancaria_empresa?: string;
  voucher_url?: string;
  voucher_view_url?: string;
  sustento_url?: string;
  sustento_view_url?: string;
  fecha_aprobacion?: string;
  [key: string]: unknown;
}

// Celular: menos de 768 px. Ahí la lista son tarjetas, no tabla.
const QUERY_MOVIL = '(max-width: 767px)';

type Pestana = 'todas' | 'pendientes' | 'aprobados' | 'anulados';
type Vista = 'tarjetas' | 'tabla';
type AccionCaja = 'aprobar' | 'anular';

function esPendiente(m: CajaMov): boolean {
  const s = (m.estado ?? '').toUpperCase();
  return s === 'PENDIENTE' || s === 'REGISTRADO' || s === '';
}
const esAprobado = (m: CajaMov) => (m.estado ?? '').toUpperCase() === 'APROBADO';
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
const codigoCaja = (m: CajaMov) => (m.serie || m.numero ? `CAJA-${m.serie ?? ''}-${m.numero ?? ''}` : `CAJA-${m.id}`);
const beneficiario = (m: CajaMov) => m.persona || m.conductor || 'No especificado';
const fechaDe = (m: CajaMov) => String(m.fecha ?? '').slice(0, 10);

/** Tarjeta de un movimiento, igual que la de las OC: código, importe, datos, beneficiario, asignación, motivo y acciones */
function TarjetaCaja({ m, puedeAccionar, onDetalle, onAccion }: {
  m: CajaMov; puedeAccionar: boolean; onDetalle: () => void; onAccion: (tipo: AccionCaja) => void;
}) {
  const cat = categoriaOc(m.estado);
  const accionable = esPendiente(m) && puedeAccionar;
  return (
    <article className={`ga-card ga-card--${cat}`}>
      <div>
        <div className="ga-card__cab">
          <div className="ga-card__izq">
            <button type="button" className="ga-codigo" onClick={onDetalle} title="Ver detalle">
              <Eye size={12} aria-hidden style={{ verticalAlign: '-1px', marginRight: 4 }} />{codigoCaja(m)}
            </button>
            {m.tipo_movimiento && <span className="ga-prio">{m.tipo_movimiento}</span>}
          </div>
          <div className="ga-importe">
            <div className="ga-importe__etiqueta">IMPORTE</div>
            <div className="ga-importe__valor">{importeMov(m)}</div>
          </div>
        </div>

        <div className="ga-meta" style={{ marginTop: 'var(--s-3)' }}>
          <span><CalendarDays size={12} aria-hidden style={{ verticalAlign: '-1px' }} /> {formatFechaPe(m.fecha)}</span>
          <span><User size={12} aria-hidden style={{ verticalAlign: '-1px' }} /> <b>{nombreLimpio(m.usuario_creacion)}</b></span>
          {m.centro_costo && <span className="ga-cc"><Building2 size={11} aria-hidden style={{ verticalAlign: '-1px' }} /> {m.centro_costo}</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', marginTop: 'var(--s-3)' }}>
          <div className="ga-bloque">
            <span className="ga-bloque__etiqueta">Beneficiario</span>
            <span className="ga-bloque__valor" title={beneficiario(m)}>{beneficiario(m)}</span>
            {m.tipo_persona && <span className="ga-bloque__sub">{m.tipo_persona}</span>}
          </div>
          <div className="ga-bloque">
            <span className="ga-bloque__etiqueta">Asignación</span>
            <span className="ga-bloque__valor">{m.placa ? `Placa ${m.placa}` : 'Sin placa'}</span>
            <span className="ga-bloque__sub">{m.orden_viaje ? `Viaje ${m.orden_viaje}` : m.ruta_viaje || 'Sin viaje'}</span>
          </div>
          <div className="ga-motivo">
            <span className="ga-motivo__etiqueta">Motivo</span>
            <div className="ga-motivo__texto" title={[m.motivo, m.sub_motivo].filter(Boolean).join(' · ')}>
              {[m.motivo, m.sub_motivo].filter(Boolean).join(' · ') || 'Sin motivo especificado'}
            </div>
          </div>
        </div>
      </div>

      <div className="ga-card__pie">
        <button type="button" className="ga-btn ga-btn--detalle" onClick={onDetalle}>
          <Eye size={14} aria-hidden /> Detalle
        </button>
        {accionable ? (
          <div className="ga-card__acciones">
            <button type="button" className="ga-btn ga-btn--aprobar" onClick={() => onAccion('aprobar')}>
              <CheckCircle size={14} aria-hidden /> AUTORIZAR
            </button>
            <button type="button" className="ga-btn ga-btn--rechazar" onClick={() => onAccion('anular')}>
              <XCircle size={14} aria-hidden /> ANULAR
            </button>
          </div>
        ) : chipEstado(m.estado)}
      </div>
    </article>
  );
}

export function AprobacionesCajaPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  // Solo lectura sin este permiso: se ven los movimientos, sin botones de decisión.
  const puedeAccionar = can('gerencia_aprobaciones_caja.aprobar');
  const movil = useMediaQuery(QUERY_MOVIL);

  // Sin rango por defecto: una caja pendiente antigua no debe quedar oculta
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [motivo, setMotivo] = useState('');
  const [pestana, setPestana] = useState<Pestana>('pendientes');
  const [vista, setVista] = useState<Vista>('tarjetas');
  const [detalle, setDetalle] = useState<CajaMov | null>(null);
  const [accion, setAccion] = useState<{ tipo: AccionCaja; mov: CajaMov } | null>(null);
  const [comentario, setComentario] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [errCampo, setErrCampo] = useState<string | undefined>();
  const [errAccion, setErrAccion] = useState<string | null>(null);
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
  const lista = useMemo(() => data ?? [], [data]);

  // Motivos del filtro: los que existen en la lista, sin repetir y ordenados (como el clásico)
  const motivos = useMemo(() => Array.from(new Set(lista.map(m => (m.motivo || '').trim()).filter(Boolean))).sort(), [lista]);

  // Movimientos dentro del rango y del motivo: indicadores y pestañas salen de aquí
  const enRango = useMemo(() => lista.filter(m => {
    const f = fechaDe(m);
    if (desde && f && f < desde) return false;
    if (hasta && f && f > hasta) return false;
    if (motivo && (m.motivo || '').trim() !== motivo) return false;
    return true;
  }), [lista, desde, hasta, motivo]);

  const grupos = useMemo(() => ({
    pendientes: enRango.filter(esPendiente),
    aprobados: enRango.filter(esAprobado),
    anulados: enRango.filter(esAnulado),
    todas: enRango,
  }), [enRango]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    const base = grupos[pestana];
    if (!q) return base;
    return base.filter(m =>
      [m.conductor, m.persona, m.placa, m.motivo, m.sub_motivo, m.orden_viaje, m.serie, m.numero, codigoCaja(m)]
        .some(v => String(v ?? '').toUpperCase().includes(q)),
    );
  }, [grupos, pestana, busqueda]);

  const indicadores: Array<{ tono: string; etiqueta: string; pill: string; items: CajaMov[]; pie: string }> = [
    { tono: 'ambar', etiqueta: 'Pendientes', pill: 'Por revisar', items: grupos.pendientes, pie: 'Importe acumulado' },
    { tono: 'verde', etiqueta: 'Aprobados', pill: 'Autorizados', items: grupos.aprobados, pie: 'Monto autorizado' },
    { tono: 'rojo', etiqueta: 'Anulados', pill: 'Desestimados', items: grupos.anulados, pie: 'No ejecutado' },
    { tono: 'indigo', etiqueta: 'Total', pill: 'Todos', items: grupos.todas, pie: 'Movimientos del periodo' },
  ];

  const pestanas: Array<{ key: Pestana; etiqueta: string }> = [
    { key: 'todas', etiqueta: 'Todos' },
    { key: 'pendientes', etiqueta: 'Pendientes' },
    { key: 'aprobados', etiqueta: 'Aprobados' },
    { key: 'anulados', etiqueta: 'Anulados' },
  ];

  function abrirAccion(tipo: AccionCaja, mov: CajaMov) {
    if (!puedeAccionar) return;
    haptic('selection');
    setMsg(null);
    setErrAccion(null);
    setErrCampo(undefined);
    setComentario('');
    setConfirmado(false);
    setDetalle(null);
    setAccion({ tipo, mov });
  }

  function cerrarAccion() {
    setAccion(null);
    setComentario('');
    setConfirmado(false);
    setErrCampo(undefined);
    setErrAccion(null);
  }

  async function confirmarAccion() {
    if (!accion || procesando) return;
    const { tipo, mov } = accion;
    const texto = comentario.trim();
    if (tipo === 'aprobar' && !confirmado) return;
    if (tipo === 'anular' && !texto) {
      setErrCampo('Escribe el motivo de la anulación.');
      haptic('warning');
      return;
    }
    setProcesando(true);
    setErrAccion(null);
    try {
      const usuario = localStorage.getItem('fleet_user') ?? 'Gerencia';
      await api(`/tesoreria/caja/${mov.id}/${tipo}`, {
        method: 'POST',
        body: tipo === 'anular' ? { motivo: texto, usuario_anulacion: usuario } : { usuario_aprobacion: usuario },
      });
      setMsg({ tipo: 'ok', texto: `${codigoCaja(mov)} ${tipo === 'aprobar' ? 'aprobada' : 'anulada'} correctamente.` });
      haptic(tipo === 'aprobar' ? 'success' : 'warning');
      cerrarAccion();
      qc.invalidateQueries({ queryKey: ['gerencia', 'aprobaciones-caja'] });
      // Como en las OC: lo aprobado pasa a Tesorería (Caja y Movimientos) y debe verse al instante
      qc.invalidateQueries({ queryKey: ['tesoreria'] });
    } catch (e) {
      setErrAccion(errorMessage(e));
      haptic('warning');
    } finally {
      setProcesando(false);
    }
  }

  function limpiarFiltros() {
    setDesde('');
    setHasta('');
    setMotivo('');
    setBusqueda('');
    setPestana('todas');
  }

  function accionesCelda(m: CajaMov) {
    if (esPendiente(m) && puedeAccionar) {
      return (
        <div className="gerencia-acciones-fila">
          <button type="button" className="gerencia-accion gerencia-accion--aprobar pressable" onClick={() => abrirAccion('aprobar', m)}>
            <CheckCircle size={14} aria-hidden /> Autorizar
          </button>
          <button type="button" className="gerencia-accion gerencia-accion--rechazar pressable" onClick={() => abrirAccion('anular', m)}>
            <XCircle size={14} aria-hidden /> Anular
          </button>
        </div>
      );
    }
    return chipEstado(m.estado);
  }

  const hayFiltros = !!desde || !!hasta || !!motivo || !!busqueda || pestana !== 'pendientes';

  return (
    <Page>
      <div className="ga-page">
        {/* Cabecera */}
        <header className="ga-cab">
          <div>
            <span className="ga-pill"><ShieldCheck size={13} aria-hidden /> Dirección ejecutiva</span>
            <h1 className="ga-titulo">Aprobación de Caja</h1>
            <p className="ga-sub">
              Bandeja gerencial para autorizar o anular los egresos de caja antes de su pago
              {grupos.pendientes.length > 0 ? ` · ${grupos.pendientes.length} pendientes` : ''}
            </p>
          </div>
          <div className="ga-acciones">
            <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => { void qc.invalidateQueries({ queryKey: ['gerencia', 'aprobaciones-caja'] }); }}>
              Actualizar
            </Button>
            <div className="ga-vista" role="group" aria-label="Forma de la lista">
              <button type="button" aria-pressed={vista === 'tabla'} title="Lista" aria-label="Ver como lista" onClick={() => setVista('tabla')}><List size={16} /></button>
              <button type="button" aria-pressed={vista === 'tarjetas'} title="Tarjetas" aria-label="Ver como tarjetas" onClick={() => setVista('tarjetas')}><LayoutGrid size={16} /></button>
            </div>
          </div>
        </header>

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
          <>
            {/* Indicadores */}
            <div className="ga-kpis">
              {indicadores.map(k => (
                <div key={k.etiqueta} className={`ga-kpi ga-kpi--${k.tono}`}>
                  <div className="ga-kpi__cab">
                    <span className="ga-kpi__etiqueta">{k.etiqueta}</span>
                    <span className="ga-kpi__pill">{k.pill}</span>
                  </div>
                  <span className="ga-kpi__valor">{k.items.length}</span>
                  <span className="ga-kpi__unidad">{k.items.length === 1 ? 'movimiento' : 'movimientos'}</span>
                  <div className="ga-kpi__pie">
                    <span>{k.pie}:</span>
                    <b>{montoPorMoneda(k.items)}</b>
                  </div>
                </div>
              ))}
            </div>

            {/* Filtros */}
            <div className="ga-filtros">
              <div className="ga-filtros__fila">
                <div className="ga-campo">
                  <span className="ga-campo__etiqueta">Fecha desde</span>
                  <input type="date" className="input" aria-label="Fecha desde" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} />
                </div>
                <div className="ga-campo">
                  <span className="ga-campo__etiqueta">Fecha hasta</span>
                  <input type="date" className="input" aria-label="Fecha hasta" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} />
                </div>
                <div className="ga-campo">
                  <span className="ga-campo__etiqueta">Motivo</span>
                  <select className="input" aria-label="Motivo" value={motivo} onChange={e => setMotivo(e.target.value)}>
                    <option value="">Todos los motivos</option>
                    {motivos.map(x => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div className="ga-campo ga-buscar">
                  <span className="ga-campo__etiqueta">Búsqueda rápida</span>
                  <input type="search" className="input" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar por conductor, persona, placa, motivo u OV…" aria-label="Buscar movimientos" />
                </div>
              </div>
              <div className="ga-tabs" role="group" aria-label="Filtrar por estado">
                {pestanas.map(p => (
                  <button key={p.key} type="button" className="ga-tab" aria-pressed={pestana === p.key} onClick={() => { haptic('selection'); setPestana(p.key); }}>
                    {p.etiqueta} <span className="ga-tab__n">{grupos[p.key].length}</span>
                  </button>
                ))}
                {hayFiltros && <button type="button" className="ga-limpiar" onClick={limpiarFiltros}>Limpiar filtros</button>}
              </div>
            </div>

            {/* Movimientos */}
            {visibles.length === 0 ? (
              <EmptyState icon={<SearchX size={22} />} title={pestana === 'pendientes' && !busqueda ? 'No hay movimientos pendientes' : 'Sin coincidencias'}>
                <button type="button" className="placas-limpiar" onClick={limpiarFiltros}>Ver todos</button>
              </EmptyState>
            ) : vista === 'tabla' && !movil ? (
              <div className="gerencia-tabla-wrap">
                <table className="gerencia-tabla">
                  <thead>
                    <tr>
                      {['Acción', 'Fecha', 'Usuario', 'Caja', 'Centro costo', 'Motivo', 'Beneficiario', 'Placa / viaje', 'Importe'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((m, i) => (
                      <tr key={String(m.id || i)}>
                        <td>{accionesCelda(m)}</td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--label-2)' }}>{formatFechaPe(m.fecha)}</td>
                        <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{nombreLimpio(m.usuario_creacion)}</td>
                        <td>
                          <button type="button" className="gerencia-codigo" onClick={() => setDetalle(m)} title="Ver detalle del movimiento">{codigoCaja(m)}</button>
                        </td>
                        <td><span className="gerencia-chip">{m.centro_costo || '—'}</span></td>
                        <td>
                          <div className="gerencia-celda-recorte" title={[m.motivo, m.sub_motivo].filter(Boolean).join(' · ')}>
                            {[m.motivo, m.sub_motivo].filter(Boolean).join(' · ') || 'Sin motivo'}
                          </div>
                        </td>
                        <td>{beneficiario(m)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{[m.placa, m.orden_viaje].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="gerencia-tabla__num">{importeMov(m)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="ga-grid">
                {visibles.map((m, i) => (
                  <TarjetaCaja key={String(m.id || i)} m={m} puedeAccionar={puedeAccionar}
                    onDetalle={() => { haptic('selection'); setDetalle(m); }}
                    onAccion={tipo => abrirAccion(tipo, m)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <DetalleCajaSheet caja={detalle} onClose={() => setDetalle(null)} puedeAccionar={puedeAccionar} onAccion={abrirAccion} />

      {/* Conformidad: igual que la de las OC */}
      <Sheet
        open={!!accion}
        onClose={() => !procesando && cerrarAccion()}
        title={accion?.tipo === 'anular' ? 'Anular movimiento de caja' : 'Autorizar movimiento de caja'}
        footer={accion && (
          <>
            <Button variant="secondary" onClick={cerrarAccion} disabled={procesando}>Cerrar</Button>
            <Button variant={accion.tipo === 'aprobar' ? 'primary' : 'danger'} onClick={confirmarAccion} loading={procesando}
              disabled={procesando || (accion.tipo === 'aprobar' && !confirmado)}>
              {accion.tipo === 'aprobar' ? 'Autorizar ahora' : 'Anular movimiento'}
            </Button>
          </>
        )}
      >
        {accion && (
          <div className="ga-confirm">
            <span className={`ga-confirm__icono ${accion.tipo === 'anular' ? 'ga-confirm__icono--rechazo' : ''}`}>
              {accion.tipo === 'aprobar' ? <ThumbsUp size={28} aria-hidden /> : <XCircle size={28} aria-hidden />}
            </span>
            <p className="ga-confirm__mensaje">
              {accion.tipo === 'aprobar'
                ? 'Al autorizar, el movimiento queda aprobado y pasa a Tesorería para su pago.'
                : 'El movimiento queda anulado. Escribe el motivo: quedará registrado para quien lo registró y para la auditoría.'}
            </p>
            <span className="ga-confirm__codigo">{codigoCaja(accion.mov)} · {beneficiario(accion.mov)}</span>
            <span className="ga-confirm__monto">{importeMov(accion.mov)}</span>

            {accion.tipo === 'aprobar' && (
              <>
                <label className="ga-confirm__check">
                  <input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} />
                  <span>Confirmo realizar la autorización de este movimiento</span>
                </label>
                <span className="ga-confirm__traspaso">
                  <CheckCircle size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />
                  Tesorería verá este movimiento como aprobado.
                </span>
              </>
            )}

            {accion.tipo === 'anular' && (
              <div className="ga-confirm__campo">
                <label htmlFor="ga-caja-comentario">Motivo de la anulación (obligatorio)</label>
                <textarea id="ga-caja-comentario" rows={3} value={comentario} placeholder="Escribe aquí…" aria-invalid={!!errCampo || undefined}
                  onChange={e => { setComentario(e.target.value); setErrCampo(undefined); }} />
                {errCampo && <span style={{ fontSize: '0.8rem', color: 'var(--red-ink)' }}>{errCampo}</span>}
              </div>
            )}

            {errAccion && <div className="ga-confirm__error"><Notice tone="error">{errAccion}</Notice></div>}
          </div>
        )}
      </Sheet>
    </Page>
  );
}

const TEXTO_DECISION: Record<ReturnType<typeof categoriaOc>, string> = {
  pendiente: 'Pendiente de aprobación por Gerencia.',
  observada: 'Observado: falta sustento.',
  aprobada: 'Aprobado. Tesorería puede pagarlo.',
  rechazada: 'Anulado: el egreso fue desestimado.',
  otra: 'Estado sin clasificar.',
};

/** Detalle del movimiento con el mismo diseño que el de una OC: datos a la izquierda, resumen y documentos a la derecha */
function DetalleCajaSheet({ caja, onClose, puedeAccionar, onAccion }: {
  caja: CajaMov | null; onClose: () => void; puedeAccionar: boolean; onAccion: (tipo: AccionCaja, m: CajaMov) => void;
}) {
  // Mientras la hoja se cierra, el contenido sigue visible
  const ultima = useRef<CajaMov | null>(null);
  if (caja) ultima.current = caja;
  const c = caja ?? ultima.current;
  const decidible = !!c && puedeAccionar && esPendiente(c);
  const moneda = (c?.moneda ?? 'SOLES').toUpperCase();
  const monedaTc = moneda === 'SOLES' || moneda === 'PEN' ? 'Soles' : `${moneda} (TC ${c?.tipo_cambio || '1.000'})`;
  const adjuntos = c ? [
    { titulo: 'Comprobante / ticket', url: c.sustento_view_url || c.sustento_url, Icono: FileCheck },
    { titulo: 'Voucher de pago', url: c.voucher_view_url || c.voucher_url, Icono: Receipt },
  ] : [];

  return (
    <Sheet
      open={!!caja}
      onClose={onClose}
      title={c ? codigoCaja(c) : 'Movimiento de caja'}
      ancho
      footer={decidible && c ? (
        <>
          <Button variant="danger" onClick={() => onAccion('anular', c)}>Anular</Button>
          <Button variant="primary" onClick={() => onAccion('aprobar', c)}>Aprobar</Button>
        </>
      ) : undefined}
    >
      {c && (
        <div className="ga-det">
          <div className="ga-det__col">
            <div className="ga-det__cab">
              {chipEstado(c.estado)}
              {c.tipo_movimiento && <span className="ga-prio">{c.tipo_movimiento}</span>}
              <span className="ga-det__emitido">Registrado el {formatFechaPe(c.fecha)} {c.hora ?? ''}</span>
            </div>

            <section className="ga-sec" aria-label="Beneficiario y asignación">
              <h3 className="ga-sec__titulo"><Truck size={16} aria-hidden /> Beneficiario y asignación</h3>
              <div className="ga-dos">
                <div className="ga-bloque">
                  <span className="ga-bloque__etiqueta">Beneficiario</span>
                  <span className="ga-bloque__valor">{beneficiario(c)}</span>
                  <span className="ga-bloque__sub">Tipo: {c.tipo_persona || 'PERSONA'}</span>
                  <span className="ga-bloque__sub">Cuenta destino: {c.cuenta_bancaria_persona || 'No registrada'}</span>
                </div>
                <div className="ga-bloque">
                  <span className="ga-bloque__etiqueta">Asignación operativa</span>
                  <span className="ga-bloque__valor">{c.placa ? `Placa ${c.placa}` : 'Sin placa'}</span>
                  <span className="ga-bloque__sub">Viaje: {c.orden_viaje || '—'} · Ruta: {c.ruta_viaje || '—'}</span>
                  <span className="ga-bloque__sub">Centro de costo: {c.centro_costo || 'General'}</span>
                </div>
              </div>
            </section>

            <section className="ga-sec" aria-label="Concepto del egreso">
              <h3 className="ga-sec__titulo"><ShieldCheck size={16} aria-hidden /> Concepto del egreso</h3>
              <div className="ga-dos">
                <div className="ga-bloque">
                  <span className="ga-bloque__etiqueta">Motivo</span>
                  <span className="ga-bloque__valor">{c.motivo || '—'}</span>
                  <span className="ga-bloque__sub">{c.sub_motivo || 'Sin submotivo'}</span>
                </div>
                <div className="ga-bloque">
                  <span className="ga-bloque__etiqueta">Observaciones</span>
                  <span className="ga-bloque__valor">{c.observacion || 'Ninguna'}</span>
                </div>
              </div>
              <p className="ga-texto">{c.descripcion || 'Sin descripción adicional'}</p>
            </section>

            <section className="ga-sec" aria-label="Auditoría">
              <h3 className="ga-sec__titulo"><User size={16} aria-hidden /> Auditoría del movimiento</h3>
              <div className="ga-dos">
                <div className="ga-bloque">
                  <span className="ga-bloque__etiqueta">Registrado por</span>
                  <span className="ga-bloque__valor">{nombreLimpio(c.usuario_creacion)}</span>
                </div>
                <div className="ga-bloque">
                  <span className="ga-bloque__etiqueta">Aprobado por</span>
                  <span className="ga-bloque__valor">{c.usuario_aprobacion ? nombreLimpio(c.usuario_aprobacion) : 'En espera'}</span>
                  <span className="ga-bloque__sub">{c.fecha_aprobacion ? formatFechaPe(c.fecha_aprobacion) : 'Pendiente'}</span>
                </div>
              </div>
            </section>
          </div>

          <div className="ga-det__col">
            <section className="ga-sec" aria-label="Resumen económico">
              <h3 className="ga-sec__titulo"><Coins size={16} aria-hidden /> Resumen económico</h3>
              <div className="ga-resumen">
                <div className="ga-resumen__fila"><span>Modalidad</span><b>{c.modalidad_pago || 'Transferencia'}</b></div>
                <div className="ga-resumen__fila"><span>Moneda</span><b>{monedaTc}</b></div>
                <div className="ga-resumen__fila"><span>Comprobante</span><b>{c.tipo_comprobante || 'Sin comprobante'}</b></div>
                <div className="ga-resumen__fila"><span>Cuenta origen</span><b>{c.cuenta_bancaria_empresa || 'Por definir'}</b></div>
                <div className="ga-resumen__total"><span>Total egreso</span><b>{importeMov(c)}</b></div>
              </div>
            </section>

            <section className="ga-sec" aria-label="Documentos adjuntos">
              <h3 className="ga-sec__titulo">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardList size={16} aria-hidden /> Documentos adjuntos</span>
                <span className="ga-sec__cuenta">{adjuntos.filter(a => !!a.url).length} adjuntos</span>
              </h3>
              <div className="ga-docs">
                {adjuntos.map(({ titulo, url, Icono }) => (
                  <div key={titulo} className={`ga-doc ${url ? '' : 'ga-doc--falta'}`}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icono size={16} aria-hidden /> {titulo}</span>
                    {url ? <a href={url} target="_blank" rel="noopener noreferrer">Ver archivo</a> : <span>Sin archivo</span>}
                  </div>
                ))}
              </div>
            </section>

            <section className="ga-sec" aria-label="Estado de la decisión">
              <h3 className="ga-sec__titulo"><Wallet size={16} aria-hidden /> Estado de la decisión</h3>
              <div className="ga-decision">
                <span>{TEXTO_DECISION[categoriaOc(c.estado)]}</span>
              </div>
            </section>
          </div>
        </div>
      )}
    </Sheet>
  );
}
