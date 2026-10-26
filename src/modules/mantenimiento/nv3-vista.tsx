// Vista 3D de la unidad para neumáticos (tablero de movimientos y pestaña Neumáticos de la placa). React solo monta el
// lienzo y el control Plano / Isometría; el dibujo, la cámara y la selección viven en nv3-motor.ts.
// Un solo motor por componente: se crea al montar y se libera al desmontar.
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { remanenteDe, type LlantaDato } from './NeumaticosEsquema';
import type { SondaPosicion } from './ntb-arrastre';
import { MotorNeumaticos, type ModoVista } from './nv3-motor';
import { cargarFotoBanda } from './nv3-texturas';

export interface Nv3VistaProps {
  configuracion: string;
  llantas: LlantaDato[];
  /** Posición de la llanta seleccionada */
  activa: string;
  /** Posición bajo el arrastre, si hay */
  sobre: string | null;
  onSelect: (l: LlantaDato) => void;
  /** Se rellena con la función que dice qué posición hay bajo un punto de la pantalla */
  sondaRef?: { current: SondaPosicion | null };
  /** Se llama si el contexto WebGL no se puede crear o se pierde */
  onPerdida: () => void;
  /** Marca del tracto para el letrero del capó; sin marca no se dibuja texto */
  marca?: string | null;
}

const normal = (p: string) => String(p).trim().toUpperCase();

const OPCIONES_VISTA: Array<{ valor: ModoVista; etiqueta: string }> = [
  { valor: 'plano', etiqueta: 'Plano' },
  { valor: 'isometria', etiqueta: 'Isometría' },
];

/** Los controles sobre el lienzo no deben llegar al arrastre ni al toque de la unidad */
const detener = (e: SyntheticEvent) => e.stopPropagation();

export default function Nv3Vista({ configuracion, llantas, activa, sobre, onSelect, sondaRef, onPerdida, marca }: Nv3VistaProps) {
  const lienzo = useRef<HTMLDivElement>(null);
  const motor = useRef<MotorNeumaticos | null>(null);
  // Últimos valores de las props para los oyentes que se montan una sola vez
  const vivo = useRef({ onSelect, onPerdida, llantas });
  vivo.current = { onSelect, onPerdida, llantas };
  // Foto de la banda: al cargar se reconstruyen las llantas con ella
  const [foto, setFoto] = useState(false);
  const [modo, setModo] = useState<ModoVista>('plano');

  // Firma de lo que cambia la geometría: si no cambia (p. ej. solo la selección), no se reconstruye
  const firma = configuracion + '|' + llantas.map(l => `${normal(l.posicion)}:${remanenteDe(l)}:${l.r1}:${l.r2}:${l.r3}`).join(',');

  // Montaje del motor: se libera todo al desmontar
  useEffect(() => {
    const cont = lienzo.current;
    if (!cont) return;
    let nuevo: MotorNeumaticos;
    try {
      nuevo = new MotorNeumaticos({
        contenedor: cont,
        sondaRef,
        onSelect: posicion => {
          const llanta = vivo.current.llantas.find(l => normal(l.posicion) === posicion);
          if (llanta) vivo.current.onSelect(llanta);
        },
        onPerdida: () => vivo.current.onPerdida(),
      });
    } catch {
      vivo.current.onPerdida();
      return;
    }
    motor.current = nuevo;
    return () => {
      nuevo.dispose();
      motor.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carga la foto de la banda una vez; al llegar, las llantas se reconstruyen con ella
  useEffect(() => {
    let vigente = true;
    cargarFotoBanda().then(ok => { if (vigente && ok) setFoto(true); });
    return () => { vigente = false; };
  }, []);

  // Reconstruye el camión cuando cambian la configuración, las llantas, la foto o la marca
  useEffect(() => {
    motor.current?.setDatos(configuracion, llantas, marca ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, foto, marca]);

  // Selección y destino del arrastre
  useEffect(() => {
    motor.current?.setSeleccion(activa || null, sobre);
  }, [activa, sobre]);

  // Cenital o isometría
  useEffect(() => {
    motor.current?.setModo(modo);
  }, [modo]);

  return (
    <div className="nv3-vista" data-nv3>
      <div ref={lienzo} className="nv3-lienzo" role="img" aria-label={`Vista de la unidad, configuración ${configuracion}`} />
      <div className="nv3-modos" role="group" aria-label="Tipo de vista" onPointerDown={detener} onClick={detener}>
        {OPCIONES_VISTA.map(o => (
          <button
            key={o.valor}
            type="button"
            className="nv3-modos__op"
            aria-pressed={modo === o.valor}
            onClick={() => setModo(o.valor)}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}
