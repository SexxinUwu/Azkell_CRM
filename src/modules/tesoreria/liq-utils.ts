// Tipos, formatos y cálculos de Tesorería › Liquidaciones (compartidos por la lista, el detalle y la caja de compensación).
import { formatFechaPe, formatSoles } from '../../core/lib/format';

export interface Viaje {
  viaje: string;
  fecha: string | null;
  conductor: string | null;
  placa_tracto: string | null;
  placa_remolque: string | null;
  ruta: string | null;
  total_depositado: number | string;
  total_rendido: number | string;
  saldo_diferencia: number | string;
  estado_balance: string;       // CUADRADO | SALDO_EMPRESA (sobrante) | SALDO_CONDUCTOR (faltante)
  estado?: string;              // estado del viaje: FINALIZADO | LIQUIDADO …
  fondos_pendientes?: number;   // solicitudes de caja aún no procesadas por tesorería
}

export interface Gasto {
  id?: number;
  estado?: string | null;
  fecha?: string | null;
  tipo_gasto?: string | null;
  sub_motivo?: string | null;
  detalle?: string | null;
  proveedor_nombre?: string | null;
  tipo_comprobante?: string | null;
  numero?: string | null;
  importe?: number | string | null;
  sustento_view_url?: string;
  sustento_url?: string | null;
}

export interface Caja {
  id?: number;
  serie?: string | null;
  numero?: string | null;
  fecha?: string | null;
  motivo?: string | null;
  sub_motivo?: string | null;
  importe_total?: number | string | null;
  estado?: string | null;
  tipo_movimiento?: string | null;
  voucher_view_url?: string;
  voucher_url?: string | null;
  conductor?: string | null;
  persona?: string | null;
}

export interface DetalleViaje {
  ok: boolean;
  total_depositado: number | string;   // neto: cajas PROCESADO/REGISTRADO (egresos) menos devoluciones (ingresos)
  total_rendido: number | string;
  saldo_diferencia: number | string;
  estado_balance: string;
  gastos: Gasto[];
  estado_viaje?: string | null;
  total_pendiente_pago?: number | string;
}

export type TipoCompensacion = 'DEVOLUCION_EMPRESA' | 'REEMBOLSO_CONDUCTOR';

export const num = (v: unknown) => Number(v) || 0;
// Los importes son de centavos: se redondea para que 0.1 + 0.2 - 0.3 no aparezca como saldo
export const redondear = (n: number) => Math.round(n * 100) / 100;
export const soles = (v: unknown) => formatSoles(redondear(num(v)));
export const solesConSigno = (v: unknown) => {
  const n = redondear(num(v));
  return `${n > 0 ? '+' : ''}${formatSoles(n)}`;
};
export const fechaPe = (v?: string | null) => formatFechaPe(v ?? null);

export type Tono = 'green' | 'amber' | 'red' | 'gray';
export const tonoBalance = (e: string): Tono =>
  e === 'CUADRADO' ? 'green' : e === 'SALDO_EMPRESA' ? 'amber' : e === 'SALDO_CONDUCTOR' ? 'red' : 'gray';
export const etiquetaBalance = (e: string) =>
  e === 'CUADRADO' ? 'Cuadrado' : e === 'SALDO_EMPRESA' ? 'Sobrante' : e === 'SALDO_CONDUCTOR' ? 'Faltante' : e || '—';

export const urlComprobante = (g: { sustento_view_url?: string; sustento_url?: string | null; voucher_view_url?: string; voucher_url?: string | null }) =>
  g.sustento_view_url || g.sustento_url || g.voucher_view_url || g.voucher_url || '';

// Destinos de la caja de compensación: mismos valores que acepta el servidor (destino_devolucion)
export const DESTINOS: Record<TipoCompensacion, { value: string; label: string; ayuda: string }[]> = {
  DEVOLUCION_EMPRESA: [
    { value: 'CAJA_PRINCIPAL', label: 'Caja principal de Tesorería (banco)', ayuda: 'El conductor deposita en la cuenta corriente de la empresa.' },
    { value: 'CAJA_CHICA', label: 'Caja chica de operaciones (efectivo)', ayuda: 'El conductor devuelve el efectivo en garita o en base.' },
    { value: 'DESCUENTO_PLANILLA', label: 'Descontar de su próxima asignación o planilla', ayuda: 'Se descuenta en la próxima orden de viaje o en el sueldo.' },
  ],
  REEMBOLSO_CONDUCTOR: [
    { value: 'TRANSFERENCIA', label: 'Transferencia bancaria', ayuda: 'Caja de egreso por transferencia a la cuenta del conductor.' },
    { value: 'EFECTIVO', label: 'Efectivo por caja chica', ayuda: 'Reembolso inmediato en garita o ventanilla.' },
  ],
};

export interface LineaPrevia { concepto: string; importe: number }

const CONCEPTO_DEFECTO = 'Gastos de Viaje y Ruta';

// Gastos que cuentan para el total rendido (los rechazados no)
export const gastosVigentes = (gastos: Gasto[]) => gastos.filter(g => g.estado !== 'RECHAZADO');

// Reproduce el agrupado que hace el servidor al generar reembolsos (una caja por sub_motivo):
// suma TODOS los gastos rendidos del viaje, sin descontar lo entregado.
function lineasReembolsoServidor(gastos: Gasto[]): LineaPrevia[] {
  const porConcepto = new Map<string, LineaPrevia>();
  for (const g of gastosVigentes(gastos)) {
    const concepto = g.sub_motivo?.trim() || g.tipo_gasto?.trim() || CONCEPTO_DEFECTO;
    const clave = concepto.toLowerCase();
    const previo = porConcepto.get(clave);
    if (previo) previo.importe += num(g.importe);
    else porConcepto.set(clave, { concepto, importe: num(g.importe) });
  }
  return [...porConcepto.values()]
    .map(l => ({ concepto: l.concepto, importe: redondear(l.importe) }))
    .filter(l => l.importe > 0);
}

/**
 * Vista previa de lo que generará el servidor.
 * - Devolución: una caja INGRESO por el sobrante.
 * - Reembolso: cajas EGRESO por concepto. Si el total no coincide con el faltante,
 *   `cuadra` es false: el servidor sobrepagaría (ver liq-CompensacionSheet).
 */
export function previaCompensacion(tipo: TipoCompensacion, saldo: number, gastos: Gasto[]) {
  const importe = redondear(Math.abs(saldo));
  if (tipo === 'DEVOLUCION_EMPRESA') {
    return { lineas: [{ concepto: 'Sobrante de viáticos', importe }], total: importe, cuadra: true, sobrepago: 0 };
  }
  // El reembolso es el faltante neto: se reparte entre submotivos en proporción a lo rendido (igual que el servidor)
  const brutas = lineasReembolsoServidor(gastos);
  const totalBrutas = brutas.reduce((s, l) => s + l.importe, 0);
  if (importe <= 0 || totalBrutas <= 0) {
    return { lineas: [{ concepto: 'Viáticos / Alimentación choferes', importe }], total: importe, cuadra: importe > 0, sobrepago: 0 };
  }
  let asignado = 0;
  const lineas = brutas
    .map((l, i) => {
      const parte = i === brutas.length - 1 ? redondear(importe - asignado) : redondear((importe * l.importe) / totalBrutas);
      asignado = redondear(asignado + parte);
      return { concepto: l.concepto, importe: parte };
    })
    .filter(l => l.importe > 0);
  return { lineas, total: importe, cuadra: true, sobrepago: 0 };
}
