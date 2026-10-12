import { useId } from 'react';
import { motion } from 'motion/react';
import { springSnappy } from '../lib/motion';
import { haptic } from '../lib/haptics';

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
  /** Ocupa todo el ancho (formularios) */
  block?: boolean;
}

// Control segmentado: el fondo seleccionado se desliza (resorte) hacia la opción elegida.
export function SegmentedControl<T extends string>({ value, onChange, options, label, block }: SegmentedControlProps<T>) {
  const layoutId = useId();
  return (
    <div className={`segmented${block ? ' segmented--block' : ''}`} role="group" aria-label={label}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          className="segmented__item"
          aria-pressed={opt.value === value}
          onClick={() => {
            if (opt.value !== value) haptic('selection');
            onChange(opt.value);
          }}
        >
          {opt.value === value && <motion.span layoutId={layoutId} className="segmented__thumb" transition={springSnappy} />}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
