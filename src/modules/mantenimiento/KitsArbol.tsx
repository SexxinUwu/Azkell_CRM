import { useEffect, useState } from 'react';
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
  // Una sola marca abierta a la vez (como un acordeón): al abrir otra, la anterior se cierra
  // undefined = automático: con una búsqueda que deja una sola marca, se abre para ver sus modelos; cualquier toque fija la elección
  const [abierta, setAbierta] = useState<string | null | undefined>(seleccion.marca ?? undefined);
  const unicaPorBusqueda = busqueda.trim() && marcas.length === 1 ? marcas[0].marca : null;
  const estaAbierta = (m: string) => (abierta === undefined ? unicaPorBusqueda === m : abierta === m);
  // Al cambiar el texto de búsqueda vuelve el modo automático
  useEffect(() => { if (busqueda.trim()) setAbierta(undefined); }, [busqueda]);

  return (
    <aside className="kt-lado" aria-label="Marcas y modelos">
      <SearchField value={busqueda} onChange={onBusqueda} placeholder="Marca, modelo o ítem…" />
      <nav className="kt-arbol">
        <button type="button" className="kt-todos" aria-current={!seleccion.marca} onClick={() => { haptic('selection'); setAbierta(null); onSeleccion({ marca: null, modelo: null }); }}>
          <Layers size={16} aria-hidden /> <span>Todos los kits</span> <em>{total}</em>
        </button>

        {marcas.map(m => {
          const abierta = estaAbierta(m.marca);
          const marcaElegida = seleccion.marca === m.marca && !seleccion.modelo;
          return (
            <div key={m.marca} className="kt-marca">
              <div className={`kt-marca__fila${marcaElegida ? ' kt-marca__fila--sel' : ''}`}>
                <button type="button" className="kt-marca__flecha" aria-label={abierta ? `Contraer ${m.marca}` : `Expandir ${m.marca}`} aria-expanded={abierta}
                  onClick={() => { haptic('selection'); setAbierta(estaAbierta(m.marca) ? null : m.marca); }}>
                  <ChevronRight size={15} className={abierta ? 'kt-giro' : undefined} />
                </button>
                <button type="button" className="kt-marca__nombre" aria-current={marcaElegida}
                  onClick={() => { haptic('selection'); onSeleccion({ marca: m.marca, modelo: null }); setAbierta(m.marca); }}>
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
