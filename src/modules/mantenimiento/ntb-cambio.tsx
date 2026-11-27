import type { Cocada } from './nhv2-datos';
import { estimarCambio } from './neumaticosVida';

// Kilometraje proyectado de la llanta, con las dos fórmulas de la empresa (ver neumaticosVida.ts). Va en la ficha del neumático.

const n = (v: number) => v.toLocaleString('es-PE');

export function CambioEstimadoDetalle({ c }: { c: Cocada | null }) {
  const inspecciones = (c?.mediciones ?? []).filter(m => m.origen !== 'Alta');
  const ultima = inspecciones.length ? inspecciones[inspecciones.length - 1] : null;
  const montaje = c && c.montajes.length ? c.montajes[c.montajes.length - 1] : null;
  const e = estimarCambio({ inicial: c?.inicial ?? null, minimoUltima: ultima?.minimo ?? null, kmUltima: ultima?.km ?? null, kmMontaje: montaje?.kmIn ?? null });
  if (!e.ok) return <p className="nhv__nota">{e.motivo}</p>;
  return (
    <div className="nhv-formulas">
      <div className="nhv-formula">
        <span className="nhv-formula__nombre">Km / MM</span>
        <span className="nhv-formula__texto">(Km insp − Km mont) ÷ (MM ini − MM insp)</span>
        <span className="nhv-formula__cuenta">({n(e.kmUltima)} − {n(e.kmMontaje)}) ÷ ({e.inicial} − {e.minimoUltima})</span>
        <strong className="nhv-formula__resultado">{n(e.kmPorMm)} km por mm</strong>
      </div>
      <div className="nhv-formula">
        <span className="nhv-formula__nombre">Km proyectado</span>
        <span className="nhv-formula__texto">(MM ini − MM ret) × Km / MM</span>
        <span className="nhv-formula__cuenta">({e.inicial} − {e.reten}) × {n(e.kmPorMm)}</span>
        <strong className="nhv-formula__resultado">{n(e.kmProyectado)} km</strong>
      </div>
    </div>
  );
}
