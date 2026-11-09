import './botonesIcono.css';
import { useRef, useState, type ButtonHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

/**
 * Botón con su nombre al pasar el mouse o al enfocarlo con el teclado.
 * El rótulo se dibuja fuera de la tabla o tarjeta (portal), así que nunca lo recorta un contenedor con scroll u overflow.
 */
export function BotonTip({ tip, className = '', children, onClick, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tip: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const mostrar = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    // Centrado bajo el botón, sin salirse de la pantalla
    setPos({ x: Math.min(window.innerWidth - 70, Math.max(70, r.left + r.width / 2)), y: r.bottom + 8 });
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        aria-label={rest['aria-label'] ?? tip}
        onMouseEnter={mostrar}
        onFocus={mostrar}
        onMouseLeave={() => setPos(null)}
        onBlur={() => setPos(null)}
        onClick={e => { setPos(null); onClick?.(e); }}
        {...rest}
      >
        {children}
      </button>
      {pos && createPortal(<span role="tooltip" className="tip-flotante" style={{ left: pos.x, top: pos.y }}>{tip}</span>, document.body)}
    </>
  );
}
