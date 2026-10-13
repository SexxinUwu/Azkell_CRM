import './mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Gauge, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { frFecha, frId, frKmCambio, frKmGps, frKmProx, frFrecuencia, frObs, frPlaca, frTipo, frUts, useFleetrun, type FleetrunFila } from './api';

// Estado calculado a partir de km_gps vs km_prox
type EstadoFR = 'vencido' | 'por_vencer' | 'vigente';

function estadoFR(f: FleetrunFila): EstadoFR {
  const kmG = frKmGps(f);
  const kmP = frKmProx(f);
  if (!kmP) return 'vigente';
  if (kmG > 0 && kmG >= kmP) return 'vencido';
  if (kmG > 0 && kmP - kmG <= 1000) return 'por_vencer';
  // Fallback sin GPS: usar km_cambio + frecuencia
  const kmC = frKmCambio(f);
  if (kmC > 0 && kmP > 0 && kmP <= kmC) return 'vencido';
  return 'vigente';
}

function estadoFRColor(e: EstadoFR): string {
  if (e === 'vencido')    return 'red';
  if (e === 'por_vencer') return 'amber';
  return 'green';
}

function estadoFRLabel(e: EstadoFR): string {
  if (e === 'vencido')    return 'Vencido';
  if (e === 'por_vencer') return 'Por vencer';
  return 'Vigente';
}

const TODOS = 'Todos';
const FILTROS = [TODOS, 'Vencido', 'Por vencer', 'Vigente'] as const;

// Donut SVG simple
function DonutChart({ vencidos, porVencer, vigentes }: { vencidos: number; porVencer: number; vigentes: number }) {
  const total = vencidos + porVencer + vigentes;
  if (!total) return null;
  const r = 40, cx = 50, cy = 50, circum = 2 * Math.PI * r;
  const pV = (vencidos / total) * circum;
  const pP = (porVencer / total) * circum;
  const pG = vigentes / total * circum;
  // offset for each arc
  const o1 = 0;
  const o2 = circum - pV;
  const o3 = circum - pV - pP;
  return (
    <svg viewBox="0 0 100 100" width={96} height={96} style={{ transform: 'rotate(-90deg)' }}>
      {vigentes > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--green-ink)" strokeWidth={18}
        strokeDasharray={`${pG} ${circum - pG}`} strokeDashoffset={-o3} strokeLinecap="butt" />}
      {porVencer > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--amber-ink)" strokeWidth={18}
        strokeDasharray={`${pP} ${circum - pP}`} strokeDashoffset={-o2} strokeLinecap="butt" />}
      {vencidos > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--red-ink)" strokeWidth={18}
        strokeDasharray={`${pV} ${circum - pV}`} strokeDashoffset={-o1} strokeLinecap="butt" />}
    </svg>
  );
}

