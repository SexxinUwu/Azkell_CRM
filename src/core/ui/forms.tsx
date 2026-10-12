// Piezas de formulario compartidas: números, correos y filas con interruptor.
import { useId, type ReactNode } from 'react';
import { Switch } from './Switch';

/** "15,40" o "15.40" → 15.4 · vacío → null · texto inválido → NaN */
export function parseDecimal(raw: string): number | null {
  const v = raw.trim().replace(',', '.');
  if (!v) return null;
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
}

/** 15.4 → "15.40" (al menos 2 decimales, hasta 4) para mostrar en un campo */
export const priceDraft = (n: number | null | undefined) => (n == null ? '' : n.toFixed(Math.min(4, Math.max(2, (String(n).split('.')[1] ?? '').length))));

export function parseEmail(raw: string) {
  const v = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/** Solo números y un separador decimal, mientras se escribe */
export const decimalInput = (v: string) => v.replace(/[^\d.,]/g, '');
export const digitsInput = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

// Fila con interruptor (estilo Ajustes de iOS): título, explicación y switch a la derecha.
export function SwitchRow({ title, subtitle, checked, onChange, disabled }: {
  title: string;
  subtitle?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="row">
      <label className="row__main" htmlFor={id}>
        <div className="row__title">{title}</div>
        {subtitle && <div className="row__subtitle row__subtitle--wrap">{subtitle}</div>}
      </label>
      <Switch id={id} label={title} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}
