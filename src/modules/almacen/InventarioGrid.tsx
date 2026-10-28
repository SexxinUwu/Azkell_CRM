import { memo, type KeyboardEvent } from 'react';
import { MapPin, Package, Plus } from 'lucide-react';
import { formatSoles } from '../../core/lib/format';
import { stockTono, type ArticuloInv } from './api';

const ESTADO_TEXTO = { ok: 'En stock', warning: 'Reponer', critical: 'Sin stock' } as const;

/** Marcas de vehículo compatibles (marca_unidad guarda un JSON con la lista) */
export function marcasCompatibles(a: ArticuloInv): string[] {
  try {
    const v = JSON.parse(a.marca_unidad ?? '[]');
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

const cantidad = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(2));

interface Props {
  a: ArticuloInv;
  onAbrir: (a: ArticuloInv) => void;
}

/**
 * Tarjeta de producto: imagen con estado de stock, código, ubicación, marca, nombre,
 * compatibilidad, barra de nivel y costo. Al pasar el mouse se levanta y el "+" gira.
 */
export const ProductoCard = memo(function ProductoCard({ a, onAbrir }: Props) {
  const tono = stockTono(a);
  const stock = Number(a.stock_actual);
  const unidad = a.unidad ?? 'Unidades';
  const costo = a.moneda === 'USD' ? Number(a.costo_soles ?? 0) : Number(a.costo_referencial ?? 0);
  const marcas = marcasCompatibles(a);
  const nivel = a.stock_max > 0 ? Math.min(100, Math.round((stock / a.stock_max) * 100)) : 0;
  const ubicacion = [a.ubicacion, a.anaquel ? `Anq ${a.anaquel}` : ''].filter(Boolean).join(' • ');

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(a); }
  };

  return (
    <article className={`prod prod--${tono}`}>
      <div className="prod__tarjeta" role="button" tabIndex={0} onClick={() => onAbrir(a)} onKeyDown={alTeclear}
        aria-label={`Ver ${a.descripcion || a.articulo}`}>
        <header className="prod__cabecera">
          <span className="prod__codigo">{a.id}</span>
          {ubicacion && <span className="prod__ubicacion"><MapPin size={12} /> {ubicacion}</span>}
        </header>

        <div className="prod__imagen">
          <span className={`prod__estado prod__estado--${tono}`}>{ESTADO_TEXTO[tono]}: {cantidad(stock)} {unidad}</span>
          {a.imagen_url
            ? <img src={a.imagen_url} alt="" loading="lazy" />
            : <Package size={48} strokeWidth={1.3} />}
          {a.codigo_articulo && <span className="prod__oem">Cód. Int.: {a.codigo_articulo}</span>}
        </div>

        <div className="prod__marca">
          <span>{a.marca || '—'}</span>
          <span>{a.familia || ''}</span>
        </div>
        <h3 className="prod__titulo">{a.descripcion || a.articulo}</h3>

        {marcas.length > 0 && (
          <div className="prod__compat">
            {marcas.slice(0, 2).map(m => <span key={m} className="prod__compat-chip">{m}</span>)}
            {marcas.length > 2 && <span className="prod__compat-chip prod__compat-chip--mas">+{marcas.length - 2}</span>}
          </div>
        )}

        <div className="prod__nivel" aria-hidden="true"><span style={{ width: `${nivel}%` }} /></div>

        <footer className="prod__pie">
          <div>
            <span className="prod__etiqueta">Costo ref.</span>
            <strong>{formatSoles(costo)} <small>/ {unidad}</small></strong>
            <span className="prod__valor">Valor stock {formatSoles(stock * costo)}</span>
          </div>
          <span className="prod__mas" aria-hidden="true"><Plus size={18} /></span>
        </footer>
      </div>
    </article>
  );
});
