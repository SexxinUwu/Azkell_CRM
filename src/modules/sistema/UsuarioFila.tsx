import type { CSSProperties } from 'react';
import { ChevronRight } from 'lucide-react';
import { Switch } from '../../core/ui/Switch';

// Colores suaves para las iniciales: cada persona siempre tiene el mismo color.
const PALETA = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ac8e68', '#5e5ce6'];

function colorDe(texto: string): string {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

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

// Una persona de la lista: nombre, correo, rol y el interruptor de acceso.
// Tocar la fila abre la edición; el interruptor pide confirmación antes de cambiar el acceso.
export function UsuarioFila({ nombre, correo, cargo, rol, rolColor, activo, ocupado, onEditar, onCambiarEstado }: UsuarioFilaProps) {
  const color = colorDe(nombre || correo);
  const subtitulo = [cargo, correo].filter(Boolean).join(' · ');
  return (
    <div className="row usr-fila" style={{ opacity: activo ? 1 : 0.62 }}>
      <button type="button" className="usr-fila__main" onClick={onEditar} aria-label={`Editar a ${nombre}`}>
        <span className="usr-avatar" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }} aria-hidden>
          {iniciales(nombre)}
        </span>
        <span className="row__main">
          <span className="row__title usr-fila__nombre">{nombre}</span>
          <span className="row__subtitle usr-fila__sub">{subtitulo || '—'}</span>
        </span>
        {rol && (
          <span className="usr-rol" style={{ '--rol': rolColor ?? 'var(--label-2)' } as CSSProperties}>{rol}</span>
        )}
        <ChevronRight size={16} className="usr-fila__chev" aria-hidden />
      </button>
      <Switch checked={activo} onChange={onCambiarEstado} disabled={ocupado}
        label={`${activo ? 'Desactivar' : 'Activar'} el acceso de ${nombre}`} />
    </div>
  );
}
