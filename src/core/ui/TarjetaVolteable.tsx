import { useState, type KeyboardEvent, type ReactNode } from 'react';
import './tarjeta-volteable.css';

// Tarjeta que se voltea al pasar el mouse (o al tocarla) y muestra en el dorso una acción.
// Es la misma animación de los almacenes del inventario, para que los hubs de empresa tengan el mismo diseño.
export function TarjetaVolteable({ frente, dorso, tono = 'normal' }: {
  frente: ReactNode; dorso: ReactNode; tono?: 'normal' | 'global' | 'alerta';
}) {
  const [volteada, setVolteada] = useState(false);
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setVolteada(v => !v);
    }
  };
  return (
    <div className={`tv-flip tv-flip--${tono}${volteada ? ' tv-flip--volteada' : ''}`}>
      <div className="tv-flip__caja">
        <div
          className="tv-flip__cara tv-flip__cara--frente"
          role="button"
          tabIndex={0}
          aria-pressed={volteada}
          onClick={() => setVolteada(v => !v)}
          onKeyDown={alTeclear}
        >
          {frente}
        </div>
        <div className="tv-flip__cara tv-flip__cara--dorso" aria-hidden={!volteada}>
          {dorso}
        </div>
      </div>
    </div>
  );
}
