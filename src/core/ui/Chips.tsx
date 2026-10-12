import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

interface Option<T extends string> {
  value: T;
  label: ReactNode;
}

// Selección múltiple con chips (p. ej. conductores de una unidad).
export function ToggleChips<T extends string>({ options, value, onChange, label }: {
  options: Option<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  label: string;
}) {
  const selected = new Set(value);
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map(opt => {
        const on = selected.has(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            className="chip"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter(v => v !== opt.value) : [...value, opt.value])}
          >
            {on && <Check size={14} strokeWidth={3} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Selección única con chips (más de 4 opciones, donde un segmentado no cabe).
export function ChoiceChips<T extends string>({ options, value, onChange, label }: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          className="chip"
          aria-checked={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
