// Hojas de estilo que usa la versión actual (Bootstrap y sus íconos). La app nueva no las carga, así que
// una pantalla que copia el marcado del clásico las pide mientras está montada y las quita al salir.
import { useEffect } from 'react';

const usos = new Map<string, number>();

export function useCssClasico(hrefs: readonly string[]) {
  const clave = hrefs.join('|');
  useEffect(() => {
    const lista = clave ? clave.split('|') : [];
    for (const href of lista) {
      const n = usos.get(href) ?? 0;
      usos.set(href, n + 1);
      if (n === 0 && ![...document.querySelectorAll<HTMLLinkElement>('link[data-clasico]')].some(l => l.dataset.clasico === href)) {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        l.dataset.clasico = href;
        document.head.appendChild(l);
      }
    }
    return () => {
      for (const href of lista) {
        const n = (usos.get(href) ?? 1) - 1;
        if (n > 0) { usos.set(href, n); continue; }
        usos.delete(href);
        document.querySelectorAll<HTMLLinkElement>('link[data-clasico]').forEach(l => { if (l.dataset.clasico === href) l.remove(); });
      }
    };
  }, [clave]);
}
