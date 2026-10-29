import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Printer, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge, EmptyState, Notice } from '../../core/ui/Display';
import { PageLoader } from '../../core/ui/Button';
import { SelectInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { BarrasGrafico, DonaGrafico, useColores, type Porcion } from '../../core/ui/Graficos';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { api, errorMessage } from '../../core/api/client';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { useAnaliticaIncidencias, type AnaliticaIncidencias, type IncidenciaRuta, type ListaIncidencias } from './api';

// Pestaña "Gráficas" de Incidencias en ruta. Misma lógica que el clásico (incidencias-ruta/logica.js):
// KPIs del año, diagnóstico generado con los datos, distribución por área, tendencia mensual,
// desglose con semáforo, top placas y top fallas. Al tocar un gráfico se abre el detalle filtrado.

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = [ANIO_ACTUAL, ANIO_ACTUAL - 1, ANIO_ACTUAL - 2];
const COLORES_AREA = ['var(--accent)', 'var(--green)', 'var(--amber)', 'var(--blue)', 'var(--red)'];
const META = 'Reducir el índice de paradas no programadas mediante protocolos de inspección pre-viaje y mantenimiento preventivo continuo.';
const HALLAZGO = 'Se evidencia una distribución controlada, con mayor frecuencia en el pico estacional de rescates viales.';

interface Detalle { titulo: string; campo: 'placa' | 'area' | 'falla'; valor: string }

/** Igual que el servidor al agrupar fallas: falla o motivo, sin espacios, cortada a 30 caracteres */
function claveFalla(i: IncidenciaRuta): string {
  const f = String(i.falla || i.motivo || 'Otros').trim();
  return f.length > 30 ? `${f.substring(0, 30)}...` : f;
}

const pct = (parte: number, todo: number, vacio = '0.0') => (todo > 0 ? ((parte / todo) * 100).toFixed(1) : vacio);

const COLUMNAS_DETALLE: ColumnaTabla[] = [
  { id: 'fecha', titulo: 'Fecha', ancho: 110 },
  { id: 'placa', titulo: 'Placa', ancho: 120 },
  { id: 'conductor', titulo: 'Conductor', ancho: 170 },
  { id: 'ubicacion', titulo: 'Ubicación', ancho: 180 },
  { id: 'motivo', titulo: 'Motivo / falla', ancho: 240 },
  { id: 'area', titulo: 'Área', ancho: 130 },
  { id: 'costo', titulo: 'Costo total', ancho: 120, alinear: 'right' },
  { id: 'estado', titulo: 'Estado', ancho: 120, alinear: 'center' },
];

export function IncidenciasGraficas() {
  const [anio, setAnio] = useState(ANIO_ACTUAL);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const analitica = useAnaliticaIncidencias(anio);

  function abrirDetalle(d: Detalle) {
    haptic('selection');
    setDetalle(d);
  }

  // El CSS de impresión deja visible solo .inc-imprimible: el PDF sale de la vista de gráficas
  function imprimir() {
    haptic('selection');
    window.print();
  }

  return (
    <div className="inc-graficas">
      <div className="inc-graficas__barra">
        <div>
          <span className="inc-eyebrow">Tablero de control</span>
          <h2 className="inc-graficas__titulo">Indicadores clave y analítica</h2>
        </div>
        <div className="inc-graficas__acciones">
          <SelectInput aria-label="Año del tablero" className="inc-graficas__anio" value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
          </SelectInput>
          <div className="acciones-iconos">
            <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--rojo"
              data-tip="Exportar PDF" aria-label="Exportar PDF" onClick={imprimir}>
              <Printer size={18} />
            </button>
            <button type="button" className="btn btn--secondary btn--icon acciones-iconos__boton acciones-iconos__boton--azul"
              data-tip="Recargar" aria-label="Recargar" onClick={() => { haptic('selection'); analitica.refetch(); }}>
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="inc-imprimible">
        <p className="inc-solo-impresion">ERP Azkell Fleet · Incidencias en ruta · {anio}</p>
        {analitica.isLoading ? <PageLoader /> : analitica.isError ? (
          <Notice tone="error">{errorMessage(analitica.error)}</Notice>
        ) : analitica.data ? (
          <Tablero a={analitica.data} anio={anio} alDetallar={abrirDetalle} />
        ) : null}
      </div>

      <DetalleIncidencias detalle={detalle} anio={anio} onCerrar={() => setDetalle(null)} />
    </div>
  );
}

function Tablero({ a, anio, alDetallar }: { a: AnaliticaIncidencias; anio: number; alDetallar: (d: Detalle) => void }) {
  const r = a.resumen;
  const total = r.total;
  const area = a.areaMap;
  const cntMec = area['Mantenimiento'] || area['Falla Mecánica'] || 0;
  const respMap = Object.fromEntries(a.topResponsables.map(x => [x.nombre, x.count]));
  const cntGar = respMap['Garantía'] || area['Garantía'] || 0;
  const cntCond = respMap['Conductor'] || area['Conductor'] || area['Flota'] || 0;
  const sinTransbordo = Math.max(0, total - r.totalTransbordos);

  const kpis = [
    { tono: 'accent', valor: String(total), etiqueta: 'Total incidencias', detalle: '100 % de los casos registrados' },
    { tono: 'red', valor: `${pct(cntMec, total, '0.0')}%`, etiqueta: 'Fallas mecánicas', detalle: `${cntMec} eventos técnicos` },
    { tono: 'green', valor: `${pct(cntGar, total, '0.0')}%`, etiqueta: 'Por garantía', detalle: `${cntGar} casos cubiertos` },
    { tono: 'amber', valor: `${pct(cntCond, total, '0.0')}%`, etiqueta: 'Resp. conductor', detalle: `${cntCond} maniobras` },
    { tono: 'blue', valor: `${pct(r.totalAtendidos, total, '100.0')}%`, etiqueta: 'Tasa de resolución', detalle: `${r.totalAtendidos} atendidos / ${r.totalPendientes} pend.` },
    { tono: 'ink', valor: `${pct(sinTransbordo, total, '100.0')}%`, etiqueta: 'Sin transbordo', detalle: 'Continuidad de servicio' },
  ];

  return (
    <>
      <div className="inc-kpi-grilla">
        {kpis.map(k => (
          <div key={k.etiqueta} className={`inc-kpi inc-kpi--${k.tono}`}>
            <span className="inc-kpi__valor t-numeric">{k.valor}</span>
            <span className="inc-kpi__etiqueta">{k.etiqueta}</span>
            <span className="inc-kpi__detalle">{k.detalle}</span>
          </div>
        ))}
      </div>

      <div className="inc-bloques inc-bloques--dos-tercios">
        <section className="inc-tarjeta">
          <header className="inc-tarjeta__cabecera">
            <h3>Diagnóstico ejecutivo</h3>
          </header>
          <Diagnostico a={a} />
          <p className="inc-meta"><strong>Meta estratégica:</strong> {META}</p>
        </section>

        <section className="inc-tarjeta">
          <header className="inc-tarjeta__cabecera">
            <div>
              <h3>Distribución por responsabilidad</h3>
              <p className="inc-tarjeta__ayuda">Toca un segmento para ver sus incidencias</p>
            </div>
          </header>
          {Object.keys(area).length ? (
            <DonaGrafico
              altura={180}
              centro={String(total)}
              porciones={Object.entries(area).map(([nombre, valor], i): Porcion => ({ nombre, valor, color: COLORES_AREA[i % COLORES_AREA.length] }))}
              onElegir={nombre => alDetallar({ titulo: `Área: ${nombre}`, campo: 'area', valor: nombre })}
            />
          ) : <p className="inc-vacio">Sin datos para este año.</p>}
        </section>
      </div>

      <div className="inc-bloques inc-bloques--dos-tercios">
        <section className="inc-tarjeta">
          <header className="inc-tarjeta__cabecera">
            <div>
              <span className="inc-eyebrow">Comportamiento temporal</span>
              <h3>Evolución y tendencia mensual</h3>
            </div>
          </header>
          <MensualGrafico etiquetas={a.mensual.labels} valores={a.mensual.incidencias} />
        </section>

        <section className="inc-tarjeta">
          <DesgloseMensual etiquetas={a.mensual.labels} valores={a.mensual.incidencias} />
        </section>
      </div>

      <div className="inc-bloques">
        <section className="inc-tarjeta">
          <header className="inc-tarjeta__cabecera">
            <div>
              <h3>Top placas con más fallas</h3>
              <p className="inc-tarjeta__ayuda">Toca una barra para ver las fallas de la unidad</p>
            </div>
          </header>
          {a.topPlacas.length ? (
            <BarrasGrafico
              porciones={a.topPlacas.map((p): Porcion => ({ nombre: `${p.placa} (${p.tipo})`, valor: p.count, color: 'var(--red)' }))}
              onElegir={nombre => {
                const p = a.topPlacas.find(x => `${x.placa} (${x.tipo})` === nombre);
                if (p) alDetallar({ titulo: `Placa: ${p.placa}`, campo: 'placa', valor: p.placa });
              }}
            />
          ) : <p className="inc-vacio">Sin fallas registradas.</p>}
        </section>

        <section className="inc-tarjeta">
          <header className="inc-tarjeta__cabecera">
            <div>
              <h3>Top fallas y motivos frecuentes</h3>
              <p className="inc-tarjeta__ayuda">Causas con mayor recurrencia técnica · año {anio}</p>
            </div>
          </header>
          {a.topFallas.length ? (
            <BarrasGrafico
              porciones={a.topFallas.map((f): Porcion => ({ nombre: f.falla, valor: f.count, color: 'var(--amber)' }))}
              onElegir={nombre => alDetallar({ titulo: `Falla: ${nombre}`, campo: 'falla', valor: nombre })}
            />
          ) : <p className="inc-vacio">Sin fallas registradas.</p>}
        </section>
      </div>
    </>
  );
}

function Diagnostico({ a }: { a: AnaliticaIncidencias }) {
  const total = a.resumen.total;
  if (total === 0) {
    return <p className="inc-vacio">No se registran incidencias para el año seleccionado.</p>;
  }
  const area = a.areaMap;
  const cntMec = area['Mantenimiento'] || area['Falla Mecánica'] || 0;
  const topFalla = a.topFallas[0];
  const topPlaca = a.topPlacas[0];
  const pico = a.mensual.incidencias.reduce((mejor, v, i) => (v > mejor.valor ? { valor: v, indice: i } : mejor), { valor: -1, indice: 0 });
  const mesPico = a.mensual.labels[pico.indice] ?? '';
  const sinTransbordo = Math.max(0, total - a.resumen.totalTransbordos);

  return (
    <ul className="inc-diagnostico">
      <li>
        <strong>Concentración técnica:</strong> el <strong>{pct(cntMec, total)}%</strong> de los eventos son fallas mecánicas en ruta,
        sobre todo <u>{topFalla?.falla ?? 'desgaste en ruta'}</u> con {topFalla?.count ?? 0} ocurrencias.
      </li>
      <li>
        <strong>Pico estacional:</strong> el mes de mayor exigencia fue <strong>{mesPico}</strong> con <strong>{pico.valor} incidencias</strong>,
        en rutas de alta demanda y condiciones climáticas severas.
      </li>
      <li>
        <strong>Unidad con mayor atención:</strong> la placa <strong>{topPlaca?.placa ?? 'ninguna'}</strong> suma {topPlaca?.count ?? 0} auxilios;
        conviene auditar sus componentes críticos.
      </li>
      <li>
        <strong>Impacto operativo acotado:</strong> el <strong>{pct(sinTransbordo, total, '100')}%</strong> de los traslados siguió sin transbordo
        gracias al auxilio mecánico rápido en ruta.
      </li>
    </ul>
  );
}

function MensualGrafico({ etiquetas, valores }: { etiquetas: string[]; valores: number[] }) {
  const [azul, rojo, texto, grilla, secundario] = useColores(['var(--accent)', 'var(--red)', 'var(--label-1)', 'var(--separator)', 'var(--label-2)']);
  const maximo = Math.max(...valores, 1);
  const datos = etiquetas.map((mes, i) => ({ mes, cantidad: valores[i] ?? 0 }));
  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={grilla} strokeDasharray="3 4" />
          <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: secundario, fontSize: 12, fontWeight: 600 }} />
          <YAxis allowDecimals={false} width={36} tickLine={false} axisLine={false} domain={[0, maximo + 4]} tick={{ fill: secundario, fontSize: 11 }} />
          <Tooltip formatter={v => `${v} incidencias en ruta`} contentStyle={{ borderRadius: 10, border: `1px solid ${grilla}` }} />
          <Bar dataKey="cantidad" name="Incidencias" barSize={22} radius={[6, 6, 0, 0]} isAnimationActive={false}>
            {datos.map(d => <Cell key={d.mes} fill={d.cantidad === maximo && d.cantidad > 0 ? rojo : azul} />)}
            <LabelList dataKey="cantidad" position="top" formatter={(v: unknown) => (Number(v) > 0 ? String(v) : '')}
              style={{ fill: texto, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }} />
          </Bar>
          <Line dataKey="cantidad" name="Tendencia" type="monotone" stroke={texto} strokeWidth={2} dot={{ r: 3 }} tooltipType="none" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function DesgloseMensual({ etiquetas, valores }: { etiquetas: string[]; valores: number[] }) {
  const maximo = Math.max(...valores, 1);
  const total = valores.reduce((s, v) => s + v, 0);
  const mesActual = new Date().getMonth();
  // Se muestran los meses con datos y los transcurridos del año (como el clásico)
  const filas = valores
    .map((cnt, i) => ({ cnt, mes: etiquetas[i] ?? '', i }))
    .filter(f => f.cnt > 0 || f.i <= mesActual);

  const estado = (cnt: number): { texto: string; tono: 'red' | 'amber' | 'green' | 'gray' } => {
    if (cnt === maximo && cnt > 0) return { texto: 'Pico máx', tono: 'red' };
    if (cnt >= maximo * 0.75 && cnt > 0) return { texto: 'Alto', tono: 'amber' };
    if (cnt <= maximo * 0.35 && cnt > 0) return { texto: 'Normal', tono: 'green' };
    return { texto: 'Estable', tono: 'gray' };
  };

  return (
    <>
      <header className="inc-tarjeta__cabecera">
        <h3>Desglose estadístico mensual</h3>
        <span className="inc-tarjeta__ayuda">{filas.length} meses evaluados</span>
      </header>
      <div className="inc-tabla-mini">
        <table>
          <thead>
            <tr><th>Mes</th><th className="t-numeric">Fallas</th><th className="t-numeric">% total</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const e = estado(f.cnt);
              return (
                <tr key={f.i}>
                  <td>{f.mes}</td>
                  <td className="t-numeric">{f.cnt}</td>
                  <td className="t-numeric">{total > 0 ? ((f.cnt / total) * 100).toFixed(1) : '0.0'}%</td>
                  <td><Badge tone={e.tono}>{e.texto}</Badge></td>
                </tr>
              );
            })}
            <tr className="inc-tabla-mini__total">
              <td>Total</td>
              <td className="t-numeric">{total}</td>
              <td className="t-numeric">100.0%</td>
              <td>{filas.length} meses</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="inc-hallazgo"><strong>Hallazgo crítico:</strong> {HALLAZGO}</p>
    </>
  );
}

