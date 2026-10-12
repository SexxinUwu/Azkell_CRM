import { useState } from 'react';
import { motion } from 'motion/react';
import { springSnappy } from '../lib/motion';
import { haptic } from '../lib/haptics';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string; // para lectores de pantalla
  id?: string;
}

// Medidas del pulgar (rem): reposo y estirado al presionar (iOS 26).
const THUMB = 1.6875;
const STRETCH = 0.45;
const TRAVEL = 1.25;

// Interruptor estilo iOS. Al tocar, el pulgar se estira hacia el lado al que irá
// (respuesta inmediata); al soltar se desliza con resorte y es interrumpible.
export function Switch({ checked, onChange, disabled, label, id }: SwitchProps) {
  const [pressed, setPressed] = useState(false);
  const width = THUMB + (pressed ? STRETCH : 0);
  const x = checked ? TRAVEL - (pressed ? STRETCH : 0) : 0;

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={() => {
        haptic('selection');
        onChange(!checked);
      }}
    >
      <motion.span
        className="switch__thumb"
        initial={false}
        animate={{ x: `${x}rem`, width: `${width}rem` }}
        transition={springSnappy}
      />
    </button>
  );
}
