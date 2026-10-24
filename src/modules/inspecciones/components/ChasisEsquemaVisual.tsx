import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { SegmentedControl } from '../../../core/ui/SegmentedControl';
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

const OPCIONES_VISTA = [
  { value: '2d' as VistaChasis, label: 'Vista 2D' },
  { value: 'iso' as VistaChasis, label: 'Isométrica' },
  { value: 'lat' as VistaChasis, label: 'Lateral' },
  { value: 'xray' as VistaChasis, label: 'Rayos X' },
];

/** Si el modelo 3D falla al cargar o al dibujar, se muestra un aviso en vez de dejar la pantalla en blanco */
class VisorSeguro extends Component<{ respaldo: ReactNode; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() { return { fallo: true }; }
  componentDidCatch(error: unknown) { console.error('Modelo 3D:', error); }
  render() { return this.state.fallo ? this.props.respaldo : this.props.children; }
}

// El modelo 3D va en un chunk aparte: solo se descarga al abrir el formulario
const Chasis3D = lazy(() => import('./Chasis3D'));

/** Este equipo puede dibujar en WebGL */
function webglDisponible(): boolean {
  try {
    const lienzo = document.createElement('canvas');
    return !!(lienzo.getContext('webgl2') || lienzo.getContext('webgl'));
  } catch { return false; }
}

const AVISO_3D = 'No se puede mostrar el modelo 3D en este equipo.';

/** Modelo 3D de ejes y llantas, como el clásico. Las vistas cenital, isométrica, lateral y rayos X mueven la cámara. */
export function ChasisEsquemaVisual({ configuracion, llantas, activa, onSelect, onRotar }: {
  configuracion: string; llantas: LlantaChasis[]; activa: string; onSelect: (pos: string) => void; onRotar: (origen: string, destino: string) => void;
}) {
  const [vista, setVista] = useState<VistaChasis>('2d');
  const [soporta3d] = useState(webglDisponible);
  const [perdido, setPerdido] = useState(false);
  // Llanta que se arrastra y posición sobre la que está (para el banner)
  const [arrastre, setArrastre] = useState<{ origen: string; destino: string | null } | null>(null);
  const c = CONFIGURACIONES[configuracion];
  const repuestosPresentes = c ? c.repuestos.filter(p => llantas.some(l => l.posicion === p)) : [];
  const xray = vista === 'xray';

  return (
    <section className={`insp-chasis${xray ? ' insp-chasis--xray' : ''}`} aria-label="Modelo de ejes y llantas">
      <div className="insp-chasis__cab">
        <SegmentedControl<VistaChasis> label="Perspectiva" value={vista} onChange={setVista} options={OPCIONES_VISTA} />
        {c && <span className="insp-chasis__info">{configuracion} · {c.nombre} · {c.llantas} llantas{repuestosPresentes.length ? ` + ${repuestosPresentes.join(', ')}` : ''}</span>}
      </div>
      {!c ? (
        <p className="insp-chasis__vacio">Elige la configuración del vehículo para ver sus ejes.</p>
      ) : !soporta3d || perdido ? (
        <p className="insp-chasis__vacio">{AVISO_3D}</p>
      ) : (
        <div style={{ position: 'relative' }}>
          <VisorSeguro respaldo={<p className="insp-chasis__vacio">{AVISO_3D}</p>}>
            <Suspense fallback={<p className="insp-chasis__vacio">Cargando modelo 3D…</p>}>
              <Chasis3D configuracion={configuracion} llantas={llantas} activa={activa} vista={vista} onSelect={onSelect}
                onRotar={onRotar} onArrastre={(origen, destino) => setArrastre(origen ? { origen, destino } : null)} onPerdida={() => setPerdido(true)} />
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
