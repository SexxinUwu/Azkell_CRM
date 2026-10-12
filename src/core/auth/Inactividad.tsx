import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useAuth } from './AuthProvider';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { haptic } from '../lib/haptics';
import { UNAUTHORIZED_EVENT } from '../api/client';
import './inactividad.css';

// Control de inactividad, con los mismos tiempos y la misma clave que la versión actual (logica.js):
// a los 30 min sin actividad avisa, a los 35 cierra la sesión. La clave localStorage['fleet_ultimo_acceso']
// es compartida: trabajar en cualquiera de las dos versiones mantiene viva la sesión en ambas.
const ALERTA_MS = 30 * 60 * 1000;
const MAXIMO_MS = 35 * 60 * 1000;
const GRACIA_MS = MAXIMO_MS - ALERTA_MS;
const CLAVE = 'fleet_ultimo_acceso';
export const MOTIVO_SALIDA = 'azkell.motivoSalida';

const ultimoAcceso = () => Number(localStorage.getItem(CLAVE) || Date.now());
const registrar = () => { try { localStorage.setItem(CLAVE, String(Date.now())); } catch { /* sin almacenamiento */ } };

export function Inactividad() {
  const { status, logout } = useAuth();
  const reduce = useReducedMotion();
  const [restante, setRestante] = useState<number | null>(null); // ms hasta el cierre, mientras se avisa
  const avisando = useRef(false);

  // Registrar actividad (como máximo una vez cada 15 s) mientras no se esté avisando
  useEffect(() => {
    if (status !== 'authenticated') return;
    registrar();
    let ultimo = 0;
    const onActividad = () => {
      if (avisando.current) return; // durante el aviso solo cuenta "Seguir trabajando"
      const ahora = Date.now();
      if (ahora - ultimo > 15_000) { ultimo = ahora; registrar(); }
    };
    const eventos = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    eventos.forEach(e => window.addEventListener(e, onActividad, { passive: true }));
    return () => eventos.forEach(e => window.removeEventListener(e, onActividad));
  }, [status]);

  // Revisión cada segundo
  useEffect(() => {
    if (status !== 'authenticated') return;
    const id = setInterval(() => {
      const pasado = Date.now() - ultimoAcceso();
      if (pasado >= MAXIMO_MS) {
        // Cierre por inactividad: sin animación de despedida, como un 401
        try { sessionStorage.setItem(MOTIVO_SALIDA, 'inactividad'); } catch { /* nada */ }
        avisando.current = false;
        setRestante(null);
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      } else if (pasado >= ALERTA_MS) {
        if (!avisando.current) haptic('warning');
        avisando.current = true;
        setRestante(MAXIMO_MS - pasado);
      } else if (avisando.current) {
        // Hubo actividad en otra pestaña o en la versión actual
        avisando.current = false;
        setRestante(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  const seguir = useCallback(() => {
    registrar();
    avisando.current = false;
    setRestante(null);
    haptic('success');
  }, []);

  const segundos = Math.max(0, Math.ceil((restante ?? 0) / 1000));
  const fraccion = restante === null ? 1 : Math.max(0, Math.min(1, restante / GRACIA_MS));

  return (
    <Sheet
      open={restante !== null}
      onClose={seguir}
      title="¿Sigues ahí?"
      footer={
        <>
          <Button variant="secondary" onClick={() => { avisando.current = false; setRestante(null); logout(); }}>Cerrar sesión</Button>
          <Button variant="primary" onClick={seguir} autoFocus>Seguir trabajando</Button>
        </>
      }
    >
      <div className="inactividad">
        <div className="inactividad__anillo" aria-hidden>
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" className="inactividad__pista" />
            <motion.circle
              cx="60" cy="60" r="52"
              className="inactividad__progreso"
              initial={false}
              animate={{ pathLength: fraccion }}
              transition={reduce ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.9 }}
            />
          </svg>
          <span className="inactividad__tiempo t-numeric">
            {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}
          </span>
        </div>
        <p className="inactividad__texto" role="status" aria-live="polite">
          Por seguridad, tu sesión se cerrará en <strong>{Math.ceil(segundos / 60)} {segundos > 60 ? 'minutos' : 'minuto'}</strong> si
          no hay actividad. Lo que ya guardaste no se pierde.
        </p>
      </div>
    </Sheet>
  );
}
