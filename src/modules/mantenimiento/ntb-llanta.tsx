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

/** El menor de las tres medidas (la franja más gastada); si no hay franjas, el remanente guardado */
export function remanenteMinimo(l: Pick<LlantaTablero, 'r1' | 'r2' | 'r3' | 'remanente_mm'>): number | null {
  const m = [l.r1, l.r2, l.r3].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  return m.length ? Math.min(...m) : (l.remanente_mm ?? null);
}

const COLOR_BANDA: Record<Tono, string> = { green: 'var(--green-ink)', amber: 'var(--amber-ink)', red: 'var(--red-ink)', gray: '#8e8e93' };

/**
 * Neumático dibujado (de frente, vertical) con tres franjas de color, una por cada medida: R1 arriba, R2 al centro y R3 abajo,
 * cada una con el semáforo de su remanente. El aro exterior toma el color de la franja más gastada (el mínimo).
 */
export function LlantaIcono({ llanta, activa = false }: { llanta: Pick<LlantaTablero, 'r1' | 'r2' | 'r3' | 'remanente_mm'>; activa?: boolean }) {
  const min = remanenteMinimo(llanta);
  const hayFranjas = [llanta.r1, llanta.r2, llanta.r3].some(v => typeof v === 'number' && v > 0);
  // Sin franjas pero con un remanente conocido, las tres toman ese tono; sin dato, gris
  const tonos: Tono[] = [llanta.r1, llanta.r2, llanta.r3].map(v => (hayFranjas ? tonoMm(typeof v === 'number' && v > 0 ? v : null) : tonoMm(min)));
  const aro = COLOR_BANDA[tonoMm(min)];
  return (
    <svg className="ntb-ico" viewBox="0 0 40 62" width="40" height="62" aria-hidden focusable="false">
      <defs>
        <clipPath id="ntb-recorte"><rect x="4" y="4" width="32" height="54" rx="9" /></clipPath>
      </defs>
      <g clipPath="url(#ntb-recorte)">
        {tonos.map((t, k) => <rect key={k} x="4" y={4 + k * 18} width="32" height="18" fill={COLOR_BANDA[t]} opacity="0.88" />)}
        {[11, 18, 25, 32, 39, 46].map(y => <line key={y} x1="4" x2="36" y1={y} y2={y} stroke="#1f2125" strokeWidth="1.5" opacity="0.5" />)}
        <rect x="4" y="4" width="10" height="54" fill="#000" opacity="0.14" /><rect x="26" y="4" width="10" height="54" fill="#000" opacity="0.2" />
      </g>
      <rect x="4" y="4" width="32" height="54" rx="9" fill="none" stroke="#3a3d42" strokeWidth="1" />
      <rect x="1.5" y="1.5" width="37" height="59" rx="11" fill="none" stroke={aro} strokeWidth={activa ? 3.4 : 2.6} />
    </svg>
  );
}

interface LlantaTileProps {
  llanta: LlantaTablero;
  activa?: boolean;
  /** Llanta que se puede arrastrar: se maneja con el gesto (no con clic) */
  arrastrable?: boolean;
  /** Esta ficha es la que se está arrastrando: queda atenuada mientras el neumático va con el puntero */
  enMano?: boolean;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onActivar: () => void;
}

/** Contenido de una ficha de llanta: el neumático dibujado con su código y su remanente mínimo */
export function LlantaFicha({ llanta, activa }: { llanta: LlantaTablero; activa?: boolean }) {
  const min = remanenteMinimo(llanta);
  return (
    <>
      <LlantaIcono llanta={llanta} activa={activa} />
      <span className="ntb-tile__codigo">{llanta.codigo}</span>
      <span className="ntb-tile__mm">{min == null ? 'Sin medir' : `${min.toFixed(1)} mm`}</span>
    </>
  );
}

/** Llanta como neumático dibujado, con su código y remanente debajo (bodega, reforma y descarte). Toque o Enter la selecciona. */
export function LlantaTile({ llanta, activa, arrastrable, enMano, onPointerDown, onActivar }: LlantaTileProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`ntb-tile${activa ? ' ntb-tile--activa' : ''}${arrastrable ? ' ntb-tile--arrastrable' : ''}${enMano ? ' ntb-tile--en-mano' : ''}`}
      title={`${llanta.codigo} · ${tituloLlanta(llanta)}`}
      aria-label={`Llanta ${llanta.codigo}, ${tituloLlanta(llanta)}`}
      aria-pressed={activa}
      onPointerDown={onPointerDown}
      onClick={arrastrable ? undefined : onActivar}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivar(); } }}
      style={arrastrable ? { userSelect: 'none', WebkitUserDrag: 'none' } as CSSProperties : undefined}
    >
      <LlantaFicha llanta={llanta} activa={activa} />
    </div>
  );
}

/**
 * El neumático tal como se dibuja en el plano de la unidad (goma gris con su banda, aro del semáforo y el círculo blanco del número).
 * Es lo que se lleva pegado al puntero al arrastrar una llanta desde las listas: así se ve igual que las demás al soltarla en su posición.
 */
export function LlantaPlano({ llanta }: { llanta: Pick<LlantaTablero, 'r1' | 'r2' | 'r3' | 'remanente_mm'> }) {
  const aro = COLOR_BANDA[tonoMm(remanenteMinimo(llanta))];
  const surcos = [14, 21, 28, 35, 42, 49, 56];
  return (
    <svg className="ntb-ico-plano" viewBox="0 0 34 72" width="34" height="72" aria-hidden focusable="false">
      <defs>
        <linearGradient id="ntb-goma-plano" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#4a4e55" /><stop offset="0.5" stopColor="#7d828a" /><stop offset="1" stopColor="#4a4e55" />
        </linearGradient>
      </defs>
      <rect x="5" y="6" width="24" height="60" rx="5" fill="url(#ntb-goma-plano)" stroke="#3a3d42" strokeWidth="1" />
      {surcos.map(y => <line key={y} x1="7" x2="27" y1={y} y2={y} stroke="#2f3237" strokeWidth="1.3" opacity="0.55" />)}
      <rect x="2.5" y="3.5" width="29" height="65" rx="7.5" fill="none" stroke={aro} strokeWidth="2.4" />
      <circle cx="17" cy="36" r="8.5" fill="#ffffff" opacity="0.92" />
    </svg>
  );
}
