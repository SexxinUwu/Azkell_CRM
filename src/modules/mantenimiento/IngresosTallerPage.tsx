import './mant.css';
import { useMemo, useState } from 'react';
import { CircleDollarSign, Clock, RotateCcw, Wrench, X } from 'lucide-react';
import { Page, PageHeader, Notice, EmptyState } from '../../core/ui/Display';
import { Button, PageLoader } from '../../core/ui/Button';
import { BarrasGrafico } from '../../core/ui/Graficos';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import { otDetalles, otId, otTipo, tiempoNetoOT, useOrdenesTrabajoData, useStatusRampa, type OrdenTrabajo } from './api';
import { horasTxt, indicadoresTaller } from './tiemposTaller';

// Reporte de ingresos a taller (equivalente al tablero de Power BI "Ingreso Taller").
// Todo se calcula en el navegador sobre las OT del intervalo de fechas elegido.

const TIPOS = ['Correctivo', 'Preventivo', 'Predictivo', 'Proactivo', 'Servicio'] as const;
type Tipo = typeof TIPOS[number] | 'Otros';

const COLOR_TIPO: Record<Tipo, string> = {
  Correctivo: 'var(--accent)',
  Preventivo: 'var(--green-ink)',
  Predictivo: '#3b82f6',
  Proactivo: '#8b5cf6',
  Servicio: 'var(--amber-ink)',
  Otros: 'var(--label-3)',
};

const hoyLima = (desplazarDias = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - desplazarDias);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
};

/** Fecha de ingreso de la OT (AAAA-MM-DD), igual que la columna de fecha de la pantalla de OT */
const fechaIngreso = (o: OrdenTrabajo) => (o.fecha_ingreso || o.creado_en || o.created_at || '').slice(0, 10);

/** Tipo de OT según el catálogo (Correctivo, Preventivo, Predictivo, Proactivo, Servicio) */
function tipoOT(o: OrdenTrabajo): Tipo {
  const t = String(otDetalles(o).tipo_ot || otTipo(o).split(' / ')[0] || '').trim().toLowerCase();
  return TIPOS.find(x => x.toLowerCase() === t) ?? 'Otros';
}

/** Falla reportada de la OT: mismo campo que la ficha de la OT (motivo, o las observaciones si no hay motivo) */
const fallaOT = (o: OrdenTrabajo) => String(otDetalles(o).motivo || o.observaciones || '');

/** Solo la descripción de la falla: sin "[Reporte F-…]", sin viñeta y sin la categoría ("Falla Manual : ") */
function textoFalla(o: OrdenTrabajo): string {
  return fallaOT(o)
    .replace(/\[Reporte[^\]]*\]/gi, '\n')
    .split(/\n|•/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => { const i = l.indexOf(' : '); return i >= 0 ? l.slice(i + 3).trim() : l; })
    .filter(Boolean)
    .join('\n');
}

