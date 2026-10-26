import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useColores } from '../../core/ui/Graficos';
import { formatSoles } from '../../core/lib/format';

export interface PuntoFlujo { mes: string; etiqueta: string; ingresos: number; egresos: number; acumulado: number }

// Barras de ingresos y egresos por mes (soles) con la línea de saldo acumulado. Los colores vienen de los tokens del tema.
export function FlujoGraficoMensual({ datos }: { datos: PuntoFlujo[] }) {
  const [verde, rojo, acento, secundario, grilla] = useColores(['var(--green)', 'var(--red)', 'var(--accent)', 'var(--label-2)', 'var(--separator)']);
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={grilla} vertical={false} strokeDasharray="3 4" />
          <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fill: secundario, fontSize: 12, fontWeight: 600 }} />
          <YAxis tickLine={false} axisLine={false} width={64}
            tickFormatter={v => (Math.abs(Number(v)) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : `${v}`)}
            tick={{ fill: secundario, fontSize: 11 }} />
          <Tooltip formatter={(v, nombre) => [formatSoles(Number(v)), String(nombre)]}
            contentStyle={{ borderRadius: 10, border: `1px solid ${grilla}` }} />
          <Legend />
          <Bar dataKey="ingresos" name="Ingresos" fill={verde} radius={[4, 4, 0, 0]} barSize={14} isAnimationActive={false} />
          <Bar dataKey="egresos" name="Egresos" fill={rojo} radius={[4, 4, 0, 0]} barSize={14} isAnimationActive={false} />
          <Line type="monotone" dataKey="acumulado" name="Saldo acumulado" stroke={acento} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
