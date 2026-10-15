import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { SwitchRow } from '../../core/ui/forms';
import { LicensePlate } from '../../core/ui/LicensePlate';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { formatPlateInput, normalizePlate } from '../../core/lib/peru';
import { spring } from '../../core/lib/motion';
import { haptic } from '../../core/lib/haptics';
import { actualizarPlaca, crearPlaca, sumaTanques, useMetricas, useNombresWialon, type Placa } from './api';
import { COMBUSTIBLES, UTS_OPCIONES } from './valoresPlaca';
import { normalizarTipo, TIPOS_UNIDAD } from './tiposUnidad';

const VACIA: Placa = {
  placa: '', cliente: '', ruc: '', marca: '', modelo: '', tipo: '', subTipo: '', color: '', nroMotor: '', nroCaja: '',
  nroCorona: '', vin: '', configuracion: '', anio: '', combustible: 'Diésel', cargaUtil: '', pesoNeto: '', pesoBruto: '',
  estado: 'Activa', uts: '', motora: true, llantas: '', enUso: true, wialon: '', tanque1: '', tanque2: '', tanque3: '',
  capacidadTanque: '', tara: '', modeloMotor: '',
};

type Campo = keyof Placa;
const NUMERICOS: Campo[] = ['tanque1', 'tanque2', 'tanque3', 'cargaUtil', 'pesoNeto', 'pesoBruto', 'tara'];
const sinGuion = (s: string) => s.replace(/[-\s]/g, '').toUpperCase();

function validar(p: Placa, modo: 'crear' | 'editar', existentes: Placa[]): Partial<Record<Campo, string>> {
  const e: Partial<Record<Campo, string>> = {};
  if (modo === 'crear') {
    if (!p.placa) e.placa = 'Escribe la placa.';
    else if (!normalizePlate(p.placa)) e.placa = 'Escribe la placa completa. Ejemplo: ABC-123';
    else if (existentes.some(x => sinGuion(x.placa) === sinGuion(p.placa))) e.placa = 'Ya existe una unidad con esta placa.';
  }
  if (!p.tipo) e.tipo = 'Elige el tipo de unidad.';
  if (p.ruc && !/^(\d{8}|\d{11})$/.test(p.ruc)) e.ruc = 'El RUC tiene 11 dígitos y el DNI 8.';
  if (p.anio) {
    const n = Number(p.anio), max = new Date().getFullYear() + 1;
    if (!/^\d{4}$/.test(p.anio) || n < 1950 || n > max) e.anio = `Escribe un año entre 1950 y ${max}.`;
  }
  for (const c of NUMERICOS) {
    const v = String(p[c] ?? '');
    if (v && !/^\d+([.,]\d+)?$/.test(v)) e[c] = 'Escribe solo números.';
  }
  return e;
}

