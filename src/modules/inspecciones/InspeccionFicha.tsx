import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Check, Minus, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { spring } from '../../core/lib/motion';
import { abrirClasico } from '../../core/layout/navigation';
import { useFotosFirmadas, type Inspeccion, type PuntoRevisado } from './api';

const fechaLarga = (d: Date | null) => (d ? d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha');

// Ficha de una inspección: resumen, puntos revisados por categoría (fallas primero), fotos y firma.
export function InspeccionFicha({ inspeccion, onClose }: { inspeccion: Inspeccion | null; onClose: () => void }) {
  const ultima = useRef<Inspeccion | null>(null);
  if (inspeccion) ultima.current = inspeccion;
  const i = inspeccion ?? ultima.current;
  const reduce = useReducedMotion();
  const [ampliada, setAmpliada] = useState<string | null>(null);

  const fotos = useMemo(() => [...(i?.puntos.map(p => p.foto).filter(Boolean) ?? []), i?.firma ?? ''].filter(Boolean), [i]);
  const firmadas = useFotosFirmadas(fotos);
  const ver = (url: string) => firmadas.data?.[url] ?? url;

  const conteo = useMemo(() => {
    const c = { OK: 0, FALLA: 0, otros: 0 };
    i?.puntos.forEach(p => { if (p.estado === 'OK') c.OK++; else if (p.estado === 'FALLA') c.FALLA++; else c.otros++; });
    return c;
  }, [i]);

  const categorias = useMemo(() => {
    const g = new Map<string, PuntoRevisado[]>();
    i?.puntos.forEach(p => g.set(p.categoria, [...(g.get(p.categoria) ?? []), p]));
    const orden = (p: PuntoRevisado) => (p.estado === 'FALLA' ? 0 : p.estado === 'OK' ? 2 : 1);
    return [...g.entries()].map(([cat, ps]) => [cat, [...ps].sort((a, b) => orden(a) - orden(b))] as const)
      .sort((a, b) => b[1].filter(p => p.estado === 'FALLA').length - a[1].filter(p => p.estado === 'FALLA').length);
  }, [i]);

  return (
    <>
      <Sheet
        open={!!inspeccion}
        onClose={onClose}
        title={i ? `Inspección ${i.id}` : 'Inspección'}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
            <Button variant="primary" icon={<ArrowUpRight size={16} />} onClick={() => abrirClasico('mantenimiento/inspecciones')}>PDF y edición</Button>
          </>
        }
      >
        {i && (
          <div className="ficha">
            <motion.div className="ficha__hero" initial={{ opacity: 0, scale: reduce ? 1 : 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
              <LicensePlate plate={i.placa} size="xl" />
              <div className="ficha__titulo insp-ficha__fecha">{fechaLarga(i.fecha)}</div>
              <div className="ficha__chips">
                {i.tecnico && <span className="chip chip--static">Técnico: {i.tecnico}</span>}
                {i.km !== null && <span className="chip chip--static">{i.km.toLocaleString('es-PE')} km</span>}
                {i.tipo && <span className="chip chip--static">{i.tipo}</span>}
                {i.idOt && <span className="chip chip--static">OT {i.idOt}</span>}
              </div>
            </motion.div>

            <div className="insp-resumen">
              <div className="insp-resumen__item insp-resumen__item--ok"><AnimatedNumber value={conteo.OK} className="t-numeric" /><span>en buen estado</span></div>
              <div className="insp-resumen__item insp-resumen__item--falla"><AnimatedNumber value={conteo.FALLA} className="t-numeric" /><span>con falla</span></div>
              <div className="insp-resumen__item"><AnimatedNumber value={conteo.otros} className="t-numeric" /><span>sin datos</span></div>
            </div>

            {categorias.map(([cat, ps], k) => (
              <motion.section key={cat} className="ficha__grupo" initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: reduce ? 0 : 0.04 * k }}>
                <div className="list__header insp-cat">
                  {cat}
                  {ps.some(p => p.estado === 'FALLA') && <span className="insp-fallas">{ps.filter(p => p.estado === 'FALLA').length}</span>}
                </div>
                <div className="list">
                  {ps.map((p, n) => (
                    <div key={n} className={`row insp-punto insp-punto--${p.estado === 'FALLA' ? 'falla' : p.estado === 'OK' ? 'ok' : 'nd'}`}>
                      <span className="insp-punto__icono" aria-hidden>
                        {p.estado === 'OK' ? <Check size={14} strokeWidth={3} /> : p.estado === 'FALLA' ? <X size={14} strokeWidth={3} /> : <Minus size={14} strokeWidth={3} />}
                      </span>
                      <div className="row__main">
                        <div className="row__title">{p.item}</div>
                        {p.observacion && <div className="row__subtitle row__subtitle--wrap">{p.observacion}</div>}
                        {!['OK', 'FALLA', 'SIN DATOS'].includes(p.estado) && <div className="row__subtitle">{p.estado}</div>}
                      </div>
                      {p.foto && (
                        <button type="button" className="insp-foto pressable" onClick={() => setAmpliada(ver(p.foto))} aria-label={`Ver foto de ${p.item}`}>
                          <img src={ver(p.foto)} alt="" loading="lazy" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.section>
            ))}

            {i.firma && (
              <section className="ficha__grupo">
                <div className="list__header">Firma</div>
                <div className="insp-firma"><img src={ver(i.firma)} alt="Firma del técnico" /></div>
              </section>
            )}
          </div>
        )}
      </Sheet>

      {/* Foto ampliada */}
      {createPortal(
        <AnimatePresence>
          {ampliada && (
            <motion.div className="insp-visor" onClick={() => setAmpliada(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <motion.img src={ampliada} alt="Foto de la falla" initial={{ scale: reduce ? 1 : 0.92 }} animate={{ scale: 1 }} exit={{ scale: reduce ? 1 : 0.95 }} transition={spring} />
              <button type="button" className="insp-visor__cerrar glass-btn" aria-label="Cerrar foto"><X size={20} /></button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
