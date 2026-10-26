// Piezas pequeñas del tablero de neumáticos: remanente con el semáforo, fila de llanta y mapeo al diagrama.
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Badge } from '../../core/ui/Display';
import { tonoMm, ETIQUETA_TONO, type Tono } from './neumaticosSemaforo';
import type { LlantaDato } from './NeumaticosEsquema';
import type { LlantaTablero } from './neumaticos-tablero-tipos';
import { tituloLlanta, vidaTexto } from './ntb-api';

/** Remanente en mm con el color del semáforo (verde, ámbar, rojo o gris sin dato) */
export function RemanenteChip({ mm }: { mm: number | null | undefined }) {
  const tono: Tono = tonoMm(mm ?? null);
  return (
    <span className={`ntb-rem ntb-rem--${tono}`} title={ETIQUETA_TONO[tono]}>
      {mm == null ? 'Sin medir' : `${mm.toFixed(1)} mm`}
    </span>
  );
}

/** Vida de la llanta (R0…R3) como insignia */
export function VidaChip({ vida }: { vida: unknown }) {
  const texto = vidaTexto(vida);
  return <Badge tone={texto === 'R0' ? 'green' : texto === '—' ? 'gray' : 'accent'}>{`Vida ${texto}`}</Badge>;
}

/** Llanta como dato del diagrama de ejes (EsquemaNeumaticos) */
export function aLlantaDato(l: LlantaTablero, posicion: string): LlantaDato {
  return { posicion, marca: l.marca, modelo: l.modelo, medida: l.medida, remanente_promedio: l.remanente_mm };
}

interface LlantaItemProps {
  llanta: LlantaTablero;
  /** Posición donde está montada (para la lista de la unidad) */
  posicion?: string | null;
  activa?: boolean;
  /** Llanta que se puede arrastrar: se maneja con el gesto (no con clic) */
  arrastrable?: boolean;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onActivar: () => void;
}

/** Fila de una llanta: código, medida, vida y remanente. Toque o Enter la selecciona. */
export function LlantaItem({ llanta, posicion, activa, arrastrable, onPointerDown, onActivar }: LlantaItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`ntb-llanta${activa ? ' ntb-llanta--activa' : ''}${arrastrable ? ' ntb-llanta--arrastrable' : ''}`}
      aria-label={`Llanta ${llanta.codigo}, ${tituloLlanta(llanta)}`}
      aria-pressed={activa}
      onPointerDown={onPointerDown}
      onClick={arrastrable ? undefined : onActivar}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivar(); } }}
    >
      <div className="ntb-llanta__cuerpo">
        <span className="ntb-llanta__codigo">{llanta.codigo}</span>
        <span className="ntb-llanta__sub">{tituloLlanta(llanta)}</span>
      </div>
      <div className="ntb-llanta__meta">
        {posicion && <span className="ntb-pos">{posicion}</span>}
        <RemanenteChip mm={llanta.remanente_mm} />
      </div>
    </div>
  );
}
