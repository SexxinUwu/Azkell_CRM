// Resortes de la casa (skill apple-design §4).
// Por defecto: críticamente amortiguado, sin rebote. Rebote solo tras un gesto con impulso.
import type { Transition } from 'motion/react';

/** Movimiento estándar de interfaz (damping 1.0, response ~0.4s) */
export const spring: Transition = { type: 'spring', bounce: 0, duration: 0.4 };

/** Controles pequeños: interruptores, segmentados (response ~0.3s) */
export const springSnappy: Transition = { type: 'spring', bounce: 0, duration: 0.3 };

/** Solo después de arrastrar/lanzar (damping ~0.8) */
export const springMomentum: Transition = { type: 'spring', bounce: 0.2, duration: 0.4 };

/**
 * Proyección de impulso de Apple (Designing Fluid Interfaces):
 * a dónde llegaría el gesto si siguiera desacelerando como un scroll.
 */
export function project(velocityPxPerSec: number, decelerationRate = 0.998) {
  return ((velocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}
