import { useState } from 'react';
import { Check } from 'lucide-react';
import { ACENTO_POR_DEFECTO, PALETA_ACENTO, acentoGuardado, guardarAcento } from '../lib/accent';
import { haptic } from '../lib/haptics';

/** Selector de color de la app: una fila de muestras; el cambio se ve al instante y queda guardado */
export function AccentPicker() {
  const [actual, setActual] = useState(acentoGuardado);
  const elegir = (hex: string) => { haptic('selection'); setActual(hex); guardarAcento(hex); };
  return (
    <div className="accent-picker" role="radiogroup" aria-label="Color de la app">
      {PALETA_ACENTO.map(c => {
        const sel = c.hex.toLowerCase() === actual.toLowerCase();
        return (
          <button key={c.hex} type="button" role="radio" aria-checked={sel} aria-label={c.nombre} title={c.nombre}
            className={`accent-picker__muestra${sel ? ' accent-picker__muestra--sel' : ''}`}
            style={{ background: c.hex }} onClick={() => elegir(c.hex)}>
            {sel && <Check size={16} strokeWidth={3} />}
          </button>
        );
      })}
      {actual.toLowerCase() !== ACENTO_POR_DEFECTO && (
        <button type="button" className="accent-picker__reset" onClick={() => elegir(ACENTO_POR_DEFECTO)}>Restablecer</button>
      )}
    </div>
  );
}
