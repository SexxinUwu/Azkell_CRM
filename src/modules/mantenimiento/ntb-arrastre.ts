// Arrastre con punteros para el tablero de neumáticos (mouse y lápiz; en celular se usa tocar y luego tocar el destino).
// Un gesto sin desplazamiento es un toque. El destino se busca con elementFromPoint: las zonas y las posiciones
// se marcan con data-ntb-zona / data-ntb-pos, y las posiciones del diagrama (NeumaticosEsquema) con su aria-label.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export type OrigenLlanta = 'bodega' | 'unidad';
export interface ItemArrastre { codigo: string; origen: OrigenLlanta }
export type Destino = { tipo: 'posicion'; posicion: string } | { tipo: 'zona'; zona: 'reforma' | 'descarte' };

const UMBRAL_PX = 6;
const PREFIJO_LABEL = 'Llanta ';

/** Código de posición de un nodo del diagrama o de un chip (o null) */
export function posicionDelNodo(nodo: EventTarget | null): string | null {
  if (!(nodo instanceof Element)) return null;
  const chip = nodo.closest<HTMLElement>('[data-ntb-pos]');
  if (chip?.dataset.ntbPos) return chip.dataset.ntbPos;
  const g = nodo.closest('g[aria-label^="Llanta "]');
  const etiqueta = g?.getAttribute('aria-label') ?? '';
  const pos = etiqueta.slice(PREFIJO_LABEL.length).split(':')[0]?.trim();
  return pos || null;
}

/** Dice qué posición hay bajo un punto de la pantalla (lo usa el lienzo 3D, que no tiene nodos DOM por llanta) */
export type SondaPosicion = (x: number, y: number) => string | null;

/** Posición de un toque o clic: primero por nodo DOM (SVG) y, si no, con la sonda del lienzo 3D */
export function posicionDeEvento(e: { target: EventTarget | null; clientX: number; clientY: number }, sonda: SondaPosicion | null | undefined): string | null {
  return posicionDelNodo(e.target) ?? (sonda ? sonda(e.clientX, e.clientY) : null);
}

/** Destino bajo un punto de la pantalla (o null). Dentro del lienzo 3D (data-nv3) se pregunta a la sonda. */
export function destinoBajo(x: number, y: number, sonda?: SondaPosicion | null): Destino | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const zona = el.closest<HTMLElement>('[data-ntb-zona]');
  if (zona?.dataset.ntbZona === 'reforma' || zona?.dataset.ntbZona === 'descarte') {
    return { tipo: 'zona', zona: zona.dataset.ntbZona };
  }
  const pos = posicionDelNodo(el) ?? (sonda && el.closest('[data-nv3]') ? sonda(x, y) : null);
  return pos ? { tipo: 'posicion', posicion: pos } : null;
}

interface Opciones {
  /** Toque sin desplazamiento */
  onTap: (item: ItemArrastre) => void;
  /** Se soltó sobre un destino válido */
  onSoltar: (item: ItemArrastre, destino: Destino) => void;
  /** Sonda del lienzo 3D, si la vista de la unidad es 3D */
  sondaRef?: { current: SondaPosicion | null };
}

export interface Fantasma extends ItemArrastre { x: number; y: number }

export function useArrastre(opciones: Opciones) {
  const [fantasma, setFantasma] = useState<Fantasma | null>(null);
  const [sobre, setSobre] = useState<Destino | null>(null);
  // Siempre las últimas funciones, sin reiniciar el gesto cuando la pantalla vuelve a pintar
  const opcionesRef = useRef(opciones);
  opcionesRef.current = opciones;
  const gestoRef = useRef<{ limpiar: () => void } | null>(null);

  useEffect(() => () => gestoRef.current?.limpiar(), []);

  const iniciar = useCallback((e: ReactPointerEvent, item: ItemArrastre) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType === 'mouse') {
      // Sin esto el navegador empieza una selección o un arrastre nativo del texto, cancela el puntero y el gesto se pierde
      e.preventDefault();
      window.getSelection?.()?.removeAllRanges();
    }
    gestoRef.current?.limpiar();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let movido = false;

    const cortar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', cancelar);
      gestoRef.current = null;
      setFantasma(null);
      setSobre(null);
    };

    function mover(ev: PointerEvent) {
      if (!movido) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < UMBRAL_PX) return;
        movido = true;
      }
      setFantasma({ ...item, x: ev.clientX, y: ev.clientY });
      setSobre(destinoBajo(ev.clientX, ev.clientY, opcionesRef.current.sondaRef?.current));
    }

    function soltar(ev: PointerEvent) {
      cortar();
      if (!movido) {
        opcionesRef.current.onTap(item);
        return;
      }
      const destino = destinoBajo(ev.clientX, ev.clientY, opcionesRef.current.sondaRef?.current);
      if (destino) opcionesRef.current.onSoltar(item, destino);
    }

    function cancelar() { cortar(); }

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', cancelar);
    gestoRef.current = { limpiar: cortar };
  }, []);

  return { iniciar, fantasma, sobre };
}
