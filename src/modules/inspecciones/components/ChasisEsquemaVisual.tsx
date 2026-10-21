import { useState } from 'react';
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
  '4X2': { nombre: 'Tracto / Camión C2', cabina: true, llantas: 6, repuestos: ['R'],
    ejes: [{ izquierda: p(1), derecha: p(2) }, { izquierda: p(3, 4), derecha: p(5, 6) }] },
  '6X4': { nombre: 'Tracto C3 / T3', cabina: true, llantas: 10, repuestos: ['R'],
    ejes: [{ izquierda: p(1), derecha: p(2) }, { izquierda: p(3, 4), derecha: p(5, 6) }, { izquierda: p(7, 8), derecha: p(9, 10) }] },
  '6X2': { nombre: 'Tracto', cabina: true, llantas: 8, repuestos: ['R'],
    ejes: [{ izquierda: p(1), derecha: p(2) }, { izquierda: p(3), derecha: p(4) }, { izquierda: p(5, 6), derecha: p(7, 8) }] },
  R2: { nombre: 'Carreta / Burrita', cabina: false, llantas: 8, repuestos: ['R'],
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

/** Todas las posiciones de una configuración, en orden (ejes y luego repuestos) */
export function posicionesDeConfig(codigo: string): string[] {
  const c = CONFIGURACIONES[codigo];
  if (!c) return [];
  return [...c.ejes.flatMap(e => [...e.izquierda, ...e.derecha]), ...c.repuestos];
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

function Llanta({ x, y, pos, llanta, activa, onSelect, xray }: {
  x: number; y: number; pos: string; llanta?: LlantaChasis; activa: boolean; onSelect: (pos: string) => void; xray: boolean;
}) {
  const rotada = llanta?.rot === 'SI';
  const { fondo, texto } = colorRemanente(llanta);
  const cx = x, cy = y + ALTO / 2;
  const fill = xray ? 'rgba(50, 215, 255, 0.28)' : rotada ? '#007aff' : fondo;
  const color = xray ? '#7ff0ff' : rotada ? '#ffffff' : texto;
  return (
    <g role="button" tabIndex={0} aria-label={`Llanta posición ${pos}`} aria-pressed={activa}
      onClick={() => onSelect(pos)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(pos); } }}
      style={{ cursor: 'pointer', transition: 'transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)' }}
      transform={activa ? `translate(${cx} ${cy}) scale(1.08) translate(${-cx} ${-cy})` : undefined}>
      <rect x={x - ANCHO / 2} y={y} width={ANCHO} height={ALTO} rx={4}
        fill={fill} stroke={activa ? '#1d1d1f' : xray ? '#32d7ff' : 'none'} strokeWidth={activa ? 3 : 1} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight={700} fill={color}>{pos}</text>
      {rotada && <text x={x + ANCHO / 2 - 4} y={y + 8} textAnchor="end" fontSize={10} fill="#ffffff" aria-label="Rotada">🔄</text>}
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
  const color = xray ? '#7ff0ff' : 'var(--separator, #d1d1d6)';
  return (
    <svg viewBox={`0 0 300 ${alto}`} role="group" aria-label={`Esquema ${codigo}`} style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }}>
      {/* Cabina y enganche */}
      {c.cabina && <rect x={100} y={8} width={100} height={60} rx={22} fill={xray ? 'none' : 'var(--fill, #f2f2f7)'} stroke={color} strokeWidth={1.5} />}
      {c.cabina && <path d="M118 22 Q150 14 182 22 L182 40 Q150 46 118 40 Z" fill={xray ? 'none' : 'var(--surface, #fff)'} stroke={color} strokeWidth={1} />}
      {!c.cabina && <rect x={132} y={6} width={36} height={22} rx={8} fill="none" stroke={color} strokeWidth={1.5} />}
      {/* Chasis y travesaños */}
      <rect x={112} y={Y_INICIO - 8} width={76} height={ejesAltura + 8} rx={8} fill="none" stroke={color} strokeWidth={1.5} />
      {c.ejes.map((eje, i) => {
        const y0 = Y_INICIO + i * ALTURA_EJE + 4;
        const dualIzq = eje.izquierda.length > 1, dualDer = eje.derecha.length > 1;
        // Centro del eje: entre las dos llantas de un dual, o en la llanta sencilla
        const yTravesano = y0 + (ALTO + GAP) / 2 + ALTO / 2;
        return (
          <g key={i}>
            <line x1={60} x2={240} y1={yTravesano} y2={yTravesano} stroke={color} strokeWidth={2} strokeLinecap="round" />
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
      {c.repuestos.map((pos, i) => {
        const cantidad = c.repuestos.length;
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

/** Chasis interactivo: pulsar una llanta la selecciona en el editor de abajo */
export function ChasisEsquemaVisual({ configuracion, llantas, activa, onSelect }: {
  configuracion: string; llantas: LlantaChasis[]; activa: string; onSelect: (pos: string) => void;
}) {
  const [vista, setVista] = useState<VistaChasis>('2d');
  const c = CONFIGURACIONES[configuracion];
  const xray = vista === 'xray';
  const transform = vista === 'iso' ? 'perspective(700px) rotateX(42deg) rotateZ(-6deg)' : vista === 'lat' ? 'perspective(700px) rotateY(-52deg)' : undefined;
  return (
    <section className={`insp-chasis${xray ? ' insp-chasis--xray' : ''}`} aria-label="Esquema de ejes y llantas">
      <div className="insp-chasis__cab">
        <SegmentedControl<VistaChasis> label="Perspectiva" value={vista} onChange={setVista} options={OPCIONES_VISTA} />
        {c && <span className="insp-chasis__info">{configuracion} · {c.nombre} · {c.llantas} llantas{c.repuestos.length ? ` + ${c.repuestos.join(', ')}` : ''}</span>}
      </div>
      {c ? (
        <div className="insp-chasis__lienzo" style={{ transform, transition: 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)' }}>
          <Plano codigo={configuracion} llantas={llantas} activa={activa} onSelect={onSelect} xray={xray} />
        </div>
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
