// Vista de neumáticos: dibuja la unidad en 3D (Three.js, en un chunk aparte) en cenital o isométrica. Si WebGL no está disponible,
// si falla al dibujar o si la configuración no encaja con las posiciones, muestra el esquema SVG de siempre.
import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { CONFIGURACIONES, posicionesDeConfig } from '../inspecciones/components/ChasisEsquemaVisual';
import { EsquemaNeumaticos, type LlantaDato } from './NeumaticosEsquema';
import type { SondaPosicion } from './ntb-arrastre';
import type { ModoVista } from './nv3-motor';
import './nv3.css';

// Three.js solo se descarga al abrir una pantalla con neumáticos; mientras tanto se ve el SVG
const Nv3Vista = lazy(() => import('./nv3-vista'));

export interface NeumaticosCenitalProps {
  llantas: LlantaDato[];
  /** Código reconocido de la configuración (4X2, 6X4…) o null */
  configuracion: string | null;
  /** Posición de la llanta seleccionada */
  activa: string;
  /** Posición bajo el arrastre, si hay */
  sobre?: string | null;
  onSelect: (l: LlantaDato) => void;
  /** Recibe la función que dice qué posición hay bajo un punto de la pantalla (para soltar llantas) */
  sondaRef?: { current: SondaPosicion | null };
  /** Marca del tracto para el letrero del capó (opcional; sin marca no se dibuja texto) */
  marca?: string | null;
  /** Vista activa (plano o isometría). Si el padre la controla, el control Plano / Isometría se maneja desde fuera */
  modo?: ModoVista;
  onModo?: (modo: ModoVista) => void;
}

/** Este equipo puede dibujar en WebGL */
function webglDisponible(): boolean {
  try {
    const lienzo = document.createElement('canvas');
    return !!(lienzo.getContext('webgl2') || lienzo.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Si el modelo 3D falla, se muestra el respaldo en vez de dejar la pantalla en blanco */
class RespaldoSeguro extends Component<{ respaldo: ReactNode; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() { return { fallo: true }; }
  componentDidCatch(error: unknown) { console.error('Vista cenital de neumáticos:', error); }
  render() { return this.state.fallo ? this.props.respaldo : this.props.children; }
}

export function NeumaticosCenital({ llantas, configuracion, activa, sobre = null, onSelect, sondaRef, marca = null, modo, onModo }: NeumaticosCenitalProps) {
  const [soportaWebgl] = useState(webglDisponible);
  const [perdido, setPerdido] = useState(false);

  const posicionesConfig = configuracion ? posicionesDeConfig(configuracion) : [];
  const encaja = !!configuracion && !!CONFIGURACIONES[configuracion]
    && llantas.every(l => posicionesConfig.includes(String(l.posicion).trim().toUpperCase()));
  const respaldo = <EsquemaNeumaticos llantas={llantas} configuracion={configuracion} activa={activa} onSelect={onSelect} />;

  if (!configuracion || !encaja || !soportaWebgl || perdido) return respaldo;

  return (
    <RespaldoSeguro respaldo={respaldo}>
      <Suspense fallback={respaldo}>
        <Nv3Vista
          configuracion={configuracion} llantas={llantas} activa={activa} sobre={sobre} onSelect={onSelect}
          sondaRef={sondaRef} marca={marca} onPerdida={() => setPerdido(true)} modo={modo} onModo={onModo}
        />
      </Suspense>
    </RespaldoSeguro>
  );
}
