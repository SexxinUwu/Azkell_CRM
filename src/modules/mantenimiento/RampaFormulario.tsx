import { useEffect, useMemo, useRef, useState } from 'react';
import { ArchivoInput } from '../../core/ui/ArchivoInput';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Combobox } from '../../core/ui/Combobox';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { api } from '../../core/api/client';
import { usePlacas } from '../placas/api';
import { useUnidadesGps } from '../flota/api';
import { telemetriaDe } from '../flota/telemetriaPlaca';
import { usePersonalNombres } from './OTEditar';
import { formatoTrabajosRampa, parseTrabajosRampa, type TrabajoRampa } from './trabajosRampa';
import {
  actualizarRampa, ingresarRampa, liberarRampa, useCatalogosTaller, useStatusRampa,
  type RampaEntrada,
} from './api';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const horaAhora = () => new Date().toTimeString().slice(0, 5);
const dia = (s: string | null | undefined) => (s ? String(s).split('T')[0] : '');
const hora = (s: string | null | undefined) => (s ? String(s).slice(0, 5) : '');

let secuenciaFila = 0;
const nuevaFila = (desc = '', tecnico = ''): TrabajoRampa => ({ key: `t${++secuenciaFila}`, desc, tecnico });

// Ingresar una unidad a una rampa, o editar su registro.
export function RampaFormulario({ entrada, usuario, open, onClose, rampaInicial }: {
  entrada: RampaEntrada | null; usuario: string; open: boolean; onClose: () => void; rampaInicial?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const cat = useCatalogosTaller();
  const placas = usePlacas();
  const todas = useStatusRampa();
  const personal = usePersonalNombres();
  const gps = useUnidadesGps(60_000);
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
  const [trabajos, setTrabajos] = useState<TrabajoRampa[]>([]);
  const [notas, setNotas] = useState('');
  const [evidencia, setEvidencia] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Placa para la que ya se puso el km del GPS: después el usuario puede corregirlo sin que se pise
  const kmAutoPara = useRef('');

  // Kilometraje del GPS en vivo de la placa elegida (el mismo que usa la hoja de generar OT)
  const kmDelGps = useMemo(() => {
    const t = telemetriaDe(gps.data, placa);
    return t && t.km > 0 ? Math.round(t.km) : null;
  }, [gps.data, placa]);

  useEffect(() => {
    if (!open) return;
    setError(null); setEvidencia(null); kmAutoPara.current = '';
    setRampa(entrada?.rampaCatId ?? rampaInicial ?? ''); setPlaca(entrada?.placa ?? ''); setKm(entrada?.km != null ? String(entrada.km) : '');
    setConductor(entrada?.conductor ?? ''); setFIng(dia(entrada?.fecha_ingreso) || hoyISO()); setHIng(hora(entrada?.hora_ingreso) || horaAhora());
    setFSal(dia(entrada?.salida_programada)); setHSal(hora(entrada?.hora_salida_programada));
    setSituacion(entrada?.situacion ?? '');
    const parseado = parseTrabajosRampa(entrada?.observaciones);
    setTrabajos(parseado.trabajos.length ? parseado.trabajos.map(t => nuevaFila(t.desc, t.tecnico)) : [nuevaFila()]);
    setNotas(parseado.notas);
  }, [open, entrada, rampaInicial]);

  // Al elegir la placa, el km sale del GPS de ese momento (si ya llegó la telemetría)
  useEffect(() => {
    if (!open || !placa || kmDelGps == null) return;
    if (placa === (entrada?.placa ?? '') || kmAutoPara.current === placa) return;
    kmAutoPara.current = placa;
    setKm(String(kmDelGps));
  }, [open, placa, kmDelGps, entrada]);

  const rampas = cat.data?.rampas ?? [];
  const situaciones = (cat.data?.situaciones ?? []).map(s => s.descripcion ?? s.nombre ?? '').filter(Boolean);
  const opcionesPersonal = (personal.data ?? []).map(n => ({ value: n, label: n }));
  // Rampas ya ocupadas (activas), salvo la que se está editando
  const ocupadas = new Set((todas.data ?? []).filter(e => e.estado !== 'Liberado' && rampaIdDe(e) !== (entrada ? rampaIdDe(entrada) : '')).map(e => e.rampaCatId));

  function editarTrabajo(key: string, cambios: Partial<TrabajoRampa>) {
    setTrabajos(prev => prev.map(t => (t.key === key ? { ...t, ...cambios } : t)));
  }

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
      situacion, obs: formatoTrabajosRampa(trabajos, notas), creado_por: usuario, evidencia_url: evidenciaUrl,
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
        <Field label="Conductor">
          {p => <Combobox {...p} options={opcionesPersonal} value={conductor || null} onChange={v => setConductor(v ?? '')} placeholder="Seleccione conductor…" />}
        </Field>
        <Field label="Km / horas" hint={kmDelGps != null ? `GPS: ${kmDelGps} km` : undefined}>
          {p => <TextInput {...p} inputMode="numeric" value={km} onChange={e => setKm(e.target.value)} />}
        </Field>
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
        {/* Trabajos de la rampa: uno por línea, cada uno con su técnico (igual que en la orden de trabajo) */}
        {trabajos.map((t, i) => (
          <div key={t.key} style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 8, alignItems: 'end' }}>
            <Field label={`Trabajo ${i + 1}`}>
              {p => <TextInput {...p} value={t.desc} onChange={e => editarTrabajo(t.key, { desc: e.target.value })} placeholder="Motivo o trabajo a realizar" />}
            </Field>
            <Field label="Técnico">
              {p => <Combobox {...p} options={opcionesPersonal} value={t.tecnico || null} onChange={v => editarTrabajo(t.key, { tecnico: v ?? '' })} placeholder="Seleccione técnico…" />}
            </Field>
            <Button variant="plain" iconOnly icon={<Trash2 size={16} />} aria-label={`Quitar trabajo ${i + 1}`} title="Quitar trabajo"
              onClick={() => setTrabajos(prev => prev.filter(x => x.key !== t.key))} disabled={trabajos.length <= 1} />
          </div>
        ))}
        <div style={{ gridColumn: '1 / -1' }}>
          <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setTrabajos(prev => [...prev, nuevaFila()])}>Agregar trabajo</Button>
        </div>
        <Field label="Notas" wide>{p => <TextInput {...p} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones adicionales (opcional)" />}</Field>
        <Field label="Evidencia (foto o PDF)" wide hint={evidencia?.name ?? (entrada?.evidencia_url ? 'Ya tiene un archivo; elige otro para reemplazarlo' : undefined)}>
          {p => <ArchivoInput {...p} accept="image/*,application/pdf" onChange={setEvidencia} />}
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
