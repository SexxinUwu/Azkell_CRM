import { useMemo, type ReactNode } from 'react';

/** Primera letra para agrupar (sin tildes); lo que no es letra va en «#» */
export const letraDe = (s: string) => {
  const l = s.trim().charAt(0).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /[A-Z]/.test(l) ? l : '#';
};

/**
 * Lista por letras como la agenda del teléfono: un grupo redondeado por letra con sus filas dentro.
 * Los estilos (pv-lista, pv-letra, pv-grupo, pv-fila…) están en almacen/proveedores.css.
 */
export function Letras<T>({ items, letra, fila }: { items: T[]; letra: (x: T) => string; fila: (x: T) => ReactNode }) {
  const grupos = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const it of items) { const l = letra(it); m.set(l, [...(m.get(l) ?? []), it]); }
    return [...m.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  return (
    <div className="pv-lista">
      {grupos.map(([l, filas]) => (
        <section key={l} aria-label={`Letra ${l}`}>
          <div className="pv-letra">{l}</div>
          <ul className="pv-grupo">{filas.map(fila)}</ul>
        </section>
      ))}
    </div>
  );
}
