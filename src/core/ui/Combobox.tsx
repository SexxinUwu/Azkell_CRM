import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { MOBILE_QUERY, useMediaQuery } from '../lib/useMediaQuery';
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
  /** Varias formas de registrar lo escrito (por ejemplo "Registrar artículo" y "Registrar servicio"). Si se pasa, reemplaza a onCreate. */
  creates?: Array<{ label: string; onCreate: (text: string) => void; icon?: ReactNode }>;
  loading?: boolean;
  disabled?: boolean;
  /** Cuántos resultados se dibujan por tanda; al bajar por la lista se cargan más (la búsqueda siempre recorre todo) */
  limit?: number;
  /** Muestra un botón como el de placa y abre la búsqueda en una hoja (sin lista flotante que se corte) */
  enHoja?: boolean;
  /** Título de la hoja cuando `enHoja` (si no, el placeholder) */
  tituloHoja?: string;
}

const NINGUNA: string[] = [];

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

interface FilaProps {
  o: ComboboxOption; i: number; listId: string; activa: boolean; elegida: boolean; words: string[];
  onActivar: (i: number) => void; onElegir: (o: ComboboxOption) => void;
}

/** Una opción de la lista. Memorizada: al mover el cursor solo se redibujan las dos filas que cambian, no toda la lista. */
const Fila = memo(function Fila({ o, i, listId, activa, elegida, words, onActivar, onElegir }: FilaProps) {
  return (
    <li
      id={`${listId}-${i}`}
      data-index={i}
      role="option"
      aria-selected={elegida}
      className={`combobox__option${activa ? ' is-active' : ''}`}
      onPointerEnter={() => onActivar(i)}
      onClick={() => onElegir(o)}
    >
      {o.icon && <span className="combobox__icon">{o.icon}</span>}
      <span className="combobox__text">
        <span className="combobox__label"><Highlight text={o.label} words={words} /></span>
        {o.description && <span className="combobox__desc"><Highlight text={o.description} words={words} /></span>}
      </span>
      {elegida && <Check size={16} className="combobox__check" aria-hidden />}
    </li>
  );
});

/**
 * Casilla para elegir de una lista escribiendo: los resultados aparecen mientras se escribe
 * (sin importar tildes ni mayúsculas, en cualquier orden de palabras). Flechas + Enter con teclado.
 * Con onCreate, permite registrar lo que no está en la lista sin salir del formulario.
 */
