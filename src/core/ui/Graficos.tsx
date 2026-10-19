import { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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

function useColores(colores: string[]): string[] {
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
export function DonaGrafico({ porciones, centro, altura = 180 }: {
  porciones: Porcion[]; centro?: string; altura?: number;
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
              {datos.map(d => <Cell key={d.nombre} fill={d.fill} />)}
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
            <li key={d.nombre} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '0.8125rem' }}>
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
export function HorasEficienciaGrafico({ tecnicos }: { tecnicos: Array<{ nombre: string; reales: number; eficiencia: number }> }) {
  const [color, texto, secundario, fondo] = useColores(['var(--blue)', 'var(--label-1)', 'var(--label-2)', 'var(--fill-2)']);
  const datos = tecnicos.map(t => ({ nombre: t.nombre, reales: t.reales, etiqueta: `${t.reales.toFixed(1)} h · ${t.eficiencia.toFixed(1)} %` }));
  const alto = Math.max(120, datos.length * 40);
  return (
    <div style={{ width: '100%', height: alto }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 120, bottom: 0, left: 0 }}>
          <XAxis type="number" hide allowDecimals />
          <YAxis type="category" dataKey="nombre" width={130} tickLine={false} axisLine={false}
            tick={{ fill: secundario, fontSize: 12, fontWeight: 600 }} />
          <Tooltip formatter={(v) => `${v} h`} cursor={{ fill: fondo }} />
          <Bar dataKey="reales" name="Horas reales" fill={color} radius={6} isAnimationActive={false} barSize={14}>
            <LabelList dataKey="etiqueta" position="right" fill={texto} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontales (una por categoría) con su valor al final. Para estados y conteos. */
export function BarrasGrafico({ porciones, altura }: { porciones: Porcion[]; altura?: number }) {
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
            {datos.map(d => <Cell key={d.nombre} fill={d.fill} />)}
            <LabelList dataKey="valor" position="right" fill={texto} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
