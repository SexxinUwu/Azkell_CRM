import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from 'react';
import { Eraser } from 'lucide-react';

export interface FirmaHandle { obtener: () => string; vacia: () => boolean; limpiar: () => void }

// Firma con el dedo o el mouse. Mismo tamaño interno que la versión actual (630 × 140, PNG),
// para que quepa en la columna url_firma.
export const Firma = forwardRef<FirmaHandle, { onCambio?: (firmada: boolean) => void }>(function Firma({ onCambio }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [firmada, setFirmada] = useState(false);

  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1d1d1f';
  }, []);

  const punto = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.current!.width, y: ((e.clientY - r.top) / r.height) * canvas.current!.height };
  };
  const empezar = (e: PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    dibujando.current = true;
    const ctx = canvas.current!.getContext('2d')!;
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  };
  const mover = (e: PointerEvent) => {
    if (!dibujando.current) return;
    const ctx = canvas.current!.getContext('2d')!;
    const p = punto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const terminar = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    if (!firmada) { setFirmada(true); onCambio?.(true); }
  };

  const limpiar = () => {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setFirmada(false);
    onCambio?.(false);
  };

  useImperativeHandle(ref, () => ({
    obtener: () => (firmada ? canvas.current!.toDataURL('image/png') : ''),
    vacia: () => !firmada,
    limpiar,
  }));

  return (
    <div className="firma">
      <canvas
        ref={canvas}
        width={630}
        height={140}
        className="firma__lienzo"
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        aria-label="Espacio para firmar"
      />
      {!firmada && <span className="firma__ayuda">Firma aquí con el dedo</span>}
      <span className="firma__linea" aria-hidden />
      {firmada && (
        <button type="button" className="firma__limpiar pressable" onClick={limpiar}>
          <Eraser size={15} /> Borrar firma
        </button>
      )}
    </div>
  );
});
