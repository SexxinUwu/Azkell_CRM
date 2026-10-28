import './mant.css';
import { useMemo, useState, type ReactNode } from 'react';
import { CircleDollarSign, Clock, Truck, Wrench } from 'lucide-react';
import { Page, PageHeader, Notice, EmptyState } from '../../core/ui/Display';
import { PageLoader } from '../../core/ui/Button';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { BarrasGrafico } from '../../core/ui/Graficos';
import { MultiSelect } from '../../core/ui/MultiSelect';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import {
  otDetalles, otId, otTipo, tecnicosDeOT, tiempoNetoOT, trabajosDeOT,
  useFleetrun, useOrdenesTrabajoData, useStatusRampa, useTrabajosOT,
  frFecha, frFechaIso, frKmCambio, frPlaca, frTipo,
  type OrdenTrabajo, type RampaEntrada, type TrabajoOT,
} from './api';
import { useInspecciones, useInspeccionesNeumaticos, type Inspeccion, type InspeccionNeumaticos } from '../inspecciones/api';
import { ETIQUETA_ESTADO, evaluarCiclo, type Estado } from '../inspecciones/vigencia';
import { useMetricas, usePlacas, type Placa } from '../placas/api';
import { resumenPreventivo, useFleetrunUmbrales, useKmVivo } from './FleetrunPage';
import { costoOT } from './tiemposTaller';
import { fechaDMY, oracion } from '../../core/lib/texto';
import { usePersonalCanonico } from './personalCanonico';

// Dashboard de taller. Dos pestañas: Resumen y Ingresos a taller. El rango de fechas y la empresa
// afectan a todo. Los estados actuales (taller, rampa, preventivo) no cambian con el rango.

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

/** OT que todavía no terminan: la unidad sigue en taller */
// OT que siguen en taller. Las OT de la base pueden venir como 'Abierto' (sin distinguir mayúsculas)
const ESTADOS_ABIERTOS: string[] = ['pendiente', 'en proceso', 'pausada', 'abierto'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoyLima = (dias = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
};

/** Fecha de ingreso de la OT (AAAA-MM-DD) */
const fechaIngreso = (o: OrdenTrabajo) => (o.fecha_ingreso || o.creado_en || o.created_at || '').slice(0, 10);
/** Fecha en que se realizó el trabajo (AAAA-MM-DD) */
const fechaTrabajo = (t: TrabajoOT) => (t.fecha_trabajo || t.fecha_creacion || '').slice(0, 10);

/** Tipo de OT según el catálogo; lo que no esté en la lista cuenta como Otros */
function tipoOT(o: OrdenTrabajo): Tipo {
  const t = String(otDetalles(o).tipo_ot || otTipo(o).split(' / ')[0] || '').trim().toLowerCase();
  return TIPOS.find(x => x.toLowerCase() === t) ?? 'Otros';
}

/** Solo la descripción de la falla: sin "[Reporte F-…]", sin viñeta y sin la categoría ("Falla Manual : ") */
function textoFalla(o: OrdenTrabajo): string {
  return String(otDetalles(o).motivo || o.observaciones || '')
    .replace(/\[Reporte[^\]]*\]/gi, '\n')
    .split(/\n|•/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => { const i = l.indexOf(' : '); return i >= 0 ? l.slice(i + 3).trim() : l; })
    .filter(Boolean)
    .join('\n');
}

/** Flota activa: estado "Activa" o vacío (misma regla que el preventivo) */
const esActiva = (p: Placa) => { const e = p.estado.trim().toLowerCase(); return e === 'activa' || e === ''; };
const minutosOT = (o: OrdenTrabajo) => Math.round(tiempoNetoOT(o).neto / 60000);
const money = (v: number) => `S/ ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Lunes de la semana de una fecha AAAA-MM-DD */
function lunesDe(f: string): string {
  const d = new Date(`${f}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}

