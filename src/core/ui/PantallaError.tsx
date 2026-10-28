import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import './pantalla-error.css';

type Tipo = 'no-encontrado' | 'sin-conexion';

interface Props {
  tipo: Tipo;
  /** Solo en "sin-conexión": si no se indica, recarga la página */
  onReintentar?: () => void;
  /** Pantalla completa, por encima de la app (corte de conexión) */
  pantallaCompleta?: boolean;
}

const TEXTOS: Record<Tipo, { titulo: string; texto: string }> = {
  'no-encontrado': {
    titulo: 'Página no encontrada',
    texto: 'La dirección que abriste no existe o cambió de lugar.',
  },
  'sin-conexion': {
    titulo: 'Sin conexión',
    texto: 'No pudimos comunicarnos con el servidor. Revisa tu internet: cuando vuelva la señal, la pantalla se actualiza sola.',
  },
};

/**
 * Cara animada del error (el trazo del SVG se dibuja y los ojos parpadean).
 * Las animaciones están en pantalla-error.css y se apagan con "reducir movimiento".
 */
function CaraError() {
  return (
    <svg className="pe-cara" viewBox="0 0 320 380" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={25}>
        <g className="pe-face__eyes" transform="translate(0,112.5)">
          <g transform="translate(15,0)">
            <polyline className="pe-face__eye-lid" points="37,0 0,120 75,120" />
            <polyline className="pe-face__pupil" points="55,120 55,155" strokeDasharray="35 35" />
          </g>
          <g transform="translate(230,0)">
            <polyline className="pe-face__eye-lid" points="37,0 0,120 75,120" />
            <polyline className="pe-face__pupil" points="55,120 55,155" strokeDasharray="35 35" />
          </g>
        </g>
        <rect className="pe-face__nose" x="132.5" y="112.5" width={55} height={155} rx={4} ry={4} />
        <g transform="translate(65,334)" strokeDasharray="102 102">
          <path className="pe-face__mouth-left" d="M 0 30 C 0 30 40 0 95 0" />
          <path className="pe-face__mouth-right" d="M 95 0 C 150 0 190 30 190 30" />
        </g>
      </g>
    </svg>
  );
}

export function PantallaError({ tipo, onReintentar, pantallaCompleta = false }: Props) {
  const nav = useNavigate();
  const { titulo, texto } = TEXTOS[tipo];

  return (
    <section className={`pe${pantallaCompleta ? ' pe--completa' : ''}`} role={tipo === 'sin-conexion' ? 'status' : undefined}>
      <CaraError />
      <div className="pe__texto">
        <h2 className="pe__titulo">{titulo}</h2>
        <p className="pe__detalle">{texto}</p>
      </div>
      {tipo === 'no-encontrado'
        ? <Button variant="primary" onClick={() => nav('/', { replace: true })}>Ir al inicio</Button>
        : <Button variant="primary" onClick={onReintentar ?? (() => window.location.reload())}>Reintentar</Button>}
    </section>
  );
}
