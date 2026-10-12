import { useEffect, useRef, useState, type DragEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet, Upload } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { errorMessage } from '../../core/api/client';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { analizar, ArchivoInvalido, descargarPlantilla, importar, leerExcel, type Analisis } from './importar';
import type { Conductor } from './api';
import { FotoConductor } from './FotoConductor';

type Paso =
  | { paso: 'elegir'; error?: string }
  | { paso: 'revisar'; archivo: string; analisis: Analisis }
  | { paso: 'listo'; insertados: number; errores: number };

// Importar conductores en tres pasos: elegir → revisar → listo.
export function ImportarConductores({ open, onClose, existentes }: { open: boolean; onClose: () => void; existentes: Conductor[] }) {
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const input = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Paso>({ paso: 'elegir' });
  const [ocupado, setOcupado] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  useEffect(() => { if (open) setEstado({ paso: 'elegir' }); }, [open]);

  async function leer(archivo: File | undefined) {
    if (!archivo) return;
    setOcupado(true);
    try {
      const filas = await leerExcel(archivo);
      if (!filas.length) throw new ArchivoInvalido('El archivo no tiene filas con datos debajo de los encabezados.');
      setEstado({ paso: 'revisar', archivo: archivo.name, analisis: analizar(filas, existentes) });
      haptic('selection');
    } catch (err) {
      setEstado({ paso: 'elegir', error: errorMessage(err) });
      haptic('warning');
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = '';
    }
  }

  async function confirmar() {
    if (estado.paso !== 'revisar') return;
    setOcupado(true);
    try {
      const r = await importar(estado.analisis.nuevos);
      await qc.invalidateQueries({ queryKey: ['conductores'] });
      setEstado({ paso: 'listo', insertados: r.insertados, errores: r.errores });
      haptic('success');
    } catch (err) {
      setEstado({ paso: 'elegir', error: errorMessage(err) });
      haptic('warning');
    } finally {
      setOcupado(false);
    }
  }

  const soltar = (e: DragEvent) => { e.preventDefault(); setArrastrando(false); leer(e.dataTransfer.files[0]); };
  const transicion = { initial: { opacity: 0, x: reduce ? 0 : 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: reduce ? 0 : -24 }, transition: spring };

  const footer = estado.paso === 'elegir' ? <Button variant="secondary" onClick={onClose}>Cancelar</Button>
    : estado.paso === 'revisar' ? (
      <>
        <Button variant="secondary" onClick={() => setEstado({ paso: 'elegir' })} disabled={ocupado}>Elegir otro archivo</Button>
        <Button variant="primary" onClick={confirmar} loading={ocupado} disabled={!estado.analisis.nuevos.length}>
          Agregar {estado.analisis.nuevos.length} {estado.analisis.nuevos.length === 1 ? 'conductor' : 'conductores'}
        </Button>
      </>
    ) : <Button variant="primary" onClick={onClose}>Listo</Button>;

  return (
    <Sheet open={open} onClose={onClose} title="Importar conductores desde Excel" footer={footer}>
      <AnimatePresence mode="wait" initial={false}>
        {estado.paso === 'elegir' && (
          <motion.div key="elegir" {...transicion} className="importar">
            <button type="button" className={`importar__zona pressable${arrastrando ? ' importar__zona--activa' : ''}`}
              onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)} onDrop={soltar} disabled={ocupado}>
              <motion.span className="importar__icono" animate={arrastrando && !reduce ? { y: -6, scale: 1.08 } : { y: 0, scale: 1 }} transition={spring}>
                {ocupado ? <FileSpreadsheet size={30} /> : <Upload size={30} />}
              </motion.span>
              <span className="importar__titulo">{ocupado ? 'Leyendo el archivo…' : 'Arrastra tu Excel aquí'}</span>
              <span className="t-footnote c-secondary">o toca para buscarlo · solo archivos .xlsx</span>
            </button>
            <input ref={input} type="file" accept=".xlsx" hidden onChange={e => leer(e.target.files?.[0])} />
            {estado.error && <Notice tone="error" icon={<CircleAlert size={16} />}>{estado.error}</Notice>}
            <p className="t-footnote c-secondary importar__ayuda">
              ¿No tienes el formato? <button type="button" className="placas-limpiar" onClick={() => descargarPlantilla()}>Descargar plantilla</button>.
              Las personas cuyo DNI ya está registrado se omiten, para no duplicarlas.
            </p>
          </motion.div>
        )}

        {estado.paso === 'revisar' && (
          <motion.div key="revisar" {...transicion} className="importar">
            <p className="t-footnote c-secondary"><FileSpreadsheet size={14} style={{ verticalAlign: '-2px' }} /> {estado.archivo}</p>
            <div className="importar__resumen">
              <div className="importar__cifra importar__cifra--nuevas"><AnimatedNumber value={estado.analisis.nuevos.length} className="t-numeric" /><span>nuevos</span></div>
              <div className="importar__cifra importar__cifra--actualizar"><AnimatedNumber value={estado.analisis.yaExisten.length} className="t-numeric" /><span>ya registrados</span></div>
              <div className="importar__cifra"><AnimatedNumber value={estado.analisis.sinNombre + estado.analisis.repetidos} className="t-numeric" /><span>se omiten</span></div>
            </div>
            {estado.analisis.yaExisten.length > 0 && (
              <Notice tone="neutral">
                {estado.analisis.yaExisten.length} {estado.analisis.yaExisten.length === 1 ? 'persona ya está' : 'personas ya están'} en el directorio
                y no se agregan otra vez: {estado.analisis.yaExisten.slice(0, 4).map(f => f.nombre).join(', ')}{estado.analisis.yaExisten.length > 4 ? '…' : ''}.
                Para cambiar sus datos, edítalas desde su ficha.
              </Notice>
            )}
            <ul className="importar__personas">
              {estado.analisis.nuevos.slice(0, 10).map((f, i) => (
                <motion.li key={f.dni || f.nombre} initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: reduce ? 0 : i * 0.03 }}>
                  <FotoConductor conductor={{ nombre: f.nombre, foto: '' }} size={32} />
                  <div className="row__main">
                    <div className="row__title">{f.nombre}</div>
                    <div className="row__subtitle">{[f.dni && `DNI ${f.dni}`, f.licencia, f.empresa].filter(Boolean).join(' · ')}</div>
                  </div>
                </motion.li>
              ))}
            </ul>
            {estado.analisis.nuevos.length > 10 && <p className="t-footnote c-secondary">y {estado.analisis.nuevos.length - 10} más.</p>}
          </motion.div>
        )}

        {estado.paso === 'listo' && (
          <motion.div key="listo" {...transicion} className="importar importar--listo">
            <svg className="importar__check" viewBox="0 0 64 64" aria-hidden>
              <motion.circle cx="32" cy="32" r="29" fill="none" stroke="var(--green)" strokeWidth="4"
                initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : 0.45, ease: [0.25, 1, 0.5, 1] }} />
              <motion.path d="M20 33 l8 8 l16 -18" fill="none" stroke="var(--green)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ delay: reduce ? 0 : 0.35, duration: reduce ? 0 : 0.3, ease: [0.25, 1, 0.5, 1] }} />
            </svg>
            <div className="importar__titulo"><AnimatedNumber value={estado.insertados} className="t-numeric" /> conductores agregados</div>
            {estado.errores > 0 && <Notice tone="error">{estado.errores} filas no se pudieron guardar.</Notice>}
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}
