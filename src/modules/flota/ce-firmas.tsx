// Pad de firma del acta de entrega: lienzo táctil/mouse (Pointer Events) que se guarda como PNG (data URL).
// Vista de solo lectura: muestra la firma guardada o un aviso si no hay.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Eraser } from 'lucide-react';

export interface FirmaHandle {
  /** PNG de la firma (data URL), o null si el lienzo está vacío */
  dataUrl(): string | null;
}

interface FirmaProps {
  titulo: string;
  /** Nombre que aparece bajo la línea de firma */
  nombre: string;
  /** Firma ya guardada (data URL), para editar o ver el acta */
  imagen: string | null;
  editable: boolean;
}

const TINTA = '#1d1d1f';
const ALTO_CSS = 140;

export const FirmaPad = forwardRef<FirmaHandle, FirmaProps>(function FirmaPad({ titulo, nombre, imagen, editable }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const vaciaRef = useRef(true);
  const [vacia, setVacia] = useState(true);

  const marcarVacia = (v: boolean) => { vaciaRef.current = v; setVacia(v); };

  // Tamaño real del lienzo (pantallas de alta densidad) y firma previa, si la hay
  useEffect(() => {
    const c = canvasRef.current;
    if (!editable || !c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round((c.clientWidth || 320) * dpr);
    c.height = Math.round(ALTO_CSS * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.5 * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = TINTA;
    if (!imagen) { marcarVacia(true); return; }
    const img = new Image();
    img.onload = () => {
      if (!canvasRef.current) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      marcarVacia(false);
    };
    img.src = imagen;
  }, [editable, imagen]);

  useImperativeHandle(ref, () => ({
    dataUrl: () => {
      if (!editable) return imagen;
      const c = canvasRef.current;
      if (!c || vaciaRef.current) return null;
      return c.toDataURL('image/png');
    },
  }), [editable, imagen]);

  function posicion(e: ReactPointerEvent<HTMLCanvasElement>) {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }

  function inicio(e: ReactPointerEvent<HTMLCanvasElement>) {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = posicion(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    dibujando.current = true;
  }

  function trazo(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = posicion(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (vaciaRef.current) marcarVacia(false);
  }

  function fin() {
    dibujando.current = false;
  }

  function borrar() {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    marcarVacia(true);
  }

  return (
    <div className="ce-firma">
      <div className="ce-firma__cabecera">
        <span className="ce-firma__titulo">{titulo}</span>
        {editable && (
          <button type="button" className="ce-firma__borrar" onClick={borrar} disabled={vacia}>
            <Eraser size={14} aria-hidden /> Borrar
          </button>
        )}
      </div>

      <div className="ce-firma__lienzo">
        {editable ? (
          <>
            <canvas
              ref={canvasRef}
              className="ce-firma__canvas"
              aria-label={`Firma de ${titulo}`}
              onPointerDown={inicio}
              onPointerMove={trazo}
              onPointerUp={fin}
              onPointerCancel={fin}
              onPointerLeave={fin}
            />
            {vacia && <span className="ce-firma__pista" aria-hidden>Firme aquí</span>}
          </>
        ) : imagen ? (
          <img className="ce-firma__img" src={imagen} alt={`Firma de ${titulo}`} />
        ) : (
          <span className="ce-firma__vacia">Sin firma registrada</span>
        )}
      </div>

      <div className="ce-firma__nombre">{nombre || '—'}</div>
    </div>
  );
});
