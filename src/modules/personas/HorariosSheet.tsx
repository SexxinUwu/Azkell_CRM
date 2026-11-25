import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, Trash2 } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

// Horarios por cargo o por persona. Sirven para calcular la tardanza (ingreso fuera de la tolerancia) y las horas extra (más allá de la duración del turno).
// Un horario de persona reemplaza al de su cargo. Sin horario, la marcación igual se registra, pero sin tardanza ni horas extra.

interface PersonaH { id: number; nombres: string; apellidos: string; cargo: string | null }
interface Horario {
  id: number; ambito: 'CARGO' | 'PERSONA'; cargo: string | null; personal_id: number | null;
  hora_ingreso: string; hora_salida: string; duracion_horas: number | string; tolerancia_min: number; nombres?: string | null; apellidos?: string | null;
}

const aMin = (h: string) => { const m = h.match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** Duración entre dos horas del reloj; si coinciden (08:00 a 08:00) es un turno de 24 h; si la salida es menor, cruza la medianoche */
function duracionEntre(ini: string, fin: string) {
  const a = aMin(ini), b = aMin(fin);
  if (a === null || b === null) return null;
  let d = b - a; if (d <= 0) d += 1440;
  return Math.round((d / 60) * 10) / 10;
}

export function HorariosSheet({ open, personal, onClose }: { open: boolean; personal: PersonaH[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [ambito, setAmbito] = useState<'CARGO' | 'PERSONA'>('CARGO');
  const [cargo, setCargo] = useState('');
  const [persona, setPersona] = useState('');
  const [ini, setIni] = useState('08:00');
  const [fin, setFin] = useState('17:00');
  const [dur, setDur] = useState('9');
  const [tol, setTol] = useState('10');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery<{ horarios: Horario[] }>({
    queryKey: ['rrhh', 'horarios'],
    queryFn: () => api<{ horarios: Horario[] }>('/rrhh/horarios'),
    enabled: open,
  });

  const cargos = useMemo(() => [...new Set(personal.map(p => (p.cargo ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [personal]);

  useEffect(() => { if (open) { setError(null); } }, [open]);

  function cambiarHoras(nIni: string, nFin: string) {
    setIni(nIni); setFin(nFin);
    const d = duracionEntre(nIni, nFin);
    if (d !== null) setDur(String(d));
  }

  async function guardar() {
    setError(null);
    if (ambito === 'CARGO' && !cargo) { setError('Elige el cargo.'); haptic('warning'); return; }
    if (ambito === 'PERSONA' && !persona) { setError('Elige a la persona.'); haptic('warning'); return; }
    setEnviando(true);
    try {
      await api('/rrhh/horarios', { method: 'POST', body: { ambito, cargo, personal_id: persona || null, hora_ingreso: ini, hora_salida: fin, duracion_horas: Number(dur), tolerancia_min: Number(tol) } });
      haptic('success'); toast('Horario guardado');
      await qc.invalidateQueries({ queryKey: ['rrhh', 'horarios'] });
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  async function quitar(h: Horario) {
    try {
      await api(`/rrhh/horarios/${h.id}`, { method: 'DELETE' });
      toast('Horario quitado');
      await qc.invalidateQueries({ queryKey: ['rrhh', 'horarios'] });
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const filas = q.data?.horarios ?? [];

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Horarios de trabajo" ancho
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cerrar</Button>
        <Button variant="primary" icon={<Clock3 size={16} />} onClick={guardar} loading={enviando}>Guardar horario</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <p className="field__hint" style={{ margin: 0 }}>
          El horario de una persona reemplaza al de su cargo. Define la tardanza y las horas extra. En turnos de 12 o 24 horas indica la duración real.
        </p>
        {error && <Notice tone="error">{error}</Notice>}

        <div className="form-grid">
          <Field label="Se aplica a" wide>
            {() => <SegmentedControl label="Se aplica a" value={ambito} onChange={v => setAmbito(v as 'CARGO' | 'PERSONA')} options={[{ value: 'CARGO', label: 'Un cargo' }, { value: 'PERSONA', label: 'Una persona' }]} />}
          </Field>
          {ambito === 'CARGO' ? (
            <Field label="Cargo" wide>
              {p => <SelectInput {...p} value={cargo} onChange={e => setCargo(e.target.value)}><option value="">Elige…</option>{cargos.map(c => <option key={c} value={c}>{c}</option>)}</SelectInput>}
            </Field>
          ) : (
            <Field label="Persona" wide>
              {p => <SelectInput {...p} value={persona} onChange={e => setPersona(e.target.value)}><option value="">Elige…</option>
                {personal.map(x => <option key={x.id} value={x.id}>{x.apellidos}, {x.nombres}</option>)}</SelectInput>}
            </Field>
          )}
          <Field label="Hora de ingreso">{p => <TextInput {...p} type="time" value={ini} onChange={e => cambiarHoras(e.target.value, fin)} />}</Field>
          <Field label="Hora de salida">{p => <TextInput {...p} type="time" value={fin} onChange={e => cambiarHoras(ini, e.target.value)} />}</Field>
          <Field label="Duración del turno (horas)" hint="24 h para guardias de un día completo.">{p => <TextInput {...p} type="number" min={1} max={48} step="0.5" value={dur} onChange={e => setDur(e.target.value)} />}</Field>
          <Field label="Tolerancia (minutos)">{p => <TextInput {...p} type="number" min={0} max={120} value={tol} onChange={e => setTol(e.target.value)} />}</Field>
        </div>

        <div>
          <h3 className="t-footnote c-secondary" style={{ margin: '0 0 var(--s-2)' }}>Horarios registrados</h3>
          {q.isLoading ? <p className="t-footnote c-secondary">Cargando…</p> : filas.length === 0 ? <p className="t-footnote c-secondary">Aún no hay horarios.</p> : (
            <div className="hor-lista">
              {filas.map(h => (
                <div key={h.id} className="hor-fila">
                  <span className="hor-fila__quien"><strong>{h.ambito === 'CARGO' ? h.cargo : `${h.apellidos ?? ''}, ${h.nombres ?? ''}`}</strong><small>{h.ambito === 'CARGO' ? 'Cargo' : 'Persona'}</small></span>
                  <span className="t-numeric">{h.hora_ingreso} – {h.hora_salida}</span>
                  <span className="t-numeric">{Number(h.duracion_horas)} h · tol. {h.tolerancia_min} min</span>
                  <button type="button" className="btn btn--plain btn--icono" aria-label="Quitar horario" onClick={() => quitar(h)}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
