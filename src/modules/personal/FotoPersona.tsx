import type { Persona } from './api';

// Tonos suaves para las iniciales: la misma persona siempre tiene el mismo color
const TONOS = ['#8e8e93', '#0a84ff', '#30a46c', '#bf5af2', '#ff375f', '#5e5ce6', '#ac8e68', '#0fa3b1', '#f56300'];
const tono = (s: string) => TONOS[[...s].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONOS.length];

/** Iniciales como en Contactos: primer nombre + primer apellido */
export const inicialesDe = (p: Pick<Persona, 'nombres' | 'apellidos'>) =>
  ((p.nombres.trim().charAt(0) || '') + (p.apellidos.trim().charAt(0) || '')).toUpperCase() || '?';

export function FotoPersona({ persona, size = 40, foto }: { persona: Pick<Persona, 'nombres' | 'apellidos' | 'foto_url'>; size?: number; foto?: string }) {
  const src = foto ?? persona.foto_url;
  const c = tono(`${persona.nombres}${persona.apellidos}`);
  return src ? (
    <img className="foto-persona" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" decoding="async" />
  ) : (
    <span
      className="foto-persona foto-persona--iniciales"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(180deg, color-mix(in srgb, ${c} 78%, #fff), ${c})` }}
      aria-hidden
    >
      {inicialesDe(persona)}
    </span>
  );
}
