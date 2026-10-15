import { useDeferredValue, useMemo, useState } from 'react';
import { ChevronDown, Plus, Search, UserRound, X } from 'lucide-react';
import { Sheet } from './Sheet';
import { SearchField } from './Field';
import { haptic } from '../lib/haptics';

// Selector de persona (conductor) con el mismo diseño que el de placa: el campo muestra la persona elegida
// y al tocarlo se abre una hoja con búsqueda por nombre o DNI. Si lo escrito no existe, se puede usar tal cual.

export interface OpcionPersona {
  valor: string;
  /** DNI u otro dato que ayude a distinguir a la persona */
  detalle?: string | null;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[1][0] : '')).toUpperCase() || '?';
}

export function PersonaPicker({ id, value, onChange, opciones, placeholder = 'Elige una persona…', titulo = 'Buscar persona', disabled, 'aria-invalid': ariaInvalid, 'aria-describedby': ariaDescribedBy }: {
  id?: string;
  value: string;
  onChange: (valor: string) => void;
  opciones: OpcionPersona[];
  placeholder?: string;
  titulo?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const detalle = opciones.find(o => o.valor === value)?.detalle;
  return (
    <>
      <button
        id={id}
        type="button"
        className="campo-picker"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-haspopup="dialog"
        onClick={() => { haptic('selection'); setAbierto(true); }}
      >
        {value ? (
          <>
            <span className="persona-avatar" aria-hidden>{iniciales(value)}</span>
            <span className="campo-picker__detalle campo-picker__persona">
              <span className="campo-picker__nombre">{value}</span>
              {detalle && <span className="campo-picker__sub">DNI {detalle}</span>}
            </span>
          </>
        ) : (
          <>
            <Search size={16} aria-hidden />
            <span className="campo-picker__vacio">{placeholder}</span>
          </>
        )}
        <ChevronDown size={16} aria-hidden className="campo-picker__chevron" />
      </button>
      <PersonaSearchSheet
        open={abierto}
        onClose={() => setAbierto(false)}
        opciones={opciones}
        titulo={titulo}
        seleccionado={value}
        onPick={valor => { onChange(valor); setAbierto(false); }}
      />
    </>
  );
}

function PersonaSearchSheet({ open, onClose, opciones, titulo, seleccionado, onPick }: {
  open: boolean;
  onClose: () => void;
  opciones: OpcionPersona[];
  titulo: string;
  seleccionado: string;
  onPick: (valor: string) => void;
}) {
  const [query, setQuery] = useState('');
  const q = fold(useDeferredValue(query));
  const resultados = useMemo(() => {
    const lista = q ? opciones.filter(o => fold(o.valor).includes(q) || fold(o.detalle ?? '').includes(q)) : opciones;
    return lista.slice(0, 60);
  }, [opciones, q]);
  const exacto = opciones.some(o => fold(o.valor) === q);
  const escrito = query.trim();

  function elegir(valor: string) {
    onPick(valor);
    setQuery('');
  }

  return (
    <Sheet open={open} onClose={onClose} title={titulo}>
      <SearchField value={query} onChange={setQuery} placeholder="Nombre o DNI" />

      <div className="list" style={{ marginTop: 'var(--s-3)' }}>
        {seleccionado && (
          <button type="button" className="row" onClick={() => elegir('')}>
            <span className="persona-avatar" aria-hidden><X size={14} /></span>
            <span className="row__main"><span className="row__title c-secondary">Quitar a {seleccionado}</span></span>
          </button>
        )}
        {escrito && !exacto && (
          <button type="button" className="row" onClick={() => elegir(escrito.toUpperCase())}>
            <span className="persona-avatar" aria-hidden><Plus size={14} /></span>
            <span className="row__main">
              <span className="row__title">Usar «{escrito}»</span>
              <span className="row__subtitle">No está en la lista de conductores</span>
            </span>
          </button>
        )}
        {resultados.map(o => (
          <button key={o.valor} type="button" className="row" aria-current={o.valor === seleccionado} onClick={() => { haptic('selection'); elegir(o.valor); }}>
            <span className="persona-avatar" aria-hidden>{iniciales(o.valor)}</span>
            <span className="row__main">
              <span className="persona-fila">
                <span className="row__title">{o.valor}</span>
                {o.detalle && <span className="row__subtitle">DNI {o.detalle}</span>}
              </span>
            </span>
            {o.valor === seleccionado && <UserRound size={16} aria-label="Seleccionado" className="c-secondary" />}
          </button>
        ))}
        {!resultados.length && !escrito && (
          <div className="row"><span className="row__main c-secondary">No hay conductores registrados.</span></div>
        )}
      </div>
    </Sheet>
  );
}
