import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { haptic } from '../../core/lib/haptics';
import { LOGO_URL } from '../../core/layout/BrandMark';
import { endWelcome, useWelcome, type WelcomeState } from './welcome';
import { LiteSplash } from './LiteSplash';
import './welcome.css';

const REVEAL_AT = 1250;    // ms: el ícono se abre sobre la pantalla principal
const REVEAL_MS = 450;
const ease = [0.25, 1, 0.5, 1] as const;

// Bienvenida tras iniciar sesión: la tarjeta del login se vuelve el ícono de la empresa (su logo
// sobre una placa blanca), un trazo recorre el borde, un brillo cruza el logo y el ícono se abre
// sobre la pantalla principal.
//
// Es la misma animación en web y en celular. Solo mueve transform y opacity (compositor) y el
// ícono se centra con CSS: no depende de medir la pantalla con JS, así que no se desfasa con la
// barra del navegador ni con el teclado. La tarjeta se mide una sola vez, ya montada, y el viaje
// desde el login se calcula como diferencia de posición y tamaño (técnica FLIP).
export function WelcomeTransition() {
  const welcome = useWelcome();
  const reduce = useReducedMotion();
  if (!welcome) return null;
  return createPortal(
    reduce ? <WelcomeReducida key={welcome.id} name={welcome.name} /> : <WelcomeOverlay key={welcome.id} {...welcome} />,
    document.body,
  );
}

// "Reducir movimiento": el ícono aparece y se desvanece, sin desplazamientos
function WelcomeReducida({ name }: { name: string }) {
  const [saliendo, setSaliendo] = useState(false);
  useEffect(() => {
    haptic('success');
    const a = setTimeout(() => setSaliendo(true), 700);
    const b = setTimeout(endWelcome, 960);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  return <LiteSplash saludo={`Hola, ${name}`} etiqueta={`Bienvenido, ${name}`} saliendo={saliendo} onTap={endWelcome} />;
}

interface Inicio { x: number; y: number; sx: number; sy: number }

function WelcomeOverlay({ from, name }: WelcomeState) {
  const medida = useRef<HTMLDivElement>(null);
  const [inicio, setInicio] = useState<Inicio | null>(null);
  const [revealing, setRevealing] = useState(false);
  const ended = useRef(false);

  // Dónde queda el ícono (centro de la pantalla) frente a dónde estaba la tarjeta del login
  useLayoutEffect(() => {
    const el = medida.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    setInicio({
      x: from.x + from.width / 2 - cx,
      y: from.y + from.height / 2 - cy,
      sx: from.width / r.width,
      sy: from.height / r.height,
    });
  }, [from]);

  function reveal() {
    if (ended.current) return;
    ended.current = true;
    setRevealing(true);
    setTimeout(endWelcome, REVEAL_MS + 20);
  }

  useEffect(() => {
    if (!inicio) return;
    const listo = setTimeout(() => haptic('success'), 980);
    const open = setTimeout(reveal, REVEAL_AT);
    return () => { clearTimeout(listo); clearTimeout(open); };
  }, [inicio]);

  return (
    <div className="welcome welcome--c" onPointerDown={reveal} role="status" aria-live="polite" aria-label={`Bienvenido, ${name}`}>
      {/* Mismo fondo que el login: el cambio de pantalla no se nota */}
      <motion.div
        className="welcome__backdrop login-backdrop"
        initial={{ opacity: 1 }}
        animate={{ opacity: revealing ? 0 : 1 }}
        transition={{ duration: 0.42, ease: 'easeIn' }}
      >
        <span className="login__glow login__glow--a" />
        <span className="login__glow login__glow--b" />
      </motion.div>

      {/* Se mide una vez (invisible) para saber dónde queda el ícono */}
      {!inicio && <div ref={medida} className="welcome__card" style={{ visibility: 'hidden' }} aria-hidden />}

      {inicio && (
        <motion.div
          className="welcome__card"
          initial={{ x: inicio.x, y: inicio.y, scaleX: inicio.sx, scaleY: inicio.sy, opacity: 1 }}
          animate={revealing
            ? { x: 0, y: 0, scaleX: 14, scaleY: 14, opacity: 0 }
            : { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 }}
          transition={revealing
            ? { duration: REVEAL_MS / 1000, ease: [0.7, 0, 0.84, 0] }
            : { type: 'spring', bounce: 0, duration: 0.55 }}
        >
          <motion.span className="welcome__tile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12, duration: 0.3 }} />
          <motion.img
            className="welcome__logo"
            src={LOGO_URL}
            alt=""
            draggable={false}
            initial={{ opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', bounce: 0, duration: 0.45 }}
          />
          {/* El brillo cruza el logo cuando el trazo termina */}
          <motion.span className="welcome__sheen" initial={{ x: '-130%' }} animate={{ x: '130%' }} transition={{ delay: 0.86, duration: 0.5, ease: [0.45, 0, 0.2, 1] }} />
          {/* Trazo que recorre el borde del ícono */}
          <svg className="welcome__ring" viewBox="0 0 112 112" aria-hidden>
            <motion.rect
              x="1.5" y="1.5" width="109" height="109" rx="28.5"
              fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 1 }}
              animate={{ pathLength: 1, opacity: [1, 1, 0] }}
              transition={{ pathLength: { delay: 0.34, duration: 0.55, ease }, opacity: { delay: 0.34, duration: 0.85, times: [0, 0.75, 1] } }}
            />
          </svg>
        </motion.div>
      )}

      <motion.p
        className="welcome__hello"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: revealing ? 0 : 1, y: 0 }}
        transition={revealing ? { duration: 0.15 } : { delay: 0.95, duration: 0.35, ease }}
      >
        Hola, {name}
      </motion.p>
    </div>
  );
}
