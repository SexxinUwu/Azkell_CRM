import { useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { springSnappy } from '../lib/motion';

interface TagInputProps {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  /** Normaliza y valida cada entrada; devuelve null si no es válida */
  parse: (raw: string) => string | null;
  onInvalid?: (raw: string | null) => void;
  placeholder?: string;
  inputMode?: 'email' | 'text';
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

// Varias entradas en un solo campo (p. ej. correos). Se agregan con Enter, coma, espacio
// o al salir del campo; se quitan con su "×" o con Retroceso.
export function TagInput({ id, value, onChange, parse, onInvalid, placeholder, inputMode = 'text', ...aria }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const raw = draft.trim().replace(/[,;]+$/, '');
    if (!raw) return true;
    const parsed = parse(raw);
    if (!parsed) {
      onInvalid?.(raw);
      return false;
    }
    onInvalid?.(null);
    if (!value.includes(parsed)) onChange([...value, parsed]);
    setDraft('');
    return true;
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === ' ') {
      if (draft.trim()) {
        e.preventDefault();
        commit();
      } else if (e.key !== 'Enter') {
        e.preventDefault();
      }
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="tag-input" onClick={() => inputRef.current?.focus()} aria-invalid={aria['aria-invalid']}>
      <AnimatePresence initial={false}>
        {value.map(tag => (
          <motion.span
            key={tag}
            className="tag"
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={springSnappy}
          >
            {tag}
            <button type="button" aria-label={`Quitar ${tag}`} onClick={() => onChange(value.filter(v => v !== tag))}>
              <X size={13} strokeWidth={2.5} />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      <input
        ref={inputRef}
        id={id}
        value={draft}
        inputMode={inputMode}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={value.length ? '' : placeholder}
        onChange={e => {
          onInvalid?.(null);
          // Pegar una lista: "a@x.pe, b@x.pe"
          const v = e.target.value;
          if (/[,;\s]/.test(v.trim()) && v.trim().split(/[,;\s]+/).length > 1) {
            const parts = v.split(/[,;\s]+/).map(p => p.trim()).filter(Boolean);
            const good = parts.map(parse).filter((p): p is string => !!p);
            onChange([...new Set([...value, ...good])]);
            const bad = parts.filter(p => !parse(p));
            setDraft(bad.join(' '));
            if (bad.length) onInvalid?.(bad[0]);
            return;
          }
          setDraft(v);
        }}
        onKeyDown={onKeyDown}
        onBlur={commit}
        aria-describedby={aria['aria-describedby']}
      />
    </div>
  );
}
