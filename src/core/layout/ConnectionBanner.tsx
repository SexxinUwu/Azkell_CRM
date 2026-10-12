import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CloudOff, Wifi } from 'lucide-react';
import { spring } from '../lib/motion';
import type { LiveState } from '../api/live';

// Aviso flotante de conexión. Espera unos segundos antes de aparecer (un corte breve no molesta)
// y, al volver la señal, confirma "Conectado" un momento.
export function ConnectionBanner({ state }: { state: LiveState }) {
  const [shown, setShown] = useState<'offline' | 'back' | null>(null);

  useEffect(() => {
    if (state === 'offline') {
      const t = setTimeout(() => setShown('offline'), navigator.onLine ? 4000 : 800);
      return () => clearTimeout(t);
    }
    if (state === 'live') {
      setShown(prev => (prev === 'offline' ? 'back' : null));
      const t = setTimeout(() => setShown(null), 1800);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown}
          className={`conn-banner glass conn-banner--${shown}`}
          role="status"
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={spring}
        >
          {shown === 'offline' ? <CloudOff size={16} /> : <Wifi size={16} />}
          {shown === 'offline'
            ? (typeof navigator !== 'undefined' && !navigator.onLine ? 'Sin conexión a internet' : 'Reconectando…')
            : 'Conectado'}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
