import { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, LabelList, Legend, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface Porcion { nombre: string; valor: number; color: string }

// Recharts pinta con atributos SVG, que no leen var(--x): se resuelven los tokens a su valor.
// Se vuelven a leer al cambiar el tema (data-theme o clase en <html>).
function resolver(colores: string[]): string[] {
  const css = getComputedStyle(document.documentElement);
  return colores.map(c => {
    if (!c.startsWith('var(')) return c;
    const nombre = c.slice(4, -1).trim();
    return css.getPropertyValue(nombre).trim() || '#888888';
  });
}

export function useColores(colores: string[]): string[] {
  const clave = colores.join('|');
  const [valores, setValores] = useState(() => resolver(colores));
  useEffect(() => {
    setValores(resolver(colores));
    const obs = new MutationObserver(() => setValores(resolver(colores)));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => obs.disconnect();
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  return valores;
}

/**
 * Dona con leyenda propia (nombre, cantidad y porcentaje). El centro muestra el total o el texto que se pase.
 * Los colores se pasan como tokens CSS, p. ej. 'var(--green-ink)'.
 */
export function DonaGrafico({ porciones, centro, altura = 180, onElegir }: {
  porciones: Porcion[]; centro?: string; altura?: number; onElegir?: (nombre: string) => void;
}) {
  const colores = useColores(porciones.map(p => p.color));
  const total = porciones.reduce((s, p) => s + p.valor, 0);
  const datos = porciones.map((p, i) => ({ ...p, fill: colores[i] }));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: altura, height: altura, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={datos} dataKey="valor" nameKey="nombre" innerRadius="66%" outerRadius="100%"
              paddingAngle={total > 0 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {datos.map(d => <Cell key={d.nombre} fill={d.fill} style={onElegir ? { cursor: 'pointer' } : undefined} onClick={onElegir ? () => onElegir(d.nombre) : undefined} />)}
            </Pie>
            <Tooltip formatter={(v) => `${v}`} />
          </PieChart>
        </ResponsiveContainer>
        {centro !== undefined && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.05rem', pointerEvents: 'none' }}>
            {centro}
          </div>
        )}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
        {datos.map(d => {
          const pct = total > 0 ? Math.round((d.valor / total) * 100) : 0;
          return (
            <li key={d.nombre} onClick={onElegir ? () => onElegir(d.nombre) : undefined} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '0.8125rem', cursor: onElegir ? 'pointer' : undefined }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: d.fill, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, color: 'var(--label-2)', fontWeight: 600 }}>{d.nombre}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{d.valor}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--label-2)', width: 40, textAlign: 'right' }}>{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Horas reales por técnico (barras) con la eficiencia escrita al final de cada una. */
export function HorasEficienciaGrafico({ tecnicos, proyectadas }: {
  tecnicos: Array<{ nombre: string; reales: number; eficiencia: number }>; proyectadas: number;
}) {
  const [color, texto, secundario, fondo] = useColores(['var(--blue)', 'var(--label-1)', 'var(--label-2)', 'var(--fill-2)']);
  const datos = tecnicos.map(t => ({ nombre: t.nombre, reales: t.reales, etiqueta: `${t.reales.toFixed(1)} h · ${t.eficiencia.toFixed(1)} %` }));
  // La escala llega hasta la proyección o hasta el técnico con más horas, lo que sea mayor
  const maximo = Math.max(proyectadas, ...datos.map(d => d.reales), 1);
  const alto = Math.max(160, datos.length * 52 + 36);
  return (
    <div style={{ width: '100%', height: alto }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ top: 24, right: 130, bottom: 0, left: 0 }}>
          <XAxis type="number" hide domain={[0, maximo]} />
          <YAxis type="category" dataKey="nombre" width={230} tickLine={false} axisLine={false} interval={0}
            tick={{ fill: secundario, fontSize: 12, fontWeight: 600 }} />
          <ReferenceLine x={proyectadas} stroke={secundario} strokeDasharray="5 4"
            label={{ value: `Proyectado ${proyectadas} h`, position: 'top', fill: secundario, fontSize: 11 }} />
          <Tooltip formatter={(v) => `${v} h`} cursor={{ fill: fondo }} />
          <Bar dataKey="reales" name="Horas reales" fill={color} radius={6} isAnimationActive={false} barSize={18}>
            <LabelList dataKey="etiqueta" position="right" fill={texto} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface SerieAgrupada { clave: string; nombre: string; color: string; valores: number[] }

/** Barras agrupadas: una categoría por grupo (p. ej. subtipo) y una barra por serie (p. ej. estado). Cifras encima de cada barra. */
export function BarrasAgrupadasGrafico({ categorias, series, altura = 300 }: { categorias: string[]; series: SerieAgrupada[]; altura?: number }) {
  const colores = useColores(series.map(s => s.color));
  const [texto, secundario, fondo] = useColores(['var(--label-1)', 'var(--label-2)', 'var(--fill-2)']);
  const datos = categorias.map((c, i) => Object.fromEntries([['categoria', c], ...series.map(s => [s.clave, s.valores[i] ?? 0])]));
  return (
    <div style={{ width: '100%', height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="categoria" tickLine={false} axisLine={false} interval={0} tick={{ fill: secundario, fontSize: 12, fontWeight: 600 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fill: secundario, fontSize: 11 }} />
          <Tooltip cursor={{ fill: fondo }} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
          {series.map((s, i) => (
            <Bar key={s.clave} dataKey={s.clave} name={s.nombre} fill={colores[i]} radius={[5, 5, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey={s.clave} position="top" fill={texto} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11 }} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontales (una por categoría) con su valor al final. Para estados y conteos. */
export function BarrasGrafico({ porciones, altura, onElegir }: { porciones: Porcion[]; altura?: number; onElegir?: (nombre: string) => void }) {
  const colores = useColores(porciones.map(p => p.color));
  const [texto, secundario, fondo] = useColores(['var(--label-1)', 'var(--label-2)', 'var(--fill-2)']);
  const datos = porciones.map((p, i) => ({ ...p, fill: colores[i] }));
  const alto = altura ?? Math.max(120, datos.length * 34);
  return (
    <div style={{ width: '100%', height: alto }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="nombre" width={130} tickLine={false} axisLine={false}
            tick={{ fill: secundario, fontSize: 12, fontWeight: 600 }} />
          <Tooltip formatter={(v) => `${v}`} cursor={{ fill: fondo }} />
          <Bar dataKey="valor" radius={6} isAnimationActive={false} barSize={14}>
            {datos.map(d => <Cell key={d.nombre} fill={d.fill} style={onElegir ? { cursor: 'pointer' } : undefined} onClick={onElegir ? () => onElegir(d.nombre) : undefined} />)}
            <LabelList dataKey="valor" position="right" fill={texto} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
