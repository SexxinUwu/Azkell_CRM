import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Wand2 } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { usePlacas } from '../placas/api';
import './servicios.css';

export interface OrdenParaViaje {
  id: number; codigo_orden: string; cliente_nombre: string | null; origen: string | null; destino: string | null; ruta?: string | null;
  distancia_km?: number | string | null; ejecucion?: string | null; fecha_fmt?: string | null;
}

const ahora = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

/** Ventana para generar el viaje de un servicio: pide lo que el viaje necesita (quién lo ejecuta, conductor y unidad). */
export function GenerarViajeSheet({ orden, onClose, onGenerado }: { orden: OrdenParaViaje | null; onClose: () => void; onGenerado: (viaje: string) => void }) {
  const toast = useToast();
  const abierto = !!orden;
  const placas = usePlacas();
  const conductores = useQuery({
    queryKey: ['operaciones', 'conductores-lista'], enabled: abierto, staleTime: 5 * 60_000,
    queryFn: () => api<{ id: number; nombre: string }[]>('/conductores-lista').then(r => (Array.isArray(r) ? r : [])),
  });
  const [v, setV] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string | undefined>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orden) return;
    setErrores({}); setError(null);
    setV({
      fecha_viaje: ahora(), ejecucion: String(orden.ejecucion ?? '').toUpperCase() === 'TERCERO' ? 'TERCERO' : 'PROPIO',
      conductor: '', placa_tracto: '', placa_remolque: '', escolta: '', observaciones: '',
      tercero_nombre: '', tercero_ruc: '', tercero_documento: '', tercero_costo: '', tercero_moneda: 'SOLES',
    });
  }, [orden]);

  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));
  const tractos = (placas.data ?? []).filter(p => p.motora).map(p => p.placa);
  const remolques = (placas.data ?? []).filter(p => !p.motora).map(p => p.placa);
  const tercero = v.ejecucion === 'TERCERO';
  const km = Number(orden?.distancia_km) || 0;
  const ruta = orden?.ruta || [orden?.origen, orden?.destino].filter(Boolean).join(' - ');

  async function generar() {
    if (!orden) return;
    const e: Record<string, string> = {};
    if (tercero) { if (!v.tercero_nombre.trim()) e.tercero_nombre = 'Indica el transportista tercero.'; }
    else {
      if (!v.conductor.trim()) e.conductor = 'Elige el conductor.';
      if (!v.placa_tracto.trim()) e.placa_tracto = 'Elige el tracto.';
    }
    setErrores(e);
    if (Object.keys(e).length) { haptic('warning'); return; }
    setEnviando(true); setError(null);
    try {
      const cond = (conductores.data ?? []).find(c => c.nombre === v.conductor);
      const r = await api<{ ok?: boolean; error?: string; viaje?: string }>(`/operaciones/ordenes-servicio/${orden.id}/generar-viaje`, { method: 'POST', body: { ...v, id_conductor: cond?.id ?? null } });
      if (r.ok === false) throw new Error(r.error || 'No se pudo generar el viaje');
      haptic('success'); toast(`Viaje ${r.viaje ?? ''} generado`);
      onGenerado(r.viaje ?? '');
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet ancho open={abierto} onClose={() => !enviando && onClose()} title="Generar viaje"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={<Wand2 size={16} />} onClick={generar} loading={enviando}>Generar viaje</Button></>}>
      <div className="os-asist">
        <div className="os-res__hero">
          <span className="os-res__ruta">{ruta || 'Sin ruta'}{km ? ` · ${km.toLocaleString('es-PE')} km` : ''}</span>
          <span className="os-res__cliente">{orden?.cliente_nombre}</span>
          <span className="os-res__monto">Orden {orden?.codigo_orden}</span>
        </div>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
        <div className="form-grid">
          <Field label="Fecha y hora de salida">{p => <TextInput {...p} type="datetime-local" value={v.fecha_viaje ?? ''} onChange={e => set('fecha_viaje', e.target.value)} />}</Field>
          <div className="field field--wide">
            <SegmentedControl block label="¿Quién transporta?" value={tercero ? 'TERCERO' : 'PROPIO'} onChange={x => set('ejecucion', x)}
              options={[{ value: 'PROPIO', label: 'Flota propia' }, { value: 'TERCERO', label: 'Transportista tercero' }]} />
          </div>
          {tercero && (<>
            <Field label="Transportista tercero *" wide error={errores.tercero_nombre}>{p => <TextInput {...p} value={v.tercero_nombre ?? ''} placeholder="Razón social del transportista" onChange={e => set('tercero_nombre', e.target.value)} />}</Field>
            <Field label="RUC del transportista">{p => <TextInput {...p} inputMode="numeric" value={v.tercero_ruc ?? ''} onChange={e => set('tercero_ruc', e.target.value.replace(/\D/g, '').slice(0, 11))} />}</Field>
            <Field label="Documento del tercero">{p => <TextInput {...p} value={v.tercero_documento ?? ''} onChange={e => set('tercero_documento', e.target.value)} />}</Field>
            <Field label="Costo pactado">{p => <TextInput {...p} inputMode="decimal" value={v.tercero_costo ?? ''} onChange={e => set('tercero_costo', e.target.value.replace(/[^\d.]/g, ''))} />}</Field>
            <Field label="Moneda">{p => <SelectInput {...p} value={v.tercero_moneda ?? 'SOLES'} onChange={e => set('tercero_moneda', e.target.value)}><option value="SOLES">Soles (S/)</option><option value="DOLARES">Dólares (US$)</option></SelectInput>}</Field>
          </>)}
          <Field label={tercero ? 'Conductor del tercero (opcional)' : 'Conductor *'} wide error={errores.conductor}>
            {p => (<>
              <TextInput {...p} list="gv-conductores" value={v.conductor ?? ''} placeholder="Busca al conductor" onChange={e => set('conductor', e.target.value)} />
              <datalist id="gv-conductores">{(conductores.data ?? []).map(c => <option key={c.id} value={c.nombre} />)}</datalist>
            </>)}
          </Field>
          <Field label={tercero ? 'Tracto del tercero (opcional)' : 'Tracto *'} error={errores.placa_tracto}>
            {p => (<>
              <TextInput {...p} list="gv-tractos" value={v.placa_tracto ?? ''} placeholder="Placa" onChange={e => set('placa_tracto', e.target.value.toUpperCase())} />
              <datalist id="gv-tractos">{tractos.map(t => <option key={t} value={t} />)}</datalist>
            </>)}
          </Field>
          <Field label="Remolque">
            {p => (<>
              <TextInput {...p} list="gv-remolques" value={v.placa_remolque ?? ''} placeholder="Placa" onChange={e => set('placa_remolque', e.target.value.toUpperCase())} />
              <datalist id="gv-remolques">{remolques.map(t => <option key={t} value={t} />)}</datalist>
            </>)}
          </Field>
          <Field label="Escolta · opcional">{p => <TextInput {...p} value={v.escolta ?? ''} onChange={e => set('escolta', e.target.value)} />}</Field>
          <Field label="Observaciones · opcional" wide>{p => <TextInput {...p} value={v.observaciones ?? ''} onChange={e => set('observaciones', e.target.value)} />}</Field>
        </div>
      </div>
    </Sheet>
  );
}
