import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { Sheet } from './Sheet';
import { SearchField } from './Field';
import { Notice } from './Display';
import { LicensePlate } from './LicensePlate';
import { haptic } from '../lib/haptics';

// Selector de placa con el diseño de KINTSUGI (Buscar por placa): el campo muestra la placa dibujada
// y al tocarlo se abre una hoja con búsqueda por placa o por cliente, sin importar tildes, espacios ni guiones.
// Reemplaza al <select> nativo en cualquier formulario que elija una unidad.

export interface OpcionPlaca {
  placa: string;
  /** Cliente, o cualquier detalle que ayude a distinguir la unidad */
  detalle?: string | null;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s-]/g, '');

export function PlacaPicker({ id, value, onChange, opciones, placeholder = 'Elige una placa…', disabled, 'aria-invalid': ariaInvalid, 'aria-describedby': ariaDescribedBy }: {
  id?: string;
  value: string;
  onChange: (placa: string) => void;
  opciones: OpcionPlaca[];
  placeholder?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const detalle = opciones.find(o => o.placa === value)?.detalle;
  return (
    <>
      <div style={{ position: 'relative', minWidth: 0 }}>
      <button
        id={id}
        type="button"
        className="campo-picker"
        style={{ width: '100%', paddingRight: value && !disabled ? 72 : undefined }}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-haspopup="dialog"
        onClick={() => { haptic('selection'); setAbierto(true); }}
      >
        {value ? (
          <>
            <LicensePlate plate={value} size="sm" />
            <span className="campo-picker__detalle">{detalle ?? ''}</span>
          </>
        ) : (
          <>
            <Search size={16} aria-hidden />
            <span className="campo-picker__vacio">{placeholder}</span>
          </>
        )}
        <ChevronDown size={16} aria-hidden className="campo-picker__chevron" />
      </button>
      {value && !disabled && (
        <button type="button" className="combobox__action" aria-label="Quitar placa" title="Quitar placa" style={{ position: 'absolute', right: 40, top: '50%', transform: 'translateY(-50%)' }}
          onClick={() => { haptic('selection'); onChange(''); }}>
          <X size={16} aria-hidden />
        </button>
      )}
      </div>
      <PlacaSearchSheet
        open={abierto}
        onClose={() => setAbierto(false)}
        opciones={opciones}
        onPick={placa => { onChange(placa); setAbierto(false); }}
      />
    </>
  );
}

// Hoja de búsqueda por placa o cliente (mismo diseño que PlateSearchSheet de KINTSUGI).
export function PlacaSearchSheet({ open, onClose, opciones, onPick, aviso }: {
  open: boolean;
  onClose: () => void;
  opciones: OpcionPlaca[];
  onPick: (placa: string) => void;
  aviso?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const q = fold(useDeferredValue(query).trim());
  const resultados = useMemo(() => {
    if (q.length < 2) return [];
    return opciones
      .filter(o => fold(o.placa).includes(q) || fold(o.detalle ?? '').includes(q))
      .slice(0, 30);
  }, [opciones, q]);

  return (
    <Sheet open={open} onClose={onClose} title="Buscar por placa">
      {aviso && <Notice>{aviso}</Notice>}
      <SearchField value={query} onChange={setQuery} placeholder="Placa o cliente" />
      {q.length >= 2 && (
        resultados.length ? (
          <div className="list">
            {resultados.map(o => (
              <button key={o.placa} type="button" className="row" onClick={() => { haptic('selection'); onPick(o.placa); setQuery(''); }}>
                <LicensePlate plate={o.placa} size="sm" />
                <span className="row__main">
                  <span className="row__title">{o.detalle || 'Sin cliente'}</span>
                </span>
              </button>
            ))}
          </div>
        ) : <p className="t-callout c-secondary" style={{ textAlign: 'center' }}>Ninguna unidad coincide.</p>
      )}
    </Sheet>
  );
}
