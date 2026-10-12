import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import { X } from 'lucide-react';
import { MOBILE_QUERY, useMediaQuery } from '../lib/useMediaQuery';
import { project, spring } from '../lib/motion';
import { Button } from './Button';

// Hojas abiertas a la vez, de abajo hacia arriba (una puede abrirse encima de otra:
// confirmar, o registrar un proveedor sin salir de la carga). Escape cierra solo la de arriba.
const openSheets: symbol[] = [];

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Hoja modal.
 * - Escritorio: diálogo centrado que se "materializa" (escala + desenfoque).
 * - Móvil: hoja inferior; se cierra arrastrando hacia abajo. Al soltar se proyecta
 *   el impulso del dedo (skill apple-design §6) para decidir si cierra o vuelve.
 * Entra y sale por el mismo camino (§7). Escape cierra. El foco vuelve al disparador.
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const titleId = useId();
  const dragControls = useDragControls();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  // onClose suele llegar como función nueva en cada render: se guarda en una ref para que
  // actualizar la pantalla de atrás no reinicie el foco mientras se escribe.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Momento en que se abrió: un toque en el fondo justo después es el "clic fantasma" del gesto que la abrió
  const openedAt = useRef(0);

  useEffect(() => {
    if (!open) return;
    openedAt.current = performance.now();
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // La pantalla de atrás queda inerte: ni el teclado ni el lector de pantalla salen de la hoja.
    const root = document.getElementById('root');
    const me = Symbol('sheet');
    openSheets.push(me);
    root?.setAttribute('inert', '');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && openSheets[openSheets.length - 1] === me) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    // Escritorio: enfoca el primer campo. Celular: la hoja, para no abrir el teclado
    // en plena animación (el teclado aparece cuando la persona toca un campo).
    requestAnimationFrame(() => {
      const first = window.matchMedia(MOBILE_QUERY).matches ? null : panelRef.current?.querySelector<HTMLElement>('input, select, textarea');
      (first ?? panelRef.current)?.focus({ preventScroll: true });
    });
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      openSheets.splice(openSheets.indexOf(me), 1);
      if (openSheets.length === 0) root?.removeAttribute('inert');
      returnFocusTo.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  function handleDragEnd(_: PointerEvent, info: PanInfo) {
    const height = panelRef.current?.offsetHeight ?? 600;
    const projected = info.offset.y + project(info.velocity.y);
    if (projected > height * 0.5) onClose();
  }

  const panelMotion = isMobile
    ? { initial: { y: '112%' }, animate: { y: 0 }, exit: { y: '112%' }, transition: spring } // 112 %: la hoja flota separada del borde
    : {
        initial: { opacity: 0, scale: 0.96, filter: 'blur(6px)' },
        animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 0, scale: 0.96, filter: 'blur(6px)' },
        transition: spring,
      };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="sheet-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => { if (performance.now() - openedAt.current > 350) onClose(); }}
          />
          <motion.div
            key="sheet"
            ref={panelRef}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            {...panelMotion}
            drag={isMobile ? 'y' : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.9 }}
            dragTransition={{ bounceStiffness: 400, bounceDamping: 32 }}
            onDragEnd={handleDragEnd}
          >
            <div className="sheet__grabber" onPointerDown={e => dragControls.start(e)} />
            <div className="sheet__header" onPointerDown={e => isMobile && dragControls.start(e)}>
              <h2 id={titleId} className="sheet__title">{title}</h2>
              <button type="button" className="sheet__close pressable" onClick={onClose} aria-label="Cerrar">
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>
            <div className="sheet__body">{children}</div>
            {footer && <div className="sheet__footer">{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  loading?: boolean;
}

// Confirmación: solo para acciones destructivas e irreversibles (skill §16, Agency).
export function ConfirmSheet({ open, onClose, onConfirm, title, message, confirmLabel, loading }: ConfirmSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="t-callout c-secondary">{message}</p>
    </Sheet>
  );
}

