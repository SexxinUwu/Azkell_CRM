import { useId, useRef, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { springSnappy } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';

export type TabFicha = 'general' | 'neumaticos' | 'inspecciones';

interface PlfTabsProps {
  tabs: Array<{ id: TabFicha; label: string }>;
  value: TabFicha;
  onChange: (id: TabFicha) => void;
}

// Pestañas de la ficha. Se desplazan en horizontal (celular) sin cortar el texto.
// Teclado: flechas izquierda/derecha mueven el foco y la pestaña (patrón tablist).
export function PlfTabs({ tabs, value, onChange }: PlfTabsProps) {
  const layoutId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function mover(indice: number) {
    const siguiente = tabs[(indice + tabs.length) % tabs.length];
    if (!siguiente) return;
    refs.current[(indice + tabs.length) % tabs.length]?.focus();
    if (siguiente.id !== value) {
      haptic('selection');
      onChange(siguiente.id);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, indice: number) {
    if (e.key === 'ArrowRight') { e.preventDefault(); mover(indice + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); mover(indice - 1); }
    else if (e.key === 'Home') { e.preventDefault(); mover(0); }
    else if (e.key === 'End') { e.preventDefault(); mover(tabs.length - 1); }
  }

  return (
    <div className="plf-tabs" role="tablist" aria-label="Secciones de la unidad">
      {tabs.map((t, i) => {
        const activa = t.id === value;
        return (
          <button
            key={t.id}
            ref={el => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`plf-tab-${t.id}`}
            aria-selected={activa}
            aria-controls={`plf-panel-${t.id}`}
            tabIndex={activa ? 0 : -1}
            className={`plf-tabs__item${activa ? ' plf-tabs__item--activa' : ''}`}
            onClick={() => {
              if (!activa) {
                haptic('selection');
                onChange(t.id);
              }
            }}
            onKeyDown={e => onKeyDown(e, i)}
          >
            {activa && <motion.span layoutId={layoutId} className="plf-tabs__pastilla" transition={springSnappy} aria-hidden />}
            <span className="plf-tabs__texto">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
