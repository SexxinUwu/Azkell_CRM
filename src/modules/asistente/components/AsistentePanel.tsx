import { useEffect, useRef, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react';
import { ArrowUp, SquarePen, X } from 'lucide-react';
import { spring, springSnappy } from '../../../core/lib/motion';
import { MOBILE_QUERY, useMediaQuery } from '../../../core/lib/useMediaQuery';
import type { Turn } from '../api';
import { Markdown } from './Markdown';
import { ReportCard } from './ReportCard';

interface Props {
  open: boolean;
  onClose: () => void;
  turns: Turn[];
  busy: boolean;
  text: string;
  onText: (t: string) => void;
  onSend: (message: string) => void;
  onReset: () => void;
  onRetry: (id: string) => void;
  suggestions: string[];
}

// Panel del asistente. Escritorio: flota a la derecha sin tapar la pantalla.
// Celular: hoja desde abajo casi a pantalla completa, que se cierra arrastrándola.
export function AsistentePanel(props: Props) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  return createPortal(
    <AnimatePresence>{props.open && <Panel key="panel" {...props} isMobile={isMobile} />}</AnimatePresence>,
    document.body,
  );
}

function Panel({ onClose, turns, busy, text, onText, onSend, onReset, onRetry, suggestions, isMobile }: Props & { isMobile: boolean }) {
  const reduce = useReducedMotion();
  const dragControls = useDragControls();
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    if (isMobile) document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) return;
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), reduce ? 0 : 260);
    return () => clearTimeout(t);
  }, [isMobile, reduce]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: reduce ? 'auto' : 'smooth' });
  }, [turns.length, busy, reduce]);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSend(text);
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  }

  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } }
    : isMobile
      ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' }, transition: spring }
      : { initial: { x: '110%', opacity: 0.6 }, animate: { x: 0, opacity: 1 }, exit: { x: '110%', opacity: 0.6 }, transition: spring };

  const onlyGreeting = turns.length === 1;

  return (
    <>
      {isMobile && (
        <motion.div
          className="asistente-scrim"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.15 : 0.3 }}
        />
      )}
      <motion.aside
        className={`asistente-panel${isMobile ? ' asistente-panel--mobile' : ''}`}
        role="dialog"
        aria-label="Asistente"
        aria-modal={isMobile || undefined}
        {...motionProps}
        drag={isMobile && !reduce ? 'y' : false}
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={onDragEnd}
      >
        <header
          className="asistente-panel__header"
          onPointerDown={e => {
            if (!isMobile || (e.target as HTMLElement).closest('button')) return;
            e.preventDefault();
            dragControls.start(e);
          }}
        >
          {isMobile && <span className="asistente-panel__grabber" aria-hidden />}
          <div className="asistente-panel__titles">
            <h2 className="asistente-panel__title">Asistente</h2>
            <p className="asistente-panel__subtitle">Ayuda y reportes de Azkell Fleet</p>
          </div>
          <div className="asistente-panel__tools">
            {!onlyGreeting && (
              <button type="button" className="sheet__close" onClick={onReset} aria-label="Nueva conversación" title="Nueva conversación">
                <SquarePen size={16} />
              </button>
            )}
            <button type="button" className="sheet__close" onClick={onClose} aria-label="Cerrar asistente">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="asistente-panel__log" aria-live="polite">
          {turns.map(t => (
            <motion.div
              key={t.id}
              className={`asistente__msg asistente__msg--${t.role}${t.error ? ' asistente__msg--error' : ''}`}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springSnappy}
            >
              <Markdown text={t.text} />
              {t.report && <ReportCard id={t.id} report={t.report} />}
              {t.error && t.retry && !busy && (
                <button type="button" className="asistente__retry" onClick={() => onRetry(t.id)}>Reintentar</button>
              )}
            </motion.div>
          ))}
          <AnimatePresence>
            {busy && (
              <motion.div
                key="typing"
                className="asistente__msg asistente__msg--assistant asistente__msg--typing"
                aria-label="Pensando"
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={springSnappy}
              >
                <span /><span /><span />
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={endRef} />
        </div>

        <div className="asistente-panel__bottom">
          <AnimatePresence initial={false}>
            {onlyGreeting && (
              <motion.div
                className="asistente__sugerencias"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={springSnappy}
              >
                {suggestions.map(s => (
                  <button key={s} type="button" className="asistente__chip" onClick={() => onSend(s)}>{s}</button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <form className="asistente__form" onSubmit={submit}>
            <input
              ref={inputRef}
              className="asistente__input"
              value={text}
              onChange={e => onText(e.target.value)}
              placeholder="Pregunta o pide un reporte"
              maxLength={500}
              aria-label="Tu pregunta"
              enterKeyHint="send"
            />
            <button type="submit" className="asistente__send" disabled={!text.trim() || busy} aria-label="Enviar">
              <ArrowUp size={18} strokeWidth={2.2} />
            </button>
          </form>
          <p className="asistente__nota">Solo responde sobre Azkell Fleet. Los reportes usan tus permisos.</p>
        </div>
      </motion.aside>
    </>
  );
}
