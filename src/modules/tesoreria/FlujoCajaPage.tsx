import '../mantenimiento/mant.css';
import './flujo.css';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { exportarExcel } from '../../core/lib/excel';
import { haptic } from '../../core/lib/haptics';
import { formatSoles } from '../../core/lib/format';
import { useBancos, useMovimientos, type MovimientoTesoreria } from './api';
import { esDolar, hoyLima, num } from './mov-utilidades';
import { FlujoGraficoMensual, type PuntoFlujo } from './flujo-GraficoMensual';

// Flujo de caja (Tesorería). Usa solo movimientos reales (el clásico traía cifras escritas a mano).
// - Saldo disponible = saldo inicial de las cuentas bancarias en soles + movimientos PROCESADO o PAGADO en soles.
// - Ingresos y egresos del mes = todos los movimientos del mes en soles, sin anulados (incluye pendientes y aprobados).
// - Liquidez proyectada = saldo disponible + neto de lo que aún no está procesado en el mes.
// Los movimientos en dólares no se suman; se avisa cuántos hay en el mes.

const REALIZADOS = ['PROCESADO', 'PAGADO'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const mesDe = (fecha?: string | null) => String(fecha ?? '').slice(0, 7);
const etiqueta = (mes: string) => { const [y, m] = mes.split('-'); return `${MESES[Number(m) - 1] ?? m} ${y.slice(2)}`; };
const mesLargo = (mes: string) => { const [y, m] = mes.split('-'); return `${MESES_LARGOS[Number(m) - 1] ?? m} de ${y}`; };
const signo = (m: MovimientoTesoreria) => (m.tipo_movimiento === 'INGRESO' ? 1 : -1);
const realizado = (m: MovimientoTesoreria) => REALIZADOS.includes(m.estado);

// Los n meses que terminan en `base` ('AAAA-MM'), en orden cronológico
function ultimosMeses(base: string, n: number): string[] {
  const [y, m] = base.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

type Agrupar = 'centro' | 'cuenta';
interface Grupo { nombre: string; movs: number; ing: number; egr: number; neto: number }

const COLUMNAS: ColumnaTabla[] = [
  { id: 'grupo', titulo: 'Grupo', ancho: 300 },
  { id: 'movs', titulo: 'Movimientos', ancho: 130, alinear: 'right' },
  { id: 'ing', titulo: 'Ingresos (S/)', ancho: 160, alinear: 'right' },
  { id: 'egr', titulo: 'Egresos (S/)', ancho: 160, alinear: 'right' },
  { id: 'neto', titulo: 'Neto (S/)', ancho: 160, alinear: 'right' },
];

function Kpi({ etiquetaTexto, valor, nota, tono }: { etiquetaTexto: string; valor: string; nota: string; tono?: 'ingreso' | 'egreso' | 'negativo' }) {
  return (
    <div className="flujo-kpi">
      <span className="flujo-kpi__etiqueta">{etiquetaTexto}</span>
      <span className={`flujo-kpi__num${tono ? ` flujo-kpi__num--${tono}` : ''}`}>{valor}</span>
      <span className="flujo-kpi__nota">{nota}</span>
    </div>
  );
}

export function FlujoCajaPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const mesActual = mesDe(hoyLima());
  const [agrupar, setAgrupar] = useState<Agrupar>('centro');
  const [busqueda, setBusqueda] = useState('');
  // Todo el historial: el saldo disponible es acumulado. Las fechas futuras entran como proyección.
  const mov = useMovimientos({ desde: '2000-01-01', hasta: '2100-12-31' });
  const bancos = useBancos();

  const calc = useMemo(() => {
    const todos: MovimientoTesoreria[] = mov.data ?? [];
    const enSoles = todos.filter(m => !esDolar(m.moneda) && m.estado !== 'ANULADO');
    const saldoInicial = (bancos.data ?? [])
      .filter(b => !esDolar(b.moneda) && b.estado !== 'INACTIVO')
      .reduce((s, b) => s + num(b.saldo_inicial), 0);
    const realizadoTotal = enSoles.filter(realizado).reduce((s, m) => s + signo(m) * num(m.monto), 0);

    // Línea de saldo: arranca con el saldo realizado antes de la ventana y suma el neto de cada mes
    const meses = ultimosMeses(mesActual, 12);
    const inicioVentana = meses[0];
    const previo = enSoles
      .filter(m => realizado(m) && mesDe(m.fecha) < inicioVentana)
      .reduce((s, m) => s + signo(m) * num(m.monto), 0);

    const porMes = new Map<string, { ing: number; egr: number }>();
    for (const m of enSoles) {
      const k = mesDe(m.fecha);
      const v = porMes.get(k) ?? { ing: 0, egr: 0 };
      if (m.tipo_movimiento === 'INGRESO') v.ing += num(m.monto); else v.egr += num(m.monto);
      porMes.set(k, v);
    }
    let acumulado = saldoInicial + previo;
    const serie: PuntoFlujo[] = meses.map(k => {
      const v = porMes.get(k) ?? { ing: 0, egr: 0 };
      acumulado += v.ing - v.egr;
      return { mes: k, etiqueta: etiqueta(k), ingresos: v.ing, egresos: v.egr, acumulado };
    });

    const v = porMes.get(mesActual) ?? { ing: 0, egr: 0 };
    const delMes = enSoles.filter(m => mesDe(m.fecha) === mesActual);
    const pendienteNeto = delMes.filter(m => !realizado(m)).reduce((s, m) => s + signo(m) * num(m.monto), 0);
    const saldoDisponible = saldoInicial + realizadoTotal;
    return {
      saldoDisponible,
      liquidez: saldoDisponible + pendienteNeto,
      ingresos: v.ing,
      egresos: v.egr,
      serie,
      delMes,
      dolaresDelMes: todos.filter(m => esDolar(m.moneda) && m.estado !== 'ANULADO' && mesDe(m.fecha) === mesActual).length,
    };
  }, [mov.data, bancos.data, mesActual]);

  const gruposTodos = useMemo<Grupo[]>(() => {
    const mapa = new Map<string, { movs: number; ing: number; egr: number }>();
    for (const m of calc.delMes) {
      const k = agrupar === 'centro'
        ? (m.centro_costo_nombre || m.centro_costo || 'Sin centro de costos')
        : (m.banco_cuenta || 'Sin cuenta bancaria');
      const g = mapa.get(k) ?? { movs: 0, ing: 0, egr: 0 };
      g.movs += 1;
      if (m.tipo_movimiento === 'INGRESO') g.ing += num(m.monto); else g.egr += num(m.monto);
      mapa.set(k, g);
    }
    return [...mapa.entries()]
      .map(([nombre, g]) => ({ nombre, ...g, neto: g.ing - g.egr }))
      .sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto));
  }, [calc.delMes, agrupar]);

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? gruposTodos.filter(g => g.nombre.toLowerCase().includes(q)) : gruposTodos;
  }, [gruposTodos, busqueda]);

  const totales = useMemo(() => grupos.reduce(
    (t, g) => ({ movs: t.movs + g.movs, ing: t.ing + g.ing, egr: t.egr + g.egr, neto: t.neto + g.neto }),
    { movs: 0, ing: 0, egr: 0, neto: 0 },
  ), [grupos]);

  const neto = calc.ingresos - calc.egresos;
  const cargando = mov.isLoading || bancos.isLoading;

  function actualizar() {
    haptic('selection');
    qc.invalidateQueries({ queryKey: ['tesoreria'] });
  }

  async function exportar() {
    try {
      await exportarExcel(`Flujo-de-caja-${agrupar === 'centro' ? 'centros' : 'cuentas'}`, 'Flujo del mes',
        ['Grupo', 'Movimientos', 'Ingresos (S/)', 'Egresos (S/)', 'Neto (S/)'],
        grupos.map(g => [g.nombre, g.movs, g.ing, g.egr, g.neto]));
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Page wide>
      <PageHeader
        eyebrow="Tesorería"
        title="Flujo de caja"
        subtitle={`Movimientos reales en soles · ${mesLargo(mesActual)}`}
        actions={
          <MenuOtros opciones={[
            { label: 'Actualizar', detalle: 'Vuelve a leer los movimientos', icon: <RefreshCw size={17} />, onSelect: actualizar },
            { label: 'Exportar Excel', detalle: `${grupos.length} grupos del mes`, icon: <FileSpreadsheet size={17} />, onSelect: exportar, disabled: grupos.length === 0 },
          ]} />
        }
      />

      {cargando ? <PageLoader /> : mov.isError ? <Notice tone="error">{errorMessage(mov.error)}</Notice> : (
        <div className="flujo-cuerpo">
          <div className="flujo-kpis">
            <Kpi etiquetaTexto="Saldo disponible" valor={formatSoles(calc.saldoDisponible)}
              nota="Saldos iniciales de bancos más movimientos procesados o pagados." />
            <Kpi etiquetaTexto="Ingresos del mes" tono="ingreso" valor={formatSoles(calc.ingresos)}
              nota="Incluye pendientes y aprobados; sin anulados." />
            <Kpi etiquetaTexto="Egresos del mes" tono="egreso" valor={formatSoles(calc.egresos)}
              nota="Incluye pendientes y aprobados; sin anulados." />
            <Kpi etiquetaTexto="Liquidez proyectada" tono={calc.liquidez < 0 ? 'negativo' : undefined} valor={formatSoles(calc.liquidez)}
              nota={`Saldo disponible más lo pendiente del mes (neto ${formatSoles(neto)}).`} />
          </div>

          {calc.dolaresDelMes > 0 && (
            <Notice>Hay {calc.dolaresDelMes} movimiento(s) en dólares este mes. No se suman en estas cifras.</Notice>
          )}

          <section className="flujo-tarjeta">
            <div className="flujo-tarjeta__cabecera">
              <h2 className="flujo-tarjeta__titulo">Ingresos y egresos por mes (últimos 12 meses)</h2>
            </div>
            <FlujoGraficoMensual datos={calc.serie} />
            <p className="flujo-nota">
              La línea parte del saldo realizado antes de la ventana y suma el neto de cada mes (incluye pendientes).
            </p>
          </section>

          <section className="flujo-tarjeta">
            <div className="flujo-tarjeta__cabecera">
              <h2 className="flujo-tarjeta__titulo">Movimientos del mes por grupo</h2>
              <div className="flujo-tarjeta__controles">
                <SegmentedControl<Agrupar>
                  label="Agrupar por"
                  value={agrupar}
                  onChange={setAgrupar}
                  options={[{ value: 'centro', label: 'Centro de costos' }, { value: 'cuenta', label: 'Cuenta bancaria' }]}
                />
              </div>
            </div>
            <SearchField value={busqueda} onChange={setBusqueda} placeholder={agrupar === 'centro' ? 'Buscar centro de costos…' : 'Buscar cuenta bancaria…'} />

            {gruposTodos.length === 0 ? (
              <EmptyState icon={<CalendarDays size={22} />} title="Sin movimientos este mes">No hay movimientos registrados en el mes en curso.</EmptyState>
            ) : grupos.length === 0 ? (
              <EmptyState icon={<CalendarDays size={22} />} title="Sin coincidencias">Ningún grupo coincide con la búsqueda.</EmptyState>
            ) : (
              <>
                <TablaRedimensionable id="flujo-caja-grupos" columnas={COLUMNAS} ariaLabel="Movimientos del mes por grupo" altoMax="60vh">
                  {grupos.map(g => (
                    <tr key={g.nombre}>
                      <Celda>{g.nombre}</Celda>
                      <Celda alinear="right" mono>{g.movs}</Celda>
                      <Celda alinear="right" mono>{formatSoles(g.ing)}</Celda>
                      <Celda alinear="right" mono>{formatSoles(g.egr)}</Celda>
                      <Celda alinear="right" mono className={g.neto < 0 ? 'flujo-neg' : undefined}>{formatSoles(g.neto)}</Celda>
                    </tr>
                  ))}
                  <tr className="flujo-total">
                    <Celda>Total del mes{busqueda ? ' (filtrado)' : ''}</Celda>
                    <Celda alinear="right" mono>{totales.movs}</Celda>
                    <Celda alinear="right" mono>{formatSoles(totales.ing)}</Celda>
                    <Celda alinear="right" mono>{formatSoles(totales.egr)}</Celda>
                    <Celda alinear="right" mono className={totales.neto < 0 ? 'flujo-neg' : undefined}>{formatSoles(totales.neto)}</Celda>
                  </tr>
                </TablaRedimensionable>
              </>
            )}
          </section>
        </div>
      )}
    </Page>
  );
}
