import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight, Layers } from 'lucide-react';
import { SearchField } from '../../core/ui/Field';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';

export interface NodoMarca { marca: string; kits: number; modelos: Array<{ modelo: string; kits: number }> }
export interface SeleccionKits { marca: string | null; modelo: string | null }

/**
 * Lista lateral de marcas. Cada marca se despliega y muestra sus modelos debajo (se expande y se contrae);
 * elegir la marca muestra todos sus kits y elegir un modelo muestra solo los de ese modelo.
 */
export function KitsArbol({ marcas, total, seleccion, onSeleccion, busqueda, onBusqueda }: {
  marcas: NodoMarca[];
  total: number;
  seleccion: SeleccionKits;
  onSeleccion: (s: SeleccionKits) => void;
  busqueda: string;
  onBusqueda: (v: string) => void;
}) {
  const reducir = useReducedMotion();
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  // Con una búsqueda activa se muestran abiertas las marcas que coinciden (así se ven sus modelos)
  const estaAbierta = (m: string) => !!busqueda.trim() || abiertas.has(m) || seleccion.marca === m;

  const alternar = (m: string) => setAbiertas(prev => {
    const n = new Set(prev);
    if (estaAbierta(m)) { n.delete(m); if (seleccion.marca === m && !busqueda.trim()) { /* se queda elegida pero cerrada */ } } else n.add(m);
    return n;
  });

  return (
    <aside className="kt-lado" aria-label="Marcas y modelos">
      <SearchField value={busqueda} onChange={onBusqueda} placeholder="Marca, modelo o ítem…" />
      <nav className="kt-arbol">
        <button type="button" className="kt-todos" aria-current={!seleccion.marca} onClick={() => { haptic('selection'); onSeleccion({ marca: null, modelo: null }); }}>
          <Layers size={16} aria-hidden /> <span>Todos los kits</span> <em>{total}</em>
        </button>

        {marcas.map(m => {
          const abierta = estaAbierta(m.marca);
          const marcaElegida = seleccion.marca === m.marca && !seleccion.modelo;
          return (
            <div key={m.marca} className="kt-marca">
              <div className={`kt-marca__fila${marcaElegida ? ' kt-marca__fila--sel' : ''}`}>
                <button type="button" className="kt-marca__flecha" aria-label={abierta ? `Contraer ${m.marca}` : `Expandir ${m.marca}`} aria-expanded={abierta}
                  onClick={() => { haptic('selection'); alternar(m.marca); }}>
                  <ChevronRight size={15} className={abierta ? 'kt-giro' : undefined} />
                </button>
                <button type="button" className="kt-marca__nombre" aria-current={marcaElegida}
                  onClick={() => { haptic('selection'); onSeleccion({ marca: m.marca, modelo: null }); setAbiertas(p => new Set(p).add(m.marca)); }}>
                  <span>{m.marca}</span><em>{m.kits}</em>
                </button>
              </div>
              <AnimatePresence initial={false}>
                {abierta && (
                  <motion.ul className="kt-modelos" key="modelos" initial={reducir ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={reducir ? { opacity: 0 } : { height: 0, opacity: 0 }} transition={reducir ? { duration: 0 } : spring}>
                    {m.modelos.map(x => {
                      const sel = seleccion.marca === m.marca && seleccion.modelo === x.modelo;
                      return (
                        <li key={x.modelo}>
                          <button type="button" className={`kt-modelo${sel ? ' kt-modelo--sel' : ''}`} aria-current={sel}
                            onClick={() => { haptic('selection'); onSeleccion({ marca: m.marca, modelo: x.modelo }); }}>
                            <span>{x.modelo}</span><em>{x.kits}</em>
                          </button>
                        </li>
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {marcas.length === 0 && <p className="kt-vacio-lado">Ninguna marca coincide.</p>}
      </nav>
    </aside>
  );
}
