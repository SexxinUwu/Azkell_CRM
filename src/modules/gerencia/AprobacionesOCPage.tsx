import '../mantenimiento/mant.css';
import './gerencia.css';
import './gerencia-oc.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Building2, CalendarDays, CheckCircle, ClipboardCheck, Eye, LayoutGrid, List, RefreshCw, SearchX, ShieldCheck, User, XCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { abrirClasico } from '../../core/layout/navigation';
import { formatFechaPe, formatMoneda, formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { CLAVE_OC, categoriaOc, decidirOrden, useOrdenesCompra, type CategoriaOc, type DecisionOc, type OrdenCompra } from './api';
import { ConfirmarDecisionSheet } from './ConfirmarDecisionSheet';
import { DetalleOcSheet, type AccionOc } from './DetalleOcSheet';
import { chipEstado, nombreLimpio, prioridadUrgente } from './presentacion';

// Celular: menos de 768 px. Ahí la lista son tarjetas, no tabla.
const QUERY_MOVIL = '(max-width: 767px)';

type Pestana = 'todas' | 'pendientes' | 'aprobadas' | 'rechazadas';
type Vista = 'tarjetas' | 'tabla';

/** Pestañas como en el clásico: "Pendientes" agrupa pendientes y observadas */
const CATEGORIAS_PESTANA: Record<Exclude<Pestana, 'todas'>, CategoriaOc[]> = {
  pendientes: ['pendiente', 'observada'],
  aprobadas: ['aprobada'],
  rechazadas: ['rechazada'],
};

const DECISION: Record<AccionOc, DecisionOc> = {
  aprobar: 'Aprobado',
  rechazar: 'Rechazado',
  observar: 'Observado',
};

const PASADO: Record<AccionOc, string> = {
  aprobar: 'aprobada',
  rechazar: 'rechazada',
  observar: 'observada',
};

interface Acumulado { n: number; soles: number }

/** Monto en soles: la API lo manda como número (ya normalizado), pero se protege contra vacíos */
const soles = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function resumir(lista: OrdenCompra[]): Record<CategoriaOc | 'todas', Acumulado> {
  const r: Record<CategoriaOc | 'todas', Acumulado> = {
    pendiente: { n: 0, soles: 0 }, observada: { n: 0, soles: 0 }, aprobada: { n: 0, soles: 0 },
    rechazada: { n: 0, soles: 0 }, otra: { n: 0, soles: 0 }, todas: { n: 0, soles: 0 },
  };
  for (const o of lista) {
    const c = categoriaOc(o.estado);
    for (const k of [c, 'todas'] as const) {
      r[k].n += 1;
      r[k].soles += soles(o.total_pen);
    }
  }
  return r;
}

const esAccionable = (o: OrdenCompra) => {
  const c = categoriaOc(o.estado);
  return c === 'pendiente' || c === 'observada';
};

const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

/** Mismo día del mes anterior (29/10 → 29/09); si el mes anterior es más corto, su último día */
function mesAtras(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const anio = m === 1 ? y - 1 : y;
  const mes = m === 1 ? 12 : m - 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

const fechaDe = (o: OrdenCompra) => String(o.fecha ?? '').slice(0, 10);

/** Tarjeta de una orden, con el mismo orden que el clásico: código y prioridad, importe, datos de la orden, proveedor, solicitante, motivo y acciones */
function TarjetaOrden({ o, puedeAccionar, onDetalle, onAccion }: {
  o: OrdenCompra;
  puedeAccionar: boolean;
  onDetalle: () => void;
  onAccion: (tipo: AccionOc) => void;
}) {
  const cat = categoriaOc(o.estado);
  const urgente = prioridadUrgente(o.prioridad);
  const accionable = esAccionable(o) && puedeAccionar;
  const solicitante = nombreLimpio(o.solicitante || o.autoriza || o.creador_nombre || o.creado_por);
  return (
    <article className={`ga-card ga-card--${cat}`}>
      <div>
        <div className="ga-card__cab">
          <div className="ga-card__izq">
            <button type="button" className="ga-codigo" onClick={onDetalle} title="Ver detalle">
              <Eye size={12} aria-hidden style={{ verticalAlign: '-1px', marginRight: 4 }} />{o.id}
            </button>
            <span className={`ga-prio ${urgente ? 'ga-prio--urgente' : ''}`}>{urgente ? 'URGENTE' : 'NORMAL'}</span>
          </div>
          <div className="ga-importe">
            <div className="ga-importe__etiqueta">IMPORTE</div>
            <div className="ga-importe__valor">{formatMoneda(o.total_oc, o.moneda)}</div>
          </div>
        </div>

        <div className="ga-meta" style={{ marginTop: 'var(--s-3)' }}>
          <span><CalendarDays size={12} aria-hidden style={{ verticalAlign: '-1px' }} /> {formatFechaPe(o.fecha)}</span>
          <span><User size={12} aria-hidden style={{ verticalAlign: '-1px' }} /> <b>{nombreLimpio(o.creador_nombre || o.creado_por)}</b></span>
          <span className="ga-cc"><Building2 size={11} aria-hidden style={{ verticalAlign: '-1px' }} /> {o.centro_costo || 'CC-100'}</span>
          <span>Sede Principal</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', marginTop: 'var(--s-3)' }}>
          <div className="ga-bloque">
            <span className="ga-bloque__etiqueta">Proveedor</span>
            <span className="ga-bloque__valor" title={o.proveedor_nombre || ''}>{o.proveedor_nombre || 'Sin proveedor'}</span>
            {o.proveedor_ruc && o.proveedor_ruc !== '-' && <span className="ga-bloque__sub">RUC: {o.proveedor_ruc}</span>}
          </div>
          <div className="ga-bloque">
            <span className="ga-bloque__etiqueta">Solicitante / destino</span>
            <span className="ga-bloque__valor">{solicitante}</span>
            <span className="ga-bloque__sub">{o.placa ? `Placa ${o.placa}` : 'Sede Principal / Almacén'}</span>
          </div>
          <div className="ga-motivo">
            <span className="ga-motivo__etiqueta">Motivo</span>
            <div className="ga-motivo__texto" title={o.motivo_entrada || o.observaciones || ''}>{o.motivo_entrada || o.observaciones || 'Sin motivo especificado'}</div>
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
            <button type="button" className="ga-btn ga-btn--rechazar" onClick={() => onAccion('rechazar')}>
              <XCircle size={14} aria-hidden /> DENEGAR
            </button>
          </div>
        ) : chipEstado(o.estado)}
      </div>
    </article>
  );
}

