import './menu-fila.css';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Ellipsis } from 'lucide-react';
import { haptic } from '../lib/haptics';

export interface AccionMenu {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructiva?: boolean;
  /** Línea separadora antes de esta opción */
  separada?: boolean;
}

const ANCHO = 232;
const SEPARACION = 6;

/**
 * Tres puntos de una fila: abre un menú flotante (por encima de la tabla, no se corta con su scroll) con el nombre de cada acción.
 * Nace del botón que lo abrió (origen de la animación), se cierra con Escape, al tocar fuera o al desplazar,
 * y se recorre con las flechas del teclado. Si abajo no hay lugar, se abre hacia arriba.
 */
export function MenuFila({ acciones, etiqueta = 'Acciones', deshabilitado }: { acciones: Array<AccionMenu | false | null | undefined>; etiqueta?: string; deshabilitado?: boolean }) {
  const lista = acciones.filter((a): a is AccionMenu => !!a);
  const reducir = useReducedMotion();
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arriba: boolean } | null>(null);

  const cerrar = useCallback(() => { setPos(null); boton.current?.focus({ preventScroll: true }); }, []);

  function abrir() {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    haptic('selection');
    const alto = lista.length * 40 + 16;
    const arriba = r.bottom + SEPARACION + alto > window.innerHeight - 8 && r.top - SEPARACION - alto > 8;
    const left = Math.max(8, Math.min(window.innerWidth - ANCHO - 8, r.right - ANCHO));
    setPos({ left, top: arriba ? r.top - SEPARACION : r.bottom + SEPARACION, arriba });
  }

  // Cierre: fuera, Escape, scroll o cambio de tamaño
  useEffect(() => {
    if (!pos) return;
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !boton.current?.contains(t)) setPos(null);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    };
    const cierra = () => setPos(null);
    document.addEventListener('pointerdown', fuera, true);
    document.addEventListener('keydown', tecla, true);
    window.addEventListener('resize', cierra);
    window.addEventListener('scroll', cierra, true);
    return () => {
      document.removeEventListener('pointerdown', fuera, true);
      document.removeEventListener('keydown', tecla, true);
      window.removeEventListener('resize', cierra);
      window.removeEventListener('scroll', cierra, true);
    };
  }, [pos, cerrar]);

  // Al abrir, el foco pasa a la primera opción
  useLayoutEffect(() => {
    if (pos) panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [pos]);

  if (!lista.length) return null;

  return (
    <>
      <button ref={boton} type="button" className={`menu-fila__boton${pos ? ' menu-fila__boton--abierto' : ''}`} aria-label={etiqueta} aria-haspopup="menu" aria-expanded={!!pos}
        disabled={deshabilitado} onClick={e => { e.stopPropagation(); if (pos) cerrar(); else abrir(); }}>
        <Ellipsis size={18} />
      </button>
      {createPortal(
        <AnimatePresence>
          {pos && (
            <motion.div
              ref={panel}
              role="menu"
              aria-label={etiqueta}
              className="menu-fila"
              style={{ left: pos.left, top: pos.top, width: ANCHO, transformOrigin: `right ${pos.arriba ? 'bottom' : 'top'}`, translate: pos.arriba ? '0 -100%' : undefined }}
              initial={reducir ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
              animate={reducir ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reducir ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
            >
              {lista.map(a => (
                <div key={a.label} role="none">
                  {a.separada && <div className="menu-fila__sep" role="separator" />}
                  <button type="button" role="menuitem" className={`menu-fila__item${a.destructiva ? ' menu-fila__item--peligro' : ''}`} disabled={a.disabled}
                    onClick={() => { setPos(null); a.onSelect(); }}>
                    <span className="menu-fila__icono" aria-hidden>{a.icon}</span>
                    <span>{a.label}</span>
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
