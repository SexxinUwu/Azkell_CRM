import { motion, useReducedMotion } from 'motion/react';
import { springSnappy } from '../lib/motion';

/**
 * Ojo animado para mostrar u ocultar la contraseña.
 * Al cambiar, el ojo parpadea y la línea que lo tacha se dibuja o se borra.
 * `visible`: la contraseña se está mostrando (el ícono ofrece ocultarla: ojo tachado).
 */
export function EyeIcon({ visible, size = 20 }: { visible: boolean; size?: number }) {
  const reduce = useReducedMotion();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* key: el parpadeo se repite en cada cambio */}
      <motion.g
        key={String(visible)}
        style={{ originX: '12px', originY: '12px' }}
        initial={reduce ? false : { scaleY: 0.12 }}
        animate={{ scaleY: 1 }}
        transition={{ type: 'spring', bounce: 0.35, duration: 0.32 }}
      >
        <path d="M2.4 12s3.6-6.6 9.6-6.6 9.6 6.6 9.6 6.6-3.6 6.6-9.6 6.6S2.4 12 2.4 12Z" />
        <motion.circle cx="12" cy="12" r="3" initial={false} animate={{ scale: visible ? 0.72 : 1 }} transition={springSnappy} />
      </motion.g>
      <motion.path
        d="M4 4 20 20"
        initial={false}
        animate={{ pathLength: visible ? 1 : 0, opacity: visible ? 1 : 0 }}
        transition={springSnappy}
      />
    </svg>
  );
}
