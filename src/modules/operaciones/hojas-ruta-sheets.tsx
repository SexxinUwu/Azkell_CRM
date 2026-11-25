import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CircleAlert, FileText, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { Combobox } from '../../core/ui/Combobox';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { Sheet } from '../../core/ui/Sheet';
import { useToast } from '../../core/ui/Toast';
import { api, apiFetch, errorMessage } from '../../core/api/client';
import { hoyLima } from '../../core/lib/format';
import { haptic } from '../../core/lib/haptics';
import { mantenerUrl } from '../../core/lib/blobUrl';
import { RAIZ, TIPOS_PARADA, duracionMin, duracionTexto, useOpcionesHoja, type Parada, type PlantillaRuta } from './hojas-ruta-datos';

/** Generar el PDF de una plantilla para un viaje: llegada al cliente, unidad y conductores */
export function GenerarHojaSheet({ plantilla, onClose }: { plantilla: PlantillaRuta | null; onClose: () => void }) {
  const toast = useToast();
  const op = useOpcionesHoja(!!plantilla);
  const [salida, setSalida] = useState('');
  const [viaje, setViaje] = useState('');
  const [placa, setPlaca] = useState<string | null>(null);
  const [remolque, setRemolque] = useState<string | null>(null);
  const [c1, setC1] = useState<string | null>(null);
  const [c2, setC2] = useState<string | null>(null);
  const [obs, setObs] = useState('');
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir una plantilla: llegada hoy a la primera hora de su itinerario
  useEffect(() => {
    if (!plantilla) return;
    setSalida(`${hoyLima()}T${plantilla.paradas[0]?.hora_inicio ?? '08:00'}`);
    setViaje(''); setPlaca(null); setRemolque(null); setC1(null); setC2(null); setObs(''); setError(null);
  }, [plantilla?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const placas = op.data?.placas ?? [];
  const esTracto = plantilla?.tipo_unidad === 'TRACTO';
  const opPlacas = useMemo(() => placas
    .filter(p => (esTracto ? p.tipo === 'Tracto' : /^cami/i.test(p.tipo)))
    .map(p => ({ value: p.placa, label: p.placa, description: p.tipo })), [placas, esTracto]);
  const opRemolques = useMemo(() => placas.filter(p => /carreta|semirremolque/i.test(p.tipo)).map(p => ({ value: p.placa, label: p.placa, description: p.tipo })), [placas]);
  const opConductores = useMemo(() => (op.data?.conductores ?? []).map(c => ({ value: c.nombre, label: c.nombre, description: c.telefono || c.dni || undefined })), [op.data]);
  const tel = (n: string | null) => (op.data?.conductores ?? []).find(c => c.nombre === n)?.telefono ?? '';

  async function generar() {
    if (!plantilla) return;
    setGenerando(true); setError(null);
    // La pestaña se abre ya (en el clic) para que el navegador no bloquee la ventana del PDF
    const ventana = window.open('', '_blank');
    try {
      const conductores = [c1, c2].filter((x): x is string => !!x).map(n => ({ nombre: n, telefono: tel(n) }));
      const res = await apiFetch('/operaciones/hojas-ruta/pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantilla_id: plantilla.id, salida, viaje, placa, remolque, conductores, observaciones: obs }),
      });
      if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error ?? 'No se pudo generar la hoja de ruta'); }
      const url = URL.createObjectURL(await res.blob());
      if (ventana) ventana.location.href = url; else window.open(url, '_blank');
      mantenerUrl(url);
      haptic('success');
      toast('Hoja de ruta generada');
    } catch (e) {
      ventana?.close();
      setError(errorMessage(e));
    } finally { setGenerando(false); }
  }

  return (
    <Sheet open={!!plantilla} onClose={onClose} title="Generar hoja de ruta"
      footer={<><Button variant="secondary" onClick={onClose} disabled={generando}>Cancelar</Button>
        <Button variant="primary" icon={<FileText size={16} />} onClick={generar} loading={generando} disabled={!salida}>Generar PDF</Button></>}>
      <div className="hr-hoja">
        {plantilla && <p className="hr-hoja__nota"><b>{plantilla.nombre}</b><br />Las horas se corren desde la llegada al cliente: {plantilla.paradas[0]?.hora_inicio ?? '--:--'} es la hora de la plantilla.</p>}
        <Field label="Llegada al cliente (inicio de carga)">{p => <TextInput {...p} type="datetime-local" value={salida} onChange={e => setSalida(e.target.value)} />}</Field>
        <Field label="N° de viaje o referencia" hint="Opcional.">{p => <TextInput {...p} value={viaje} maxLength={60} onChange={e => setViaje(e.target.value)} />}</Field>
        <Field label={esTracto ? 'Placa del tracto' : 'Placa del camión'}>{p => <Combobox {...p} options={opPlacas} value={placa} onChange={setPlaca} placeholder="Elige la unidad" loading={op.isLoading} enHoja tituloHoja="Elige la unidad" />}</Field>
        {esTracto && <Field label="Remolque" hint="Opcional.">{p => <Combobox {...p} options={opRemolques} value={remolque} onChange={setRemolque} placeholder="Elige el remolque" loading={op.isLoading} enHoja tituloHoja="Elige el remolque" />}</Field>}
        <Field label={plantilla && plantilla.choferes > 1 ? 'Conductor 1' : 'Conductor'}>{p => <Combobox {...p} options={opConductores} value={c1} onChange={setC1} placeholder="Elige el conductor" loading={op.isLoading} enHoja tituloHoja="Elige el conductor" />}</Field>
        {plantilla && plantilla.choferes > 1 && <Field label="Conductor 2">{p => <Combobox {...p} options={opConductores} value={c2} onChange={setC2} placeholder="Elige el segundo conductor" loading={op.isLoading} enHoja tituloHoja="Elige el conductor" />}</Field>}
        <Field label="Observaciones" hint="Opcional. Sale en la hoja.">{p => <textarea {...p} className="input" rows={2} maxLength={600} value={obs} onChange={e => setObs(e.target.value)} />}</Field>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
      </div>
    </Sheet>
  );
}

