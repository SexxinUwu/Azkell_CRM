// Plano 2D de la unidad: dibujo técnico de líneas, vista superior con el frente a la derecha (sin carrocería ni sombras).
// Cada posición es un grupo con data-ntb-pos: el tablero lo usa para tocar y arrastrar llantas igual que en el resto de vistas.
import { CONFIGURACIONES } from '../inspecciones/components/ChasisEsquemaVisual';
import { remanenteDe, tonoMm, type LlantaDato } from './NeumaticosEsquema';

const SEP = 124;       // distancia entre ejes
const LARGO = 66;      // llanta a lo largo de la unidad
const ANCHO = 24;      // llanta a lo ancho
const Y_RIEL = 36;     // semiancho del chasis
const Y_EXT = 76;      // centro de la llanta exterior
const SEPARACION_DUAL = ANCHO + 3;

const normal = (p: string) => String(p).trim().toUpperCase();

interface Rueda { pos: string; x: number; y: number }

export function PlanoTecnico({ configuracion, llantas, activa, sobre, camion = false }: {
  configuracion: string; llantas: LlantaDato[]; activa: string; sobre: string | null; camion?: boolean;
}) {
  const config = CONFIGURACIONES[configuracion];
  if (!config) return null;
  const datos = new Map(llantas.map(l => [normal(l.posicion), l] as const));

  // Ejes de adelante hacia atrás: el delantero en x = 0 y los demás hacia la izquierda
  const xEje = config.ejes.map((_, i) => -i * SEP);
  const ruedas: Rueda[] = [];
  config.ejes.forEach((eje, i) => {
    // La izquierda de la unidad queda arriba en pantalla (el frente va a la derecha)
    ([[-1, eje.izquierda], [1, eje.derecha]] as Array<[number, string[]]>).forEach(([lado, posiciones]) => {
      posiciones.forEach((pos, k) => {
        const y = lado * (posiciones.length > 1 && k > 0 ? Y_EXT - SEPARACION_DUAL : Y_EXT);
        ruedas.push({ pos, x: xEje[i], y });
      });
    });
  });
  const xTrasero = xEje[xEje.length - 1] ?? 0;
  const repuestos = config.repuestos.filter(p => datos.has(p));
  const xRepuesto = xTrasero - 104;
  repuestos.forEach((pos, i) => ruedas.push({ pos, x: xRepuesto, y: repuestos.length === 1 ? 0 : (i === 0 ? -16 : 16) }));

  const xMin = (repuestos.length ? xRepuesto : xTrasero) - LARGO / 2 - 24;
  const xMaxChasis = 46;
  const xMax = config.cabina ? 236 : 120;
  const alto = 98;
  const trazo = 'var(--label-2)';
  const fino = { stroke: trazo, strokeWidth: 1.6, fill: 'none', strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

  return (
    <svg className="nv3-plano__svg" viewBox={`${xMin} ${-alto} ${xMax - xMin} ${alto * 2}`} preserveAspectRatio="xMidYMid meet"
      role="group" aria-label={`Plano de la unidad, configuración ${configuracion}`}>
      {/* Chasis: largueros, travesaños y ejes */}
      <g {...fino}>
        {[-Y_RIEL, Y_RIEL].map(y => <rect key={y} x={xMin + 16} y={y - 5} width={xMaxChasis - xMin - 16} height={10} rx={2} />)}
        {[...xEje.slice(0, -1).map(x => x - SEP / 2), 30].map(x => <line key={x} x1={x} x2={x} y1={-Y_RIEL} y2={Y_RIEL} />)}
        {[...xEje.slice(0, -1).map(x => x - SEP / 2)].map(x => <g key={`d${x}`}>
          <line x1={x - 22} x2={x + 22} y1={-Y_RIEL} y2={Y_RIEL} /><line x1={x - 22} x2={x + 22} y1={Y_RIEL} y2={-Y_RIEL} />
        </g>)}
        {xEje.map(x => <line key={`e${x}`} x1={x} x2={x} y1={-Y_EXT} y2={Y_EXT} strokeWidth={2.4} />)}
      </g>

      {/* Frente: cabina con capó (camión o tracto) o lanza con perno rey (carreta) */}
      <g {...fino}>
        {config.cabina ? (
          <>
            <rect x={-12} y={-60} width={124} height={120} rx={16} />
            <path d="M 112 -48 L 212 -42 Q 222 -40 222 -30 L 222 30 Q 222 40 212 42 L 112 48" />
            <path d="M 90 -46 Q 102 0 90 46" />
            <line x1={210} x2={210} y1={-30} y2={30} />
            <circle cx={124} cy={-62} r={5} /><circle cx={124} cy={62} r={5} />
            {!camion && <circle cx={xEje[1] !== undefined ? xEje[1] + 40 : -40} cy={0} r={20} />}
          </>
        ) : (
          <>
            <circle cx={36} cy={0} r={10} />
            <line x1={36} y1={0} x2={-4} y2={-Y_RIEL} /><line x1={36} y1={0} x2={-4} y2={Y_RIEL} />
          </>
        )}
      </g>

      {/* Posiciones */}
      {ruedas.map(r => {
        const dato = datos.get(r.pos);
        const tono = dato ? tonoMm(remanenteDe(dato)) : null;
        const tinte = tono ? (tono === 'gray' ? 'var(--fill)' : `var(--${tono}-tint)`) : 'transparent';
        const tinta = tono ? (tono === 'gray' ? 'var(--label-3)' : `var(--${tono}-ink)`) : trazo;
        const esActiva = normalOf(activa) === r.pos;
        const esDestino = !!sobre && normalOf(sobre) === r.pos;
        return (
          <g key={r.pos} data-ntb-pos={r.pos} className={`nv3-plano__llanta${esActiva ? ' nv3-plano__llanta--activa' : ''}${esDestino ? ' nv3-plano__llanta--destino' : ''}`}
            aria-label={`Llanta ${r.pos}: ${dato ? 'montada' : 'libre'}`} role="button" tabIndex={-1}>
            <rect className="nv3-plano__marco" x={r.x - LARGO / 2 - 5} y={r.y - ANCHO / 2 - 5} width={LARGO + 10} height={ANCHO + 10} rx={11} />
            <rect x={r.x - LARGO / 2} y={r.y - ANCHO / 2} width={LARGO} height={ANCHO} rx={8}
              fill={tinte} stroke={tinta} strokeWidth={dato ? 2 : 1.4} strokeDasharray={dato ? undefined : '4 3'} />
            {dato && [-0.3, 0.3].map(f => <line key={f} x1={r.x + f * LARGO} x2={r.x + f * LARGO} y1={r.y - ANCHO / 2 + 3} y2={r.y + ANCHO / 2 - 3} stroke={tinta} strokeWidth={1} opacity={0.5} />)}
            <text x={r.x} y={r.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={dato ? tinta : trazo} pointerEvents="none">{r.pos}</text>
          </g>
        );
      })}
    </svg>
  );
}

function normalOf(p: string): string { return normal(p); }
