import type { CSSProperties } from 'react';
import { Switch } from '../../core/ui/Switch';
import { haptic } from '../../core/lib/haptics';

// Sin colores de fondo por persona: la fila muestra iniciales neutras, el nombre, el cargo y el correo.
// El rol lleva solo un punto del color del rol. Tocar la fila abre la edición; el interruptor pide confirmación.

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const texto = (partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[1][0] : '');
  return texto.toUpperCase() || '?';
}

interface UsuarioFilaProps {
  nombre: string;
  correo: string;
  cargo: string;
  rol: string;
  rolColor: string | null;
  activo: boolean;
  ocupado: boolean;
  onEditar: () => void;
  onCambiarEstado: () => void;
}

export function UsuarioFila({ nombre, correo, cargo, rol, rolColor, activo, ocupado, onEditar, onCambiarEstado }: UsuarioFilaProps) {
  const subtitulo = [cargo, correo].filter(Boolean).join(' · ');
  return (
    <div className={`row usr-fila${activo ? '' : ' usr-fila--inactivo'}`}>
      <button type="button" className="usr-fila__main pressable" onClick={() => { haptic('selection'); onEditar(); }} aria-label={`Editar a ${nombre}`}>
        <span className="usr-avatar" aria-hidden>{iniciales(nombre)}</span>
        <span className="usr-fila__texto">
          <span className="usr-fila__nombre">{nombre.toLowerCase()}</span>
          <span className="usr-fila__sub">{subtitulo || '—'}</span>
          {rol && <span className="usr-fila__rol-movil" style={{ '--rol': rolColor ?? 'var(--label-3)' } as CSSProperties}>{rol}</span>}
        </span>
        {rol && <span className="usr-rol" style={{ '--rol': rolColor ?? 'var(--label-3)' } as CSSProperties}>{rol}</span>}
      </button>
      <Switch checked={activo} onChange={onCambiarEstado} disabled={ocupado}
        label={`${activo ? 'Desactivar' : 'Activar'} el acceso de ${nombre}`} />
    </div>
  );
}
