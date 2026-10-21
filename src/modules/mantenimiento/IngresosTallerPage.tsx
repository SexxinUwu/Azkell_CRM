import './mant.css';
import { useMemo, useState } from 'react';
import { CircleDollarSign, Clock, RotateCcw, Wrench } from 'lucide-react';
import { Page, PageHeader, Notice, EmptyState } from '../../core/ui/Display';
import { PageLoader } from '../../core/ui/Button';
import { BarrasGrafico } from '../../core/ui/Graficos';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import { otId, otTipo, tiempoNetoOT, useOrdenesTrabajoData, useStatusRampa, type OrdenTrabajo } from './api';
import { horasTxt, indicadoresTaller } from './tiemposTaller';

// Reporte de ingresos a taller (equivalente al tablero de Power BI "Ingreso Taller").
// Todo se calcula en el navegador sobre las OT del intervalo de fechas elegido.

const hoyLima = (desplazarDias = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - desplazarDias);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
};

/** Fecha de ingreso de la OT (AAAA-MM-DD), igual que la columna de fecha de la pantalla de OT */
const fechaIngreso = (o: OrdenTrabajo) => {
  const f = o.fecha_ingreso || o.creado_en || o.created_at || '';
  return f.slice(0, 10);
};

type Clase = 'Preventivo' | 'Correctivo' | 'Predictivo' | 'Otros';
function claseOT(o: OrdenTrabajo): Clase {
  const t = otTipo(o).toLowerCase();
  if (t.includes('prev')) return 'Preventivo';
  if (t.includes('predic')) return 'Predictivo';
  if (t.includes('corr')) return 'Correctivo';
  return 'Otros';
}

const COLOR_CLASE: Record<Clase, string> = {
  Preventivo: 'var(--green-ink)',
  Correctivo: 'var(--accent)',
  Predictivo: '#3b82f6',
  Otros: 'var(--label-3)',
};

