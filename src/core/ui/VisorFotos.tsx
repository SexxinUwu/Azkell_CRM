import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
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

const ZOOM_MAX = 5;
const ZOOM_DOBLE_TOQUE = 2.5;

/**
 * Visor de fotos a pantalla completa, como la galería del celular:
 * foto grande, deslizar con el dedo (o flechas) para pasar a la anterior/siguiente,
 * y tira de miniaturas abajo para saltar a cualquiera. Con zoom: botones +/-, doble toque,
 * pellizco, rueda del mouse y arrastre para mover la foto ampliada.
 * Escape cierra, y las flechas del teclado navegan.
 */
export function VisorFotos({ open, onClose, fotos, indiceInicial = 0, titulo, cargando }: VisorFotosProps) {
  const n = fotos.length;
  const [i, setI] = useState(indiceInicial);
  const [dir, setDir] = useState(0);
  const [escala, setEscala] = useState(1);
  const [desp, setDesp] = useState({ x: 0, y: 0 });
  const [tocando, setTocando] = useState(false);
  const tira = useRef<HTMLDivElement>(null);
  const escena = useRef<HTMLDivElement>(null);
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const pellizco = useRef<{ dist: number; escala: number } | null>(null);
  const arrastre = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const inicio = useRef({ x: 0, y: 0 });
  const movio = useRef(false);
  const ultimoToque = useRef(0);

  useEffect(() => {
    if (!open) return;
    setI(Math.min(Math.max(0, indiceInicial), Math.max(0, n - 1)));
    setDir(0);
  }, [open, indiceInicial, n]);

  // Cada foto abre sin zoom
  useEffect(() => { setEscala(1); setDesp({ x: 0, y: 0 }); }, [i, open]);

  const limitar = useCallback((x: number, y: number, e: number) => {
    const r = escena.current?.getBoundingClientRect();
    const mx = r ? ((e - 1) * r.width) / 2 : 0;
    const my = r ? ((e - 1) * r.height) / 2 : 0;
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  }, []);

  const aplicarEscala = useCallback((valor: number) => {
    const k = Math.max(1, Math.min(ZOOM_MAX, valor));
    setEscala(k);
    setDesp(d => (k === 1 ? { x: 0, y: 0 } : limitar(d.x, d.y, k)));
  }, [limitar]);

  const ir = useCallback((destino: number) => {
    if (destino < 0 || destino >= n || destino === i) return;
    setDir(destino > i ? 1 : -1);
    setI(destino);
    haptic('selection');
  }, [i, n]);

  // Teclado: flechas navegan, +/-/0 hacen zoom, Escape cierra solo el visor (no la hoja que esté debajo)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); ir(i + 1); }
      else if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); ir(i - 1); }
      else if (e.key === '+' || e.key === '=') { e.stopImmediatePropagation(); aplicarEscala(escala * 1.4); }
      else if (e.key === '-') { e.stopImmediatePropagation(); aplicarEscala(escala / 1.4); }
      else if (e.key === '0') { e.stopImmediatePropagation(); aplicarEscala(1); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, i, ir, onClose, aplicarEscala, escala]);

  // La miniatura activa siempre queda visible en la tira
  useEffect(() => {
    if (!open) return;
    const mini = tira.current?.children[i] as HTMLElement | undefined;
    mini?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [open, i]);

  const esControl = (e: EventoPuntero) => !!(e.target as HTMLElement).closest('.visor__flecha');

  const alBajar = (e: EventoPuntero) => {
    if (esControl(e)) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    inicio.current = { x: e.clientX, y: e.clientY };
    movio.current = false;
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      pellizco.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, escala };
      arrastre.current = null;
      setTocando(true);
    } else if (escala > 1) {
      arrastre.current = { x: e.clientX, y: e.clientY, dx: desp.x, dy: desp.y };
      setTocando(true);
    }
  };

  const alMover = (e: EventoPuntero) => {
    if (!punteros.current.has(e.pointerId)) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.abs(e.clientX - inicio.current.x) + Math.abs(e.clientY - inicio.current.y) > 8) movio.current = true;
    if (punteros.current.size === 2 && pellizco.current) {
      const [a, b] = [...punteros.current.values()];
      aplicarEscala(pellizco.current.escala * (Math.hypot(a.x - b.x, a.y - b.y) / pellizco.current.dist));
    } else if (arrastre.current && escala > 1) {
      const a = arrastre.current;
      setDesp(limitar(a.dx + (e.clientX - a.x), a.dy + (e.clientY - a.y), escala));
    }
  };

  const alSoltar = (e: EventoPuntero) => {
    if (!punteros.current.has(e.pointerId)) return;
    const eraUno = punteros.current.size === 1;
    punteros.current.delete(e.pointerId);
    if (punteros.current.size < 2) pellizco.current = null;
    if (punteros.current.size === 0) { arrastre.current = null; setTocando(false); }
    // Doble toque: alterna entre foto completa y ampliada
    if (eraUno && !movio.current && e.type === 'pointerup' && !esControl(e)) {
      const ahora = Date.now();
      if (ahora - ultimoToque.current < 300) { aplicarEscala(escala > 1 ? 1 : ZOOM_DOBLE_TOQUE); ultimoToque.current = 0; }
      else ultimoToque.current = ahora;
    }
  };

  if (!open) return null;
  const actual = fotos[i];
  const ampliada = escala > 1.001;

  return createPortal(
    <div className="visor" role="dialog" aria-modal="true" aria-label={titulo || 'Visor de fotos'}>
      <header className="visor__barra">
        <span className="visor__titulo">{titulo || 'Fotos'}</span>
        {n > 0 && <span className="visor__cuenta">{i + 1} / {n}</span>}
        {actual && (
          <>
            <button type="button" className="visor__cerrar" onClick={() => aplicarEscala(escala / 1.4)} disabled={!ampliada} aria-label="Alejar"><ZoomOut size={20} /></button>
            <button type="button" className="visor__cerrar" onClick={() => aplicarEscala(escala * 1.4)} disabled={escala >= ZOOM_MAX} aria-label="Acercar"><ZoomIn size={20} /></button>
          </>
        )}
        <button type="button" className="visor__cerrar" onClick={onClose} aria-label="Cerrar visor"><X size={22} /></button>
      </header>

      <div className="visor__escena" ref={escena}
        onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar}
        onWheel={e => aplicarEscala(escala * (e.deltaY < 0 ? 1.15 : 1 / 1.15))}>
        {cargando ? <div className="visor__vacio">Cargando evidencias…</div> : !actual ? <div className="visor__vacio">No hay fotos para mostrar.</div> : (
          <>
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.div
                key={i}
                className="visor__lienzo"
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
                drag={n > 1 && !ampliada ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.5}
                onDragEnd={(_, info) => {
                  // Se proyecta el impulso del dedo para decidir si cambia de foto
                  const proyectado = info.offset.x + info.velocity.x * 0.25;
                  if (proyectado < -80) ir(i + 1);
                  else if (proyectado > 80) ir(i - 1);
                }}
              >
                <img
                  src={actual.url}
                  alt={actual.titulo || `Foto ${i + 1}`}
                  className="visor__foto"
                  draggable={false}
                  style={{ transform: `translate(${desp.x}px, ${desp.y}px) scale(${escala})`, transition: tocando ? 'none' : 'transform 0.18s ease-out', cursor: ampliada ? 'move' : 'zoom-in' }}
                />
              </motion.div>
            </AnimatePresence>
            {n > 1 && i > 0 && !ampliada && <button type="button" className="visor__flecha visor__flecha--izq" onClick={() => ir(i - 1)} aria-label="Foto anterior"><ChevronLeft size={26} /></button>}
            {n > 1 && i < n - 1 && !ampliada && <button type="button" className="visor__flecha visor__flecha--der" onClick={() => ir(i + 1)} aria-label="Foto siguiente"><ChevronRight size={26} /></button>}
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
