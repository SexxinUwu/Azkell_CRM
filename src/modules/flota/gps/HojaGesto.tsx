// Hoja inferior del celular que sigue al dedo (skill apple-design §2 a §6):
// - se mueve 1:1 con el dedo desde el asa o la cabecera, y se puede agarrar a mitad de camino;
// - al soltar proyecta el impulso (project) y se asienta con resorte, con rebote leve solo si hubo lanzamiento;
// - más allá de sus límites ofrece resistencia (dragElastic), no un tope seco;
// - con "reducir movimiento" se asienta sin resorte.
// En escritorio no hay gesto: es un panel lateral normal.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as PointerReact } from 'react';
import { animate, motion, useDragControls, useMotionValue, useReducedMotion } from 'motion/react';
import { project } from '../../../core/lib/motion';
import { useMediaQuery } from '../../../core/lib/useMediaQuery';
import { haptic } from '../../../core/lib/haptics';

interface Ctx { iniciar: (e: PointerReact) => void; alternar: () => void; movil: boolean }
const HojaCtx = createContext<Ctx>({ iniciar: () => {}, alternar: () => {}, movil: false });

/** Asa de la hoja: se arrastra o se toca (alterna entre la altura menor y la mayor) */
export function AsaHoja() {
  const { iniciar, alternar, movil } = useContext(HojaCtx);
  const movido = useRef(false);
  return (
    <button type="button" className="tg-grab" aria-label="Expandir o plegar"
      onPointerDown={e => { movido.current = false; e.stopPropagation(); iniciar(e); }}
      onPointerMove={() => { movido.current = true; }}
      onClick={() => { if (!movido.current || !movil) alternar(); movido.current = false; }} />
  );
}

/** Zona que también arrastra la hoja (cabecera): un toque normal sigue siendo un toque */
export function ZonaArrastre({ className, children }: { className?: string; children: ReactNode }) {
  const { iniciar } = useContext(HojaCtx);
  return <div className={className} onPointerDown={iniciar}>{children}</div>;
}

interface Props {
  className: string;
  label: string;
  /** Alturas visibles (px), de menor a mayor, según el alto de la ventana en px (vh = innerHeight / 100) */
  snaps: (vh: number) => number[];
  /** Alto total de la hoja (px) */
  alto: (vh: number) => number;
  /** Altura activa (índice en snaps); -1 = oculta */
  snap: number;
  onSnap: (i: number) => void;
  children: ReactNode;
}

const FUERA = 160; // px extra para dejarla fuera de la pantalla (por debajo de la barra de módulos)

export function HojaGesto({ className, label, snaps, alto, snap, onSnap, children }: Props) {
  const movil = useMediaQuery('(max-width: 900px)');
  const reducir = !!useReducedMotion();
  const controls = useDragControls();
  const [vh, setVh] = useState(() => (typeof innerHeight === 'number' ? innerHeight / 100 : 8));
  useEffect(() => {
    const f = () => setVh(innerHeight / 100);
    addEventListener('resize', f);
    return () => removeEventListener('resize', f);
  }, []);
  const H = alto(vh);
  const S = useMemo(() => snaps(vh), [snaps, vh]);
  const T = useMemo(() => S.map(v => H - v), [S, H]);   // desplazamiento (px) de cada altura visible
  const oculto = H + FUERA;
  const destino = snap < 0 ? oculto : T[Math.min(snap, T.length - 1)];
  const y = useMotionValue(oculto);
  const arrastrando = useRef(false);
  const fijar = (a: number, extra?: { velocity?: number; bounce?: number }) => {
    if (reducir) { y.set(a); return; }
    animate(y, a, { type: 'spring', bounce: extra?.bounce ?? 0, duration: 0.4, velocity: extra?.velocity ?? 0 });
  };
  // Cambios que vienen de fuera (elegir una unidad, abrir el buscador, cámara piloto): se asienta desde donde está
  useEffect(() => { if (movil && !arrastrando.current) fijar(destino); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [destino, movil, reducir]);

  const ctx = useMemo<Ctx>(() => ({
    movil,
    iniciar: e => { if (movil && snap >= 0) controls.start(e); },
    alternar: () => { if (snap < 0) return; haptic('selection'); onSnap(snap >= S.length - 1 ? 0 : S.length - 1); },
  }), [movil, snap, controls, onSnap, S.length]);

  if (!movil) return <aside className={className} aria-label={label}><HojaCtx.Provider value={ctx}>{children}</HojaCtx.Provider></aside>;

  return (
    <HojaCtx.Provider value={ctx}>
      <motion.aside className={className} aria-label={label} style={{ y, height: H }}
        drag={snap >= 0 ? 'y' : false} dragControls={controls} dragListener={false} dragMomentum={false}
        dragConstraints={{ top: T[T.length - 1], bottom: T[0] }} dragElastic={{ top: 0.08, bottom: 0.08 }}
        onDragStart={() => { arrastrando.current = true; }}
        onDragEnd={(_, info) => {
          arrastrando.current = false;
          const v = info.velocity.y;
          const lanzado = Math.abs(v) > 500;
          // A dónde llegaría con el impulso del dedo (project) y a qué altura queda más cerca
          const objetivo = y.get() + (Math.abs(v) > 120 ? project(v) : 0);
          let mejor = 0;
          T.forEach((t, i) => { if (Math.abs(t - objetivo) < Math.abs(T[mejor] - objetivo)) mejor = i; });
          fijar(T[mejor], { velocity: v, bounce: lanzado ? 0.15 : 0 });
          if (mejor !== snap) { haptic('selection'); onSnap(mejor); }
        }}
        exit={{ y: oculto, transition: reducir ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.35 } }}>
        {children}
      </motion.aside>
    </HojaCtx.Provider>
  );
}
