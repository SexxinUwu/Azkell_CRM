import { initials } from '../../core/lib/format';
import type { Conductor } from './api';

// Tonos para las iniciales: el mismo conductor siempre tiene el mismo color
const TONOS = ['#f56300', '#0a84ff', '#30a46c', '#bf5af2', '#ff375f', '#5e5ce6', '#ac8e68', '#0fa3b1'];
const tono = (s: string) => TONOS[[...s].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONOS.length];

/** Foto del conductor o sus iniciales en un círculo de color */
export function FotoConductor({ conductor, size = 44, foto }: { conductor: Pick<Conductor, 'nombre' | 'foto'>; size?: number; foto?: string }) {
  const src = foto ?? conductor.foto;
  const nombre = conductor.nombre || '?';
  return src ? (
    <img className="foto-conductor" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span
      className="foto-conductor foto-conductor--iniciales"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(145deg, ${tono(nombre)}, color-mix(in srgb, ${tono(nombre)} 70%, #000))` }}
      aria-hidden
    >
      {initials(nombre)}
    </span>
  );
}