const COL_TALLER: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Placa', ancho: 110 },
  { id: 'ot', titulo: 'OT', ancho: 120 },
  { id: 'tipo', titulo: 'Tipo', ancho: 120 },
  { id: 'estado', titulo: 'Estado', ancho: 120 },
  { id: 'ingreso', titulo: 'Ingreso', ancho: 110 },
  { id: 'rampa', titulo: 'Rampa', ancho: 130 },
  { id: 'salida', titulo: 'Salida programada', ancho: 170 },
];
/** "27-10-2026 12:00": fecha y hora de salida de la rampa, sin el formato ISO de la base */
const salidaProgramada = (e?: RampaEntrada) => {
  if (!e?.salida_programada) return '—';
  return `${fechaDMY(e.salida_programada)} ${(e.hora_salida_programada ?? '').slice(0, 5)}`.trim();
};

const COL_CAMBIOS: ColumnaTabla[] = [
  { id: 'fecha', titulo: 'Fecha', ancho: 110 },
  { id: 'placa', titulo: 'Placa', ancho: 110 },
  { id: 'tipo', titulo: 'Tipo de mantenimiento', ancho: 220 },
  { id: 'km', titulo: 'Km de cambio', ancho: 130, alinear: 'right' },
];
const COL_TECNICOS: ColumnaTabla[] = [
  { id: 'tecnico', titulo: 'Técnico', ancho: 170 },
  { id: 'trabajo', titulo: 'Último trabajo', ancho: 260 },
  { id: 'placa', titulo: 'Placa', ancho: 110 },
  { id: 'fecha', titulo: 'Fecha', ancho: 110 },
];
const COL_PLACAS: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Placa', ancho: 110 },
  { id: 'n', titulo: 'Ingresos', ancho: 110, alinear: 'right' },
  { id: 'min', titulo: 'Minutos trabajados', ancho: 150, alinear: 'right' },
];
const COL_DIA: ColumnaTabla[] = [
  { id: 'placa', titulo: 'Placa', ancho: 110 },
  { id: 'fecha', titulo: 'Fecha de ingreso', ancho: 150 },
  { id: 'n', titulo: 'Ingresos', ancho: 100, alinear: 'right' },
  { id: 'motivo', titulo: 'Motivo de cada ingreso', ancho: 460, minimo: 200 },
];

type Pestana = 'resumen' | 'ingresos';

function Tarjeta({ titulo, icono, children }: { titulo: ReactNode; icono?: ReactNode; children: ReactNode }) {
  return (
    <div className="mant-card" style={{ height: '100%' }}>
      <div className="mant-card__header">
        <div className="mant-card__title">{icono} {titulo}</div>
      </div>
      {children}
    </div>
  );
}

