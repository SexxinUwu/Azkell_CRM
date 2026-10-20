import { motion } from 'motion/react';
import { Contador, suave } from './Movimiento';

// Maqueta animada de la "Torre de control" del ERP. Son cifras de demostración, no datos de ninguna empresa.
const BARRAS = [46, 62, 54, 78, 66, 90, 72, 86, 70, 96, 82, 100];
const UNIDADES = [
  { placa: 'ABC-123', estado: 'En ruta', tono: 'verde' },
  { placa: 'XYZ-456', estado: 'En taller', tono: 'ambar' },
  { placa: 'DEF-789', estado: 'En ruta', tono: 'verde' },
  { placa: 'GHI-012', estado: 'Disponible', tono: 'azul' },
];

export function PanelDemo() {
  return (
    <motion.div className="panel" initial={{ opacity: 0, y: 50, rotateX: 14 }} animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 1.2, ease: suave, delay: 0.5 }}>
      <div className="panel__flota">
        <div className="panel__barra">
          <i /><i /><i /><span>Torre de control</span><em>Demostración</em>
        </div>
        <div className="panel__kpis">
          <div><small>Unidades</small><b><Contador hasta={128} /></b></div>
          <div><small>OT abiertas</small><b><Contador hasta={17} /></b></div>
          <div><small>Disponibilidad</small><b><Contador hasta={94} sufijo=" %" /></b></div>
        </div>
        <div className="panel__grafico" aria-hidden>
          {BARRAS.map((h, i) => (
            <motion.span key={i} style={{ height: `${h}%` }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
              transition={{ duration: 0.9, ease: suave, delay: 1 + i * 0.05 }} />
          ))}
        </div>
        <ul className="panel__lista">
          {UNIDADES.map((u, i) => (
            <motion.li key={u.placa} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: suave, delay: 1.4 + i * 0.1 }}>
              <span className={`panel__punto panel__punto--${u.tono}`} /> <b>{u.placa}</b><em>{u.estado}</em>
            </motion.li>
          ))}
        </ul>
      </div>
      <motion.div className="panel__flotante panel__flotante--a" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: suave, delay: 1.9 }}>
        <span className="panel__punto panel__punto--verde" /> Mantenimiento al día
      </motion.div>
      <motion.div className="panel__flotante panel__flotante--b" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: suave, delay: 2.1 }}>
        Auditoría firmada ✓
      </motion.div>
    </motion.div>
  );
}
