import { useState } from 'react';
import { Check } from 'lucide-react';
import { Sheet } from './Sheet';
import { SearchField } from './Field';
import { Button } from './Button';
import { haptic } from '../lib/haptics';
import './seleccion-multiple.css';

// Hoja para elegir varias opciones: cada opción es una casilla grande que se marca o desmarca al tocarla.
// Tiene buscador (sin importar tildes) y un botón para cerrar con el total elegido.

export interface OpcionSeleccion {
  valor: string;
  titulo: string;
  /** Línea secundaria (cliente, cédula, etc.) */
  detalle?: string | null;
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function SeleccionMultiple({ open, onClose, titulo, opciones, seleccionados, onToggle, placeholder = 'Buscar', vacio = 'Ninguna opción coincide.' }: {
  open: boolean;
  onClose: () => void;
  titulo: string;
  opciones: OpcionSeleccion[];
  seleccionados: string[];
  onToggle: (valor: string) => void;
  placeholder?: string;
  vacio?: string;
}) {
  const [busqueda, setBusqueda] = useState('');
  const buscada = sinAcentos(busqueda);
  const visibles = opciones.filter(o => sinAcentos(`${o.titulo} ${o.detalle ?? ''}`).includes(buscada));

  function cerrar() {
    setBusqueda('');
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={cerrar}
      title={titulo}
      ancho
      footer={<Button variant="primary" block onClick={cerrar}>Listo · {seleccionados.length} elegido{seleccionados.length === 1 ? '' : 's'}</Button>}
    >
      <SearchField value={busqueda} onChange={setBusqueda} placeholder={placeholder} />
      {visibles.length > 0 ? (
        <div className="sel-multi" role="group" aria-label={titulo}>
          {visibles.map(o => {
            const marcado = seleccionados.includes(o.valor);
            return (
              <button
                key={o.valor}
                type="button"
                role="checkbox"
                aria-checked={marcado}
                className={`sel-multi__item${marcado ? ' sel-multi__item--on' : ''}`}
                onClick={() => { haptic('selection'); onToggle(o.valor); }}
              >
                <span className="sel-multi__caja" aria-hidden>{marcado && <Check size={14} strokeWidth={3} />}</span>
                <span className="sel-multi__texto">
                  <span className="sel-multi__titulo">{o.titulo}</span>
                  {o.detalle && <span className="sel-multi__detalle">{o.detalle}</span>}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="t-callout c-secondary" style={{ textAlign: 'center' }}>{vacio}</p>
      )}
    </Sheet>
  );
}
