import { formatSoles } from '../../core/lib/format';
import type { CuentaPorCobrar } from './api';

// Utilidades de Cuentas por cobrar y pagar: cálculos y fechas. Sin React.
// Los cálculos replican al clásico (modulos/tesoreria/cuentas/logica.js): IGV 18 %, detracción 4 % si el total supera S/ 700.

export const ESTADOS = ['PENDIENTE', 'PAGADO', 'ANULADO'] as const;
export const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/** Motivos SUNAT para la nota de crédito (mismo catálogo que el clásico) */
export const MOTIVOS_NC = [
  '01 - Anulación de la operación',
  '02 - Anulación por error en el RUC / Razón Social',
  '03 - Corrección por error en la descripción o ítems',
  '04 - Descuento global o corrección de importe',
  '05 - Devolución total o cambio de condiciones',
];

const IGV = 0.18;
const DETRACCION_TASA = 0.04;
const DETRACCION_DESDE = 700;

export const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
/** Redondeo a centavos */
export const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
/** Texto del formulario ("1,5" o "1.5") a número; vacío = 0 */
export const decimal = (v: string) => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : 0; };
export const aTexto = (x: number) => x.toFixed(2);

/** Importe con S/ y espacio no divisible; nulo se muestra como S/ 0.00 */
export const soles = (v: unknown) => formatSoles(num(v));

export const estadoDe = (c: Pick<CuentaPorCobrar, 'estado_servicio'>) => String(c.estado_servicio ?? '').toUpperCase();

/** 'aaaa-mm-dd' a partir de un valor de la base de datos ('' si no hay fecha) */
export function isoDe(v: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Hoy en la fecha local del navegador (no UTC: después de las 19:00 en Lima cambiaría de día) */
export function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Días desde hoy hasta la fecha (negativo = ya pasó). Null si no hay fecha. */
export function diasHasta(v: unknown): number | null {
  const iso = isoDe(v);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d).getTime() - hoy.getTime()) / 86_400_000);
}

export function sumarDias(iso: string, dias: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Mes de facturación en mayúsculas según la fecha ('' si no hay fecha) */
export function mesDe(iso: string) {
  const m = Number(iso.slice(5, 7));
  return m >= 1 && m <= 12 ? MESES[m - 1] : '';
}

/** Fecha de búsqueda por rango: servicio o, si no hay, liquidación (igual que el clásico) */
export const fechaDeFiltro = (c: CuentaPorCobrar) => isoDe(c.fecha_servicio) || isoDe(c.fecha_liquidacion);

export function tonoCuenta(c: CuentaPorCobrar): 'green' | 'amber' | 'red' | 'gray' {
  const e = estadoDe(c);
  if (e === 'PAGADO') return 'green';
  if (e === 'ANULADO') return 'gray';
  const d = diasHasta(c.fecha_cobrar);
  return d !== null && d < 0 ? 'red' : 'amber';
}

/** Texto de vencimiento para una cuenta pendiente */
export function textoVencimiento(c: CuentaPorCobrar): string {
  const e = estadoDe(c);
  if (e === 'ANULADO') return 'Anulada';
  if (e === 'PAGADO') return 'Pagada';
  const d = diasHasta(c.fecha_cobrar);
  if (d === null) return 'Sin fecha de cobro';
  if (d < 0) return `Vencida hace ${Math.abs(d)} d`;
  if (d === 0) return 'Vence hoy';
  return `Vence en ${d} d`;
}

export type CampoDocumento = 'documento' | 'factura_documento' | 'sustento_pago' | 'nota_credito';

/** Enlace para abrir un archivo: la versión firmada del servidor (S3 privado) o la URL directa */
export function verUrl(c: CuentaPorCobrar, campo: CampoDocumento): string | null {
  const v = c[`${campo}_view_url`] ?? c[`${campo}_url`];
  return typeof v === 'string' && v ? v : null;
}

export interface Importes { flete: number; comision: number; gastos: number; adelanto: number }
export interface Economia { tarifa: number; baseImponible: number; igv: number; total: number; detraccion: number; neto: number }

/** Cálculo directo: flete → tarifa (menos comisión) → B.I. (menos gastos) → IGV → total → detracción → neto */
export function calcularDesdeFlete(p: Importes): Economia {
  const tarifa = r2(Math.max(0, p.flete - (p.flete * p.comision) / 100));
  const baseImponible = r2(Math.max(0, tarifa - p.gastos));
  const igv = r2(baseImponible * IGV);
  const total = r2(baseImponible + igv);
  const detraccion = total > DETRACCION_DESDE ? Math.round(total * DETRACCION_TASA) : 0;
  const neto = r2(total - p.adelanto - detraccion);
  return { tarifa, baseImponible, igv, total, detraccion, neto };
}

/** Cálculo inverso: del neto por cobrar deseado sale el flete (como el clásico). Null si el neto no es positivo. */
export function calcularDesdeNeto(neto: number, p: Omit<Importes, 'flete'>): (Economia & { flete: number }) | null {
  if (!(neto > 0)) return null;
  const det = (t: number) => (t > DETRACCION_DESDE ? Math.round(t * DETRACCION_TASA) : 0);
  let total = neto > DETRACCION_DESDE ? Math.round((neto + p.adelanto) / (1 - DETRACCION_TASA)) : neto + p.adelanto;
  for (let i = 0; i < 500 && total - p.adelanto - det(total) < neto; i++) total++;
  for (let i = 0; i < 500 && total - p.adelanto - det(total) > neto; i++) total--;
  const baseImponible = r2(total / (1 + IGV));
  const igv = r2(total - baseImponible);
  const tarifa = r2(baseImponible + p.gastos);
  const flete = p.comision > 0 ? r2(tarifa / (1 - p.comision / 100)) : tarifa;
  return { flete, tarifa, baseImponible, igv, total: r2(total), detraccion: det(total), neto: r2(neto) };
}
