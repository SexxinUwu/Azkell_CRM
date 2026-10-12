import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { animate, motion, useMotionValue, useReducedMotion, type MotionValue, type Transition } from 'motion/react';
import { Ellipsis, type LucideIcon } from 'lucide-react';
import { spring, springMomentum, springSnappy } from '../lib/motion';
import { haptic } from '../lib/haptics';

export interface TabSlot {
  key: string;
  label: string;
  icon: LucideIcon;
  to?: string; // sin destino = "Más"
}

interface TabBarProps {
  tabs: TabSlot[];
  activeIndex: number; // la última posición es "Más"
  onMore: () => void;
}

const PAD = 4; // separación entre la lente y el borde de la cápsula (px)
const DRAG_SLOP = 8; // movimiento mínimo antes de considerar que es un arrastre (skill §10)

/**
 * Pestañas flotantes Liquid Glass (iOS 26).
 * - Al tocar: la lente de vidrio salta bajo el dedo y se agranda (respuesta en pointer-down).
 * - Al deslizar: la lente sigue al dedo 1:1 y se puede recorrer la barra entera.
 * - Al soltar: se navega a la pestaña bajo el dedo y la lente encaja con el impulso del gesto.
 * Teclado y lectores de pantalla siguen usando los enlaces normales.
 */
export function TabBar({ tabs, activeIndex, onMore }: TabBarProps) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  // "Reducir movimiento": la lente cambia de lugar sin deslizarse ni agrandarse (skill §14)
  const move = (v: MotionValue<number>, to: number, options: Transition) => (reduceMotion ? v.set(to) : animate(v, to, options));
  const barRef = useRef<HTMLElement>(null);
  const [slotW, setSlotW] = useState(0);
  const [pressedIndex, setPressedIndex] = useState<number | null>(null);
  const x = useMotionValue(0);
  const scale = useMotionValue(1);
  const gesture = useRef<{ startX: number; dragging: boolean; index: number; left: number } | null>(null);
  const lastPointerUp = useRef(0);
  const slots: TabSlot[] = [...tabs, { key: 'more', label: 'Más', icon: Ellipsis }];

  // Ancho de cada posición (cambia con la rotación o el tamaño de texto)
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => setSlotW((el.clientWidth - PAD * 2) / slots.length);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [slots.length]);

  // La lente acompaña a la ruta activa (salvo mientras el dedo la controla)
  const placed = useRef(false);
  useLayoutEffect(() => {
    if (!slotW || gesture.current) return;
    const target = activeIndex * slotW;
    if (!placed.current) {
      x.set(target);
      placed.current = true;
    } else {
      move(x, target, spring);
    }
  }, [activeIndex, slotW, x]); // eslint-disable-line react-hooks/exhaustive-deps

  const indexAt = (clientX: number, left: number) =>
    Math.max(0, Math.min(slots.length - 1, Math.floor((clientX - left - PAD) / slotW)));

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0 || !slotW) return;
    const left = barRef.current!.getBoundingClientRect().left;
    const index = indexAt(e.clientX, left);
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { startX: e.clientX, dragging: false, index, left };
    setPressedIndex(index);
    move(x, index * slotW, springSnappy);
    if (!reduceMotion) animate(scale, 1.12, springSnappy);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g) return;
    if (!g.dragging) {
      if (Math.abs(e.clientX - g.startX) < DRAG_SLOP) return;
      g.dragging = true;
      x.stop(); // desde aquí manda el dedo, no el resorte
    }
    // 1:1 con el dedo, centrada bajo él, con resistencia suave en los extremos (§9)
    const max = (slots.length - 1) * slotW;
    const raw = e.clientX - g.left - PAD - slotW / 2;
    const over = raw < 0 ? raw : raw > max ? raw - max : 0;
    x.set(Math.max(0, Math.min(max, raw)) + rubberband(over, slotW));
    const index = indexAt(e.clientX, g.left);
    if (index !== g.index) {
      g.index = index;
      setPressedIndex(index);
      haptic('selection');
    }
  }

  function finish(commit: boolean) {
    const g = gesture.current;
    gesture.current = null;
    setPressedIndex(null);
    move(scale, 1, spring);
    if (!g) return;
    const index = commit ? g.index : activeIndex;
    // Tras arrastrar, la lente encaja conservando la velocidad del dedo (§5)
    move(x, index * slotW, g.dragging ? { ...springMomentum, velocity: x.getVelocity() } : spring);
    if (!commit) return;
    lastPointerUp.current = performance.now();
    const slot = slots[index];
    if (slot.to) navigate(slot.to);
    else onMore();
  }

  return (
    <nav
      ref={barRef}
      className="tabbar"
      aria-label="Pestañas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
      // Táctil: el navegador dispara un clic "fantasma" al soltar, en el mismo punto. Si la pestaña abrió
      // una hoja, ese clic caería sobre su fondo y la cerraría. La barra ya actuó en pointer-up: se anula.
      onTouchEnd={e => { if (e.cancelable) e.preventDefault(); }}
      // El toque ya navegó en pointer-up: se descarta el clic que el navegador dispara después.
      onClickCapture={e => {
        if (performance.now() - lastPointerUp.current < 600) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {slotW > 0 && (
        <motion.span
          className="tabbar__lens"
          data-pressed={pressedIndex !== null || undefined}
          style={{ x, scale, width: slotW, left: PAD }}
          aria-hidden
        />
      )}
      {slots.map((slot, i) => {
        const lit = pressedIndex !== null ? pressedIndex === i : activeIndex === i;
        const content = (
          <>
            <slot.icon size={22} strokeWidth={lit ? 2.1 : 1.8} />
            <span>{slot.label}</span>
          </>
        );
        return slot.to ? (
          <NavLink key={slot.key} to={slot.to} end={slot.to === '/'} className="tab" data-lit={lit || undefined} draggable={false}>
            {content}
          </NavLink>
        ) : (
          <button key={slot.key} type="button" className="tab" data-lit={lit || undefined} onClick={onMore}
            aria-current={activeIndex === i ? 'page' : undefined}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}

// Resistencia progresiva al pasar el borde (Designing Fluid Interfaces)
function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  if (!overshoot || !dimension) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
