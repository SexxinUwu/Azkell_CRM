// Los PDF que se abren en otra pestaña usan una dirección temporal (blob:) que vive en esta página.
// Si se libera por tiempo (antes: 1 a 5 minutos), al volver a la pestaña del PDF y darle «descargar» el navegador
// dice «No se pudo descargar: problema de red». Se mantiene mientras esta página siga abierta.
const pendientes = new Set<string>();
let escuchando = false;

export function mantenerUrl(url: string) {
  pendientes.add(url);
  if (escuchando) return;
  escuchando = true;
  window.addEventListener('pagehide', () => { pendientes.forEach(u => URL.revokeObjectURL(u)); pendientes.clear(); });
}
