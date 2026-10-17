import { agruparEmpresas } from '../../core/lib/empresa';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, LoaderCircle, Sparkles, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { comprimirFoto, guardarConductor, nombrePorDni, useEmpresas, type Conductor } from './api';
import { FotoConductor } from './FotoConductor';

const VACIO: Conductor = { id: 0, nombre: '', empresa: '', telefono: '', dni: '', licencia: '', estado: 'Activo', foto: '' };
type Campo = 'nombre' | 'dni' | 'telefono' | 'licencia';

// Crear o editar un conductor (POST /api/script/guardarConductor, mismas reglas que la versión actual).
export function ConductorFormulario({ conductor, existentes, open, onClose, onGuardado }: {
  conductor: Conductor | null;
  existentes: Conductor[];
  open: boolean;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const empresasApi = useEmpresas();
  const [c, setC] = useState<Conductor>(conductor ?? VACIO);
  const [fotoNueva, setFotoNueva] = useState<string | undefined>();
  const [tocados, setTocados] = useState<Set<Campo>>(new Set());
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [buscandoDni, setBuscandoDni] = useState(false);
  const [deReniec, setDeReniec] = useState(false);
  const consultado = useRef('');
  const inputFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setC(conductor ?? VACIO); setFotoNueva(undefined); setTocados(new Set()); setIntento(false); setDeReniec(false);
      consultado.current = conductor?.dni ?? '';
    }
  }, [open, conductor]);

  const editando = !!conductor;
  const errores = useMemo(() => {
    const e: Partial<Record<Campo, string>> = {};
    if (!c.nombre.trim()) e.nombre = 'Escribe el nombre completo.';
    if (c.dni && !/^\d{8}$/.test(c.dni)) e.dni = 'El DNI tiene 8 dígitos.';
    else if (c.dni) {
      const otro = existentes.find(x => x.dni === c.dni && x.id !== c.id);
      if (otro) e.dni = `Este DNI ya está registrado: ${otro.nombre}.`;
    }
    const tel = c.telefono.replace(/[\s+-]/g, '');
    if (tel && !/^(51)?\d{9}$/.test(tel)) e.telefono = 'Escribe un celular de 9 dígitos.';
    if (c.licencia && !/^[A-Z0-9]{8,12}$/.test(c.licencia)) e.licencia = 'El brevete tiene entre 8 y 12 letras o números, como Q12345678.';
    return e;
  }, [c, existentes]);
  const error = (k: Campo) => ((intento || tocados.has(k)) ? errores[k] : undefined) ?? null;
  const tocar = (k: Campo) => () => setTocados(s => new Set(s).add(k));
  const campo = (k: Campo, t?: (v: string) => string) => ({
    value: c[k],
    onChange: (ev: ChangeEvent<HTMLInputElement>) => setC(x => ({ ...x, [k]: t ? t(ev.target.value) : ev.target.value })),
    onBlur: tocar(k),
  });

  // Al completar 8 dígitos, el nombre llega solo desde RENIEC (si el campo está vacío o vino de RENIEC)
  useEffect(() => {
    if (!open || !/^\d{8}$/.test(c.dni) || c.dni === consultado.current) return;
    consultado.current = c.dni;
    let vigente = true;
    setBuscandoDni(true);
    nombrePorDni(c.dni)
      .then(nombre => {
        if (!vigente || !nombre) return;
        setC(x => (!x.nombre || deReniec ? { ...x, nombre } : x));
        setDeReniec(true);
        haptic('success');
      })
      .catch(() => { /* sin RENIEC: se escribe a mano */ })
      .finally(() => vigente && setBuscandoDni(false));
    return () => { vigente = false; };
  }, [c.dni, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const empresas = useMemo(() => {
    const todas = [...(empresasApi.data ?? []), ...existentes.map(x => x.empresa)];
    return agruparEmpresas(todas).map(g => g.nombre).sort((a, b) => a.localeCompare(b, 'es')).map(e => ({ value: e, label: e }));
  }, [empresasApi.data, existentes]);

  async function elegirFoto(archivo: File | undefined) {
    if (!archivo) return;
    try { setFotoNueva(await comprimirFoto(archivo)); }
    catch (err) { toast(errorMessage(err), 'error'); }
    finally { if (inputFoto.current) inputFoto.current.value = ''; }
  }

  const cambiado = !conductor || fotoNueva !== undefined || JSON.stringify(conductor) !== JSON.stringify(c);

  async function guardar() {
    setIntento(true);
    if (Object.keys(errores).length) { haptic('warning'); return; }
    setGuardando(true);
    try {
      await guardarConductor({ ...c, nombre: c.nombre.trim().toUpperCase(), licencia: c.licencia.trim().toUpperCase() }, fotoNueva);
      toast(editando ? 'Cambios guardados' : `${c.nombre.trim().toUpperCase()} agregado al directorio`);
      haptic('success');
      await qc.invalidateQueries({ queryKey: ['conductores'] });
      onGuardado();
    } catch (err) {
      toast(errorMessage(err), 'error');
      haptic('warning');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editando ? 'Editar conductor' : 'Nuevo conductor'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando} disabled={!cambiado}>{editando ? 'Guardar cambios' : 'Agregar conductor'}</Button>
        </>
      }
    >
      <div className="placa-form">
        <div className="conductor-form__foto">
          <button type="button" className="conductor-form__foto-btn pressable" onClick={() => inputFoto.current?.click()} aria-label="Cambiar foto">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={fotoNueva ?? c.foto ?? 'iniciales'} initial={{ opacity: 0, scale: reduce ? 1 : 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring}>
                <FotoConductor conductor={c} foto={fotoNueva ?? (c.foto || undefined)} size={96} />
              </motion.span>
            </AnimatePresence>
            <span className="conductor-form__camara"><Camera size={15} /></span>
          </button>
          {fotoNueva && (
            <button type="button" className="placas-limpiar" onClick={() => setFotoNueva(undefined)}><X size={13} style={{ verticalAlign: '-2px' }} /> Quitar foto nueva</button>
          )}
          <input ref={inputFoto} type="file" accept="image/*" hidden onChange={e => elegirFoto(e.target.files?.[0])} />
        </div>

        <section className="form-section">
          <h3 className="form-section__title">Identificación</h3>
          <div className="form-grid">
            <Field label="DNI" error={error('dni')} hint={buscandoDni ? 'Buscando en RENIEC…' : 'Con 8 dígitos el nombre se completa solo.'}>
              {props => (
                <div className="conductor-form__dni">
                  <TextInput {...props} {...campo('dni', v => v.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoFocus={!editando} className="input--mono" />
                  {buscandoDni && <LoaderCircle size={16} className="conductor-form__girando" aria-hidden />}
                </div>
              )}
            </Field>
            <Field label="Licencia de conducir" error={error('licencia')}>
              {props => <TextInput {...props} {...campo('licencia', v => v.toUpperCase().replace(/\s/g, '').slice(0, 20))} placeholder="Q12345678" className="input--mono" />}
            </Field>
            <Field label="Nombre completo" error={error('nombre')} wide
              hint={deReniec ? <span className="conductor-form__reniec"><Sparkles size={12} /> Obtenido de RENIEC</span> : undefined}>
              {props => (
                <motion.div key={deReniec ? c.nombre : 'manual'} initial={deReniec && !reduce ? { backgroundColor: 'var(--green-tint)' } : false}
                  animate={{ backgroundColor: 'rgba(0,0,0,0)' }} transition={{ duration: 1.2 }} style={{ borderRadius: 'var(--r-md)' }}>
                  <TextInput {...props} value={c.nombre} onBlur={tocar('nombre')}
                    onChange={e => { setDeReniec(false); setC(x => ({ ...x, nombre: e.target.value.toUpperCase() })); }} />
                </motion.div>
              )}
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3 className="form-section__title">Contacto y empresa</h3>
          <div className="form-grid">
            <Field label="Celular" error={error('telefono')}>
              {props => <TextInput {...props} {...campo('telefono', v => v.replace(/[^\d\s+]/g, '').slice(0, 15))} inputMode="tel" placeholder="987 654 321" />}
            </Field>
            <div className="field">
              <span className="field__label">Estado</span>
              <SegmentedControl block label="Estado" value={c.estado === 'Inactivo' ? 'Inactivo' : 'Activo'} onChange={v => setC(x => ({ ...x, estado: v }))}
                options={[{ value: 'Activo', label: 'Activo' }, { value: 'Inactivo', label: 'Inactivo' }]} />
            </div>
            <Field label="Empresa" wide>
              {props => <Combobox {...props} options={empresas} value={c.empresa || null} onChange={v => setC(x => ({ ...x, empresa: v ?? '' }))}
                placeholder="Busca o escribe la empresa" onCreate={t => setC(x => ({ ...x, empresa: t.trim().toUpperCase() }))} createLabel="Usar" />}
            </Field>
          </div>
        </section>
      </div>
    </Sheet>
  );
}