function DetalleIncidencias({ detalle, anio, onCerrar }: { detalle: Detalle | null; anio: number; onCerrar: () => void }) {
  const lista = useQuery<IncidenciaRuta[]>({
    queryKey: ['mant', 'incidencias', 'detalle', anio, detalle?.campo, detalle?.valor],
    enabled: !!detalle,
    queryFn: async () => {
      if (!detalle) return [];
      // El servidor filtra por placa y por área; las fallas se agrupan en el cliente con la misma clave del gráfico
      const r = await api<ListaIncidencias>('/mantenimiento/incidencias-ruta', {
        query: {
          anio,
          limit: 5000,
          page: 1,
          placa: detalle.campo === 'placa' ? detalle.valor : undefined,
          area: detalle.campo === 'area' ? detalle.valor : undefined,
        },
      });
      const filas = r.data ?? [];
      return detalle.campo === 'falla' ? filas.filter(i => claveFalla(i) === detalle.valor) : filas;
    },
  });

  const filas = lista.data ?? [];

  return (
    <Sheet
      open={!!detalle}
      onClose={onCerrar}
      title={detalle?.titulo ?? 'Detalle'}
      ancho
      footer={<span className="inc-detalle__total">{lista.data ? `Total: ${filas.length} incidencias encontradas` : ''}</span>}
    >
      {lista.isLoading ? <PageLoader /> : lista.isError ? (
        <Notice tone="error">{errorMessage(lista.error)}</Notice>
      ) : filas.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={22} />} title="Sin registros">No se encontraron incidencias para este filtro.</EmptyState>
      ) : (
        <TablaRedimensionable id="incidencias-detalle" ariaLabel="Incidencias del filtro" altoMax="60vh" columnas={COLUMNAS_DETALLE}>
          {filas.map(inc => (
            <tr key={inc.id}>
              <Celda mono>{formatFechaPe(inc.fecha_falla)}</Celda>
              <Celda><LicensePlate plate={inc.placa} size="sm" /></Celda>
              <Celda>{inc.conductor || '—'}</Celda>
              <Celda>{inc.ubicacion || '—'}</Celda>
              <Celda>{inc.motivo || '—'}{inc.falla ? <span className="inc-detalle__falla"> · {inc.falla}</span> : null}</Celda>
              <Celda>{inc.area_responsable || 'Mantenimiento'}</Celda>
              <Celda mono alinear="right">{formatSoles(Number(inc.total_costo) || 0)}</Celda>
              <Celda alinear="center"><Badge tone={inc.solucionado === 'Atendido' ? 'green' : 'red'}>{inc.solucionado === 'Atendido' ? 'Atendido' : 'Pendiente'}</Badge></Celda>
            </tr>
          ))}
        </TablaRedimensionable>
      )}
    </Sheet>
  );
}