const PARADA_VACIA: Parada = { dia: 1, tipo: 'CONDUCCION', actividad: '', hora_inicio: '08:00', hora_fin: '09:00' };

/** Crear o editar una plantilla: datos del viaje y su itinerario de paradas */
export function PlantillaSheet({ abierta, plantilla, onClose }: { abierta: boolean; plantilla: PlantillaRuta | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ nombre: '', cliente: '', tipo_unidad: 'TRACTO' as 'TRACTO' | 'CAMION', choferes: 1, origen: '', destino: '', material: '', notas: '' });
  const [paradas, setParadas] = useState<Parada[]>([{ ...PARADA_VACIA }]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierta) return;
    setError(null);
    if (plantilla) {
      setF({ nombre: plantilla.nombre, cliente: plantilla.cliente, tipo_unidad: plantilla.tipo_unidad, choferes: plantilla.choferes, origen: plantilla.origen ?? '', destino: plantilla.destino ?? '', material: plantilla.material ?? '', notas: plantilla.notas ?? '' });
      setParadas(plantilla.paradas.map(p => ({ dia: p.dia, tipo: p.tipo, actividad: p.actividad, hora_inicio: p.hora_inicio, hora_fin: p.hora_fin })));
    } else {
      setF({ nombre: '', cliente: '', tipo_unidad: 'TRACTO', choferes: 2, origen: '', destino: '', material: '', notas: '' });
      setParadas([{ ...PARADA_VACIA }]);
    }
  }, [abierta, plantilla?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof f, v: string | number) => setF(prev => ({ ...prev, [k]: v }));
  const cambiar = (i: number, cambio: Partial<Parada>) => setParadas(ps => ps.map((p, k) => (k === i ? { ...p, ...cambio } : p)));
  const mover = (i: number, d: -1 | 1) => setParadas(ps => { const j = i + d; if (j < 0 || j >= ps.length) return ps; const c = [...ps]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const agregar = () => setParadas(ps => { const u = ps[ps.length - 1]; return [...ps, { ...PARADA_VACIA, dia: u?.dia ?? 1, hora_inicio: u?.hora_fin ?? '08:00', hora_fin: u?.hora_fin ?? '09:00' }]; });
  const valido = f.nombre.trim() && f.cliente.trim() && paradas.length > 0 && paradas.every(p => p.actividad.trim() && duracionMin(p.hora_inicio, p.hora_fin) != null);

  async function guardar() {
    setGuardando(true); setError(null);
    try {
      const body = { ...f, paradas };
      const r = plantilla
        ? await api<{ ok?: boolean; error?: string }>(`/operaciones/hojas-ruta/plantillas/${plantilla.id}`, { method: 'PUT', body })
        : await api<{ ok?: boolean; error?: string }>('/operaciones/hojas-ruta/plantillas', { method: 'POST', body });
      if (r.ok === false) throw new Error(r.error ?? 'No se pudo guardar');
      haptic('success');
      toast('Plantilla guardada');
      await qc.invalidateQueries({ queryKey: RAIZ });
      onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setGuardando(false); }
  }

  return (
    <Sheet open={abierta} onClose={onClose} title={plantilla ? 'Editar plantilla' : 'Nueva plantilla'} ancho
      footer={<><Button variant="secondary" onClick={onClose} disabled={guardando}>Cancelar</Button><Button variant="primary" onClick={guardar} loading={guardando} disabled={!valido}>Guardar</Button></>}>
      <div className="hr-hoja">
        <Field label="Nombre de la plantilla">{p => <TextInput {...p} value={f.nombre} maxLength={150} placeholder="Ej.: Bimbo · Callao - Arequipa · Tracto" onChange={e => set('nombre', e.target.value)} />}</Field>
        <Field label="Cliente">{p => <TextInput {...p} value={f.cliente} maxLength={150} onChange={e => set('cliente', e.target.value)} />}</Field>
        <div className="hr-hoja__fila">
          <Field label="Tipo de unidad">{() => <SegmentedControl label="Tipo de unidad" value={f.tipo_unidad} onChange={v => set('tipo_unidad', v)} options={[{ value: 'TRACTO', label: 'Tracto' }, { value: 'CAMION', label: 'Camión' }]} />}</Field>
          <Field label="Choferes">{() => <SegmentedControl label="Choferes" value={String(f.choferes)} onChange={v => set('choferes', Number(v))} options={[{ value: '1', label: '1 chofer' }, { value: '2', label: '2 choferes' }]} />}</Field>
        </div>
        <div className="hr-hoja__fila">
          <Field label="Origen">{p => <TextInput {...p} value={f.origen} maxLength={150} onChange={e => set('origen', e.target.value)} />}</Field>
          <Field label="Destino">{p => <TextInput {...p} value={f.destino} maxLength={150} onChange={e => set('destino', e.target.value)} />}</Field>
          <Field label="Material">{p => <TextInput {...p} value={f.material} maxLength={150} onChange={e => set('material', e.target.value)} />}</Field>
        </div>

        <h3 className="hr-hoja__titulo">Itinerario</h3>
        <p className="hr-hoja__nota">Cada parada va con su día y sus horas. Si la hora de fin es menor a la de inicio, termina al día siguiente. Al generar la hoja, todas las horas se corren según la llegada al cliente.</p>
        <div className="hr-paradas">
          {paradas.map((p, i) => (
            <div key={i} className="hr-parada">
              <span className="hr-parada__n">{i + 1}</span>
              <input className="hr-parada__dia input" type="number" min={1} max={9} aria-label={`Día de la parada ${i + 1}`} value={p.dia} onChange={e => cambiar(i, { dia: Number(e.target.value) || 1 })} />
              <SelectInput aria-label={`Tipo de la parada ${i + 1}`} value={p.tipo} onChange={e => cambiar(i, { tipo: e.target.value })}>
                {TIPOS_PARADA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </SelectInput>
              <TextInput aria-label={`Actividad de la parada ${i + 1}`} className="hr-parada__act" value={p.actividad} maxLength={250} placeholder="Ej.: Callao - Kio" onChange={e => cambiar(i, { actividad: e.target.value })} />
              <input className="input" type="time" aria-label={`Hora de inicio de la parada ${i + 1}`} value={p.hora_inicio} onChange={e => cambiar(i, { hora_inicio: e.target.value })} />
              <input className="input" type="time" aria-label={`Hora de fin de la parada ${i + 1}`} value={p.hora_fin} onChange={e => cambiar(i, { hora_fin: e.target.value })} />
              <span className="hr-parada__dur" title="Duración">{duracionTexto(duracionMin(p.hora_inicio, p.hora_fin))}</span>
              <span className="hr-parada__acc">
                <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}><ArrowUp size={14} /></button>
                <button type="button" aria-label="Bajar" disabled={i === paradas.length - 1} onClick={() => mover(i, 1)}><ArrowDown size={14} /></button>
                <button type="button" aria-label="Quitar" disabled={paradas.length === 1} onClick={() => setParadas(ps => ps.filter((_, k) => k !== i))}><Trash2 size={14} /></button>
              </span>
            </div>
          ))}
        </div>
        <div><Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={agregar}>Agregar parada</Button></div>

        <Field label="Notas de la hoja" hint="Texto fijo al pie de la hoja (manejo defensivo, velocidad, documentos…).">{p => <textarea {...p} className="input" rows={4} maxLength={3000} value={f.notas} onChange={e => set('notas', e.target.value)} />}</Field>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
      </div>
    </Sheet>
  );
}
