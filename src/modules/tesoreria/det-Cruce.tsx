import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, FileSearch, Info } from 'lucide-react';
import { Badge, EmptyState, Notice } from '../../core/ui/Display';
import { PageLoader } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
import { Switch } from '../../core/ui/Switch';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { errorMessage } from '../../core/api/client';
import { formatFechaPe, formatMoneda } from '../../core/lib/format';
import { useCruceSire, type CruceSire, type FilaCruce, type NivelCruce } from './det-api';

const TONO: Record<NivelCruce, 'red' | 'amber' | 'gray' | 'green'> = { alta: 'red', media: 'amber', info: 'gray', ok: 'green' };
const ETIQUETA: Record<NivelCruce, string> = { alta: 'Diferencia', media: 'Revisar', info: 'No validable', ok: 'Coincide' };

const COLUMNAS: ColumnaTabla[] = [
  { id: 'estado', titulo: 'Resultado', ancho: 120 },
  { id: 'orden', titulo: 'Orden', ancho: 150 },
  { id: 'proveedor', titulo: 'Proveedor', ancho: 240 },
  { id: 'factura', titulo: 'Factura', ancho: 150 },
  { id: 'total', titulo: 'Total orden', ancho: 140, alinear: 'right' },
  { id: 'det', titulo: 'Detracción orden (S/)', ancho: 150, alinear: 'right' },
  { id: 'sire', titulo: 'Total SIRE', ancho: 140, alinear: 'right' },
  { id: 'sireDet', titulo: 'Detracción SIRE', ancho: 130 },
  { id: 'hallazgos', titulo: 'Qué se encontró', ancho: 520 },
];

const filaPlana = (f: FilaCruce) => {
  const o = f.orden; const s = f.sire;
  return {
    resultado: ETIQUETA[f.nivel],
    orden: o?.id ?? '',
    fecha: o?.fecha ?? s?.fecha_emision ?? '',
    proveedor: o?.proveedor ?? s?.proveedor ?? '',
    factura: o?.factura ?? (s ? `${s.serie ?? ''}-${s.numero ?? ''}` : ''),
    moneda: o?.moneda ?? (String(s?.moneda ?? '').toUpperCase() === 'USD' ? 'USD' : 'PEN'),
    totalOrden: o?.total ?? '',
    detOrden: o?.detraccion?.monto_pen ?? '',
    totalSire: s?.total ?? '',
    detSire: s?.detraccion ?? '',
    periodo: s?.periodo ?? '',
    hallazgos: f.hallazgos.map(h => h.texto).join(' · '),
  };
};

/** Excel del cruce con las filas visibles */
export async function exportarCruce(filas: FilaCruce[]) {
  const { exportarExcel } = await import('../../core/lib/excel');
  await exportarExcel('Cruce-detracciones-SIRE', 'Cruce', ['Resultado', 'Orden', 'Fecha', 'Proveedor', 'Factura', 'Moneda', 'Total de la orden', 'Detracción de la orden (S/)', 'Total del SIRE', 'Detracción del SIRE', 'Período del SIRE', 'Qué se encontró'],
    filas.map(filaPlana).map(x => [x.resultado, x.orden, x.fecha, x.proveedor, x.factura, x.moneda, x.totalOrden, x.detOrden, x.totalSire, x.detSire, x.periodo, x.hallazgos]));
}

