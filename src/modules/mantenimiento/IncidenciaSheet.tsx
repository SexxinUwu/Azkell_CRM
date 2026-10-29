import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { Combobox, type ComboboxOption } from '../../core/ui/Combobox';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { formatSoles } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import {
  guardarIncidencia,
  type CatalogoIncidencias,
  type DatosIncidencia,
  type IncidenciaRuta,
} from './api';

// Alta y edición de una incidencia en ruta. Mismos campos que el clásico (incidencias-ruta/vista.html):
// la placa completa la marca y, si está vacía, la clase de la unidad; los gastos se suman al total.
// Observaciones se conserva porque la versión de React ya la guardaba.

interface FilaCosto { id: number; concepto: string; monto: string }

interface Formulario {
  fecha_falla: string;
  placa: string;
  marca: string;
  tipo_unidad: string;
  conductor: string;
  ubicacion: string;
  transbordo: 'SI' | 'NO';
  area_responsable: string;
  responsable: string;
  motivo: string;
  falla: string;
  solucionado: 'Pendiente' | 'Atendido';
  observaciones: string;
}

const AREAS = ['Mantenimiento', 'Flota', 'Operaciones'];

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const VACIO: Formulario = {
  fecha_falla: '', placa: '', marca: '', tipo_unidad: '', conductor: '', ubicacion: '',
  transbordo: 'NO', area_responsable: 'Mantenimiento', responsable: '', motivo: '', falla: '',
  solucionado: 'Pendiente', observaciones: '',
};

interface Props {
  abierto: boolean;
  /** null = alta; una incidencia = edición */
  incidencia: IncidenciaRuta | null;
  catalogo: CatalogoIncidencias | undefined;
  onClose: () => void;
}

