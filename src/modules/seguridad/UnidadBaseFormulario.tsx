import { useEffect, useState } from 'react';
import { Button } from '../../core/ui/Button';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

// Registro de una unidad en la base (garita): alta, edición y baja, con los mismos campos del clásico.
export interface RegistroBase {
  base_id?: string | number;
  id?: string | number;
  placa: string;
  placa_carreta: string | null;
  conductor: string | null;
  corte: string | null;
  zona: string | null;
  estado: string | null;
  observacion: string | null;
}

const CORTES = ['Corte 1', 'Corte 2'];
const ZONAS = ['Base', 'Mantenimiento', 'Lavado'];
const ESTADOS = ['Cargado', 'Con Devolución', 'Vacío'];
const hoyLima = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

export function RegistroBaseSheet({ abierto, registro, onClose, onGuardado }: {
  abierto: boolean; registro: RegistroBase | null; onClose: () => void; onGuardado: () => void;
}) {
  const toast = useToast();
  const [v, setV] = useState({ placaCamion: '', placaCarreta: '', conductor: '', corte: 'Corte 1', zona: 'Base', estado: 'Cargado', observacion: '' });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const editando = !!registro;

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setV({
      placaCamion: registro?.placa ?? '',
      placaCarreta: registro?.placa_carreta ?? '',
      conductor: registro?.conductor ?? '',
      corte: registro?.corte ?? 'Corte 1',
      zona: registro?.zona ?? 'Base',
      estado: registro?.estado ?? 'Cargado',
      observacion: registro?.observacion ?? '',
    });
  }, [abierto, registro]);

  async function guardar() {
    if (!v.placaCamion.trim() && !v.placaCarreta.trim()) { setError('Indica al menos la placa del camión o de la carreta.'); haptic('warning'); return; }
    setGuardando(true); setError(null);
    const cuerpo = {
      fecha: hoyLima(), corte: v.corte, placa_camion: v.placaCamion.trim().toUpperCase(), placa_carreta: v.placaCarreta.trim().toUpperCase(),
      conductor: v.conductor.trim(), zona: v.zona, estado: v.estado, observacion: v.observacion.trim(),
    };
    try {
      const id = registro ? (registro.base_id ?? registro.id) : null;
      const r = id != null
        ? await api<{ ok?: boolean; error?: string }>(`/seguridad/unidades-base/${encodeURIComponent(String(id))}`, { method: 'PUT', body: cuerpo })
        : await api<{ ok?: boolean; error?: string }>('/seguridad/unidades-base', { method: 'POST', body: cuerpo });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar');
      haptic('success'); toast(editando ? 'Registro actualizado' : 'Unidad registrada en la base');
      onGuardado();
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(false); }
  }

  return (
    <Sheet open={abierto} onClose={() => !guardando && onClose()} title={editando ? 'Editar registro en base' : 'Registrar unidad en base'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={guardando}>Guardar</Button></>}>
      <div className="form-grid">
        {error && <div className="field field--wide"><span style={{ color: 'var(--red-ink)', fontWeight: 600 }}>{error}</span></div>}
        <Field label="Placa del camión">{p => <TextInput {...p} value={v.placaCamion} onChange={e => setV({ ...v, placaCamion: e.target.value.toUpperCase() })} />}</Field>
        <Field label="Placa de la carreta">{p => <TextInput {...p} value={v.placaCarreta} onChange={e => setV({ ...v, placaCarreta: e.target.value.toUpperCase() })} />}</Field>
        <Field label="Conductor" wide>{p => <TextInput {...p} value={v.conductor} onChange={e => setV({ ...v, conductor: e.target.value.toUpperCase() })} />}</Field>
        <Field label="Corte">{p => <SelectInput {...p} value={v.corte} onChange={e => setV({ ...v, corte: e.target.value })}>{CORTES.map(c => <option key={c} value={c}>{c}</option>)}</SelectInput>}</Field>
        <Field label="Zona">{p => <SelectInput {...p} value={v.zona} onChange={e => setV({ ...v, zona: e.target.value })}>{ZONAS.map(z => <option key={z} value={z}>{z}</option>)}</SelectInput>}</Field>
        <Field label="Estado de carga" wide>{p => <SelectInput {...p} value={v.estado} onChange={e => setV({ ...v, estado: e.target.value })}>{ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}</SelectInput>}</Field>
        <Field label="Observación" wide>{p => <TextInput {...p} value={v.observacion} onChange={e => setV({ ...v, observacion: e.target.value })} />}</Field>
      </div>
    </Sheet>
  );
}

export async function eliminarRegistroBase(registro: RegistroBase) {
  const id = registro.base_id ?? registro.id;
  const r = await api<{ ok?: boolean; error?: string }>(`/seguridad/unidades-base/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
  if (r.ok === false) throw new Error(r.error || 'No se pudo eliminar');
}
