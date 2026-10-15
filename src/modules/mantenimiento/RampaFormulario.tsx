import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { api } from '../../core/api/client';
import { usePlacas } from '../placas/api';
import {
  actualizarRampa, ingresarRampa, liberarRampa, useCatalogosTaller, useStatusRampa,
  type RampaEntrada,
} from './api';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const horaAhora = () => new Date().toTimeString().slice(0, 5);
const dia = (s: string | null | undefined) => (s ? String(s).split('T')[0] : '');
const hora = (s: string | null | undefined) => (s ? String(s).slice(0, 5) : '');

// Ingresar una unidad a una rampa, o editar su registro.
export function RampaFormulario({ entrada, usuario, open, onClose }: {
  entrada: RampaEntrada | null; usuario: string; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const cat = useCatalogosTaller();
  const placas = usePlacas();
  const todas = useStatusRampa();
  const editando = !!entrada;

  const [rampa, setRampa] = useState('');
  const [placa, setPlaca] = useState('');
  const [km, setKm] = useState('');
  const [conductor, setConductor] = useState('');
  const [fIng, setFIng] = useState('');
  const [hIng, setHIng] = useState('');
  const [fSal, setFSal] = useState('');
  const [hSal, setHSal] = useState('');
  const [situacion, setSituacion] = useState('');
  const [obs, setObs] = useState('');
  const [evidencia, setEvidencia] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null); setEvidencia(null);
    setRampa(entrada?.rampaCatId ?? ''); setPlaca(entrada?.placa ?? ''); setKm(entrada?.km != null ? String(entrada.km) : '');
    setConductor(entrada?.conductor ?? ''); setFIng(dia(entrada?.fecha_ingreso) || hoyISO()); setHIng(hora(entrada?.hora_ingreso) || horaAhora());
    setFSal(dia(entrada?.salida_programada)); setHSal(hora(entrada?.hora_salida_programada));
    setSituacion(entrada?.situacion ?? ''); setObs(entrada?.observaciones ?? '');
  }, [open, entrada]);

  const rampas = cat.data?.rampas ?? [];
  const situaciones = (cat.data?.situaciones ?? []).map(s => s.descripcion ?? s.nombre ?? '').filter(Boolean);
  // Rampas ya ocupadas (activas), salvo la que se está editando
  const ocupadas = new Set((todas.data ?? []).filter(e => e.estado !== 'Liberado' && rampaIdDe(e) !== (entrada ? rampaIdDe(entrada) : '')).map(e => e.rampaCatId));

  async function guardar() {
    if (!rampa) { setError('Elige una rampa.'); return; }
    if (!placa) { setError('Elige la placa de la unidad.'); return; }
    if (!editando && ocupadas.has(rampa)) { setError('Esa rampa ya está ocupada. Libérala primero o elige otra.'); return; }
    setEnviando(true); setError(null);
    let evidenciaUrl: string | null = entrada?.evidencia_url ?? null;
    try {
      if (evidencia) {
        if (evidencia.size > 15 * 1024 * 1024) throw new Error('El archivo no puede pesar más de 15 MB.');
        const up = await api<{ uploadUrl: string; finalUrl: string }>('/taller-rampas/upload-url', {
          method: 'POST', body: { fileName: evidencia.name, fileType: evidencia.type },
        });
        const put = await fetch(up.uploadUrl, { method: 'PUT', body: evidencia, headers: { 'Content-Type': evidencia.type } });
        if (!put.ok) throw new Error('No se pudo subir la evidencia.');
        evidenciaUrl = up.finalUrl;
      }
    } catch (err) { setError(errorMessage(err)); haptic('warning'); setEnviando(false); return; }
    const d = {
      rampa, placa, km, conductor: conductor.trim(),
      fecha_ingreso: fIng || null, hora_ingreso: hIng || null, fecha_salida: fSal || null, hora_salida: hSal || null,
      situacion, obs: obs.trim(), creado_por: usuario, evidencia_url: evidenciaUrl,
    };
    try {
      if (entrada) await actualizarRampa(entrada.id ?? '', d); else await ingresarRampa(d);
      haptic('success');
      toast(editando ? 'Rampa actualizada' : 'Unidad ingresada a rampa');
      await qc.invalidateQueries({ queryKey: ['mant', 'rampas'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={editando ? `Editar ${entrada?.placa ?? 'rampa'}` : 'Ingresar a rampa'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>{editando ? 'Guardar' : 'Ingresar'}</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Rampa">
          {p => (
            <SelectInput {...p} value={rampa} onChange={e => setRampa(e.target.value)}>
              <option value="">Elige una rampa…</option>
              {rampas.map(r => (
                <option key={String(r.id)} value={String(r.id)} disabled={!editando && ocupadas.has(String(r.id))}>
                  {r.nombre_rampa ?? r.nombre ?? r.id}{ocupadas.has(String(r.id)) ? ' (ocupada)' : ''}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        <Field label="Placa">
          {p => (
            <PlacaPicker {...p} value={placa} onChange={setPlaca} opciones={(placas.data ?? []).map(x => ({ placa: x.placa, detalle: x.cliente }))} />
          )}
        </Field>
        <Field label="Conductor">{p => <TextInput {...p} value={conductor} onChange={e => setConductor(e.target.value)} />}</Field>
        <Field label="Km / horas">{p => <TextInput {...p} inputMode="numeric" value={km} onChange={e => setKm(e.target.value)} />}</Field>
        <Field label="Fecha de ingreso">{p => <TextInput {...p} type="date" value={fIng} onChange={e => setFIng(e.target.value)} />}</Field>
        <Field label="Hora de ingreso">{p => <TextInput {...p} type="time" value={hIng} onChange={e => setHIng(e.target.value)} />}</Field>
        <Field label="Salida estimada (fecha)">{p => <TextInput {...p} type="date" value={fSal} min={fIng || undefined} onChange={e => setFSal(e.target.value)} />}</Field>
        <Field label="Salida estimada (hora)">{p => <TextInput {...p} type="time" value={hSal} onChange={e => setHSal(e.target.value)} />}</Field>
        <Field label="Situación" wide>
          {p => (
            <SelectInput {...p} value={situacion} onChange={e => setSituacion(e.target.value)}>
              <option value="">Sin situación</option>
              {[...new Set([...situaciones, ...(situacion ? [situacion] : [])])].map(s => <option key={s} value={s}>{s}</option>)}
            </SelectInput>
          )}
        </Field>
        <Field label="Observaciones" wide>{p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} placeholder="Motivo del ingreso" />}</Field>
        <Field label="Evidencia (foto o PDF)" wide hint={evidencia?.name ?? (entrada?.evidencia_url ? 'Ya tiene un archivo; elige otro para reemplazarlo' : undefined)}>
          {p => <TextInput {...p} type="file" accept="image/*,application/pdf" onChange={e => setEvidencia(e.target.files?.[0] ?? null)} />}
        </Field>
      </div>
    </Sheet>
  );
}

const rampaIdDe = (e: RampaEntrada) => e.rampaCatId;

// Liberar la rampa: registra la salida real de la unidad.
export function LiberarRampa({ entrada, usuario, open, onClose }: {
  entrada: RampaEntrada; usuario: string; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const cat = useCatalogosTaller();
  const [fecha, setFecha] = useState('');
  const [horaS, setHoraS] = useState('');
  const [situacion, setSituacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFecha(hoyISO()); setHoraS(horaAhora()); setSituacion(entrada.situacion ?? ''); setError(null);
  }, [open, entrada]);

  const situaciones = (cat.data?.situaciones ?? []).map(s => s.descripcion ?? s.nombre ?? '').filter(Boolean);

  async function liberar() {
    if (!fecha || !horaS) { setError('Indica la fecha y hora de salida.'); return; }
    setEnviando(true); setError(null);
    try {
      await liberarRampa(entrada.id ?? '', { liberado_por: usuario, fecha_salida_real: fecha, hora_salida_real: horaS, situacion: situacion || undefined, usuario });
      haptic('success'); toast(`${entrada.rampa} liberada`);
      await qc.invalidateQueries({ queryKey: ['mant', 'rampas'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={`Liberar ${entrada.rampa}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={liberar} loading={enviando}>Liberar rampa</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        <Field label="Fecha de salida">{p => <TextInput {...p} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />}</Field>
        <Field label="Hora de salida">{p => <TextInput {...p} type="time" value={horaS} onChange={e => setHoraS(e.target.value)} />}</Field>
        <Field label="Situación final" wide>
          {p => (
            <SelectInput {...p} value={situacion} onChange={e => setSituacion(e.target.value)}>
              <option value="">Sin cambios</option>
              {[...new Set([...situaciones, ...(situacion ? [situacion] : [])])].map(s => <option key={s} value={s}>{s}</option>)}
            </SelectInput>
          )}
        </Field>
      </div>
    </Sheet>
  );
}
