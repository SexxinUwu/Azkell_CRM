import { LOGO_URL } from '../../core/layout/BrandMark';
import './welcome.css';

// Bienvenida y despedida en versión liviana, para celulares y pantallas táctiles.
// La versión completa anima left/top/width/height y escala la tarjeta hasta 16×: en un teléfono
// eso se corta, parpadea y se desfasa con la barra del navegador. Esta solo mueve opacidad y
// escala (compositor), sin medir la pantalla con JS, y queda siempre centrada con CSS.

/** Celular o pantalla táctil: usa la versión liviana */
export function esLiviano(): boolean {
  try { return window.matchMedia('(max-width: 767px), (pointer: coarse)').matches; }
  catch { return false; }
}

export function LiteSplash({ saludo, etiqueta, saliendo, onTap }: {
  saludo: string;
  etiqueta: string;
  saliendo: boolean;
  onTap?: () => void;
}) {
  return (
    <div
      className={`welcome welcome--lite${saliendo ? ' welcome--saliendo' : ''}`}
      onPointerDown={onTap}
      role="status"
      aria-live="polite"
      aria-label={etiqueta}
    >
      <div className="welcome__backdrop login-backdrop">
        <span className="login__glow login__glow--a" />
        <span className="login__glow login__glow--b" />
      </div>
      <div className="welcome__card">
        <span className="welcome__tile" />
        <img className="welcome__logo" src={LOGO_URL} alt="" draggable={false} />
      </div>
      <p className="welcome__hello">{saludo}</p>
    </div>
  );
}
