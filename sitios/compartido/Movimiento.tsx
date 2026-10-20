import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AnimatePresence, animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform,
} from 'motion/react';

// Piezas de movimiento compartidas por los dos sitios. Solo transform y opacity.
// Tiempos de interfaz (skill apple-design): resortes de ~0.3 s sin rebote; nada espera a otra cosa.
// Con "reducir movimiento" quedan en un cambio de opacidad (MotionConfig reducedMotion="user" en main.tsx).

export const suave = [0.22, 1, 0.36, 1] as const;
/** Movimiento estándar: crítico (sin rebote), respuesta ~0.3 s */
export const resorte = { type: 'spring', bounce: 0, duration: 0.32 } as const;
/** Controles pequeños (pastillas, botones): ~0.22 s */
export const resorteRapido = { type: 'spring', bounce: 0, duration: 0.22 } as const;

/** Aparece al entrar en pantalla: sube un poco y se aclara (≈0.4 s) */
export function Revelar({ children, retraso = 0, y = 16, className, style }: {
  children: ReactNode; retraso?: number; y?: number; className?: string; style?: CSSProperties;
}) {
  return (
    <motion.div className={className} style={style}
      initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }} transition={{ ...resorte, duration: 0.4, delay: Math.min(retraso * 0.3, 0.1) }}>
      {children}
    </motion.div>
  );
}

/** Texto que entra palabra por palabra desde una máscara (toda la frase en ≈0.45 s) */
export function Palabras({ texto, className, retraso = 0, alCargar = false }: {
  texto: string; className?: string; retraso?: number; alCargar?: boolean;
}) {
  const palabras = texto.split(' ');
  const animacion = alCargar ? { animate: 'visible' } : { whileInView: 'visible', viewport: { once: true, margin: '-40px' } };
  return (
    <motion.span className={className} initial="oculto" {...animacion} aria-label={texto}
      transition={{ staggerChildren: 0.022, delayChildren: Math.min(retraso * 0.3, 0.06) }} style={{ display: 'inline' }}>
      {palabras.map((p, i) => (
        <span key={i} aria-hidden style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.12em', marginBottom: '-0.12em' }}>
          <motion.span style={{ display: 'inline-block' }}
            variants={{ oculto: { y: '105%', opacity: 0 }, visible: { y: '0%', opacity: 1, transition: { ...resorte, duration: 0.36 } } }}>
            {p}{i < palabras.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/** Palabra que va cambiando (deslizamiento vertical de 0.3 s) */
export function Rotar({ palabras, cada = 2600 }: { palabras: string[]; cada?: number }) {
  const [i, setI] = useState(0);
  const reducir = useReducedMotion();
  useEffect(() => {
    if (reducir) return;
    const t = setInterval(() => setI(v => (v + 1) % palabras.length), cada);
    return () => clearInterval(t);
  }, [palabras.length, cada, reducir]);
  return (
    <span style={{ display: 'inline-grid', verticalAlign: 'top', overflow: 'hidden', height: '1.3em', marginBottom: '-0.18em' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={palabras[i]} className="degradado" style={{ display: 'block', whiteSpace: 'nowrap' }}
          initial={{ y: '100%', opacity: 0 }} animate={{ y: '0%', opacity: 1 }} exit={{ y: '-100%', opacity: 0 }} transition={resorte}>
          {palabras[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Cifra que sube hasta su valor al aparecer (≈0.9 s) */
export function Contador({ hasta, prefijo = '', sufijo = '' }: { hasta: number; prefijo?: string; sufijo?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true, margin: '-20px' });
  const valor = useMotionValue(0);
  const texto = useTransform(valor, v => `${prefijo}${Math.round(v).toLocaleString('es-PE')}${sufijo}`);
  useEffect(() => {
    if (!visible) return;
    const c = animate(valor, hasta, { duration: 0.9, ease: suave });
    return () => c.stop();
  }, [visible, hasta, valor]);
  return <motion.span ref={ref}>{texto}</motion.span>;
}

/** Tarjeta que se inclina un poco hacia el puntero, con brillo que lo sigue (resortes rápidos) */
export function Inclinar({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(0, { stiffness: 420, damping: 32 });
  const ry = useSpring(0, { stiffness: 420, damping: 32 });
  const reducir = useReducedMotion();
  return (
    <motion.div ref={ref} className={`tarjeta ${className}`} style={{ rotateX: rx, rotateY: ry }}
      onPointerMove={e => {
        if (e.pointerType === 'touch') return;
        const r = ref.current!.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        ref.current!.style.setProperty('--px', `${px * 100}%`);
        ref.current!.style.setProperty('--py', `${py * 100}%`);
        if (!reducir) { rx.set((0.5 - py) * 6); ry.set((px - 0.5) * 8); }
      }}
      onPointerLeave={() => { rx.set(0); ry.set(0); }}>
      {children}
    </motion.div>
  );
}

/** Botón magnético: se acerca un poco al puntero y se hunde al pulsar */
export function Iman({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const x = useSpring(0, { stiffness: 450, damping: 28 });
  const y = useSpring(0, { stiffness: 450, damping: 28 });
  const reducir = useReducedMotion();
  return (
    <motion.span ref={ref} style={{ x, y, display: 'inline-block' }}
      onPointerMove={e => {
        if (reducir || e.pointerType === 'touch') return;
        const r = ref.current!.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * 0.18);
        y.set((e.clientY - (r.top + r.height / 2)) * 0.22);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
      whileTap={{ scale: 0.97 }} transition={resorteRapido}>
      {children}
    </motion.span>
  );
}

/** Barra de avance de la lectura, arriba de la página */
export function ProgresoScroll() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 300, damping: 40, restDelta: 0.001 });
  return <motion.div className="progreso" style={{ scaleX }} aria-hidden />;
}

/** Banda que se desplaza sola (se pausa al pasar el puntero) */
export function Marquesina({ items }: { items: string[] }) {
  const doble = [...items, ...items];
  return (
    <div className="marquesina" aria-hidden>
      <div className="marquesina__pista">
        {doble.map((t, i) => <span className="chip" key={i}>{t}</span>)}
      </div>
    </div>
  );
}
