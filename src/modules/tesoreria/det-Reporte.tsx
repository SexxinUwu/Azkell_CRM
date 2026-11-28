import { useEffect, useMemo, useState } from 'react';
import { Clock, FileSpreadsheet, Landmark, ListChecks, Wallet } from 'lucide-react';
import { EmptyState, Badge, Notice } from '../../core/ui/Display';
import { PageLoader } from '../../core/ui/Button';
import { Combobox } from '../../core/ui/Combobox';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { KpiTarjeta } from '../../core/ui/KpiTarjeta';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import { formatFechaPe, formatMoneda, formatSoles, hoyLima } from '../../core/lib/format';
import { ETIQUETA_ESTADO_DET, TONO_ESTADO_DET, useReporteDetracciones, type EstadoDetraccion, type FiltroReporte, type ReporteDetracciones } from './det-api';
import { inicioHaceMeses, mesLargo } from './det-util';
import './det.css';

type Vista = 'detalle' | 'proveedor' | 'mes';

const COL_DETALLE: ColumnaTabla[] = [
  { id: 'orden', titulo: 'Orden', ancho: 150 },
  { id: 'fecha', titulo: 'Fecha', ancho: 100 },
  { id: 'proveedor', titulo: 'Proveedor', ancho: 260 },
  { id: 'factura', titulo: 'Factura', ancho: 140 },
  { id: 'tipo', titulo: 'Tipo', ancho: 90 },
  { id: 'total', titulo: 'Total de la orden', ancho: 150, alinear: 'right' },
  { id: 'det', titulo: 'Detracción (S/)', ancho: 130, alinear: 'right' },
  { id: 'estado', titulo: 'Estado', ancho: 160 },
  { id: 'constancia', titulo: 'Constancia', ancho: 120 },
  { id: 'deposito', titulo: 'Depositada', ancho: 110 },
];
const COL_PROVEEDOR: ColumnaTabla[] = [
  { id: 'proveedor', titulo: 'Proveedor', ancho: 320 },
  { id: 'ruc', titulo: 'RUC', ancho: 120 },
  { id: 'n', titulo: 'Órdenes', ancho: 90, alinear: 'right' },
  { id: 'pend', titulo: 'Por depositar (S/)', ancho: 160, alinear: 'right' },
  { id: 'dep', titulo: 'Depositada (S/)', ancho: 150, alinear: 'right' },
  { id: 'apr', titulo: 'Orden por aprobar (S/)', ancho: 180, alinear: 'right' },
  { id: 'tot', titulo: 'Total (S/)', ancho: 140, alinear: 'right' },
];
const COL_MES: ColumnaTabla[] = [
  { id: 'mes', titulo: 'Mes', ancho: 200 },
  { id: 'n', titulo: 'Órdenes', ancho: 90, alinear: 'right' },
  { id: 'pend', titulo: 'Por depositar (S/)', ancho: 160, alinear: 'right' },
  { id: 'dep', titulo: 'Depositada (S/)', ancho: 150, alinear: 'right' },
  { id: 'apr', titulo: 'Orden por aprobar (S/)', ancho: 180, alinear: 'right' },
  { id: 'tot', titulo: 'Total (S/)', ancho: 140, alinear: 'right' },
];

/** Excel con las cuatro hojas del reporte (detalle, por proveedor, por mes y resumen) */
export async function exportarReporte(r: ReporteDetracciones, f: FiltroReporte) {
  const { exportarExcelHojas } = await import('../../core/lib/excel');
  await exportarExcelHojas('Detracciones', [
    {
      hoja: 'Detalle',
      encabezados: ['Orden', 'Fecha', 'Proveedor', 'RUC', 'Factura', 'Moneda', 'Total de la orden', 'Tipo', 'Porcentaje', 'T.C.', 'Detracción (S/)', 'Detracción (moneda de la orden)', 'Neto a pagar', 'Estado', 'Constancia', 'Depositada'],
      filas: r.datos.map(d => [d.id, d.fecha, d.proveedor, d.ruc ?? '', d.factura ?? '', d.moneda, d.total_origen, `${d.codigo}${d.tipo ? ' · ' + d.tipo : ''}`, d.pct, d.tc, d.monto_pen, d.monto_origen, d.neto_origen, ETIQUETA_ESTADO_DET[d.estado], d.constancia ?? '', d.depositada_en ?? '']),
    },
    {
      hoja: 'Por proveedor',
      encabezados: ['Proveedor', 'RUC', 'Órdenes', 'Por depositar (S/)', 'Depositada (S/)', 'Orden por aprobar (S/)', 'Total (S/)'],
      filas: r.por_proveedor.map(g => [g.proveedor, g.ruc ?? '', g.n, g.pendiente_pen, g.depositada_pen, g.por_aprobar_pen, g.total_pen]),
    },
    {
      hoja: 'Por mes',
      encabezados: ['Mes', 'Órdenes', 'Por depositar (S/)', 'Depositada (S/)', 'Orden por aprobar (S/)', 'Total (S/)'],
      filas: r.por_mes.map(g => [g.mes, g.n, g.pendiente_pen, g.depositada_pen, g.por_aprobar_pen, g.total_pen]),
    },
    {
      hoja: 'Resumen',
      encabezados: ['Concepto', 'Órdenes', 'Monto (S/)'],
      filas: [
        ['Retenido por depositar (órdenes aprobadas o procesadas sin constancia)', r.resumen.pendiente.n, r.resumen.pendiente.monto_pen],
        ['Depositada (con constancia)', r.resumen.depositada.n, r.resumen.depositada.monto_pen],
        ['De órdenes por aprobar', r.resumen.por_aprobar.n, r.resumen.por_aprobar.monto_pen],
        ['Total', r.resumen.total.n, r.resumen.total.monto_pen],
        ['', '', ''],
        [`Filtros: ${f.por === 'deposito' ? 'fecha de depósito' : 'fecha de la orden'} ${f.desde || '—'} a ${f.hasta || '—'}${f.estado ? ' · ' + ETIQUETA_ESTADO_DET[f.estado] : ''}`, '', ''],
      ],
    },
  ]);
}

