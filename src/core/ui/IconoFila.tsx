import './acciones-iconos.css';
import type { ReactNode } from 'react';
import { TooltipFijo } from './TooltipFijo';

/** Acción de icono dentro de una fila de tabla: el nombre aparece al pasar el mouse y el clic no abre la fila. */
export function IconoFila({ texto, tono, icono, onClick, cargando }: { texto: string; tono: string; icono: ReactNode; onClick: () => void; cargando?: boolean }) {
  return (
    <TooltipFijo texto={texto}>
      <button type="button" className={`acciones-iconos__boton acciones-iconos__boton--libre acciones-iconos__boton--${tono}`} aria-label={texto} disabled={cargando}
        style={{ width: 28, height: 28, borderRadius: 9 }} onClick={ev => { ev.stopPropagation(); onClick(); }}>{icono}</button>
    </TooltipFijo>
  );
}
