import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { spring } from '../lib/motion';

type Tone = 'success' | 'error';
interface ToastItem { id: number; message: string; tone: Tone }

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

// Confirmación breve de una acción completada (feedback de "completado").
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: Tone = 'success') => {
    const id = nextId.current++;
    setItems(list => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems(list => list.filter(t => t.id !== id)), tone === 'error' ? 4500 : 2600);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Fuera de #root: sigue visible y audible aunque una hoja deje la pantalla inerte */}
      {createPortal(
        <div className="toast-region" role="status" aria-live="polite">
          <AnimatePresence>
            {items.map(t => (
              <motion.div
                key={t.id}
                layout
                className={`toast toast--${t.tone}`}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.96 }}
                transition={spring}
              >
                {t.tone === 'error' ? <CircleAlert size={18} /> : <CircleCheck size={18} />}
                {t.message}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
