import { PackageX, PackageSearch } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';

export interface ArticuloSinStock {
  id: string;
  descripcion: string;
  pedido: number;
  disponible: number;
  /** Órdenes de compra de este artículo con mercadería todavía por recepcionar */
  ocs: Array<{ oc: string; estado?: string | null; por_recibir: number }>;
}

/** Lee la lista que devuelve el servidor cuando una salida no tiene stock (ApiError.data.sin_stock) */
export function sinStockDe(data: unknown): ArticuloSinStock[] | null {
  const lista = (data as { sin_stock?: unknown } | null | undefined)?.sin_stock;
  return Array.isArray(lista) && lista.length ? (lista as ArticuloSinStock[]) : null;
}

const num = (n: number) => Number(n).toLocaleString('es-PE', { maximumFractionDigits: 3 });

/**
 * Aviso cuando una salida se bloquea por falta de stock. Dice qué artículos no alcanzan y, si hay compras
 * por recepcionar, avisa con los códigos de los artículos y de las órdenes para que almacén las ingrese.
 */
export function SinStockDialogo({ articulos, onClose, alDespachar = false }: { articulos: ArticuloSinStock[] | null; onClose: () => void; /** true: el aviso sale al despachar una solicitud pendiente */ alDespachar?: boolean }) {
  const lista = articulos ?? [];
  const porRecepcionar = lista.filter(a => a.ocs.length > 0);
  return (
    <Sheet open={!!articulos} onClose={onClose} title="No hay stock suficiente"
      footer={<Button variant="primary" onClick={onClose}>Entendido</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <p className="t-callout c-secondary" style={{ margin: 0 }}>
          {alDespachar
            ? 'La salida no se despachó: estos artículos no tienen existencias en almacén y el stock no puede quedar en negativo. Abre la solicitud y desmárcalos para despachar solo los que sí tienen stock.'
            : 'La salida no se registró: estos artículos no tienen existencias en almacén y el stock no puede quedar en negativo.'}
        </p>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {lista.map(a => (
            <li key={a.id} style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center', padding: 'var(--s-3)', borderRadius: 12, background: 'var(--fill)' }}>
              <PackageX size={18} style={{ color: 'var(--red-ink)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block' }}>{a.descripcion}</strong>
                <span className="t-footnote c-secondary"><span style={{ fontFamily: 'var(--font-mono)' }}>{a.id}</span> · pides {num(a.pedido)}, hay {num(a.disponible)}</span>
              </span>
            </li>
          ))}
        </ul>

        {porRecepcionar.length > 0 && (
          <div role="alert" style={{ display: 'flex', gap: 'var(--s-3)', padding: 'var(--s-4)', borderRadius: 12, background: 'color-mix(in srgb, var(--amber-ink) 12%, transparent)' }}>
            <PackageSearch size={20} style={{ color: 'var(--amber-ink)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
              <strong>Hay productos por recepcionar</strong>
              <span className="t-footnote">Falta recepcionar estas compras para tener stock:</span>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {porRecepcionar.map(a => (
                  <li key={a.id} className="t-footnote">
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{a.id}</span>
                    {' → '}
                    {a.ocs.map(o => `${o.oc} (${num(o.por_recibir)} por recibir)`).join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
