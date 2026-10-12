import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { haptic } from '../../core/lib/haptics';
import { LOGO_URL } from '../../core/layout/BrandMark';
import { endWelcome, useWelcome, type WelcomeState } from './welcome';
import './welcome.css';

const ICON = 112;          // tamaño final del ícono (px)
const REVEAL_AT = 1250;    // ms: el ícono se abre sobre la pantalla principal
const REVEAL_MS = 450;
const ease = [0.25, 1, 0.5, 1] as const;

// Bienvenida tras iniciar sesión: la tarjeta del login se vuelve el ícono de la empresa (su logo
// sobre una placa blanca), un trazo naranja recorre el borde, un brillo cruza el logo y el ícono
// se abre sobre la pantalla principal.
export function WelcomeTransition() {
  const welcome = useWelcome();
  if (!welcome) return null;
  return createPortal(<WelcomeOverlay key={welcome.id} {...welcome} />, document.body);
}

function WelcomeOverlay({ from, name }: WelcomeState) {
  const reduce = useReducedMotion();
  const [revealing, setRevealing] = useState(false);
  const ended = useRef(false);

  const cx = window.innerWidth / 2 - ICON / 2;
  const cy = window.innerHeight / 2 - ICON / 2 - 28;
  const center = { left: cx, top: cy, width: ICON, height: ICON, borderRadius: 30 };

  function reveal() {
    if (ended.current) return;
    ended.current = true;
    setRevealing(true);
    setTimeout(endWelcome, reduce ? 260 : REVEAL_MS);
  }

  useEffect(() => {
    const listo = setTimeout(() => haptic('success'), reduce ? 0 : 980);
    const open = setTimeout(reveal, reduce ? 700 : REVEAL_AT);
    return () => { clearTimeout(listo); clearTimeout(open); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const t = (delay: number, duration: number) => (reduce ? { duration: 0 } : { delay, duration, ease });

  return (
    <div className="welcome" onPointerDown={reveal} role="status" aria-live="polite" aria-label={`Bienvenido, ${name}`}>
      {/* Mismo fondo que el login: el cambio de pantalla no se nota */}
      <motion.div
        className="welcome__backdrop login-backdrop"
        initial={{ opacity: 1 }}
        animate={{ opacity: revealing ? 0 : 1 }}
        transition={{ duration: reduce ? 0.25 : 0.42, ease: 'easeIn' }}
      >
        <span className="login__glow login__glow--a" />
        <span className="login__glow login__glow--b" />
      </motion.div>

      {/* La tarjeta del login → el ícono */}
      <motion.div
        className="welcome__card"
        initial={reduce ? center : { left: from.x, top: from.y, width: from.width, height: from.height, borderRadius: 32 }}
        animate={revealing ? { ...center, scale: reduce ? 1 : 16, opacity: 0 } : { ...center, scale: 1, opacity: 1 }}
        transition={revealing
          ? { duration: reduce ? 0.25 : REVEAL_MS / 1000, ease: [0.7, 0, 0.84, 0] }
          : reduce ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.5 }}
      >
        <motion.span className="welcome__tile" initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} transition={t(0.12, 0.3)} />
        <motion.img
          className="welcome__logo"
          src={LOGO_URL}
          alt=""
          draggable={false}
          initial={{ opacity: reduce ? 1 : 0, scale: reduce ? 1 : 0.86 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduce ? { duration: 0 } : { delay: 0.2, type: 'spring', bounce: 0, duration: 0.45 }}
        />
        {/* El brillo cruza el logo cuando el trazo termina */}
        {!reduce && (
          <motion.span
            className="welcome__sheen"
            initial={{ x: '-130%' }}
            animate={{ x: '130%' }}
            transition={{ delay: 0.86, duration: 0.5, ease: [0.45, 0, 0.2, 1] }}
          />
        )}
        {/* Trazo naranja que recorre el borde del ícono */}
        <svg className="welcome__ring" viewBox="0 0 112 112" aria-hidden>
          <motion.rect
            x="1.5" y="1.5" width="109" height="109" rx="28.5"
            fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0, opacity: reduce ? 0 : 1 }}
            animate={{ pathLength: 1, opacity: reduce ? 0 : [1, 1, 0] }}
            transition={reduce ? { duration: 0 } : { pathLength: { delay: 0.34, duration: 0.55, ease }, opacity: { delay: 0.34, duration: 0.85, times: [0, 0.75, 1] } }}
          />
        </svg>
      </motion.div>

      <motion.p
        className="welcome__hello"
        style={{ top: cy + ICON + 24 }}
        initial={{ opacity: 0, y: reduce ? 0 : 8 }}
        animate={{ opacity: revealing ? 0 : 1, y: 0 }}
        transition={revealing ? { duration: 0.15 } : t(0.95, 0.35)}
      >
        Hola, {name}
      </motion.p>
    </div>
  );
}
