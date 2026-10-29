import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './acciones-iconos.css';

// Nombre de una acción al pasar el mouse. Se dibuja en la página (no dentro del contenedor),
// así no lo recorta una tabla con scroll.
export function TooltipFijo({ texto, children }: { texto: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const mostrar = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, y: r.top });
  };
  const ocultar = () => setPos(null);
  return (
    <span ref={ref} className="tooltip-fijo" onMouseEnter={mostrar} onMouseLeave={ocultar} onFocus={mostrar} onBlur={ocultar}>
      {children}
      {pos && createPortal(
        <span className="tooltip-fijo__texto" role="tooltip" style={{ left: pos.x, top: pos.y - 8 }}>{texto}</span>,
        document.body,
      )}
    </span>
  );
}
