import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { registerFarewell } from '../../core/auth/farewell';
import { haptic } from '../../core/lib/haptics';
import { LOGO_URL } from '../../core/layout/BrandMark';
import { LiteSplash } from './LiteSplash';
import './welcome.css';

const SWITCH_AT = 1150; // ms: el trazo ya se retiró; se cierra la sesión y el login se monta debajo
const ease = [0.25, 1, 0.5, 1] as const;

interface Farewell { id: number; name: string; done: () => void }

// Despedida al cerrar sesión: el reverso de la bienvenida. La app se recoge en el ícono de la
// empresa, el trazo se retira, el logo se recoge y el ícono se vuelve la tarjeta del login.
// Igual en web y en celular: solo transform y opacidad, centrado con CSS (ver WelcomeTransition).
export function FarewellTransition() {
  const [state, setState] = useState<Farewell | null>(null);
  useEffect(() => registerFarewell(name => new Promise<void>(done => {
    setState(s => ({ id: (s?.id ?? 0) + 1, name, done }));
  })), []);
  const reduce = useReducedMotion();
  if (!state) return null;
  const Overlay = reduce ? FarewellReducida : FarewellOverlay;
  return createPortal(<Overlay key={state.id} {...state} onEnd={() => setState(null)} />, document.body);
}

/** Espera a que el login esté montado debajo y devuelve su tarjeta (sin su desplazamiento de entrada) */
function esperarTarjetaLogin(): Promise<{ el: HTMLElement | null }> {
  return new Promise(resolve => {
    let intentos = 0;
    const buscar = () => {
      const el = document.querySelector<HTMLElement>('.login__card');
      if (el || intentos++ >= 40) { resolve({ el }); return; }
      requestAnimationFrame(buscar);
    };
    requestAnimationFrame(buscar);
  });
}

/** Centro y tamaño que tendrá la tarjeta del login al terminar de entrar (quita su transform de entrada) */
function rectFinalLogin(card: HTMLElement) {
  const r = card.getBoundingClientRect();
  const t = getComputedStyle(card).transform;
  const m = new DOMMatrix(t === 'none' ? undefined : t);
  const cx = r.left + r.width / 2 - m.e;
  const cy = r.top + r.height / 2 - m.f;
  return { cx, cy, w: card.offsetWidth, h: card.offsetHeight };
}

// "Reducir movimiento": ícono centrado, cierra la sesión y se desvanece
function FarewellReducida({ name, done, onEnd }: Farewell & { onEnd: () => void }) {
  const navigate = useNavigate();
  const [saliendo, setSaliendo] = useState(false);
  const cambiado = useRef(false);

  async function cambiar() {
    if (cambiado.current) return;
    cambiado.current = true;
    done();
    const { el } = await esperarTarjetaLogin();
    if (el) navigate('/login', { replace: true });
    setSaliendo(true);
    setTimeout(onEnd, 260);
  }

  useEffect(() => {
    haptic('selection');
    const t = setTimeout(cambiar, 500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LiteSplash saludo={name ? `Hasta pronto, ${name}` : ''} etiqueta={name ? `Sesión cerrada. Hasta pronto, ${name}` : 'Sesión cerrada'}
      saliendo={saliendo} onTap={cambiar} />
  );
}

function FarewellOverlay({ name, done, onEnd }: Farewell & { onEnd: () => void }) {
  const navigate = useNavigate();
  const card = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'in' | 'morph' | 'out'>('in');
  const [destino, setDestino] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const switched = useRef(false);

  async function switchToLogin() {
    if (switched.current) return;
    switched.current = true;
    done(); // se cierra la sesión: el login se monta debajo
    const { el } = await esperarTarjetaLogin();
    // Tras salir a pedido, el próximo ingreso empieza en el inicio (no en la última pantalla)
    if (el) navigate('/login', { replace: true });
    const mia = card.current?.getBoundingClientRect();
    if (!el || !mia) { setPhase('out'); return; }
    // Dos fotogramas para que el login termine de acomodarse antes de medirlo
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const f = rectFinalLogin(el);
    setDestino({
      x: f.cx - (mia.left + mia.width / 2),
      y: f.cy - (mia.top + mia.height / 2),
      sx: f.w / mia.width,
      sy: f.h / mia.height,
    });
    setPhase('morph');
  }

  useEffect(() => {
    haptic('selection');
    const t = setTimeout(switchToLogin, SWITCH_AT);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const morph = phase !== 'in';

  return (
    <motion.div
      className="welcome welcome--c"
      onPointerDown={switchToLogin}
      role="status"
      aria-live="polite"
      aria-label={name ? `Sesión cerrada. Hasta pronto, ${name}` : 'Sesión cerrada'}
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === 'out' ? 0 : 1 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      onAnimationComplete={() => phase === 'out' && onEnd()}
    >
      {/* El fondo del login cubre la app */}
      <motion.div className="welcome__backdrop login-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.36, ease: 'easeOut' }}>
        <span className="login__glow login__glow--a" />
        <span className="login__glow login__glow--b" />
      </motion.div>

      {/* La app se recoge en el ícono → el ícono se vuelve la tarjeta del login */}
      <motion.div
        ref={card}
        className="welcome__card"
        initial={{ scaleX: 14, scaleY: 14, opacity: 0, x: 0, y: 0 }}
        animate={phase === 'morph' && destino
          ? { x: destino.x, y: destino.y, scaleX: destino.sx, scaleY: destino.sy, opacity: 1 }
          : { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 }}
        transition={phase === 'morph'
          ? { type: 'spring', bounce: 0, duration: 0.5 }
          : { duration: 0.5, ease: [0.16, 1, 0.3, 1], opacity: { duration: 0.28 } }}
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
          animate={morph ? { opacity: 0, scale: 0.7 } : { opacity: [1, 1, 0.9], scale: [1, 1, 0.92] }}
          transition={morph ? { duration: 0.2 } : { delay: 0.4, duration: 0.6, ease }}
        />
        {/* El trazo aparece completo y se retira */}
        <svg className="welcome__ring" viewBox="0 0 112 112" aria-hidden>
          <motion.rect
            x="1.5" y="1.5" width="109" height="109" rx="28.5"
            fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round"
            initial={{ pathLength: 1, opacity: 0 }}
            animate={morph ? { opacity: 0 } : { pathLength: [1, 1, 0], opacity: [0, 1, 1] }}
            transition={morph ? { duration: 0.15 } : { delay: 0.3, duration: 0.7, times: [0, 0.25, 1], ease }}
          />
        </svg>
      </motion.div>

      {name && (
        <motion.p
          className="welcome__hello"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: morph ? 0 : 1, y: 0 }}
          transition={morph ? { duration: 0.15 } : { delay: 0.4, duration: 0.35, ease }}
        >
          Hasta pronto, {name}
        </motion.p>
      )}
    </motion.div>
  );
}
