import './almacen.css';
import './recepcion.css';
import '../../core/ui/botonesIcono.css';
import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Clock, Eye, FileSpreadsheet, FileText, Hourglass, ImageIcon, PackagePlus, RefreshCw, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { KpiTarjeta } from '../../core/ui/KpiTarjeta';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { formatDolares, formatFechaHoraPe, formatFechaPe, formatSoles } from '../../core/lib/format';
import { eliminarRecepcion, useRecepcionesOC, type HistorialRecepcion, type RecepcionOC } from './api';
import { RegistrarRecepcion } from './RegistrarRecepcion';

type FiltroEstado = 'TODOS' | 'PENDIENTE' | 'PARCIAL' | 'COMPLETO';
type Tono = 'red' | 'amber' | 'green';

// Mismos estados y nombres que el clásico (pendiente / en recepción / finalizada)
const OPCIONES_FILTRO: Array<{ value: FiltroEstado; label: string }> = [
  { value: 'TODOS', label: 'Todas' },
  { value: 'PENDIENTE', label: 'Pendientes' },
  { value: 'PARCIAL', label: 'En recepción' },
  { value: 'COMPLETO', label: 'Finalizadas' },
];
const KPIS: Array<{ filtro: FiltroEstado; etiqueta: string; icono: ReactNode; tono?: 'ok' | 'warning' | 'critical' }> = [
  { filtro: 'TODOS', etiqueta: 'Total órdenes', icono: <FileText size={18} /> },
  { filtro: 'PENDIENTE', etiqueta: 'Pendientes', icono: <Clock size={18} />, tono: 'critical' },
  { filtro: 'PARCIAL', etiqueta: 'En recepción', icono: <Hourglass size={18} />, tono: 'warning' },
  { filtro: 'COMPLETO', etiqueta: 'Finalizadas', icono: <CircleCheck size={18} />, tono: 'ok' },
];
const TABLA_QUERY = '(min-width: 768px)';
const COLUMNAS: ColumnaTabla[] = [
  { id: 'acciones', titulo: 'Acciones', ancho: 96, minimo: 84, alinear: 'center' },
  { id: 'fecha', titulo: 'Fecha', ancho: 110 },
  { id: 'orden', titulo: 'Orden de compra', ancho: 140 },
  { id: 'estado', titulo: 'Recepción', ancho: 116, alinear: 'center' },
  { id: 'proveedor', titulo: 'Proveedor', ancho: 240 },
  { id: 'solicitante', titulo: 'Solicitante', ancho: 150 },
  { id: 'condicion', titulo: 'Condición', ancho: 120 },
  { id: 'importe', titulo: 'Importe', ancho: 130, alinear: 'right' },
  { id: 'avance', titulo: 'Avance', ancho: 150 },
  { id: 'sustentos', titulo: 'Evidencias', ancho: 130, alinear: 'center' },
];
const TONO_ESTADO: Record<string, Tono> = { PENDIENTE: 'red', PARCIAL: 'amber', COMPLETO: 'green' };
const ETIQUETA_ESTADO: Record<string, string> = { PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', COMPLETO: 'Completo' };
/** Evidencias de una OC: cuántos archivos tienen en total sus entregas */
const totalEvidencias = (oc: RecepcionOC) => oc.historial_recepciones.reduce((s, h, i, a) => (a.findIndex(x => x.recepcion_id === h.recepcion_id) === i ? s + (h.sustentos?.length ?? (h.sustento_url_presigned ? 1 : 0)) : s), 0);

const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(2));
const esCredito = (c: string | null | undefined) => /cr[eé]dito/i.test(c ?? '');
const condicionTexto = (oc: RecepcionOC) =>
  esCredito(oc.condicion_pago) ? `Crédito${oc.dias_credito ? ` (${oc.dias_credito} días)` : ''}` : 'Contado';
