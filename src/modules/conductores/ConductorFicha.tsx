import { useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { MessageCircle, Pencil, Phone, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { spring } from '../../core/lib/motion';
import { whatsapp, type Conductor } from './api';
import { FotoConductor } from './FotoConductor';

// Ficha del conductor: foto, contacto rápido y datos.
export function ConductorFicha({ conductor, onClose, onEditar, onEliminar }: {
  conductor: Conductor | null;
  onClose: () => void;
  onEditar?: (c: Conductor) => void;
  onEliminar?: (c: Conductor) => void;
}) {
  const ultimo = useRef<Conductor | null>(null);
  if (conductor) ultimo.current = conductor;
  const c = conductor ?? ultimo.current;
  const reduce = useReducedMotion();
  const wa = c ? whatsapp(c.telefono) : null;

  return (
    <Sheet
      open={!!conductor}
      onClose={onClose}
      title={c?.nombre || 'Conductor'}
      footer={
        <>
          {onEliminar && c ? (
            <Button variant="plain" className="ficha__eliminar" icon={<Trash2 size={16} />} onClick={() => onEliminar(c)}>Eliminar</Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          )}
          {onEditar && c && <Button variant="primary" icon={<Pencil size={16} />} onClick={() => onEditar(c)}>Editar</Button>}
        </>
      }
    >
      {c && (
        <div className="ficha">
          <motion.div className="ficha__hero" initial={{ opacity: 0, scale: reduce ? 1 : 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
            <FotoConductor conductor={c} size={104} />
            <div className="ficha__titulo">{c.nombre || 'Sin nombre'}</div>
            <div className="ficha__chips">
              <span className={`placa-estado placa-estado--${c.estado.toLowerCase() === 'activo' ? 'on' : 'off'}`}>{c.estado}</span>
              {c.empresa && <span className="chip chip--static">{c.empresa}</span>}
            </div>
            {(c.telefono || wa) && (
              <div className="ficha__contacto">
                {c.telefono && (
                  <a className="contacto-btn pressable" href={`tel:${c.telefono.replace(/\s/g, '')}`}>
                    <Phone size={18} /><span>Llamar</span>
                  </a>
                )}
                {wa && (
                  <a className="contacto-btn contacto-btn--wa pressable" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                    <MessageCircle size={18} /><span>WhatsApp</span>
                  </a>
                )}
              </div>
            )}
          </motion.div>

          <motion.section className="ficha__grupo" initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: reduce ? 0 : 0.08 }}>
            <div className="list__header">Datos</div>
            <div className="list">
              {[
                ['DNI', c.dni, true],
                ['Licencia de conducir', c.licencia, true],
                ['Teléfono', c.telefono, false],
                ['Empresa', c.empresa, false],
              ].map(([label, value, mono]) => (
                <div key={String(label)} className="row ficha__dato">
                  <span className="row__main ficha__label">{label}</span>
                  <span className={`ficha__valor${mono ? ' ficha__valor--mono' : ''}${value ? '' : ' ficha__valor--vacio'}`}>{value || '—'}</span>
                </div>
              ))}
            </div>
          </motion.section>
        </div>
      )}
    </Sheet>
  );
}
