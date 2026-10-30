import { CargaCamion } from './CargaCamion';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'accent' | 'secondary' | 'plain' | 'danger' | 'destructive';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block, loading, icon, iconOnly, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  const cls = [
    'btn',
    `btn--${variant}`,
    size !== 'md' && `btn--${size}`,
    block && 'btn--block',
    iconOnly && 'btn--icon',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {!iconOnly && children}
    </button>
  );
});

export function Spinner({ large, label = 'Cargando' }: { large?: boolean; label?: string }) {
  return <span className={`spinner${large ? ' spinner--lg' : ''}`} role="status" aria-label={label} />;
}

// Cualquier carga de pantalla muestra el camión (el círculo queda solo para botones)
export function PageLoader({ variante = 'camion' }: { variante?: 'circulo' | 'camion' }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
      {variante === 'camion' ? <CargaCamion /> : <Spinner large />}
    </div>
  );
}
