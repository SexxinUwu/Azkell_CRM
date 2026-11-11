import { useEffect, useMemo, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { haptic } from '../../core/lib/haptics';
import { montoNc, useNcDisponibles } from './nc-api';
import './nc.css';

export interface AplicacionElegida { nc_id: number; monto: number; codigo: string }

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Bloque del pago de una orden: si el proveedor tiene notas de crédito aprobadas con saldo, se pueden aplicar.
 * Calcula cuánto se compensa y cuánto sale realmente del banco. El servidor vuelve a validar todo al confirmar el pago.
 */
export function AplicarNotasCredito({ entradaId, moneda, importe, onChange }: {
  entradaId: string | number | null;
  moneda: 'PEN' | 'USD';
  /** Importe de la orden en la moneda del pago */
  importe: number;
  onChange: (aplicaciones: AplicacionElegida[], neto: number) => void;
}) {
  const q = useNcDisponibles(entradaId, moneda, true);
  const notas = useMemo(() => q.data ?? [], [q.data]);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());

  // Reparto en orden de antigüedad: cada nota marcada compensa hasta su saldo, sin pasar del importe
  const aplicaciones = useMemo(() => {
    let restante = r2(importe);
    const out: AplicacionElegida[] = [];
    for (const n of notas) {
      if (!marcadas.has(n.id) || restante <= 0) continue;
      const monto = r2(Math.min(n.saldo, restante));
      if (monto > 0) { out.push({ nc_id: n.id, monto, codigo: n.codigo }); restante = r2(restante - monto); }
    }
    return out;
  }, [notas, marcadas, importe]);
  const compensado = r2(aplicaciones.reduce((s, a) => s + a.monto, 0));
  const neto = r2(Math.max(0, importe - compensado));

  useEffect(() => { onChange(aplicaciones, neto); }, [aplicaciones, neto]); // eslint-disable-line react-hooks/exhaustive-deps
  // Si cambia la moneda o la orden, se parte limpio
  useEffect(() => { setMarcadas(new Set()); }, [entradaId, moneda]);

  if (q.isLoading || notas.length === 0) return null;

  const alternar = (id: number) => { haptic('selection'); setMarcadas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  return (
    <section className="nc-aplicar" aria-label="Notas de crédito del proveedor">
      <header className="nc-aplicar__cab">
        <ReceiptText size={16} aria-hidden />
        <strong>Este proveedor tiene saldo a favor</strong>
      </header>
      <ul className="nc-aplicar__lista">
        {notas.map(n => {
          const on = marcadas.has(n.id);
          const aplicado = aplicaciones.find(a => a.nc_id === n.id)?.monto ?? 0;
          return (
            <li key={n.id}>
              <label className={`nc-aplicar__fila${on ? ' nc-aplicar__fila--on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => alternar(n.id)} />
                <span className="nc-aplicar__texto">
                  <b>{n.codigo}</b> · {n.serie}-{n.numero}
                  <small>{n.motivo_texto || 'Nota de crédito'}{n.oc_origen ? ` · orden ${n.oc_origen}` : ''} · saldo {montoNc(n.saldo, n.moneda)}</small>
                </span>
                {on && aplicado > 0 && <span className="nc-aplicar__monto">− {montoNc(aplicado, n.moneda)}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <dl className="nc-aplicar__resumen">
        <div><dt>Importe de la orden</dt><dd>{montoNc(importe, moneda)}</dd></div>
        <div><dt>Notas de crédito</dt><dd>− {montoNc(compensado, moneda)}</dd></div>
        <div className="nc-aplicar__neto"><dt>A pagar (sale del banco)</dt><dd>{montoNc(neto, moneda)}</dd></div>
      </dl>
    </section>
  );
}
