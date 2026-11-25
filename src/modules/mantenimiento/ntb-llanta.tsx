// Piezas pequeñas del tablero de neumáticos: remanente con el semáforo, fila de llanta y mapeo al diagrama.
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
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
  return { posicion, marca: l.marca, modelo: l.modelo, medida: l.medida, remanente_promedio: l.remanente_mm, r1: l.r1, r2: l.r2, r3: l.r3 };
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
      style={arrastrable ? { userSelect: 'none', WebkitUserDrag: 'none' } as CSSProperties : undefined}
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

/** Neumático dibujado (de frente, vertical) con el aro del semáforo de remanente: el mismo que se ve en el plano de la unidad */
export function LlantaIcono({ tono, activa = false }: { tono: Tono; activa?: boolean }) {
  const aro = tono === 'gray' ? 'var(--label-3)' : `var(--${tono}-ink)`;
  const surcos = [11, 18, 25, 32, 39, 46];
  return (
    <svg className="ntb-ico" viewBox="0 0 40 62" width="40" height="62" aria-hidden focusable="false">
      <defs>
        <linearGradient id="ntb-goma" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#4a4e55" /><stop offset="0.5" stopColor="#7d828a" /><stop offset="1" stopColor="#4a4e55" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="32" height="54" rx="9" fill="url(#ntb-goma)" stroke="#3a3d42" strokeWidth="1" />
      {surcos.map(y => <line key={y} x1="6" x2="34" y1={y} y2={y} stroke="#2f3237" strokeWidth="1.6" opacity="0.55" />)}
      <rect x="1.5" y="1.5" width="37" height="59" rx="11" fill="none" stroke={aro} strokeWidth={activa ? 3.4 : 2.6} />
    </svg>
  );
}

interface LlantaTileProps {
  llanta: LlantaTablero;
  activa?: boolean;
  /** Llanta que se puede arrastrar: se maneja con el gesto (no con clic) */
  arrastrable?: boolean;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onActivar: () => void;
}

/** Llanta como neumático dibujado, con su código y remanente debajo (bodega, reforma y descarte). Toque o Enter la selecciona. */
export function LlantaTile({ llanta, activa, arrastrable, onPointerDown, onActivar }: LlantaTileProps) {
  const tono: Tono = tonoMm(llanta.remanente_mm ?? null);
  return (
    <div
      role="button"
      tabIndex={0}
      className={`ntb-tile${activa ? ' ntb-tile--activa' : ''}${arrastrable ? ' ntb-tile--arrastrable' : ''}`}
      title={`${llanta.codigo} · ${tituloLlanta(llanta)}`}
      aria-label={`Llanta ${llanta.codigo}, ${tituloLlanta(llanta)}`}
      aria-pressed={activa}
      onPointerDown={onPointerDown}
      onClick={arrastrable ? undefined : onActivar}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivar(); } }}
      style={arrastrable ? { userSelect: 'none', WebkitUserDrag: 'none' } as CSSProperties : undefined}
    >
      <LlantaIcono tono={tono} activa={activa} />
      <span className="ntb-tile__codigo">{llanta.codigo}</span>
      <span className="ntb-tile__mm">{llanta.remanente_mm == null ? 'Sin medir' : `${llanta.remanente_mm.toFixed(1)} mm`}</span>
    </div>
  );
}
