import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { registerFarewell } from '../../core/auth/farewell';
import { haptic } from '../../core/lib/haptics';
import { LOGO_URL } from '../../core/layout/BrandMark';
import { esLiviano, LiteSplash } from './LiteSplash';
import './welcome.css';

const ICON = 112;
const SWITCH_AT = 1150; // ms: el trazo ya se retiró; se cierra la sesión y el login se monta debajo
const ease = [0.25, 1, 0.5, 1] as const;

interface Farewell { id: number; name: string; done: () => void }
type Rect = { left: number; top: number; width: number; height: number };

// Despedida al cerrar sesión: el reverso de la bienvenida. La app se recoge en el ícono de la
// empresa, el trazo naranja se retira, el logo se recoge y el ícono se vuelve la tarjeta del login.
export function FarewellTransition() {
  const [state, setState] = useState<Farewell | null>(null);
  useEffect(() => registerFarewell(name => new Promise<void>(done => {
    setState(s => ({ id: (s?.id ?? 0) + 1, name, done }));
  })), []);
  if (!state) return null;
  const Overlay = esLiviano() ? LiteFarewell : FarewellOverlay;
  return createPortal(<Overlay key={state.id} {...state} onEnd={() => setState(null)} />, document.body);
}

// Celular: el ícono aparece centrado, se cierra la sesión y, con el login ya montado debajo, se desvanece.
function LiteFarewell({ name, done, onEnd }: Farewell & { onEnd: () => void }) {
  const navigate = useNavigate();
  const [saliendo, setSaliendo] = useState(false);
  const cambiado = useRef(false);

  function cambiar() {
    if (cambiado.current) return;
    cambiado.current = true;
    done(); // se cierra la sesión: el login se monta debajo
    let intentos = 0;
    const esperar = () => {
      const listo = !!document.querySelector('.login__card');
      if (!listo && intentos++ < 40) { requestAnimationFrame(esperar); return; }
      if (listo) navigate('/login', { replace: true });
      setSaliendo(true);
      setTimeout(onEnd, 260);
    };
    requestAnimationFrame(esperar);
  }

  useEffect(() => {
    haptic('selection');
    const t = setTimeout(cambiar, 550);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LiteSplash
      saludo={name ? `Hasta pronto, ${name}` : ''}
      etiqueta={name ? `Sesión cerrada. Hasta pronto, ${name}` : 'Sesión cerrada'}
      saliendo={saliendo}
      onTap={cambiar}
    />
  );
}

// Dónde quedará la tarjeta del login cuando termine de entrar (sin su desplazamiento inicial)
function loginCardRect(): Rect | null {
  const card = document.querySelector<HTMLElement>('.login__card');
  if (!card) return null;
  const r = card.getBoundingClientRect();
  const m = new DOMMatrix(getComputedStyle(card).transform === 'none' ? undefined : getComputedStyle(card).transform);
  const cx = r.left + r.width / 2 - m.e;
  const cy = r.top + r.height / 2 - m.f;
  return { left: cx - card.offsetWidth / 2, top: cy - card.offsetHeight / 2, width: card.offsetWidth, height: card.offsetHeight };
}

function FarewellOverlay({ name, done, onEnd }: Farewell & { onEnd: () => void }) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'in' | 'morph' | 'out'>('in');
  const [target, setTarget] = useState<Rect | null>(null);
  const switched = useRef(false);

  const cx = window.innerWidth / 2 - ICON / 2;
  const cy = window.innerHeight / 2 - ICON / 2 - 28;
  const center = { left: cx, top: cy, width: ICON, height: ICON, borderRadius: 30 };

  function switchToLogin() {
    if (switched.current) return;
    switched.current = true;
    done(); // se cierra la sesión: el login se monta debajo
    // Se espera a que el login esté en pantalla y el ícono se vuelve su tarjeta
    let tries = 0;
    const find = () => {
      const rect = loginCardRect();
      if (!rect && tries++ < 30) { requestAnimationFrame(find); return; }
      // Tras salir a pedido, el próximo ingreso empieza en el inicio (no en la última pantalla)
      if (rect) navigate('/login', { replace: true });
      if (!rect || reduce) { setPhase('out'); return; }
      setTarget(rect);
      setPhase('morph');
    };
    requestAnimationFrame(find);
  }

  useEffect(() => {
    haptic('selection');
    const t = setTimeout(switchToLogin, reduce ? 450 : SWITCH_AT);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const t = (delay: number, duration: number) => (reduce ? { duration: 0 } : { delay, duration, ease });
  const morph = phase !== 'in';

  return (
    <motion.div
      className="welcome"
      onPointerDown={switchToLogin}
      role="status"
      aria-live="polite"
      aria-label={name ? `Sesión cerrada. Hasta pronto, ${name}` : 'Sesión cerrada'}
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === 'out' ? 0 : 1 }}
      transition={{ duration: reduce ? 0.25 : 0.22, ease: 'easeOut' }}
      onAnimationComplete={() => phase === 'out' && onEnd()}
    >
      {/* El fondo del login cubre la app */}
      <motion.div
        className="welcome__backdrop login-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0.25 : 0.36, ease: 'easeOut' }}
      >
        <span className="login__glow login__glow--a" />
        <span className="login__glow login__glow--b" />
      </motion.div>

      {/* La app se recoge en el ícono → el ícono se vuelve la tarjeta del login */}
      <motion.div
        className="welcome__card"
        initial={reduce ? center : { ...center, scale: 14, opacity: 0 }}
        animate={phase === 'morph' && target ? { ...target, borderRadius: 32, scale: 1, opacity: 1 } : { ...center, scale: 1, opacity: 1 }}
        transition={phase === 'morph'
          ? { type: 'spring', bounce: 0, duration: 0.5 }
          : reduce ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1], opacity: { duration: 0.28 } }}
        onAnimationComplete={() => phase === 'morph' && setPhase('out')}
      >
        <motion.span className="welcome__tile" animate={{ opacity: morph ? 0 : 1 }} transition={{ duration: 0.28 }} />
        {/* El logo se recoge después de que el trazo se retira */}
        <motion.img
          className="welcome__logo"
          src={LOGO_URL}
          alt=""
          draggable={false}
          initial={{ opacity: 1, scale: 1 }}
          animate={morph ? { opacity: 0, scale: 0.7 } : { opacity: reduce ? 1 : [1, 1, 0.9], scale: reduce ? 1 : [1, 1, 0.92] }}
          transition={morph ? { duration: 0.2 } : t(0.4, 0.6)}
        />
        {/* El trazo naranja aparece completo y se retira */}
        <svg className="welcome__ring" viewBox="0 0 112 112" aria-hidden>
          <motion.rect
            x="1.5" y="1.5" width="109" height="109" rx="28.5"
            fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round"
            initial={{ pathLength: 1, opacity: 0 }}
            animate={reduce || morph ? { opacity: 0 } : { pathLength: [1, 1, 0], opacity: [0, 1, 1] }}
            transition={reduce || morph ? { duration: 0.15 } : { delay: 0.3, duration: 0.7, times: [0, 0.25, 1], ease }}
          />
        </svg>
      </motion.div>

      {name && (
        <motion.p
          className="welcome__hello"
          style={{ top: cy + ICON + 24 }}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: morph ? 0 : 1, y: 0 }}
          transition={morph ? { duration: 0.15 } : t(0.4, 0.35)}
        >
          Hasta pronto, {name}
        </motion.p>
      )}
    </motion.div>
  );
}