export function AprobacionesOCPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  // Solo lectura: sin estos permisos la lista y el detalle se ven, pero no hay botones de decisión.
  const puedeAccionar = can('gerencia_aprobaciones_oc.editar');
  const movil = useMediaQuery(QUERY_MOVIL);

  const [desde, setDesde] = useState(() => mesAtras(hoyLima()));
  const [hasta, setHasta] = useState(() => hoyLima());
  const [busqueda, setBusqueda] = useState('');
  const [pestana, setPestana] = useState<Pestana>('pendientes');
  const [vista, setVista] = useState<Vista>('tarjetas');
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [accion, setAccion] = useState<{ tipo: AccionOc; orden: OrdenCompra } | null>(null);
  const [comentario, setComentario] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [errCampo, setErrCampo] = useState<string | undefined>();
  const [errAccion, setErrAccion] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const { data, isLoading, isError, error } = useOrdenesCompra();
  const lista = useMemo(() => data ?? [], [data]);

  // Órdenes dentro del rango de fechas: los indicadores y las pestañas salen de aquí
  const enRango = useMemo(() => lista.filter(o => {
    const f = fechaDe(o);
    return (!desde || f >= desde) && (!hasta || f <= hasta);
  }), [lista, desde, hasta]);

  const resumen = useMemo(() => resumir(enRango), [enRango]);
  const detalle = detalleId ? lista.find(o => o.id === detalleId) ?? null : null;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    let base = enRango;
    if (pestana !== 'todas') {
      const cats = CATEGORIAS_PESTANA[pestana];
      base = base.filter(o => cats.includes(categoriaOc(o.estado)));
    }
    if (q) {
      base = base.filter(o =>
        [o.id, o.proveedor_nombre, o.proveedor_ruc, o.solicitante, o.placa, o.motivo_entrada, o.centro_costo]
          .some(v => String(v ?? '').toUpperCase().includes(q)),
      );
    }
    return base;
  }, [enRango, pestana, busqueda]);

  const contador = (p: Pestana) => {
    if (p === 'todas') return enRango.length;
    return CATEGORIAS_PESTANA[p].reduce((s, c) => s + resumen[c].n, 0);
  };

  const indicadores: Array<{ tono: string; etiqueta: string; pill: string; acum: Acumulado; pie: string }> = [
    { tono: 'ambar', etiqueta: 'Pendientes', pill: 'Por revisar', acum: resumen.pendiente, pie: 'Importe acumulado' },
    { tono: 'verde', etiqueta: 'Aprobadas', pill: 'Autorizadas', acum: resumen.aprobada, pie: 'Monto autorizado' },
    { tono: 'indigo', etiqueta: 'Observadas', pill: 'Esperando datos', acum: resumen.observada, pie: 'En evaluación' },
    { tono: 'rojo', etiqueta: 'Rechazadas', pill: 'Desestimadas', acum: resumen.rechazada, pie: 'Ahorro / no ejecutado' },
  ];

  const pestanas: Array<{ key: Pestana; etiqueta: string }> = [
    { key: 'todas', etiqueta: 'Todos' },
    { key: 'pendientes', etiqueta: 'Pendientes / Observadas' },
    { key: 'aprobadas', etiqueta: 'Aprobadas' },
    { key: 'rechazadas', etiqueta: 'Rechazadas' },
  ];

  function abrirAccion(tipo: AccionOc, orden: OrdenCompra) {
    if (!puedeAccionar) return;
    haptic('selection');
    setMsg(null);
    setErrAccion(null);
    setErrCampo(undefined);
    setComentario('');
    setConfirmado(false);
    setAccion({ tipo, orden });
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
    const { tipo, orden } = accion;
    const texto = comentario.trim();
    if (tipo === 'aprobar' && !confirmado) return;
    if (tipo !== 'aprobar' && !texto) {
      setErrCampo(tipo === 'rechazar'
        ? 'Escribe el motivo del rechazo.'
        : 'Escribe qué sustento técnico o cotización alternativa necesitas del solicitante.');
      haptic('warning');
      return;
    }
    setProcesando(true);
    setErrAccion(null);
    try {
      await decidirOrden(orden.id, DECISION[tipo], texto);
      setMsg({ tipo: 'ok', texto: `Orden ${orden.id} ${PASADO[tipo]} correctamente.` });
      haptic(tipo === 'aprobar' ? 'success' : 'warning');
      setDetalleId(null);
      cerrarAccion();
      await qc.invalidateQueries({ queryKey: CLAVE_OC });
      // Una orden aprobada pasa a la bandeja de Tesorería › Pago de requerimientos
      qc.invalidateQueries({ queryKey: ['tesoreria', 'pago-req'] });
    } catch (e) {
      setErrAccion(errorMessage(e));
      haptic('warning');
    } finally {
      setProcesando(false);
    }
  }

  function limpiarFiltros() {
    setDesde(mesAtras(hoyLima()));
    setHasta(hoyLima());
    setBusqueda('');
    setPestana('todas');
  }

  function accionesCelda(o: OrdenCompra) {
    if (esAccionable(o) && puedeAccionar) {
      return (
        <div className="gerencia-acciones-fila">
          <button type="button" className="gerencia-accion gerencia-accion--aprobar pressable" onClick={() => abrirAccion('aprobar', o)}>
            <CheckCircle size={14} aria-hidden /> Autorizar
          </button>
          <button type="button" className="gerencia-accion gerencia-accion--rechazar pressable" onClick={() => abrirAccion('rechazar', o)}>
            <XCircle size={14} aria-hidden /> Denegar
          </button>
        </div>
      );
    }
    return chipEstado(o.estado);
  }

  const pendientes = resumen.pendiente;
  const hayFiltros = desde !== mesAtras(hoyLima()) || hasta !== hoyLima() || !!busqueda || pestana !== 'todas';

  return (
    <Page>
      <div className="ga-page">
        {/* Cabecera */}
        <header className="ga-cab">
          <div>
            <span className="ga-pill"><ShieldCheck size={13} aria-hidden /> Dirección ejecutiva</span>
            <h1 className="ga-titulo">Aprobación de Órdenes de Compra</h1>
            <p className="ga-sub">
              Bandeja gerencial para autorización, validación de presupuestos y toma de decisiones en compras y adquisiciones
              {pendientes.n > 0 ? ` · ${pendientes.n} pendientes` : ''}
            </p>
          </div>
          <div className="ga-acciones">
            <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => { void qc.invalidateQueries({ queryKey: CLAVE_OC }); }}>
              Actualizar
            </Button>
            <div className="ga-vista" role="group" aria-label="Forma de la lista">
              <button type="button" aria-pressed={vista === 'tabla'} title="Lista" aria-label="Ver como lista" onClick={() => setVista('tabla')}><List size={16} /></button>
              <button type="button" aria-pressed={vista === 'tarjetas'} title="Tarjetas" aria-label="Ver como tarjetas" onClick={() => setVista('tarjetas')}><LayoutGrid size={16} /></button>
            </div>
            <MenuOtros opciones={[
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('gerencia/aprobaciones-oc') },
            ]} />
          </div>
        </header>

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
          <>
            {/* Indicadores */}
            <div className="ga-kpis">
              {indicadores.map(k => (
                <div key={k.etiqueta} className={`ga-kpi ga-kpi--${k.tono}`}>
                  <div className="ga-kpi__cab">
                    <span className="ga-kpi__etiqueta">{k.etiqueta}</span>
                    <span className="ga-kpi__pill">{k.pill}</span>
                  </div>
                  <span className="ga-kpi__valor">{k.acum.n}</span>
                  <span className="ga-kpi__unidad">{k.acum.n === 1 ? 'orden' : 'órdenes'}</span>
                  <div className="ga-kpi__pie">
                    <span>{k.pie}:</span>
                    <b>{formatSoles(k.acum.soles)}</b>
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
                <div className="ga-campo ga-buscar">
                  <span className="ga-campo__etiqueta">Búsqueda rápida</span>
                  <input
                    type="search"
                    className="input"
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar por N° OC, proveedor, RUC, solicitante o placa…"
                    aria-label="Buscar órdenes"
                  />
                </div>
              </div>
              <div className="ga-tabs" role="group" aria-label="Filtrar por estado">
                {pestanas.map(p => (
                  <button key={p.key} type="button" className="ga-tab" aria-pressed={pestana === p.key} onClick={() => { haptic('selection'); setPestana(p.key); }}>
                    {p.etiqueta} <span className="ga-tab__n">{contador(p.key)}</span>
                  </button>
                ))}
                {hayFiltros && <button type="button" className="ga-limpiar" onClick={limpiarFiltros}>Limpiar filtros</button>}
              </div>
            </div>

            {/* Órdenes */}
            {visibles.length === 0 ? (
              <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
                <button type="button" className="placas-limpiar" onClick={limpiarFiltros}>Limpiar filtros</button>
              </EmptyState>
            ) : vista === 'tabla' && !movil ? (
              <div className="gerencia-tabla-wrap">
                <table className="gerencia-tabla">
                  <thead>
                    <tr>
                      {['Acción', 'Fecha', 'Usuario', 'Orden compra', 'Centro costo', 'Motivo / justificación', 'Solicitante', 'Proveedor', 'Importe'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map(o => (
                      <tr key={o.id}>
                        <td>{accionesCelda(o)}</td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--label-2)' }}>{formatFechaPe(o.fecha)}</td>
                        <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{nombreLimpio(o.creador_nombre || o.creado_por)}</td>
                        <td>
                          <button type="button" className="gerencia-codigo" onClick={() => setDetalleId(o.id)} title="Ver detalle de la orden">{o.id}</button>
                        </td>
                        <td><span className="gerencia-chip">{o.centro_costo || '—'}</span></td>
                        <td>
                          <div className="gerencia-celda-recorte" title={o.motivo_entrada || o.observaciones || ''}>
                            {o.motivo_entrada || o.observaciones || 'Sin motivo'}
                          </div>
                        </td>
                        <td>{nombreLimpio(o.solicitante || o.autoriza || o.creador_nombre || o.creado_por)}</td>
                        <td>{o.proveedor_nombre || 'Sin proveedor'}</td>
                        <td className="gerencia-tabla__num">{formatMoneda(o.total_oc, o.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="ga-grid">
                {visibles.map(o => (
                  <TarjetaOrden
                    key={o.id}
                    o={o}
                    puedeAccionar={puedeAccionar}
                    onDetalle={() => setDetalleId(o.id)}
                    onAccion={tipo => abrirAccion(tipo, o)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <DetalleOcSheet
        orden={detalle}
        onClose={() => setDetalleId(null)}
        puedeAccionar={puedeAccionar}
        onAccion={abrirAccion}
      />

      {accion && (
        <ConfirmarDecisionSheet
          open={!!accion}
          tipo={accion.tipo}
          orden={accion.orden}
          comentario={comentario}
          onComentario={v => { setComentario(v); setErrCampo(undefined); }}
          confirmado={confirmado}
          onConfirmado={setConfirmado}
          procesando={procesando}
          errAccion={errAccion}
          errCampo={errCampo}
          onCerrar={cerrarAccion}
          onConfirmar={confirmarAccion}
        />
      )}
    </Page>
  );
}
