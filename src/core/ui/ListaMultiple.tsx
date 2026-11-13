import './lista-multiple.css';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { haptic } from '../lib/haptics';

export interface OpcionMultiple<T extends string = string> { value: T; label: string }

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Lista desplegable de selección múltiple: se abre con un buscador, deja marcar varias opciones
 * y muestra lo elegido debajo, con una X para quitar cada una.
 */
export function ListaMultiple<T extends string>({ opciones, valor, onChange, etiqueta, placeholder }: {
  opciones: OpcionMultiple<T>[];
  valor: T[];
  onChange: (v: T[]) => void;
  etiqueta: string;
  placeholder?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const [q, setQ] = useState('');
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const cerrar = () => { setAbierta(false); setQ(''); };
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) cerrar(); };
    // Escape cierra solo la lista, no la hoja que la contiene
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla, true);
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla, true); };
  }, [abierta]);

  const buscada = sinAcentos(q);
  const visibles = buscada ? opciones.filter(o => sinAcentos(o.label).includes(buscada)) : opciones;
  const elegidos = valor.map(v => opciones.find(o => o.value === v) ?? { value: v, label: v });
  const alternar = (v: T) => { haptic('selection'); onChange(valor.includes(v) ? valor.filter(x => x !== v) : [...valor, v]); };

  return (
    <div className={`lm${abierta ? ' lm--abierta' : ''}`} ref={raiz}>
      <div className="lm__campo">
        <input className="input" type="text" role="combobox" aria-expanded={abierta} aria-label={etiqueta} value={q} autoComplete="off"
          placeholder={placeholder ?? (valor.length ? `${valor.length} elegido${valor.length === 1 ? '' : 's'} · agregar otro` : `Elegir ${etiqueta.toLowerCase()}`)}
          onFocus={() => setAbierta(true)} onClick={() => setAbierta(true)} onChange={e => { setQ(e.target.value); setAbierta(true); }} />
        <button type="button" className="lm__flecha" tabIndex={-1} aria-label={abierta ? 'Cerrar lista' : 'Abrir lista'} onClick={() => setAbierta(a => !a)}><ChevronDown size={18} /></button>
      </div>
      {abierta && (
        <div className="lm__lista" role="listbox" aria-multiselectable aria-label={etiqueta}>
          {visibles.length === 0 ? <p className="lm__vacio">Sin coincidencias.</p> : visibles.map(o => {
            const on = valor.includes(o.value);
            return (
              <button key={o.value} type="button" role="option" aria-selected={on} className={`lm__op${on ? ' lm__op--on' : ''}`} onClick={() => alternar(o.value)}>
                <span>{o.label}</span>{on && <Check size={16} strokeWidth={3} aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
      {elegidos.length > 0 && (
        <div className="lm__elegidos" aria-label={`${etiqueta} elegidos`}>
          {elegidos.map(o => (
            <span key={o.value} className="lm__chip">{o.label}
              <button type="button" aria-label={`Quitar ${o.label}`} onClick={() => alternar(o.value)}><X size={12} strokeWidth={3} /></button>
            </span>
          ))}
          {elegidos.length > 1 && <button type="button" className="lm__limpiar" onClick={() => { haptic('selection'); onChange([]); }}>Quitar todo</button>}
        </div>
      )}
    </div>
  );
}
