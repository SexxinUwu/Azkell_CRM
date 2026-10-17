import './almacen.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, FileSpreadsheet, ImageIcon, PackagePlus, SearchX, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { ConfirmSheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { eliminarRecepcion, useRecepcionesOC, type HistorialRecepcion, type RecepcionOC } from './api';
import { RegistrarRecepcion } from './RegistrarRecepcion';
import { formatFechaHoraPe, formatFechaPe, formatMoneda } from '../../core/lib/format';

type FiltroEstado = 'TODOS' | 'PENDIENTE' | 'PARCIAL' | 'COMPLETO';

const FILTROS: FiltroEstado[] = ['TODOS', 'PENDIENTE', 'PARCIAL', 'COMPLETO'];
const LABEL_FILTRO: Record<FiltroEstado, string> = {
  TODOS: 'Todas', PENDIENTE: 'Pendientes', PARCIAL: 'Parciales', COMPLETO: 'Completas',
};
const TONO_ESTADO: Record<string, string> = { PENDIENTE: 'amber', PARCIAL: 'blue', COMPLETO: 'green' };
const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(2));

export function RecepcionComprasPage() {
  const { data, isLoading, isError, error } = useRecepcionesOC();
  const { can } = useAuth();
  const [filtro, setFiltro] = useState<FiltroEstado>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionadaId, setSeleccionadaId] = useState<string | number | null>(null);

  const ocs = data ?? [];
  // Se busca por id para que el detalle se actualice solo tras registrar o revertir
  const seleccionada = ocs.find(o => o.id === seleccionadaId) ?? null;

  const conteos = useMemo(() => ({
    PENDIENTE: ocs.filter(o => o.estado_recepcion === 'PENDIENTE').length,
    PARCIAL: ocs.filter(o => o.estado_recepcion === 'PARCIAL').length,
    COMPLETO: ocs.filter(o => o.estado_recepcion === 'COMPLETO').length,
  }), [ocs]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return ocs.filter(o => {
      if (filtro !== 'TODOS' && o.estado_recepcion !== filtro) return false;
      if (!q) return true;
      return String(o.id).toUpperCase().includes(q) || o.proveedor.toUpperCase().includes(q) || o.solicitante.toUpperCase().includes(q);
    });
  }, [ocs, filtro, busqueda]);

  const toast = useToast();
  async function exportar() {
    try {
      await exportarExcel('Recepciones-compras', 'Recepciones',
        ['Orden', 'Fecha', 'Proveedor', 'Solicitante', 'Condición pago', 'Importe', 'Moneda', 'Estado OC', 'Estado recepción', 'Total pedido', 'Total recibido', 'Pendiente'],
        visibles.map(o => [o.id, formatFechaPe(o.fecha), o.proveedor, o.solicitante, o.condicion_pago ?? 'Al contado', o.importe, o.moneda, o.estado_oc, o.estado_recepcion,
          o.total_pedido, o.total_recibido, Math.max(0, o.total_pedido - o.total_recibido)]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page>
      {!seleccionada && (
        <PageHeader
          eyebrow="Almacén"
          title="Recepción de compras"
          subtitle={isLoading ? 'Cargando…' : `${ocs.length} órdenes · ${conteos.PENDIENTE} pendientes`}
          actions={
            <MenuOtros opciones={[
              { label: 'Exportar Excel', detalle: `${visibles.length} órdenes`, icon: <FileSpreadsheet size={17} />, onSelect: exportar },
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, separado: true, onSelect: () => abrirClasico('almacen/recepcion-compras') },
            ]} />
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : seleccionada ? (
        <RecepcionDetalle
          oc={seleccionada}
          puedeRecibir={can('rec_compras.crear', 'ent_inv.crear')}
          puedeRevertir={can('rec_compras.eliminar', 'ent_inv.eliminar')}
          onVolver={() => setSeleccionadaId(null)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            {FILTROS.map(f => (
              <button key={f} type="button" className="pressable" onClick={() => { haptic('selection'); setFiltro(f); }}
                style={{
                  padding: '0.375rem 0.875rem', borderRadius: 'var(--r-full)', fontSize: '0.875rem',
                  fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: filtro === f ? 'var(--ink)' : 'var(--fill)',
                  color: filtro === f ? 'var(--label-inverse)' : 'var(--label-2)',
                }}>
                {LABEL_FILTRO[f]}
                {f !== 'TODOS' && (
                  <span style={{ marginLeft: '0.375rem', background: 'var(--fill-subtle)', borderRadius: 'var(--r-full)', padding: '0 0.375rem', fontSize: '0.75rem' }}>
                    {conteos[f]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="N° OC, proveedor, solicitante…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <PackagePlus size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin órdenes para este filtro'}>
              {busqueda && <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista">
              {visibles.map(oc => {
                const tono = TONO_ESTADO[oc.estado_recepcion] ?? 'amber';
                return (
                  <button key={String(oc.id)} type="button" className="mov-fila pressable"
                    onClick={() => { haptic('selection'); setSeleccionadaId(oc.id); }}>
                    <div className="mov-fila__icon" style={{ background: `var(--${tono}-tint)`, color: `var(--${tono}-ink)` }}>
                      <PackagePlus size={16} />
                    </div>
                    <div className="mov-fila__cuerpo">
                      <span className="mov-fila__titulo">{String(oc.id)} · {oc.proveedor}</span>
                      <span className="mov-fila__sub">{oc.solicitante} · {oc.condicion_pago ?? 'Al contado'} · {formatFechaPe(oc.fecha)}</span>
                    </div>
                    <div className="mov-fila__derecha">
                      <span className="mov-fila__monto">{fmt(oc.total_recibido)} / {fmt(oc.total_pedido)}</span>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: `var(--${tono}-ink)` }}>{oc.estado_recepcion}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

function RecepcionDetalle({ oc, puedeRecibir, puedeRevertir, onVolver }: {
  oc: RecepcionOC; puedeRecibir: boolean; puedeRevertir: boolean; onVolver: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [registrando, setRegistrando] = useState(false);
  const [porRevertir, setPorRevertir] = useState<HistorialRecepcion | null>(null);
  const [revirtiendo, setRevirtiendo] = useState(false);

  const tono = TONO_ESTADO[oc.estado_recepcion] ?? 'amber';
  const color = tono;
  const pendiente = Math.max(0, oc.total_pedido - oc.total_recibido);
  const pct = oc.total_pedido > 0 ? Math.min(100, Math.round((oc.total_recibido / oc.total_pedido) * 100)) : 0;

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
            <Button variant="primary" icon={<PackagePlus size={16} />} onClick={() => setRegistrando(true)}>Recepcionar</Button>
          )}
        </div>
      </div>

      <div className="inv-ficha__hero" style={{ paddingTop: 'var(--s-2)' }}>
        <div className="inv-ficha__imagen-vacia"><PackagePlus size={28} /></div>
        <span className="inv-ficha__id">{String(oc.id)}</span>
        <h2 className="inv-ficha__nombre">{oc.proveedor}</h2>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.1875rem 0.625rem', borderRadius: 'var(--r-full)', background: `var(--${color}-tint)`, color: `var(--${color}-ink)` }}>
          {oc.estado_recepcion}
        </span>
      </div>

      <div className="inv-metricas">
        <div className="inv-metrica"><span className="inv-metrica__num">{fmt(oc.total_pedido)}</span><span className="inv-metrica__label">Pedido</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num" style={{ color: 'var(--green-ink)' }}>{fmt(oc.total_recibido)}</span><span className="inv-metrica__label">Recibido</span></div>
        <div className="inv-metrica"><span className="inv-metrica__num inv-metrica__num--warning">{fmt(pendiente)}</span><span className="inv-metrica__label">Pendiente</span></div>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--fill)', overflow: 'hidden' }} aria-label={`${pct}% recibido`}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green)', transition: 'width 500ms var(--ease-out)' }} />
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Datos</p>
        <div className="tarjeta__lista">
          <div className="dato"><span className="dato__label">Solicitante</span><span className="dato__valor">{oc.solicitante}</span></div>
          <div className="dato"><span className="dato__label">Autoriza</span><span className="dato__valor">{oc.autoriza}</span></div>
          <div className="dato"><span className="dato__label">Almacén</span><span className="dato__valor">{oc.almacen}</span></div>
          <div className="dato"><span className="dato__label">Fecha OC</span><span className="dato__valor dato__valor--mono">{formatFechaPe(oc.fecha)}</span></div>
          <div className="dato"><span className="dato__label">Importe</span><span className="dato__valor" style={{ fontWeight: 700 }}>{formatMoneda(oc.importe, oc.moneda)}</span></div>
        </div>
      </div>

      {oc.items.length > 0 && (
        <div>
          <p className="tarjeta__grupo-titulo">Ítems ({oc.items.length})</p>
          <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
            <table className="items-tabla" style={{ minWidth: '26rem' }}>
              <thead>
                <tr><th>Descripción</th><th style={{ textAlign: 'right' }}>Pedido</th><th style={{ textAlign: 'right' }}>Recibido</th><th style={{ textAlign: 'right' }}>Pendiente</th></tr>
              </thead>
              <tbody>
                {oc.items.map((it, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: '0.875rem' }}>{it.descripcion}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(it.pedido)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--green-ink)' }}>{fmt(it.recepcionado)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: it.pendiente > 0 ? 'var(--amber-ink)' : 'var(--label-3)' }}>{fmt(it.pendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {entregas.length > 0 && (
        <div>
          <p className="tarjeta__grupo-titulo">Entregas registradas ({entregas.length})</p>
          <div className="tarjeta__lista">
            {entregas.map(({ cab, lineas }) => (
              <div key={cab.recepcion_id} className="dato" style={{ gap: 'var(--s-1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                  <span className="dato__label" style={{ fontWeight: 700, flex: 1 }}>
                    {formatFechaHoraPe(cab.fecha_recepcion)} · {cab.tipo_recepcion ?? 'ENTREGA'}
                  </span>
                  {cab.sustento_url_presigned && (
                    <a href={cab.sustento_url_presigned} target="_blank" rel="noreferrer" aria-label="Ver sustento" className="placas-limpiar">
                      <ImageIcon size={15} style={{ verticalAlign: '-3px' }} /> Sustento
                    </a>
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
                    +{fmt(l.cantidad_recibida)} {l.descripcion}
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

      <RegistrarRecepcion oc={oc} usuario={user?.name ?? ''} open={registrando} onClose={() => setRegistrando(false)} />

      <ConfirmSheet
        open={!!porRevertir}
        onClose={() => !revirtiendo && setPorRevertir(null)}
        onConfirm={revertir}
        loading={revirtiendo}
        title="¿Revertir esta entrega?"
        message="Se descuenta del inventario el stock que ingresó y el saldo pendiente vuelve a quedar disponible en la orden."
        confirmLabel="Revertir"
      />
    </div>
  );
}
