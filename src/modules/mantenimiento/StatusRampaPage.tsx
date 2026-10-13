import './mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, SearchX, Wrench } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { rampaConductor, rampaId, useStatusRampa, type RampaEntrada } from './api';

const TABS = ['Activas', 'Historial'] as const;

export function StatusRampaPage() {
  const { data, isLoading, isError, error } = useStatusRampa();
  const [tab, setTab] = useState<'Activas' | 'Historial'>('Activas');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionada, setSeleccionada] = useState<RampaEntrada | null>(null);

  const entradas = data ?? [];

  const activas = useMemo(() =>
    entradas.filter(e => !e.fecha_salida && e.situacion !== 'Finalizado' && e.estado !== 'Liberado'),
    [entradas]
  );

  const historial = useMemo(() =>
    entradas.filter(e => e.fecha_salida || e.situacion === 'Finalizado' || e.estado === 'Liberado'),
    [entradas]
  );

  const lista = tab === 'Activas' ? activas : historial;

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(e =>
      (e.rampa ?? '').toUpperCase().includes(q) ||
      (e.placa ?? '').toUpperCase().includes(q) ||
      rampaConductor(e).toUpperCase().includes(q) ||
      (e.situacion ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  const soloDetalle = !!seleccionada;

  return (
    <Page>
      {!soloDetalle && (
        <PageHeader
          eyebrow="Mantenimiento"
          title="Status de rampa"
          subtitle={isLoading ? 'Cargando…' : `${activas.length} rampas activas`}
          actions={
            <MenuOtros opciones={[
              { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/status-rampa') },
            ]} />
          }
        />
      )}

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : soloDetalle ? (
        <RampaDetalle
          entrada={seleccionada}
          onVolver={() => setSeleccionada(null)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            {TABS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setBusqueda(''); }}
                style={{
                  padding: '0.375rem 1rem',
                  borderRadius: 'var(--r-full)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: tab === t ? 'var(--ink)' : 'var(--fill)',
                  color: tab === t ? 'var(--label-inverse)' : 'var(--label-2)',
                }}
              >
                {t}
                {t === 'Activas' && (
                  <span style={{
                    marginLeft: '0.375rem',
                    background: tab === t ? 'rgba(255,255,255,0.2)' : 'var(--fill-subtle)',
                    borderRadius: 'var(--r-full)',
                    padding: '0 0.375rem',
                    fontSize: '0.75rem',
                  }}>
                    {activas.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === 'Historial' && (
            <SearchField value={busqueda} onChange={setBusqueda} placeholder="Rampa, placa, conductor…" />
          )}

          {tab === 'Activas' ? (
            activas.length === 0 ? (
              <EmptyState icon={<Wrench size={22} />} title="Todas las rampas libres">
                No hay vehículos en rampas actualmente.
              </EmptyState>
            ) : (
              <div className="sr-grid">
                {activas.map(e => (
                  <RampaCard
                    key={rampaId(e)}
                    entrada={e}
                    onClick={() => { haptic('selection'); setSeleccionada(e); }}
                  />
                ))}
              </div>
            )
          ) : (
            visibles.length === 0 ? (
              <EmptyState icon={<SearchX size={22} />} title={busqueda ? 'Sin coincidencias' : 'Sin historial'}>
                {busqueda && (
                  <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>
                    Quitar búsqueda
                  </button>
                )}
              </EmptyState>
            ) : (
              <div className="tarjeta__lista">
                {visibles.map(e => (
                  <button
                    key={rampaId(e)}
                    type="button"
                    className="sr-hist-fila"
                    onClick={() => { haptic('selection'); setSeleccionada(e); }}
                  >
                    <div className="sr-hist-fila__cuerpo">
                      <span className="sr-hist-fila__placa">{e.placa ?? '—'}</span>
                      <span className="sr-hist-fila__sub">
                        {e.rampa} · {rampaConductor(e)}
                        {e.situacion ? ` · ${e.situacion}` : ''}
                      </span>
                    </div>
                    <span className="sr-hist-fila__fecha">
                      {e.fecha_ingreso?.split('T')[0] ?? '—'}
                    </span>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </Page>
  );
}

// ─── Tarjeta de rampa activa ─────────────────────────────────────────────────

interface CardProps {
  entrada: RampaEntrada;
  onClick: () => void;
}

function RampaCard({ entrada: e, onClick }: CardProps) {
  const color = e.color && e.color !== '#ef4444' && e.color !== '#007aff' && e.color !== '#64748b' ? e.color : 'var(--accent)';
  return (
    <button
      type="button"
      className="sr-card"
      style={{ '--sr-color': color } as React.CSSProperties}
      onClick={onClick}
    >
      <span className="sr-card__nombre">{e.rampa}</span>
      <span className="sr-card__placa">{e.placa ?? '—'}</span>
      <div className="sr-card__info">
        <span className="sr-card__dato"><strong>Conductor:</strong> {rampaConductor(e)}</span>
        {e.fecha_ingreso && (
          <span className="sr-card__dato"><strong>Ingreso:</strong> {e.fecha_ingreso.split('T')[0]}</span>
        )}
        {e.km && (
          <span className="sr-card__dato"><strong>Km:</strong> {String(e.km)}</span>
        )}
      </div>
      {e.situacion && (
        <span className="sr-card__situacion">{e.situacion}</span>
      )}
    </button>
  );
}

// ─── Detalle de entrada de rampa ─────────────────────────────────────────────

interface RampaDetalleProps {
  entrada: RampaEntrada;
  onVolver: () => void;
}

function RampaDetalle({ entrada: e, onVolver }: RampaDetalleProps) {
  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Rampas
        </button>
      </div>

      <div className="ot-ficha__hero">
        {e.situacion && <span className="ot-estado ot-estado--neutral">{e.situacion}</span>}
        <h2 className="ot-ficha__placa">{e.placa ?? '—'}</h2>
        <span className="ot-ficha__id">{e.rampa}</span>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Entrada</p>
        <div className="tarjeta__lista">
          <div className="dato"><span className="dato__label">Conductor</span><span className="dato__valor">{rampaConductor(e)}</span></div>
          {e.km && <div className="dato"><span className="dato__label">Km</span><span className="dato__valor dato__valor--mono">{String(e.km)}</span></div>}
          {e.ticket_entrada && <div className="dato"><span className="dato__label">Ticket</span><span className="dato__valor dato__valor--mono">{e.ticket_entrada}</span></div>}
        </div>
      </div>

      <div>
        <p className="tarjeta__grupo-titulo">Fechas</p>
        <div className="tarjeta__lista">
          {e.fecha_ingreso && <div className="dato"><span className="dato__label">Fecha ingreso</span><span className="dato__valor dato__valor--mono">{e.fecha_ingreso.split('T')[0]}</span></div>}
          {e.hora_ingreso && <div className="dato"><span className="dato__label">Hora ingreso</span><span className="dato__valor dato__valor--mono">{e.hora_ingreso}</span></div>}
          {e.fecha_salida && <div className="dato"><span className="dato__label">Fecha salida</span><span className="dato__valor dato__valor--mono">{e.fecha_salida.split('T')[0]}</span></div>}
        </div>
      </div>

      {e.observaciones && (
        <div>
          <p className="tarjeta__grupo-titulo">Observaciones</p>
          <div className="tarjeta__lista">
            <div className="dato"><span className="dato__valor" style={{ whiteSpace: 'pre-wrap' }}>{e.observaciones}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
