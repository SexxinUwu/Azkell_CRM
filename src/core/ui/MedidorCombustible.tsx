import { SelectInput } from './Field';
import './medidor.css';

// Medidor de combustible tipo tablero: el porcentaje se elige en una lista (de 5 en 5) o con el control deslizante,
// y la aguja se mueve con transición suave hacia el valor (E = 0 %, F = 100 %).
const OPCIONES = Array.from({ length: 21 }, (_, i) => i * 5);

export function MedidorCombustible({ value, onChange, label = 'Nivel de combustible', disabled }: {
  value: number | null;
  onChange: (pct: number) => void;
  label?: string;
  disabled?: boolean;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const giro = -90 + pct * 1.8; // -90° = E, +90° = F
  const marcas = Array.from({ length: 21 }, (_, i) => {
    const a = (-90 + i * 9) * Math.PI / 180, r1 = i % 4 === 0 ? 68 : 74, r2 = 86;
    return <line key={i} x1={100 + r1 * Math.sin(a)} y1={100 - r1 * Math.cos(a)} x2={100 + r2 * Math.sin(a)} y2={100 - r2 * Math.cos(a)}
      className={i <= 2 ? 'medidor__marca medidor__marca--roja' : 'medidor__marca'} />;
  });
  return (
    <div className="medidor" role="group" aria-label={label}>
      <svg viewBox="0 0 200 120" className="medidor__svg" aria-hidden>
        <path d="M 15 100 A 85 85 0 0 1 185 100" className="medidor__arco" />
        {marcas}
        <text x="14" y="112" className="medidor__letra medidor__letra--e">E</text>
        <text x="180" y="112" className="medidor__letra">F</text>
        <g className="medidor__surtidor" transform="translate(94 52)">
          <rect x="0" y="0" width="9" height="11" rx="1.5" /><path d="M9 3 q5 0 5 5 v4" fill="none" strokeWidth="1.6" />
        </g>
        <g className="medidor__aguja" style={{ transform: `rotate(${giro}deg)` }}>
          <polygon points="97,100 103,100 100,22" />
        </g>
        <circle cx="100" cy="100" r="7" className="medidor__eje" />
      </svg>
      <div className="medidor__valor t-numeric">{value == null ? 'Sin medir' : `${pct}%`}</div>
      <div className="medidor__controles">
        <SelectInput aria-label={`${label} (%)`} disabled={disabled} value={value == null ? '' : String(pct)}
          onChange={e => onChange(Number(e.target.value))}>
          <option value="" disabled>Elige el nivel</option>
          {OPCIONES.map(o => <option key={o} value={o}>{o}%</option>)}
        </SelectInput>
        <input type="range" min={0} max={100} step={5} disabled={disabled} className="medidor__rango" aria-label={`${label} (deslizar)`}
          value={pct} onChange={e => onChange(Number(e.target.value))} />
      </div>
    </div>
  );
}