export function IncidenciaSheet({ abierto, incidencia, catalogo, onClose }: Props) {
  const qc = useQueryClient();
  const avisar = useToast();
  const seq = useRef(0);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [costos, setCostos] = useState<FilaCosto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Cada apertura empieza con los datos de la incidencia (o un formulario vacío)
  useEffect(() => {
    if (!abierto) return;
    setError(null);
    if (incidencia) {
      setForm({
        fecha_falla: incidencia.fecha_falla ?? '',
        placa: incidencia.placa,
        marca: incidencia.marca ?? '',
        tipo_unidad: incidencia.tipo_unidad ?? '',
        conductor: incidencia.conductor ?? '',
        ubicacion: incidencia.ubicacion ?? '',
        transbordo: incidencia.transbordo === 'SI' ? 'SI' : 'NO',
        area_responsable: incidencia.area_responsable || 'Mantenimiento',
        responsable: incidencia.responsable ?? '',
        motivo: incidencia.motivo ?? '',
        falla: incidencia.falla ?? '',
        solucionado: incidencia.solucionado === 'Atendido' ? 'Atendido' : 'Pendiente',
        observaciones: incidencia.observaciones ?? '',
      });
      const filas = (incidencia.costos_detalle ?? []).map(c => ({ id: ++seq.current, concepto: c.concepto ?? '', monto: String(c.monto ?? '') }));
      setCostos(filas.length ? filas : [{ id: ++seq.current, concepto: '', monto: '' }]);
    } else {
      setForm({ ...VACIO, fecha_falla: hoyIso() });
      setCostos([{ id: ++seq.current, concepto: '', monto: '' }]);
    }
  }, [abierto, incidencia]);

  const set = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) => setForm(f => ({ ...f, [campo]: valor }));

  const opcionesPlaca = (catalogo?.data ?? []).map(p => ({ placa: p.placa, detalle: p.marca || null }));

  // Los conductores de la lista más el que se escribió a mano (si no está en el catálogo, Combobox no lo muestra)
  const opcionesConductor: ComboboxOption[] = (catalogo?.conductores ?? []).map(c => ({ value: c, label: c }));
  if (form.conductor && !opcionesConductor.some(o => o.value === form.conductor)) {
    opcionesConductor.unshift({ value: form.conductor, label: form.conductor });
  }

  function elegirPlaca(placa: string) {
    const info = (catalogo?.data ?? []).find(p => p.placa === placa);
    setForm(f => ({ ...f, placa, marca: info?.marca ?? '', tipo_unidad: f.tipo_unidad || info?.tipo || '' }));
  }

  function cambiarCosto(id: number, campo: 'concepto' | 'monto', valor: string) {
    setCostos(filas => filas.map(f => (f.id === id ? { ...f, [campo]: valor } : f)));
  }

  const total = costos.reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);

  function validar(): string | null {
    if (!form.fecha_falla) return 'Indica la fecha de la falla.';
    if (!form.placa) return 'Elige la placa de la unidad.';
    if (!form.ubicacion.trim()) return 'Escribe la ubicación o el lugar del evento.';
    if (!form.motivo.trim()) return 'Escribe el motivo principal.';
    return null;
  }

  function construirDatos(): DatosIncidencia {
    const costos_detalle = costos
      .map(c => ({ concepto: c.concepto.trim(), monto: parseFloat(c.monto) || 0 }))
      .filter(c => c.concepto || c.monto > 0)
      .map(c => ({ concepto: c.concepto || 'Gasto', monto: c.monto }));
    return {
      fecha_falla: form.fecha_falla,
      placa: form.placa,
      conductor: form.conductor.trim(),
      marca: form.marca,
      ubicacion: form.ubicacion.trim(),
      tipo_unidad: form.tipo_unidad.trim(),
      transbordo: form.transbordo,
      motivo: form.motivo.trim(),
      falla: form.falla.trim(),
      area_responsable: form.area_responsable,
      responsable: form.responsable.trim(),
      costos_detalle,
      solucionado: form.solucionado,
      observaciones: form.observaciones.trim(),
    };
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const aviso = validar();
    if (aviso) {
      setError(aviso);
      haptic('warning');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await guardarIncidencia(incidencia?.id ?? null, construirDatos());
      haptic('success');
      avisar(incidencia ? 'Incidencia actualizada' : 'Incidencia registrada');
      qc.invalidateQueries({ queryKey: ['mant', 'incidencias'] });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      haptic('warning');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet
      open={abierto}
      onClose={onClose}
      title={incidencia ? `Editar incidencia ${incidencia.codigo ?? ''}`.trim() : 'Registrar incidencia en ruta'}
      ancho
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="form-incidencia" loading={guardando}>
            {incidencia ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </>
      }
    >
      <form id="form-incidencia" onSubmit={guardar} className="inc-form">
        {error && <Notice tone="error">{error}</Notice>}

        <section className="inc-form__seccion">
          <h3 className="inc-form__titulo">Unidad y conductor</h3>
          <div className="inc-form__grid">
            <Field label="Fecha de la falla *">
              {p => <TextInput {...p} type="date" value={form.fecha_falla} onChange={e => set('fecha_falla', e.target.value)} />}
            </Field>
            <Field label="Placa principal *">
              {p => <PlacaPicker {...p} value={form.placa} onChange={elegirPlaca} opciones={opcionesPlaca} placeholder="Elige una placa…" />}
            </Field>
            <Field label="Marca del vehículo" hint="Se completa al elegir la placa">
              {p => <TextInput {...p} value={form.marca} readOnly />}
            </Field>
            <Field label="Unidad / clase">
              {p => <TextInput {...p} value={form.tipo_unidad} onChange={e => set('tipo_unidad', e.target.value)} placeholder="Ej. Tracto, carreta" />}
            </Field>
            <Field label="Conductor asignado" wide>
              {p => (
                <Combobox
                  {...p}
                  options={opcionesConductor}
                  value={form.conductor || null}
                  onChange={v => set('conductor', v ?? '')}
                  onCreate={texto => set('conductor', texto.trim())}
                  createLabel="Usar el nombre escrito"
                  placeholder="Elige un conductor o escribe el nombre…"
                />
              )}
            </Field>
          </div>
        </section>

        <section className="inc-form__seccion">
          <h3 className="inc-form__titulo">Evento en ruta</h3>
          <div className="inc-form__grid">
            <Field label="Ubicación o lugar del evento *" wide>
              {p => <TextInput {...p} value={form.ubicacion} onChange={e => set('ubicacion', e.target.value)} placeholder="Ej. Matucana, Arequipa, km 145" />}
            </Field>
            <Field label="¿Hubo transbordo?">
              {() => <SegmentedControl block label="¿Hubo transbordo?" value={form.transbordo} onChange={v => set('transbordo', v)} options={[{ value: 'NO', label: 'No' }, { value: 'SI', label: 'Sí' }]} />}
            </Field>
            <Field label="Responsabilidad de área">
              {p => <SelectInput {...p} value={form.area_responsable} onChange={e => set('area_responsable', e.target.value)}>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </SelectInput>}
            </Field>
            <Field label="Responsable / causa principal">
              {p => <TextInput {...p} value={form.responsable} onChange={e => set('responsable', e.target.value)} placeholder="Ej. Falla mecánica, conductor, clima" />}
            </Field>
            <Field label="Motivo principal *">
              {p => <TextInput {...p} value={form.motivo} onChange={e => set('motivo', e.target.value)} placeholder="Ej. Unidad no arranca, fuga de combustible" />}
            </Field>
            <Field label="Falla detallada / trabajo requerido" wide>
              {p => <textarea {...p} className="input inc-form__area" rows={3} value={form.falla} onChange={e => set('falla', e.target.value)} placeholder="Diagnóstico o componentes afectados" />}
            </Field>
          </div>
        </section>

        <section className="inc-form__seccion">
          <div className="inc-form__cabecera">
            <div>
              <h3 className="inc-form__titulo">Gastos y auxilio</h3>
              <p className="inc-form__ayuda">Cada concepto (repuesto, peaje, mano de obra) suma al costo total.</p>
            </div>
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setCostos(f => [...f, { id: ++seq.current, concepto: '', monto: '' }])}>
              Agregar gasto
            </Button>
          </div>
          <div className="inc-costos">
            {costos.map(c => (
              <div key={c.id} className="inc-costos__fila">
                <TextInput aria-label="Concepto del gasto" value={c.concepto} onChange={e => cambiarCosto(c.id, 'concepto', e.target.value)} placeholder="Ej. Piñón, mano de obra, auxilio" />
                <TextInput aria-label="Monto en soles" type="number" inputMode="decimal" min={0} step="0.01" value={c.monto} onChange={e => cambiarCosto(c.id, 'monto', e.target.value)} placeholder="0.00" />
                <button type="button" className="inc-costos__quitar" aria-label="Quitar gasto" onClick={() => setCostos(f => f.filter(x => x.id !== c.id))}>
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="inc-costos__total">
            <span>Costo total</span>
            <strong className="t-numeric">{formatSoles(total)}</strong>
          </div>
        </section>

        <section className="inc-form__seccion">
          <h3 className="inc-form__titulo">Solución</h3>
          <div className="inc-form__grid">
            <Field label="Estado de la solución">
              {() => <SegmentedControl block label="Estado de la solución" value={form.solucionado} onChange={v => set('solucionado', v)} options={[{ value: 'Pendiente', label: 'Pendiente' }, { value: 'Atendido', label: 'Atendido' }]} />}
            </Field>
            <Field label="Observaciones" wide>
              {p => <textarea {...p} className="input inc-form__area" rows={2} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />}
            </Field>
          </div>
        </section>
      </form>
    </Sheet>
  );
}
