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
  { nombre: 'Grafito', hex: '#636366' },
];

export const ACENTO_POR_DEFECTO = PALETA_ACENTO[0].hex;

const esHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** Aplica el color a toda la app (sin guardar). Los derivados (hover, texto, tinte) los calcula tokens.css,
 *  distintos en claro y oscuro, a partir de --accent-base. */
export function aplicarAcento(hex: string) {
  const el = document.documentElement.style;
  if (!esHex(hex) || hex.toLowerCase() === ACENTO_POR_DEFECTO) el.removeProperty('--accent-base');
  else el.setProperty('--accent-base', hex);
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
