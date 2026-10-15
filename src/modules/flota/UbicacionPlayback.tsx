import { motion } from 'motion/react';
import { CircleAlert, Clock, Gauge, Pause, Play, RotateCcw, Route, X } from 'lucide-react';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { spring } from '../../core/lib/motion';
import { fechaHora, type Historial } from './UbicacionHistorial';

const HORAS = [{ value: '6', label: '6 h' }, { value: '12', label: '12 h' }, { value: '24', label: '24 h' }, { value: '48', label: '48 h' }];
const VELOCIDADES = [{ value: '1', label: '1x' }, { value: '2', label: '2x' }, { value: '5', label: '5x' }, { value: '10', label: '10x' }];

export type Velocidad = 1 | 2 | 5 | 10;

interface Props {
  placa: string;
  horas: number;
  onHoras: (h: number) => void;
  historial: Historial | undefined;
  cargando: boolean;
  error: string;
  indice: number;
  onIndice: (i: number) => void;
  reproduciendo: boolean;
  onReproducir: () => void;
  onReiniciar: () => void;
  velocidad: Velocidad;
  onVelocidad: (v: Velocidad) => void;
  onSalir: () => void;
}

/** Reproducción del recorrido: rango de horas, cifras del recorrido, línea de tiempo y controles */
export function PanelHistorial(p: Props) {
  const puntos = p.historial?.puntos ?? [];
  const punto = puntos[p.indice];
  const m = p.historial?.metricas;
  const subtitulo = p.cargando ? 'Cargando telemetría satelital…'
    : p.error ? p.error
    : puntos.length ? `${puntos.length} puntos satelitales` : 'Sin recorrido en el rango elegido';

  return (
    <motion.section className="gps-ficha gps-historial" aria-label={`Historial de ${p.placa}`}
      initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={spring}>
      <header className="gps-ficha__cab">
        <span className="gps-ficha__icono"><Route size={20} strokeWidth={1.9} /></span>
        <div className="gps-ficha__titulo">
          <div className="gps-ficha__linea">
            <strong className="gps-ficha__placa">{p.placa}</strong>
            <span className="gps-etiqueta">ÚLTIMAS {p.horas} HORAS</span>
          </div>
          <span className={`gps-ficha__sub${p.error ? ' gps-historial__error' : ''}`}>{subtitulo}</span>
        </div>
        <button type="button" className="gps-ficha__cerrar" onClick={p.onSalir} aria-label="Cerrar historial"><X size={16} /></button>
      </header>

      <div className="gps-historial__rango">
        <SegmentedControl label="Rango de horas" value={String(p.horas)} onChange={v => p.onHoras(Number(v))} options={HORAS} />
      </div>

      {m && (
        <div className="gps-historial__cifras">
          <Cifra titulo="Recorrido" valor={`${m.totalKm.toLocaleString('es-PE')} km`} destacado />
          <Cifra titulo="Máx / prom" valor={`${Math.round(m.maxSpeed)} / ${Math.round(m.avgSpeed)} km/h`} />
          <Cifra titulo="Tiempo en ruta" valor={`${m.tiempoMovMin} min`} icono={<Clock size={13} />} />
          <Cifra titulo="Paradas" valor={`${m.paradasTotal}`} icono={<Pause size={13} />} />
        </div>
      )}

      {puntos.length > 0 && (
        <>
          <div className="gps-historial__tiempo">
            <input type="range" className="gps-historial__barra" min={0} max={puntos.length - 1} value={p.indice}
              onChange={e => p.onIndice(Number(e.target.value))} aria-label="Momento del recorrido" />
          </div>

          {punto && (
            <div className="gps-historial__punto">
              <span className="gps-historial__hora">{fechaHora(punto.tiempo)}</span>
              <span className="gps-historial__detalle">
                <Gauge size={13} /> <strong>{Math.round(punto.velocidad)} km/h</strong>
                <span>· Motor {punto.ignicion ? 'ON' : 'OFF'}</span>
                <span>· {Math.round(punto.altitud)} msnm</span>
              </span>
            </div>
          )}

          <div className="gps-historial__controles">
            <button type="button" className="gps-historial__boton" onClick={p.onReiniciar} aria-label="Volver al inicio">
              <RotateCcw size={16} />
            </button>
            <button type="button" className="gps-historial__play" onClick={p.onReproducir}
              aria-label={p.reproduciendo ? 'Pausar' : 'Reproducir'}>
              {p.reproduciendo ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </button>
            <SegmentedControl label="Velocidad de reproducción" value={String(p.velocidad)}
              onChange={v => p.onVelocidad(Number(v) as Velocidad)} options={VELOCIDADES} />
          </div>
        </>
      )}

      {m && m.paradasTotal > 0 && (
        <p className="gps-historial__nota"><CircleAlert size={13} /> Las paradas y los excesos de velocidad se marcan sobre la ruta.</p>
      )}
    </motion.section>
  );
}

function Cifra({ titulo, valor, icono, destacado }: { titulo: string; valor: string; icono?: React.ReactNode; destacado?: boolean }) {
  return (
    <div className="gps-dato">
      <span className="gps-dato__titulo">{icono}{titulo}</span>
      <span className={`gps-dato__valor${destacado ? ' gps-dato__valor--acento' : ''}`}>{valor}</span>
    </div>
  );
}