const money = (v: number) => `S/ ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const costoOT = (o: OrdenTrabajo) => Number(o.costo_total_pen ?? o.costo_total ?? 0) || 0;

const COL_OBS: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Placa', ancho: 120 },
  { id: 'obs', titulo: 'Observaciones (reporte de falla)', ancho: 520, minimo: 200 },
  { id: 'ot', titulo: 'OT', ancho: 130 },
];
const COL_TIEMPO: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Placa', ancho: 140 },
  { id: 'min', titulo: 'Tiempo trabajado (min)', ancho: 180, alinear: 'right' },
  { id: 'h', titulo: 'Horas', ancho: 110, alinear: 'right' },
];
const COL_PLACAS: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Placa', ancho: 140 },
  { id: 'ots', titulo: 'OT en el periodo', ancho: 150, alinear: 'right' },
  { id: 'estado', titulo: 'Situación', ancho: 150 },
];

export function IngresosTallerPage() {
  const q = useOrdenesTrabajoData();
  const [desde, setDesde] = useState(() => hoyLima(6));
  const [hasta, setHasta] = useState(() => hoyLima(0));
  const rampasQ = useStatusRampa();
  const indicadores = useMemo(() => indicadoresTaller(rampasQ.data ?? [], q.data ?? [], desde, hasta), [rampasQ.data, q.data, desde, hasta]);

  const ots = useMemo(() => {
    const lista = q.data ?? [];
    return lista.filter(o => {
      const f = fechaIngreso(o);
      return !!f && f >= desde && f <= hasta;
    });
  }, [q.data, desde, hasta]);

  // Indicadores
  const kpi = useMemo(() => {
    const total = ots.reduce((s, o) => s + costoOT(o), 0);
    const minutos = ots.reduce((s, o) => s + tiempoNetoOT(o).neto / 60000, 0);
    const porPlaca = new Map<string, number>();
    ots.forEach(o => porPlaca.set(o.placa, (porPlaca.get(o.placa) ?? 0) + 1));
    const reingresos = [...porPlaca.values()].filter(n => n > 1).length;
    return {
      total,
      ots: ots.length,
      placas: porPlaca.size,
      costoPromedio: ots.length ? total / ots.length : 0,
      horas: minutos / 60,
      reingresos,
    };
  }, [ots]);

  // Tipo de OT: cantidad y porcentaje, con meta 60% preventivo / 40% correctivo
  const tipos = useMemo(() => {
    const cuenta: Record<Clase, number> = { Preventivo: 0, Correctivo: 0, Predictivo: 0, Otros: 0 };
    ots.forEach(o => { cuenta[claseOT(o)]++; });
    const n = ots.length;
    const pct = (v: number) => (n ? Math.round((v / n) * 1000) / 10 : 0);
    return {
      cuenta,
      pctPreventivo: pct(cuenta.Preventivo),
      pctCorrectivo: pct(cuenta.Correctivo),
      barras: (Object.keys(cuenta) as Clase[]).map(c => ({
        nombre: `${c} · ${cuenta[c]} (${pct(cuenta[c])}%)`,
        valor: cuenta[c],
        color: COLOR_CLASE[c],
      })),
    };
  }, [ots]);

  // Observaciones por placa (texto del reporte de falla que llegó a la OT)
  const observaciones = useMemo(
    () => ots.filter(o => (o.observaciones ?? '').trim()).sort((a, b) => a.placa.localeCompare(b.placa)),
    [ots],
  );

  // Tiempo trabajado acumulado por placa (sin pausas)
  const tiempoPorPlaca = useMemo(() => {
    const m = new Map<string, number>();
    ots.forEach(o => m.set(o.placa, (m.get(o.placa) ?? 0) + tiempoNetoOT(o).neto / 60000));
    return [...m.entries()].map(([placa, min]) => ({ placa, min: Math.round(min) })).sort((a, b) => b.min - a.min);
  }, [ots]);

  // OT por placa y reingresos
  const otsPorPlaca = useMemo(() => {
    const m = new Map<string, OrdenTrabajo[]>();
    ots.forEach(o => m.set(o.placa, [...(m.get(o.placa) ?? []), o]));
    return [...m.entries()]
      .map(([placa, lista]) => ({ placa, cantidad: lista.length, enTaller: lista.some(o => o.estado === 'En Proceso' || o.estado === 'Pausada') }))
      .sort((a, b) => b.cantidad - a.cantidad || a.placa.localeCompare(b.placa));
  }, [ots]);

  return (
    <Page>
      <PageHeader eyebrow="Mantenimiento" title="Ingresos a taller" subtitle={q.isLoading ? 'Cargando…' : `${kpi.ots} órdenes de trabajo en el intervalo`} />

      {/* 1. Intervalo de búsqueda por fechas */}
      <div style={{ display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 'var(--s-4)' }}>
        <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /></label>
        <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} /></label>
      </div>

      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : ots.length === 0 ? (
        <EmptyState icon={<Wrench size={22} />} title="Sin órdenes en el intervalo">Cambia las fechas para ver los ingresos a taller.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {/* Indicadores */}
          <div className="placas-resumen">
            <div className="placas-kpi placas-kpi--blue"><span className="placas-kpi__valor t-numeric">{horasTxt(indicadores.permanenciaHoras)}</span><span className="placas-kpi__label">Permanencia promedio en taller · {indicadores.permanenciaN} visitas{indicadores.permanenciaEnRampa ? ` · ${indicadores.permanenciaEnRampa} aún en rampa` : ''}</span></div>
            <div className="placas-kpi placas-kpi--accent"><span className="placas-kpi__valor t-numeric">{horasTxt(indicadores.mttrHoras)}</span><span className="placas-kpi__label">MTTR (trabajo sin pausas) · {indicadores.mttrN} OT · {indicadores.mttrExcluidas} excluidas sin fecha de inicio</span></div>
            <div className="placas-kpi placas-kpi--amber"><span className="placas-kpi__valor t-numeric">{horasTxt(indicadores.esperaHoras)}</span><span className="placas-kpi__label">Tiempo de espera promedio · {indicadores.esperaN} OT con visita · {indicadores.esperaSinVisita} sin visita</span></div>
            <div className="placas-kpi placas-kpi--green"><span className="placas-kpi__valor t-numeric">{money(kpi.total)}</span><span className="placas-kpi__label">Valorizado de gasto por OT</span></div>
            <div className="placas-kpi placas-kpi--blue"><span className="placas-kpi__valor t-numeric">{kpi.ots}</span><span className="placas-kpi__label">Órdenes de trabajo · {kpi.placas} placas</span></div>
            <div className="placas-kpi placas-kpi--accent"><span className="placas-kpi__valor t-numeric">{money(kpi.costoPromedio)}</span><span className="placas-kpi__label">Costo promedio por OT</span></div>
            <div className="placas-kpi placas-kpi--amber"><span className="placas-kpi__valor t-numeric">{kpi.horas.toLocaleString('es-PE', { maximumFractionDigits: 1 })} h</span><span className="placas-kpi__label">Tiempo trabajado (sin pausas)</span></div>
            <div className="placas-kpi"><span className="placas-kpi__valor t-numeric">{kpi.reingresos}</span><span className="placas-kpi__label">Placas con reingreso (más de 1 OT)</span></div>
          </div>

          {/* Tipo de OT con meta */}
          <div className="mant-grid">
            <div className="mant-col-7">
              <div className="mant-card" style={{ height: '100%' }}>
                <div className="mant-card__header">
                  <div className="mant-card__title"><Wrench size={15} /> Tipo de OT ejecutadas</div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--label-2)' }}>cantidad y %</span>
                </div>
                <BarrasGrafico porciones={tipos.barras} altura={200} />
              </div>
            </div>
            <div className="mant-col-5">
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
                </div>
              </div>
            </div>
          </div>

          {/* Observaciones del reporte de falla */}
          <div className="mant-card">
            <div className="mant-card__header">
              <div className="mant-card__title"><Wrench size={15} /> Observaciones según reporte de falla</div>
            </div>
            <TablaRedimensionable id="ingresos-taller-obs" columnas={COL_OBS} ariaLabel="Observaciones de falla por placa" altoMax="40vh">
              {observaciones.map(o => (
                <tr key={otId(o)}>
                  <Celda><LicensePlate plate={o.placa} size="sm" /></Celda>
                  <Celda><span style={{ whiteSpace: 'pre-line' }}>{o.observaciones}</span></Celda>
                  <Celda mono>{otId(o)}</Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          </div>

          <div className="mant-grid">
            {/* Tiempo total acumulado por placa */}
            <div className="mant-col-6">
              <div className="mant-card" style={{ height: '100%' }}>
                <div className="mant-card__header">
                  <div className="mant-card__title"><Clock size={15} /> Tiempo total acumulado por placa</div>
                </div>
                <TablaRedimensionable id="ingresos-taller-tiempo" columnas={COL_TIEMPO} ariaLabel="Tiempo trabajado por placa" altoMax="40vh">
                  {tiempoPorPlaca.map(t => (
                    <tr key={t.placa}>
                      <Celda><LicensePlate plate={t.placa} size="sm" /></Celda>
                      <Celda alinear="right" mono>{t.min.toLocaleString('es-PE')}</Celda>
                      <Celda alinear="right" mono>{(t.min / 60).toLocaleString('es-PE', { maximumFractionDigits: 1 })}</Celda>
                    </tr>
                  ))}
                </TablaRedimensionable>
              </div>
            </div>

            {/* OT por placa: reingresos */}
            <div className="mant-col-6">
              <div className="mant-card" style={{ height: '100%' }}>
                <div className="mant-card__header">
                  <div className="mant-card__title"><RotateCcw size={15} /> OT por placa (reingreso y en taller)</div>
                </div>
                <TablaRedimensionable id="ingresos-taller-placas" columnas={COL_PLACAS} ariaLabel="OT por placa" altoMax="40vh">
                  {otsPorPlaca.map(p => (
                    <tr key={p.placa}>
                      <Celda><LicensePlate plate={p.placa} size="sm" /></Celda>
                      <Celda alinear="right" mono>{p.cantidad}</Celda>
                      <Celda>{p.cantidad > 1 ? 'Reingreso' : p.enTaller ? 'En taller' : '—'}</Celda>
                    </tr>
                  ))}
                </TablaRedimensionable>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>
            Permanencia: ingreso a rampa → salida (solo visitas liberadas). MTTR: trabajo sin pausas por OT cerrada; las OT cerradas sin fecha de inicio no entran y se cuentan aparte. Espera: permanencia − trabajo, en las OT con visita vinculada. Las fechas usan la fecha de ingreso.
          </div>
        </div>
      )}
    </Page>
  );
}
