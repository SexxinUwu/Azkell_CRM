import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { BotonTip } from '../../core/ui/BotonTip';
import { formatSoles } from '../../core/lib/format';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { buscarItemAlmacen, codigoDeArticulo, type ArticuloKit, type KitGrupo, type KitItem } from './kitsFormulario';

const cant = (n: unknown) => Number(n).toLocaleString('es-PE', { maximumFractionDigits: 2 });

/** Color del tipo de mantenimiento: el mismo en la lista y en el formulario */
export const claseMp = (tipo: string) => {
  const t = tipo.toUpperCase();
  return t === 'MP1' ? 'kt-mp--1' : t === 'MP2' ? 'kt-mp--2' : t === 'MP3' ? 'kt-mp--3' : t === 'MP4' ? 'kt-mp--4' : 'kt-mp--x';
};

export interface ItemEnriquecido {
  item: KitItem;
  /** Nombre completo del inventario (con código, medidas y marca); si no está vinculado, el del kit */
  nombre: string;
  codigo: string;
  stock: number | null;
  unidad: string;
}

/** Cada ítem del kit con su artículo del inventario (nombre completo y stock) */
export function enriquecerKit(g: KitGrupo, inventario: ArticuloKit[]): ItemEnriquecido[] {
  return g.items.map(item => {
    const art = buscarItemAlmacen(inventario, String(item.item_codigo ?? ''), String(item.item_nombre ?? ''));
    return {
      item,
      nombre: art ? art.nombre : String(item.item_nombre ?? '—'),
      codigo: art ? codigoDeArticulo(art) : (String(item.item_codigo ?? '').trim() === '-' ? '' : String(item.item_codigo ?? '')),
      stock: art ? art.stock : null,
      unidad: String(item.unidad_medida || (art ? art.unidad : 'UND')),
    };
  });
}

/** Cuántos ítems del kit tiene el almacén completos (stock ≥ cantidad requerida) */
export const itemsConStock = (lista: ItemEnriquecido[]) => lista.filter(x => x.stock !== null && x.stock >= (Number(x.item.cantidad) || 0)).length;

function BadgeStock({ stock, requerido }: { stock: number | null; requerido: number }) {
  if (stock === null) return <span className="kt-stock kt-stock--sin">No inventariado</span>;
  if (stock >= requerido) return <span className="kt-stock kt-stock--ok">{cant(stock)}</span>;
  if (stock > 0) return <span className="kt-stock kt-stock--bajo" title="Alcanza para menos de lo que pide el kit">{cant(stock)} · bajo</span>;
  return <span className="kt-stock kt-stock--no">Sin stock</span>;
}

/** Un kit de mantenimiento: tipo, ítems, costo y cobertura de almacén; se expande para ver cada repuesto */
export function KitTarjeta({ kit, inventario, abierto, onAlternar, puedeEditar, onEditar, onEliminar }: {
  kit: KitGrupo;
  inventario: ArticuloKit[];
  abierto: boolean;
  onAlternar: () => void;
  puedeEditar: boolean;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const reducir = useReducedMotion();
  const lista = enriquecerKit(kit, inventario);
  const completos = itemsConStock(lista);
  const todoOk = lista.length > 0 && completos === lista.length;

  return (
    <article className={`kt-kit${abierto ? ' kt-kit--abierto' : ''}`}>
      <div className="kt-kit__cab">
        <button type="button" className="kt-kit__toggle" aria-expanded={abierto} onClick={() => { haptic('selection'); onAlternar(); }}>
          <ChevronRight size={16} className={`kt-kit__flecha${abierto ? ' kt-giro' : ''}`} aria-hidden />
          <span className={`kt-mp ${claseMp(kit.tipo_mp)}`}>{kit.tipo_mp}</span>
          <span className="kt-kit__texto">
            <strong>{kit.alias || `Kit ${kit.tipo_mp}`}</strong>
            <small>{kit.items.length} {kit.items.length === 1 ? 'ítem' : 'ítems'}</small>
          </span>
          <span className={`kt-cobertura${todoOk ? ' kt-cobertura--ok' : ''}`} title="Ítems con stock completo en almacén">{completos}/{lista.length} en almacén</span>
          <span className="kt-kit__costo t-numeric">{formatSoles(kit.costoTotal)}</span>
        </button>
        {puedeEditar && (
          <span className="kt-kit__acciones">
            <BotonTip tip="Editar kit" className="btn btn--plain btn--icono btn-tip btn-tip--azul" aria-label={`Editar kit ${kit.tipo_mp} de ${kit.modelo}`} onClick={onEditar}><Pencil size={16} /></BotonTip>
            <BotonTip tip="Eliminar kit" className="btn btn--plain btn--icono btn-tip btn-tip--rojo" aria-label={`Eliminar kit ${kit.tipo_mp} de ${kit.modelo}`} onClick={onEliminar}><Trash2 size={16} /></BotonTip>
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div key="detalle" className="kt-kit__detalle" initial={reducir ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={reducir ? { opacity: 0 } : { height: 0, opacity: 0 }} transition={reducir ? { duration: 0 } : spring}>
            <div className="kt-tabla-wrap">
              <table className="kt-tabla">
                <thead>
                  <tr><th>#</th><th>Repuesto</th><th className="kt-der">Cantidad</th><th className="kt-der">Stock almacén</th><th className="kt-der">C. unit.</th><th className="kt-der">Total</th></tr>
                </thead>
                <tbody>
                  {lista.map((x, i) => (
                    <tr key={String(x.item.id)}>
                      <td className="kt-n">{i + 1}</td>
                      <td>
                        <span className="kt-nombre">{x.nombre}</span>
                        {x.codigo && <span className="kt-codigo">{x.codigo}</span>}
                      </td>
                      <td className="kt-der t-numeric">{cant(x.item.cantidad)} <small>{x.unidad}</small></td>
                      <td className="kt-der"><BadgeStock stock={x.stock} requerido={Number(x.item.cantidad) || 0} /></td>
                      <td className="kt-der t-numeric kt-suave">{Number(x.item.costo_unitario) > 0 ? formatSoles(Number(x.item.costo_unitario)) : '—'}</td>
                      <td className="kt-der t-numeric"><strong>{Number(x.item.costo_total) > 0 ? formatSoles(Number(x.item.costo_total)) : '—'}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5} className="kt-der">Total del kit</td><td className="kt-der t-numeric"><strong>{formatSoles(kit.costoTotal)}</strong></td></tr>
                </tfoot>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
