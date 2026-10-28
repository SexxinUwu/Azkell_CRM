import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { formatFechaPe, formatSoles } from '../../core/lib/format';
import type { KardexItem } from './api';

const PASO = 10;
const cantidad = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(2));

const ETIQUETA: Record<KardexItem['tipo'], string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  REGULARIZACION: 'Regularización',
};

/**
 * Movimientos del artículo: el más reciente arriba, de a PASO por vez.
 * El saldo viene calculado desde la última regularización, igual que el stock actual.
 */
export function KardexMovimientos({ items }: { items: KardexItem[] }) {
  const [mostrar, setMostrar] = useState(PASO);
  // El servidor entrega en orden cronológico; aquí se muestra el último movimiento primero
  const recientes = [...items].reverse();
  const visibles = recientes.slice(0, mostrar);
  const restantes = recientes.length - visibles.length;

  if (recientes.length === 0) {
    return <p className="inv-tarjeta__nota">Sin movimientos registrados.</p>;
  }

  return (
    <div className="mov">
      <ul className="mov__lista" aria-label="Movimientos del artículo">
        {visibles.map((m, i) => {
          const Icono = m.tipo === 'ENTRADA' ? ArrowDownLeft : m.tipo === 'SALIDA' ? ArrowUpRight : RefreshCw;
          const signo = m.tipo === 'ENTRADA' ? '+' : m.tipo === 'SALIDA' ? '−' : '';
          return (
            <li key={`${m.documento ?? 'reg'}-${m.fecha}-${i}`} className={`mov__item mov__item--${m.tipo.toLowerCase()}`}>
              <span className="mov__icono" aria-hidden="true"><Icono size={16} strokeWidth={2.2} /></span>
              <div className="mov__cuerpo">
                <div className="mov__cab">
                  <span className="mov__tipo">{ETIQUETA[m.tipo]}</span>
                  <span className="mov__fecha">{formatFechaPe(m.fecha)}</span>
                </div>
                <span className="mov__detalle">{m.proveedor_destino ?? m.documento ?? '—'}</span>
                {m.documento && m.proveedor_destino && <span className="mov__doc">{m.documento}</span>}
              </div>
              <div className="mov__cifras">
                <span className="mov__cantidad">{m.tipo === 'REGULARIZACION' ? cantidad(m.saldo) : `${signo}${cantidad(m.cantidad)}`}</span>
                <span className="mov__saldo">Saldo <b>{cantidad(m.saldo)}</b></span>
                {m.valor_saldo != null && <span className="mov__valor">{formatSoles(m.valor_saldo)}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      {restantes > 0 && (
        <button type="button" className="mov__mas pressable" onClick={() => setMostrar(n => n + PASO)}>
          Cargar más · {restantes} restantes
        </button>
      )}
    </div>
  );
}
