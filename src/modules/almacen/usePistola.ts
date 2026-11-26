import { useEffect, type RefObject } from 'react';

/**
 * Pistola láser (lector que escribe como un teclado): si no hay un campo de texto activo, lo que se teclea va al campo de código,
 * así se puede pistolear varios artículos seguidos sin tocar la pantalla. Termina con Enter, que envía el formulario del campo.
 */
export function usePistola(activo: boolean, campo: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (!activo) return;
    campo.current?.focus({ preventScroll: true });
    const alTeclear = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      campo.current?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [activo, campo]);
}
