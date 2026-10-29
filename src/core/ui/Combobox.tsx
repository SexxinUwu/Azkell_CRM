import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { MOBILE_QUERY } from '../lib/useMediaQuery';
import { spring } from '../lib/motion';
import { haptic } from '../lib/haptics';
import { Sheet } from './Sheet';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Segunda línea: RUC, tipo… También se busca en ella. */
  description?: string;
  /** Texto extra para buscar que no se muestra (razón social, sinónimos) */
  keywords?: string;
  icon?: ReactNode;
}

interface ComboboxProps {
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Si se pasa, aparece "Registrar «lo escrito»" al final de la lista */
  onCreate?: (text: string) => void;
  createLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  /** Cuántos resultados mostrar como máximo (el resto aparece al seguir escribiendo) */
  limit?: number;
  /** Muestra un botón como el de placa y abre la búsqueda en una hoja (sin lista flotante que se corte) */
  enHoja?: boolean;
  /** Título de la hoja cuando `enHoja` (si no, el placeholder) */
  tituloHoja?: string;
}

// Sin tildes ni mayúsculas, conservando el largo (para resaltar lo encontrado en el texto original)
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const foldNfc = (s: string) => fold(s.normalize('NFC'));

/** Resalta la primera coincidencia de cada palabra buscada. */
function Highlight({ text, words }: { text: string; words: string[] }) {
  const t = text.normalize('NFC');
  const f = foldNfc(t);
  const marks: Array<[number, number]> = [];
  for (const w of words) {
    const i = f.indexOf(w);
    if (i >= 0) marks.push([i, i + w.length]);
  }
  if (!marks.length) return <>{t}</>;
  marks.sort((a, b) => a[0] - b[0]);
  const out: ReactNode[] = [];
  let at = 0;
  for (const [s, e] of marks) {
    if (s < at) continue;
    if (s > at) out.push(t.slice(at, s));
    out.push(<mark key={s}>{t.slice(s, e)}</mark>);
    at = e;
  }
  out.push(t.slice(at));
  return <>{out}</>;
}

/**
 * Casilla para elegir de una lista escribiendo: los resultados aparecen mientras se escribe
 * (sin importar tildes ni mayúsculas, en cualquier orden de palabras). Flechas + Enter con teclado.
 * Con onCreate, permite registrar lo que no está en la lista sin salir del formulario.
 */
