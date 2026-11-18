import { useEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, Contact, IdCard, Pencil, Printer, Trash2 } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import '../../core/ui/acciones-iconos.css';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { spring } from '../../core/lib/motion';
import { nombreCompleto, type Persona } from './api';
import { descargarVCard, fichaEnPantalla, imprimirFotocheck } from './documentos';

// RRHH › Personal: el detalle de la persona ES su ficha de registro (la misma que se imprime), con las acciones arriba a la derecha.
export function PersonaFicha({ persona: p, onEditar, onEliminar, onVolver, verPagos }: {
  persona: Persona;
  onEditar?: () => void;
  onEliminar?: () => void;
  /** Solo en el celular: vuelve a la lista */
  onVolver?: () => void;
  /** Sueldo, cuentas y pensión: solo para quien puede editar al personal */
  verPagos: boolean;
}) {
  const reduce = useReducedMotion();
  const toast = useToast();
  const marco = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => fichaEnPantalla(p, verPagos), [p, verPagos]);

  // El marco crece hasta mostrar toda la hoja: el desplazamiento es el del panel, no el del marco
  const ajustar = () => {
    const m = marco.current; const d = m?.contentDocument;
    if (m && d) m.style.height = `${d.documentElement.scrollHeight}px`;
  };
  useEffect(() => {
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);

  const seguro = (f: () => unknown) => async () => { try { await f(); } catch (err) { toast(errorMessage(err), 'error'); } };
  const imprimir = () => { const w = marco.current?.contentWindow; if (w) { w.focus(); w.print(); } };

  return (
    <motion.article
      key={p.id}
      className="ficha-personal"
      initial={{ opacity: 0, x: reduce ? 0 : onVolver ? 28 : 0 }}
      animate={{ opacity: 1, x: 0 }}
      transition={spring}
      aria-label={`Ficha de ${nombreCompleto(p)}`}
    >
      <div className="tarjeta__barra">
        {onVolver ? (
          <button type="button" className="tarjeta__volver pressable" onClick={onVolver}><ChevronLeft size={22} /> Personal</button>
        ) : <span />}
        <div className="acciones-iconos acciones-iconos--sinfondo tarjeta__barra-acciones" role="group" aria-label="Acciones de la ficha">
          <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--azul" data-tip="Imprimir ficha" aria-label="Imprimir ficha" icon={<Printer size={17} />} onClick={imprimir} />
          <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--violeta" data-tip="Imprimir fotocheck" aria-label="Imprimir fotocheck" icon={<IdCard size={17} />} onClick={seguro(() => imprimirFotocheck(p))} />
          <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--verde" data-tip="Compartir contacto (.vcf)" aria-label="Compartir contacto" icon={<Contact size={17} />} onClick={() => descargarVCard(p)} />
          {onEditar && <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--ambar" data-tip="Editar" aria-label="Editar" icon={<Pencil size={17} />} onClick={onEditar} />}
          {onEliminar && <Button variant="plain" size="sm" iconOnly className="acciones-iconos__boton acciones-iconos__boton--rojo" data-tip="Eliminar" aria-label="Eliminar" icon={<Trash2 size={17} />} onClick={onEliminar} />}
        </div>
      </div>
      <iframe ref={marco} className="ficha-personal__hoja" title={`Ficha de ${nombreCompleto(p)}`} srcDoc={html} onLoad={ajustar} />
    </motion.article>
  );
}
