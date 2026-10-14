import { useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { errorMessage } from '../../../core/api/client';
import { useAuth } from '../../../core/auth/AuthProvider';
import { springSnappy } from '../../../core/lib/motion';
import { uuid } from '../../../core/lib/uuid';
import { preguntarAsistente, useAsistenteEstado, type Turn } from '../api';
import { AsistentePanel } from './AsistentePanel';
import '../asistente.css';

const greeting = (): Turn => ({
  id: uuid(),
  role: 'assistant',
  text: 'Hola, soy el asistente de Azkell Fleet. Te ayudo a usar el sistema y te preparo reportes en Excel o PDF.',
});

// Botón flotante del asistente. Solo aparece si el servidor tiene configurada la clave de Gemini.
// La conversación vive aquí: cerrar el panel no la borra (solo "Nueva conversación").
export function AsistenteFab() {
  const { data } = useAsistenteEstado();
  const { can } = useAuth();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(() => [greeting()]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const suggestions = useMemo(() => {
    const list: string[] = ['¿Cómo registro una incidencia en ruta?'];
    if (can('placas.ver')) list.push('Reporte de placas en Excel');
    if (can('insp.ver')) list.push('Inspecciones de este mes en PDF');
    if (can('cond.ver')) list.push('Lista de conductores en Excel');
    list.push('¿Cómo funciona el módulo de flota?');
    return list.slice(0, 4);
  }, [can]);

  if (!data?.enabled) return null;

  async function send(message: string, base = turns) {
    const q = message.trim();
    if (!q || busy) return;
    const history = base.slice(1).filter(t => !t.error).slice(-8).map(({ role, text }) => ({ role, text }));
    setTurns([...base, { id: uuid(), role: 'user', text: q }]);
    setText('');
    setBusy(true);
    try {
      const res = await preguntarAsistente(q, history);
      setTurns(t => [...t, { id: uuid(), role: 'assistant', text: res.answer, report: res.report }]);
    } catch (err) {
      setTurns(t => [...t, { id: uuid(), role: 'assistant', text: errorMessage(err), error: true, retry: q }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <motion.button
        type="button"
        className="asistente-fab"
        onClick={() => setOpen(true)}
        aria-label="Abrir asistente"
        aria-expanded={open}
        initial={false}
        animate={open ? { scale: 0.5, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0 } : springSnappy}
        style={{ pointerEvents: open ? 'none' : 'auto' }}
        whileTap={{ scale: 0.92 }}
      >
        <MessageCircle size={22} strokeWidth={2} />
      </motion.button>
      <AsistentePanel
        open={open}
        onClose={() => setOpen(false)}
        turns={turns}
        busy={busy}
        text={text}
        onText={setText}
        onSend={send}
        onReset={() => { setTurns([greeting()]); setText(''); }}
        onRetry={id => {
          const i = turns.findIndex(t => t.id === id);
          const q = turns[i]?.retry;
          if (q) send(q, turns.slice(0, Math.max(1, i - 1)));
        }}
        suggestions={suggestions}
      />
    </>
  );
}