/** Filtro inicial: los últimos 3 meses por fecha de la orden */
export const filtroInicial = (): FiltroReporte => ({ desde: inicioHaceMeses(3), hasta: hoyLima(), proveedor: '', estado: '', por: 'orden' });

/** Reportes de detracciones: pendientes de depositar, depositadas, por proveedor y por mes */
export function DetReporte({ filtro, setFiltro, onDatos }: { filtro: FiltroReporte; setFiltro: (f: FiltroReporte) => void; onDatos: (r: ReporteDetracciones | undefined) => void }) {
  const q = useReporteDetracciones(filtro);
  const [vista, setVista] = useState<Vista>('detalle');
  const r = q.data;
  useEffect(() => { onDatos(r); }, [r, onDatos]);
  const cambiar = (parte: Partial<FiltroReporte>) => setFiltro({ ...filtro, ...parte });
  const alternar = (e: EstadoDetraccion) => cambiar({ estado: filtro.estado === e ? '' : e });
  const proveedores = useMemo(() => (r?.proveedores ?? []).filter(p => p.value), [r]);

  return (
    <div className="det-cuerpo">
      <div className="det-filtros">
        <Field label="Filtrar por fecha">{p => (
          <SelectInput {...p} value={filtro.por} onChange={e => cambiar({ por: e.target.value as FiltroReporte['por'] })}>
            <option value="orden">De la orden</option>
            <option value="deposito">Del depósito</option>
          </SelectInput>
        )}</Field>
        <Field label="Desde">{p => <TextInput {...p} type="date" value={filtro.desde} max={filtro.hasta || undefined} onChange={e => cambiar({ desde: e.target.value })} />}</Field>
        <Field label="Hasta">{p => <TextInput {...p} type="date" value={filtro.hasta} min={filtro.desde || undefined} onChange={e => cambiar({ hasta: e.target.value })} />}</Field>
        <Field label="Proveedor">{p => (
          <Combobox {...p} options={proveedores} value={filtro.proveedor || null} onChange={v => cambiar({ proveedor: v ?? '' })} placeholder="Todos los proveedores" />
        )}</Field>
      </div>

      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : r && (
        <>
          <div className="inv-kpis">
            <KpiTarjeta etiqueta="Retenido por depositar" valor={formatSoles(r.resumen.pendiente.monto_pen)} sub={`${r.resumen.pendiente.n} orden(es) aprobadas sin constancia`} icono={<Clock size={18} />} tono="warning"
              activo={filtro.estado === 'PENDIENTE'} onClick={() => alternar('PENDIENTE')} />
            <KpiTarjeta etiqueta="Depositada" valor={formatSoles(r.resumen.depositada.monto_pen)} sub={`${r.resumen.depositada.n} con constancia`} icono={<Landmark size={18} />} tono="ok"
              activo={filtro.estado === 'DEPOSITADA'} onClick={() => alternar('DEPOSITADA')} />
            <KpiTarjeta etiqueta="De órdenes por aprobar" valor={formatSoles(r.resumen.por_aprobar.monto_pen)} sub={`${r.resumen.por_aprobar.n} orden(es); aún no se debe depositar`} icono={<ListChecks size={18} />} tono="valor"
              activo={filtro.estado === 'POR_APROBAR'} onClick={() => alternar('POR_APROBAR')} />
            <KpiTarjeta etiqueta="Total en el filtro" valor={formatSoles(r.resumen.total.monto_pen)} sub={`${r.resumen.total.n} orden(es)`} icono={<Wallet size={18} />} tono="valor" />
          </div>

          <div className="det-barra">
            <SegmentedControl<Vista> label="Vista del reporte" value={vista} onChange={setVista}
              options={[{ value: 'detalle', label: 'Detalle' }, { value: 'proveedor', label: 'Por proveedor' }, { value: 'mes', label: 'Por mes' }]} />
            {filtro.estado && <Badge tone={TONO_ESTADO_DET[filtro.estado]}>{ETIQUETA_ESTADO_DET[filtro.estado]}</Badge>}
          </div>

          {r.datos.length === 0 ? (
            <EmptyState icon={<FileSpreadsheet size={22} />} title="Sin detracciones">No hay detracciones con esos filtros.</EmptyState>
          ) : vista === 'detalle' ? (
            <TablaRedimensionable id="det-detalle" columnas={COL_DETALLE} ariaLabel="Detracciones de las órdenes" altoMax="60vh" fijas={1}>
              {r.datos.map(d => (
                <tr key={d.id}>
                  <Celda mono>{d.id}</Celda>
                  <Celda>{formatFechaPe(d.fecha)}</Celda>
                  <Celda>{d.proveedor}</Celda>
                  <Celda mono>{d.factura ?? '—'}</Celda>
                  <Celda mono>{d.codigo} · {d.pct}%</Celda>
                  <Celda alinear="right" mono>{formatMoneda(d.total_origen, d.moneda)}</Celda>
                  <Celda alinear="right" mono>{formatSoles(d.monto_pen)}</Celda>
                  <Celda><Badge tone={TONO_ESTADO_DET[d.estado]}>{ETIQUETA_ESTADO_DET[d.estado]}</Badge></Celda>
                  <Celda mono>{d.constancia ?? '—'}</Celda>
                  <Celda>{d.depositada_en ? formatFechaPe(d.depositada_en) : '—'}</Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          ) : vista === 'proveedor' ? (
            <TablaRedimensionable id="det-proveedor" columnas={COL_PROVEEDOR} ariaLabel="Detracciones por proveedor" altoMax="60vh" fijas={1}>
              {r.por_proveedor.map(g => (
                <tr key={g.proveedor_id ?? g.proveedor}>
                  <Celda>{g.proveedor}</Celda>
                  <Celda mono>{g.ruc ?? '—'}</Celda>
                  <Celda alinear="right" mono>{g.n}</Celda>
                  <Celda alinear="right" mono>{formatSoles(g.pendiente_pen)}</Celda>
                  <Celda alinear="right" mono>{formatSoles(g.depositada_pen)}</Celda>
                  <Celda alinear="right" mono>{formatSoles(g.por_aprobar_pen)}</Celda>
                  <Celda alinear="right" mono>{formatSoles(g.total_pen)}</Celda>
                </tr>
              ))}
              <tr className="det-total">
                <Celda>Total</Celda><Celda />
                <Celda alinear="right" mono>{r.resumen.total.n}</Celda>
                <Celda alinear="right" mono>{formatSoles(r.resumen.pendiente.monto_pen)}</Celda>
                <Celda alinear="right" mono>{formatSoles(r.resumen.depositada.monto_pen)}</Celda>
                <Celda alinear="right" mono>{formatSoles(r.resumen.por_aprobar.monto_pen)}</Celda>
                <Celda alinear="right" mono>{formatSoles(r.resumen.total.monto_pen)}</Celda>
              </tr>
            </TablaRedimensionable>
          ) : (
            <TablaRedimensionable id="det-mes" columnas={COL_MES} ariaLabel="Detracciones por mes" altoMax="60vh" fijas={1}>
              {r.por_mes.map(g => (
                <tr key={g.mes}>
                  <Celda>{mesLargo(g.mes)}</Celda>
                  <Celda alinear="right" mono>{g.n}</Celda>
                  <Celda alinear="right" mono>{formatSoles(g.pendiente_pen)}</Celda>
                  <Celda alinear="right" mono>{formatSoles(g.depositada_pen)}</Celda>
                  <Celda alinear="right" mono>{formatSoles(g.por_aprobar_pen)}</Celda>
                  <Celda alinear="right" mono>{formatSoles(g.total_pen)}</Celda>
                </tr>
              ))}
            </TablaRedimensionable>
          )}
          <p className="det-nota">
            Por depositar = órdenes aprobadas o procesadas con detracción y sin constancia de depósito. Las órdenes que aún no se aprueban se muestran aparte. Los montos están en soles, como los calcula SUNAT.
          </p>
        </>
      )}
    </div>
  );
}
