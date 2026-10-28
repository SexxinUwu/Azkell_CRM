import './almacen.css';
import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Clock, FileSpreadsheet, FileText, Hourglass, ImageIcon, PackagePlus, RefreshCw, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Badge, EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
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
const TONO_ESTADO: Record<string, Tono> = { PENDIENTE: 'red', PARCIAL: 'amber', COMPLETO: 'green' };
const ETIQUETA_ESTADO: Record<string, string> = { PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', COMPLETO: 'Completo' };

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
            <MenuOtros opciones={[
              { label: 'Actualizar', detalle: 'Trae las recepciones del servidor', icon: <RefreshCw size={17} />, onSelect: actualizar },
              { label: 'Exportar Excel', detalle: `${visibles.length} órdenes`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
            ]} />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div className="rec-kpis">
            {KPIS.map(k => (
              <button key={k.filtro} type="button" className="rec-kpi pressable" aria-pressed={filtro === k.filtro}
                onClick={() => { haptic('selection'); setFiltro(k.filtro); }}>
                <span className="rec-kpi__cuerpo">
                  <span className="inv-kpi__etiqueta">{k.etiqueta}</span>
                  <span className={`inv-kpi__valor${k.tono ? ` inv-kpi__valor--${k.tono}` : ''}`}>{cuenta[k.filtro]}</span>
                </span>
                <span className={`inv-kpi__icono${k.tono ? ` inv-kpi__icono--${k.tono}` : ''}`}>{k.icono}</span>
              </button>
            ))}
          </div>

          <SegmentedControl label="Filtrar por estado" block value={filtro} onChange={setFiltro} options={OPCIONES_FILTRO} />

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Orden, proveedor, solicitante o artículo…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <PackagePlus size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin órdenes para este filtro'}>
              {busqueda && <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>}
            </EmptyState>
          ) : (
            <>
              <div className="tarjeta__lista">
                {visibles.map(oc => (
                  <FilaOC key={String(oc.id)} oc={oc} puedeRecibir={puedeRecibir}
                    onAbrir={() => abrirOC(oc.id, false)} onRecepcionar={() => abrirOC(oc.id, true)} />
                ))}
              </div>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                Mostrando {visibles.length} de {ocs.length} órdenes
              </p>
            </>
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
                  {cab.sustento_url_presigned ? (
                    <a href={cab.sustento_url_presigned} target="_blank" rel="noreferrer" aria-label="Ver sustento" className="placas-limpiar">
                      <ImageIcon size={15} style={{ verticalAlign: '-3px' }} /> Ver sustento
                    </a>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--label-3)' }}>Sin archivo</span>
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
