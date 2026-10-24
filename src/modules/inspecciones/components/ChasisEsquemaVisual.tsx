import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { Box, Ruler } from 'lucide-react';
import { SegmentedControl } from '../../../core/ui/SegmentedControl';
import { tonoMm } from '../../mantenimiento/neumaticosSemaforo';
import '../inspecciones.css';

// Esquema de ejes y llantas por configuración, el mismo del clásico (modal_inspeccion.js).
// Cada eje tiene un lado izquierdo y uno derecho; un lado con dos llantas es un eje dual.

export type VistaChasis = '2d' | 'iso' | 'lat' | 'xray';

/** Llanta tal como la usa el formulario (solo lo que el esquema necesita) */
export interface LlantaChasis { posicion: string; r1: string; r2: string; r3: string; rot: string }

interface Eje { izquierda: string[]; derecha: string[] }
interface Configuracion { ejes: Eje[]; repuestos: string[]; cabina: boolean; llantas: number; nombre: string }

const p = (...xs: number[]) => xs.map(String);

export const CONFIGURACIONES: Record<string, Configuracion> = {
  '4X2': { nombre: 'Tracto / Camión C2', cabina: true, llantas: 6, repuestos: ['R1', 'R2'],
    ejes: [{ izquierda: p(1), derecha: p(2) }, { izquierda: p(3, 4), derecha: p(5, 6) }] },
  '6X4': { nombre: 'Tracto C3 / T3', cabina: true, llantas: 10, repuestos: ['R1', 'R2'],
    ejes: [{ izquierda: p(1), derecha: p(2) }, { izquierda: p(3, 4), derecha: p(5, 6) }, { izquierda: p(7, 8), derecha: p(9, 10) }] },
  '6X2': { nombre: 'Tracto', cabina: true, llantas: 8, repuestos: ['R1', 'R2'],
    ejes: [{ izquierda: p(1), derecha: p(2) }, { izquierda: p(3), derecha: p(4) }, { izquierda: p(5, 6), derecha: p(7, 8) }] },
  R2: { nombre: 'Carreta / Burrita', cabina: false, llantas: 8, repuestos: ['R1', 'R2'],
    ejes: [{ izquierda: p(1, 2), derecha: p(3, 4) }, { izquierda: p(5, 6), derecha: p(7, 8) }] },
  S2: { nombre: 'Semirremolque', cabina: false, llantas: 8, repuestos: ['R1', 'R2'],
    ejes: [{ izquierda: p(1, 2), derecha: p(3, 4) }, { izquierda: p(5, 6), derecha: p(7, 8) }] },
  S3: { nombre: 'Semirremolque', cabina: false, llantas: 12, repuestos: ['R1', 'R2'],
    ejes: [{ izquierda: p(1, 2), derecha: p(3, 4) }, { izquierda: p(5, 6), derecha: p(7, 8) }, { izquierda: p(9, 10), derecha: p(11, 12) }] },
  T3S3: { nombre: 'Combinación completa', cabina: true, llantas: 22, repuestos: ['R1', 'R2'],
    ejes: [
      { izquierda: p(1), derecha: p(2) }, { izquierda: p(3, 4), derecha: p(5, 6) }, { izquierda: p(7, 8), derecha: p(9, 10) },
      { izquierda: p(11, 12), derecha: p(13, 14) }, { izquierda: p(15, 16), derecha: p(17, 18) }, { izquierda: p(19, 20), derecha: p(21, 22) },
    ] },
};

