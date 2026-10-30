import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, CircleAlert } from 'lucide-react';
import { nombreEmpresa, Requiere2FA, useAuth } from '../../core/auth/AuthProvider';
import { api, errorMessage } from '../../core/api/client';
import { Spinner } from '../../core/ui/Button';
import { Switch } from '../../core/ui/Switch';
import { EyeIcon } from '../../core/ui/EyeToggle';
import { BrandMark } from '../../core/layout/BrandMark';
import { firstName } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { spring, springSnappy } from '../../core/lib/motion';
import { startWelcome } from './welcome';
import { MOTIVO_SALIDA } from '../../core/auth/Inactividad';
import './login.css';

// "Recuérdame" guarda en este dispositivo quién ingresó (nunca la contraseña)
// Términos, privacidad, cookies y reembolsos: pendientes de terminar, se muestran cuando esté listo
const MOSTRAR_LEGAL = false;

const REMEMBERED_KEY = 'azkell.recordado';
interface Remembered { email: string; name: string }
const readRemembered = (): Remembered | null => {
  try { return JSON.parse(localStorage.getItem(REMEMBERED_KEY) ?? 'null'); } catch { return null; }
};
const isInstalledApp = () => window.matchMedia('(display-mode: standalone)').matches;

type Phase = 'idle' | 'success';

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const [fieldsScope, animateFields] = useAnimate();
  const cardRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [remembered, setRemembered] = useState(readRemembered);
  const [email, setEmail] = useState(remembered?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // En la app instalada lo natural es no volver a pedir la contraseña
  const [remember, setRemember] = useState(() => !!remembered || isInstalledApp());
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paso2fa, setPaso2fa] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const welcomeName = useRef('');
  // Si la sesión se cerró sola (inactividad), se explica una vez
  const [porInactividad] = useState(() => {
    try { const m = sessionStorage.getItem(MOTIVO_SALIDA); sessionStorage.removeItem(MOTIVO_SALIDA); return m === 'inactividad'; } catch { return false; }
  });
  // Nombre de la empresa del subdominio (la ruta es pública)
  const [empresa, setEmpresa] = useState(() => nombreEmpresa(localStorage.getItem('fleet_empresa_nombre') ?? ''));
  useEffect(() => {
    api<{ empresa_nombre?: string }>('/configuracion')
      .then(e => setEmpresa(nombreEmpresa(e.empresa_nombre ?? '')))
      .catch(() => { /* se queda con el guardado */ });
  }, []);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  // Ya había sesión al llegar aquí: directo a la app (sin animación)
  if (status === 'authenticated' && phase === 'idle' && !loading) return <Navigate to={from} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password || loading || phase !== 'idle') return;
    setError(null);
    setLoading(true);
    try {
      const user = await login(email.trim(), password, remember, paso2fa ? codigo.replace(/\s/g, '') : undefined);
      try {
        if (remember) localStorage.setItem(REMEMBERED_KEY, JSON.stringify({ email: user.email, name: firstName(user.name) }));
        else localStorage.removeItem(REMEMBERED_KEY);
      } catch { /* sin almacenamiento */ }
      welcomeName.current = firstName(user.name);
      setPhase('success');
      setLoading(false);
    } catch (err) {
      setLoading(false);
      if (err instanceof Requiere2FA) { setPaso2fa(true); setCodigo(''); }
      setError(errorMessage(err));
      haptic('warning');
      // "No": la tarjeta niega con la cabeza, como el ingreso de macOS
      if (!reduce && fieldsScope.current) {
        animateFields(fieldsScope.current, { x: [0, -12, 10, -7, 5, -2, 0] }, { duration: 0.45, ease: 'easeOut' });
      }
      passwordRef.current?.select();
    }
  }

  // El contenido se desvanece; la tarjeta vacía pasa a la bienvenida, que la convierte en el ícono
  function handleLeft() {
    if (phase !== 'success') return;
    const r = cardRef.current!.getBoundingClientRect();
    startWelcome({ x: r.left, y: r.top, width: r.width, height: r.height }, welcomeName.current);
    navigate(from, { replace: true });
  }

  function forgetMe() {
    try { localStorage.removeItem(REMEMBERED_KEY); } catch { /* nada */ }
    setRemembered(null);
    setEmail('');
    setPassword('');
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);
  const leaving = phase === 'success';

  return (
    <div className="login login-backdrop">
      <span className="login__glow login__glow--a" aria-hidden />
      <span className="login__glow login__glow--b" aria-hidden />

      <motion.div
        ref={cardRef}
        className="login__card glass"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring}
      >
        <motion.div
          className="login__content"
          animate={leaving ? { opacity: 0, scale: 0.97, filter: 'blur(6px)' } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: leaving ? 0.2 : 0 }}
          onAnimationComplete={handleLeft}
        >
          <BrandMark size={60} />
          <AnimatePresence mode="wait" initial={false}>
            {remembered ? (
              <motion.div key="back" className="login__heading" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={springSnappy}>
                <h1 className="t-title1">Hola de nuevo, {remembered.name}</h1>
                <p className="login__subtitle">
                  {remembered.email} · <button type="button" className="login__link" onClick={forgetMe}>¿No eres tú?</button>
                </p>
              </motion.div>
            ) : (
              <motion.div key="new" className="login__heading" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={springSnappy}>
                <h1 className="t-title1">Inicia sesión</h1>
                <p className="login__subtitle">{empresa}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {porInactividad && (
            <p className="login__message" role="status"><CircleAlert size={15} /> Tu sesión se cerró por inactividad. Vuelve a ingresar.</p>
          )}

          <form className="login__form" onSubmit={handleSubmit} noValidate>
            <div ref={fieldsScope} className={`login__fields${error ? ' login__fields--error' : ''}`}>
              <div className="float" hidden={!!remembered}>
                <input
                  id="login-email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder=" "
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(null); }}
                  required
                />
                <label htmlFor="login-email">Correo</label>
              </div>
              <div className="float float--password">
                <input
                  ref={passwordRef}
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder=" "
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(null); }}
                  onKeyDown={onKey}
                  onKeyUp={onKey}
                  required
                />
                <label htmlFor="login-password">Contraseña</label>
                <button
                  type="button"
                  className="float__eye"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                >
                  <EyeIcon visible={showPassword} size={21} />
                </button>
              </div>
              {paso2fa && (
                <div className="float">
                  <input
                    id="login-totp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder=" "
                    maxLength={8}
                    value={codigo}
                    onChange={e => { setCodigo(e.target.value); setError(null); }}
                    autoFocus
                    required
                  />
                  <label htmlFor="login-totp">Código de verificación</label>
                </div>
              )}
            </div>

            <AnimatePresence initial={false}>
              {(error || capsLock) && (
                <motion.p
                  key={error ? 'error' : 'caps'}
                  className={`login__message${error ? ' login__message--error' : ''}`}
                  role={error ? 'alert' : undefined}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={spring}
                >
                  <CircleAlert size={15} /> {error ?? 'Bloq Mayús está activado'}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="login__remember">
              <label htmlFor="login-remember">
                <span className="login__remember-title">Recuérdame</span>
                <span className="login__remember-hint">Recordar tu correo en este dispositivo</span>
              </label>
              <Switch id="login-remember" label="Recuérdame" checked={remember} onChange={setRemember} />
            </div>

            <button type="submit" className="login__submit" disabled={!email || !password || loading || leaving}>
              <AnimatePresence mode="popLayout" initial={false}>
                {leaving ? (
                  <motion.span key="ok" className="login__submit-ok" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.4, duration: 0.35 }}>
                    <Check size={22} strokeWidth={3} />
                  </motion.span>
                ) : loading ? (
                  <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Spinner /></motion.span>
                ) : (
                  <motion.span key="label" className="login__submit-label" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    Iniciar sesión <ArrowRight size={18} />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </form>

          <p className="login__help">¿Olvidaste tu contraseña? Pide a Sistemas que la restablezca.</p>
          {MOSTRAR_LEGAL && <p className="login__legal-aviso">Al iniciar sesión aceptas los <Link to="/legal/terminos">Términos</Link> y la <Link to="/legal/privacidad">Política de privacidad</Link>.</p>}

        </motion.div>
      </motion.div>

      <footer className="login__footer">
        {MOSTRAR_LEGAL && <nav aria-label="Documentos legales" className="login__legal-nav">
          <Link to="/legal/privacidad">Privacidad</Link>
          <Link to="/legal/terminos">Términos</Link>
          <Link to="/legal/cookies">Cookies</Link>
          <Link to="/legal/reembolsos">Reembolsos</Link>
        </nav>}
        <span>Azkell Fleet · Perú</span>
      </footer>
    </div>
  );
}
