import './mant.css';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, BookOpen, Gauge, SearchX, Trash2 } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { api, errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import {
  frFecha, frId, frKmCambio, frKmGps, frKmProx, frFrecuencia,
  frObs, frPlaca, frTipo, frUts, useFleetrun, type FleetrunFila,
} from './api';
import { usePlacas, useMetricas } from '../placas/api';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type EstadoFR = 'vencido' | 'por_vencer' | 'vigente' | 'sin_datos';
const PRIORIDAD: Record<EstadoFR, number> = { sin_datos: -1, vigente: 0, por_vencer: 1, vencido: 2 };

// ─── Hook: umbrales configurables desde /api/configuracion ───────────────────

function useFleetrunUmbrales() {
  return useQuery<Record<string, number>>({
    queryKey: ['conf', 'fleetrun-umbrales'],
    queryFn: async () => {
      try {
        // Lectura de la base de esta empresa (no de la base global de /configuracion)
        const conf = await api<{ valor: string | null }>('/configuracion-clave/fleetrun_uts_umbrales');
        const raw = conf.valor || '{}';
        return JSON.parse(raw) as Record<string, number>;
      } catch { return {}; }
    },
    staleTime: 300_000,
  });
}

// ─── Lógica de estado (igual a la SPA clásica) ───────────────────────────────

function calcularEstado(
  f: FleetrunFila,
  uts: string,
  umbrales: Record<string, number>,
  metricas: Map<string, string>,
): EstadoFR {
  const placa = frPlaca(f).toUpperCase();
  const esHoras = metricas.get(placa) === 'horas';
  const kmG = frKmGps(f);
  let kmP = frKmProx(f);
  const kmC = frKmCambio(f);
  const frec = frFrecuencia(f);

  if ((!kmP || kmP === 0) && frec > 0 && kmC > 0) kmP = kmC + frec;
  // Sin próximo km no hay cálculo: no se presenta como vigente
  if (!kmP) return 'sin_datos';

  const kmRestante = kmG > 0 ? kmP - kmG : kmP - kmC;
  if (kmRestante <= 0) return 'vencido';

  // Umbral por tipo de UTS configurable (fallback: Nacional=1500, Local=100, resto=1000)
  const utsU = uts.toUpperCase();
  const sufijo = esHoras ? '_HORAS' : '_KM';
  let umbral = umbrales[utsU + sufijo] ?? umbrales[utsU];
  if (umbral === undefined) {
    if (utsU === 'NACIONAL') umbral = 1500;
    else if (utsU === 'LOCAL') umbral = 100;
    else umbral = 1000;
  }

  return kmRestante <= umbral ? 'por_vencer' : 'vigente';
}

function estadoLabel(e: EstadoFR) {
  if (e === 'vencido')    return 'Vencido';
  if (e === 'por_vencer') return 'Por vencer';
  if (e === 'sin_datos') return 'Sin datos';
  return 'Vigente';
}

function estadoColor(e: EstadoFR) {
  if (e === 'vencido')    return 'red';
  if (e === 'por_vencer') return 'amber';
  return 'green';
}

// ─── Parseo de fecha DD/MM/YYYY o ISO ────────────────────────────────────────

function parseFechaMs(str: string | number | null): number {
  if (!str) return 0;
  const s = String(str).trim();
  const p = s.split('/');
  if (p.length === 3) {
    return new Date(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`).getTime() || 0;
  }
  return new Date(s).getTime() || 0;
}

// ─── Donut SVG ───────────────────────────────────────────────────────────────

function DonutChart({ vencidos, porVencer, vigentes }: { vencidos: number; porVencer: number; vigentes: number }) {
  const total = vencidos + porVencer + vigentes;
  if (!total) return null;
  const r = 40, cx = 50, cy = 50, circum = 2 * Math.PI * r;
  const pV = (vencidos / total) * circum;
  const pP = (porVencer / total) * circum;
  const pG = (vigentes / total) * circum;
  const o3 = circum - pV - pP;
  return (
    <svg viewBox="0 0 100 100" width={96} height={96} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      {vigentes > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--green-ink)" strokeWidth={18}
        strokeDasharray={`${pG} ${circum - pG}`} strokeDashoffset={-o3} />}
      {porVencer > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--amber-ink)" strokeWidth={18}
        strokeDasharray={`${pP} ${circum - pP}`} strokeDashoffset={-(circum - pV)} />}
      {vencidos > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--red-ink)" strokeWidth={18}
        strokeDasharray={`${pV} ${circum - pV}`} strokeDashoffset={0} />}
    </svg>
  );
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const FILTROS = ['Todos', 'Vencido', 'Por vencer', 'Vigente', 'Sin datos'] as const;
const POR_PAGINA = 20;

// ─── Componente principal ─────────────────────────────────────────────────────

export function FleetrunPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useFleetrun();
  const { data: placasData } = usePlacas();
  const { data: metricas = new Map<string, string>() } = useMetricas();
  const { data: umbrales = {} } = useFleetrunUmbrales();

  const [busqueda, setBusqueda]   = useState('');
  const [filtro, setFiltro]       = useState<string>('Todos');
  const [historial, setHistorial] = useState(false);
  const [pagina, setPagina]       = useState(1);
  const [eliminando, setEliminando] = useState<string | null>(null);

  const filas = data ?? [];

  // Mapa de placas activas: null = aún cargando
  const placasActivas = useMemo(() => {
    if (!placasData) return null;
    return new Map(
      placasData
        .filter(p => p.estado.toLowerCase() === 'activa' || p.estado === '')
        .map(p => [p.placa.toUpperCase(), p]),
    );
  }, [placasData]);

  // Ordenar igual que la SPA: fecha DESC, ID DESC; registros futuros al final
  const filasOrdenadas = useMemo(() => {
    const hoy = Date.now();
    return [...filas].sort((a, b) => {
      const ta = parseFechaMs(a[3] as string | null);
      const tb = parseFechaMs(b[3] as string | null);
      const aFut = ta > hoy + 86_400_000;
      const bFut = tb > hoy + 86_400_000;
      if (aFut !== bFut) return aFut ? 1 : -1;
      if (tb !== ta) return tb - ta;
      return (Number(b[0] ?? 0)) - (Number(a[0] ?? 0));
    });
  }, [filas]);

  // Deduplicar (último por placa+tipo) y filtrar por placas activas
  const datosVista = useMemo(() => {
    if (historial) return filasOrdenadas;
    const mapa = new Map<string, FleetrunFila>();
    for (const f of filasOrdenadas) {
      const placa = frPlaca(f).toUpperCase();
      const key   = `${placa}__${frTipo(f).toUpperCase()}`;
      // Si placas aún no cargó, mostrar todo (evita pantalla vacía temporal)
      if (placasActivas !== null && !placasActivas.has(placa)) continue;
      if (!mapa.has(key)) mapa.set(key, f);
    }
    return Array.from(mapa.values());
  }, [filasOrdenadas, historial, placasActivas]);

  // KPIs a nivel de PLACA (igual que la SPA — peor estado por placa)
  const stats = useMemo(() => {
    const placaEstado = new Map<string, EstadoFR>();
    for (const f of datosVista) {
      const placa = frPlaca(f).toUpperCase();
      const uts   = placasActivas?.get(placa)?.uts || frUts(f);
      const est   = calcularEstado(f, uts, umbrales, metricas);
      const prev  = placaEstado.get(placa);
      if (!prev || PRIORIDAD[est] > PRIORIDAD[prev]) placaEstado.set(placa, est);
    }
    let vencidos = 0, porVencer = 0, vigentes = 0, sinDatos = 0;
    placaEstado.forEach(e => {
      if (e === 'vencido') vencidos++;
      else if (e === 'por_vencer') porVencer++;
      else if (e === 'sin_datos') sinDatos++;
      else vigentes++;
    });
    return { vencidos, porVencer, vigentes, sinDatos, total: placaEstado.size };
  }, [datosVista, placasActivas, umbrales, metricas]);

  // Filtrado + búsqueda
  const filtrados = useMemo(() => {
    const LABEL_A_ESTADO: Record<string, EstadoFR> = {
      'Vencido': 'vencido', 'Por vencer': 'por_vencer', 'Vigente': 'vigente', 'Sin datos': 'sin_datos',
    };
    let lista = datosVista;
    if (filtro !== 'Todos') {
      const target = LABEL_A_ESTADO[filtro];
      lista = lista.filter(f => {
        const placa = frPlaca(f).toUpperCase();
        const uts   = placasActivas?.get(placa)?.uts || frUts(f);
        return calcularEstado(f, uts, umbrales, metricas) === target;
      });
    }
    if (busqueda) {
      const q = busqueda.toUpperCase();
      lista = lista.filter(f =>
        frPlaca(f).toUpperCase().includes(q) ||
        frTipo(f).toUpperCase().includes(q)  ||
        frUts(f).toUpperCase().includes(q),
      );
    }
    return lista;
  }, [datosVista, filtro, busqueda, placasActivas, umbrales, metricas]);

  // Paginación
  const totalPags   = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pagActual   = Math.min(pagina, totalPags);
  const vistaActual = filtrados.slice((pagActual - 1) * POR_PAGINA, pagActual * POR_PAGINA);

  function cambiarFiltro(f: string) { setFiltro(f); setPagina(1); }
  function cambiarBusqueda(v: string) { setBusqueda(v); setPagina(1); }

  // ─── Eliminar registro ────────────────────────────────────────────────────
  async function eliminarRegistro(f: FleetrunFila) {
    const id = frId(f);
    const placa = frPlaca(f);
    const tipo  = frTipo(f);
    if (!confirm(`¿Eliminar el registro de "${tipo}" para ${placa}? Esta acción no se puede deshacer.`)) return;
    setEliminando(id);
    try {
      await api('/script/eliminarRegistro', { method: 'POST', body: { id, coleccion: 'Fleetrun' } });
      qc.invalidateQueries({ queryKey: ['mant', 'fleetrun'] });
    } catch (e) {
      alert('Error al eliminar: ' + String(e));
    } finally {
      setEliminando(null);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Mantenimiento Preventivo"
        subtitle={
          isLoading
            ? 'Cargando…'
            : historial
              ? `${filtrados.length} registros (historial completo)`
              : `${stats.total} unidades activas`
        }
        actions={
          <MenuOtros opciones={[
            {
              label: historial ? 'Ver solo activos' : 'Ver historial completo',
              icon: <BookOpen size={17} />,
              onSelect: () => { setHistorial(h => !h); setPagina(1); setBusqueda(''); setFiltro('Todos'); },
            },
            {
              label: 'Registrar mantenimiento',
              icon: <ArrowUpRight size={17} />,
              onSelect: () => abrirClasico('mantenimiento/fleetrun'),
            },
            {
              label: 'Abrir versión completa',
              icon: <ArrowUpRight size={17} />,
              onSelect: () => abrirClasico('mantenimiento/fleetrun'),
            },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>

          {/* KPIs + Donut */}
          {!historial && (
            <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center', flexWrap: 'wrap' }}>
              <DonutChart vencidos={stats.vencidos} porVencer={stats.porVencer} vigentes={stats.vigentes} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: 'var(--s-2) var(--s-4)' }}>
                {[
                  { label: 'Flota total',  valor: stats.total,     color: 'accent' as const },
                  { label: 'Vencidos',     valor: stats.vencidos,  color: 'red'    as const, pct: stats.total ? Math.round(stats.vencidos  / stats.total * 100) : 0 },
                  { label: 'Por vencer',   valor: stats.porVencer, color: 'amber'  as const, pct: stats.total ? Math.round(stats.porVencer / stats.total * 100) : 0 },
                  { label: 'Vigentes',     valor: stats.vigentes,  color: 'green'  as const, pct: stats.total ? Math.round(stats.vigentes  / stats.total * 100) : 0 },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{
                      fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
                      color: s.color === 'accent' ? 'var(--accent)' : `var(--${s.color}-ink)`,
                    }}>
                      {s.valor}
                      {'pct' in s && (s as { pct: number }).pct > 0 && (
                        <span style={{ fontSize: '0.75rem', marginLeft: 4, opacity: 0.7 }}>{(s as { pct: number }).pct}%</span>
                      )}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filtros + búsqueda */}
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            {!historial && FILTROS.map(f => {
              const colorMap: Record<string, string> = { 'Vencido': 'red', 'Por vencer': 'amber', 'Vigente': 'green', 'Sin datos': '' };
              const color = colorMap[f] || '';
              const cnt = f === 'Todos' ? stats.total
                : f === 'Vencido' ? stats.vencidos
                : f === 'Por vencer' ? stats.porVencer
                : f === 'Sin datos' ? stats.sinDatos
                : stats.vigentes;
              return (
                <button key={f} type="button"
                  className={`chip${filtro === f ? ' chip--active' : ''}`}
                  onClick={() => cambiarFiltro(f)}>
                  {color && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                    background: `var(--${color}-ink)`, marginRight: 4 }} />}
                  {f} <span className="chip__badge">{cnt}</span>
                </button>
              );
            })}
            <div style={{ marginLeft: 'auto', maxWidth: '16rem' }}>
              <SearchField value={busqueda} onChange={cambiarBusqueda} placeholder="Placa, tipo…" />
            </div>
          </div>

          {/* Tabla */}
          {vistaActual.length === 0 ? (
            <EmptyState
              icon={busqueda ? <SearchX size={22} /> : <Gauge size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin registros'}
            >
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => cambiarBusqueda('')}>Quitar búsqueda</button>
                : 'Los registros de mantenimiento preventivo aparecerán aquí.'}
            </EmptyState>
          ) : (
            <>
              <div className="tarjeta__lista" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table className="inv-kardex" style={{ minWidth: '54rem' }}>
                  <thead>
                    <tr>
                      <th>Placa</th>
                      <th>Tipo MP</th>
                      <th>Modelo / UTS</th>
                      <th>Fecha</th>
                      <th style={{ textAlign: 'right' }}>Km cambio</th>
                      <th style={{ textAlign: 'right' }}>Km actual (GPS)</th>
                      <th style={{ textAlign: 'right' }}>Cuánto falta</th>
                      <th style={{ textAlign: 'right' }}>Km próx.</th>
                      <th style={{ textAlign: 'right' }}>Frecuencia</th>
                      <th>Estado</th>
                      <th>Obs.</th>
                      <th style={{ width: 36 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {vistaActual.map(f => {
                      const id    = frId(f);
                      const placa = frPlaca(f).toUpperCase();
                      const uts   = placasActivas?.get(placa)?.uts || frUts(f);
                      const kmC   = frKmCambio(f);
                      let   kmP   = frKmProx(f);
                      const kmG   = frKmGps(f);
                      const frec  = frFrecuencia(f);
                      const esHoras = metricas.get(placa) === 'horas';
                      const unidad  = esHoras ? 'h' : '';

                      if ((!kmP || kmP === 0) && frec > 0 && kmC > 0) kmP = kmC + frec;

                      const falta = kmG > 0 && kmP > 0
                        ? kmP - kmG
                        : kmP > 0 && kmC > 0 ? kmP - kmC : 0;

                      const est   = calcularEstado(f, uts, umbrales, metricas);
                      const color = estadoColor(est);

                      return (
                        <tr key={id || `${placa}-${frTipo(f)}`}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>
                            {placa}
                          </td>
                          <td style={{ fontWeight: 600 }}>{frTipo(f)}</td>
                          <td style={{ color: 'var(--label-2)', fontSize: '0.8125rem' }}>
                            {uts || placasActivas?.get(placa)?.modelo || '—'}
                          </td>
                          <td style={{ color: 'var(--label-2)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                            {frFecha(f) || <span style={{ color: 'var(--label-3)' }}>Plan inicial</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                            {kmC > 0 ? `${kmC.toLocaleString('es-PE')}${unidad}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem',
                            color: kmG > 0 ? 'var(--label-1)' : 'var(--label-3)' }}>
                            {kmG > 0 ? `${kmG.toLocaleString('es-PE')}${unidad}` : '—'}
                          </td>
                          <td style={{
                            textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: falta < 0 ? 700 : undefined,
                            color: falta < 0 ? 'var(--red-ink)' : falta === 0 ? 'var(--label-3)' : falta <= 1000 ? 'var(--amber-ink)' : 'var(--green-ink)',
                          }}>
                            {falta !== 0
                              ? `${falta < 0 ? Math.abs(falta).toLocaleString('es-PE') + ' ↑' : falta.toLocaleString('es-PE')}${unidad}`
                              : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem',
                            color: est !== 'vigente' ? `var(--${color}-ink)` : undefined,
                            fontWeight: est !== 'vigente' ? 700 : undefined }}>
                            {kmP > 0 ? `${kmP.toLocaleString('es-PE')}${unidad}` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--label-2)' }}>
                            {frec > 0 ? `${frec.toLocaleString('es-PE')}${unidad}` : '—'}
                          </td>
                          <td>
                            <span className={`ot-estado ot-estado--${color}`}>{estadoLabel(est)}</span>
                          </td>
                          <td style={{ color: 'var(--label-2)', fontSize: '0.8125rem', maxWidth: '9rem',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {frObs(f) || '—'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              title="Eliminar registro"
                              disabled={eliminando === id}
                              onClick={() => eliminarRegistro(f)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--label-3)', padding: '2px 4px', lineHeight: 1 }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--red-ink)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--label-3)')}
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPags > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', justifyContent: 'flex-end', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--label-2)' }}>
                    {(pagActual - 1) * POR_PAGINA + 1}–{Math.min(pagActual * POR_PAGINA, filtrados.length)} de {filtrados.length}
                  </span>
                  <button type="button" className="chip" disabled={pagActual <= 1}
                    onClick={() => setPagina(p => Math.max(1, p - 1))}>‹ Anterior</button>
                  <button type="button" className="chip" disabled={pagActual >= totalPags}
                    onClick={() => setPagina(p => Math.min(totalPags, p + 1))}>Siguiente ›</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Page>
  );
}
