import { useState, type ReactNode } from 'react';
import { haptic } from '../lib/haptics';
import './acciones-expandibles.css';

export type TonoAccion = 'azul' | 'verde' | 'violeta' | 'ambar' | 'rojo' | 'whatsapp' | 'gris' | 'original';

export interface AccionExpandible {
  label: string;
  icon: ReactNode;
  /** Color del icono y de su casilla */
  tono?: TonoAccion;
  /** Explicación corta: se ve al mantener el mouse sobre la acción (y en lectores de pantalla) */
  detalle?: string;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
  /** Empieza un grupo nuevo (con una línea fina de separación) */
  separado?: boolean;
}

/**
 * Acciones de una pantalla como iconos de color, sin menú «Más». Al pasar el mouse (o enfocar con el teclado) el icono se abre
 * hacia el costado y muestra su nombre, como en la barra lateral; al soltar vuelve a ser solo icono. El clic ejecuta la acción.
 */
export function AccionesExpandibles({ acciones, etiqueta = 'Acciones' }: { acciones: Array<AccionExpandible | false | null | undefined>; etiqueta?: string }) {
  const visibles = acciones.filter((a): a is AccionExpandible => !!a);
  const [ocupado, setOcupado] = useState<number | null>(null);
  if (!visibles.length) return null;

  async function ejecutar(a: AccionExpandible, i: number) {
    haptic('selection');
    setOcupado(i);
    try { await a.onSelect(); } finally { setOcupado(null); }
  }

  return (
    <div className="acc-exp" role="toolbar" aria-label={etiqueta}>
      {visibles.map((a, i) => (
        <span key={a.label} className="acc-exp__celda">
          {a.separado && i > 0 && <span className="acc-exp__sep" aria-hidden />}
          <button type="button" className={`acc-exp__boton acc-exp__boton--${a.tono ?? 'gris'}`} aria-label={a.detalle ? `${a.label}. ${a.detalle}` : a.label} title={a.detalle ? `${a.label} · ${a.detalle}` : undefined}
            disabled={a.disabled || ocupado === i} onClick={() => { void ejecutar(a, i); }}>
            <span className="acc-exp__icono" aria-hidden>{a.icon}</span>
            <span className="acc-exp__texto" aria-hidden><span>{a.label}</span></span>
          </button>
        </span>
      ))}
    </div>
  );
}