export function FleetrunPage() {
  const { data, isLoading, isError, error } = useFleetrun();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState(TODOS);

  const filas = data ?? [];

  // De-duplicar: última entrada por placa+tipo
  const porPlacaTipo = useMemo(() => {
    const mapa = new Map<string, FleetrunFila>();
    for (const f of filas) {
      const key = `${frPlaca(f)}__${frTipo(f)}`;
      if (!mapa.has(key)) mapa.set(key, f);
    }
    return Array.from(mapa.values());
  }, [filas]);

  // Stats
  const stats = useMemo(() => {
    let vencidos = 0, porVencer = 0, vigentes = 0;
    for (const f of porPlacaTipo) {
      const e = estadoFR(f);
      if (e === 'vencido') vencidos++;
      else if (e === 'por_vencer') porVencer++;
      else vigentes++;
    }
    return { vencidos, porVencer, vigentes, total: porPlacaTipo.length };
  }, [porPlacaTipo]);

  const visibles = useMemo(() => {
    let lista = porPlacaTipo;
    if (filtro !== TODOS) {
      lista = lista.filter(f => estadoFRLabel(estadoFR(f)) === filtro);
    }
    if (busqueda) {
      const q = busqueda.toUpperCase();
      lista = lista.filter(f =>
        frPlaca(f).toUpperCase().includes(q) ||
        frTipo(f).toUpperCase().includes(q) ||
        frUts(f).toUpperCase().includes(q)
      );
    }
    return lista;
  }, [porPlacaTipo, filtro, busqueda]);

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Fleetrun"
        subtitle={isLoading ? 'Cargando…' : `${stats.total} registros`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/fleetrun') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {/* Stats + Donut */}
          <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <DonutChart vencidos={stats.vencidos} porVencer={stats.porVencer} vigentes={stats.vigentes} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: 'var(--s-2) var(--s-4)' }}>
              {[
                { label: 'Flota total',   valor: stats.total,     color: 'accent' },
                { label: 'Vencidos',      valor: stats.vencidos,  color: 'red',   pct: stats.total ? Math.round(stats.vencidos / stats.total * 100) : 0 },
                { label: 'Por vencer',    valor: stats.porVencer, color: 'amber', pct: stats.total ? Math.round(stats.porVencer / stats.total * 100) : 0 },
                { label: 'Vigentes',      valor: stats.vigentes,  color: 'green', pct: stats.total ? Math.round(stats.vigentes / stats.total * 100) : 0 },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: `var(--${s.color === 'accent' ? 'accent' : s.color + '-ink'})` }}>
                    {s.valor}
                    {'pct' in s && (s as { pct: number }).pct > 0 && <span style={{ fontSize: '0.75rem', marginLeft: 4, opacity: 0.7 }}>{(s as { pct: number }).pct}%</span>}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            {FILTROS.map(f => {
              const color = f === 'Vencido' ? 'red' : f === 'Por vencer' ? 'amber' : f === 'Vigente' ? 'green' : '';
              const cnt = f === TODOS ? stats.total : f === 'Vencido' ? stats.vencidos : f === 'Por vencer' ? stats.porVencer : stats.vigentes;
              return (
                <button key={f} type="button"
                  className={`chip${filtro === f ? ' chip--active' : ''}`}
                  onClick={() => setFiltro(f)}>
                  {color && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: `var(--${color}-ink)`, marginRight: 4 }} />}
                  {f} <span className="chip__badge">{cnt}</span>
                </button>
              );
            })}
            <div style={{ marginLeft: 'auto', maxWidth: '16rem' }}>
              <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa o tipo…" />
            </div>
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <Gauge size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin registros Fleetrun'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Los registros de mantenimiento preventivo aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '52rem' }}>
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Tipo MP</th>
                    <th>Modelo</th>
                    <th>Fecha</th>
                    <th style={{ textAlign: 'right' }}>Km cambio</th>
                    <th style={{ textAlign: 'right' }}>Km actual (GPS)</th>
                    <th style={{ textAlign: 'right' }}>Cuánto falta</th>
                    <th style={{ textAlign: 'right' }}>Km próx.</th>
                    <th style={{ textAlign: 'right' }}>Frecuencia</th>
                    <th>Estado</th>
                    <th>Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f) => {
                    const kmC  = frKmCambio(f);
                    const kmP  = frKmProx(f);
                    const kmG  = frKmGps(f);
                    const frec = frFrecuencia(f);
                    const falta = kmG > 0 && kmP > 0 ? kmP - kmG : (kmP > 0 && kmC > 0 ? kmP - kmC : 0);
                    const e = estadoFR(f);
                    const color = estadoFRColor(e);
                    return (
                      <tr key={frId(f) || `${frPlaca(f)}-${frTipo(f)}`}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>
                          {frPlaca(f)}
                        </td>
                        <td style={{ fontWeight: 600 }}>{frTipo(f)}</td>
                        <td style={{ color: 'var(--label-2)', fontSize: '0.8125rem' }}>{frUts(f) || '—'}</td>
                        <td style={{ color: 'var(--label-2)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>{frFecha(f)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                          {kmC > 0 ? kmC.toLocaleString('es-PE') : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: kmG > 0 ? 'var(--label-1)' : 'var(--label-3)' }}>
                          {kmG > 0 ? kmG.toLocaleString('es-PE') : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem',
                          color: falta < 0 ? 'var(--red-ink)' : falta <= 1000 ? 'var(--amber-ink)' : 'var(--green-ink)',
                          fontWeight: falta < 0 ? 700 : undefined }}>
                          {falta !== 0 ? (falta < 0 ? `${Math.abs(falta).toLocaleString('es-PE')} ↑` : falta.toLocaleString('es-PE')) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem',
                          color: e !== 'vigente' ? `var(--${color}-ink)` : undefined, fontWeight: e !== 'vigente' ? 700 : undefined }}>
                          {kmP > 0 ? kmP.toLocaleString('es-PE') : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--label-2)' }}>
                          {frec > 0 ? frec.toLocaleString('es-PE') : '—'}
                        </td>
                        <td>
                          <span className={`ot-estado ot-estado--${color}`}>{estadoFRLabel(e)}</span>
                        </td>
                        <td style={{ color: 'var(--label-2)', fontSize: '0.8125rem', maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {frObs(f) || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
