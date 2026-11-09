import './almacen.css';
import './entradas.css';
import './recepcion.css';
import '../../core/ui/botonesIcono.css';
import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Clock, Eye, FileSpreadsheet, FileText, Hourglass, ImageIcon, PackagePlus, RefreshCw, SearchX } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField, SelectInput, TextInput } from '../../core/ui/Field';
import { KpiTarjeta } from '../../core/ui/KpiTarjeta';
import { BotonTip } from '../../core/ui/BotonTip';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { useMediaQuery } from '../../core/lib/useMediaQuery';
import { formatDolares, formatFechaPe, formatSoles } from '../../core/lib/format';
import { useRecepcionesOC, type RecepcionOC } from './api';
import { RegistrarRecepcion } from './RegistrarRecepcion';
import { RecepcionDetalle } from './RecepcionDetalle';
import { hoyLima } from './entradaReglas';

type FiltroEstado = 'TODOS' | 'PENDIENTE' | 'PARCIAL' | 'COMPLETO';
type Vista = 'ordenes' | 'articulos';
type Tono = 'red' | 'amber' | 'green';

// Mismos estados y nombres que el clásico (pendiente / en recepción / finalizada)
const KPIS: Array<{ filtro: FiltroEstado; etiqueta: string; sub: string; icono: ReactNode; tono?: 'ok' | 'warning' }> = [
  { filtro: 'TODOS', etiqueta: 'Total órdenes', sub: 'Del filtro seleccionado', icono: <FileText size={18} /> },
  { filtro: 'PENDIENTE', etiqueta: 'Pendientes', sub: 'Sin recibir nada', icono: <Clock size={18} />, tono: 'warning' },
  { filtro: 'PARCIAL', etiqueta: 'En recepción', sub: 'Entregas incompletas', icono: <Hourglass size={18} />, tono: 'warning' },
  { filtro: 'COMPLETO', etiqueta: 'Finalizadas', sub: 'Recibidas por completo', icono: <CircleCheck size={18} />, tono: 'ok' },
];
const ETIQUETA_FILTRO: Record<FiltroEstado, string> = { TODOS: 'Todas', PENDIENTE: 'Pendientes', PARCIAL: 'En recepción', COMPLETO: 'Finalizadas' };

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
const COLUMNAS_ART: ColumnaTabla[] = [
  { id: 'acciones', titulo: 'Acciones', ancho: 96, minimo: 84, alinear: 'center' },
  { id: 'fecha', titulo: 'Fecha', ancho: 110 },
  { id: 'orden', titulo: 'Orden de compra', ancho: 140 },
  { id: 'estado', titulo: 'Recepción', ancho: 116, alinear: 'center' },
  { id: 'proveedor', titulo: 'Proveedor', ancho: 220 },
  { id: 'codigo', titulo: 'Cód. art.', ancho: 104 },
  { id: 'articulo', titulo: 'Artículo', ancho: 280 },
  { id: 'pedido', titulo: 'Pedido', ancho: 84, alinear: 'right' },
  { id: 'recibido', titulo: 'Recibido', ancho: 90, alinear: 'right' },
  { id: 'pendiente', titulo: 'Pendiente', ancho: 96, alinear: 'right' },
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

/** Mismo día del mes anterior (28/10 → 28/09); si el mes anterior es más corto, el último día de ese mes */
function mesAtras(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const anio = m === 1 ? y - 1 : y;
  const mes = m === 1 ? 12 : m - 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

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
  const [desde, setDesde] = useState(() => mesAtras(hoyLima()));
  const [hasta, setHasta] = useState(() => hoyLima());
  const [vista, setVista] = useState<Vista>('ordenes');
  // Detalle y recepción son cosas distintas: «Recepcionar» abre solo el formulario, sin pasar por el detalle
  const [detalleId, setDetalleId] = useState<string | number | null>(null);
  const [recibiendoId, setRecibiendoId] = useState<string | number | null>(null);
  const esTabla = useMediaQuery(TABLA_QUERY);

  const puedeRecibir = can('rec_compras.crear', 'ent_inv.crear');
  const puedeRevertir = can('rec_compras.eliminar', 'ent_inv.eliminar');

  const ocs = data ?? [];
  // Se busca por id para que el detalle y el formulario se actualicen solos tras registrar o revertir
  const detalle = detalleId == null ? null : ocs.find(o => String(o.id) === String(detalleId)) ?? null;
  const recibiendo = recibiendoId == null ? null : ocs.find(o => String(o.id) === String(recibiendoId)) ?? null;

  const q = busqueda.trim().toUpperCase();
  // Búsqueda y fechas valen para todo (conteos, tarjetas y tabla); el estado solo para la tabla
  const delRango = useMemo(() => ocs.filter(o => {
    if (desde || hasta) {
      const dia = o.fecha_iso ?? '';
      if (desde && dia < desde) return false;
      if (hasta && dia > hasta) return false;
    }
    return coincide(o, q);
  }), [ocs, desde, hasta, q]);

  const cuenta = useMemo<Record<FiltroEstado, number>>(() => ({
    TODOS: delRango.length,
    PENDIENTE: delRango.filter(o => o.estado_recepcion === 'PENDIENTE').length,
    PARCIAL: delRango.filter(o => o.estado_recepcion === 'PARCIAL').length,
    COMPLETO: delRango.filter(o => o.estado_recepcion === 'COMPLETO').length,
  }), [delRango]);

  const visibles = useMemo(() => delRango.filter(o => filtro === 'TODOS' || o.estado_recepcion === filtro), [delRango, filtro]);

  /** Filas de la vista «Por artículo»: un renglón por artículo de cada orden (con la búsqueda aplicada a los artículos) */
  const filasArticulo = useMemo(() => {
    const filas: Array<{ oc: RecepcionOC; it: RecepcionOC['items'][number] | null; k: string }> = [];
    for (const oc of visibles) {
      const cabecera = !q || [oc.id, oc.proveedor, oc.solicitante, oc.estado_oc].some(v => String(v ?? '').toUpperCase().includes(q));
      const items = oc.items.filter(it => cabecera || `${it.descripcion} ${it.inventario_id}`.toUpperCase().includes(q));
      if (!items.length) filas.push({ oc, it: null, k: `${oc.id}-0` });
      items.forEach((it, i) => filas.push({ oc, it, k: `${oc.id}-${i}` }));
    }
    return filas;
  }, [visibles, q]);

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

  const verDetalle = (id: string | number) => { haptic('selection'); setDetalleId(id); };
  const recepcionar = (id: string | number) => { haptic('selection'); setRecibiendoId(id); };
  const quitarFiltros = () => { setBusqueda(''); setDesde(''); setHasta(''); setFiltro('TODOS'); };

  return (
    <Page>
      <PageHeader
          eyebrow="Almacén"
          title="Recepción de compras"
          subtitle={isLoading ? 'Cargando…' : `${ocs.length} órdenes · ${ocs.filter(o => o.estado_recepcion === 'PENDIENTE').length} pendientes · ${ocs.filter(o => o.estado_recepcion === 'PARCIAL').length} en recepción`}
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              <BotonTip tip="Exportar a Excel" className="btn btn--secondary btn--icon btn-tip btn-tip--verde" onClick={exportar}><FileSpreadsheet size={17} /></BotonTip>
              <BotonTip tip="Actualizar" className="btn btn--secondary btn--icon btn-tip btn-tip--celeste" onClick={actualizar}><RefreshCw size={17} /></BotonTip>
            </div>
          }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div>
          <div className="inv-kpis" style={{ marginBottom: 'var(--s-4)' }}>
            {KPIS.map(k => (
              <KpiTarjeta key={k.filtro} etiqueta={k.etiqueta} valor={String(cuenta[k.filtro])} sub={k.sub} icono={k.icono} tono={k.tono}
                onClick={() => { haptic('selection'); setFiltro(k.filtro); }} activo={filtro === k.filtro} />
            ))}
          </div>

          {/* Filtros: igual que Órdenes de compra */}
          <div className="oc-filtros" style={{ marginBottom: 'var(--s-4)' }}>
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Orden, proveedor, solicitante o artículo…" />
            <div className="oc-filtros__fila">
              <div className="oc-fechas">
                <TextInput type="date" aria-label="Desde" value={desde} max={hasta || undefined} onChange={ev => setDesde(ev.target.value)} />
                <span className="t-footnote c-secondary">a</span>
                <TextInput type="date" aria-label="Hasta" value={hasta} min={desde || undefined} onChange={ev => setHasta(ev.target.value)} />
                <button type="button" className="oc-cotizacion__quitar" aria-label="Quitar fechas" onClick={() => { setDesde(''); setHasta(''); }}>×</button>
              </div>
              <SegmentedControl<Vista> label="Ver por" value={vista} onChange={setVista}
                options={[{ value: 'ordenes', label: 'Por orden de compra' }, { value: 'articulos', label: 'Por artículo' }]} />
              <SelectInput aria-label="Estado de la recepción" value={filtro} onChange={ev => setFiltro(ev.target.value as FiltroEstado)} style={{ width: 'auto' }}>
                {(Object.keys(ETIQUETA_FILTRO) as FiltroEstado[]).map(f => <option key={f} value={f}>{ETIQUETA_FILTRO[f]} ({cuenta[f]})</option>)}
              </SelectInput>
              <span className="badge" style={{ marginLeft: 'auto' }}>{visibles.length} {visibles.length === 1 ? 'registro' : 'registros'}</span>
            </div>
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <PackagePlus size={22} />} title="Ninguna orden coincide">
              <button type="button" className="placas-limpiar" onClick={quitarFiltros}>Quitar filtros</button>
            </EmptyState>
          ) : esTabla && vista === 'ordenes' ? (
            <TablaRedimensionable id="almacen-recepciones" columnas={COLUMNAS} ariaLabel="Recepción de compras" altoMax="68vh">
              {visibles.map(oc => {
                const tono = TONO_ESTADO[oc.estado_recepcion] ?? 'amber';
                const av = avance(oc);
                const imp = importeOC(oc);
                const ev = totalEvidencias(oc);
                return (
                  <tr key={String(oc.id)}>
                    <Celda alinear="center"><AccionesFila oc={oc} puedeRecibir={puedeRecibir} onVer={verDetalle} onRecepcionar={recepcionar} /></Celda>
                    <Celda>{fechaTexto(oc.fecha)}</Celda>
                    <Celda><button type="button" className="rec-codigo" onClick={() => verDetalle(oc.id)}>{String(oc.id)}</button></Celda>
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
          ) : esTabla ? (
            <TablaRedimensionable id="almacen-recepciones-articulos" columnas={COLUMNAS_ART} ariaLabel="Recepción de compras por artículo" altoMax="68vh">
              {filasArticulo.map(({ oc, it, k }) => {
                const tono = TONO_ESTADO[oc.estado_recepcion] ?? 'amber';
                return (
                  <tr key={k}>
                    <Celda alinear="center"><AccionesFila oc={oc} puedeRecibir={puedeRecibir} onVer={verDetalle} onRecepcionar={recepcionar} /></Celda>
                    <Celda>{fechaTexto(oc.fecha)}</Celda>
                    <Celda><button type="button" className="rec-codigo" onClick={() => verDetalle(oc.id)}>{String(oc.id)}</button></Celda>
                    <Celda alinear="center"><span className={`rec-estado rec-estado--${tono}`}>{ETIQUETA_ESTADO[oc.estado_recepcion] ?? oc.estado_recepcion}</span></Celda>
                    <Celda>{oc.proveedor}</Celda>
                    <Celda mono>{it?.inventario_id || '—'}</Celda>
                    <Celda>{it?.descripcion ?? 'Sin artículos'}</Celda>
                    <Celda alinear="right">{it ? fmt(it.pedido) : '—'}</Celda>
                    <Celda alinear="right">{it ? <span style={{ color: 'var(--green-ink)' }}>{fmt(it.recepcionado)}</span> : '—'}</Celda>
                    <Celda alinear="right">{it ? <strong style={{ color: it.pendiente > 0 ? 'var(--amber-ink)' : 'var(--label-3)' }}>{fmt(it.pendiente)}</strong> : '—'}</Celda>
                  </tr>
                );
              })}
            </TablaRedimensionable>
          ) : (
            <div className="tarjeta__lista">
              {visibles.map(oc => (
                <FilaOC key={String(oc.id)} oc={oc} puedeRecibir={puedeRecibir}
                  onAbrir={() => verDetalle(oc.id)} onRecepcionar={() => recepcionar(oc.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* El detalle es una ventana sobre el listado; el formulario de recepción se abre aparte (desde el listado o desde el detalle) */}
      <RecepcionDetalle
        oc={detalle}
        puedeRecibir={puedeRecibir}
        puedeRevertir={puedeRevertir}
        onRecepcionar={() => { if (detalle) recepcionar(detalle.id); }}
        onClose={() => setDetalleId(null)}
      />

      <RegistrarRecepcion oc={recibiendo} usuario={user?.name ?? ''} open={!!recibiendo} onClose={() => setRecibiendoId(null)} />
    </Page>
  );
}

/** Acciones de una fila de la tabla: ver detalle y recepcionar, cada una con su nombre al pasar el mouse */
function AccionesFila({ oc, puedeRecibir, onVer, onRecepcionar }: {
  oc: RecepcionOC; puedeRecibir: boolean; onVer: (id: string | number) => void; onRecepcionar: (id: string | number) => void;
}) {
  const falta = oc.estado_recepcion !== 'COMPLETO';
  return (
    <div style={{ display: 'inline-flex', gap: 6 }}>
      <BotonTip tip="Ver detalle" className="btn btn--secondary btn--icon btn--sm btn-tip btn-tip--azul" aria-label={`Ver ${String(oc.id)}`} onClick={() => onVer(oc.id)}><Eye size={16} /></BotonTip>
      {falta && puedeRecibir && (
        <BotonTip tip="Recepcionar" className="btn btn--secondary btn--icon btn--sm btn-tip btn-tip--verde" aria-label={`Recepcionar ${String(oc.id)}`} onClick={() => onRecepcionar(oc.id)}><PackagePlus size={16} /></BotonTip>
      )}
    </div>
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
