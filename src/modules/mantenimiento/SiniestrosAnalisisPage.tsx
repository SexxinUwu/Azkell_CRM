import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ClipboardList, Table2, TriangleAlert, BarChart3 } from 'lucide-react';
import '../../core/ui/acciones-iconos.css';
import './incidencias.css';
import './siniestros.css';
import { Button, PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { TextInput } from '../../core/ui/Field';
import { DonaGrafico, useColores } from '../../core/ui/Graficos';
import { AccionesCabecera } from '../../core/ui/AccionesCabecera';
import { errorMessage } from '../../core/api/client';
import { formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { hoyIso, inicioAnioIso, nombreMes, useResumenSiniestros } from './siniestrosApi';

// Mantenimiento › Otros › Análisis de siniestros: los mismos gráficos del tablero del Excel de control (costo por tipo,
// ranking por conductor) más la evolución por mes, repuestos contra mano de obra, unidades, técnicos y estados.
// Cada gráfico tiene su tabla («Ver tabla») y al pasar el cursor muestra el detalle.

const soles = (n: number) => formatSoles(n);
const horas = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('es-PE')} h`;
const recortar = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

interface FilaBarra { nombre: string; valor: number; detalle: string }

function Burbuja({ active, payload, etiqueta }: { active?: boolean; payload?: Array<{ payload: FilaBarra }>; etiqueta: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  const f = payload[0].payload;
  return (
    <div className="sin-burbuja">
      <strong>{f.nombre}</strong>
      <span>{etiqueta(f.valor)}</span>
      <span className="sin-burbuja__sub">{f.detalle}</span>
    </div>
  );
}

/** Barras horizontales ordenadas de mayor a menor, con la cifra al final de cada una */
function BarrasHorizontales({ filas, etiqueta, color = 'var(--accent)' }: { filas: FilaBarra[]; etiqueta: (n: number) => string; color?: string }) {
  const [relleno, texto, secundario, fondo] = useColores([color, 'var(--label-1)', 'var(--label-2)', 'var(--fill-2)']);
  return (
    <div style={{ width: '100%', height: Math.max(90, filas.length * 38 + 8) }} role="img" aria-label="Gráfico de barras; la tabla con los mismos datos está en «Ver tabla»">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filas} layout="vertical" margin={{ top: 0, right: 84, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="nombre" width={178} tickLine={false} axisLine={false} interval={0} tickFormatter={(v: string) => recortar(v, 27)} tick={{ fill: secundario, fontSize: 12, fontWeight: 600 }} />
          <Tooltip cursor={{ fill: fondo }} content={<Burbuja etiqueta={etiqueta} />} />
          <Bar dataKey="valor" fill={relleno} radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={false}>
            <LabelList dataKey="valor" position="right" formatter={(v: unknown) => etiqueta(Number(v))} fill={texto} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface FilaMes { mes: string; repuestos: number; mano_obra: number; costo: number; cantidad: number; horas: number }

function BurbujaMes({ active, payload }: { active?: boolean; payload?: Array<{ payload: FilaMes }> }) {
  if (!active || !payload?.length) return null;
  const f = payload[0].payload;
  return (
    <div className="sin-burbuja">
      <strong>{f.mes}</strong>
      <span>{soles(f.costo)} · {f.cantidad} {f.cantidad === 1 ? 'siniestro' : 'siniestros'}</span>
      <span className="sin-burbuja__sub">Repuestos {soles(f.repuestos)} · Mano de obra {soles(f.mano_obra)} · {horas(f.horas)} en taller</span>
    </div>
  );
}

/** Columnas por mes: repuestos y mano de obra apilados, con el total encima de cada mes */
function ColumnasMes({ datos }: { datos: FilaMes[] }) {
  const [repuestos, manoObra, texto, secundario, linea, fondo] = useColores(['var(--accent)', 'var(--blue)', 'var(--label-1)', 'var(--label-2)', 'var(--separator)', 'var(--fill-2)']);
  return (
    <div style={{ width: '100%', height: 300 }} role="img" aria-label="Gráfico de columnas por mes; la tabla con los mismos datos está en «Ver tabla»">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 26, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={linea} />
          <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: secundario, fontSize: 12, fontWeight: 600 }} />
          <YAxis hide />
          <Tooltip cursor={{ fill: fondo }} content={<BurbujaMes />} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
          <Bar dataKey="repuestos" name="Repuestos" stackId="costo" fill={repuestos} barSize={44} isAnimationActive={false} />
          <Bar dataKey="mano_obra" name="Mano de obra" stackId="costo" fill={manoObra} radius={[6, 6, 0, 0]} barSize={44} isAnimationActive={false}>
            <LabelList dataKey="costo" position="top" formatter={(v: unknown) => soles(Number(v))} fill={texto} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tarjeta de un gráfico con el botón para ver sus datos en tabla */
function Tarjeta({ titulo, ayuda, tabla, children, ancha }: { titulo: string; ayuda?: string; tabla: { columnas: string[]; filas: Array<Array<string | number>> }; children: ReactNode; ancha?: boolean }) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <section className={`inc-tarjeta${ancha ? ' sin-ancha' : ''}`}>
      <div className="inc-tarjeta__cabecera">
        <div>
          <h3>{titulo}</h3>
          {ayuda && <p className="inc-tarjeta__ayuda">{ayuda}</p>}
        </div>
        <Button variant="plain" size="sm" icon={verTabla ? <BarChart3 size={15} /> : <Table2 size={15} />} onClick={() => { haptic('selection'); setVerTabla(v => !v); }}>
          {verTabla ? 'Ver gráfico' : 'Ver tabla'}
        </Button>
      </div>
      {verTabla ? (
        <div className="inc-tabla-mini sin-tabla">
          <table>
            <thead><tr>{tabla.columnas.map(c => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{tabla.filas.map((f, i) => <tr key={i}>{f.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : children}
    </section>
  );
}

export function SiniestrosAnalisisPage() {
  const navigate = useNavigate();
  const [desde, setDesde] = useState(inicioAnioIso);
  const [hasta, setHasta] = useState(hoyIso);
  const q = useResumenSiniestros({ desde, hasta });
  const r = q.data;

  const t = r?.totales;
  const costoPromedio = t && t.siniestros ? t.costo_total / t.siniestros : 0;
  const pctRepuestos = t && t.costo_total ? Math.round((t.repuestos / t.costo_total) * 100) : 0;

  // Lecturas rápidas, escritas con los números del periodo
  const lecturas = useMemo(() => {
    if (!r || !r.totales.siniestros) return [];
    const out: string[] = [];
    const tipo = r.por_tipo[0];
    if (tipo && r.totales.costo_total) out.push(`«${tipo.nombre}» concentra el ${Math.round((tipo.costo / r.totales.costo_total) * 100)}% del costo (${soles(tipo.costo)} en ${tipo.cantidad} ${tipo.cantidad === 1 ? 'caso' : 'casos'}).`);
    const cond = r.por_conductor[0];
    if (cond && cond.nombre !== 'Sin conductor') out.push(`${cond.nombre} es quien más costo acumula: ${soles(cond.costo)} en ${cond.cantidad} ${cond.cantidad === 1 ? 'evento' : 'eventos'}.`);
    const reincidentes = r.por_placa.filter(p => p.cantidad >= 2);
    if (reincidentes.length) out.push(`${reincidentes.length === 1 ? 'La unidad' : 'Las unidades'} ${reincidentes.map(p => `${p.nombre} (${p.cantidad})`).join(', ')} ${reincidentes.length === 1 ? 'se repite' : 'se repiten'} en el periodo.`);
    out.push(`Los repuestos pesan el ${pctRepuestos}% del costo y la mano de obra el ${100 - pctRepuestos}%.`);
    const sinConcluir = r.por_estado.filter(e => e.nombre !== 'Concluido').reduce((s, e) => s + e.cantidad, 0);
    if (sinConcluir) out.push(`${sinConcluir} ${sinConcluir === 1 ? 'siniestro sigue' : 'siniestros siguen'} sin concluir.`);
    return out;
  }, [r, pctRepuestos]);

  const esAnio = desde === inicioAnioIso() && hasta === hoyIso();

  return (
    <Page>
      <PageHeader eyebrow="Mantenimiento" title="Análisis de siniestros"
        subtitle={q.isLoading ? 'Cargando…' : `${t?.siniestros ?? 0} siniestros · ${t?.unidades ?? 0} unidades`}
        actions={<AccionesCabecera etiqueta="Acciones del análisis" acciones={[{ label: 'Ver el registro de siniestros', icon: <ClipboardList size={18} />, tono: 'azul', onClick: () => navigate('/mantenimiento/siniestros') }]} />} />

      <div className="sin-periodo">
        <span className="sin-fechas">
          <TextInput type="date" aria-label="Desde" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} />
          <span className="t-footnote c-secondary" aria-hidden>→</span>
          <TextInput type="date" aria-label="Hasta" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} />
        </span>
        {!esAnio && <button type="button" className="inc-quitar" onClick={() => { setDesde(inicioAnioIso()); setHasta(hoyIso()); }}>Este año</button>}
        {(desde || hasta) && <button type="button" className="inc-quitar" onClick={() => { setDesde(''); setHasta(''); }}>Todo el historial</button>}
      </div>

      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : !r || !t || !t.siniestros ? (
        <EmptyState icon={<TriangleAlert size={22} />} title="Sin siniestros en este periodo">
          Cambia las fechas o <button type="button" className="inc-quitar" onClick={() => navigate('/mantenimiento/siniestros')}>registra o importa siniestros</button>.
        </EmptyState>
      ) : (
        <div className="inc-graficas">
          <div className="sin-kpis">
            <div className="inc-kpi inc-kpi--accent"><span className="inc-kpi__valor t-numeric">{t.siniestros}</span><span className="inc-kpi__etiqueta">Total siniestros / daños</span></div>
            <div className="inc-kpi inc-kpi--amber"><span className="inc-kpi__valor t-numeric">{soles(t.costo_total)}</span><span className="inc-kpi__etiqueta">Costo total acumulado</span></div>
            <div className="inc-kpi inc-kpi--ink"><span className="inc-kpi__valor t-numeric">{soles(t.repuestos)}</span><span className="inc-kpi__etiqueta">Gasto en repuestos</span></div>
            <div className="inc-kpi inc-kpi--blue"><span className="inc-kpi__valor t-numeric">{soles(t.mano_obra)}</span><span className="inc-kpi__etiqueta">Gasto en mano de obra</span></div>
            <div className="inc-kpi inc-kpi--red"><span className="inc-kpi__valor t-numeric">{horas(t.horas)}</span><span className="inc-kpi__etiqueta">Horas de taller perdidas</span></div>
            <div className="inc-kpi inc-kpi--green"><span className="inc-kpi__valor t-numeric">{soles(costoPromedio)}</span><span className="inc-kpi__etiqueta">Costo promedio por siniestro</span></div>
          </div>

          {lecturas.length > 0 && (
            <section className="inc-tarjeta">
              <div className="inc-tarjeta__cabecera"><h3>Lectura rápida</h3></div>
              <ul className="inc-diagnostico">{lecturas.map(l => <li key={l}>{l}</li>)}</ul>
            </section>
          )}

          <div className="sin-grilla">
            <Tarjeta titulo="Costo por tipo de incidencia" ayuda="Dónde se va el dinero, de mayor a menor"
              tabla={{ columnas: ['Tipo de incidencia', 'Casos', 'Costo', 'Horas'], filas: r.por_tipo.map(f => [f.nombre, f.cantidad, soles(f.costo), horas(f.horas)]) }}>
              <BarrasHorizontales etiqueta={soles} filas={r.por_tipo.map(f => ({ nombre: f.nombre, valor: f.costo, detalle: `${f.cantidad} ${f.cantidad === 1 ? 'caso' : 'casos'} · ${horas(f.horas)} en taller` }))} />
            </Tarjeta>

            <Tarjeta titulo="Ranking de costo por conductor" ayuda="Quién acumula más gasto por sus eventos"
              tabla={{ columnas: ['Conductor', 'Eventos', 'Costo'], filas: r.por_conductor.map(f => [f.nombre, f.cantidad, soles(f.costo)]) }}>
              <BarrasHorizontales etiqueta={soles} color="var(--blue)" filas={r.por_conductor.map(f => ({ nombre: f.nombre, valor: f.costo, detalle: `${f.cantidad} ${f.cantidad === 1 ? 'evento' : 'eventos'}` }))} />
            </Tarjeta>

            <Tarjeta ancha titulo="Costo por mes" ayuda="Repuestos y mano de obra de cada mes"
              tabla={{ columnas: ['Mes', 'Siniestros', 'Repuestos', 'Mano de obra', 'Total', 'Horas'], filas: r.por_mes.map(f => [nombreMes(f.mes), f.cantidad, soles(f.repuestos), soles(f.mano_obra), soles(f.costo), horas(f.horas)]) }}>
              <ColumnasMes datos={r.por_mes.map(f => ({ ...f, mes: nombreMes(f.mes) }))} />
            </Tarjeta>

            <Tarjeta titulo="Repuestos y mano de obra" ayuda="De qué está hecho el costo"
              tabla={{ columnas: ['Concepto', 'Monto', '%'], filas: [['Repuestos', soles(t.repuestos), `${pctRepuestos}%`], ['Mano de obra', soles(t.mano_obra), `${100 - pctRepuestos}%`]] }}>
              <DonaGrafico altura={170} centro={soles(t.costo_total)} formato={soles}
                porciones={[{ nombre: 'Repuestos', valor: t.repuestos, color: 'var(--accent)' }, { nombre: 'Mano de obra', valor: t.mano_obra, color: 'var(--blue)' }]} />
            </Tarjeta>

            <Tarjeta titulo="Estado de los trabajos" ayuda="Cuántos siniestros están concluidos"
              tabla={{ columnas: ['Estado', 'Siniestros', 'Costo'], filas: r.por_estado.map(f => [f.nombre, f.cantidad, soles(f.costo)]) }}>
              <DonaGrafico altura={170} centro={String(t.siniestros)}
                porciones={r.por_estado.map(f => ({ nombre: f.nombre, valor: f.cantidad, color: f.nombre === 'Concluido' ? 'var(--green)' : f.nombre === 'En Reparación' ? 'var(--amber)' : 'var(--red)' }))} />
            </Tarjeta>

            <Tarjeta titulo="Unidades con más costo" ayuda="Las 10 unidades que más gasto generan"
              tabla={{ columnas: ['Placa', 'Marca', 'Siniestros', 'Costo', 'Horas'], filas: r.por_placa.map(f => [f.nombre, f.marca || '—', f.cantidad, soles(f.costo), horas(f.horas)]) }}>
              <BarrasHorizontales etiqueta={soles} color="var(--amber)" filas={r.por_placa.map(f => ({ nombre: f.marca ? `${f.nombre} · ${f.marca}` : f.nombre, valor: f.costo, detalle: `${f.cantidad} ${f.cantidad === 1 ? 'siniestro' : 'siniestros'} · ${horas(f.horas)} en taller` }))} />
            </Tarjeta>

            <Tarjeta titulo="Horas de taller por técnico" ayuda="Cuánto tiempo de trabajo recibió cada técnico"
              tabla={{ columnas: ['Técnico', 'Siniestros', 'Horas', 'Costo'], filas: r.por_tecnico.map(f => [f.nombre, f.cantidad, horas(f.horas), soles(f.costo)]) }}>
              <BarrasHorizontales etiqueta={horas} color="var(--green)" filas={r.por_tecnico.map(f => ({ nombre: f.nombre, valor: f.horas, detalle: `${f.cantidad} ${f.cantidad === 1 ? 'siniestro' : 'siniestros'} · ${soles(f.costo)}` }))} />
            </Tarjeta>
          </div>
        </div>
      )}
    </Page>
  );
}
