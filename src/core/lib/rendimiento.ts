// Dispositivos táctiles y la app nativa: la GPU del teléfono no aguanta desenfoques y sombras
// grandes repintados en cada fotograma. En escritorio no cambia nada.

/** Teléfono, tablet o app nativa */
export function modoLigero(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) return true;
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** Escala con la que una tarjeta de `tamano` px cubre la pantalla. En escritorio se mantiene 14 (igual que antes). */
export function escalaCubre(tamano = 112): number {
  if (!modoLigero()) return 14;
  const lado = Math.max(window.innerWidth, window.innerHeight);
  return (lado / tamano) * 1.08;
}

/** Mientras dura una transición de sesión, quita blur y sombras grandes (ver welcome.css) */
export function fxLigero(activo: boolean) {
  if (!modoLigero()) return;
  document.documentElement.classList.toggle('fx-ligero', activo);
}
