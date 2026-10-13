import './almacen.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, PackagePlus, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { useRecepcionesOC, type RecepcionOC } from './api';

type FiltroEstado = 'TODOS' | 'PENDIENTE' | 'PARCIAL' | 'COMPLETO';

const FILTROS: FiltroEstado[] = ['TODOS', 'PENDIENTE', 'PARCIAL', 'COMPLETO'];
const LABEL_FILTRO: Record<FiltroEstado, string> = {
  TODOS: 'Todas', PENDIENTE: 'Pendientes', PARCIAL: 'Parciales', COMPLETO: 'Completas',
};
const TONO_ESTADO: Record<string, string> = {
  PENDIENTE: 'amber', PARCIAL: 'blue', COMPLETO: 'green',
};

export function RecepcionComprasPage() {
  const { data, isLoading, isError, error } = useRecepcionesOC();
  const [filtro, setFiltro] = useState<FiltroEstado>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionada, setSeleccionada] = useState<RecepcionOC | null>(null);

  const ocs = data ?? [];

  const conteos = useMemo(() => ({
    PENDIENTE: ocs.filter(o => !o.estado_recepcion || o.estado_recepcion === 'PENDIENTE').length,
    PARCIAL: ocs.filter(o => o.estado_recepcion === 'PARCIAL').length,
    COMPLETO: ocs.filter(o => o.estado_recepcion === 'COMPLETO').length,
  }), [ocs]);

  const visibles = useMemo(() => {
    const q = busqueda.toUpperCase();
    return ocs.filter(o => {
      if (filtro === 'PENDIENTE' && o.estado_recepcion && o.estado_recepcion !== 'PENDIENTE') return false;
      if (filtro === 'PARCIAL' && o.estado_recepcion !== 'PARCIAL') return false;
      if (filtro === 'COMPLETO' && o.estado_recepcion !== 'COMPLETO') return false;
      if (!q) return true;
      return (
        String(o.id ?? '').toUpperCase().includes(q) ||
        (o.proveedor ?? '').toUpperCase().includes(q) ||
        (o.solicitante ?? '').toUpperCase().includes(q)
      );
    });
  }, [ocs, filtro, busqueda]);

  const soloDetalle = !!seleccionada;

  return (
    <Page>
      {!soloDetalle && (
        <PageHeader
          eyebrow="Almacén"
          title="Recepción de compras"
          subtitle={isLoading ? 'Cargando…' : `${ocs.length} órdenes`}
          actions={
            <MenuOtros opciones={[
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('almacen/recepcion-compras') },
            ]} />
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : soloDetalle ? (
        <RecepcionDetalle oc={seleccionada} onVolver={() => setSeleccionada(null)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {/* KPI chips */}
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            {FILTROS.map(f => (
              <button key={f} type="button" onClick={() => setFiltro(f)}
                style={{
                  padding: '0.375rem 0.875rem', borderRadius: 'var(--r-full)', fontSize: '0.875rem',
                  fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: filtro === f ? 'var(--ink)' : 'var(--fill)',
                  color: filtro === f ? 'var(--label-inverse)' : 'var(--label-2)',
                }}>
                {LABEL_FILTRO[f]}
                {f !== 'TODOS' && (
                  <span style={{
                    marginLeft: '0.375rem',
                    background: filtro === f ? 'rgba(255,255,255,0.2)' : 'var(--fill-subtle)',
                    borderRadius: 'var(--r-full)', padding: '0 0.375rem', fontSize: '0.75rem',
                  }}>
                    {conteos[f as keyof typeof conteos]}
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
              {visibles.map((oc, i) => {
                const est = oc.estado_recepcion ?? 'PENDIENTE';
                const tono = TONO_ESTADO[est] ?? 'neutral';
                return (
                  <button key={String(oc.id ?? i)} type="button" className="mov-fila"
                    onClick={() => { haptic('selection'); setSeleccionada(oc); }}>
                    <div className="mov-fila__icon" style={{ background: `var(--${tono}-tint)`, color: `var(--${tono}-ink)` }}>
                      <PackagePlus size={16} />
                    </div>
                    <div className="mov-fila__cuerpo">
                      <span className="mov-fila__titulo">{String(oc.id)}</span>
                      <span className="mov-fila__sub">
                        {oc.proveedor ?? 'Sin proveedor'}
                        {oc.solicitante ? ` · ${oc.solicitante}` : ''}
                      </span>
                    </div>
                    <div className="mov-fila__derecha">
                      <span className={`inv-badge inv-badge--${tono === 'green' ? 'ok' : tono === 'amber' ? 'warning' : 'ok'}`}
                        style={tono === 'blue' ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' } : {}}>
                        {est}
                      </span>
                      {oc.fecha_oc && <span style={{ fontSize: '0.75rem', color: 'var(--label-3)', fontFamily: 'var(--font-mono)' }}>{oc.fecha_oc.split('T')[0]}</span>}
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

function RecepcionDetalle({ oc, onVolver }: { oc: RecepcionOC; onVolver: () => void }) {
  const est = oc.estado_recepcion ?? 'PENDIENTE';
  const tono = TONO_ESTADO[est] ?? 'neutral';
  const items = oc.items ?? [];

  return (
    <div className="inv-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Recepciones
        </button>
      </div>

      <div className="inv-ficha__hero" style={{ paddingTop: 'var(--s-2)' }}>
        <div className="inv-ficha__imagen-vacia"><PackagePlus size={28} /></div>
        <span className="inv-ficha__id">{String(oc.id)}</span>
        <h2 className="inv-ficha__nombre">{oc.proveedor ?? 'Sin proveedor'}</h2>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.1875rem 0.625rem', borderRadius: 'var(--r-full)', background: `var(--${tono === 'blue' ? 'accent' : tono}-tint, var(--fill))`, color: `var(--${tono === 'blue' ? 'accent' : tono}-ink, var(--label-2))` }}>
          {est}
        </span>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Datos</p>
        <div className="tarjeta__lista">
          {oc.solicitante && <div className="dato"><span className="dato__label">Solicitante</span><span className="dato__valor">{oc.solicitante}</span></div>}
          {oc.estado_oc && <div className="dato"><span className="dato__label">Estado OC</span><span className="dato__valor">{oc.estado_oc}</span></div>}
          {oc.almacen && <div className="dato"><span className="dato__label">Almacén</span><span className="dato__valor">{oc.almacen}</span></div>}
          {oc.fecha_oc && <div className="dato"><span className="dato__label">Fecha OC</span><span className="dato__valor dato__valor--mono">{oc.fecha_oc.split('T')[0]}</span></div>}
          {oc.fecha_recepcion && <div className="dato"><span className="dato__label">Fecha recep.</span><span className="dato__valor dato__valor--mono">{oc.fecha_recepcion.split('T')[0]}</span></div>}
          {oc.total_pen != null && <div className="dato"><span className="dato__label">Total</span><span className="dato__valor" style={{ fontWeight: 700 }}>S/ {Number(oc.total_pen).toFixed(2)}</span></div>}
        </div>
      </div>

      {items.length > 0 && (
        <div>
          <p className="tarjeta__grupo-titulo">Ítems ({items.length})</p>
          <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
            <table className="items-tabla" style={{ minWidth: '24rem' }}>
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right' }}>Cant. OC</th>
                  <th style={{ textAlign: 'right' }}>Recibido</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: '0.875rem' }}>{it.descripcion}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{it.cantidad_oc}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: it.cantidad_recibida >= it.cantidad_oc ? 'var(--green-ink)' : 'var(--amber-ink)' }}>
                      {it.cantidad_recibida}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {oc.observaciones && (
        <div>
          <p className="tarjeta__grupo-titulo">Observaciones</p>
          <div className="tarjeta__lista">
            <div className="dato"><span className="dato__valor" style={{ whiteSpace: 'pre-wrap' }}>{String(oc.observaciones)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