export function Combobox({
  id, options, value, onChange, placeholder = 'Escribe para buscar', onCreate, createLabel = 'Registrar', creates, loading, disabled, limit = 30,
  enHoja = false, tituloHoja, ...aria
}: ComboboxProps) {
  // En celular la búsqueda siempre va en una hoja: la lista inline se reacomodaba con el teclado y provocaba el bucle de foco
  const esMovil = useMediaQuery(MOBILE_QUERY);
  const hoja = enHoja || esMovil;
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
  // Texto de búsqueda de cada opción, calculado una sola vez (no en cada tecla)
  const indice = useMemo(() => options.map(o => ({ hay: fold(`${o.label} ${o.description ?? ''} ${o.keywords ?? ''}`), etiqueta: fold(o.label) })), [options]);
  // La búsqueda recorre TODAS las opciones; solo el dibujo va por tandas
  const results = useMemo(() => {
    if (!typing || !words.length) return options;
    const empiezan: ComboboxOption[] = [];
    const contienen: ComboboxOption[] = [];
    options.forEach((o, i) => {
      if (!words.every(w => indice[i].hay.includes(w))) return;
      (indice[i].etiqueta.startsWith(words[0]) ? empiezan : contienen).push(o); // primero los que empiezan con lo escrito
    });
    return [...empiezan, ...contienen];
  }, [options, indice, words, typing]);

  // Se dibujan `limit` filas y, al bajar, se agregan más hasta completar todos los resultados
  const [visibles, setVisibles] = useState(limit);
  const mostrados = useMemo(() => results.slice(0, visibles), [results, visibles]);
  const hayMas = visibles < results.length;
  const centinelaRef = useRef<HTMLLIElement>(null);
  const porTeclado = useRef(false);

  const text = query.trim();
  const exact = results.some(o => fold(o.label) === fold(text));
  const acciones = creates ?? (onCreate ? [{ label: createLabel, onCreate }] : []);
  const showCreate = acciones.length > 0 && !exact;
  const count = mostrados.length + (showCreate ? acciones.length : 0);

  useEffect(() => { setActive(0); setVisibles(limit); }, [query, open, limit]);

  // Escritorio: al abrir la hoja se enfoca la búsqueda (después de la animación). Celular: no se abre el teclado solo;
  // aparece únicamente cuando la persona toca el buscador, y así no se abre ni se cierra sin que lo pida.
  useEffect(() => {
    if (!hoja || !open || esMovil) return;
    const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 320);
    return () => window.clearTimeout(t);
  }, [hoja, open, esMovil]);

  // Con las flechas la opción activa se mantiene a la vista. Con el cursor NO: si no, al pasar el mouse la lista saltaba y no dejaba bajar.
  useEffect(() => {
    if (!open || !porTeclado.current) return;
    porTeclado.current = false;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    if (active >= mostrados.length - 3) setVisibles(v => v + limit);
  }, [active, open, mostrados.length, limit]);

  // Al acercarse al final se cargan más filas (sirve para cualquier contenedor con scroll, incluida la hoja)
  useEffect(() => {
    const el = centinelaRef.current;
    if (!open || !hayMas || !el) return;
    const obs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setVisibles(v => v + limit); }, { rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [open, hayMas, mostrados.length, limit]);

  function openList() {
    if (disabled) return;
    setOpen(true);
    // Escritorio: si la lista no cabe debajo de la casilla dentro de su hoja o contenedor, se sube el campo.
    // En celular no se desplaza nada: la hoja ocupa la pantalla y el teclado no mueve la página.
    if (!hoja) requestAnimationFrame(subirSiNoCabe);
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

  function create(k = 0) {
    const t = text;
    close();
    inputRef.current?.blur();
    acciones[k]?.onCreate(t);
  }

  function pick(index: number) {
    if (index < mostrados.length) choose(mostrados[index]);
    else if (showCreate) create(index - mostrados.length);
  }

  const elegirRef = useRef(choose);
  elegirRef.current = choose;
  const onElegir = useCallback((o: ComboboxOption) => elegirRef.current(o), []);
  const onActivar = useCallback((i: number) => setActive(i), []);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      porTeclado.current = true;
      if (!open) openList();
      else setActive(a => Math.min(a + 1, count - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      porTeclado.current = true;
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
    <div className={`combobox${open ? ' combobox--open' : ''}${hoja ? ' combobox--hoja' : ''}`}>
      <div className="combobox__field">
        <Search size={16} className="combobox__search" aria-hidden />
        <input
          ref={inputRef}
          id={hoja ? `${inputId}-buscar` : inputId}
          className="input combobox__input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && count ? `${listId}-${active}` : undefined}
          {...(hoja ? {} : aria)}
          value={display}
          placeholder={selected ? selected.label : placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          onFocus={() => { if (!open) openList(); }}
          onClick={() => { if (!open) openList(); }}
          enterKeyHint="search"
          onChange={e => { setTyping(true); setQuery(e.target.value); if (!open) setOpen(true); }}
          onKeyDown={onKeyDown}
          // En hoja no se cierra al perder el foco: el teclado lo pierde y lo recupera al cambiar de tamaño. Se cierra con la X, al elegir o con atrás.
          onBlur={() => { if (!hoja) close(); }}
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
            {mostrados.map((o, i) => (
              <Fila key={o.value} o={o} i={i} listId={listId} activa={i === active} elegida={o.value === value}
                words={typing ? words : NINGUNA} onActivar={onActivar} onElegir={onElegir} />
            ))}
            {hayMas && <li ref={centinelaRef} aria-hidden className="combobox__empty" style={{ minHeight: 40 }}><span className="spinner spinner--xs" aria-hidden /></li>}
            {showCreate && acciones.map((ac, k) => (
              <li
                key={ac.label}
                id={`${listId}-${mostrados.length + k}`}
                data-index={mostrados.length + k}
                role="option"
                aria-selected={false}
                className={`combobox__option combobox__create${active === mostrados.length + k ? ' is-active' : ''}`}
                onPointerEnter={() => setActive(mostrados.length + k)}
                onClick={() => create(k)}
              >
                <span className="combobox__icon">{ac.icon ?? <Plus size={16} strokeWidth={2.5} />}</span>
                <span className="combobox__text">
                  <span className="combobox__label">{text ? <>{ac.label} «{text}»</> : ac.label}</span>
                  {k === 0 && !results.length && text && <span className="combobox__desc">No está en la lista</span>}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );

  if (!hoja) return buscador;

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
      {/* ligera: solo opacidad y escala, sin desenfoque; la búsqueda se abre muchas veces y debe aparecer al instante */}
      <Sheet open={open} onClose={close} title={tituloHoja ?? placeholder} ligera>
        {buscador}
      </Sheet>
    </>
  );
}
