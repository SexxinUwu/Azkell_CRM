// Bloqueo de la página mientras hay una hoja o un modal abierto (scroll del cuerpo y pantalla de atrás inerte).
// Se cuenta cuántos bloqueos hay: la página se libera solo cuando se cierra el último. Así una hoja abierta
// dentro de otra no deja la página bloqueada al cerrarse.

let bloqueos = 0;

function aplicar() {
  if (bloqueos > 0) {
    document.body.style.overflow = 'hidden';
    document.getElementById('root')?.setAttribute('inert', '');
  } else {
    liberarPagina();
  }
}

/** Bloquea la página. Devuelve la función que deshace ese bloqueo (llamarla una sola vez). */
export function bloquearPagina(): () => void {
  bloqueos++;
  aplicar();
  let deshecho = false;
  return () => {
    if (deshecho) return;
    deshecho = true;
    bloqueos = Math.max(0, bloqueos - 1);
    aplicar();
  };
}

/** Quita cualquier bloqueo (al cambiar de módulo, por si alguna hoja no llegó a cerrarse bien). */
export function liberarPagina() {
  document.body.style.overflow = '';
  document.getElementById('root')?.removeAttribute('inert');
}

/** Al cambiar de módulo: si no hay hojas abiertas, la página queda libre. */
export function reiniciarBloqueos() {
  bloqueos = 0;
  liberarPagina();
}
