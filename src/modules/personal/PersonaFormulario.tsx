import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, LoaderCircle, Sparkles, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { SwitchRow, decimalInput, parseEmail } from '../../core/ui/forms';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import {
  ASIGNACION_FAMILIAR, CENTRO_POR_AREA, comprimirFoto, datosPorDni, finDeContrato, guardarPersona, nombreCompleto, nuevaPersona, OPCIONES, type Persona,
} from './api';
import { FotoPersona } from './FotoPersona';

type Pestana = 'persona' | 'puesto' | 'contrato' | 'salud';
type Clave = keyof Persona;

// Dónde está cada campo obligatorio (para llevar a la pestaña del primer error)
const PESTANA_DE: Partial<Record<Clave, Pestana>> = {
  numero_documento: 'persona', nombres: 'persona', apellidos: 'persona', telefono: 'persona', email: 'persona',
  cargo: 'puesto', fecha_ingreso: 'puesto', sueldo_basico: 'contrato', fecha_fin_contrato: 'contrato',
};
const SIN_FIN = new Set(['INDETERMINADO', 'LOCACION_SERVICIOS']);
const DURACIONES = [{ value: '1', label: '1 mes' }, { value: '3', label: '3 meses' }, { value: '6', label: '6 meses' }, { value: '12', label: '1 año' }, { value: '', label: 'Otra fecha' }];

