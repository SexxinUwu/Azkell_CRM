import { useEffect } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';

// Número que cuenta hasta su valor al aparecer y al cambiar (cifras de resumen).
// Con "Reducir movimiento" muestra el valor directamente.
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const texto = useTransform(mv, v => Math.round(v).toLocaleString('es-PE'));

  useEffect(() => {
    if (reduce) { mv.set(value); return; }
    const control = animate(mv, value, { type: 'spring', bounce: 0, duration: 0.9 });
    return () => control.stop();
  }, [value, reduce, mv]);

  return <motion.span className={className}>{texto}</motion.span>;
}
