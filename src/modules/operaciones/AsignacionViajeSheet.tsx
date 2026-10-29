import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Route } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { usePlacas } from '../placas/api';

// Datos mínimos del viaje que necesita la asignación (la fila de Programación ya los trae)
export interface ViajeAsignable {
  viaje: string;
  estado: string;
  id_conductor?: number | null;
  conductor: string | null;
  placa_tracto: string | null;
  placa_remolque: string | null;
  ruta: string | null;
}

interface Campos { conductor: string; placa_tracto: string; placa_remolque: string; ruta: string }

// Asignación de un viaje: conductor, tracto (unidad), carreta y ruta.
// Se guarda con PATCH /api/operaciones/ordenes-viaje/:viaje/asignacion (solo esos cuatro campos).
export function AsignacionViajeSheet({ viaje, onClose, onGuardado }: {
  viaje: ViajeAsignable | null; onClose: () => void; onGuardado: () => Promise<unknown>;
}) {
  const toast = useToast();
  const placas = usePlacas();
  const conductores = useQuery({
    queryKey: ['operaciones', 'conductores-lista'], enabled: !!viaje,
    queryFn: () => api<{ id: number; nombre: string }[]>('/conductores-lista').then(r => (Array.isArray(r) ? r : [])),
    staleTime: 5 * 60_000,
  });
  const [v, setV] = useState<Campos>({ conductor: '', placa_tracto: '', placa_remolque: '', ruta: '' });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [errCampos, setErrCampos] = useState<Partial<Record<keyof Campos, string>>>({});

  // Se reinicia solo al abrir otro viaje (no al refrescar la lista mientras se escribe)
  const codigo = viaje?.viaje ?? null;
  useEffect(() => {
    if (!viaje) return;
    setV({ conductor: viaje.conductor ?? '', placa_tracto: viaje.placa_tracto ?? '', placa_remolque: viaje.placa_remolque ?? '', ruta: viaje.ruta ?? '' });
    setError(null); setAvisos([]); setErrCampos({});
  }, [codigo]);

  const set = (k: keyof Campos, val: string) => setV(a => ({ ...a, [k]: val }));
  const tractos = (placas.data ?? []).filter(p => p.motora);
  const remolques = (placas.data ?? []).filter(p => !p.motora);
  const configDe = (placa: string) => {
    const p = (placas.data ?? []).find(x => x.placa === placa.trim().toUpperCase());
    return p?.configuracion ? p.configuracion : null;
  };
  const configTracto = configDe(v.placa_tracto);
  const configRemolque = configDe(v.placa_remolque);

  async function guardar() {
    if (!viaje) return;
    const e: Partial<Record<keyof Campos, string>> = {};
    if (!v.conductor.trim()) e.conductor = 'El conductor es obligatorio.';
    if (!v.placa_tracto.trim()) e.placa_tracto = 'El tracto es obligatorio.';
    setErrCampos(e);
    if (Object.keys(e).length) { haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      // El id del conductor sale de la lista; si no aparece, se conserva solo si el nombre no cambió
      const cond = (conductores.data ?? []).find(c => c.nombre === v.conductor.trim());
      const mismoNombre = v.conductor.trim() === (viaje.conductor ?? '').trim();
      const r = await api<{ ok?: boolean; error?: string; advertencias?: string[] }>(
        `/operaciones/ordenes-viaje/${encodeURIComponent(viaje.viaje)}/asignacion`,
        {
          method: 'PATCH',
          body: {
            id_conductor: cond?.id ?? (mismoNombre ? viaje.id_conductor ?? null : null),
            conductor: v.conductor.trim(),
            placa_tracto: v.placa_tracto.trim().toUpperCase(),
            placa_remolque: v.placa_remolque.trim().toUpperCase() || null,
            ruta: v.ruta.trim() || null,
          },
        },
      );
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar la asignación');
      haptic('success'); toast('Asignación guardada');
      await onGuardado();
      // Avisos (documentos vencidos, unidad o conductor en otro viaje): la asignación ya quedó guardada
      if (r.advertencias && r.advertencias.length) { setAvisos(r.advertencias); return; }
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const hecho = avisos.length > 0;

  return (
    <Sheet open={!!viaje} onClose={() => !enviando && onClose()} title={viaje ? `Asignar viaje ${viaje.viaje}` : 'Asignar viaje'}
      footer={hecho ? (
        <Button variant="primary" onClick={onClose}>Entendido</Button>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="primary" icon={<Route size={16} />} onClick={guardar} loading={enviando}>Guardar asignación</Button>
        </>
      )}>
      <div className="form-grid">
        {error && <div className="field field--wide"><Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice></div>}
        {hecho && (
          <div className="field field--wide">
            <Notice tone="error" icon={<CircleAlert size={16} />}>
              <div style={{ marginBottom: 4, fontWeight: 700 }}>Asignación guardada con avisos</div>
              {avisos.map(a => <div key={a}>{a}</div>)}
            </Notice>
          </div>
        )}
        <Field label="Conductor" wide error={errCampos.conductor}>
          {p => (<>
            <TextInput {...p} list="asig-conductores" disabled={hecho} value={v.conductor} onChange={e => set('conductor', e.target.value)} />
            <datalist id="asig-conductores">{(conductores.data ?? []).map(c => <option key={c.id} value={c.nombre} />)}</datalist>
          </>)}
        </Field>
        <Field label="Tracto (unidad)" error={errCampos.placa_tracto} hint={configTracto ? `Configuración ${configTracto}` : undefined}>
          {p => (<>
            <TextInput {...p} list="asig-tractos" disabled={hecho} value={v.placa_tracto} onChange={e => set('placa_tracto', e.target.value.toUpperCase())} />
            <datalist id="asig-tractos">{tractos.map(t => <option key={t.placa} value={t.placa} />)}</datalist>
          </>)}
        </Field>
        <Field label="Carreta" hint={configRemolque ? `Configuración ${configRemolque}` : undefined}>
          {p => (<>
            <TextInput {...p} list="asig-remolques" disabled={hecho} value={v.placa_remolque} onChange={e => set('placa_remolque', e.target.value.toUpperCase())} />
            <datalist id="asig-remolques">{remolques.map(t => <option key={t.placa} value={t.placa} />)}</datalist>
          </>)}
        </Field>
        <Field label="Ruta" wide>
          {p => <TextInput {...p} disabled={hecho} value={v.ruta} onChange={e => set('ruta', e.target.value)} />}
        </Field>
      </div>
    </Sheet>
  );
}
