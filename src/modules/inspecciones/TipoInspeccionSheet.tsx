import { Disc3, Truck } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import './inspecciones.css';

// Al pulsar "Inspeccionar": elige el diagnóstico. Cada opción abre su propio formulario.
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
          <button type="button" className="insp-tipo pressable" onClick={onNeumaticos}>
            <span className="insp-tipo__icono insp-tipo__icono--neumaticos"><Disc3 size={22} /></span>
            <span className="insp-tipo__titulo">Neumáticos</span>
            <span className="insp-tipo__texto">Medición de remanente (R1-R4), presión PSI, marcas y control de desgaste.</span>
          </button>
          <button type="button" className="insp-tipo pressable" onClick={onMecanica}>
            <span className="insp-tipo__icono insp-tipo__icono--mecanica"><Truck size={22} /></span>
            <span className="insp-tipo__titulo">Mecánica Integral</span>
            <span className="insp-tipo__texto">Checklist por sistemas: motor, frenos, luces, suspensión, chasis y cabina.</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}
