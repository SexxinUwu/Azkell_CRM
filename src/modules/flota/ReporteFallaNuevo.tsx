import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, CircleAlert, Plus, X } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, SelectInput, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { useAuth } from '../../core/auth/AuthProvider';
import { haptic } from '../../core/lib/haptics';
import { usePlacas } from '../placas/api';
import { Firma, type FirmaHandle } from '../inspecciones/Firma';

interface Sistema { key: string; title: string; items: Array<string | { id?: string; label?: string }> }
interface Config { ok: boolean; tracto: Sistema[]; remolque: Sistema[] }
interface Marca { obs: string }

const MAX_FOTOS = 5;
const nombre = (it: Sistema['items'][number]) => (typeof it === 'string' ? it : it.label || it.id || '');

/** Reduce la foto a 1280 px de lado mayor, JPEG al 80 %: el reporte viaja como JSON */
async function reducir(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } finally { URL.revokeObjectURL(url); }
}

// Registrar un reporte de fallas: unidad, sistemas con falla, fallas manuales, fotos y firma del conductor.
export function ReporteFallaNuevo({ open, onClose, onHecho }: { open: boolean; onClose: () => void; onHecho: () => Promise<unknown> }) {
  const toast = useToast();
  const { user } = useAuth();
  const placas = usePlacas();
  const firma = useRef<FirmaHandle>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [fallasT, setFallasT] = useState<Record<string, Marca>>({});
  const [fallasR, setFallasR] = useState<Record<string, Marca>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [critica, setCritica] = useState(false);
  const [fotos, setFotos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = useQuery<Config>({ queryKey: ['flota', 'config-sistemas'], enabled: open, queryFn: () => api<Config>('/mantenimiento/checklist/config-sistemas'), staleTime: 10 * 60_000 });

  useEffect(() => {
    if (!open) return;
    setError(null); setFallasT({}); setFallasR({}); setAbierto(null); setManual(''); setFotos([]); setCritica(false);
    setV({ placa_tracto: '', placa_remolque: '', orden_viaje: '', conductor: '', km_inicial: '', procedencia: '', ubicacion_gps: '' });
    firma.current?.limpiar();
  }, [open]);

  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));
  const tractos = (placas.data ?? []).filter(p => p.motora).map(p => p.placa);
  const remolques = (placas.data ?? []).filter(p => !p.motora).map(p => p.placa);
  const total = Object.keys(fallasT).length + Object.keys(fallasR).length + (manual.trim() ? 1 : 0);

  async function agregarFotos(files: FileList | null) {
    if (!files) return;
    const nuevas: string[] = [];
    for (const f of Array.from(files).slice(0, MAX_FOTOS - fotos.length)) {
      try { nuevas.push(await reducir(f)); } catch { /* imagen no válida */ }
    }
    setFotos(a => [...a, ...nuevas].slice(0, MAX_FOTOS));
  }

  async function guardar() {
    if (!v.placa_tracto.trim()) { setError('Indica la placa del tracto.'); return; }
    if (!v.conductor.trim()) { setError('Indica el conductor.'); return; }
    if (total === 0) { setError('Marca al menos una falla o escribe una falla manual.'); return; }
    const ahora = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const armar = (m: Record<string, Marca>) => Object.entries(m).map(([k, x]) => {
      const [sistema, ...resto] = k.split('||');
      return { sistema, item: resto.join('||'), obs: x.obs, observacion: x.obs, estado: 'FALLA', fecha: ahora };
    });
    const fT = armar(fallasT);
    if (manual.trim()) fT.push({ sistema: 'MANUAL', item: 'Falla manual', obs: manual.trim(), observacion: manual.trim(), estado: 'FALLA', fecha: ahora });
    setEnviando(true); setError(null);
    try {
      const r = await api<{ ok?: boolean; error?: string; folio?: string }>('/mantenimiento/checklist', {
        method: 'POST',
        body: {
          orden_viaje: v.orden_viaje.trim(), fecha_reporte: ahora, placa_tracto: v.placa_tracto.trim().toUpperCase(), placa_remolque: v.placa_remolque.trim().toUpperCase(),
          km_inicial: v.km_inicial, km_final: v.km_inicial, conductor: v.conductor.trim(), procedencia: v.procedencia, ubicacion_gps: v.ubicacion_gps,
          fallas_tracto: fT, fallas_remolque: armar(fallasR), fallas_libres_text: '', fotos_base64: fotos, falla_critica: critica,
          firma_conductor: firma.current && !firma.current.vacia() ? firma.current.obtener() : null, creado_por: user?.name ?? 'Sistema',
        },
      });
      if (r.ok === false) throw new Error(r.error || 'No se pudo guardar el reporte');
      haptic('success'); toast(`Reporte ${r.folio ?? ''} registrado`);
      await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const bloque = (titulo: string, sistemas: Sistema[], marcas: Record<string, Marca>, setMarcas: (f: (m: Record<string, Marca>) => Record<string, Marca>) => void, prefijo: string) => (
    <div>
      <p className="tarjeta__grupo-titulo">{titulo}</p>
      <div className="tarjeta__lista">
        {sistemas.map(s => {
          const idg = `${prefijo}-${s.key}`;
          const cuantas = s.items.filter(it => marcas[`${s.title}||${nombre(it)}`]).length;
          return (
            <div key={idg}>
              <button type="button" className="dato" style={{ flexDirection: 'row', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, alignItems: 'center' }}
                onClick={() => setAbierto(abierto === idg ? null : idg)}>
                <span className="dato__label" style={{ flex: 1, fontWeight: 600 }}>{s.title}</span>
                {cuantas > 0 && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--red-ink)' }}>{cuantas} con falla</span>}
              </button>
              {abierto === idg && s.items.map(it => {
                const k = `${s.title}||${nombre(it)}`;
                const m = marcas[k];
                return (
                  <div key={k} className="dato" style={{ gap: 'var(--s-1)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '0.875rem' }}>
                      <input type="checkbox" checked={!!m} onChange={e => setMarcas(a => { const n2 = { ...a }; if (e.target.checked) n2[k] = { obs: '' }; else delete n2[k]; return n2; })} />
                      <span style={{ color: m ? 'var(--red-ink)' : undefined, fontWeight: m ? 600 : 400 }}>{nombre(it)}</span>
                    </label>
                    {m && <TextInput value={m.obs} placeholder="Describe la falla (opcional)" onChange={e => setMarcas(a => ({ ...a, [k]: { obs: e.target.value } }))} />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title="Nuevo reporte de fallas"
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>Guardar reporte{total ? ` (${total})` : ''}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
        <datalist id="rf-tractos">{tractos.map(x => <option key={x} value={x} />)}</datalist>
        <datalist id="rf-remolques">{remolques.map(x => <option key={x} value={x} />)}</datalist>
        <div className="form-grid">
          <Field label="Tracto">{p => <TextInput {...p} list="rf-tractos" value={v.placa_tracto ?? ''} onChange={e => set('placa_tracto', e.target.value.toUpperCase())} />}</Field>
          <Field label="Remolque">{p => <TextInput {...p} list="rf-remolques" value={v.placa_remolque ?? ''} onChange={e => set('placa_remolque', e.target.value.toUpperCase())} />}</Field>
          <Field label="Conductor" wide>{p => <TextInput {...p} value={v.conductor ?? ''} onChange={e => set('conductor', e.target.value)} />}</Field>
          <Field label="Orden de viaje">{p => <TextInput {...p} value={v.orden_viaje ?? ''} onChange={e => set('orden_viaje', e.target.value)} />}</Field>
          <Field label="Kilometraje">{p => <TextInput {...p} inputMode="numeric" value={v.km_inicial ?? ''} onChange={e => set('km_inicial', e.target.value.replace(/\D/g, ''))} />}</Field>
          <Field label="Procedencia">{p => <TextInput {...p} value={v.procedencia ?? ''} onChange={e => set('procedencia', e.target.value)} />}</Field>
          <Field label="Ubicación">{p => <TextInput {...p} value={v.ubicacion_gps ?? ''} onChange={e => set('ubicacion_gps', e.target.value)} />}</Field>
        </div>

        {cfg.isLoading ? <p className="t-footnote c-secondary">Cargando sistemas…</p> : (
          <>
            {bloque('Fallas del tracto', cfg.data?.tracto ?? [], fallasT, setFallasT, 'T')}
            {v.placa_remolque && bloque('Fallas del remolque', cfg.data?.remolque ?? [], fallasR, setFallasR, 'R')}
          </>
        )}

        <Field label="Otra falla (texto libre)" wide>{p => <TextInput {...p} value={manual} onChange={e => setManual(e.target.value)} placeholder="Algo que no está en las listas" />}</Field>

        <div>
          <p className="tarjeta__grupo-titulo">Fotos ({fotos.length}/{MAX_FOTOS})</p>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            {fotos.map((f, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={f} alt={`Foto ${i + 1}`} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10 }} />
                <button type="button" aria-label="Quitar foto" onClick={() => setFotos(a => a.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', border: 0, background: 'var(--ink)', color: 'var(--label-inverse)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={12} /></button>
              </div>
            ))}
            {fotos.length < MAX_FOTOS && (
              <label style={{ width: 84, height: 84, borderRadius: 10, background: 'var(--fill)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--label-2)' }}>
                <span style={{ display: 'grid', placeItems: 'center', gap: 2, fontSize: '0.6875rem', fontWeight: 600 }}><Camera size={20} /><Plus size={10} /></span>
                <input type="file" accept="image/*" multiple hidden onChange={e => { agregarFotos(e.target.files); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </div>

        <div>
          <p className="tarjeta__grupo-titulo">Firma del conductor</p>
          <Firma ref={firma} />
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-3)', padding: 'var(--s-3)', borderRadius: 'var(--r-lg)', cursor: 'pointer', background: critica ? 'var(--red-tint)' : 'var(--fill-subtle)' }}>
          <input type="checkbox" checked={critica} onChange={e => setCritica(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            <b style={{ color: critica ? 'var(--red-ink)' : 'var(--label)' }}>Falla crítica</b>
            <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--label-2)' }}>La unidad no puede salir. Pasa a mantenimiento y se abre un ítem en el backlog.</span>
          </span>
        </label>
        <Field label="Estado inicial">{p => <SelectInput {...p} disabled value="Pendiente"><option>Pendiente</option></SelectInput>}</Field>
      </div>
    </Sheet>
  );
}
