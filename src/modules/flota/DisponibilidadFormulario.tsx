import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { usePlacas } from '../placas/api';
import { PlacaPicker } from '../../core/ui/PlacaPicker';
import { PersonaPicker } from '../../core/ui/PersonaPicker';
import { ESTADOS_DISP, type VehiculoDisponibilidad } from './api';

const norm = (s: string) => s.trim().toUpperCase();

// Conductores registrados (nombre y DNI), como en la versión actual
function useConductoresLista() {
  return useQuery({
    queryKey: ['flota', 'conductores-lista'],
    queryFn: () => api<unknown>('/conductores-lista').then(r =>
      ((Array.isArray(r) ? r : []) as { nombre?: string; dni?: string }[])
        .map(c => ({ valor: String(c.nombre ?? '').trim(), detalle: c.dni ? String(c.dni) : null }))
        .filter(c => c.valor)),
    staleTime: 5 * 60_000,
  });
}

// Registrar o editar la disponibilidad de una unidad (camión y/o carreta).
export function DisponibilidadFormulario({ veh, usuario, open, onClose }: {
  veh: VehiculoDisponibilidad | null; usuario: string; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const placas = usePlacas();
  const conductores = useConductoresLista();
  const editando = !!veh?.id;

  const [camion, setCamion] = useState('');
  const [carreta, setCarreta] = useState('');
  const [conductor, setConductor] = useState('');
  const [marca, setMarca] = useState('');
  const [capacidad, setCapacidad] = useState('');
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState<string>('En Base');
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Conductor de la última orden de viaje de la placa (null mientras consulta). Solo se aplica en registro nuevo y si la persona no lo cambió.
  const [sugerido, setSugerido] = useState<string | null>(null);
  const [conductorTocado, setConductorTocado] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCamion(veh?.placa_camion ?? ''); setCarreta(veh?.placa_carreta ?? ''); setConductor(veh?.conductor_asignado ?? '');
    setMarca(veh?.marca ?? ''); setCapacidad(veh?.capacidad_tanque && veh.capacidad_tanque !== '—' ? veh.capacidad_tanque : '');
    setTipo(veh?.tipo_unidad ?? ''); setEstado(veh?.estado || 'En Base'); setObs(veh?.observaciones ?? '');
    setConductorTocado(false);
  }, [open, veh]);

  useEffect(() => {
    if (!open) return;
    const cam = norm(camion), car = norm(carreta);
    const placa = cam || car;
    if (!placa) { setSugerido(''); return; }
    let vigente = true;
    setSugerido(null);
    api<{ conductor?: string }>(`/disponibilidad-flota/conductor-sugerido?placa=${encodeURIComponent(placa)}&tipo=${cam ? 'camion' : 'carreta'}`)
      .then(r => {
        if (!vigente) return;
        const c = (r.conductor ?? '').trim();
        setSugerido(c);
        if (!editando && !conductorTocado) setConductor(c);
      })
      .catch(() => { if (vigente) setSugerido(''); });
    return () => { vigente = false; };
  }, [open, camion, carreta, editando, conductorTocado]);

  const lista = placas.data ?? [];
  const camiones = lista.filter(p => p.motora).map(p => ({ placa: p.placa, detalle: p.cliente }));
  const carretas = lista.filter(p => !p.motora).map(p => ({ placa: p.placa, detalle: p.cliente }));

  async function guardar() {
    const cam = norm(camion), car = norm(carreta);
    if (!cam && !car) { setError('Ingresa al menos la placa del camión o la de la carreta.'); return; }
    setEnviando(true); setError(null);
    const body = {
      id: veh?.id ?? null, placa_camion: cam, placa_carreta: car,
      placa_camion_orig: norm(veh?.placa_camion ?? ''), placa_carreta_orig: norm(veh?.placa_carreta ?? ''),
      conductor_asignado: conductor.trim(), marca: norm(marca), capacidad_tanque: capacidad.trim(), tipo_unidad: tipo.trim(),
      estado, estado_unidad: estado, observaciones: obs.trim(), actualizado_por: usuario, creado_por: usuario,
    };
    try {
      const r = editando
        ? await api<{ error?: string; advertencia?: string }>(`/disponibilidad-flota/${veh!.id}`, { method: 'PUT', body })
        : await api<{ error?: string; advertencia?: string }>('/disponibilidad-flota', { method: 'POST', body });
      if (r?.error) throw new Error(r.error);
      if (r?.advertencia) toast(r.advertencia, 'error');
      haptic('success');
      toast(editando ? 'Disponibilidad actualizada' : 'Unidad registrada');
      await qc.invalidateQueries({ queryKey: ['flota', 'disponibilidad'] });
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()}
      title={editando ? `Editar ${veh?.placa_camion || veh?.placa_carreta || 'unidad'}` : 'Registrar disponibilidad'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {veh?.aviso_viaje && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{veh.aviso_viaje}</Notice></div>}
        <Field label="Placa del camión">
          {p => <PlacaPicker {...p} value={camion} onChange={setCamion} opciones={camiones} placeholder="Elige el camión" />}
        </Field>
        <Field label="Placa de la carreta">
          {p => <PlacaPicker {...p} value={carreta} onChange={setCarreta} opciones={carretas} placeholder="Elige la carreta" />}
        </Field>
        <Field label="Conductor asignado" wide hint={
          sugerido === null ? undefined
            : sugerido === '' ? (camion || carreta ? 'Sin orden de viaje previa para esta unidad: elige el conductor.' : undefined)
            : conductor.trim().toUpperCase() === sugerido.toUpperCase()
              ? 'Tomado de la última orden de viaje. Puedes cambiarlo.'
              : <>Última orden de viaje: <strong>{sugerido}</strong> <Button variant="plain" onClick={() => { setConductor(sugerido); setConductorTocado(false); }}>Usar este</Button></>
        }>
          {p => (
            <PersonaPicker {...p} value={conductor} onChange={v => { setConductorTocado(true); setConductor(v); }} opciones={conductores.data ?? []}
              placeholder="Elige el conductor" titulo="Buscar conductor" />
          )}
        </Field>
        <Field label="Estado">
          {p => (
            <SelectInput {...p} value={estado} onChange={e => setEstado(e.target.value)}>
              {[...new Set([...ESTADOS_DISP, estado])].map(e => <option key={e} value={e}>{e}</option>)}
            </SelectInput>
          )}
        </Field>
        <Field label="Marca">{p => <TextInput {...p} value={marca} onChange={e => setMarca(e.target.value)} />}</Field>
        <Field label="Tipo de unidad">{p => <TextInput {...p} value={tipo} onChange={e => setTipo(e.target.value)} />}</Field>
        <Field label="Capacidad de tanque">{p => <TextInput {...p} value={capacidad} onChange={e => setCapacidad(e.target.value)} />}</Field>
        <Field label="Observaciones" wide>{p => <TextInput {...p} value={obs} onChange={e => setObs(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}