const money = (v: number) => `S/ ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const costoOT = (o: OrdenTrabajo) => Number(o.costo_total_pen ?? o.costo_total ?? 0) || 0;
const minutosOT = (o: OrdenTrabajo) => Math.round(tiempoNetoOT(o).neto / 60000);

const COL_OBS: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Placa', ancho: 110 },
  { id: 'obs', titulo: 'Observaciones (reporte de falla)', ancho: 460, minimo: 200 },
];
const COL_MIN: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Placa', ancho: 110 },
  { id: 'min', titulo: 'Tiempo trabajado (min)', ancho: 150, alinear: 'right' },
];
const COL_RECUENTO: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Placa', ancho: 110 },
  { id: 'n', titulo: 'Recuento tipo OT', ancho: 130, alinear: 'right' },
];

export function IngresosTallerPage() {
  const q = useOrdenesTrabajoData();
  const [desde, setDesde] = useState(() => hoyLima(6));
  const [hasta, setHasta] = useState(() => hoyLima(0));
  const [placaSel, setPlacaSel] = useState<string | null>(null);
  const rampasQ = useStatusRampa();
  const indicadores = useMemo(() => indicadoresTaller(rampasQ.data ?? [], q.data ?? [], desde, hasta), [rampasQ.data, q.data, desde, hasta]);

  const ots = useMemo(() => {
    const lista = q.data ?? [];
    return lista.filter(o => {
      const f = fechaIngreso(o);
      return !!f && f >= desde && f <= hasta;
    });
  }, [q.data, desde, hasta]);

  // Totales generales
  const kpi = useMemo(() => {
    const total = ots.reduce((s, o) => s + costoOT(o), 0);
    const porPlaca = new Map<string, number>();
    ots.forEach(o => porPlaca.set(o.placa, (porPlaca.get(o.placa) ?? 0) + 1));
    return {
      total,
      ots: ots.length,
      placas: porPlaca.size,
      reingresos: [...porPlaca.values()].filter(n => n > 1).length,
      costoPromedio: ots.length ? total / ots.length : 0,
    };
  }, [ots]);

  // Tipos de OT ejecutadas: cantidad y porcentaje, con la meta 60% preventivo / 40% correctivo
  const tipos = useMemo(() => {
    const cuenta: Record<Tipo, number> = { Correctivo: 0, Preventivo: 0, Predictivo: 0, Proactivo: 0, Servicio: 0, Otros: 0 };
    ots.forEach(o => { cuenta[tipoOT(o)]++; });
    const n = ots.length;
    const pct = (v: number) => (n ? Math.round((v / n) * 1000) / 10 : 0);
    const mostrados: Tipo[] = [...TIPOS, ...(cuenta.Otros ? (['Otros'] as Tipo[]) : [])];
    return {
      pctPreventivo: pct(cuenta.Preventivo),
      pctCorrectivo: pct(cuenta.Correctivo),
      barras: mostrados.map(t => ({
        nombre: `${t} · ${cuenta[t]} (${pct(cuenta[t])}%)`,
        valor: cuenta[t],
        color: COLOR_TIPO[t],
      })),
    };
  }, [ots]);

  // Por placa: OT, observaciones, minutos trabajados
  const porPlaca = useMemo(() => {
    const m = new Map<string, OrdenTrabajo[]>();
    ots.forEach(o => m.set(o.placa, [...(m.get(o.placa) ?? []), o]));
    return [...m.entries()].map(([placa, lista]) => ({
      placa,
      ots: [...lista].sort((a, b) => fechaIngreso(b).localeCompare(fechaIngreso(a)) || otId(b).localeCompare(otId(a))),
      min: lista.reduce((s, o) => s + minutosOT(o), 0),
    }));
  }, [ots]);

  const observacionesPorPlaca = useMemo(
    () => porPlaca.filter(p => p.ots.some(o => textoFalla(o))).sort((a, b) => a.placa.localeCompare(b.placa)),
    [porPlaca],
  );
  const tiempoPorPlaca = useMemo(() => [...porPlaca].sort((a, b) => b.min - a.min), [porPlaca]);
  const recuentoPorPlaca = useMemo(() => [...porPlaca].sort((a, b) => b.ots.length - a.ots.length || a.placa.localeCompare(b.placa)), [porPlaca]);

  const totalMin = tiempoPorPlaca.reduce((s, p) => s + p.min, 0);
  const totalRecuento = recuentoPorPlaca.reduce((s, p) => s + p.ots.length, 0);

  // Detalle de la placa seleccionada: cada ingreso a taller con su observación
  const detalle = useMemo(() => porPlaca.find(p => p.placa === placaSel) ?? null, [porPlaca, placaSel]);

  return (
    <Page>
      <PageHeader eyebrow="Mantenimiento" title="Ingresos a taller" subtitle={q.isLoading ? 'Cargando…' : `${kpi.ots} órdenes de trabajo en el intervalo`} />

      {/* Filtro de fechas y valorizado del periodo */}
      <div style={{ display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 'var(--s-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="aud-fecha"><span>Ingreso desde</span><input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /></label>
          <label className="aud-fecha"><span>Ingreso hasta</span><input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} /></label>
        </div>
        <div className="placas-kpi placas-kpi--green" style={{ minWidth: 240 }}>
          <span className="placas-kpi__valor t-numeric">{money(kpi.total)}</span>
          <span className="placas-kpi__label">Suma de costo total (S/)</span>
        </div>
      </div>

      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : ots.length === 0 ? (
        <EmptyState icon={<Wrench size={22} />} title="Sin órdenes en el intervalo">Cambia las fechas para ver los ingresos a taller.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {/* Gráfica por tipo de OT y meta */}
          <div className="mant-grid">
            <div className="mant-col-8">
              <div className="mant-card" style={{ height: '100%' }}>
                <div className="mant-card__header">
                  <div className="mant-card__title"><Wrench size={15} /> Recuento de OT por tipo</div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--label-2)' }}>cantidad y %</span>
                </div>
                <BarrasGrafico porciones={tipos.barras} altura={220} />
              </div>
            </div>
            <div className="mant-col-4">
              <div className="mant-card" style={{ height: '100%' }}>
                <div className="mant-card__header">
                  <div className="mant-card__title"><CircleDollarSign size={15} /> Meta de mantenimiento</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
                  <div><b>Preventivo</b> {tipos.pctPreventivo}% · meta 60%
                    <div style={{ height: 8, background: 'var(--fill)', borderRadius: 999, overflow: 'hidden', marginTop: 4 }}>
                      <div style={{ width: `${Math.min(100, tipos.pctPreventivo)}%`, height: '100%', background: tipos.pctPreventivo >= 60 ? 'var(--green-ink)' : 'var(--amber-ink)' }} />
                    </div>
                  </div>
                  <div><b>Correctivo</b> {tipos.pctCorrectivo}% · meta 40%
                    <div style={{ height: 8, background: 'var(--fill)', borderRadius: 999, overflow: 'hidden', marginTop: 4 }}>
                      <div style={{ width: `${Math.min(100, tipos.pctCorrectivo)}%`, height: '100%', background: tipos.pctCorrectivo <= 40 ? 'var(--green-ink)' : 'var(--red-ink)' }} />
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                    {kpi.placas} placas · {kpi.reingresos} con reingreso · costo promedio {money(kpi.costoPromedio)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Indicadores de tiempo (permanencia, MTTR y espera) */}
          <div className="placas-resumen">
            <div className="placas-kpi placas-kpi--blue"><span className="placas-kpi__valor t-numeric">{horasTxt(indicadores.permanenciaHoras)}</span><span className="placas-kpi__label">Permanencia promedio en taller · {indicadores.permanenciaN} visitas{indicadores.permanenciaEnRampa ? ` · ${indicadores.permanenciaEnRampa} aún en rampa` : ''}</span></div>
            <div className="placas-kpi placas-kpi--accent"><span className="placas-kpi__valor t-numeric">{horasTxt(indicadores.mttrHoras)}</span><span className="placas-kpi__label">MTTR (trabajo sin pausas) · {indicadores.mttrN} OT · {indicadores.mttrExcluidas} excluidas sin fecha de inicio</span></div>
            <div className="placas-kpi placas-kpi--amber"><span className="placas-kpi__valor t-numeric">{horasTxt(indicadores.esperaHoras)}</span><span className="placas-kpi__label">Tiempo de espera promedio · {indicadores.esperaN} OT con visita · {indicadores.esperaSinVisita} sin visita</span></div>
          </div>

          {/* Observaciones, tiempo trabajado y recuento por placa */}
          <div className="mant-grid">
            <div className="mant-col-6">
              <div className="mant-card" style={{ height: '100%' }}>
                <div className="mant-card__header">
                  <div className="mant-card__title"><Wrench size={15} /> Observaciones según reporte de falla</div>
                </div>
                <TablaRedimensionable id="ingresos-taller-obs" columnas={COL_OBS} ariaLabel="Observaciones de falla por placa" altoMax="50vh">
                  {observacionesPorPlaca.map(p => (
                    <tr key={p.placa} onClick={() => setPlacaSel(p.placa)} style={{ cursor: 'pointer' }}>
                      <Celda><LicensePlate plate={p.placa} size="sm" /></Celda>
                      <Celda>
                        <span style={{ whiteSpace: 'pre-line' }}>
                          {p.ots.map(o => textoFalla(o)).filter(Boolean).join('\n')}
                        </span>
                      </Celda>
                    </tr>
                  ))}
                </TablaRedimensionable>
              </div>
            </div>
            <div className="mant-col-3">
              <div className="mant-card" style={{ height: '100%' }}>
                <div className="mant-card__header">
                  <div className="mant-card__title"><Clock size={15} /> Tiempo trabajado</div>
                </div>
                <TablaRedimensionable id="ingresos-taller-min" columnas={COL_MIN} ariaLabel="Tiempo trabajado por placa" altoMax="50vh">
                  {tiempoPorPlaca.map(p => (
                    <tr key={p.placa} onClick={() => setPlacaSel(p.placa)} style={{ cursor: 'pointer' }}>
                      <Celda><LicensePlate plate={p.placa} size="sm" /></Celda>
                      <Celda alinear="right" mono>{p.min.toLocaleString('es-PE')}</Celda>
                    </tr>
                  ))}
                  <tr>
                    <Celda><b>Total</b></Celda>
                    <Celda alinear="right" mono><b>{totalMin.toLocaleString('es-PE')}</b></Celda>
                  </tr>
                </TablaRedimensionable>
              </div>
            </div>
            <div className="mant-col-3">
              <div className="mant-card" style={{ height: '100%' }}>
                <div className="mant-card__header">
                  <div className="mant-card__title"><RotateCcw size={15} /> Recuento por placa</div>
                </div>
                <TablaRedimensionable id="ingresos-taller-recuento" columnas={COL_RECUENTO} ariaLabel="Recuento de OT por placa" altoMax="50vh">
                  {recuentoPorPlaca.map(p => (
                    <tr key={p.placa} onClick={() => setPlacaSel(p.placa)} style={{ cursor: 'pointer' }}>
                      <Celda><LicensePlate plate={p.placa} size="sm" /></Celda>
                      <Celda alinear="right" mono>{p.ots.length}{p.ots.length > 1 && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--red-ink)' }}>reingreso</span>}</Celda>
                    </tr>
                  ))}
                  <tr>
                    <Celda><b>Total</b></Celda>
                    <Celda alinear="right" mono><b>{totalRecuento}</b></Celda>
                  </tr>
                </TablaRedimensionable>
              </div>
            </div>
          </div>

          {/* Ingresos de la placa seleccionada, con su observación de cada uno */}
          {detalle ? (
            <div className="mant-card">
              <div className="mant-card__header">
                <div className="mant-card__title">
                  Ingresos de <LicensePlate plate={detalle.placa} size="sm" /> · {detalle.ots.length} OT · {detalle.min.toLocaleString('es-PE')} min trabajados
                </div>
                <Button variant="secondary" size="sm" icon={<X size={14} />} onClick={() => setPlacaSel(null)}>Cerrar</Button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
                {detalle.ots.map(o => (
                  <div key={otId(o)} style={{ padding: 'var(--s-3)', borderRadius: 12, background: 'var(--fill-2)' }}>
                    <div style={{ display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap', alignItems: 'baseline', fontSize: '0.8125rem' }}>
                      <b style={{ fontFamily: 'var(--font-mono)' }}>{otId(o)}</b>
                      <span>{fechaIngreso(o)}</span>
                      <span style={{ color: 'var(--label-2)' }}>{otTipo(o)}</span>
                      <span style={{ color: 'var(--label-2)' }}>{o.estado}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>{minutosOT(o).toLocaleString('es-PE')} min</span>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: 'pre-line', fontSize: '0.8125rem', color: textoFalla(o) ? 'var(--label)' : 'var(--label-3)' }}>
                      {textoFalla(o) || 'Sin falla reportada en esta OT'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>
              Selecciona una placa en cualquiera de las tablas para ver sus ingresos a taller y las observaciones de cada uno.
            </div>
          )}

          <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>
            Permanencia: ingreso a rampa → salida (solo visitas liberadas). MTTR: trabajo sin pausas por OT cerrada; las OT cerradas sin fecha de inicio no entran y se cuentan aparte. Espera: permanencia − trabajo, en las OT con visita vinculada. Las fechas usan la fecha de ingreso.
          </div>
        </div>
      )}
    </Page>
  );
}
