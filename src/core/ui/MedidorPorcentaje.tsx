import { Minus, Plus } from 'lucide-react';
import { haptic } from '../lib/haptics';
import './medidor-porcentaje.css';

/**
 * Medición en porcentaje con barra moderna: valor grande, barra que se llena, − y + de 5 en 5 y atajos 25 / 50 / 75 / 100.
 * Mientras no se toque queda en "Sin medir" y la barra se ve apagada.
 */
export function MedidorPorcentaje({ value, onChange, label, disabled }: {
  value: number | null;
  onChange: (pct: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const fijar = (n: number) => { haptic('selection'); onChange(Math.max(0, Math.min(100, Math.round(n / 5) * 5))); };
  return (
    <div className={`pct${value == null ? ' pct--vacio' : ''}`} role="group" aria-label={label}>
      <div className="pct__cab">
        <button type="button" className="pct__paso" onClick={() => fijar((value ?? 50) - 5)} disabled={disabled} aria-label="Bajar 5 %"><Minus size={16} /></button>
        <span className="pct__valor t-numeric">{value == null ? 'Sin medir' : `${pct}%`}</span>
        <button type="button" className="pct__paso" onClick={() => fijar((value ?? 45) + 5)} disabled={disabled} aria-label="Subir 5 %"><Plus size={16} /></button>
      </div>
      <input type="range" min={0} max={100} step={5} className="pct__rango" aria-label={`${label} (%)`} disabled={disabled}
        value={value == null ? 50 : pct} style={{ ['--p' as string]: `${value == null ? 0 : pct}%` }} onChange={e => onChange(Number(e.target.value))} />
      <div className="pct__atajos">
        {[25, 50, 75, 100].map(a => (
          <button key={a} type="button" className={`pct__atajo${value === a ? ' pct__atajo--on' : ''}`} onClick={() => fijar(a)} disabled={disabled}>{a}%</button>
        ))}
      </div>
    </div>
  );
}
