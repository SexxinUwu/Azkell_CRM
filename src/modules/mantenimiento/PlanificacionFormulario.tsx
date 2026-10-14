import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Sparkles } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { usePlacas } from '../placas/api';
import { crearPlan, editarPlan, sugerirPlan, useTiposMantenimiento, type PlanificacionItem } from './api';

const PRIORIDADES = ['Normal', 'Alta', 'Urgente'];
const dia = (s: string | null | undefined) => (s ? String(s).split('T')[0] : '');
const numOrNull = (s: string) => { const n = parseInt(s.replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : null; };

// Programar un mantenimiento preventivo (nuevo) o reprogramar uno existente.
export function PlanificacionFormulario({ plan, usuario, open, onClose }: {
  plan: PlanificacionItem | null; usuario: string; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const placas = usePlacas();
  const tipos = useTiposMantenimiento();
  const editando = !!plan;

  const [placa, setPlaca] = useState('');
  const [tipoMp, setTipoMp] = useState('');
  const [ini, setIni] = useState('');
  const [fin, setFin] = useState('');
  const [km, setKm] = useState('');
  const [tecnico, setTecnico] = useState('');
  const [prioridad, setPrioridad] = useState('Normal');
  const [obs, setObs] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sugerencia, setSugerencia] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null); setSugerencia(null);
    setPlaca(plan?.placa ?? ''); setTipoMp(plan?.tipo_mp ?? '');
    setIni(dia(plan?.fecha_inicio_ventana)); setFin(dia(plan?.fecha_fin_ventana));
    setKm(plan?.km_estimado != null ? String(plan.km_estimado) : '');
    setTecnico(plan?.tecnico_asignado ?? ''); setPrioridad(plan?.prioridad ?? 'Normal'); setObs(plan?.observaciones_plan ?? '');
  }, [open, plan]);

  const tiposMp = useMemo(() => [...new Set((tipos.data ?? []).map(t => t.tipo_mp).filter(Boolean))].sort(), [tipos.data]);

  async function sugerir() {
    if (!placa || !tipoMp) return;
    setSugerencia(null);
    try {
      const r = await sugerirPlan(placa, tipoMp);
      if (!r.ok) { setSugerencia(r.mensaje ?? 'Sin datos suficientes para sugerir.'); return; }
      if (r.fecha_sugerida) setIni(r.fecha_sugerida);
      if (r.fecha_fin_sugerida) setFin(r.fecha_fin_sugerida);
      if (r.km_sugerido) setKm(String(r.km_sugerido));
      setSugerencia('Sugerencia basada en el último Fleetrun y la frecuencia del tipo de MP.');
      haptic('selection');
    } catch (err) { setSugerencia(errorMessage(err)); }
  }

  async function guardar() {
    if (!placa || !tipoMp || !ini || !fin) { setError('Placa, tipo de MP y las dos fechas de la ventana son obligatorias.'); return; }
    if (fin < ini) { setError('La ventana termina antes de empezar.'); return; }
    const mes = parseInt(ini.slice(5, 7), 10);
    const anio = parseInt(ini.slice(0, 4), 10);
    setGuardando(true); setError(null);
    try {
      if (plan) {
        await editarPlan(plan.id, {
          fecha_inicio_ventana: ini, fecha_fin_ventana: fin, mes_ejecucion: mes, anio_ejecucion: anio,
          tecnico_asignado: tecnico.trim(), prioridad, observaciones_plan: obs.trim(),
        });
      } else {
        await crearPlan({
          placa, tipo_mp: tipoMp, fecha_inicio_ventana: ini, fecha_fin_ventana: fin, mes_ejecucion: mes, anio_ejecucion: anio,
          km_estimado: numOrNull(km) ?? 0, tecnico_asignado: tecnico.trim(), prioridad, observaciones_plan: obs.trim(), created_by: usuario,
        });
      }
      haptic('success');
      toast(editando ? 'Plan actualizado' : 'Mantenimiento programado');
      await qc.invalidateQueries({ queryKey: ['mant', 'planificacion'] });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      haptic('warning');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !guardando && onClose()} title={editando ? `Reprogramar ${plan?.placa}` : 'Programar mantenimiento'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} loading={guardando}>{editando ? 'Guardar cambios' : 'Programar'}</Button>
        </>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
        <div className="form-grid">
          <Field label="Placa">
            {p => (
              <SelectInput {...p} value={placa} onChange={e => setPlaca(e.target.value)} disabled={editando}>
                <option value="">Elige una placa…</option>
                {(placas.data ?? []).filter(x => x.estado.toLowerCase() === 'activa' || x.placa === plan?.placa)
                  .map(x => <option key={x.placa} value={x.placa}>{x.placa}{x.cliente ? ` — ${x.cliente}` : ''}</option>)}
              </SelectInput>
            )}
          </Field>
          <Field label="Tipo de MP">
            {p => (
              <SelectInput {...p} value={tipoMp} onChange={e => setTipoMp(e.target.value)} disabled={editando}>
                <option value="">Elige el tipo…</option>
                {tiposMp.map(t => <option key={t} value={t}>{t}</option>)}
              </SelectInput>
            )}
          </Field>
          {!editando && placa && tipoMp && (
            <div className="field field--wide">
              <button type="button" className="placas-limpiar" onClick={sugerir} style={{ alignSelf: 'flex-start' }}>
                <Sparkles size={14} style={{ verticalAlign: '-2px' }} /> Sugerir fechas y km
              </button>
              {sugerencia && <span className="field__hint">{sugerencia}</span>}
            </div>
          )}
          <Field label="Inicio de ventana">{p => <TextInput {...p} type="date" value={ini} onChange={e => setIni(e.target.value)} />}</Field>
          <Field label="Fin de ventana">{p => <TextInput {...p} type="date" value={fin} min={ini || undefined} onChange={e => setFin(e.target.value)} />}</Field>
          <Field label="Km estimado">{p => <TextInput {...p} inputMode="numeric" value={km} onChange={e => setKm(e.target.value)} disabled={editando} />}</Field>
          <Field label="Prioridad">
            {p => (
              <SelectInput {...p} value={prioridad} onChange={e => setPrioridad(e.target.value)}>
                {PRIORIDADES.map(x => <option key={x} value={x}>{x}</option>)}
              </SelectInput>
            )}
          </Field>
          <Field label="Técnico asignado" wide>{p => <TextInput {...p} value={tecnico} onChange={e => setTecnico(e.target.value)} placeholder="Opcional" />}</Field>
          <Field label="Observaciones" wide>{p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" />}</Field>
        </div>
      </div>
    </Sheet>
  );
}
