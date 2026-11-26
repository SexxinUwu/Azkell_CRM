import { useState } from 'react';
import { Layers } from 'lucide-react';
import { formatSoles } from '../../core/lib/format';
import { useLotes } from './api';
import './lotes.css';

const ORIGEN: Record<string, string> = { INICIAL: 'Stock inicial', RECEPCION: 'Compra', AJUSTE: 'Ajuste' };
const dia = (f: string) => (f ? new Date(f).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

/** Lotes de un artículo: cada compra abre uno con su costo. Los agotados se ocultan; se pueden ver con el botón. */
export function LotesArticulo({ inventarioId }: { inventarioId: string }) {
  const [agotados, setAgotados] = useState(false);
  const { data, isLoading } = useLotes(inventarioId, agotados);
  const lotes = data?.lotes ?? [];
  const nAgotados = data?.agotados ?? 0;
  const total = lotes.reduce((s, l) => s + (l.saldo > 0 ? l.saldo : 0), 0);

  return (
    <div className="lotes">
      <div className="lotes__cab">
        <h3 className="ficha__titulo-bloque"><Layers size={15} /> Lotes</h3>
        {nAgotados > 0 && (
          <button type="button" className="lotes__ver" onClick={() => setAgotados(v => !v)}>{agotados ? 'Ocultar agotados' : `Ver agotados (${nAgotados})`}</button>
        )}
      </div>
      {isLoading ? <p className="ficha__nota">Cargando lotes…</p> : lotes.length === 0 ? (
        <p className="ficha__nota">Este artículo aún no tiene lotes con saldo.</p>
      ) : (
        <ul className="lotes__lista">
          {lotes.map(l => (
            <li key={l.id} className={l.saldo > 0 ? undefined : 'lotes__item--agotado'}>
              <span className="lotes__n">Lote {l.numero}</span>
              <span className="lotes__txt">
                <b className="t-numeric">{l.saldo > 0 ? `${l.saldo.toLocaleString('es-PE', { maximumFractionDigits: 2 })} u.` : 'Agotado'}</b>
                <small>{formatSoles(l.costo_unitario)} c/u · {ORIGEN[l.origen] ?? l.origen} · {dia(l.fecha)}{l.entrada_id ? ` · ${l.entrada_id}` : ''}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {lotes.length > 1 && total > 0 && <p className="ficha__nota">Saldo total en lotes: {total.toLocaleString('es-PE', { maximumFractionDigits: 2 })} u.</p>}
    </div>
  );
}
