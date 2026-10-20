import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SelectInput } from '../../core/ui/Field';
import { useColores } from '../../core/ui/Graficos';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import { useBancos, useMovimientos, type MovimientoTesoreria } from './api';

// Flujo de caja (Tesorería). La versión clásica traía cifras escritas a mano, así que esta pantalla usa los movimientos reales:
// - Saldo disponible = saldo inicial de bancos en soles + movimientos procesados o pagados (soles).
// - Ingresos y egresos proyectados del mes = todos los movimientos del mes sin anulados (incluye pendientes).
// Los movimientos en dólares no se suman; se avisa cuántos hay en el mes.

const REALIZADOS = ['PROCESADO', 'PAGADO'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const num = (v: unknown) => Number(v) || 0;
const esDolar = (m?: string | null) => /DOL|USD|US\$/i.test(m ?? '');
const soles = (v: number) => 'S/ ' + v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const mesDe = (fecha?: string | null) => String(fecha ?? '').slice(0, 7);
const etiqueta = (mes: string) => { const [y, m] = mes.split('-'); return `${MESES[Number(m) - 1] ?? m} ${y.slice(2)}`; };

// Los n meses que terminan en `base` ('AAAA-MM'), en orden cronológico
function ultimosMeses(base: string, n: number): string[] {
  const [y, m] = base.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

const tarjeta = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 14, padding: 'var(--s-4)', minWidth: 0 } as const;
const titulo = { margin: '0 0 var(--s-3)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--label)' } as const;
const nota = { margin: 'var(--s-2) 0 0', fontSize: '0.75rem', color: 'var(--label-2)' } as const;

const COLUMNAS: ColumnaTabla[] = [
  { id: 'grupo', titulo: 'Grupo', ancho: 300 },
  { id: 'movs', titulo: 'Movimientos', ancho: 130, alinear: 'right' },
  { id: 'ing', titulo: 'Ingresos (S/)', ancho: 160, alinear: 'right' },
  { id: 'egr', titulo: 'Egresos (S/)', ancho: 160, alinear: 'right' },
  { id: 'neto', titulo: 'Neto (S/)', ancho: 160, alinear: 'right' },
];

export function FlujoCajaPage() {
  const mesActual = mesDe(hoyLima());
  const [agrupar, setAgrupar] = useState<'centro' | 'cuenta'>('centro');
  // Todo el historial: el saldo disponible es acumulado. Las fechas futuras entran como proyección.
  const mov = useMovimientos({ desde: '2000-01-01', hasta: '2100-12-31' });
  const bancos = useBancos();
  const [verde, rojo, acento, secundario, grilla] = useColores(['var(--green)', 'var(--red)', 'var(--accent)', 'var(--label-2)', 'var(--separator)']);

  const calc = useMemo(() => {
    const todos: MovimientoTesoreria[] = mov.data ?? [];
    const enSoles = todos.filter(m => !esDolar(m.moneda) && m.estado !== 'ANULADO');
    const signo = (m: MovimientoTesoreria) => (m.tipo_movimiento === 'INGRESO' ? 1 : -1);
    const saldoInicial = (bancos.data ?? [])
      .filter(b => !esDolar(b.moneda) && b.estado !== 'INACTIVO')
      .reduce((s, b) => s + num(b.saldo_inicial), 0);
    const realizado = enSoles.filter(m => REALIZADOS.includes(m.estado)).reduce((s, m) => s + signo(m) * num(m.monto), 0);

    const porMes = new Map<string, { ing: number; egr: number }>();
    for (const m of enSoles) {
      const k = mesDe(m.fecha);
      const v = porMes.get(k) ?? { ing: 0, egr: 0 };
      if (m.tipo_movimiento === 'INGRESO') v.ing += num(m.monto); else v.egr += num(m.monto);
      porMes.set(k, v);
    }
    let acumulado = 0;
    const serie = ultimosMeses(mesActual, 12).map(k => {
      const v = porMes.get(k) ?? { ing: 0, egr: 0 };
      acumulado += v.ing - v.egr;
      return { mes: k, etiqueta: etiqueta(k), ingresos: v.ing, egresos: v.egr, acumulado };
    });
    const v = porMes.get(mesActual) ?? { ing: 0, egr: 0 };
    return {
      saldoDisponible: saldoInicial + realizado,
      ingresos: v.ing,
      egresos: v.egr,
      serie,
      delMes: enSoles.filter(m => mesDe(m.fecha) === mesActual),
      dolaresDelMes: todos.filter(m => esDolar(m.moneda) && m.estado !== 'ANULADO' && mesDe(m.fecha) === mesActual).length,
    };
  }, [mov.data, bancos.data, mesActual]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, { movs: number; ing: number; egr: number }>();
    for (const m of calc.delMes) {
      const k = agrupar === 'centro'
        ? (m.centro_costo_nombre || m.centro_costo || 'Sin centro de costos')
        : (m.banco_cuenta || 'Caja (sin cuenta bancaria)');
      const g = mapa.get(k) ?? { movs: 0, ing: 0, egr: 0 };
      g.movs += 1;
      if (m.tipo_movimiento === 'INGRESO') g.ing += num(m.monto); else g.egr += num(m.monto);
      mapa.set(k, g);
    }
    return [...mapa.entries()]
      .map(([nombre, g]) => ({ nombre, ...g, neto: g.ing - g.egr }))
      .sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto));
  }, [calc.delMes, agrupar]);

  const neto = calc.ingresos - calc.egresos;
  const cargando = mov.isLoading || bancos.isLoading;

  return (
    <Page>
      <PageHeader eyebrow="Tesorería" title="Flujo de caja" subtitle={`Movimientos reales en soles · mes de ${etiqueta(mesActual)}`} />
      {cargando ? <PageLoader /> : mov.isError ? <Notice tone="error">{errorMessage(mov.error)}</Notice> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--s-3)' }}>
            <div style={tarjeta}>
              <p style={titulo}>Saldo disponible</p>
              <strong style={{ fontSize: '1.4rem' }}>{soles(calc.saldoDisponible)}</strong>
              <p style={nota}>Saldos iniciales de bancos más movimientos procesados o pagados.</p>
            </div>
            <div style={tarjeta}>
              <p style={titulo}>Ingresos proyectados del mes</p>
              <strong style={{ fontSize: '1.4rem', color: 'var(--green-ink)' }}>{soles(calc.ingresos)}</strong>
              <p style={nota}>Incluye pendientes y aprobados; sin anulados.</p>
            </div>
            <div style={tarjeta}>
              <p style={titulo}>Egresos proyectados del mes</p>
              <strong style={{ fontSize: '1.4rem', color: 'var(--red-ink)' }}>{soles(calc.egresos)}</strong>
              <p style={nota}>Incluye pendientes y aprobados; sin anulados.</p>
            </div>
            <div style={tarjeta}>
              <p style={titulo}>Saldo neto del mes</p>
              <strong style={{ fontSize: '1.4rem', color: neto >= 0 ? 'var(--green-ink)' : 'var(--red-ink)' }}>{soles(neto)}</strong>
              <p style={nota}>Ingresos menos egresos del mes.</p>
            </div>
          </div>

          {calc.dolaresDelMes > 0 && (
            <Notice>Hay {calc.dolaresDelMes} movimiento(s) en dólares este mes. No se suman en estas cifras.</Notice>
          )}

          <div style={tarjeta}>
            <p style={titulo}>Ingresos y egresos por mes (últimos 12 meses)</p>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={calc.serie}>
                  <CartesianGrid stroke={grilla} vertical={false} />
                  <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fill: secundario, fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={72}
                    tickFormatter={v => (Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : `${v}`)} tick={{ fill: secundario, fontSize: 11 }} />
                  <Tooltip formatter={(v, nombre) => [soles(Number(v)), String(nombre)]} />
                  <Legend />
                  <Bar dataKey="ingresos" name="Ingresos" fill={verde} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="egresos" name="Egresos" fill={rojo} radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="acumulado" name="Saldo acumulado del periodo" stroke={acento} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p style={nota}>La línea suma el neto de cada mes desde el inicio de la ventana de 12 meses.</p>
          </div>

          <div style={tarjeta}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap', marginBottom: 'var(--s-3)' }}>
              <p style={{ ...titulo, margin: 0 }}>Movimientos del mes por grupo</p>
              <SelectInput value={agrupar} onChange={e => setAgrupar(e.target.value as 'centro' | 'cuenta')} aria-label="Agrupar por" style={{ width: 'auto' }}>
                <option value="centro">Por centro de costos</option>
                <option value="cuenta">Por cuenta bancaria</option>
              </SelectInput>
            </div>
            {grupos.length === 0 ? (
              <EmptyState icon={<CalendarDays size={22} />} title="Sin movimientos este mes">No hay movimientos registrados en el mes en curso.</EmptyState>
            ) : (
              <TablaRedimensionable id="flujo-caja-grupos" columnas={COLUMNAS} ariaLabel="Movimientos del mes por grupo">
                {grupos.map(g => (
                  <tr key={g.nombre}>
                    <Celda>{g.nombre}</Celda>
                    <Celda alinear="right" mono>{g.movs}</Celda>
                    <Celda alinear="right" mono>{soles(g.ing)}</Celda>
                    <Celda alinear="right" mono>{soles(g.egr)}</Celda>
                    <Celda alinear="right" mono>{soles(g.neto)}</Celda>
                  </tr>
                ))}
              </TablaRedimensionable>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}
