import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useColores } from './Graficos';

export interface PuntoTendencia { mes: string; entradas: number; salidas: number }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiqueta = (mes: string) => { const [y, m] = mes.split('-'); return `${MESES[Number(m) - 1] ?? m} ${y.slice(2)}`; };
const soles = (v: unknown) => 'S/ ' + Number(v ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Entradas (compras) contra salidas (consumo) por mes, en soles. Los colores vienen de los tokens del tema.
export function TendenciaGrafico({ datos, altura = 240 }: { datos: PuntoTendencia[]; altura?: number }) {
  const [entrada, salida, texto, secundario, grilla, fondo] = useColores(['var(--green)', 'var(--accent)', 'var(--label-1)', 'var(--label-2)', 'var(--separator)', 'var(--fill-2)']);
  const filas = datos.map(d => ({ ...d, etiqueta: etiqueta(d.mes) }));
  return (
    <div>
      <div style={{ width: '100%', height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={grilla} strokeDasharray="3 4" />
            <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fill: secundario, fontSize: 12, fontWeight: 600 }} />
            <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={v => (Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : `${v}`)}
              tick={{ fill: secundario, fontSize: 11 }} />
            <Tooltip formatter={(v, nombre) => [soles(v), nombre === 'entradas' ? 'Compras' : 'Consumo']} cursor={{ fill: fondo }}
              contentStyle={{ borderRadius: 10, border: `1px solid ${grilla}` }} labelStyle={{ color: texto, fontWeight: 700 }} />
            <Bar dataKey="entradas" fill={entrada} radius={[4, 4, 0, 0]} isAnimationActive={false} barSize={12} />
            <Bar dataKey="salidas" fill={salida} radius={[4, 4, 0, 0]} isAnimationActive={false} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', gap: 'var(--s-4)', justifyContent: 'center', fontSize: '0.8125rem', color: secundario, fontWeight: 600, marginTop: 'var(--s-2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: entrada }} />Compras (entradas)</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: salida }} />Consumo (salidas)</span>
      </div>
    </div>
  );
}
