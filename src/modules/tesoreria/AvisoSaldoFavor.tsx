import { ReceiptText } from 'lucide-react';
import { montoNc, type NcDisponible } from './nc-api';
import './nc.css';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Total a favor de las notas disponibles */
export const sumaSaldo = (notas: NcDisponible[]) => r2(notas.reduce((s, n) => s + n.saldo, 0));

/** Aviso al generar una orden: el proveedor tiene saldo a favor que se descontará al pagar */
export function AvisoSaldoFavor({ notas, moneda, total }: { notas: NcDisponible[]; moneda: 'PEN' | 'USD'; total: number }) {
  const saldo = sumaSaldo(notas);
  if (saldo <= 0) return null;
  const compensa = r2(Math.min(saldo, Math.max(0, total)));
  return (
    <div className="nc-aviso" role="status">
      <span className="nc-aviso__icono" aria-hidden><ReceiptText size={18} /></span>
      <div className="nc-aviso__texto">
        <b>Este proveedor tiene {montoNc(saldo, moneda)} a favor</b>
        <small>{notas.length === 1 ? '1 nota de crédito aprobada' : `${notas.length} notas de crédito aprobadas`}: {notas.map(n => `${n.serie}-${n.numero}`).join(', ')}. Se descuenta al pagar la orden, en Tesorería.</small>
        {total > 0 && <small className="nc-aviso__neto">Con esta orden: {montoNc(total, moneda)} − {montoNc(compensa, moneda)} a favor = <strong>{montoNc(r2(total - compensa), moneda)}</strong> a pagar{saldo > total ? `; quedarían ${montoNc(r2(saldo - total), moneda)} a favor` : ''}.</small>}
      </div>
    </div>
  );
}