/** Barra con cantidad y porcentaje sobre el total */
function Barra({ etiqueta, valor, total, color }: { etiqueta: string; valor: number; total: number; color: string }) {
  const pct = total ? Math.round((valor / total) * 1000) / 10 : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
        <span>{etiqueta}</span>
        <span className="t-numeric">{valor} · {pct}%</span>
      </div>
      <div style={{ height: 8, background: 'var(--fill)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color }} />
      </div>
    </div>
  );
}

export function MantDashboardPage() {
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [desde, setDesde] = useState(() => hoyLima(29));
  const [hasta, setHasta] = useState(() => hoyLima(0));
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [placaSel, setPlacaSel] = useState<string | null>(null);

  const placasQ = usePlacas();
  const otsQ = useOrdenesTrabajoData();
  const rampasQ = useStatusRampa();
  const inspQ = useInspecciones();
  const neuQ = useInspeccionesNeumaticos();
  const fleetQ = useFleetrun();
  const trabajosQ = useTrabajosOT(desde, hasta);
  const { data: metricas = new Map<string, string>() } = useMetricas();
  const { data: umbrales = {} } = useFleetrunUmbrales();
  const vivo = useKmVivo();
  const canon = usePersonalCanonico();

  const placasTodas = placasQ.data ?? [];
  const empresaDe = useMemo(() => new Map(placasTodas.map(p => [p.placa, p.cliente.trim() || 'Sin empresa'])), [placasQ.data]);
  const listaEmpresas = useMemo(() => [...new Set(empresaDe.values())].sort((a, b) => a.localeCompare(b, 'es')), [empresaDe]);

  // Placas de la empresa elegida; null = todas
  const placasEmpresa = useMemo(
    () => (empresas.length ? new Set(placasTodas.filter(p => empresas.includes(empresaDe.get(p.placa) ?? '')).map(p => p.placa)) : null),
    [placasQ.data, empresaDe, empresas],
  );
  const enEmpresa = (placa: string | null | undefined) => placasEmpresa === null || placasEmpresa.has(String(placa ?? '').toUpperCase());

  const flota = useMemo(() => placasTodas.filter(p => esActiva(p) && enEmpresa(p.placa)), [placasQ.data, placasEmpresa]);

  // OT que ingresaron en el rango y de la empresa
  const otsRango = useMemo(
    () => (otsQ.data ?? []).filter(o => { const f = fechaIngreso(o); return !!f && f >= desde && f <= hasta && enEmpresa(o.placa); }),
    [otsQ.data, desde, hasta, placasEmpresa],
  );
  const costoRango = useMemo(() => otsRango.reduce((s, o) => s + costoOT(o), 0), [otsRango]);
  const tiposRango = useMemo(() => {
    const cuenta: Record<Tipo, number> = { Correctivo: 0, Preventivo: 0, Predictivo: 0, Proactivo: 0, Servicio: 0, Otros: 0 };
    otsRango.forEach(o => { cuenta[tipoOT(o)]++; });
    const n = otsRango.length;
    const mostrados: Tipo[] = [...TIPOS, ...(cuenta.Otros ? (['Otros'] as Tipo[]) : [])];
    return mostrados.map(t => ({
      nombre: `${t} · ${cuenta[t]} (${n ? Math.round((cuenta[t] / n) * 1000) / 10 : 0}%)`,
      valor: cuenta[t],
      color: COLOR_TIPO[t],
    }));
  }, [otsRango]);

  // Estado actual (no depende del rango)
  const enTaller = useMemo(() => (otsQ.data ?? []).filter(o => ESTADOS_ABIERTOS.includes(String(o.estado ?? '').trim().toLowerCase()) && enEmpresa(o.placa)), [otsQ.data, placasEmpresa]);
  const enRampa = useMemo(() => (rampasQ.data ?? []).filter(e => e.estado === 'Activo' && enEmpresa(e.placa)), [rampasQ.data, placasEmpresa]);

  // Unidades en taller: una fila por placa, con su OT abierta y su visita a rampa si la tiene
  const tallerRows = useMemo(() => {
    const filas = new Map<string, { placa: string; ot?: OrdenTrabajo; rampa?: RampaEntrada }>();
    enTaller.forEach(o => { const k = o.placa.toUpperCase(); if (!filas.has(k)) filas.set(k, { placa: o.placa, ot: o }); });
    enRampa.forEach(e => {
      const k = String(e.placa ?? '').toUpperCase();
      const prev = filas.get(k);
      filas.set(k, { placa: prev?.placa ?? e.placa ?? '—', ot: prev?.ot, rampa: e });
    });
    return [...filas.values()];
  }, [enTaller, enRampa]);

  // Inspecciones: misma regla que la pantalla de análisis (unidades activas y en uso, vigencia a hoy, sin filtrar por fecha)
  const inspecciones = useMemo(() => {
    const mec = new Map<string, Inspeccion>();
    (inspQ.data ?? []).forEach(i => {
      if (!i.fecha) return;
      const prev = mec.get(i.placa);
      if (!prev || (prev.fecha?.getTime() ?? 0) < i.fecha.getTime()) mec.set(i.placa, i);
    });
    const neu = new Map<string, InspeccionNeumaticos>();
    (neuQ.data ?? []).forEach(i => {
      if (!i.fecha) return;
      const prev = neu.get(i.placa);
      if (!prev || (prev.fecha?.getTime() ?? 0) < i.fecha.getTime()) neu.set(i.placa, i);
    });
    const cuenta: Record<Estado, number> = { vigente: 0, proximo: 0, vencido: 0, 'sin-registro': 0 };
    flota.filter(p => p.enUso).forEach(p => {
      cuenta[evaluarCiclo(mec.get(p.placa) ?? null, neu.get(p.placa) ?? null).estado]++;
    });
    return cuenta;
  }, [inspQ.data, neuQ.data, flota]);
  const totalInspecciones = Object.values(inspecciones).reduce((s, n) => s + n, 0);

  // Preventivo: estado actual de cada placa por su peor registro (misma regla que la pantalla de Fleetrun)
  const filasFleetrun = useMemo(() => (fleetQ.data ?? []).filter(f => enEmpresa(frPlaca(f))), [fleetQ.data, placasEmpresa]);
  const preventivo = useMemo(
    () => resumenPreventivo(filasFleetrun, placasTodas, umbrales, metricas, vivo),
    [filasFleetrun, placasQ.data, umbrales, metricas, vivo],
  );
  const cambios = useMemo(
    () => filasFleetrun
      .filter(f => { const d = frFechaIso(f); return d >= desde && d <= hasta; })
      .sort((a, b) => frFechaIso(b).localeCompare(frFechaIso(a))),
    [filasFleetrun, desde, hasta],
  );

  // Técnicos: su último trabajo registrado en el rango
  const ultimoTecnico = useMemo(() => {
    const m = new Map<string, TrabajoOT>();
    (trabajosQ.data ?? []).filter(t => t.tecnico && enEmpresa(t.placa)).forEach(t => {
      tecnicosDe(t).map(canon).forEach(nombre => {
        const prev = m.get(nombre);
        if (!prev || fechaTrabajo(t) > fechaTrabajo(prev) || (fechaTrabajo(t) === fechaTrabajo(prev) && (t.id ?? 0) > (prev.id ?? 0))) m.set(nombre, t);
      });
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, [trabajosQ.data, placasEmpresa, canon]);

  // Ingresos a taller (pestaña 2)
  const placasIngreso = useMemo(() => {
    const m = new Map<string, OrdenTrabajo[]>();
    otsRango.forEach(o => m.set(o.placa, [...(m.get(o.placa) ?? []), o]));
    return [...m.entries()].map(([placa, lista]) => ({
      placa,
      ots: [...lista].sort((a, b) => fechaIngreso(b).localeCompare(fechaIngreso(a)) || otId(b).localeCompare(otId(a))),
      min: lista.reduce((s, o) => s + minutosOT(o), 0),
    })).sort((a, b) => b.ots.length - a.ots.length || a.placa.localeCompare(b.placa));
  }, [otsRango]);
  const reingresos = placasIngreso.filter(p => p.ots.length > 1).length;
  const minutosTotal = placasIngreso.reduce((s, p) => s + p.min, 0);
  const semanas = useMemo(() => {
    const m = new Map<string, number>();
    otsRango.forEach(o => { const l = lunesDe(fechaIngreso(o)); m.set(l, (m.get(l) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([lunes, n]) => ({
      nombre: `Sem. ${fechaDMY(lunes).slice(0, 5)} · ${n}`,
      valor: n,
      color: 'var(--accent)',
    }));
  }, [otsRango]);
  const porDia = useMemo(() => {
    const m = new Map<string, { placa: string; fecha: string; ots: OrdenTrabajo[] }>();
    otsRango.forEach(o => {
      const f = fechaIngreso(o);
      const clave = `${o.placa}|${f}`;
      const prev = m.get(clave) ?? { placa: o.placa, fecha: f, ots: [] };
      prev.ots.push(o);
      m.set(clave, prev);
    });
    return [...m.values()].sort((a, b) => b.ots.length - a.ots.length || b.fecha.localeCompare(a.fecha) || a.placa.localeCompare(b.placa));
  }, [otsRango]);
  const detalle = placasIngreso.find(p => p.placa === placaSel) ?? null;
  const trabajosDe = (o: OrdenTrabajo) => trabajosDeOT(o, trabajosQ.data ?? []);

  const cargando = otsQ.isLoading || placasQ.isLoading;
  const error = otsQ.isError ? otsQ.error : placasQ.isError ? placasQ.error : null;

  return (
    <Page>
      <PageHeader eyebrow="Mantenimiento" title="Dashboard de taller" subtitle={cargando ? 'Cargando…' : `${otsRango.length} órdenes de trabajo en el rango`} />

      {/* Filtros: fecha y empresa, para todo el dashboard */}
      <div className="mant-dash-filtros">
        <label className="aud-fecha"><span>Desde</span><input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /></label>
        <label className="aud-fecha"><span>Hasta</span><input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} /></label>
        <div className="mant-dash-empresa">
          <MultiSelect label="Empresa" options={listaEmpresas} value={empresas} onChange={setEmpresas} placeholder="Todas" />
        </div>
      </div>

      <div style={{ marginBottom: 'var(--s-4)' }}>
        <SegmentedControl<Pestana>
          label="Vista del dashboard"
          value={pestana}
          onChange={setPestana}
          options={[{ value: 'resumen', label: 'Resumen' }, { value: 'ingresos', label: 'Ingresos a taller' }]}
        />
      </div>

      {cargando ? <PageLoader /> : error ? <Notice tone="error">{errorMessage(error)}</Notice> : pestana === 'resumen' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          {/* Cifras principales */}
          <div className="mant-dash-kpis">
            <div className="placas-kpi placas-kpi--blue"><span className="placas-kpi__valor t-numeric">{flota.length}</span><span className="placas-kpi__label">Flota activa (vehículos)</span></div>
            <div className="placas-kpi placas-kpi--accent"><span className="placas-kpi__valor t-numeric">{otsRango.length}</span><span className="placas-kpi__label">OT en el rango</span></div>
            <div className="placas-kpi placas-kpi--green"><span className="placas-kpi__valor t-numeric">{money(costoRango)}</span><span className="placas-kpi__label">Costo de las OT del rango</span></div>
            <div className="placas-kpi placas-kpi--amber"><span className="placas-kpi__valor t-numeric">{tallerRows.length}</span><span className="placas-kpi__label">Unidades en taller ahora</span></div>
            <div className="placas-kpi placas-kpi--blue"><span className="placas-kpi__valor t-numeric">{enRampa.length}</span><span className="placas-kpi__label">En rampa ahora</span></div>
          </div>

          <div className="mant-grid">
            <div className="mant-col-4">
              <Tarjeta titulo="Inspecciones" icono={<Truck size={15} />}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
                  <Barra etiqueta={ETIQUETA_ESTADO.vigente} valor={inspecciones.vigente} total={totalInspecciones} color="var(--green-ink)" />
                  <Barra etiqueta={ETIQUETA_ESTADO.proximo} valor={inspecciones.proximo} total={totalInspecciones} color="var(--amber-ink)" />
                  <Barra etiqueta={ETIQUETA_ESTADO.vencido} valor={inspecciones.vencido} total={totalInspecciones} color="var(--red-ink)" />
                  <Barra etiqueta={ETIQUETA_ESTADO['sin-registro']} valor={inspecciones['sin-registro']} total={totalInspecciones} color="var(--label-3)" />
                </div>
              </Tarjeta>
            </div>
            <div className="mant-col-4">
              <Tarjeta titulo="Mantenimiento preventivo" icono={<Clock size={15} />}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
                  <Barra etiqueta="Al día" valor={preventivo.vigentes} total={preventivo.total} color="var(--green-ink)" />
                  <Barra etiqueta="Próximo a vencer" valor={preventivo.porVencer} total={preventivo.total} color="var(--amber-ink)" />
                  <Barra etiqueta="Vencido" valor={preventivo.vencidos} total={preventivo.total} color="var(--red-ink)" />
                  <Barra etiqueta="Sin datos" valor={preventivo.sinDatos} total={preventivo.total} color="var(--label-3)" />
                </div>
              </Tarjeta>
            </div>
            <div className="mant-col-4">
              <Tarjeta titulo="OT por tipo" icono={<Wrench size={15} />}>
                <BarrasGrafico porciones={tiposRango} altura={200} />
              </Tarjeta>
            </div>
          </div>

          <div className="mant-grid">
            <div className="mant-col-7">
              <Tarjeta titulo="Últimos cambios de preventivo" icono={<Clock size={15} />}>
                <TablaRedimensionable id="dash-ultimos-cambios" columnas={COL_CAMBIOS} ariaLabel="Últimos cambios de preventivo" altoMax="45vh" className="tabla-sin-barras">
                  {cambios.map((f, i) => (
                    <tr key={`${frPlaca(f)}-${frFecha(f)}-${i}`}>
                      <Celda mono>{fechaDMY(frFechaIso(f))}</Celda>
                      <Celda><LicensePlate plate={frPlaca(f)} size="sm" /></Celda>
                      <Celda>{frTipo(f)}</Celda>
                      <Celda alinear="right" mono>{frKmCambio(f).toLocaleString('es-PE')}</Celda>
                    </tr>
                  ))}
                </TablaRedimensionable>
              </Tarjeta>
            </div>
            <div className="mant-col-5">
              <Tarjeta titulo="Último trabajo por técnico" icono={<CircleDollarSign size={15} />}>
                <TablaRedimensionable id="dash-tecnicos" columnas={COL_TECNICOS} ariaLabel="Último trabajo por técnico" altoMax="45vh" className="tabla-sin-barras">
                  {ultimoTecnico.map(([nombre, t]) => (
                    <tr key={nombre}>
                      <Celda>{nombre}</Celda>
                      <Celda>{oracion(t.trabajo_realizado) || '—'}</Celda>
                      <Celda><LicensePlate plate={t.placa ?? '—'} size="sm" /></Celda>
                      <Celda mono>{fechaDMY(fechaTrabajo(t))}</Celda>
                    </tr>
                  ))}
                </TablaRedimensionable>
              </Tarjeta>
            </div>
          </div>

          <div className="mant-grid">
            <div className="mant-col-12">
              <Tarjeta titulo="Unidades en taller" icono={<Wrench size={15} />}>
                <TablaRedimensionable id="dash-en-taller" columnas={COL_TALLER} ariaLabel="Unidades en taller y su rampa" altoMax="45vh" className="tabla-sin-barras">
                  {tallerRows.map(f => (
                    <tr key={f.placa}>
                      <Celda><LicensePlate plate={f.placa} size="sm" /></Celda>
                      <Celda mono>{f.ot ? otId(f.ot) : '—'}</Celda>
                      <Celda>{f.ot ? tipoOT(f.ot) : '—'}</Celda>
                      <Celda>{f.ot?.estado ?? '—'}</Celda>
                      <Celda mono>{f.ot ? fechaDMY(fechaIngreso(f.ot)) : '—'}</Celda>
                      <Celda>{f.rampa?.rampa ?? '—'}</Celda>
                      <Celda mono>{salidaProgramada(f.rampa)}</Celda>
                    </tr>
                  ))}
                </TablaRedimensionable>
              </Tarjeta>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="mant-dash-kpis">
            <div className="placas-kpi placas-kpi--accent"><span className="placas-kpi__valor t-numeric">{otsRango.length}</span><span className="placas-kpi__label">OT ingresadas en el rango</span></div>
            <div className="placas-kpi placas-kpi--blue"><span className="placas-kpi__valor t-numeric">{placasIngreso.length}</span><span className="placas-kpi__label">Placas con ingreso</span></div>
            <div className="placas-kpi placas-kpi--amber"><span className="placas-kpi__valor t-numeric">{reingresos}</span><span className="placas-kpi__label">Placas con reingreso</span></div>
            <div className="placas-kpi placas-kpi--green"><span className="placas-kpi__valor t-numeric">{minutosTotal.toLocaleString('es-PE')}</span><span className="placas-kpi__label">Minutos trabajados</span></div>
          </div>

          <div className="mant-grid">
            <div className="mant-col-5">
              <Tarjeta titulo="OT ingresadas por semana" icono={<Wrench size={15} />}>
                {semanas.length ? <BarrasGrafico porciones={semanas} altura={220} /> : <EmptyState icon={<Wrench size={22} />} title="Sin ingresos">No hay OT en el rango elegido.</EmptyState>}
              </Tarjeta>
            </div>
            <div className="mant-col-7">
              <Tarjeta titulo="Ingresos por placa" icono={<Truck size={15} />}>
                <TablaRedimensionable id="ingresos-placas" columnas={COL_PLACAS} ariaLabel="Ingresos por placa" altoMax="45vh" className="tabla-sin-barras">
                  {placasIngreso.map(p => (
                    <tr key={p.placa} onClick={() => setPlacaSel(p.placa)} style={{ cursor: 'pointer' }}>
                      <Celda><LicensePlate plate={p.placa} size="sm" /></Celda>
                      <Celda alinear="right" mono>
                        {p.ots.length}
                        {p.ots.length > 1 && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--red-ink)' }}>reingreso</span>}
                      </Celda>
                      <Celda alinear="right" mono>{p.min.toLocaleString('es-PE')}</Celda>
                    </tr>
                  ))}
                </TablaRedimensionable>
              </Tarjeta>
            </div>
          </div>

          {detalle ? (
            <Tarjeta titulo={<>Detalle de <LicensePlate plate={detalle.placa} size="sm" /> · {detalle.ots.length} ingresos · {detalle.min.toLocaleString('es-PE')} min</>} icono={<Clock size={15} />}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
                {detalle.ots.map(o => (
                  <div key={otId(o)} style={{ padding: 'var(--s-3)', borderRadius: 12, background: 'var(--fill-2)' }}>
                    <div style={{ display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap', alignItems: 'baseline', fontSize: '0.8125rem' }}>
                      <b style={{ fontFamily: 'var(--font-mono)' }}>{otId(o)}</b>
                      <span>{fechaDMY(fechaIngreso(o))}</span>
                      <span style={{ color: 'var(--label-2)' }}>{tipoOT(o)}</span>
                      <span style={{ color: 'var(--label-2)' }}>{o.estado}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>{minutosOT(o).toLocaleString('es-PE')} min</span>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: 'pre-line', fontSize: '0.8125rem', color: textoFalla(o) ? 'var(--label)' : 'var(--label-3)' }}>
                      Motivo: {oracion(textoFalla(o)) || 'Sin falla reportada en esta OT'}
                    </div>
                    <div style={{ marginTop: 6, fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                      Técnicos: {tecnicosDeOT(o).map(canon).join(', ') || '—'}
                    </div>
                    {trabajosDe(o).length > 0 && (
                      <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: '0.8125rem' }}>
                        {trabajosDe(o).map(t => (
                          <li key={t.id_ot}>
                            {oracion(t.trabajo_realizado) || 'Sin descripción'} · {tecnicosDe(t).map(canon).join(', ') || 'sin técnico'} · {fechaDMY(fechaTrabajo(t))}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </Tarjeta>
          ) : (
            <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)' }}>Selecciona una placa en la tabla para ver el detalle de sus ingresos.</div>
          )}

          <Tarjeta titulo="Ingresos por placa y fecha" icono={<Wrench size={15} />}>
            <TablaRedimensionable id="ingresos-dia" columnas={COL_DIA} ariaLabel="Ingresos por placa y fecha" altoMax="50vh" className="tabla-sin-barras">
              {porDia.map(g => (
                <tr key={`${g.placa}|${g.fecha}`} onClick={() => setPlacaSel(g.placa)} style={{ cursor: 'pointer' }}>
                  <Celda><LicensePlate plate={g.placa} size="sm" /></Celda>
                  <Celda mono>{fechaDMY(g.fecha)}</Celda>
                  <Celda alinear="right" mono>{g.ots.length}</Celda>
                  <Celda>
                    <span style={{ whiteSpace: 'pre-line' }}>
                      {g.ots.map(o => `${tipoOT(o)}: ${oracion(textoFalla(o)) || 'sin falla reportada'}`).join('\n')}
                    </span>
                  </Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          </Tarjeta>
        </div>
      )}
    </Page>
  );
}

/** Técnicos de un trabajo: el campo tecnico viene separado por comas */
function tecnicosDe(t: TrabajoOT): string[] {
  return String(t.tecnico ?? '').split(',').map(n => n.trim()).filter(Boolean);
}
