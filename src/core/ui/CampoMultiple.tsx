import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { SeleccionMultiple, type OpcionSeleccion } from './SeleccionMultiple';
import './campo-multiple.css';

/**
 * Campo de selección múltiple moderno: al tocarlo se abre una hoja con buscador y casillas grandes (la lista no se corta
 * ni depende del alto de la pantalla). Lo elegido queda debajo como etiquetas, cada una con su X para quitarla.
 */
export function CampoMultiple({ id, titulo, opciones, valor, onChange, placeholder = 'Seleccionar…', vacio, disabled }: {
  id?: string;
  /** Título de la hoja */
  titulo: string;
  opciones: Array<string | OpcionSeleccion>;
  valor: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  vacio?: string;
  disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const lista: OpcionSeleccion[] = opciones.map(o => (typeof o === 'string' ? { valor: o, titulo: o } : o));
  const alternar = (v: string) => onChange(valor.includes(v) ? valor.filter(x => x !== v) : [...valor, v]);

  return (
    <div className="campo-multiple">
      <button type="button" id={id} className="input campo-multiple__boton" disabled={disabled} aria-haspopup="dialog" aria-expanded={abierto} onClick={() => setAbierto(true)}>
        <span className={valor.length ? undefined : 'campo-multiple__vacio'}>
          {valor.length ? `${valor.length} seleccionado${valor.length === 1 ? '' : 's'}` : placeholder}
        </span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {valor.length > 0 && (
        <ul className="campo-multiple__chips" aria-label="Seleccionados">
          {valor.map(v => (
            <li key={v} className="campo-multiple__chip">
              <span>{lista.find(o => o.valor === v)?.titulo ?? v}</span>
              <button type="button" aria-label={`Quitar ${v}`} disabled={disabled} onClick={() => alternar(v)}><X size={13} aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      <SeleccionMultiple open={abierto} onClose={() => setAbierto(false)} titulo={titulo} opciones={lista} seleccionados={valor} onToggle={alternar}
        placeholder="Buscar…" vacio={vacio} />
    </div>
  );
}