/** Cruce de las detracciones de las órdenes con los comprobantes de compra del SIRE ya cargados */
export function DetCruce({ desde, hasta, setRango, onFilas }: { desde: string; hasta: string; setRango: (d: string, h: string) => void; onFilas: (f: FilaCruce[]) => void }) {
  const q = useCruceSire(desde, hasta);
  const [soloDif, setSoloDif] = useState(true);
  const d: CruceSire | undefined = q.data;
  const visibles = useMemo(() => (d?.datos ?? []).filter(f => !soloDif || f.nivel === 'alta' || f.nivel === 'media'), [d, soloDif]);
  useEffect(() => { onFilas(visibles); }, [visibles, onFilas]);
  const sinSire = !!d && d.periodos_sire.length === 0;

  return (
    <div className="det-cuerpo">
      <div className="det-filtros det-filtros--cruce">
        <Field label="Desde">{p => <TextInput {...p} type="date" value={desde} max={hasta || undefined} onChange={e => setRango(e.target.value, hasta)} />}</Field>
        <Field label="Hasta">{p => <TextInput {...p} type="date" value={hasta} min={desde || undefined} onChange={e => setRango(desde, e.target.value)} />}</Field>
        <div className="det-interruptor">
          <Switch checked={soloDif} onChange={setSoloDif} label="Solo diferencias" />
          <span>Solo diferencias</span>
        </div>
      </div>

      {q.isLoading ? <PageLoader /> : q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : d && (
        <>
          {sinSire ? (
            <Notice icon={<CircleAlert size={18} />}>No hay compras del SIRE cargadas. Cárgalas en Contabilidad › SIRE para poder cruzar; mientras tanto no se puede validar nada.</Notice>
          ) : (
            <p className="det-nota">SIRE de compras cargado: {d.periodos_sire.map(p => `${p.periodo.slice(4)}/${p.periodo.slice(0, 4)} (${p.filas})`).join(' · ')}.</p>
          )}
          <div className="det-resumen">
            <span><strong>{d.resumen.ordenes}</strong> órdenes con detracción o factura en el SIRE</span>
            <span><strong>{d.resumen.con_diferencias}</strong> con diferencias o por revisar</span>
            <span><strong>{d.resumen.coinciden}</strong> coinciden</span>
            <span><strong>{d.resumen.sin_validar}</strong> sin SIRE para validar</span>
          </div>

          {visibles.length === 0 ? (
            <EmptyState icon={<FileSearch size={22} />} title={soloDif ? 'Sin diferencias' : 'Sin resultados'}>
              {soloDif ? 'No se encontraron diferencias entre las órdenes y el SIRE cargado en estas fechas.' : 'No hay órdenes ni facturas en estas fechas.'}
            </EmptyState>
          ) : (
            <TablaRedimensionable id="det-cruce" columnas={COLUMNAS} ariaLabel="Cruce de detracciones con el SIRE" altoMax="60vh" fijas={2}>
              {visibles.map(f => {
                const x = filaPlana(f);
                return (
                  <tr key={f.clave}>
                    <Celda><Badge tone={TONO[f.nivel]}>{x.resultado}</Badge></Celda>
                    <Celda mono>{x.orden || 'Sin orden'}</Celda>
                    <Celda>{x.proveedor || '—'}</Celda>
                    <Celda mono>{x.factura || '—'}</Celda>
                    <Celda alinear="right" mono>{f.orden ? formatMoneda(f.orden.total, f.orden.moneda) : '—'}</Celda>
                    <Celda alinear="right" mono>{f.orden?.detraccion ? f.orden.detraccion.monto_pen.toFixed(2) : '—'}</Celda>
                    <Celda alinear="right" mono>{f.sire ? formatMoneda(f.sire.total, f.sire.moneda) : '—'}</Celda>
                    <Celda mono>{f.sire?.detraccion || '—'}</Celda>
                    <Celda className="det-hallazgos">
                      {f.hallazgos.map(h => <span key={h.codigo} className={`det-hallazgo det-hallazgo--${h.nivel}`}>{h.texto}</span>)}
                      {f.orden && <span className="det-hallazgo-fecha">Orden del {formatFechaPe(f.orden.fecha)}</span>}
                    </Celda>
                  </tr>
                );
              })}
            </TablaRedimensionable>
          )}

          <div className="det-limites">
            <h3><Info size={15} /> Lo que no se puede validar</h3>
            <ul>{d.limitaciones.map(l => <li key={l}>{l}</li>)}</ul>
          </div>
        </>
      )}
    </div>
  );
}