// Crear o editar una placa. Mismos endpoints y reglas que la versión actual (ver api.ts).
export function PlacaFormulario({ modo, placa, existentes, open, onClose, onGuardada }: {
  modo: 'crear' | 'editar';
  placa: Placa | null;
  existentes: Placa[];
  open: boolean;
  onClose: () => void;
  onGuardada: (p: Placa) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const metricas = useMetricas();
  const [p, setP] = useState<Placa>(placa ?? VACIA);
  const [tocados, setTocados] = useState<Set<Campo>>(new Set());
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Cada vez que se abre, parte de la placa (o vacía)
  useEffect(() => {
    if (open) { setP(placa ?? VACIA); setTocados(new Set()); setIntento(false); }
  }, [open, placa]);

  const errores = useMemo(() => validar(p, modo, existentes), [p, modo, existentes]);
  const error = (c: Campo) => ((intento || tocados.has(c)) ? errores[c] : undefined) ?? null;
  const tocar = (c: Campo) => () => setTocados(s => new Set(s).add(c));
  const set = <K extends Campo>(c: K, v: Placa[K]) => setP(x => ({ ...x, [c]: v }));
  const texto = (c: Campo, transformar?: (v: string) => string) => ({
    value: String(p[c] ?? ''),
    onChange: (ev: ChangeEvent<HTMLInputElement>) => set(c, (transformar ? transformar(ev.target.value) : ev.target.value) as never),
    onBlur: tocar(c),
  });

  // Opciones a partir de lo que ya existe (escribir algo nuevo también se permite)
  const unicos = (f: (x: Placa) => string) => [...new Set(existentes.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const clientes = useMemo(() => unicos(x => x.cliente).map(c => ({
    value: c, label: c, description: existentes.find(x => x.cliente === c && x.ruc)?.ruc,
  })), [existentes]); // eslint-disable-line react-hooks/exhaustive-deps
  const marcas = useMemo(() => unicos(x => x.marca).map(m => ({ value: m, label: m })), [existentes]); // eslint-disable-line react-hooks/exhaustive-deps
  // Solo la lista oficial, sin repetidos: lo que ya está en la base se muestra con el mismo nombre
  const tipos = useMemo(() => TIPOS_UNIDAD.map(t => ({ value: t, label: t })), []);
  const sugerencias = useMemo(() => ({
    subTipo: unicos(x => x.subTipo), color: unicos(x => x.color), configuracion: unicos(x => x.configuracion),
    modeloMotor: unicos(x => x.modeloMotor), combustible: unicos(x => x.combustible),
  }), [existentes]); // eslint-disable-line react-hooks/exhaustive-deps
  // Modelos de la marca elegida (todos si aún no hay marca): lo que se agregue queda para los próximos registros
  const modelos = useMemo(() => {
    const m = (p.marca || '').trim().toUpperCase();
    const lista = existentes.filter(x => !m || (x.marca || '').trim().toUpperCase() === m).map(x => (x.modelo || '').trim()).filter(Boolean);
    return [...new Set(lista)].sort((a, b) => a.localeCompare(b, 'es'));
  }, [existentes, p.marca]);
  const { data: nombresWialon = [] } = useNombresWialon();

  const total = sumaTanques(p.tanque1, p.tanque2, p.tanque3);
  const cambiado = !placa || JSON.stringify(placa) !== JSON.stringify(p);

  async function guardar() {
    setIntento(true);
    if (Object.keys(errores).length) { haptic('warning'); return; }
    setGuardando(true);
    const final: Placa = { ...p, tipo: normalizarTipo(p.tipo), capacidadTanque: total || p.capacidadTanque,...(modo === 'crear' ? { placa: normalizePlate(p.placa) ?? p.placa } : {}) };
    try {
      if (modo === 'editar') {
        const metrica = metricas.data?.get(final.placa) ?? 'km';
        const r = await actualizarPlaca(final, metrica);
        toast(r.cambios ? `Placa ${final.placa} actualizada (${r.cambios} ${r.cambios === 1 ? 'cambio' : 'cambios'})` : 'No había cambios que guardar');
      } else {
        await crearPlaca(final);
        toast(`Placa ${final.placa} registrada`);
      }
      haptic('success');
      await qc.invalidateQueries({ queryKey: ['placas'] });
      onGuardada(final);
    } catch (err) {
      haptic('warning');
      toast(errorMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  }

  // Lista desplegable con búsqueda. Lo que se escribe y no existe se agrega (creable); las listas fijas no.
  // Vacío se permite: al quitar el valor (X) el campo queda en blanco.
  const campoLista = (c: Campo, label: string, lista: string[], opts: { creable?: boolean; placeholder?: string } = {}) => {
    const valores = [...new Set([...lista, ...(p[c] ? [String(p[c])] : [])])];
    const creable = opts.creable !== false;
    return (
      <Field label={label} error={error(c)}>
        {props => (
          <Combobox {...props} options={valores.map(v => ({ value: v, label: v }))} value={String(p[c] ?? '') || null}
            onChange={v => { set(c, (v ?? '') as never); tocar(c)(); }}
            placeholder={opts.placeholder ?? 'Elige o escribe…'}
            onCreate={creable ? (t => set(c, t.trim() as never)) : undefined} createLabel="Usar" />
        )}
      </Field>
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={modo === 'crear' ? 'Nueva placa' : `Editar ${placa?.placa ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando} disabled={!cambiado}>
            {modo === 'crear' ? 'Registrar placa' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="placa-form">
        {/* La placa se dibuja mientras se escribe */}
        <motion.div className="placa-form__preview" layout transition={spring}>
          <LicensePlate plate={modo === 'crear' ? (normalizePlate(p.placa) ?? p.placa) : p.placa} size="xl" />
          <AnimatePresence initial={false}>
            {(p.marca || p.modelo) && (
              <motion.span className="placa-form__preview-texto" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                {[p.marca, p.modelo].filter(Boolean).join(' ')}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>

        <section className="form-section">
          <h3 className="form-section__title">Identificación</h3>
          <div className="form-grid">
            <Field label="Placa" error={error('placa')} hint={modo === 'editar' ? 'La placa no se puede cambiar.' : undefined} wide>
              {props => (
                <TextInput {...props} {...texto('placa', formatPlateInput)}
                  disabled={modo === 'editar'} placeholder="ABC-123" className="plate-input" autoComplete="off"
                  autoCapitalize="characters" spellCheck={false} autoFocus={modo === 'crear'} />
              )}
            </Field>
            <Field label="Cliente" wide>
              {props => (
                <Combobox {...props} options={clientes} value={p.cliente || null} placeholder="Busca o escribe el cliente"
                  onChange={v => {
                    const ruc = clientes.find(c => c.value === v)?.description;
                    setP(x => ({ ...x, cliente: v ?? '', ruc: ruc && !x.ruc ? ruc : x.ruc }));
                  }}
                  onCreate={t => set('cliente', t.trim().toUpperCase())} createLabel="Usar" />
              )}
            </Field>
            <Field label="RUC o DNI" error={error('ruc')}>
              {props => <TextInput {...props} {...texto('ruc', v => v.replace(/\D/g, '').slice(0, 11))} inputMode="numeric" />}
            </Field>
            <Field label="Año" error={error('anio')}>
              {props => <TextInput {...props} {...texto('anio', v => v.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="2024" />}
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h3 className="form-section__title">Vehículo</h3>
          <div className="form-grid">
            <Field label="Tipo" error={error('tipo')}>
              {props => <Combobox {...props} options={tipos} value={p.tipo || null} onChange={v => { set('tipo', v ?? ''); tocar('tipo')(); }}
                placeholder="Tracto, Carreta…" onCreate={t => set('tipo', t.trim())} createLabel="Usar" />}
            </Field>
            {campoLista('subTipo', 'Sub tipo', sugerencias.subTipo)}
            <Field label="Marca">
              {props => <Combobox {...props} options={marcas} value={p.marca || null} onChange={v => set('marca', v ?? '')}
                placeholder="Busca la marca" onCreate={t => set('marca', t.trim().toUpperCase())} createLabel="Usar" />}
            </Field>
            {campoLista('modelo', 'Modelo', modelos, { placeholder: p.marca ? `Modelos de ${p.marca}` : 'Elige o escribe el modelo' })}
            {campoLista('color', 'Color', sugerencias.color)}
            {campoLista('configuracion', 'Configuración', sugerencias.configuracion)}
          </div>
        </section>

        <section className="form-section">
          <h3 className="form-section__title">Técnico</h3>
          <div className="form-grid">
            {campoLista('modeloMotor', 'Modelo de motor', sugerencias.modeloMotor)}
            <Field label="N.º de motor">{props => <TextInput {...props} {...texto('nroMotor')} className="input--mono" />}</Field>
            <Field label="N.º de caja">{props => <TextInput {...props} {...texto('nroCaja')} className="input--mono" />}</Field>
            <Field label="N.º de corona">{props => <TextInput {...props} {...texto('nroCorona')} className="input--mono" />}</Field>
            <Field label="VIN" wide>{props => <TextInput {...props} {...texto('vin', v => v.toUpperCase())} className="input--mono" />}</Field>
            <Field label="Llantas">{props => <TextInput {...props} {...texto('llantas')} inputMode="numeric" />}</Field>
          </div>
        </section>

        <section className="form-section">
          <h3 className="form-section__title">Capacidad</h3>
          <div className="form-grid">
            {campoLista('combustible', 'Combustible', [...COMBUSTIBLES, ...sugerencias.combustible], { creable: false })}
            <div className="placa-form__total" aria-live="polite">
              <span className="placa-form__total-label">Capacidad total</span>
              <motion.span key={total || p.capacidadTanque} className="placa-form__total-valor t-numeric" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
                {total || p.capacidadTanque || '—'}
              </motion.span>
            </div>
            {(['tanque1', 'tanque2', 'tanque3'] as const).map((c, i) => (
              <Field key={c} label={`Tanque ${i + 1}`} error={error(c)}>
                {props => <TextInput {...props} {...texto(c, v => v.replace(/[^\d.,]/g, ''))} inputMode="decimal" />}
              </Field>
            ))}
            <Field label="Carga útil" error={error('cargaUtil')}>{props => <TextInput {...props} {...texto('cargaUtil', v => v.replace(/[^\d.,]/g, ''))} inputMode="decimal" />}</Field>
            <Field label="Peso neto" error={error('pesoNeto')}>{props => <TextInput {...props} {...texto('pesoNeto', v => v.replace(/[^\d.,]/g, ''))} inputMode="decimal" />}</Field>
            <Field label="Peso bruto" error={error('pesoBruto')}>{props => <TextInput {...props} {...texto('pesoBruto', v => v.replace(/[^\d.,]/g, ''))} inputMode="decimal" />}</Field>
            <Field label="Tara" error={error('tara')}>{props => <TextInput {...props} {...texto('tara', v => v.replace(/[^\d.,]/g, ''))} inputMode="decimal" />}</Field>
          </div>
        </section>

        <section className="form-section">
          <h3 className="form-section__title">Operación</h3>
          <div className="form-grid">
            <div className="field field--wide">
              <span className="field__label">Estado</span>
              <SegmentedControl block label="Estado" value={p.estado === 'Activa' ? 'Activa' : 'Inactiva'} onChange={v => set('estado', v)}
                options={[{ value: 'Activa', label: 'Activa' }, { value: 'Inactiva', label: 'Inactiva' }]} />
            </div>
            <div className="field field--wide">
              <span className="field__label">Clase</span>
              <SegmentedControl block label="Clase" value={p.motora ? 'motora' : 'no'} onChange={v => set('motora', v === 'motora')}
                options={[{ value: 'motora', label: 'Motora' }, { value: 'no', label: 'No motora' }]} />
            </div>
            {campoLista('uts', 'UTS', [...UTS_OPCIONES], { creable: false, placeholder: 'Local, nacional o vacío' })}
            {campoLista('wialon', 'Nombre en Wialon (GPS)', nombresWialon, { creable: false, placeholder: 'Búsqueda automática' })}
          </div>
          <div className="list">
            <SwitchRow title="En uso" subtitle="La unidad está operando en la flota" checked={p.enUso} onChange={v => set('enUso', v)} />
          </div>
        </section>
      </div>
    </Sheet>
  );
}
