// Constantes y utilidades de la pantalla Caja (lista, detalle y formulario).
import { dayKey, formatDolares, formatSoles } from '../../core/lib/format';
import type { CajaMovimiento } from './api';

export const ESTADOS = ['REGISTRADO', 'PENDIENTE', 'APROBADO', 'PROCESADO', 'PAGADO', 'ANULADO'] as const;
export const MODALIDADES = ['TRANSFERENCIA BANCARIA', 'EFECTIVO', 'YAPE / PLIN', 'DEPOSITO EN CUENTA', 'TARJETA DE CRÉDITO/DÉBITO'];
export const COMPROBANTES = ['FACTURA', 'BOLETA DE VENTA', 'RECIBO POR HONORARIOS', 'VALE PROVISIONAL DE CAJA', 'TICKET DE PEAJE', 'SIN COMPROBANTE'];
export const PERSONAS = ['ADMINISTRATIVO', 'CONDUCTOR', 'PROVEEDOR', 'BANCO'];
// Mismas personas que autorizan en el clásico
export const AUTORIZAN = ['Marco Rosas', 'Leo Rosas', 'Saul Rosas'];
export const CC_VIAJES = 'CC-300';
export const MOTIVO_VIAJES = 'Gastos de Viaje y Ruta';

export const num = (v: unknown) => Number(v) || 0;

/** Estado en mayúsculas; un movimiento sin estado cuenta como REGISTRADO (como en el clásico) */
export const estadoDe = (m: Pick<CajaMovimiento, 'estado'>) => String(m.estado || 'REGISTRADO').toUpperCase();

/** Solo se editan o eliminan mientras no esté aprobado */
export const esEditable = (m: Pick<CajaMovimiento, 'estado'>) => ['REGISTRADO', 'PENDIENTE'].includes(estadoDe(m));

export const esPendiente = (m: Pick<CajaMovimiento, 'estado'>) => ['REGISTRADO', 'PENDIENTE'].includes(estadoDe(m));

export function tonoEstado(estado: string): 'accent' | 'green' | 'amber' | 'red' | 'gray' {
  if (estado === 'APROBADO') return 'accent';
  if (estado === 'PROCESADO' || estado === 'PAGADO') return 'green';
  if (estado === 'REGISTRADO' || estado === 'PENDIENTE') return 'amber';
  if (estado === 'ANULADO') return 'red';
  return 'gray';
}

/** Importe en su moneda: US$ para dólares, S/ para soles */
export const montoCaja = (v: unknown, moneda?: string | null) => (moneda === 'DOLARES' ? formatDolares(num(v)) : formatSoles(num(v)));

/** Equivalente en soles: los dólares se convierten con el tipo de cambio guardado (S/ por US$) */
export function aSoles(m: Pick<CajaMovimiento, 'importe_total' | 'moneda' | 'tipo_cambio'>): number {
  const total = num(m.importe_total);
  if (m.moneda !== 'DOLARES') return total;
  const tc = num(m.tipo_cambio);
  return total * (tc > 0 ? tc : 1);
}

/** Fechas de hoy y del primer día del mes en hora de Lima, "2026-10-26" */
export const hoyYMD = () => dayKey(new Date());
export const inicioMesYMD = () => `${hoyYMD().slice(0, 8)}01`;

export const numeroDoc = (m: Pick<CajaMovimiento, 'serie' | 'numero'>) => (m.serie && m.numero ? `${m.serie}-${m.numero}` : m.numero ?? '');

export type CampoOrden = 'fecha' | 'numero' | 'importe' | 'estado' | 'persona' | 'motivo';
export interface Orden { campo: CampoOrden; asc: boolean }
export const ORDEN_INICIAL: Orden = { campo: 'fecha', asc: false };
export const CAMPOS_ORDEN: { value: CampoOrden; label: string }[] = [
  { value: 'fecha', label: 'Fecha' },
  { value: 'numero', label: 'N°' },
  { value: 'importe', label: 'Importe' },
  { value: 'estado', label: 'Estado' },
  { value: 'persona', label: 'Persona' },
  { value: 'motivo', label: 'Motivo' },
];

/** Ordena una copia. Empate: id (más reciente primero en fecha, como el servidor) */
export function ordenar(lista: CajaMovimiento[], orden: Orden): CajaMovimiento[] {
  const sentido = orden.asc ? 1 : -1;
  return [...lista].sort((a, b) => {
    let r = 0;
    switch (orden.campo) {
      case 'fecha': r = (a.fecha ?? '').localeCompare(b.fecha ?? '') || (a.hora ?? '').localeCompare(b.hora ?? ''); break;
      case 'numero': r = numeroDoc(a).localeCompare(numeroDoc(b), 'es', { numeric: true }); break;
      case 'importe': r = aSoles(a) - aSoles(b); break;
      case 'estado': r = estadoDe(a).localeCompare(estadoDe(b)); break;
      case 'persona': r = (a.persona ?? '').localeCompare(b.persona ?? '', 'es'); break;
      case 'motivo': r = (a.motivo ?? '').localeCompare(b.motivo ?? '', 'es'); break;
    }
    return (r || a.id - b.id) * sentido;
  });
}
