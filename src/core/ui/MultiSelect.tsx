import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { springSnappy } from '../lib/motion';
import { haptic } from '../lib/haptics';

/**
 * Selección múltiple en una casilla desplegable: ocupa una sola fila aunque haya decenas de
 * opciones. Con búsqueda interna, "Limpiar" y contador de seleccionadas.
 */
export function MultiSelect({ label, options, value, onChange, placeholder = 'Todas' }: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const reduce = useReducedMotion();
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  const visibles = useMemo(() => {
    const n = q.trim().toUpperCase();
    return n ? options.filter(o => o.toUpperCase().includes(n)) : options;
  }, [options, q]);

  const alternar = (o: string) => {
    haptic('selection');
    onChange(value.includes(o) ? value.filter(v => v !== o) : [...value, o]);
  };

  const resumen = value.length === 0 ? placeholder
    : value.length <= 2 ? value.join(', ') : `${value.length} seleccionadas`;

  return (
    <div className="msel" ref={raiz}>
      <button type="button" className={`msel__boton${value.length ? ' msel__boton--activo' : ''}`}
        aria-haspopup="listbox" aria-expanded={abierto} aria-controls={id}
        onClick={() => { setAbierto(a => !a); haptic('selection'); }}>
        <span className="msel__etiqueta">{label}</span>
        <span className="msel__valor">{resumen}</span>
        <ChevronDown size={15} className={`msel__flecha${abierto ? ' msel__flecha--abierta' : ''}`} />
      </button>
      <AnimatePresence>
        {abierto && (
          <motion.div id={id} className="msel__panel"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.96, y: reduce ? 0 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={springSnappy}>
            {options.length > 8 && (
              <label className="msel__buscar">
                <Search size={14} />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Buscar ${label.toLowerCase()}`} autoFocus />
              </label>
            )}
            <div className="msel__lista" role="listbox" aria-multiselectable="true" aria-label={label}>
              {visibles.length === 0 && <p className="msel__vacio">Sin coincidencias</p>}
              {visibles.map(o => {
                const sel = value.includes(o);
                return (
                  <button key={o} type="button" role="option" aria-selected={sel}
                    className={`msel__opcion${sel ? ' msel__opcion--sel' : ''}`} onClick={() => alternar(o)}>
                    <span className="msel__check">{sel && <Check size={12} strokeWidth={3} />}</span>
                    {o}
                  </button>
                );
              })}
            </div>
            {value.length > 0 && (
              <button type="button" className="msel__limpiar" onClick={() => onChange([])}>
                Limpiar ({value.length})
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
