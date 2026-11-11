import { ReceiptText } from 'lucide-react';
import { haptic } from '../../core/lib/haptics';
import { montoNc, type NcDisponible } from './nc-api';
import './nc.css';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Total a favor de las notas disponibles */
export const sumaSaldo = (notas: NcDisponible[]) => r2(notas.reduce((s, n) => s + n.saldo, 0));

/** Lo que compensarían las notas marcadas contra el total de la orden (en orden de antigüedad, sin pasar del total) */
export function compensacion(notas: NcDisponible[], marcadas: number[], total: number) {
  let restante = r2(Math.max(0, total)); let comp = 0;
  for (const n of notas) { if (!marcadas.includes(n.id) || restante <= 0) continue; const m = r2(Math.min(n.saldo, restante)); comp = r2(comp + m); restante = r2(restante - m); }
  return comp;
}

/**
 * Al generar una orden: el proveedor tiene saldo a favor. Se puede marcar (opcional) cuáles notas se piden descontar al pagarla;
 * el descuento lo confirma Tesorería al pagar, con esas notas ya marcadas.
 */
export function AvisoSaldoFavor({ notas, moneda, total, marcadas, onToggle }: {
  notas: NcDisponible[]; moneda: 'PEN' | 'USD'; total: number; marcadas: number[]; onToggle: (id: number) => void;
}) {
  const saldo = sumaSaldo(notas);
  if (saldo <= 0) return null;
  const comp = compensacion(notas, marcadas, total);
  return (
    <section className="nc-aplicar" aria-label="Saldo a favor del proveedor">
      <header className="nc-aplicar__cab"><ReceiptText size={16} aria-hidden /><strong>Este proveedor tiene {montoNc(saldo, moneda)} a favor</strong></header>
      <p className="nc-aviso__ayuda">Opcional: marca las notas que quieres descontar al pagar esta orden. Tesorería las verá ya marcadas y confirma el descuento; la orden conserva su importe completo.</p>
      <ul className="nc-aplicar__lista">
        {notas.map(n => {
          const on = marcadas.includes(n.id);
          return (
            <li key={n.id}>
              <label className={`nc-aplicar__fila${on ? ' nc-aplicar__fila--on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => { haptic('selection'); onToggle(n.id); }} />
                <span className="nc-aplicar__texto"><b>{n.codigo}</b> · {n.serie}-{n.numero}<small>{n.motivo_texto || 'Nota de crédito'}{n.oc_origen ? ` · orden ${n.oc_origen}` : ''} · saldo {montoNc(n.saldo, n.moneda)}</small></span>
              </label>
            </li>
          );
        })}
      </ul>
      {total > 0 && marcadas.length > 0 && (
        <dl className="nc-aplicar__resumen">
          <div><dt>Total de la orden</dt><dd>{montoNc(total, moneda)}</dd></div>
          <div><dt>Notas de crédito marcadas</dt><dd>− {montoNc(comp, moneda)}</dd></div>
          <div className="nc-aplicar__neto"><dt>A pagar (sale del banco)</dt><dd>{montoNc(r2(total - comp), moneda)}</dd></div>
        </dl>
      )}
    </section>
  );
}