const estadoOcTexto = (e: string | null | undefined) => {
  const s = String(e || 'REGISTRADO').toUpperCase();
  return s === 'PROCESADA' ? 'PROCESADO' : s;
};
/** La fecha de la O/C llega del servidor ya formateada: si no se puede leer, se muestra tal cual (como el clásico) */
const fechaTexto = (f: string | null | undefined) => {
  const t = formatFechaPe(f);
  return t === '—' && f ? f : t;
};
const avance = (oc: RecepcionOC) => ({
  rec: oc.total_recibido,
  ped: oc.total_pedido,
  pct: oc.total_pedido > 0 ? Math.min(100, Math.round((oc.total_recibido / oc.total_pedido) * 100)) : 0,
});

/**
 * Importe de la O/C. El servidor manda `importe` siempre en soles (total_pen). En dólares se muestra
 * en US$ con el tipo de cambio de la compra; sin ese TC se muestra en soles (el clásico lo mostraba
 * como US$ con un monto en soles).
 */
function importeOC(oc: RecepcionOC): { principal: string; detalle: string | null } {
  if (String(oc.moneda).toUpperCase() !== 'USD') return { principal: formatSoles(oc.importe), detalle: null };
  const tc = Number(oc.tipo_cambio) || 0;
  if (tc > 0) return { principal: formatDolares(oc.importe / tc), detalle: `Equivale a ${formatSoles(oc.importe)} · TC ${tc.toFixed(3)}` };
  return { principal: formatSoles(oc.importe), detalle: 'Sin tipo de cambio registrado: importe en soles' };
}

/** Búsqueda rápida: N° de O/C, proveedor, solicitante, estado de la O/C, y ítems (descripción o código) */
function coincide(o: RecepcionOC, q: string) {
  if (!q) return true;
  const u = (s: string | number | null | undefined) => String(s ?? '').toUpperCase();
  return u(o.id).includes(q) || u(o.proveedor).includes(q) || u(o.solicitante).includes(q) || u(o.estado_oc).includes(q)
    || o.items.some(it => u(it.descripcion).includes(q) || u(it.inventario_id).includes(q));
}

