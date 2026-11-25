import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CircleAlert, Clock3 } from 'lucide-react';
import { Button } from '../../../core/ui/Button';
import { Notice } from '../../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../../core/ui/Field';
import { Sheet } from '../../../core/ui/Sheet';
import { useToast } from '../../../core/ui/Toast';
import { api, errorMessage } from '../../../core/api/client';
import { hoyLima } from '../../../core/lib/format';
import { haptic } from '../../../core/lib/haptics';
import { dmy, nombreCorto, type Persona } from './datos';

export const TIPOS_LICENCIA = [
  { value: 'VACACIONES', label: 'Vacaciones' }, { value: 'DESCANSO_MEDICO', label: 'Descanso médico (EsSalud / clínica)' },
  { value: 'PERMISO_CON_GOCE', label: 'Permiso con goce de haber' }, { value: 'PERMISO_SIN_GOCE', label: 'Permiso sin goce de haber' },
  { value: 'LICENCIA_PATERNIDAD', label: 'Licencia por paternidad' },
];

const refrescar = (qc: ReturnType<typeof useQueryClient>) => Promise.all([
  qc.invalidateQueries({ queryKey: ['rrhh', 'tareo'] }),
  qc.invalidateQueries({ queryKey: ['rrhh', 'licencias'] }),
  qc.invalidateQueries({ queryKey: ['rrhh', 'marcaciones'] }),
]);

/** Licencia, vacaciones o descanso médico: se aplica sola a los días del tareo. Puede abrirse ya con una persona y un día */
export function LicenciaSheet({ open, personal, inicial, onClose }: { open: boolean; personal: Persona[]; inicial?: { personaId: number; fecha: string } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [pid, setPid] = useState('');
  const [tipo, setTipo] = useState('VACACIONES');
  const [ini, setIni] = useState('');
  const [fin, setFin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errCampo, setErrCampo] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!open) return;
    const h = inicial?.fecha ?? hoyLima();
    setPid(inicial ? String(inicial.personaId) : ''); setTipo('VACACIONES'); setIni(h); setFin(h); setMotivo(''); setError(null); setErrCampo({});
  }, [open, inicial]);

  async function guardar() {
    setErrCampo({});
    if (!pid) { setErrCampo({ pid: 'Elige al colaborador.' }); haptic('warning'); return; }
    if (fin < ini) { setErrCampo({ fin: 'La fecha fin es anterior al inicio.' }); haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string }>('/rrhh/licencias', { method: 'POST', body: { personal_id: pid, tipo, fecha_inicio: ini, fecha_fin: fin, motivo } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo registrar');
      haptic('success'); toast('Justificación registrada y aplicada al tareo');
      await refrescar(qc);
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Justificar: licencia o vacaciones"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<CalendarCheck size={16} />} onClick={guardar} loading={enviando}>Guardar y aplicar al tareo</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Colaborador" wide error={errCampo.pid}>
          {p => (
            <SelectInput {...p} value={pid} onChange={e => setPid(e.target.value)}>
              <option value="">Elige…</option>
              {personal.map(x => <option key={x.id} value={x.id}>{x.apellidos}, {x.nombres} ({x.categoria_rol})</option>)}
            </SelectInput>
          )}
        </Field>
        <Field label="Tipo" wide>
          {p => <SelectInput {...p} value={tipo} onChange={e => setTipo(e.target.value)}>{TIPOS_LICENCIA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</SelectInput>}
        </Field>
        <Field label="Desde">{p => <TextInput {...p} type="date" value={ini} onChange={e => setIni(e.target.value)} />}</Field>
        <Field label="Hasta" error={errCampo.fin}>{p => <TextInput {...p} type="date" value={fin} min={ini} onChange={e => { setFin(e.target.value); setErrCampo({}); }} />}</Field>
        <Field label="Motivo" wide>{p => <TextInput {...p} value={motivo} onChange={e => setMotivo(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}

/** Registro manual de la hora de ingreso y/o de salida (cuando alguien olvidó marcar). Queda con origen "Manual" y su motivo */
export function RegistrarHoraSheet({ open, persona, fecha, tieneIngreso, onClose }: { open: boolean; persona: Persona | null; fecha: string; tieneIngreso: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [hIn, setHIn] = useState('');
  const [hOut, setHOut] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setHIn(''); setHOut(''); setMotivo(''); setError(null); } }, [open, persona?.id, fecha]);

  async function guardar() {
    if (!persona) return;
    setError(null);
    if (!hIn && !hOut) { setError('Indica la hora de ingreso o la de salida.'); haptic('warning'); return; }
    if (motivo.trim().length < 3) { setError('Escribe el motivo (por ejemplo: olvidó marcar).'); haptic('warning'); return; }
    setEnviando(true);
    try {
      await api('/rrhh/marcacion/manual', { method: 'POST', body: { personal_id: persona.id, fecha, hora_entrada: hIn, hora_salida: hOut, motivo: motivo.trim() } });
      haptic('success'); toast('Hora registrada');
      await refrescar(qc);
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Registrar hora"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<Clock3 size={16} />} onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <div className="field field--wide">
          <strong>{persona ? nombreCorto(persona) : ''}</strong>
          <span className="field__hint">{persona?.cargo ?? ''} · {dmy(fecha)}</span>
        </div>
        <Field label="Hora de ingreso" hint={tieneIngreso ? 'Ya tiene ingreso este día: déjalo vacío si solo falta la salida.' : undefined}>
          {p => <TextInput {...p} type="time" value={hIn} onChange={e => setHIn(e.target.value)} disabled={tieneIngreso} />}
        </Field>
        <Field label="Hora de salida" hint="Si es de madrugada, se cuenta en el día siguiente.">{p => <TextInput {...p} type="time" value={hOut} onChange={e => setHOut(e.target.value)} />}</Field>
        <Field label="Motivo" wide>{p => <TextInput {...p} value={motivo} placeholder="Ej.: olvidó marcar, falló el lector" onChange={e => setMotivo(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}
