import '../mantenimiento/mant.css';
import './gerencia.css';
import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowUpRight, CheckCircle, ClipboardCheck, SearchX, XCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { Sheet } from '../../core/ui/Sheet';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { abrirClasico } from '../../core/layout/navigation';
import { formatFechaPe, formatMoneda, formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { CLAVE_OC, categoriaOc, decidirOrden, useOrdenesCompra, type CategoriaOc, type DecisionOc, type OrdenCompra } from './api';
import { DetalleOcSheet, type AccionOc } from './DetalleOcSheet';
import { chipEstado, nombreLimpio, prioridadUrgente } from './presentacion';

// Celular: menos de 768 px (guía de aprobaciones). Ahí la lista son tarjetas, no tabla.
const QUERY_MOVIL = '(max-width: 767px)';

type Filtro = 'pendientes' | 'aprobadas' | 'observadas' | 'rechazadas' | 'todas';

const FILTRO_CATEGORIA: Record<Exclude<Filtro, 'todas'>, CategoriaOc> = {
  pendientes: 'pendiente',
  aprobadas: 'aprobada',
  observadas: 'observada',
  rechazadas: 'rechazada',
};

const TITULO_ACCION: Record<AccionOc, string> = {
  aprobar: 'Aprobar orden de compra',
  rechazar: 'Rechazar orden de compra',
  observar: 'Observar orden de compra',
};

const ETIQUETA_BOTON: Record<AccionOc, string> = {
  aprobar: 'Aprobar orden',
  rechazar: 'Rechazar orden',
  observar: 'Enviar observación',
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

function resumir(lista: OrdenCompra[]): Record<CategoriaOc | 'todas', Acumulado> {
  const r: Record<CategoriaOc | 'todas', Acumulado> = {
    pendiente: { n: 0, soles: 0 }, observada: { n: 0, soles: 0 }, aprobada: { n: 0, soles: 0 },
    rechazada: { n: 0, soles: 0 }, otra: { n: 0, soles: 0 }, todas: { n: 0, soles: 0 },
  };
  for (const o of lista) {
    const c = categoriaOc(o.estado);
    for (const k of [c, 'todas'] as const) {
      r[k].n += 1;
      r[k].soles += o.total_pen;
    }
  }
  return r;
}

const esAccionable = (o: OrdenCompra) => {
  const c = categoriaOc(o.estado);
  return c === 'pendiente' || c === 'observada';
};

export function AprobacionesOCPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  // Solo lectura: sin estos permisos la lista y el detalle se ven, pero no hay botones de decisión.
  const puedeAccionar = can('gerencia_aprobaciones_oc.editar');
  const movil = useMediaQuery(QUERY_MOVIL);

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
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
  const resumen = useMemo(() => resumir(lista), [lista]);
  const detalle = detalleId ? lista.find(o => o.id === detalleId) ?? null : null;

  // Con texto escrito, la búsqueda recorre todas las órdenes (como antes); sin texto, aplica el filtro de los KPI.
  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    if (q) {
      return lista.filter(o =>
        [o.id, o.proveedor_nombre, o.proveedor_ruc, o.solicitante, o.placa, o.motivo_entrada, o.centro_costo]
          .some(v => String(v ?? '').toUpperCase().includes(q)),
      );
    }
    if (filtro === 'todas') return lista;
    return lista.filter(o => categoriaOc(o.estado) === FILTRO_CATEGORIA[filtro]);
  }, [lista, busqueda, filtro]);

  const kpis: Array<{ key: Filtro; etiqueta: string; acum: Acumulado; color: string }> = [
    { key: 'pendientes', etiqueta: 'Pendientes', acum: resumen.pendiente, color: 'var(--amber-ink)' },
    { key: 'aprobadas', etiqueta: 'Aprobadas', acum: resumen.aprobada, color: 'var(--green-ink)' },
    { key: 'observadas', etiqueta: 'Observadas', acum: resumen.observada, color: 'var(--blue-ink)' },
    { key: 'rechazadas', etiqueta: 'Rechazadas', acum: resumen.rechazada, color: 'var(--red-ink)' },
    { key: 'todas', etiqueta: 'Total', acum: resumen.todas, color: 'var(--label-1)' },
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

  function accionesCelda(o: OrdenCompra) {
    if (esAccionable(o) && puedeAccionar) {
      return (
        <div className="gerencia-acciones-fila">
          <button type="button" className="gerencia-accion gerencia-accion--aprobar pressable" onClick={() => abrirAccion('aprobar', o)}>
            <CheckCircle size={14} aria-hidden /> Aprobar
          </button>
          <button type="button" className="gerencia-accion gerencia-accion--rechazar pressable" onClick={() => abrirAccion('rechazar', o)}>
            <XCircle size={14} aria-hidden /> Rechazar
          </button>
        </div>
      );
    }
    return chipEstado(o.estado);
  }

  const pendientes = resumen.pendiente;
  const titulo = accion ? TITULO_ACCION[accion.tipo] : '';

  return (
    <Page>
      <PageHeader
        eyebrow="Gerencia"
        title="Aprobación de compras"
        subtitle={pendientes.n > 0 ? `${pendientes.n} pendientes · ${formatSoles(pendientes.soles)}` : 'Sin pendientes'}
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
                <span className="gerencia-kpi__valor">{k.acum.n}</span>
                <span className="gerencia-kpi__etiqueta">{k.etiqueta}</span>
                <span className="gerencia-kpi__monto">{formatSoles(k.acum.soles)}</span>
              </button>
            ))}
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Buscar por código, proveedor, RUC, solicitante o placa…" />

          {visibles.length === 0 ? (
            <EmptyState icon={<SearchX size={22} />} title="Sin coincidencias">
              <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Limpiar</button>
            </EmptyState>
          ) : movil ? (
            <div className="gerencia-lista-tarjetas">
              {visibles.map(o => (
                <article key={o.id} className="gerencia-tarjeta">
                  <button type="button" className="gerencia-tarjeta__cuerpo pressable" onClick={() => setDetalleId(o.id)} aria-label={`Ver detalle de ${o.id}`}>
                    <span className="gerencia-tarjeta__fila">
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-ink)' }}>{o.id}</span>
                      {chipEstado(o.estado)}
                    </span>
                    <span className="gerencia-tarjeta__proveedor">{o.proveedor_nombre || 'Sin proveedor'}</span>
                    <span className="gerencia-tarjeta__fila" style={{ marginTop: 4 }}>
                      <span className="gerencia-tarjeta__meta" style={{ marginTop: 0 }}>
                        {formatFechaPe(o.fecha)} · {o.solicitante || o.autoriza || o.creador_nombre || '—'}
                      </span>
                      <span className="gerencia-tarjeta__importe">{formatMoneda(o.total_oc, o.moneda)}</span>
                    </span>
                    <span className="gerencia-tarjeta__meta">{o.motivo_entrada || o.observaciones || 'Sin motivo especificado'}</span>
                    <span style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <span className={`gerencia-chip ${prioridadUrgente(o.prioridad) ? 'gerencia-chip--urgente' : ''}`}>
                        {prioridadUrgente(o.prioridad) ? 'URGENTE' : 'NORMAL'}
                      </span>
                      {o.placa && <span className="gerencia-chip">{o.placa}</span>}
                    </span>
                  </button>
                  {esAccionable(o) && puedeAccionar && (
                    <div className="gerencia-tarjeta__acciones">
                      <button type="button" className="gerencia-accion gerencia-accion--aprobar pressable" onClick={() => abrirAccion('aprobar', o)}>
                        <CheckCircle size={16} aria-hidden /> Aprobar
                      </button>
                      <button type="button" className="gerencia-accion gerencia-accion--rechazar pressable" onClick={() => abrirAccion('rechazar', o)}>
                        <XCircle size={16} aria-hidden /> Rechazar
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
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
                      <td>{o.solicitante || o.autoriza || o.creador_nombre || '—'}</td>
                      <td>{o.proveedor_nombre || 'Sin proveedor'}</td>
                      <td className="gerencia-tabla__num">{formatMoneda(o.total_oc, o.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <DetalleOcSheet
        orden={detalle}
        onClose={() => setDetalleId(null)}
        puedeAccionar={puedeAccionar}
        onAccion={abrirAccion}
      />

      {/* Confirmación de la decisión (se abre encima del detalle) */}
      <Sheet
        open={!!accion}
        onClose={cerrarAccion}
        title={titulo}
        footer={accion && (
          <>
            <Button variant="secondary" onClick={cerrarAccion}>Cancelar</Button>
            <Button
              variant={accion.tipo === 'aprobar' ? 'primary' : accion.tipo === 'rechazar' ? 'danger' : 'secondary'}
              onClick={confirmarAccion}
              loading={procesando}
              disabled={accion.tipo === 'aprobar' && !confirmado}
            >
              {ETIQUETA_BOTON[accion.tipo]}
            </Button>
          </>
        )}
      >
        {accion && (
          <div className="gerencia-ficha" style={{ gap: 'var(--s-4)' }}>
            <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--label-2)' }}>
              Orden <strong style={{ color: 'var(--label-1)' }}>{accion.orden.id}</strong>
              {' · '}{accion.orden.proveedor_nombre || 'Sin proveedor'}
              {' · '}<strong style={{ color: 'var(--label-1)' }}>{formatMoneda(accion.orden.total_oc, accion.orden.moneda)}</strong>
            </p>

            {accion.tipo === 'aprobar' && (
              <>
                <label className="gerencia-confirmar">
                  <input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} />
                  Confirmo realizar la autorización
                </label>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--label-2)' }}>
                  Se traspasarán estos datos a Pagos de requerimientos en Tesorería.
                </p>
              </>
            )}

            <Field
              label={accion.tipo === 'aprobar'
                ? 'Comentario (opcional)'
                : accion.tipo === 'rechazar' ? 'Motivo del rechazo (obligatorio)' : 'Sustento o cotización que falta (obligatorio)'}
              error={errCampo}
            >
              {p => (
                <textarea
                  {...p}
                  value={comentario}
                  onChange={e => { setComentario(e.target.value); setErrCampo(undefined); }}
                  placeholder={accion.tipo === 'observar' ? 'Qué sustento técnico o cotización alternativa necesitas…' : 'Observación o motivo…'}
                  rows={3}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid var(--separator)', background: 'var(--fill-1)', color: 'var(--label-1)', padding: '8px 10px', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }}
                />
              )}
            </Field>

            {errAccion && <Notice tone="error">{errAccion}</Notice>}
          </div>
        )}
      </Sheet>
    </Page>
  );
}