export function RecepcionComprasPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, error } = useRecepcionesOC();
  const { user, can } = useAuth();
  const [filtro, setFiltro] = useState<FiltroEstado>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionadaId, setSeleccionadaId] = useState<string | number | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const esTabla = useMediaQuery(TABLA_QUERY);

  const puedeRecibir = can('rec_compras.crear', 'ent_inv.crear');
  const puedeRevertir = can('rec_compras.eliminar', 'ent_inv.eliminar');

  const ocs = data ?? [];
  // Se busca por id para que el detalle se actualice solo tras registrar o revertir
  const seleccionada = seleccionadaId == null ? null : ocs.find(o => String(o.id) === String(seleccionadaId)) ?? null;

  const cuenta = useMemo<Record<FiltroEstado, number>>(() => {
    const lista = data ?? [];
    return {
      TODOS: lista.length,
      PENDIENTE: lista.filter(o => o.estado_recepcion === 'PENDIENTE').length,
      PARCIAL: lista.filter(o => o.estado_recepcion === 'PARCIAL').length,
      COMPLETO: lista.filter(o => o.estado_recepcion === 'COMPLETO').length,
    };
  }, [data]);

  const q = busqueda.trim().toUpperCase();
  const visibles = ocs.filter(o => (filtro === 'TODOS' || o.estado_recepcion === filtro) && coincide(o, q));

  function actualizar() {
    haptic('selection');
    void qc.invalidateQueries({ queryKey: ['almacen', 'recepciones-oc'] });
  }

  async function exportar() {
    if (!visibles.length) { toast('No hay órdenes para exportar', 'error'); return; }
    try {
      await exportarExcel('Recepciones-compras', 'Recepciones',
        ['Orden', 'Fecha', 'Proveedor', 'Solicitante', 'Condición pago', 'Importe', 'Moneda', 'Estado OC', 'Estado recepción', 'Total pedido', 'Total recibido', 'Pendiente'],
        visibles.map(o => [o.id, fechaTexto(o.fecha), o.proveedor, o.solicitante, o.condicion_pago ?? 'Al contado', o.importe, o.moneda, o.estado_oc, o.estado_recepcion,
          o.total_pedido, o.total_recibido, Math.max(0, o.total_pedido - o.total_recibido)]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  function abrirOC(id: string | number, registrar: boolean) {
    haptic('selection');
    setSeleccionadaId(id);
    setRegistrando(registrar);
  }

  return (
    <Page>
      {!seleccionada && (
        <PageHeader
          eyebrow="Almacén"
          title="Recepción de compras"
          subtitle={isLoading ? 'Cargando…' : `${ocs.length} órdenes · ${cuenta.PENDIENTE} pendientes · ${cuenta.PARCIAL} en recepción`}
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn--secondary btn--icon btn-tip btn-tip--verde" data-tip="Exportar a Excel" aria-label="Exportar a Excel" onClick={exportar}><FileSpreadsheet size={17} /></button>
              <button type="button" className="btn btn--secondary btn--icon btn-tip btn-tip--celeste" data-tip="Actualizar" aria-label="Actualizar" onClick={actualizar}><RefreshCw size={17} /></button>
            </div>
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : seleccionada ? (
        <>
          <RecepcionDetalle
            oc={seleccionada}
            puedeRecibir={puedeRecibir}
            puedeRevertir={puedeRevertir}
            onRecepcionar={() => setRegistrando(true)}
            onVolver={() => { setRegistrando(false); setSeleccionadaId(null); }}
          />
          <RegistrarRecepcion oc={seleccionada} usuario={user?.name ?? ''} open={registrando} onClose={() => setRegistrando(false)} />
        </>
      ) : (
        <div>
          <div className="inv-kpis" style={{ marginBottom: 'var(--s-4)' }}>
            {KPIS.map(k => (
              <KpiTarjeta key={k.filtro} etiqueta={k.etiqueta} valor={String(cuenta[k.filtro])} icono={k.icono} tono={k.tono === 'critical' ? undefined : k.tono}
                sub={k.filtro === 'TODOS' ? 'Órdenes de compra' : k.filtro === 'PENDIENTE' ? 'Sin recibir nada' : k.filtro === 'PARCIAL' ? 'Entregas incompletas' : 'Recibidas por completo'}
                onClick={() => { haptic('selection'); setFiltro(k.filtro); }} activo={filtro === k.filtro} />
            ))}
          </div>

          <div className="aud2-filtros" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Orden, proveedor, solicitante o artículo…" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', alignItems: 'center' }}>
              <SegmentedControl label="Filtrar por estado" value={filtro} onChange={setFiltro} options={OPCIONES_FILTRO.map(o => ({ ...o, label: `${o.label} (${cuenta[o.value]})` }))} />
              <span className="badge" style={{ marginLeft: 'auto' }}>{visibles.length} {visibles.length === 1 ? 'orden' : 'órdenes'}</span>
            </div>
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <PackagePlus size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin órdenes para este filtro'}>
              {busqueda && <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>}
            </EmptyState>
          ) : esTabla ? (
            <TablaRedimensionable id="almacen-recepciones" columnas={COLUMNAS} ariaLabel="Recepción de compras" altoMax="68vh">
              {visibles.map(oc => {
                const tono = TONO_ESTADO[oc.estado_recepcion] ?? 'amber';
                const av = avance(oc);
                const imp = importeOC(oc);
                const falta = oc.estado_recepcion !== 'COMPLETO';
                const ev = totalEvidencias(oc);
                return (
                  <tr key={String(oc.id)}>
                    <Celda alinear="center">
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" className="btn btn--secondary btn--icon btn--sm btn-tip btn-tip--azul" data-tip="Ver detalle" aria-label={`Ver ${String(oc.id)}`} onClick={() => abrirOC(oc.id, false)}><Eye size={16} /></button>
                        {falta && puedeRecibir && (
                          <button type="button" className="btn btn--secondary btn--icon btn--sm btn-tip btn-tip--verde" data-tip="Recepcionar" aria-label={`Recepcionar ${String(oc.id)}`} onClick={() => abrirOC(oc.id, true)}><PackagePlus size={16} /></button>
                        )}
                      </div>
                    </Celda>
                    <Celda>{fechaTexto(oc.fecha)}</Celda>
                    <Celda><button type="button" className="oc-codigo" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-ink)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => abrirOC(oc.id, false)}>{String(oc.id)}</button></Celda>
                    <Celda alinear="center"><span className={`rec-estado rec-estado--${tono}`}>{ETIQUETA_ESTADO[oc.estado_recepcion] ?? oc.estado_recepcion}</span></Celda>
                    <Celda>{oc.proveedor}</Celda>
                    <Celda>{oc.solicitante}</Celda>
                    <Celda><Badge tone={esCredito(oc.condicion_pago) ? 'accent' : 'green'}>{condicionTexto(oc)}</Badge></Celda>
                    <Celda alinear="right"><strong>{imp.principal}</strong></Celda>
                    <Celda>
                      <div className="rec-avance">
                        <span className="rec-avance__barra" aria-hidden><span style={{ width: `${av.pct}%` }} /></span>
                        <span className="rec-avance__texto" style={{ color: `var(--${tono}-ink)` }}>{fmt(av.rec)} / {fmt(av.ped)}</span>
                      </div>
                    </Celda>
                    <Celda alinear="center">{ev > 0 ? <span className="rec-sustento"><ImageIcon size={13} /> {ev}</span> : <span className="rec-sustento rec-sustento--sin">{av.rec > 0 ? 'Sin archivos' : '—'}</span>}</Celda>
                  </tr>
                );
              })}
            </TablaRedimensionable>
          ) : (
            <div className="tarjeta__lista">
              {visibles.map(oc => (
                <FilaOC key={String(oc.id)} oc={oc} puedeRecibir={puedeRecibir}
                  onAbrir={() => abrirOC(oc.id, false)} onRecepcionar={() => abrirOC(oc.id, true)} />
              ))}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

function FilaOC({ oc, puedeRecibir, onAbrir, onRecepcionar }: {
  oc: RecepcionOC; puedeRecibir: boolean; onAbrir: () => void; onRecepcionar: () => void;
}) {
  const tono = TONO_ESTADO[oc.estado_recepcion] ?? 'amber';
  const av = avance(oc);
  const imp = importeOC(oc);
  const falta = oc.estado_recepcion !== 'COMPLETO';
  return (
    <div className="rec-fila">
      <button type="button" className="rec-fila__abrir pressable" onClick={onAbrir}>
        <span className="rec-fila__icono" style={{ background: `var(--${tono}-tint)`, color: `var(--${tono}-ink)` }}>
          <PackagePlus size={16} />
        </span>
        <span className="rec-fila__cuerpo">
          <span className="rec-fila__titulo">{String(oc.id)} · {oc.proveedor}</span>
          <span className="rec-fila__sub">{oc.solicitante} · {fechaTexto(oc.fecha)}</span>
          <span className="rec-fila__etiquetas">
            <Badge tone={esCredito(oc.condicion_pago) ? 'accent' : 'green'}>{condicionTexto(oc)}</Badge>
            <Badge>{estadoOcTexto(oc.estado_oc)}</Badge>
          </span>
        </span>
      </button>
      <span className="rec-fila__derecha">
        <span className="rec-fila__importe">{imp.principal}</span>
        <span className="rec-progreso" aria-hidden><span className="rec-progreso__barra" style={{ width: `${av.pct}%` }} /></span>
        <span className="rec-fila__avance" style={{ color: `var(--${tono}-ink)` }}>
          {ETIQUETA_ESTADO[oc.estado_recepcion] ?? oc.estado_recepcion} {fmt(av.rec)}/{fmt(av.ped)}
        </span>
      </span>
      {falta && puedeRecibir && (
        <Button variant="primary" size="sm" iconOnly icon={<PackagePlus size={16} />} title="Recepcionar"
          aria-label={`Recepcionar ${String(oc.id)}`} onClick={onRecepcionar} />
      )}
    </div>
  );
}

function RecepcionDetalle({ oc, puedeRecibir, puedeRevertir, onRecepcionar, onVolver }: {
  oc: RecepcionOC; puedeRecibir: boolean; puedeRevertir: boolean; onRecepcionar: () => void; onVolver: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [porRevertir, setPorRevertir] = useState<HistorialRecepcion | null>(null);
  const [revirtiendo, setRevirtiendo] = useState(false);

  const tono = TONO_ESTADO[oc.estado_recepcion] ?? 'amber';
  const pendiente = Math.max(0, oc.total_pedido - oc.total_recibido);
  const av = avance(oc);
  const imp = importeOC(oc);

  async function revertir() {
    if (!porRevertir) return;
    setRevirtiendo(true);
    try {
      const r = await eliminarRecepcion(porRevertir.recepcion_id, user?.name ?? '');
      if (r.ok === false) throw new Error(r.error || 'No se pudo revertir la entrega');
      haptic('success');
      toast('Entrega revertida: el stock volvió a su valor anterior');
      setPorRevertir(null);
      await qc.invalidateQueries({ queryKey: ['almacen'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setRevirtiendo(false);
    }
  }

  // El historial viene por renglón: se agrupa por entrega (recepcion_id)
  const entregas = useMemo(() => {
    const m = new Map<number, { cab: HistorialRecepcion; lineas: HistorialRecepcion[] }>();
    for (const h of oc.historial_recepciones) {
      if (!m.has(h.recepcion_id)) m.set(h.recepcion_id, { cab: h, lineas: [] });
      m.get(h.recepcion_id)!.lineas.push(h);
    }
    return [...m.values()].reverse();
  }, [oc.historial_recepciones]);

  return (
    <div className="inv-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Recepciones
        </button>
        <div className="tarjeta__barra-acciones">
          {puedeRecibir && pendiente > 0 && (
            <Button variant="primary" icon={<PackagePlus size={16} />} onClick={onRecepcionar}>Recepcionar</Button>
          )}
        </div>
      </div>

      <div className="inv-ficha__hero" style={{ paddingTop: 'var(--s-2)' }}>
        <div className="inv-ficha__imagen-vacia"><PackagePlus size={28} /></div>
        <span className="inv-ficha__id">{String(oc.id)}</span>
        <h2 className="inv-ficha__nombre">{oc.proveedor}</h2>
        <Badge tone={tono}>{ETIQUETA_ESTADO[oc.estado_recepcion] ?? oc.estado_recepcion}</Badge>
      </div>

      <div className="inv-metricas">
        <div className="inv-metrica"><span className="inv-metrica__num">{fmt(oc.total_pedido)}</span><span className="inv-metrica__label">Pedido</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ color: 'var(--green-ink)' }}>{fmt(oc.total_recibido)}</span><span className="inv-metrica__label">Recibido</span></div>
        <div className="inv-metrica"><span className={`inv-metrica__num${pendiente > 0 ? ' inv-metrica__num--warning' : ''}`}>{fmt(pendiente)}</span><span className="inv-metrica__label">Pendiente</span></div>
      </div>
      <div className="rec-progreso rec-progreso--ancho" role="progressbar" aria-label={`${av.pct}% recibido`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={av.pct}>
        <span className="rec-progreso__barra" style={{ width: `${av.pct}%` }} />
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Datos de la orden</p>
        <div className="tarjeta__lista">
          <div className="dato"><span className="dato__label">Solicitante</span><span className="dato__valor">{oc.solicitante}</span></div>
          <div className="dato"><span className="dato__label">Autoriza</span><span className="dato__valor">{oc.autoriza}</span></div>
          <div className="dato"><span className="dato__label">Condición de pago</span><span className="dato__valor">{condicionTexto(oc)}</span></div>
          <div className="dato"><span className="dato__label">Almacén</span><span className="dato__valor">{oc.almacen}</span></div>
          <div className="dato"><span className="dato__label">Fecha OC</span><span className="dato__valor dato__valor--mono">{fechaTexto(oc.fecha)}</span></div>
          <div className="dato"><span className="dato__label">Estado OC</span><span className="dato__valor">{estadoOcTexto(oc.estado_oc)}</span></div>
          <div className="dato">
            <span className="dato__label">Importe</span>
            <span className="dato__valor" style={{ fontWeight: 700 }}>{imp.principal}</span>
            {imp.detalle && <span className="dato__valor" style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{imp.detalle}</span>}
          </div>
        </div>
      </div>

      {oc.items.length > 0 && (
        <div>
          <p className="tarjeta__grupo-titulo">Artículos ({oc.items.length})</p>
          <div className="tarjeta__lista">
            {oc.items.map((it, i) => (
              <div key={i} className="dato">
                <span className="dato__label" style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{it.descripcion}</span>
                {it.inventario_id && <span className="dato__valor dato__valor--mono" style={{ fontSize: '0.75rem', color: 'var(--accent-ink)' }}>{it.inventario_id}</span>}
                <span className="dato__valor" style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                  Pedido {fmt(it.pedido)} · recibido <span style={{ color: 'var(--green-ink)' }}>{fmt(it.recepcionado)}</span> · pendiente{' '}
                  <strong style={{ color: it.pendiente > 0 ? 'var(--amber-ink)' : 'var(--label-3)' }}>{fmt(it.pendiente)}</strong> {it.unidad}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {entregas.length > 0 && (
        <div>
          <p className="tarjeta__grupo-titulo">Entregas registradas ({entregas.length})</p>
          <div className="tarjeta__lista">
            {entregas.map(({ cab, lineas }) => (
              <div key={cab.recepcion_id} className="dato" style={{ gap: 'var(--s-1)' }}>
                <div className="rec-entregas">
                  <span className="rec-entregas__titulo">
                    {formatFechaHoraPe(cab.fecha_recepcion)} · {cab.tipo_recepcion ?? 'ENTREGA'}
                  </span>
                  {(cab.sustentos?.length ? cab.sustentos : cab.sustento_url_presigned ? [cab.sustento_url_presigned] : []).length ? (
                    <span className="rec-sustentos">
                      {(cab.sustentos?.length ? cab.sustentos : [cab.sustento_url_presigned as string]).map((u, k) => (
                        <a key={k} href={u} target="_blank" rel="noreferrer" className="rec-sustento" aria-label={`Ver evidencia ${k + 1}`}>
                          {/\.pdf(\?|$)/i.test(u) ? <FileText size={13} /> : <ImageIcon size={13} />} {/\.pdf(\?|$)/i.test(u) ? 'Documento' : 'Foto'} {k + 1}
                        </a>
                      ))}
                    </span>
                  ) : (
                    <span className="rec-sustento rec-sustento--sin">Sin archivos</span>
                  )}
                  {puedeRevertir && (
                    <button type="button" className="placas-limpiar" style={{ color: 'var(--red-ink)' }}
                      onClick={() => setPorRevertir(cab)} aria-label="Revertir esta entrega">
                      <Trash2 size={15} style={{ verticalAlign: '-3px' }} /> Revertir
                    </button>
                  )}
                </div>
                {lineas.map(l => (
                  <span key={l.detalle_id} className="dato__valor" style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                    +{fmt(l.cantidad_recibida)} {l.descripcion ?? 'Artículo'}
                  </span>
                ))}
                <span className="dato__valor" style={{ fontSize: '0.75rem', color: 'var(--label-3)' }}>
                  {[cab.usuario, cab.almacen, cab.observacion].filter(Boolean).join(' · ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmSheet
        open={!!porRevertir}
        onClose={() => !revirtiendo && setPorRevertir(null)}
        onConfirm={revertir}
        loading={revirtiendo}
        title="¿Revertir esta entrega?"
        message={porRevertir
          ? `Se descuenta del inventario lo que ingresó la entrega del ${formatFechaHoraPe(porRevertir.fecha_recepcion)} y el saldo vuelve a quedar disponible en la orden.`
          : ''}
        confirmLabel="Revertir"
      />
    </div>
  );
}
