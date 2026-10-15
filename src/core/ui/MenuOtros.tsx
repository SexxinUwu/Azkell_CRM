import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Ellipsis } from 'lucide-react';
import { springSnappy } from '../lib/motion';
import { haptic } from '../lib/haptics';

export interface OpcionOtros {
  label: string;
  icon?: ReactNode;
  /** Explicación corta debajo del nombre */
  detalle?: string;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
  destructiva?: boolean;
  /** Empieza un grupo nuevo (línea separadora arriba) */
  separado?: boolean;
}

/**
 * Casilla "Otros": junta las acciones secundarias de una pantalla (importar, exportar,
 * imprimir, versión actual…) para que el encabezado solo muestre la acción principal.
 * Menú contextual estilo iOS: crece desde el botón, Escape o un toque afuera lo cierran,
 * flechas para moverse entre opciones.
 */
export function MenuOtros({ opciones, label = 'Otros', soloIcono }: { opciones: Array<OpcionOtros | false | null | undefined>; label?: string; soloIcono?: boolean }) {
  const visibles = opciones.filter((o): o is OpcionOtros => !!o);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; origen: string } | null>(null);
  const reduce = useReducedMotion();
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    // El menú vive en <body>: un toque dentro del menú no cuenta como toque afuera
    const fuera = (e: PointerEvent) => { const t = e.target as Node; if (!raiz.current?.contains(t) && !menu.current?.contains(t)) setAbierto(false); };
    // Al desplazarse, el menú se cierra (está fijo sobre la pantalla, no sigue al botón)
    const alMover = () => setAbierto(false);
    document.addEventListener('scroll', alMover, { capture: true, passive: true });
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setAbierto(false); boton.current?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    requestAnimationFrame(() => menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus());
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
      document.removeEventListener('scroll', alMover, { capture: true });
    };
  }, [abierto]);

  // Posición del menú medida contra el botón: si el botón está en el borde, el menú entra completo en la pantalla
  useLayoutEffect(() => {
    const b = boton.current?.getBoundingClientRect();
    const m = menu.current;
    if (!abierto || !b || !m) { setPos(null); return; }
    const margen = 12;
    const left = Math.min(Math.max(b.left, margen), window.innerWidth - m.offsetWidth - margen);
    setPos({ top: b.bottom + 8, left, origen: left < b.left ? 'top right' : 'top left' });
  }, [abierto]);

  if (!visibles.length) return null;

  async function elegir(o: OpcionOtros, i: number) {
    haptic('selection');
    setOcupado(i);
    try { await o.onSelect(); } finally { setOcupado(null); setAbierto(false); }
  }

  return (
    <div className="otros" ref={raiz}>
      <button
        ref={boton}
        type="button"
        className={`btn btn--secondary${soloIcono ? ' btn--icon' : ''}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={id}
        aria-label={soloIcono ? label : undefined}
        onClick={() => { setAbierto(a => !a); haptic('selection'); }}
      >
        <Ellipsis size={16} />
        {!soloIcono && label}
      </button>
      {createPortal(<AnimatePresence>
        {abierto && (
          <motion.div
            ref={menu}
            id={id}
            role="menu"
            aria-label={label}
            className="otros__menu"
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, transformOrigin: pos?.origen }}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.92, y: reduce ? 0 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
            transition={springSnappy}
          >
            {visibles.map((o, i) => (
              <button
                key={o.label}
                type="button"
                role="menuitem"
                className={`otros__item${o.destructiva ? ' otros__item--destructiva' : ''}${o.separado && i > 0 ? ' otros__item--separado' : ''}`}
                disabled={o.disabled || ocupado !== null}
                onClick={() => elegir(o, i)}
              >
                <span className="otros__texto">
                  <span className="otros__label">{o.label}</span>
                  {o.detalle && <span className="otros__detalle">{o.detalle}</span>}
                </span>
                <span className="otros__icono" aria-hidden>{ocupado === i ? <span className="spinner" /> : o.icon}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </div>
  );
}
