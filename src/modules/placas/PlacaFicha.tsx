import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { spring } from '../../core/lib/motion';
import { abrirClasico } from '../../core/layout/navigation';
import type { Placa } from './api';

// Ficha de una unidad: placa grande y datos agrupados. Solo consulta.
export function PlacaFicha({ placa, onClose }: { placa: Placa | null; onClose: () => void }) {
  // Se conserva la última placa mientras la hoja se cierra (anima con su contenido)
  const ultima = useRef<Placa | null>(null);
  if (placa) ultima.current = placa;
  const p = placa ?? ultima.current;
  const reduce = useReducedMotion();

  const seccion = (i: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    transition: { ...spring, delay: reduce ? 0 : 0.06 + 0.04 * i },
  });

  return (
    <Sheet
      open={!!placa}
      onClose={onClose}
      title={p ? `Unidad ${p.placa}` : 'Unidad'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          <Button variant="primary" icon={<ArrowUpRight size={16} />} onClick={() => abrirClasico('flota/placas')}>
            Editar en la versión actual
          </Button>
        </>
      }
    >
      {p && (
        <div className="ficha">
          <motion.div className="ficha__hero" initial={{ opacity: 0, scale: reduce ? 1 : 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
            <LicensePlate plate={p.placa} size="xl" />
            <div className="ficha__titulo">{[p.marca, p.modelo].filter(Boolean).join(' ') || 'Sin marca'}</div>
            <div className="ficha__chips">
              <span className={`placa-estado placa-estado--${p.estado.toLowerCase() === 'activa' ? 'on' : 'off'}`}>{p.estado}</span>
              <span className="chip chip--static">{p.motora ? 'Motora' : 'No motora'}</span>
              {p.tipo && <span className="chip chip--static">{p.tipo}</span>}
              {p.configuracion && <span className="chip chip--static">{p.configuracion}</span>}
            </div>
          </motion.div>

          <motion.div {...seccion(0)}>
            <Grupo titulo="General">
              <Dato label="Cliente" value={p.cliente} />
              <Dato label="RUC / DNI" value={p.ruc} mono />
              <Dato label="Año" value={p.anio} />
              <Dato label="Color" value={p.color} />
              <Dato label="Sub tipo" value={p.subTipo} />
            </Grupo>
          </motion.div>

          <motion.div {...seccion(1)}>
            <Grupo titulo="Técnico">
              <Dato label="Modelo de motor" value={p.modeloMotor} />
              <Dato label="N.º de motor" value={p.nroMotor} mono />
              <Dato label="N.º de caja" value={p.nroCaja} mono />
              <Dato label="N.º de corona" value={p.nroCorona} mono />
              <Dato label="VIN" value={p.vin} mono />
              <Dato label="Llantas" value={p.llantas} />
            </Grupo>
          </motion.div>

          <motion.div {...seccion(2)}>
            <Grupo titulo="Capacidad">
              <Dato label="Combustible" value={p.combustible} />
              <Dato label="Tanques" value={[p.tanque1, p.tanque2, p.tanque3].filter(Boolean).join(' · ')} />
              <Dato label="Capacidad total" value={p.capacidadTanque} />
              <Dato label="Carga útil" value={p.cargaUtil} />
              <Dato label="Peso neto" value={p.pesoNeto} />
              <Dato label="Peso bruto" value={p.pesoBruto} />
              <Dato label="Tara" value={p.tara} />
            </Grupo>
          </motion.div>

          <motion.div {...seccion(3)}>
            <Grupo titulo="Operación">
              <Dato label="En uso" value={p.enUso ? 'Sí' : 'No'} />
              <Dato label="UTS" value={p.uts} />
              <Dato label="Unidad en Wialon (GPS)" value={p.wialon} />
            </Grupo>
          </motion.div>
        </div>
      )}
    </Sheet>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="ficha__grupo">
      <div className="list__header">{titulo}</div>
      <div className="list">{children}</div>
    </section>
  );
}

function Dato({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="row ficha__dato">
      <span className="row__main ficha__label">{label}</span>
      <span className={`ficha__valor${mono ? ' ficha__valor--mono' : ''}${value ? '' : ' ficha__valor--vacio'}`}>{value || '—'}</span>
    </div>
  );
}