/** Códigos de la ficha de Placas (C2, C3, T3…) hacia la configuración del esquema, igual que el clásico (ALIAS_MAPPER) */
const ALIAS_CONFIG: Record<string, string> = { C2: '4X2', T2: '4X2', C3: '6X4', T3: '6X4', C3S3: 'T3S3' };
export function normalizarConfiguracion(valor: string | null | undefined): string {
  const k = String(valor ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return ALIAS_CONFIG[k] ?? k;
}

/** Todas las posiciones de una configuración, en orden (ejes y luego repuestos) */
export function posicionesDeConfig(codigo: string): string[] {
  const c = CONFIGURACIONES[codigo];
  if (!c) return [];
  return [...c.ejes.flatMap(e => [...e.izquierda, ...e.derecha]), ...c.repuestos];
}

/** Al elegir la configuración se agregan los ejes y el repuesto R1; R2 solo aparece si la unidad lo tiene */
export function posicionesPorDefecto(codigo: string): string[] {
  const c = CONFIGURACIONES[codigo];
  if (!c) return [];
  return [...c.ejes.flatMap(e => [...e.izquierda, ...e.derecha]), ...c.repuestos.slice(0, 1)];
}

// Geometría (vista cenital, el frente arriba)
const ANCHO = 34, ALTO = 44, GAP = 4;
const X_IZQ = 77, X_DER = 223;          // centros de las columnas de llantas
const ALTURA_EJE = 96;                   // alto de cada eje
const Y_INICIO = 84;                     // primer eje debajo de la cabina

/** Semáforo del remanente (R1 + R2 + R3) / 3: >6 verde, 3 a 6 ámbar, menos de 3 rojo */
function colorRemanente(l: LlantaChasis | undefined): { fondo: string; texto: string } {
  const [a, b, c] = [l?.r1, l?.r2, l?.r3].map(v => Number(String(v ?? '').replace(',', '.')) || 0);
  if (!(a || b || c)) return { fondo: 'var(--fill-3, #e5e5ea)', texto: 'var(--label-2)' };
  const prom = (a + b + c) / 3;
  const t = tonoMm(prom);
  if (t === 'green') return { fondo: '#34c759', texto: '#ffffff' };
  if (t === 'amber') return { fondo: '#ff9500', texto: '#ffffff' };
  return { fondo: '#ff3b30', texto: '#ffffff' };
}

/** Llanta como en el clásico: neumático oscuro con rin y un círculo azul con el número de la posición.
 *  El color del remanente va en un aro alrededor; rotada = aro azul con 🔄; activa = contorno negro. */
function Llanta({ x, y, pos, llanta, activa, onSelect, xray }: {
  x: number; y: number; pos: string; llanta?: LlantaChasis; activa: boolean; onSelect: (pos: string) => void; xray: boolean;
}) {
  const rotada = llanta?.rot === 'SI';
  const { fondo } = colorRemanente(llanta);
  const cx = x, cy = y + ALTO / 2;
  const aro = rotada ? '#007aff' : fondo;
  const caucho = xray ? 'rgba(50, 215, 255, 0.28)' : '#222328';
  const rin = xray ? 'rgba(127, 240, 255, 0.5)' : '#cbd5e1';
  const numero = pos.length > 2 ? 'bold 9px sans-serif' : 'bold 12px sans-serif';
  return (
    <g role="button" tabIndex={0} aria-label={`Llanta posición ${pos}`} aria-pressed={activa}
      onClick={() => onSelect(pos)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(pos); } }}
      style={{ cursor: 'pointer', transition: 'transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)' }}
      transform={activa ? `translate(${cx} ${cy}) scale(1.08) translate(${-cx} ${-cy})` : undefined}>
      {/* Aro de estado */}
      <rect x={x - ANCHO / 2 - 2} y={y - 2} width={ANCHO + 4} height={ALTO + 4} rx={7} fill="none" stroke={activa ? '#1d1d1f' : aro} strokeWidth={activa ? 3 : 2.5} />
      {/* Neumático */}
      <rect x={x - ANCHO / 2} y={y} width={ANCHO} height={ALTO} rx={5} fill={caucho} />
      {/* Rin */}
      <rect x={x - ANCHO / 2 + 8} y={y + 8} width={ANCHO - 16} height={ALTO - 16} rx={3} fill={rin} />
      {/* Número de posición */}
      <circle cx={cx} cy={cy} r={9} fill={xray ? 'rgba(50, 215, 255, 0.85)' : '#2563eb'} stroke="#ffffff" strokeWidth={1} />
      <text x={cx} y={cy + 0.5} textAnchor="middle" dominantBaseline="middle" fill="#ffffff" style={{ font: numero }}>{pos}</text>
      {rotada && <text x={x + ANCHO / 2 + 5} y={y + 6} textAnchor="start" fontSize={10} fill="#007aff" aria-label="Rotada">🔄</text>}
    </g>
  );
}

