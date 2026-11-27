import { Eye, Paperclip } from 'lucide-react';
import { Badge } from '../../core/ui/Display';
import { Celda, TablaRedimensionable, type ColumnaTabla } from '../../core/ui/TablaRedimensionable';
import { formatFechaPe } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import type { CuentaPorCobrar } from './api';
import { estadoDe, isoDe, num, soles, tonoCuenta, verUrl, type CampoDocumento } from './cuentas-util';

// Vista de tabla de Cuentas por cobrar, con las mismas columnas y en el mismo orden que la del clásico.
// Dos columnas quedan fijas (acción e ID) al desplazarse a los lados; un clic en la fila abre el detalle.

const COLUMNAS: ColumnaTabla[] = [
  { id: 'acc', titulo: 'Acc.', ancho: 56, minimo: 56, alinear: 'center' },
  { id: 'id', titulo: 'ID', ancho: 64, alinear: 'center' },
  { id: 'os', titulo: 'Orden de servicio', ancho: 140 },
  { id: 'ov', titulo: 'Orden de viaje', ancho: 130 },
  { id: 'cod', titulo: 'Cód. liquidación', ancho: 140 },
  { id: 'sust_liq', titulo: 'Sustento liq.', ancho: 100, alinear: 'center' },
  { id: 'f_liq', titulo: 'Fecha liquidación', ancho: 120 },
  { id: 'f_serv', titulo: 'Fecha servicio', ancho: 110 },
  { id: 'razon', titulo: 'Razón social', ancho: 200 },
  { id: 'camion', titulo: 'Placa (camión)', ancho: 110 },
  { id: 'carreta', titulo: 'Placa (carreta)', ancho: 110 },
  { id: 'conductor', titulo: 'Conductor', ancho: 190 },
  { id: 'cliente', titulo: 'Cliente', ancho: 220 },
  { id: 'lugar', titulo: 'Lugar', ancho: 170 },
  { id: 'flete', titulo: 'Flete', ancho: 110, alinear: 'right' },
  { id: 'comision', titulo: 'Comisión (%)', ancho: 100, alinear: 'center' },
  { id: 'tarifa', titulo: 'Tarifa', ancho: 110, alinear: 'right' },
  { id: 'gastos', titulo: '(−) Gastos operativos', ancho: 140, alinear: 'right' },
  { id: 'bi', titulo: 'B.I. (base imp.)', ancho: 120, alinear: 'right' },
  { id: 'igv', titulo: 'IGV', ancho: 100, alinear: 'right' },
  { id: 'total', titulo: 'Total', ancho: 120, alinear: 'right' },
  { id: 'adelanto', titulo: 'Adelanto', ancho: 110, alinear: 'right' },
  { id: 'detraccion', titulo: 'Detracción', ancho: 110, alinear: 'right' },
  { id: 'neto', titulo: 'Neto por cobrar', ancho: 130, alinear: 'right' },
  { id: 'mes', titulo: 'Mes facturación', ancho: 120 },
  { id: 'f_fact', titulo: 'Fecha', ancho: 100 },
  { id: 'serie', titulo: 'Serie', ancho: 80 },
  { id: 'factura', titulo: 'Factura', ancho: 110 },
  { id: 'sust_fact', titulo: 'Sustento factura', ancho: 120, alinear: 'center' },
  { id: 'credito', titulo: 'Crédito días', ancho: 100, alinear: 'center' },
  { id: 'f_cobrar', titulo: 'Fecha a cobrar', ancho: 120 },
  { id: 'f_dep', titulo: 'Fecha depósito / transf.', ancho: 150 },
  { id: 'estado', titulo: 'Estado servicio', ancho: 130, alinear: 'center' },
  { id: 'sust_pago', titulo: 'Sustento pago', ancho: 110, alinear: 'center' },
  { id: 'cobrado', titulo: 'Neto cobrado', ancho: 120, alinear: 'right' },
  { id: 'dif', titulo: 'Diferencia', ancho: 110, alinear: 'right' },
  { id: 'obs', titulo: 'Observación', ancho: 260 },
];

const dinero = (v: unknown) => (v == null || v === '' ? '' : soles(v));
const fecha = (v: unknown) => (isoDe(v) ? formatFechaPe(isoDe(v)) : '');

