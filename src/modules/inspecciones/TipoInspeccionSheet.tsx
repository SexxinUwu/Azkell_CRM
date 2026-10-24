import type { PointerEvent as ReactPointerEvent } from 'react';
import { Disc3, Truck } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import './inspecciones.css';

// Al pulsar "Inspeccionar": elige el diagnóstico. Cada opción abre su propio formulario.
// La onda sale desde el punto donde entra el puntero, para que el efecto de agua parta de la tarjeta tocada.
function marcarOrigen(e: ReactPointerEvent<HTMLButtonElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--px', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--py', `${e.clientY - r.top}px`);
}

export function TipoInspeccionSheet({ placa, onClose, onMecanica, onNeumaticos }: {
  placa: string | null; onClose: () => void; onMecanica: () => void; onNeumaticos: () => void;
}) {
  return (
    <Sheet open={!!placa} onClose={onClose} title="Seleccionar inspección">
      <div className="insp-tipos">
        <p className="t-callout c-secondary">
          Elige el tipo de diagnóstico técnico que deseas realizar para <strong>{placa ?? ''}</strong>.
        </p>
        <div className="insp-tipos__lista">
          <button type="button" className="insp-tipo pressable" onPointerEnter={marcarOrigen} onClick={onNeumaticos}>
            <span className="insp-tipo__icono insp-tipo__icono--neumaticos"><Disc3 size={22} /></span>
            <span className="insp-tipo__titulo">Neumáticos</span>
            <span className="insp-tipo__texto">Medición de remanente (R1-R4), presión PSI, marcas y control de desgaste.</span>
          </button>
          <button type="button" className="insp-tipo pressable" onPointerEnter={marcarOrigen} onClick={onMecanica}>
            <span className="insp-tipo__icono insp-tipo__icono--mecanica"><Truck size={22} /></span>
            <span className="insp-tipo__titulo">Mecánica Integral</span>
            <span className="insp-tipo__texto">Checklist por sistemas: motor, frenos, luces, suspensión, chasis y cabina.</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}
