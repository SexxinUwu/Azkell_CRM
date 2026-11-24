// Plano 2D de la unidad: vista superior vertical con el frente arriba, sin cabina ni carrocería (chasis, ejes y llantas).
// Las llantas van grises con su banda dibujada y un aro con el color del semáforo de remanente.
// Cada posición es un grupo con data-ntb-pos: el tablero lo usa para tocar y arrastrar llantas igual que en el resto de vistas.
import { useRef, type CSSProperties } from 'react';
import { CONFIGURACIONES } from '../inspecciones/components/ChasisEsquemaVisual';
import { remanenteDe, tonoMm, type LlantaDato } from './NeumaticosEsquema';

const SEP = 150;        // distancia entre ejes
const ANCHO = 22;       // llanta a lo ancho de la unidad
const LARGO = 56;       // llanta a lo largo de la unidad
const X_RIEL = 19;      // centro de cada larguero
const X_EXT = 62;       // centro de la llanta exterior
const X_INT = 37;       // centro de la llanta interior (dual)
const MEDIO_EJE = 76;
const Y_PARACHOQUE = -92;

const normal = (p: string) => String(p).trim().toUpperCase();

interface Rueda { pos: string; x: number; y: number; plana?: boolean }

export function PlanoTecnico({ configuracion, llantas, activa, sobre, camion = false, animar = false, arrastrando = null }: {
  configuracion: string; llantas: LlantaDato[]; activa: string; sobre: string | null; camion?: boolean;
  /** El dibujo se traza en secuencia al montarse: largueros, ejes, parachoques y, al final, las llantas */
  animar?: boolean;
  /** Llanta de la unidad que se lleva con el puntero (coordenadas de pantalla): la propia llanta del dibujo la sigue y, al soltarla, vuelve a su sitio con una transición */
  arrastrando?: { posicion: string; x: number; y: number } | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const config = CONFIGURACIONES[configuracion];
  if (!config) return null;
  const datos = new Map(llantas.map(l => [normal(l.posicion), l] as const));

  // Ejes de adelante hacia atrás: el delantero en y = 0 y los demás hacia abajo
  const yEje = config.ejes.map((_, i) => i * SEP);
  const ruedas: Rueda[] = [];
  config.ejes.forEach((eje, i) => {
    // La izquierda de la unidad queda a la izquierda de la pantalla (el frente va arriba)
    ([[-1, eje.izquierda], [1, eje.derecha]] as Array<[number, string[]]>).forEach(([lado, posiciones]) => {
      posiciones.forEach((pos, k) => {
        ruedas.push({ pos, x: lado * (posiciones.length > 1 && k > 0 ? X_INT : X_EXT), y: yEje[i] });
      });
    });
  });
  const yTrasero = yEje[yEje.length - 1] ?? 0;
  const yParachoqueTrasero = yTrasero + 92;
  const repuestos = config.repuestos.filter(p => datos.has(p));
  // Repuestos tumbados bajo el parachoques trasero
  repuestos.forEach((pos, i) => ruedas.push({ pos, x: repuestos.length === 1 ? 0 : (i === 0 ? -34 : 34), y: yParachoqueTrasero + 40, plana: true }));

  const yMax = yParachoqueTrasero + (repuestos.length ? 66 : 22);
  const ancho = 100;
  const filo = '#3a3d42';
  // Cada elemento entra con un retraso propio (ms) sobre el retraso base de la transformación
  const d = (ms: number) => (animar ? ({ '--d': `${ms}ms` } as CSSProperties) : undefined);
  const cl = (nombre: string) => (animar ? `pt-${nombre}` : undefined);

  return (
    <svg ref={svgRef} className={`nv3-plano__svg${animar ? ' nv3-plano__svg--anim' : ''}`} viewBox={`${-ancho} ${Y_PARACHOQUE - 14} ${ancho * 2} ${yMax - Y_PARACHOQUE + 22}`} preserveAspectRatio="xMidYMid meet"
      role="group" aria-label={`Plano de la unidad, configuración ${configuracion}`}>
      <defs>
        <linearGradient id="nv3-metal-v" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#8d9299" /><stop offset="0.45" stopColor="#d9dce0" /><stop offset="1" stopColor="#7b8088" />
        </linearGradient>
        <linearGradient id="nv3-metal-h" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#8d9299" /><stop offset="0.45" stopColor="#d9dce0" /><stop offset="1" stopColor="#7b8088" />
        </linearGradient>
        <linearGradient id="nv3-goma" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#4a4e55" /><stop offset="0.5" stopColor="#7d828a" /><stop offset="1" stopColor="#4a4e55" />
        </linearGradient>
      </defs>

      {/* Largueros del chasis y travesaños */}
      <g stroke={filo} strokeWidth={0.8}>
        {[-X_RIEL, X_RIEL].map((x, i) => <rect key={x} className={cl('riel')} style={d(i * 90)} x={x - 3.5} y={Y_PARACHOQUE + 10} width={7} height={yParachoqueTrasero - Y_PARACHOQUE - 8} rx={2} fill="url(#nv3-metal-v)" />)}
        {[...yEje.slice(0, -1).map(y => y + SEP / 2), Y_PARACHOQUE + 40].map(y => <rect key={y} x={-X_RIEL} y={y - 2} width={X_RIEL * 2} height={4} rx={1} fill="url(#nv3-metal-h)" className={cl('eje')} style={d(450)} />)}
      </g>

      {/* Parachoques delantero (tracto o camión) o pivote de la carreta */}
      {config.cabina ? (
        <g stroke={filo} strokeWidth={0.9} fill="url(#nv3-metal-h)" className={cl('fade')} style={d(350)}>
          <path d={`M -46 ${Y_PARACHOQUE + 14} Q -46 ${Y_PARACHOQUE} -34 ${Y_PARACHOQUE} L 34 ${Y_PARACHOQUE} Q 46 ${Y_PARACHOQUE} 46 ${Y_PARACHOQUE + 14} L 46 ${Y_PARACHOQUE + 20} L -46 ${Y_PARACHOQUE + 20} Z`} />
          <rect x={-X_RIEL - 6} y={Y_PARACHOQUE + 18} width={12} height={10} rx={2} /><rect x={X_RIEL - 6} y={Y_PARACHOQUE + 18} width={12} height={10} rx={2} />
        </g>
      ) : (
        <g stroke={filo} strokeWidth={0.9} fill="url(#nv3-metal-h)" className={cl('fade')} style={d(350)}>
          <circle cx={0} cy={Y_PARACHOQUE + 40} r={9} />
          <line x1={0} y1={Y_PARACHOQUE + 40} x2={-X_RIEL} y2={Y_PARACHOQUE + 70} /><line x1={0} y1={Y_PARACHOQUE + 40} x2={X_RIEL} y2={Y_PARACHOQUE + 70} />
        </g>
      )}

      {/* Ejes: barra con el diferencial al centro en los ejes que no son el delantero */}
      <g stroke={filo} strokeWidth={0.8}>
        {yEje.map((y, i) => (
          <g key={y} className={cl('eje')} style={d(500 + i * 160)}>
            <rect x={-MEDIO_EJE} y={y - 3} width={MEDIO_EJE * 2} height={6} rx={3} fill="url(#nv3-metal-h)" />
            {i > 0 && <circle cx={0} cy={y} r={7} fill="url(#nv3-metal-v)" />}
          </g>
        ))}
        {/* Quinta rueda del tracto, sobre el primer eje trasero */}
        {config.cabina && !camion && yEje.length > 1 && <circle cx={0} cy={yEje[1] - 22} r={9} fill="#f4f5f7" />}
      </g>

      {/* Parachoques trasero con sus luces */}
      <g stroke={filo} strokeWidth={0.9} className={cl('fade')} style={d(500 + yEje.length * 160)}>
        <rect x={-48} y={yParachoqueTrasero - 2} width={96} height={10} rx={3} fill="url(#nv3-metal-h)" />
        <rect x={-40} y={yParachoqueTrasero + 3} width={10} height={4} rx={1} fill="#e5484d" stroke="none" />
        <rect x={30} y={yParachoqueTrasero + 3} width={10} height={4} rx={1} fill="#e5484d" stroke="none" />
      </g>

      {/* Posiciones */}
      {ruedas.map((r, idx) => ({ r, idx })).sort((a, b) => Number(a.r.pos === arrastrando?.posicion) - Number(b.r.pos === arrastrando?.posicion)).map(({ r, idx }) => {
        const dato = datos.get(r.pos);
        const tono = dato ? tonoMm(remanenteDe(dato)) : null;
        const aro = tono ? (tono === 'gray' ? 'var(--label-3)' : `var(--${tono}-ink)`) : 'var(--label-3)';
        const w = r.plana ? LARGO : ANCHO;
        const h = r.plana ? ANCHO : LARGO;
        const esActiva = normal(activa) === r.pos;
        const esDestino = !!sobre && normal(sobre) === r.pos;
        const surcos = Array.from({ length: Math.floor((r.plana ? w : h) / 7) - 1 }, (_, i) => -(r.plana ? w : h) / 2 + 7 * (i + 1) + 3.5);
        // Llanta que se arrastra: el desplazamiento va en un grupo propio (así no choca con la animación de entrada)
        const llevada = arrastrando?.posicion === r.pos;
        let mueve = { dx: 0, dy: 0 };
        const svg = svgRef.current;
        const ctm = svg?.getScreenCTM();
        if (llevada && svg && ctm) {
          const punto = svg.createSVGPoint();
          punto.x = arrastrando.x; punto.y = arrastrando.y;
          const p = punto.matrixTransform(ctm.inverse());
          mueve = { dx: p.x - r.x, dy: p.y - r.y };
        }
        return (
          <g key={r.pos} className="nv3-plano__mov" style={{
            transform: llevada ? `translate(${mueve.dx}px, ${mueve.dy}px) scale(1.1)` : 'translate(0px, 0px) scale(1)',
            transition: llevada ? 'none' : 'transform 460ms cubic-bezier(0.2, 1.25, 0.4, 1)',
            pointerEvents: llevada ? 'none' : undefined,
            filter: llevada ? 'drop-shadow(0 4px 5px rgba(0,0,0,0.4))' : undefined,
            transformBox: 'fill-box', transformOrigin: 'center',
          }}>
          <g data-ntb-pos={r.pos} className={`nv3-plano__llanta${esActiva ? ' nv3-plano__llanta--activa' : ''}${esDestino ? ' nv3-plano__llanta--destino' : ''}${animar ? ' pt-llanta' : ''}`} style={d(750 + idx * 70)}
            aria-label={`Llanta ${r.pos}: ${dato ? 'montada' : 'libre'}`} role="button" tabIndex={-1}>
            <rect className="nv3-plano__marco" x={r.x - w / 2 - 6} y={r.y - h / 2 - 6} width={w + 12} height={h + 12} rx={9} />
            {dato ? (
              <>
                <rect x={r.x - w / 2} y={r.y - h / 2} width={w} height={h} rx={5} fill="url(#nv3-goma)" stroke={filo} strokeWidth={1} />
                {surcos.map(s => r.plana
                  ? <line key={s} x1={r.x + s} x2={r.x + s} y1={r.y - h / 2 + 2} y2={r.y + h / 2 - 2} stroke="#2f3237" strokeWidth={1.2} opacity={0.55} />
                  : <line key={s} x1={r.x - w / 2 + 2} x2={r.x + w / 2 - 2} y1={r.y + s} y2={r.y + s} stroke="#2f3237" strokeWidth={1.2} opacity={0.55} />)}
                {/* Aro del semáforo de remanente */}
                <rect x={r.x - w / 2 - 2.5} y={r.y - h / 2 - 2.5} width={w + 5} height={h + 5} rx={7.5} fill="none" stroke={aro} strokeWidth={2.4} />
              </>
            ) : (
              <rect x={r.x - w / 2} y={r.y - h / 2} width={w} height={h} rx={5} fill="none" stroke="var(--label-3)" strokeWidth={1.4} strokeDasharray="4 3" />
            )}
            <circle cx={r.x} cy={r.y} r={8.5} fill="#ffffff" opacity={dato ? 0.92 : 0.6} />
            <text x={r.x} y={r.y + 3.6} textAnchor="middle" fontSize={r.pos.length > 2 ? 7.5 : 9.5} fontWeight={700} fill="#1c1c1e" pointerEvents="none">{r.pos}</text>
          </g>
          </g>
        );
      })}
    </svg>
  );
}