/** Enlace al archivo de sustento (si lo hay), sin abrir el detalle de la fila */
function Sustento({ c, campo, titulo }: { c: CuentaPorCobrar; campo: CampoDocumento; titulo: string }) {
  const url = verUrl(c, campo);
  if (!url) return <span style={{ color: 'var(--label-3)' }}>—</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={titulo} aria-label={titulo} onClick={e => e.stopPropagation()}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent)', fontWeight: 700, fontSize: '0.75rem' }}>
      <Paperclip size={14} /> Ver
    </a>
  );
}

export function CuentasTabla({ filas, onAbrir, altoMax }: { filas: CuentaPorCobrar[]; onAbrir: (id: number) => void; altoMax: string }) {
  return (
    <TablaRedimensionable id="tesoreria-cuentas" columnas={COLUMNAS} ariaLabel="Cuentas por cobrar" altoMax={altoMax} fijas={2} className="tabla-redim--compacta">
      {filas.map(c => {
        const t = tonoCuenta(c);
        const e = estadoDe(c);
        const abrir = () => { haptic('selection'); onAbrir(c.id); };
        return (
          <tr key={c.id} onClick={abrir} style={{ cursor: 'pointer' }}>
            <Celda alinear="center">
              <button type="button" aria-label={`Ver detalle de la cuenta ${c.id}`} title="Ver detalle" onClick={ev => { ev.stopPropagation(); abrir(); }}
                style={{ display: 'inline-grid', placeItems: 'center', width: 28, height: 28, border: 0, borderRadius: 8, background: 'var(--fill)', color: 'var(--label-2)', cursor: 'pointer' }}>
                <Eye size={15} />
              </button>
            </Celda>
            <Celda mono alinear="center">{c.id}</Celda>
            <Celda>{c.orden_servicio}</Celda>
            <Celda>{c.numero_viaje}</Celda>
            <Celda>{c.codigo_liquidacion}</Celda>
            <Celda alinear="center"><Sustento c={c} campo="documento" titulo="Ver sustento de la liquidación" /></Celda>
            <Celda>{fecha(c.fecha_liquidacion)}</Celda>
            <Celda>{fecha(c.fecha_servicio)}</Celda>
            <Celda>{c.razon_social}</Celda>
            <Celda>{c.placa_camion}</Celda>
            <Celda>{c.placa_carreta}</Celda>
            <Celda>{c.conductor}</Celda>
            <Celda>{c.cliente}</Celda>
            <Celda>{c.lugar}</Celda>
            <Celda mono alinear="right">{dinero(c.flete)}</Celda>
            <Celda mono alinear="center">{c.comision_porcentaje == null || c.comision_porcentaje === '' ? '' : `${num(c.comision_porcentaje)}%`}</Celda>
            <Celda mono alinear="right">{dinero(c.tarifa)}</Celda>
            <Celda mono alinear="right">{dinero(c.gastos_operativos)}</Celda>
            <Celda mono alinear="right">{dinero(c.base_imponible)}</Celda>
            <Celda mono alinear="right">{dinero(c.igv)}</Celda>
            <Celda mono alinear="right">{dinero(c.total)}</Celda>
            <Celda mono alinear="right">{dinero(c.adelanto)}</Celda>
            <Celda mono alinear="right">{dinero(c.detraccion)}</Celda>
            <Celda mono alinear="right"><strong>{dinero(c.neto_cobrar)}</strong></Celda>
            <Celda>{c.mes_facturacion}</Celda>
            <Celda>{fecha(c.fecha_factura)}</Celda>
            <Celda>{c.serie}</Celda>
            <Celda>{c.factura}</Celda>
            <Celda alinear="center"><Sustento c={c} campo="factura_documento" titulo="Ver la factura" /></Celda>
            <Celda alinear="center">{c.credito_dias ?? ''}</Celda>
            <Celda>{fecha(c.fecha_cobrar)}</Celda>
            <Celda>{fecha(c.fecha_deposito)}</Celda>
            <Celda alinear="center"><Badge tone={t === 'gray' ? 'gray' : t}>{e || 'PENDIENTE'}</Badge></Celda>
            <Celda alinear="center"><Sustento c={c} campo="sustento_pago" titulo="Ver el sustento del pago" /></Celda>
            <Celda mono alinear="right">{dinero(c.neto_cobrado)}</Celda>
            <Celda mono alinear="right">{dinero(c.diferencia)}</Celda>
            <Celda>{c.observacion}</Celda>
          </tr>
        );
      })}
    </TablaRedimensionable>
  );
}