/** Chasis de la vista cenital, como el clásico: largueros oscuros, ejes, cabina blanca con parabrisas, tanques en camiones
 *  y lanza con pivote en remolques. En rayos X se atenúa, igual que en el clásico. */
function Chasis({ c, xray }: { c: Configuracion; xray: boolean }) {
  const bastidor = xray ? 'rgba(127, 240, 255, 0.35)' : '#334155';
  const cromo = xray ? 'rgba(127, 240, 255, 0.35)' : '#cbd5e1';
  const cabina = xray ? 'none' : '#f8fafc';
  const trazo = xray ? '#32d7ff' : '#94a3b8';
  const centrosEjes = c.ejes.map((_, i) => Y_INICIO + i * ALTURA_EJE + 4 + (ALTO + GAP) / 2 + ALTO / 2);
  const yFin = (centrosEjes[centrosEjes.length - 1] ?? Y_INICIO) + 24;
  const yIni = Y_INICIO - 16;
  return (
    <g opacity={xray ? 0.3 : 1} stroke={trazo} strokeWidth={1}>
      {/* Largueros del bastidor */}
      <rect x={122} y={yIni} width={6} height={yFin - yIni} rx={3} fill={bastidor} stroke="none" />
      <rect x={172} y={yIni} width={6} height={yFin - yIni} rx={3} fill={bastidor} stroke="none" />
      {/* Ejes */}
      {centrosEjes.map((y, i) => (
        <rect key={i} x={75} y={y - 2} width={150} height={4} rx={2} fill={bastidor} stroke="none" />
      ))}
      {c.cabina ? (
        <>
          {/* Tanques de combustible a los lados, entre la cabina y los ejes */}
          <rect x={98} y={104} width={12} height={52} rx={6} fill={xray ? 'none' : '#64748b'} />
          <rect x={190} y={104} width={12} height={52} rx={6} fill={xray ? 'none' : '#64748b'} />
          {/* Cabina blanca con parabrisas, parrilla y defensa */}
          <rect x={112} y={12} width={76} height={70} rx={18} fill={cabina} />
          <rect x={122} y={34} width={56} height={16} rx={4} fill={xray ? 'none' : '#0284c7'} fillOpacity={0.55} />
          <rect x={126} y={6} width={48} height={6} rx={2} fill={cromo} stroke="none" />
          <rect x={108} y={0} width={84} height={5} rx={2} fill={cromo} stroke="none" />
        </>
      ) : (
        <>
          {/* Lanza con pivote (kingpin) al frente del remolque */}
          <path d="M138 72 L150 34 L162 72" fill="none" stroke={bastidor} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={150} cy={34} r={5} fill={cromo} stroke="none" />
        </>
      )}
    </g>
  );
}

