import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { haptic } from '../lib/haptics';
import './acciones-iconos.css';

export interface AccionCabecera {
  /** Nombre de la acción: sale al pasar el mouse y lo lee el lector de pantalla */
  label: string;
  icon: ReactNode;
  onClick: () => void | Promise<void>;
  tono?: 'verde' | 'azul' | 'violeta' | 'rojo' | 'ambar';
  /** Para acciones que se encienden y apagan (filtros, mostrar finalizados…) */
  activo?: boolean;
  disabled?: boolean;
}

/**
 * Acciones secundarias del encabezado de una pantalla: solo el icono con su color y el nombre al pasar el mouse.
 * Reemplaza al botón «Otros» (mismo patrón que Personal y Proveedores).
 */
export function AccionesCabecera({ acciones, etiqueta }: { acciones: Array<AccionCabecera | false | null | undefined>; etiqueta: string }) {
  const visibles = acciones.filter((a): a is AccionCabecera => !!a);
  const [ocupado, setOcupado] = useState<number | null>(null);
  if (!visibles.length) return null;

  async function lanzar(a: AccionCabecera, i: number) {
    haptic('selection');
    setOcupado(i);
    try { await a.onClick(); } finally { setOcupado(null); }
  }

  return (
    <div className="acciones-iconos acciones-iconos--sinfondo" role="group" aria-label={etiqueta}>
      {visibles.map((a, i) => (
        <Button key={a.label} variant="plain" size="sm" iconOnly
          className={`acciones-iconos__boton acciones-iconos__boton--${a.tono ?? 'azul'}`}
          data-tip={a.label} aria-label={a.label} aria-pressed={a.activo === undefined ? undefined : a.activo}
          icon={a.icon} disabled={a.disabled} loading={ocupado === i} onClick={() => lanzar(a, i)} />
      ))}
    </div>
  );
}