export function Combobox({
  id, options, value, onChange, placeholder = 'Escribe para buscar', onCreate, createLabel = 'Registrar', loading, disabled, limit = 50,
  enHoja = false, tituloHoja, ...aria
}: ComboboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find(o => o.value === value) ?? null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // Mientras no se escribe, la casilla muestra lo elegido
  const [typing, setTyping] = useState(false);

  const words = useMemo(() => fold(query.trim()).split(/\s+/).filter(Boolean), [query]);
  const results = useMemo(() => {
    if (!typing || !words.length) return options.slice(0, limit);
    return options
      .filter(o => {
        const hay = fold(`${o.label} ${o.description ?? ''} ${o.keywords ?? ''}`);
        return words.every(w => hay.includes(w));
      })
      // Primero los que empiezan con lo escrito
      .sort((a, b) => Number(fold(b.label).startsWith(words[0])) - Number(fold(a.label).startsWith(words[0])))
      .slice(0, limit);
  }, [options, words, typing, limit]);

  const text = query.trim();
  const exact = results.some(o => fold(o.label) === fold(text));
  const showCreate = !!onCreate && !exact;
  const count = results.length + (showCreate ? 1 : 0);

  useEffect(() => { setActive(0); }, [query, open]);

  // La opción activa siempre a la vista al moverse con las flechas
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function openList() {
    if (disabled) return;
    setOpen(true);
    // Escritorio: si la lista no cabe debajo de la casilla dentro de su hoja o contenedor, se sube el campo
    if (!enHoja && !window.matchMedia(MOBILE_QUERY).matches) requestAnimationFrame(subirSiNoCabe);
    // En el celular el teclado tapa media pantalla: sube la casilla para ver los resultados
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setTimeout(() => {
        const input = inputRef.current;
        // Con su etiqueta: se sube el campo completo, no solo la casilla
        (input?.closest<HTMLElement>('.field') ?? input)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 280);
    }
  }

  /** Alto de la lista desplegable (18rem): debe caber debajo de la casilla dentro del contenedor con scroll */
  const ALTO_LISTA = 288;
  function subirSiNoCabe() {
    const input = inputRef.current;
    if (!input) return;
    const campo = input.closest<HTMLElement>('.field') ?? input;
    let contenedor = campo.parentElement;
    while (contenedor && !/(auto|scroll)/.test(getComputedStyle(contenedor).overflowY)) contenedor = contenedor.parentElement;
    const fondo = contenedor ? contenedor.getBoundingClientRect().bottom : window.innerHeight;
    if (fondo - input.getBoundingClientRect().bottom < ALTO_LISTA) campo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function close() {
    setOpen(false);
    setTyping(false);
    setQuery('');
  }

  function choose(o: ComboboxOption) {
    onChange(o.value);
    haptic('selection');
    close();
  }

  function create() {
    const t = text;
    close();
    inputRef.current?.blur();
    onCreate?.(t);
  }

  function pick(index: number) {
    if (index < results.length) choose(results[index]);
    else if (showCreate) create();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openList();
      else setActive(a => Math.min(a + 1, count - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && count) { e.preventDefault(); pick(active); }
    } else if (e.key === 'Escape' && open) {
      // Cierra la lista, no la hoja que la contiene
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  const display = typing ? query : selected?.label ?? '';

  const buscador = (
    <div className={`combobox${open ? ' combobox--open' : ''}${enHoja ? ' combobox--hoja' : ''}`}>
      <div className="combobox__field">
        <Search size={16} className="combobox__search" aria-hidden />
        <input
          ref={inputRef}
          id={enHoja ? `${inputId}-buscar` : inputId}
          autoFocus={enHoja}
          className="input combobox__input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && count ? `${listId}-${active}` : undefined}
          {...(enHoja ? {} : aria)}
          value={display}
          placeholder={selected ? selected.label : placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          onFocus={openList}
          onClick={() => { if (!open) openList(); }}
          onChange={e => { setTyping(true); setQuery(e.target.value); if (!open) setOpen(true); }}
          onKeyDown={onKeyDown}
          onBlur={close}
        />
        {selected && !typing ? (
          <button type="button" className="combobox__action" aria-label="Quitar selección" tabIndex={-1}
            onMouseDown={e => e.preventDefault()}
            onClick={() => { onChange(null); inputRef.current?.focus(); }}>
            <X size={16} />
          </button>
        ) : (
          <ChevronDown size={16} className="combobox__chevron" aria-hidden />
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            id={listId}
            role="listbox"
            className="combobox__list"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={spring}
            // Que tocar la lista no le quite el foco a la casilla (si no, se cerraría antes del clic)
            onMouseDown={e => e.preventDefault()}
          >
            {loading && !options.length ? (
              <li className="combobox__empty"><span className="spinner spinner--xs" aria-hidden /> Cargando…</li>
            ) : !results.length && !showCreate ? (
              <li className="combobox__empty">Sin resultados para «{text}»</li>
            ) : null}
            {results.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                className={`combobox__option${i === active ? ' is-active' : ''}`}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(o)}
              >
                {o.icon && <span className="combobox__icon">{o.icon}</span>}
                <span className="combobox__text">
                  <span className="combobox__label"><Highlight text={o.label} words={typing ? words : []} /></span>
                  {o.description && <span className="combobox__desc"><Highlight text={o.description} words={typing ? words : []} /></span>}
                </span>
                {o.value === value && <Check size={16} className="combobox__check" aria-hidden />}
              </li>
            ))}
            {showCreate && (
              <li
                id={`${listId}-${results.length}`}
                data-index={results.length}
                role="option"
                aria-selected={false}
                className={`combobox__option combobox__create${active === results.length ? ' is-active' : ''}`}
                onPointerEnter={() => setActive(results.length)}
                onClick={create}
              >
                <span className="combobox__icon"><Plus size={16} strokeWidth={2.5} /></span>
                <span className="combobox__text">
                  <span className="combobox__label">{text ? <>{createLabel} «{text}»</> : createLabel}</span>
                  {!results.length && text && <span className="combobox__desc">No está en la lista</span>}
                </span>
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );

  if (!enHoja) return buscador;

  // Modo hoja: el campo muestra lo elegido como el selector de placa; al tocarlo se abre la búsqueda a pantalla completa
  return (
    <>
      <button
        id={inputId}
        type="button"
        className="campo-picker"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-invalid={aria['aria-invalid']}
        aria-describedby={aria['aria-describedby']}
        onClick={openList}
      >
        {selected ? (
          <>
            {selected.icon}
            <span className="campo-picker__detalle">{selected.label}{selected.description ? ` · ${selected.description}` : ''}</span>
          </>
        ) : (
          <>
            <Search size={16} aria-hidden />
            <span className="campo-picker__vacio">{placeholder}</span>
          </>
        )}
        <ChevronDown size={16} aria-hidden className="campo-picker__chevron" />
      </button>
      <Sheet open={open} onClose={close} title={tituloHoja ?? placeholder}>
        {buscador}
      </Sheet>
    </>
  );
}