// Alta y edición de una persona del directorio (mismos campos y reglas que RRHH › Personal de la versión actual).
export function PersonaFormulario({ open, persona, existentes, onClose, onGuardado }: {
  open: boolean;
  persona: Persona | null;
  existentes: Persona[];
  onClose: () => void;
  onGuardado: (id: number) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const [p, setP] = useState<Persona>(persona ?? nuevaPersona());
  const [pestana, setPestana] = useState<Pestana>('persona');
  const [fotoNueva, setFotoNueva] = useState<string | undefined>();
  const [tocados, setTocados] = useState<Set<Clave>>(new Set());
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [duracion, setDuracion] = useState('');
  const [buscandoDni, setBuscandoDni] = useState(false);
  const [deReniec, setDeReniec] = useState(false);
  const consultado = useRef('');
  const inputFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const base = persona ?? nuevaPersona();
    setP(base); setPestana('persona'); setFotoNueva(undefined); setTocados(new Set()); setIntento(false); setDeReniec(false);
    setDuracion(persona ? '' : '6');
    consultado.current = persona?.numero_documento ?? '';
  }, [open, persona]);

  const editando = !!persona;
  const set = <K extends Clave>(k: K, v: Persona[K]) => setP(x => ({ ...x, [k]: v }));
  const tocar = (k: Clave) => () => setTocados(s => new Set(s).add(k));

  const errores = useMemo(() => {
    const e: Partial<Record<Clave, string>> = {};
    const doc = p.numero_documento.trim();
    if (!doc) e.numero_documento = 'Escribe el número de documento.';
    else if (p.tipo_documento === 'DNI' && !/^\d{8}$/.test(doc)) e.numero_documento = 'El DNI tiene 8 dígitos.';
    else {
      const otro = existentes.find(x => x.numero_documento === doc && x.id !== p.id);
      if (otro) e.numero_documento = `Ya está registrado: ${nombreCompleto(otro)}.`;
    }
    if (!p.nombres.trim()) e.nombres = 'Escribe los nombres.';
    if (!p.apellidos.trim()) e.apellidos = 'Escribe los apellidos.';
    if (!p.cargo.trim()) e.cargo = 'Escribe el cargo.';
    if (!p.fecha_ingreso) e.fecha_ingreso = 'Indica la fecha de ingreso.';
    const tel = p.telefono.replace(/[\s+-]/g, '');
    if (tel && !/^(51)?\d{9}$/.test(tel)) e.telefono = 'Escribe un celular de 9 dígitos.';
    if (p.email.trim() && !parseEmail(p.email)) e.email = 'Revisa el correo.';
    if (p.sueldo_basico && !/^\d+([.,]\d{1,2})?$/.test(p.sueldo_basico)) e.sueldo_basico = 'Escribe un monto válido.';
    if (p.fecha_fin_contrato && p.fecha_inicio_contrato && p.fecha_fin_contrato < p.fecha_inicio_contrato) e.fecha_fin_contrato = 'El fin no puede ser antes del inicio.';
    return e;
  }, [p, existentes]);
  const error = (k: Clave) => ((intento || tocados.has(k)) ? errores[k] : undefined) ?? null;

  // DNI de 8 dígitos → nombres y apellidos desde RENIEC (si los campos están vacíos o vinieron de RENIEC)
  useEffect(() => {
    if (!open || p.tipo_documento !== 'DNI' || !/^\d{8}$/.test(p.numero_documento) || p.numero_documento === consultado.current) return;
    consultado.current = p.numero_documento;
    let vigente = true;
    setBuscandoDni(true);
    datosPorDni(p.numero_documento)
      .then(d => {
        if (!vigente || !d) return;
        setP(x => {
          const libre = deReniec || (!x.nombres && !x.apellidos);
          if (!libre) return x;
          return {
            ...x, nombres: d.nombres || x.nombres, apellidos: d.apellidos || x.apellidos,
            // A un conductor le sugiere el brevete (en Perú es Q + DNI)
            licencia_conducir: x.categoria_rol === 'CONDUCTOR' && !x.licencia_conducir ? `Q${x.numero_documento}` : x.licencia_conducir,
          };
        });
        setDeReniec(true);
        haptic('success');
      })
      .catch(() => { /* sin RENIEC: se escribe a mano */ })
      .finally(() => vigente && setBuscandoDni(false));
    return () => { vigente = false; };
  }, [p.numero_documento, p.tipo_documento, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fin de contrato automático: inicio + duración (como la versión actual)
  function recalcularFin(inicio: string, meses: string, tipo: string) {
    if (SIN_FIN.has(tipo) || !meses) return;
    const fin = finDeContrato(inicio, Number(meses));
    if (fin) set('fecha_fin_contrato', fin);
  }

  function cambiarTipoContrato(tipo: string) {
    setP(x => ({ ...x, tipo_contrato: tipo, fecha_fin_contrato: SIN_FIN.has(tipo) ? '' : x.fecha_fin_contrato }));
    if (tipo === 'PERIODO_PRUEBA') { setDuracion('3'); recalcularFin(p.fecha_inicio_contrato, '3', tipo); }
    else recalcularFin(p.fecha_inicio_contrato, duracion, tipo);
  }

  async function elegirFoto(archivo: File | undefined) {
    if (!archivo) return;
    try { setFotoNueva(await comprimirFoto(archivo)); haptic('selection'); }
    catch (err) { toast(errorMessage(err), 'error'); }
    finally { if (inputFoto.current) inputFoto.current.value = ''; }
  }

  const cambiado = !persona || fotoNueva !== undefined || JSON.stringify(persona) !== JSON.stringify(p);

  async function guardar() {
    setIntento(true);
    const claves = Object.keys(errores) as Clave[];
    if (claves.length) {
      haptic('warning');
      const destino = PESTANA_DE[claves[0]];
      if (destino && destino !== pestana) setPestana(destino);
      return;
    }
    setGuardando(true);
    try {
      const id = await guardarPersona({ ...p, sueldo_basico: p.sueldo_basico.replace(',', '.'), bono_fijo: p.bono_fijo.replace(',', '.') }, fotoNueva);
      toast(editando ? 'Cambios guardados' : `${nombreCompleto(p).toUpperCase()} se agregó al directorio`);
      haptic('success');
      await qc.invalidateQueries({ queryKey: ['personal'] });
      onGuardado(Number(id));
    } catch (err) {
      const msg = errorMessage(err);
      toast(/duplicate/i.test(msg) ? 'Ese número de documento ya está registrado.' : msg, 'error');
      haptic('warning');
    } finally {
      setGuardando(false);
    }
  }

  // Ayudantes de campos
  const texto = (k: Clave, label: string, extra: { wide?: boolean; placeholder?: string; mayus?: boolean; mono?: boolean; tipo?: string; max?: number; hint?: ReactNode; inputMode?: 'numeric' | 'tel' | 'email' | 'decimal' } = {}) => (
    <Field label={label} error={error(k)} wide={extra.wide} hint={extra.hint}>
      {props => (
        <TextInput {...props} type={extra.tipo ?? 'text'} value={String(p[k] ?? '')} placeholder={extra.placeholder} maxLength={extra.max}
          inputMode={extra.inputMode} className={extra.mono ? 'input--mono' : undefined} onBlur={tocar(k)}
          onChange={e => set(k, (extra.mayus ? e.target.value.toUpperCase() : e.target.value) as Persona[typeof k])} />
      )}
    </Field>
  );
  const fecha = (k: Clave, label: string, extra: { onChange?: (v: string) => void; disabled?: boolean; hint?: ReactNode } = {}) => (
    <Field label={label} error={error(k)} hint={extra.hint}>
      {props => (
        <TextInput {...props} type="date" value={String(p[k] ?? '')} disabled={extra.disabled} onBlur={tocar(k)}
          onChange={e => { set(k, e.target.value as Persona[typeof k]); extra.onChange?.(e.target.value); }} />
      )}
    </Field>
  );
  const lista = (k: Clave, label: string, opciones: Array<{ value: string; label: string }>, extra: { vacio?: string; onChange?: (v: string) => void; wide?: boolean } = {}) => (
    <Field label={label} wide={extra.wide}>
      {props => (
        <SelectInput {...props} value={String(p[k] ?? '')} onChange={e => { set(k, e.target.value as Persona[typeof k]); extra.onChange?.(e.target.value); }}>
          {extra.vacio !== undefined && <option value="">{extra.vacio}</option>}
          {opciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </SelectInput>
      )}
    </Field>
  );

  const conErrores = (t: Pestana) => intento && (Object.keys(errores) as Clave[]).some(k => PESTANA_DE[k] === t);
  const pestanas: Array<{ value: Pestana; label: string }> = [
    { value: 'persona', label: `Persona${conErrores('persona') ? ' •' : ''}` },
    { value: 'puesto', label: `Puesto${conErrores('puesto') ? ' •' : ''}` },
    { value: 'contrato', label: `Contrato${conErrores('contrato') ? ' •' : ''}` },
    { value: 'salud', label: 'Salud' },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editando ? 'Editar contacto' : 'Nuevo contacto'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando} disabled={!cambiado}>{editando ? 'Guardar' : 'Agregar'}</Button>
        </>
      }
    >
      <div className="placa-form persona-form">
        <div className="persona-form__cabecera">
          <button type="button" className="persona-form__foto pressable" onClick={() => inputFoto.current?.click()} aria-label={p.foto_url || fotoNueva ? 'Cambiar foto' : 'Agregar foto'}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={fotoNueva ?? p.foto_url ?? 'iniciales'} initial={{ opacity: 0, scale: reduce ? 1 : 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring}>
                <FotoPersona persona={p} foto={fotoNueva ?? (p.foto_url || undefined)} size={96} />
              </motion.span>
            </AnimatePresence>
            <span className="persona-form__camara"><Camera size={15} /></span>
          </button>
          <button type="button" className="persona-form__foto-txt" onClick={() => inputFoto.current?.click()}>{p.foto_url || fotoNueva ? 'Cambiar foto' : 'Agregar foto'}</button>
          {fotoNueva && <button type="button" className="placas-limpiar" onClick={() => setFotoNueva(undefined)}><X size={13} style={{ verticalAlign: '-2px' }} /> Quitar foto nueva</button>}
          <input ref={inputFoto} type="file" accept="image/*" hidden onChange={e => elegirFoto(e.target.files?.[0])} />
        </div>

        <SegmentedControl<Pestana> block label="Sección" value={pestana} onChange={setPestana} options={pestanas} />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={pestana} className="persona-form__pestana"
            initial={{ opacity: 0, x: reduce ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduce ? 0 : -12 }} transition={spring}>
            {pestana === 'persona' && (
              <>
                <section className="form-section">
                  <h3 className="form-section__title">Identidad</h3>
                  <div className="form-grid">
                    {lista('tipo_documento', 'Tipo de documento', OPCIONES.tipoDocumento)}
                    <Field label="N° de documento" error={error('numero_documento')}
                      hint={buscandoDni ? 'Buscando en RENIEC…' : p.tipo_documento === 'DNI' ? 'Con 8 dígitos, el nombre se completa solo.' : undefined}>
                      {props => (
                        <div className="conductor-form__dni">
                          <TextInput {...props} value={p.numero_documento} inputMode={p.tipo_documento === 'DNI' ? 'numeric' : 'text'} className="input--mono" autoFocus={!editando}
                            maxLength={p.tipo_documento === 'DNI' ? 8 : p.tipo_documento === 'CE' ? 12 : 15} onBlur={tocar('numero_documento')}
                            onChange={e => set('numero_documento', p.tipo_documento === 'DNI' ? e.target.value.replace(/\D/g, '') : e.target.value.toUpperCase().replace(/\s/g, ''))} />
                          {buscandoDni && <LoaderCircle size={16} className="conductor-form__girando" aria-hidden />}
                        </div>
                      )}
                    </Field>
                    <Field label="Nombres" error={error('nombres')} hint={deReniec ? <span className="conductor-form__reniec"><Sparkles size={12} /> Obtenido de RENIEC</span> : undefined}>
                      {props => <TextInput {...props} value={p.nombres} maxLength={100} onBlur={tocar('nombres')} onChange={e => { setDeReniec(false); set('nombres', e.target.value.toUpperCase()); }} />}
                    </Field>
                    <Field label="Apellidos" error={error('apellidos')}>
                      {props => <TextInput {...props} value={p.apellidos} maxLength={100} onBlur={tocar('apellidos')} onChange={e => { setDeReniec(false); set('apellidos', e.target.value.toUpperCase()); }} />}
                    </Field>
                    {lista('sexo', 'Sexo', OPCIONES.sexo)}
                    {fecha('fecha_nacimiento', 'Fecha de nacimiento')}
                    {lista('estado_civil', 'Estado civil', OPCIONES.estadoCivil)}
                    {texto('nacionalidad', 'Nacionalidad', { mayus: true, max: 50 })}
                  </div>
                </section>
                <section className="form-section">
                  <h3 className="form-section__title">Contacto</h3>
                  <div className="form-grid">
                    {texto('telefono', 'Celular', { placeholder: '987 654 321', inputMode: 'tel', max: 30 })}
                    {texto('email', 'Correo', { tipo: 'email', placeholder: 'nombre@empresa.com', inputMode: 'email', max: 100 })}
                    {texto('direccion', 'Dirección', { wide: true, mayus: true })}
                    {texto('distrito', 'Distrito', { mayus: true, max: 100 })}
                    {texto('provincia', 'Provincia', { mayus: true, max: 100 })}
                  </div>
                </section>
                <section className="form-section">
                  <h3 className="form-section__title">En caso de emergencia</h3>
                  <div className="form-grid">
                    {texto('contacto_emergencia_nombre', 'Nombre', { wide: true, mayus: true, max: 100 })}
                    {texto('contacto_emergencia_parentesco', 'Parentesco', { placeholder: 'Esposa, hermano…', max: 50 })}
                    {texto('contacto_emergencia_telefono', 'Celular', { inputMode: 'tel', max: 30 })}
                  </div>
                </section>
              </>
            )}

            {pestana === 'puesto' && (
              <section className="form-section">
                <h3 className="form-section__title">Puesto</h3>
                <div className="form-grid">
                  {texto('cargo', 'Cargo', { wide: true, mayus: true, max: 100, placeholder: 'CONDUCTOR DE TRACTO' })}
                  {lista('area', 'Área', OPCIONES.area, { onChange: a => CENTRO_POR_AREA[a] && set('centro_costo_codigo', CENTRO_POR_AREA[a]) })}
                  {lista('categoria_rol', 'Rol', OPCIONES.rol)}
                  {lista('centro_costo_codigo', 'Centro de costos', OPCIONES.centroCosto)}
                  {texto('sede', 'Sede o base', { mayus: true, max: 100 })}
                  {texto('jefe_inmediato', 'Jefe inmediato', { mayus: true, max: 100 })}
                  {lista('estado', 'Estado', OPCIONES.estado)}
                  {fecha('fecha_ingreso', 'Fecha de ingreso', { onChange: v => !p.fecha_inicio_contrato && set('fecha_inicio_contrato', v) })}
                  {p.estado === 'CESADO' && fecha('fecha_cese', 'Fecha de cese')}
                  {p.estado === 'CESADO' && texto('motivo_cese', 'Motivo del cese', { wide: true, max: 255 })}
                </div>
              </section>
            )}

            {pestana === 'contrato' && (
              <>
                <section className="form-section">
                  <h3 className="form-section__title">Contrato</h3>
                  <div className="form-grid">
                    {lista('tipo_contrato', 'Tipo de contrato', OPCIONES.tipoContrato, { wide: true, onChange: cambiarTipoContrato })}
                    {fecha('fecha_inicio_contrato', 'Inicio', { onChange: v => recalcularFin(v, duracion, p.tipo_contrato) })}
                    {!SIN_FIN.has(p.tipo_contrato) && (
                      <Field label="Duración">
                        {props => (
                          <SelectInput {...props} value={duracion} onChange={e => { setDuracion(e.target.value); recalcularFin(p.fecha_inicio_contrato, e.target.value, p.tipo_contrato); }}>
                            {DURACIONES.map(d => <option key={d.label} value={d.value}>{d.label}</option>)}
                          </SelectInput>
                        )}
                      </Field>
                    )}
                    {SIN_FIN.has(p.tipo_contrato)
                      ? <div className="field"><span className="field__label">Fin</span><span className="persona-form__nota">{p.tipo_contrato === 'INDETERMINADO' ? 'Indeterminado' : 'Sin vencimiento'}</span></div>
                      : fecha('fecha_fin_contrato', 'Fin', { onChange: () => setDuracion(''), hint: duracion ? 'Calculado con la duración' : undefined })}
                  </div>
                </section>
                <section className="form-section">
                  <h3 className="form-section__title">Remuneración</h3>
                  <div className="form-grid">
                    <Field label="Sueldo básico (S/)" error={error('sueldo_basico')}>
                      {props => <TextInput {...props} value={p.sueldo_basico} inputMode="decimal" className="input--mono" placeholder="0.00" onBlur={tocar('sueldo_basico')} onChange={e => set('sueldo_basico', decimalInput(e.target.value))} />}
                    </Field>
                    <Field label="Bono fijo o movilidad (S/)">
                      {props => <TextInput {...props} value={p.bono_fijo} inputMode="decimal" className="input--mono" placeholder="0.00" onChange={e => set('bono_fijo', decimalInput(e.target.value))} />}
                    </Field>
                  </div>
                  <div className="list persona-form__switches">
                    <SwitchRow title="Asignación familiar" subtitle={`Suma S/ ${ASIGNACION_FAMILIAR.toFixed(2)} (10 % de la remuneración mínima)`}
                      checked={p.tiene_asignacion_familiar} onChange={v => set('tiene_asignacion_familiar', v)} />
                  </div>
                </section>
                <section className="form-section">
                  <h3 className="form-section__title">Pensión y bancos</h3>
                  <div className="form-grid">
                    {lista('regimen_pensionario', 'Régimen pensionario', OPCIONES.regimen)}
                    {p.regimen_pensionario.startsWith('AFP') && lista('tipo_comision_afp', 'Comisión AFP', OPCIONES.comisionAfp)}
                    {p.regimen_pensionario.startsWith('AFP') && texto('cuspp', 'CUSPP', { mono: true, mayus: true, max: 30 })}
                    {lista('banco_haberes', 'Banco del sueldo', OPCIONES.banco, { vacio: 'Sin banco' })}
                    {texto('cuenta_haberes', 'N° de cuenta', { mono: true, inputMode: 'numeric', max: 50 })}
                    {texto('cci_haberes', 'CCI', { mono: true, inputMode: 'numeric', max: 50, wide: true })}
                    {lista('banco_cts', 'Banco de la CTS', OPCIONES.bancoCts, { vacio: 'Sin banco' })}
                    {texto('cuenta_cts', 'N° de cuenta CTS', { mono: true, inputMode: 'numeric', max: 50 })}
                  </div>
                </section>
              </>
            )}

            {pestana === 'salud' && (
              <>
                <section className="form-section">
                  <h3 className="form-section__title">Salud y seguridad</h3>
                  <div className="form-grid">
                    {lista('grupo_sanguineo', 'Grupo sanguíneo', OPCIONES.grupoSanguineo, { vacio: 'Sin dato' })}
                    {lista('emo_condicion', 'Examen médico (EMO)', OPCIONES.emo)}
                    {fecha('emo_fecha_vencimiento', 'Vence el examen médico')}
                  </div>
                  <div className="list persona-form__switches">
                    <SwitchRow title="SCTR salud" subtitle={p.sctr_salud_vigente ? 'Cubierto' : 'Sin cobertura'} checked={p.sctr_salud_vigente} onChange={v => set('sctr_salud_vigente', v)} />
                    <SwitchRow title="SCTR pensión" subtitle={p.sctr_pension_vigente ? 'Cubierto' : 'Sin cobertura'} checked={p.sctr_pension_vigente} onChange={v => set('sctr_pension_vigente', v)} />
                  </div>
                </section>
                <section className="form-section">
                  <h3 className="form-section__title">Brevete</h3>
                  <div className="form-grid">
                    {texto('licencia_conducir', 'N° de brevete', { mono: true, mayus: true, max: 30, placeholder: 'Q12345678' })}
                    {lista('licencia_categoria', 'Categoría', OPCIONES.categoriaLicencia, { vacio: 'Sin brevete' })}
                    {fecha('licencia_vencimiento', 'Vence el brevete')}
                  </div>
                </section>
                <section className="form-section">
                  <h3 className="form-section__title">Tallas de EPP</h3>
                  <div className="form-grid">
                    {lista('talla_polo', 'Polo o camisa', OPCIONES.tallaPolo, { vacio: '—' })}
                    {lista('talla_pantalon', 'Pantalón', OPCIONES.tallaPantalon, { vacio: '—' })}
                    {lista('talla_calzado', 'Calzado de seguridad', OPCIONES.tallaCalzado, { vacio: '—' })}
                    {lista('talla_chaleco', 'Chaleco o casco', OPCIONES.tallaChaleco, { vacio: '—' })}
                  </div>
                </section>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
