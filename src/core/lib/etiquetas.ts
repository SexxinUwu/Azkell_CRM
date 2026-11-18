/**
 * Reglas universales de escritura en las fichas:
 *  - Etiquetas (.dato__label): cada palabra inicia con mayúscula y el resto va en minúscula, salvo las palabras cortas de enlace
 *    («de», «del», «y»…), que van en minúscula si no abren la frase: «Centro de Costos», «N° Cuenta».
 *  - Valores de las fichas (.tarjeta .dato__valor): lo que viene en MAYÚSCULAS de la base de datos se muestra como «Base Principal».
 * Solo se tocan palabras escritas solo con letras en minúscula (etiquetas) o solo en mayúscula (valores). Códigos, números, siglas conocidas
 * y datos mezclados quedan como están.
 */
const ENLACE = new Set(['a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'lo', 'los', 'o', 'para', 'por', 'sin', 'u', 'un', 'una', 'y']);
const MINUSCULAS = /^[a-záéíóúüñ]+°?$/;
const MAYUSCULAS = /^([A-ZÁÉÍÓÚÜÑ]{2,})([,.;:]?)$/;
const VOCAL = /[AEIOUÁÉÍÓÚÜ]/;
const SIGLAS = new Set(['BCP', 'BBVA', 'DNI', 'RUC', 'CCI', 'SCTR', 'EMO', 'SUNAT', 'RENIEC', 'GPS', 'SOAT', 'ONP', 'AFP', 'CTS', 'SAC', 'SRL', 'EIRL', 'SA', 'RRHH', 'IGV', 'PDF', 'USB', 'CE', 'EPP', 'SST', 'PNP', 'ATU', 'MTC', 'OS', 'OC', 'OT', 'TI']);

const mayuscula1 = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

export function tituloDeEtiqueta(texto: string): string {
  let primera = true;
  return texto.replace(/\S+/g, palabra => {
    const abre = primera;
    primera = false;
    if (!MINUSCULAS.test(palabra)) return palabra;
    if (!abre && ENLACE.has(palabra)) return palabra;
    return mayuscula1(palabra);
  });
}

export function tituloDeValor(texto: string): string {
  let primera = true;
  return texto.replace(/\S+/g, palabra => {
    const abre = primera;
    primera = false;
    const m = MAYUSCULAS.exec(palabra);
    if (!m || !VOCAL.test(m[1]) || SIGLAS.has(m[1])) return palabra;
    const bajo = m[1].toLowerCase();
    return (!abre && ENLACE.has(bajo) ? bajo : mayuscula1(bajo)) + m[2];
  });
}

function ajustarTextos(el: Element, f: (t: string) => string) {
  const it = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    const antes = n.nodeValue ?? '';
    const despues = f(antes);
    if (despues !== antes) n.nodeValue = despues;
  }
}

const ETIQUETA = '.dato__label';
const VALOR = '.tarjeta .dato__valor';

function ajustarElemento(el: Element) {
  if (el.matches(ETIQUETA)) ajustarTextos(el, tituloDeEtiqueta);
  else if (el.matches(VALOR)) ajustarTextos(el, tituloDeValor);
  el.querySelectorAll(ETIQUETA).forEach(e => ajustarTextos(e, tituloDeEtiqueta));
  el.querySelectorAll(VALOR).forEach(e => ajustarTextos(e, tituloDeValor));
}

function recorrer(nodo: Node) {
  if (nodo.nodeType === Node.TEXT_NODE) {
    const padre = nodo.parentElement;
    if (!padre) return;
    const etiqueta = padre.closest(ETIQUETA);
    if (etiqueta) { ajustarTextos(etiqueta, tituloDeEtiqueta); return; }
    const valor = padre.closest(VALOR);
    if (valor) ajustarTextos(valor, tituloDeValor);
    return;
  }
  if (nodo.nodeType === Node.ELEMENT_NODE) {
    const el = nodo as Element;
    ajustarElemento(el);
    // Elemento nuevo dentro de una etiqueta o un valor que ya existía
    const etiqueta = el.closest(ETIQUETA);
    if (etiqueta) ajustarTextos(etiqueta, tituloDeEtiqueta);
    else { const valor = el.closest(VALOR); if (valor) ajustarTextos(valor, tituloDeValor); }
  }
}

/** Observa la página y aplica las reglas a lo que React pinta o actualiza */
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
