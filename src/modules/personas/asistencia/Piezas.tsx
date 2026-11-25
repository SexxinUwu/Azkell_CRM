import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BotonTip } from '../../../core/ui/BotonTip';
import { TextInput } from '../../../core/ui/Field';
import { haptic } from '../../../core/lib/haptics';
import { springSnappy } from '../../../core/lib/motion';
import { sumarDias } from './datos';

// Piezas compartidas de las vistas de Asistencia.

export interface PestanaDef<T extends string> { id: T; etiqueta: string; icono: ReactNode }

/** Pestañas con subrayado que se desliza (resorte) hacia la elegida; en pantallas angostas se desplazan sin barra */
export function Pestanas<T extends string>({ pestanas, activa, onChange, etiqueta }: { pestanas: PestanaDef<T>[]; activa: T; onChange: (id: T) => void; etiqueta: string }) {
  const layoutId = useId();
  return (
    <div className="asis-tabs" role="tablist" aria-label={etiqueta}>
      {pestanas.map(p => (
        <button key={p.id} type="button" role="tab" aria-selected={p.id === activa} className="asis-tab pressable"
          onClick={() => { if (p.id !== activa) haptic('selection'); onChange(p.id); }}>
          <span className="asis-tab__icono" aria-hidden>{p.icono}</span>
          <span>{p.etiqueta}</span>
          {p.id === activa && <motion.span layoutId={layoutId} className="asis-tab__linea" transition={springSnappy} />}
        </button>
      ))}
    </div>
  );
}

/** Navegación por día: anterior, selector de fecha, siguiente y "Hoy" */
export function NavDia({ fecha, onChange, hoy }: { fecha: string; onChange: (f: string) => void; hoy: string }) {
  return (
    <div className="asis-nav">
      <BotonTip tip="Día anterior" className="btn btn--plain btn--icono" onClick={() => onChange(sumarDias(fecha, -1))}><ChevronLeft size={18} /></BotonTip>
      <TextInput className="asis-nav__fecha" aria-label="Fecha" type="date" max={hoy} value={fecha} onChange={e => { if (e.target.value) onChange(e.target.value); }} />
      <BotonTip tip="Día siguiente" className="btn btn--plain btn--icono" disabled={fecha >= hoy} onClick={() => onChange(sumarDias(fecha, 1))}><ChevronRight size={18} /></BotonTip>
      {fecha !== hoy && <button type="button" className="asis-hoy-btn pressable" onClick={() => onChange(hoy)}>Hoy</button>}
    </div>
  );
}

/** Indicador pequeño de la parte alta de cada vista */
export function Indicador({ etiqueta, valor, nota, tono, icono }: { etiqueta: string; valor: string; nota?: string; tono?: 'ok' | 'med' | 'bajo' | 'info' | ''; icono: ReactNode }) {
  return (
    <div className={`asis-ind${tono ? ` asis-ind--${tono}` : ''}`}>
      <span className="asis-ind__icono" aria-hidden>{icono}</span>
      <span className="asis-ind__txt">
        <small>{etiqueta}</small>
        <strong className="t-numeric">{valor}</strong>
      </span>
      {nota && <span className="asis-ind__nota">{nota}</span>}
    </div>
  );
}

/** Píldora de estado del día */
export function ChipEstado({ estado, minutos }: { estado: string; minutos?: number }) {
  const texto: Record<string, string> = {
    A: 'Asistió', R: 'En ruta', T: 'Tardanza', F: 'Falta', DM: 'Descanso médico', V: 'Vacaciones', P: 'Permiso', D: 'Descanso', FER: 'Feriado', SIN: 'Sin marcar',
  };
  return <span className={`asis-chip asis-chip--${estado || 'VACIO'}`}>{texto[estado] ?? '—'}{estado === 'T' && minutos ? ` · ${minutos} min` : ''}</span>;
}
