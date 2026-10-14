// Color de acento de la app. Se guarda por dispositivo (localStorage) y se aplica sobrescribiendo las
// variables --accent* de tokens.css. Sin elección, queda el naranja de la marca.
const KEY = 'fleet_accent';

export const PALETA_ACENTO: { nombre: string; hex: string }[] = [
  { nombre: 'Naranja', hex: '#f56300' },
  { nombre: 'Azul', hex: '#0a64d8' },
  { nombre: 'Índigo', hex: '#5b4fe0' },
  { nombre: 'Violeta', hex: '#9333ea' },
  { nombre: 'Rosa', hex: '#d6246e' },
  { nombre: 'Rojo', hex: '#d92d20' },
  { nombre: 'Verde', hex: '#12a150' },
  { nombre: 'Turquesa', hex: '#0c8f9c' },
  { nombre: 'Grafito', hex: '#3a3a3c' },
];

export const ACENTO_POR_DEFECTO = PALETA_ACENTO[0].hex;

const VARS = ['--accent', '--accent-hover', '--accent-ink', '--accent-tint', '--accent-ring'] as const;
const esHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** Aplica el color a toda la app (sin guardar). El texto de acento se oscurece para mantener contraste. */
export function aplicarAcento(hex: string) {
  const el = document.documentElement.style;
  if (!esHex(hex) || hex.toLowerCase() === ACENTO_POR_DEFECTO) {
    VARS.forEach(v => el.removeProperty(v));
    return;
  }
  el.setProperty('--accent', hex);
  el.setProperty('--accent-hover', `color-mix(in srgb, ${hex} 88%, black)`);
  el.setProperty('--accent-ink', `color-mix(in srgb, ${hex} 72%, black)`);
  el.setProperty('--accent-tint', `color-mix(in srgb, ${hex} 11%, transparent)`);
  el.setProperty('--accent-ring', `color-mix(in srgb, ${hex} 34%, transparent)`);
}

export function acentoGuardado(): string {
  try {
    const v = localStorage.getItem(KEY) ?? '';
    return esHex(v) ? v : ACENTO_POR_DEFECTO;
  } catch { return ACENTO_POR_DEFECTO; }
}

export function guardarAcento(hex: string) {
  try { localStorage.setItem(KEY, hex); } catch { /* sin almacenamiento */ }
  aplicarAcento(hex);
}

/** Al abrir la app: restaura el color elegido antes de pintar */
export function iniciarAcento() {
  aplicarAcento(acentoGuardado());
}
