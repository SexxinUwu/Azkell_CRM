// Tema de la app: claro, oscuro o automático (sigue al sistema). Se guarda por dispositivo.
// Sin elección queda claro, como hasta ahora. Se aplica con data-theme en <html>; los tokens
// oscuros viven en core/styles/tokens.css.
export type Tema = 'claro' | 'oscuro' | 'auto';

const KEY = 'fleet_tema';
const COLORES = { claro: '#f5f5f7', oscuro: '#000000' } as const;

export function temaGuardado(): Tema {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'oscuro' || v === 'auto' ? v : 'claro';
  } catch { return 'claro'; }
}

/** ¿Se está viendo oscuro ahora mismo? (considera "auto") */
export function esOscuro(t: Tema = temaGuardado()): boolean {
  if (t === 'oscuro') return true;
  if (t === 'claro') return false;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}

export function aplicarTema(t: Tema) {
  const html = document.documentElement;
  html.dataset.theme = t === 'oscuro' ? 'dark' : t === 'auto' ? 'auto' : 'light';
  // Barra del navegador del celular
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = esOscuro(t) ? COLORES.oscuro : COLORES.claro;
}

const oyentes = new Set<() => void>();
export const suscribirTema = (fn: () => void) => { oyentes.add(fn); return () => { oyentes.delete(fn); }; };

export function guardarTema(t: Tema) {
  try { localStorage.setItem(KEY, t); } catch { /* sin almacenamiento */ }
  aplicarTema(t);
  oyentes.forEach(fn => fn());
}

/** Al abrir la app: restaura el tema antes de pintar, y sigue al sistema si está en automático */
export function iniciarTema() {
  aplicarTema(temaGuardado());
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (temaGuardado() === 'auto') { aplicarTema('auto'); oyentes.forEach(fn => fn()); }
    });
  } catch { /* navegador sin matchMedia */ }
}