function Plano({ codigo, llantas, activa, onSelect, xray }: {
  codigo: string; llantas: LlantaChasis[]; activa: string; onSelect: (pos: string) => void; xray: boolean;
}) {
  const c = CONFIGURACIONES[codigo];
  const mapa = new Map(llantas.map(l => [l.posicion, l]));
  const ejesAltura = c.ejes.length * ALTURA_EJE;
  const yRepuestos = Y_INICIO + ejesAltura + 8;
  const alto = yRepuestos + 80;
  return (
    <svg viewBox={`0 0 300 ${alto}`} role="group" aria-label={`Esquema ${codigo}`} style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }}>
      <Chasis c={c} xray={xray} />
      {c.ejes.map((eje, i) => {
        const y0 = Y_INICIO + i * ALTURA_EJE + 4;
        const dualIzq = eje.izquierda.length > 1, dualDer = eje.derecha.length > 1;
        return (
          <g key={i}>
            {eje.izquierda.map((pos, k) => (
              <Llanta key={pos} x={X_IZQ} y={dualIzq ? y0 + k * (ALTO + GAP) : y0 + (ALTO + GAP) / 2 - 0} pos={pos} llanta={mapa.get(pos)} activa={activa === pos} onSelect={onSelect} xray={xray} />
            ))}
            {eje.derecha.map((pos, k) => (
              <Llanta key={pos} x={X_DER} y={dualDer ? y0 + k * (ALTO + GAP) : y0 + (ALTO + GAP) / 2 - 0} pos={pos} llanta={mapa.get(pos)} activa={activa === pos} onSelect={onSelect} xray={xray} />
            ))}
          </g>
        );
      })}
      {/* Repuestos, debajo del último eje */}
      {c.repuestos.filter(p => mapa.has(p)).map((pos, i, lista) => {
        const cantidad = lista.length;
        const x = cantidad === 1 ? 150 : 120 + i * 60;
        return <Llanta key={pos} x={x} y={yRepuestos} pos={pos} llanta={mapa.get(pos)} activa={activa === pos} onSelect={onSelect} xray={xray} />;
      })}
    </svg>
  );
}

const OPCIONES_VISTA = [
  { value: '2d' as VistaChasis, label: 'Vista 2D' },
  { value: 'iso' as VistaChasis, label: 'Isométrica' },
  { value: 'lat' as VistaChasis, label: 'Lateral' },
  { value: 'xray' as VistaChasis, label: 'Rayos X' },
];

/** Si el modelo 3D falla al cargar o al dibujar, se muestra el esquema 2D en vez de dejar la pantalla en blanco */
class VisorSeguro extends Component<{ respaldo: ReactNode; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() { return { fallo: true }; }
  componentDidCatch(error: unknown) { console.error('Modelo 3D:', error); }
  render() { return this.state.fallo ? this.props.respaldo : this.props.children; }
}

// El modelo 3D va en un chunk aparte: solo se descarga cuando se abre
const Chasis3D = lazy(() => import('./Chasis3D'));
const CLAVE_3D = 'fleet_chasis_3d';

/** Este equipo puede dibujar en WebGL */
function webglDisponible(): boolean {
  try {
    const lienzo = document.createElement('canvas');
    return !!(lienzo.getContext('webgl2') || lienzo.getContext('webgl'));
  } catch { return false; }
}

/** 3D por defecto salvo poca memoria o que el usuario lo haya apagado en este equipo */
function preferir3d(soporta: boolean): boolean {
  if (!soporta) return false;
  const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memoria === 'number' && memoria < 2) return false;
  try {
    const guardado = localStorage.getItem(CLAVE_3D);
    if (guardado !== null) return guardado === '1';
  } catch { /* sin almacenamiento: vale la preferencia por defecto */ }
  return true;
}

