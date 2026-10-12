import { useEffect, useRef, useState, type DragEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet, Upload } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { AnimatedNumber } from '../../core/ui/AnimatedNumber';
import { errorMessage } from '../../core/api/client';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { analizar, ArchivoInvalido, descargarPlantilla, importar, leerExcel, type Analisis, type Registro } from './importar';
import type { Placa } from './api';

type Paso =
  | { paso: 'elegir'; error?: string }
  | { paso: 'revisar'; archivo: string; registros: Registro[]; analisis: Analisis; ignoradas: string[] }
  | { paso: 'listo'; ok: number; errores: number };

// Importar placas desde Excel en tres pasos: elegir → revisar → listo.
export function ImportarPlacas({ open, onClose, existentes }: { open: boolean; onClose: () => void; existentes: Placa[] }) {
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
      const { registros, ignoradas } = await leerExcel(archivo);
      if (!registros.length) throw new ArchivoInvalido('El archivo no tiene filas con datos debajo de los encabezados.');
      setEstado({ paso: 'revisar', archivo: archivo.name, registros, analisis: analizar(registros, existentes), ignoradas });
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
      // Solo filas con placa y sin repetir dentro del archivo (la última repetida no gana sin aviso)
      const vistas = new Set<string>();
      const registros = estado.registros.filter(r => {
        const p = (r.placa ?? '').toUpperCase();
        if (!p || vistas.has(p)) return false;
        vistas.add(p);
        return true;
      });
      const r = await importar(registros);
      await qc.invalidateQueries({ queryKey: ['placas'] });
      setEstado({ paso: 'listo', ok: r.ok, errores: r.errores });
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

  const footer = estado.paso === 'elegir' ? (
    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
  ) : estado.paso === 'revisar' ? (
    <>
      <Button variant="secondary" onClick={() => setEstado({ paso: 'elegir' })} disabled={ocupado}>Elegir otro archivo</Button>
      <Button variant="primary" onClick={confirmar} loading={ocupado}
        disabled={!estado.analisis.nuevas.length && !estado.analisis.actualizar.length && !estado.analisis.parecidas.length}>
        Importar {estado.analisis.nuevas.length + estado.analisis.actualizar.length + estado.analisis.parecidas.length} placas
      </Button>
    </>
  ) : (
    <Button variant="primary" onClick={onClose}>Listo</Button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Importar placas desde Excel" footer={footer}>
      <AnimatePresence mode="wait" initial={false}>
        {estado.paso === 'elegir' && (
          <motion.div key="elegir" {...transicion} className="importar">
            <button
              type="button"
              className={`importar__zona pressable${arrastrando ? ' importar__zona--activa' : ''}`}
              onClick={() => input.current?.click()}
              onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={soltar}
              disabled={ocupado}
            >
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
              Si una placa ya existe, sus datos se reemplazan por los del Excel.
            </p>
          </motion.div>
        )}

        {estado.paso === 'revisar' && (
          <motion.div key="revisar" {...transicion} className="importar">
            <p className="t-footnote c-secondary"><FileSpreadsheet size={14} style={{ verticalAlign: '-2px' }} /> {estado.archivo} · {estado.registros.length} filas</p>
            <div className="importar__resumen">
              <div className="importar__cifra importar__cifra--nuevas"><AnimatedNumber value={estado.analisis.nuevas.length} className="t-numeric" /><span>nuevas</span></div>
              <div className="importar__cifra importar__cifra--actualizar"><AnimatedNumber value={estado.analisis.actualizar.length} className="t-numeric" /><span>se actualizan</span></div>
              <div className="importar__cifra"><AnimatedNumber value={estado.analisis.sinPlaca + estado.analisis.repetidasEnArchivo.length} className="t-numeric" /><span>se omiten</span></div>
            </div>

            {estado.analisis.actualizar.length > 0 && (
              <Notice tone="neutral">Las {estado.analisis.actualizar.length} placas que ya existen se reemplazarán con los datos del Excel.</Notice>
            )}
            {estado.analisis.parecidas.length > 0 && (
              <Notice tone="error" icon={<CircleAlert size={16} />}>
                {estado.analisis.parecidas.length} placas ya existen con otro formato y se crearían como unidades distintas: {estado.analisis.parecidas.slice(0, 6).join(', ')}
                {estado.analisis.parecidas.length > 6 ? '…' : ''}. Corrígelas en el Excel si son la misma unidad.
              </Notice>
            )}
            {(estado.analisis.sinPlaca > 0 || estado.analisis.repetidasEnArchivo.length > 0) && (
              <p className="t-footnote c-secondary">
                Se omiten {estado.analisis.sinPlaca > 0 && `${estado.analisis.sinPlaca} filas sin placa`}
                {estado.analisis.sinPlaca > 0 && estado.analisis.repetidasEnArchivo.length > 0 && ' y '}
                {estado.analisis.repetidasEnArchivo.length > 0 && `${estado.analisis.repetidasEnArchivo.length} repetidas en el archivo (se usa la primera)`}.
              </p>
            )}
            {estado.ignoradas.length > 0 && (
              <p className="t-footnote c-secondary">Columnas que no se usan: {estado.ignoradas.join(', ')}.</p>
            )}

            <ul className="importar__vista">
              {[...estado.analisis.nuevas.map(p => [p, 'Nueva'] as const), ...estado.analisis.actualizar.map(p => [p, 'Actualiza'] as const), ...estado.analisis.parecidas.map(p => [p, 'Revisar'] as const)]
                .slice(0, 12).map(([p, tag], i) => (
                  <motion.li key={p} initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: reduce ? 0 : i * 0.03 }}>
                    <LicensePlate plate={p} size="sm" />
                    <span className={`importar__tag importar__tag--${tag.toLowerCase()}`}>{tag}</span>
                  </motion.li>
                ))}
            </ul>
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
            <div className="importar__titulo"><AnimatedNumber value={estado.ok} className="t-numeric" /> placas importadas</div>
            {estado.errores > 0 && <Notice tone="error">{estado.errores} filas no se pudieron guardar (sin placa o con datos no válidos).</Notice>}
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}
