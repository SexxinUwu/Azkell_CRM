import './mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Clock, LayoutDashboard, SearchX, Wrench } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { rampaConductor, rampaId, useStatusRampa, type RampaEntrada } from './api';

const TABS = ['Activas', 'Historial'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function horasEnRampa(fechaIngreso: string | null): number {
  if (!fechaIngreso) return 0;
  const ingreso = new Date(fechaIngreso.includes('T') ? fechaIngreso : fechaIngreso + 'T00:00:00');
  return Math.max(0, (Date.now() - ingreso.getTime()) / 3_600_000);
}

function formatTiempo(horas: number): string {
  if (horas < 1) return `${Math.round(horas * 60)}m`;
  if (horas < 24) return `${Math.round(horas)}h`;
  const dias = Math.floor(horas / 24);
  const hrs  = Math.round(horas % 24);
  return hrs > 0 ? `${dias}d ${hrs}h` : `${dias}d`;
}

function tiempoColor(horas: number): string {
  if (horas > 48) return 'var(--red-ink)';
  if (horas > 24) return 'var(--amber-ink)';
  return 'var(--green-ink)';
}

// ─── Donut SVG ────────────────────────────────────────────────────────────────

function Donut({ pct, color, label, size = 64 }: { pct: number; color: string; label?: string; size?: number }) {
  const r = 15.9155;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * circ;
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--fill-3)" strokeWidth="3.5" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3.5"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      {label !== undefined && (
        <span style={{ position: 'absolute', fontSize: size < 60 ? '0.7rem' : '0.85rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color }}>
          {label}
        </span>
      )}
    </div>
  );
}

// ─── Panel de analíticas ──────────────────────────────────────────────────────

function PanelAnaliticas({ activas, historial }: { activas: RampaEntrada[]; historial: RampaEntrada[] }) {
  // Distribución por situación (activas)
  const distSituacion = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of activas) {
      const s = e.situacion ?? e.estado ?? 'Sin estado';
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [activas]);

  // Tiempo promedio en rampa (activas)
  const tiempos = activas.map(e => horasEnRampa(e.fecha_ingreso));
  const promedioHoras = tiempos.length > 0 ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : 0;

  // Más de 48h = críticas
  const criticas = tiempos.filter(h => h > 48).length;

  // Historial del mes actual
  const mesActual = new Date().toISOString().slice(0, 7);
  const histMes = historial.filter(e =>
    (e.fecha_salida ?? e.fecha_ingreso ?? '').slice(0, 7) === mesActual
  ).length;

  if (activas.length === 0 && historial.length === 0) return null;

  return (
    <div style={{ background: 'var(--fill-1)', borderRadius: 'var(--radius-2)', padding: 'var(--s-3)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      {/* KPIs rápidos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))', gap: 'var(--s-2)' }}>
        <div className="tarjeta__lista" style={{ padding: 'var(--s-2) var(--s-3)', display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
          <Wrench size={18} style={{ color: activas.length > 0 ? 'var(--amber-ink)' : 'var(--green-ink)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>{activas.length}</div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--label-2)' }}>En rampa</div>
          </div>
        </div>

        {activas.length > 0 && (
          <div className="tarjeta__lista" style={{ padding: 'var(--s-2) var(--s-3)', display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            <Clock size={18} style={{ color: tiempoColor(promedioHoras), flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1.2, color: tiempoColor(promedioHoras) }}>
                {formatTiempo(promedioHoras)}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--label-2)' }}>Prom. espera</div>
            </div>
          </div>
        )}

        {criticas > 0 && (
          <div className="tarjeta__lista" style={{ padding: 'var(--s-2) var(--s-3)', display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            <Clock size={18} style={{ color: 'var(--red-ink)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1.2, color: 'var(--red-ink)' }}>{criticas}</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--label-2)' }}>+48 horas</div>
            </div>
          </div>
        )}

        {histMes > 0 && (
          <div className="tarjeta__lista" style={{ padding: 'var(--s-2) var(--s-3)', display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            <LayoutDashboard size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>{histMes}</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--label-2)' }}>Este mes</div>
            </div>
          </div>
        )}
      </div>

      {/* Distribución por situación */}
      {distSituacion.length > 1 && (
        <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Donut
            pct={activas.length > 0 ? Math.round((distSituacion[0]?.[1] ?? 0) / activas.length * 100) : 0}
            color="var(--amber-ink)"
            label={String(activas.length)}
            size={68}
          />
          <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {distSituacion.slice(0, 4).map(([sit, n]) => {
              const pct = activas.length > 0 ? Math.round((n / activas.length) * 100) : 0;
              return (
                <div key={sit}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 600, marginBottom: 2 }}>
                    <span style={{ color: 'var(--label-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{sit}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber-ink)' }}>{n}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 99, background: 'var(--fill-3)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--amber-ink)', borderRadius: 99, transition: 'width 600ms ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function StatusRampaPage() {
  const { data, isLoading, isError, error } = useStatusRampa();
  const [tab, setTab] = useState<'Activas' | 'Historial'>('Activas');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionada, setSeleccionada] = useState<RampaEntrada | null>(null);

  const entradas = data ?? [];

  const activas = useMemo(() =>
    entradas.filter(e => !e.fecha_salida && e.situacion !== 'Finalizado' && e.estado !== 'Liberado' && e.estado !== 'Entregado'),
    [entradas]
  );

  const historial = useMemo(() =>
    entradas.filter(e => e.fecha_salida || e.situacion === 'Finalizado' || e.estado === 'Liberado' || e.estado === 'Entregado'),
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
          {/* Panel de analíticas */}
          <PanelAnaliticas activas={activas} historial={historial} />

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
                <span style={{
                  marginLeft: '0.375rem',
                  background: tab === t ? 'rgba(255,255,255,0.2)' : 'var(--fill-subtle)',
                  borderRadius: 'var(--r-full)',
                  padding: '0 0.375rem',
                  fontSize: '0.75rem',
                }}>
                  {t === 'Activas' ? activas.length : historial.length}
                </span>
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
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span className="sr-hist-fila__fecha">
                        {e.fecha_ingreso?.split('T')[0] ?? '—'}
                      </span>
                      {e.fecha_salida && e.fecha_ingreso && (
                        <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--label-3)' }}>
                          {formatTiempo(
                            Math.max(0, (new Date(e.fecha_salida).getTime() - new Date(e.fecha_ingreso).getTime()) / 3_600_000)
                          )}
                        </span>
                      )}
                    </div>
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
  const horas = horasEnRampa(e.fecha_ingreso);
  const tColor = tiempoColor(horas);

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--s-1)' }}>
        {e.situacion && (
          <span className="sr-card__situacion">{e.situacion}</span>
        )}
        {horas > 0 && (
          <span style={{
            marginLeft: 'auto',
            fontSize: '0.72rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: tColor,
            background: `color-mix(in srgb, ${tColor} 12%, transparent)`,
            padding: '2px 7px',
            borderRadius: 99,
          }}>
            <Clock size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
            {formatTiempo(horas)}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Detalle de entrada de rampa ─────────────────────────────────────────────

interface RampaDetalleProps {
  entrada: RampaEntrada;
  onVolver: () => void;
}

function RampaDetalle({ entrada: e, onVolver }: RampaDetalleProps) {
  const horas = horasEnRampa(e.fecha_ingreso);

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
        {horas > 0 && !e.fecha_salida && (
          <span style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: '0.85rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: tiempoColor(horas),
          }}>
            <Clock size={14} /> {formatTiempo(horas)} en rampa
          </span>
        )}
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
          {e.fecha_salida && (
            <>
              <div className="dato"><span className="dato__label">Fecha salida</span><span className="dato__valor dato__valor--mono">{e.fecha_salida.split('T')[0]}</span></div>
              {e.fecha_ingreso && (
                <div className="dato">
                  <span className="dato__label">Tiempo total</span>
                  <span className="dato__valor dato__valor--mono">
                    {formatTiempo(Math.max(0, (new Date(e.fecha_salida).getTime() - new Date(e.fecha_ingreso).getTime()) / 3_600_000))}
                  </span>
                </div>
              )}
            </>
          )}
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
