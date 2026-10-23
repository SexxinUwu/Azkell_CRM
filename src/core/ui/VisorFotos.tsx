import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { haptic } from '../lib/haptics';
import './visor.css';

export interface FotoVisor { url: string; titulo?: string }

interface VisorFotosProps {
  open: boolean;
  onClose: () => void;
  fotos: FotoVisor[];
  /** Foto con la que abre (índice) */
  indiceInicial?: number;
  titulo?: string;
  cargando?: boolean;
}

/**
 * Visor de fotos a pantalla completa, como la galería del celular:
 * foto grande, deslizar con el dedo (o flechas) para pasar a la anterior/siguiente,
 * y tira de miniaturas abajo para saltar a cualquiera. Escape cierra, y las flechas del teclado navegan.
 */
export function VisorFotos({ open, onClose, fotos, indiceInicial = 0, titulo, cargando }: VisorFotosProps) {
  const n = fotos.length;
  const [i, setI] = useState(indiceInicial);
  const [dir, setDir] = useState(0);
  const tira = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setI(Math.min(Math.max(0, indiceInicial), Math.max(0, n - 1)));
    setDir(0);
  }, [open, indiceInicial, n]);

  const ir = useCallback((destino: number) => {
    if (destino < 0 || destino >= n || destino === i) return;
    setDir(destino > i ? 1 : -1);
    setI(destino);
    haptic('selection');
  }, [i, n]);

  // Teclado: flechas navegan, Escape cierra solo el visor (no la hoja que esté debajo)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); ir(i + 1); }
      else if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); ir(i - 1); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, i, ir, onClose]);

  // La miniatura activa siempre queda visible en la tira
  useEffect(() => {
    if (!open) return;
    const mini = tira.current?.children[i] as HTMLElement | undefined;
    mini?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [open, i]);

  if (!open) return null;
  const actual = fotos[i];

  return createPortal(
    <div className="visor" role="dialog" aria-modal="true" aria-label={titulo || 'Visor de fotos'}>
      <header className="visor__barra">
        <span className="visor__titulo">{titulo || 'Fotos'}</span>
        {n > 0 && <span className="visor__cuenta">{i + 1} / {n}</span>}
        <button type="button" className="visor__cerrar" onClick={onClose} aria-label="Cerrar visor"><X size={22} /></button>
      </header>

      <div className="visor__escena">
        {cargando ? <div className="visor__vacio">Cargando evidencias…</div> : !actual ? <div className="visor__vacio">No hay fotos para mostrar.</div> : (
          <>
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.img
                key={i}
                src={actual.url}
                alt={actual.titulo || `Foto ${i + 1}`}
                className="visor__foto"
                custom={dir}
                variants={{
                  entra: (d: number) => ({ x: d * 80, opacity: 0 }),
                  centro: { x: 0, opacity: 1 },
                  sale: (d: number) => ({ x: d * -80, opacity: 0 }),
                }}
                initial="entra"
                animate="centro"
                exit="sale"
                transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                drag={n > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.5}
                onDragEnd={(_, info) => {
                  // Se proyecta el impulso del dedo para decidir si cambia de foto
                  const proyectado = info.offset.x + info.velocity.x * 0.25;
                  if (proyectado < -80) ir(i + 1);
                  else if (proyectado > 80) ir(i - 1);
                }}
                draggable={false}
              />
            </AnimatePresence>
            {n > 1 && i > 0 && <button type="button" className="visor__flecha visor__flecha--izq" onClick={() => ir(i - 1)} aria-label="Foto anterior"><ChevronLeft size={26} /></button>}
            {n > 1 && i < n - 1 && <button type="button" className="visor__flecha visor__flecha--der" onClick={() => ir(i + 1)} aria-label="Foto siguiente"><ChevronRight size={26} /></button>}
          </>
        )}
      </div>

      {n > 1 && (
        <div className="visor__tira" ref={tira}>
          {fotos.map((f, k) => (
            <button key={`${f.url}-${k}`} type="button" className={`visor__mini${k === i ? ' visor__mini--activa' : ''}`}
              onClick={() => ir(k)} aria-label={`Ver foto ${k + 1}`} aria-current={k === i}>
              <img src={f.url} alt="" loading="lazy" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
