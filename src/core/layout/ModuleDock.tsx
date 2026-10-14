import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { springSnappy } from '../lib/motion';
import { haptic } from '../lib/haptics';

export interface DockItem {
  key: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: () => void;
}

/**
 * Barra inferior del celular: un botón por módulo, con su nombre, y "Ajustes" al final.
 * Se desliza en horizontal cuando los módulos no caben; el activo se centra solo.
 * Tocar un módulo abre su lista de pantallas (la decide quien usa la barra).
 */
export function ModuleDock({ items }: { items: DockItem[] }) {
  const reduce = useReducedMotion();
  const riel = useRef<HTMLDivElement>(null);
  const activo = items.find(i => i.active)?.key;

  // Mantiene visible el módulo activo (al abrir la app o al navegar)
  useEffect(() => {
    const el = riel.current?.querySelector<HTMLElement>('[data-activo="true"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [activo, reduce]);

  return (
    <nav className="dock" aria-label="Módulos">
      <div className="dock__riel" ref={riel}>
        {items.map(it => (
          <button key={it.key} type="button" className="dock__item" data-activo={it.active}
            aria-current={it.active ? 'page' : undefined}
            onClick={() => { haptic('selection'); it.onSelect(); }}>
            {it.active && (
              <motion.span layoutId="dock-pill" className="dock__pill" transition={reduce ? { duration: 0 } : springSnappy} aria-hidden />
            )}
            <it.icon size={21} strokeWidth={it.active ? 2.1 : 1.8} />
            <span>{it.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
