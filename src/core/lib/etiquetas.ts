/**
 * Regla universal de las etiquetas de las fichas (.dato__label): cada palabra inicia con mayúscula y el resto va en minúscula,
 * salvo las palabras cortas de enlace («de», «del», «y»…), que van en minúscula si no abren la frase: «Centro de Costos».
 * Solo se tocan las palabras escritas en minúscula; códigos, siglas y datos ya escritos en mayúscula quedan como están.
 */
const ENLACE = new Set(['a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'lo', 'los', 'o', 'para', 'por', 'sin', 'u', 'un', 'una', 'y']);
const SOLO_MINUSCULAS = /^[a-záéíóúüñ]+$/;

export function tituloDeEtiqueta(texto: string): string {
  let primera = true;
  return texto.replace(/\S+/g, palabra => {
    const abre = primera;
    primera = false;
    if (!SOLO_MINUSCULAS.test(palabra)) return palabra;
    if (!abre && ENLACE.has(palabra)) return palabra;
    return palabra.charAt(0).toUpperCase() + palabra.slice(1);
  });
}

function ajustar(el: Element) {
  for (const nodo of Array.from(el.childNodes)) {
    if (nodo.nodeType !== Node.TEXT_NODE) continue;
    const antes = nodo.nodeValue ?? '';
    const despues = tituloDeEtiqueta(antes);
    if (despues !== antes) nodo.nodeValue = despues;
  }
}

function recorrer(raiz: Node) {
  if (raiz.nodeType === Node.TEXT_NODE) {
    const padre = raiz.parentElement;
    if (padre?.classList.contains('dato__label')) ajustar(padre);
    return;
  }
  if (raiz.nodeType !== Node.ELEMENT_NODE) return;
  const el = raiz as Element;
  if (el.classList.contains('dato__label')) ajustar(el);
  el.querySelectorAll('.dato__label').forEach(ajustar);
}

/** Observa la página y aplica la regla a las etiquetas que React pinta o actualiza */
export function iniciarEtiquetas() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  const obs = new MutationObserver(cambios => {
    for (const c of cambios) {
      if (c.type === 'characterData') recorrer(c.target);
      else c.addedNodes.forEach(recorrer);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  recorrer(document.body);
}
