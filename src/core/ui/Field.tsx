import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Search } from 'lucide-react';
import { EyeIcon } from './EyeToggle';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
}

// Etiqueta + control + ayuda/error, conectados para lectores de pantalla.
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error || hint ? descId : undefined })}
      {error ? (
        <span id={descId} className="field__error" role="alert">{error}</span>
      ) : hint ? (
        <span id={descId} className="field__hint">{hint}</span>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className = '', ...props },
  ref,
) {
  return <input ref={ref} className={`input ${className}`} {...props} />;
});

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function PasswordInput(
  props,
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-wrap">
      <input ref={ref} className="input" type={visible ? 'text' : 'password'} {...props} />
      <button
        type="button"
        className="input-wrap__action"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        <EyeIcon visible={visible} />
      </button>
    </div>
  );
});

export function SelectInput({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`select ${className}`} {...props}>
      {children}
    </select>
  );
}

export function SearchField({ value, onChange, placeholder = 'Buscar' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="search">
      <Search size={16} />
      <input
        className="input"
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}