/** Esquema de ejes y llantas: modelo 3D (como el clásico) o esquema 2D con vistas cenital, isométrica, lateral y rayos X */
export function ChasisEsquemaVisual({ configuracion, llantas, activa, onSelect, onRotar }: {
  configuracion: string; llantas: LlantaChasis[]; activa: string; onSelect: (pos: string) => void; onRotar: (origen: string, destino: string) => void;
}) {
  const [vista, setVista] = useState<VistaChasis>('2d');
  const [soporta3d] = useState(webglDisponible);
  const [modo3d, setModo3d] = useState(() => preferir3d(soporta3d));
  const [aviso3d, setAviso3d] = useState(false);
  // Llanta que se arrastra en el modelo 3D y posición sobre la que está (para el banner)
  const [arrastre, setArrastre] = useState<{ origen: string; destino: string | null } | null>(null);
  const c = CONFIGURACIONES[configuracion];
  const repuestosPresentes = c ? c.repuestos.filter(p => llantas.some(l => l.posicion === p)) : [];
  const xray = vista === 'xray';
  const transform = vista === 'iso' ? 'perspective(700px) rotateX(42deg) rotateZ(-6deg)' : vista === 'lat' ? 'perspective(700px) rotateY(-52deg)' : undefined;

  function cambiarModo(v: boolean) {
    setModo3d(v);
    setAviso3d(false);
    try { localStorage.setItem(CLAVE_3D, v ? '1' : '0'); } catch { /* sin almacenamiento: dura solo la sesión */ }
  }
  // Si el contexto WebGL se pierde, se vuelve al esquema 2D sin romper el formulario
  function perderContexto() {
    setModo3d(false);
    setAviso3d(true);
  }

  const plano = (
    <div className="insp-chasis__lienzo" style={{ transform, transition: 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)' }}>
      <Plano codigo={configuracion} llantas={llantas} activa={activa} onSelect={onSelect} xray={xray} />
    </div>
  );

  return (
    <section className={`insp-chasis${xray ? ' insp-chasis--xray' : ''}`} aria-label="Esquema de ejes y llantas">
      <div className="insp-chasis__cab">
        <SegmentedControl<VistaChasis> label="Perspectiva" value={vista} onChange={setVista} options={OPCIONES_VISTA} />
        {c && <span className="insp-chasis__info">{configuracion} · {c.nombre} · {c.llantas} llantas{repuestosPresentes.length ? ` + ${repuestosPresentes.join(', ')}` : ''}</span>}
        {soporta3d && (
          <button type="button" className="insp-chasis__modo pressable" aria-pressed={modo3d} onClick={() => cambiarModo(!modo3d)}>
            {modo3d ? <><Ruler size={14} aria-hidden /> Esquema 2D</> : <><Box size={14} aria-hidden /> Modelo 3D</>}
          </button>
        )}
      </div>
      {aviso3d && <p className="insp-chasis__aviso" role="status">El modelo 3D no está disponible en este equipo; se usa el esquema 2D.</p>}
      {c ? (
        modo3d ? (
          <div style={{ position: 'relative' }}>
            <VisorSeguro respaldo={plano}>
              <Suspense fallback={plano}>
                <Chasis3D configuracion={configuracion} llantas={llantas} activa={activa} vista={vista} onSelect={onSelect}
                  onRotar={onRotar} onArrastre={(origen, destino) => setArrastre(origen ? { origen, destino } : null)} onPerdida={perderContexto} />
              </Suspense>
            </VisorSeguro>
            {arrastre && (
              <div className="insp-chasis__arrastre" role="status">
                {arrastre.destino
                  ? `Suelta para intercambiar #${arrastre.origen} ⇄ #${arrastre.destino}`
                  : `Arrastrando Llanta #${arrastre.origen} — Suelta sobre otra posición para intercambiar`}
              </div>
            )}
          </div>
        ) : plano
      ) : (
        <p className="insp-chasis__vacio">Elige la configuración del vehículo para ver sus ejes.</p>
      )}
      <div className="insp-chasis__leyenda" aria-hidden>
        <span><i style={{ background: '#34c759' }} />Más de 6 mm</span>
        <span><i style={{ background: '#ff9500' }} />3 a 6 mm</span>
        <span><i style={{ background: '#ff3b30' }} />Menos de 3 mm</span>
        <span><i style={{ background: '#007aff' }} />Rotada</span>
        <span><i style={{ background: 'var(--fill-3, #e5e5ea)' }} />Sin medir</span>
      </div>
    </section>
  );
}
