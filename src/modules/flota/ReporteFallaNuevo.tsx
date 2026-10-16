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
import { useConfigSistemas, type ReporteFalla } from './api';
import { leerFallas, textoItem, type FallaGuardada, type SistemaCfg } from './fman';

interface Marca { obs: string }
interface Backlog { id: number | string; backlog_id?: string | null; tarea?: string | null; tema?: string | null; ticket_ot?: string | null }

const MAX_FOTOS = 5;

/** Reduce la foto a 1280 px de lado mayor, JPEG al 80 %: el reporte viaja como JSON.
 *  createImageBitmap decodifica fuera del hilo principal, así una foto de 12 MP no congela la pantalla. */
async function reducir(file: File): Promise<string> {
  let fuente: ImageBitmap | HTMLImageElement;
  let url: string | null = null;
  if ('createImageBitmap' in window) {
    fuente = await createImageBitmap(file);
  } else {
    url = URL.createObjectURL(file);
    fuente = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url!; });
  }
  try {
    const k = Math.min(1, 1280 / Math.max(fuente.width, fuente.height));
    const c = document.createElement('canvas');
    c.width = Math.round(fuente.width * k); c.height = Math.round(fuente.height * k);
    c.getContext('2d')!.drawImage(fuente, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } finally {
    if (fuente instanceof ImageBitmap) fuente.close();
    if (url) URL.revokeObjectURL(url);
  }
}

/** Marcas de un reporte guardado. Lo que viene de backlog y lo de otra versión se conserva tal cual. */
function marcasDe(lista: FallaGuardada[]) {
  const marcas: Record<string, Marca> = {};
  const conservar: FallaGuardada[] = [];
  let manual = '';
  for (const f of lista) {
    if (f.backlog_id) { conservar.push(f); continue; }
    if (f.sistema === 'MANUAL') { manual ||= String(f.obs ?? f.observacion ?? ''); continue; }
    const obs = String(f.obs ?? '');
    marcas[`${f.sistema ?? ''}||${f.item ?? ''}`] = { obs: obs === String(f.item ?? '') ? '' : obs };
  }
  return { marcas, conservar, manual };
}

// Registrar o editar un reporte de fallas: unidad, sistemas con falla, backlog pendiente, fotos y firma del conductor.
export function ReporteFallaNuevo({ open, reporte = null, onClose, onHecho }: {
  open: boolean; reporte?: ReporteFalla | null; onClose: () => void; onHecho: () => Promise<unknown>;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const placas = usePlacas();
  const firma = useRef<FirmaHandle>(null);
  const editando = !!reporte;
  const [v, setV] = useState<Record<string, string>>({});
  const [fallasT, setFallasT] = useState<Record<string, Marca>>({});
  const [fallasR, setFallasR] = useState<Record<string, Marca>>({});
  const [conservarT, setConservarT] = useState<FallaGuardada[]>([]);
  const [conservarR, setConservarR] = useState<FallaGuardada[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [critica, setCritica] = useState(false);
  const [fotos, setFotos] = useState<string[]>([]);
  const [backlogSel, setBacklogSel] = useState<Record<string, true>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = useConfigSistemas(open);
  const placaT = (v.placa_tracto ?? '').trim().toUpperCase();
  // Backlog pendiente de la unidad: se importa al reporte marcando lo que aplica
  const backlogs = useQuery<Backlog[]>({
    queryKey: ['flota', 'backlog', placaT], enabled: open && placaT.length >= 5,
    queryFn: () => api<Backlog[]>(`/taller/ot-backlog?placa=${encodeURIComponent(placaT)}&estado=Pendiente`),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    setError(null); setAbierto(null); setCritica(false); setFotos([]); setBacklogSel({});
    firma.current?.limpiar();
    if (reporte) {
      const t = marcasDe(leerFallas(reporte.fallas_tracto_json));
      const r = marcasDe(leerFallas(reporte.fallas_remolque_json));
      setFallasT(t.marcas); setConservarT(t.conservar);
      setFallasR(r.marcas); setConservarR(r.conservar);
      setManual(t.manual || r.manual);
      setV({
        placa_tracto: reporte.placa_tracto ?? '', placa_remolque: reporte.placa_remolque ?? '', orden_viaje: reporte.orden_viaje ?? '',
        conductor: reporte.conductor ?? '', km_inicial: reporte.km_inicial != null ? String(reporte.km_inicial) : '',
        procedencia: reporte.procedencia ?? '', ubicacion_gps: reporte.ubicacion_gps ?? '',
      });
    } else {
      setFallasT({}); setFallasR({}); setConservarT([]); setConservarR([]); setManual('');
      setV({ placa_tracto: '', placa_remolque: '', orden_viaje: '', conductor: '', km_inicial: '', procedencia: '', ubicacion_gps: '' });
    }
  }, [open, reporte]);

  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));
  const tractos = (placas.data ?? []).filter(p => p.motora).map(p => p.placa);
  const remolques = (placas.data ?? []).filter(p => !p.motora).map(p => p.placa);
  const seleccionados = (backlogs.data ?? []).filter(b => backlogSel[String(b.id)]);
  const total = Object.keys(fallasT).length + Object.keys(fallasR).length + (manual.trim() ? 1 : 0)
    + conservarT.length + conservarR.length + seleccionados.length;

  async function agregarFotos(files: FileList | null) {
    if (!files) return;
    // Varias fotos a la vez: se reducen en paralelo; una imagen no válida se omite
    const lote = Array.from(files).slice(0, MAX_FOTOS - fotos.length);
    const nuevas = await Promise.all(lote.map(f => reducir(f).catch(() => null)));
    setFotos(a => [...a, ...nuevas.filter((x): x is string => x !== null)].slice(0, MAX_FOTOS));
  }

  async function guardar() {
    if (!v.placa_tracto.trim()) { setError('Indica la placa del tracto.'); return; }
    if (!v.conductor.trim()) { setError('Indica el conductor.'); return; }
    if (total === 0) { setError('Marca al menos una falla, importa un backlog o escribe una falla manual.'); return; }
    const ahora = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const armar = (m: Record<string, Marca>) => Object.entries(m).map(([k, x]) => {
      const [sistema, ...resto] = k.split('||');
      return { sistema, item: resto.join('||'), obs: x.obs, observacion: x.obs, estado: 'FALLA', fecha: ahora };
    });
    const importados: FallaGuardada[] = seleccionados.map(b => ({
      sistema: 'MANUAL', item: `Backlog (${b.backlog_id || b.id})`, obs: b.tarea || b.tema || '', observacion: b.tarea || b.tema || '',
      estado: 'FALLA', fecha: ahora, backlog_id: String(b.backlog_id || b.id),
    }));
    const fT: FallaGuardada[] = [...armar(fallasT), ...conservarT, ...importados];
    if (manual.trim()) fT.push({ sistema: 'MANUAL', item: 'Falla manual', obs: manual.trim(), observacion: manual.trim(), estado: 'FALLA', fecha: ahora });
    const fR = [...armar(fallasR), ...conservarR];
    const firmaNueva = firma.current && !firma.current.vacia() ? firma.current.obtener() : null;
    setEnviando(true); setError(null);
    try {
      if (editando) {
        const r = await api<{ ok?: boolean; error?: string }>(`/mantenimiento/checklist/${reporte!.id}`, {
          method: 'PUT',
          body: {
            orden_viaje: v.orden_viaje.trim(), placa_tracto: placaT, placa_remolque: v.placa_remolque.trim().toUpperCase(),
            km_inicial: v.km_inicial, km_final: v.km_inicial, conductor: v.conductor.trim(), procedencia: v.procedencia, ubicacion_gps: v.ubicacion_gps,
            fallas_tracto: fT, fallas_remolque: fR, fallas_libres_text: '', fotos_base64: fotos, firma_conductor: firmaNueva,
          },
        });
        if (r.ok === false) throw new Error(r.error || 'No se pudo guardar los cambios');
        haptic('success'); toast(`Reporte ${reporte!.folio} actualizado`);
      } else {
        const r = await api<{ ok?: boolean; error?: string; folio?: string }>('/mantenimiento/checklist', {
          method: 'POST',
          body: {
            orden_viaje: v.orden_viaje.trim(), fecha_reporte: ahora, placa_tracto: placaT, placa_remolque: v.placa_remolque.trim().toUpperCase(),
            km_inicial: v.km_inicial, km_final: v.km_inicial, conductor: v.conductor.trim(), procedencia: v.procedencia, ubicacion_gps: v.ubicacion_gps,
            fallas_tracto: fT, fallas_remolque: fR, fallas_libres_text: '', fotos_base64: fotos, falla_critica: critica,
            firma_conductor: firmaNueva, creado_por: user?.name ?? 'Sistema',
          },
        });
        if (r.ok === false) throw new Error(r.error || 'No se pudo guardar el reporte');
        haptic('success'); toast(`Reporte ${r.folio ?? ''} registrado`);
      }
      await onHecho(); onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  const bloque = (titulo: string, sistemas: SistemaCfg[], marcas: Record<string, Marca>, setMarcas: (f: (m: Record<string, Marca>) => Record<string, Marca>) => void, prefijo: string) => (
    <div>
      <p className="tarjeta__grupo-titulo">{titulo}</p>
      <div className="tarjeta__lista">
        {sistemas.map(s => {
          const idg = `${prefijo}-${s.key}`;
          const cuantas = s.items.filter(it => marcas[`${s.title}||${textoItem(it)}`]).length;
          return (
            <div key={idg}>
              <button type="button" className="dato" style={{ flexDirection: 'row', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, alignItems: 'center' }}
                onClick={() => setAbierto(abierto === idg ? null : idg)}>
                <span className="dato__label" style={{ flex: 1, fontWeight: 600 }}>{s.title}</span>
                {cuantas > 0 && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--red-ink)' }}>{cuantas} con falla</span>}
              </button>
              {abierto === idg && s.items.map(it => {
                const nombreItem = textoItem(it);
                const k = `${s.title}||${nombreItem}`;
                const m = marcas[k];
                return (
                  <div key={k} className="dato" style={{ gap: 'var(--s-1)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', minHeight: 44, fontSize: '0.875rem', cursor: 'pointer' }}>
                      <input type="checkbox" style={{ width: 22, height: 22, flexShrink: 0 }} checked={!!m} onChange={e => setMarcas(a => { const n2 = { ...a }; if (e.target.checked) n2[k] = { obs: '' }; else delete n2[k]; return n2; })} />
                      <span style={{ color: m ? 'var(--red-ink)' : undefined, fontWeight: m ? 600 : 400 }}>{nombreItem}</span>
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

  const pendientes = backlogs.data ?? [];

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={editando ? `Editar reporte ${reporte!.folio}` : 'Nuevo reporte de fallas'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={guardar} loading={enviando}>{editando ? 'Guardar cambios' : 'Guardar reporte'}{total ? ` (${total})` : ''}</Button></>}>
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

        {pendientes.length > 0 && (
          <div>
            <p className="tarjeta__grupo-titulo">Backlog pendiente de la unidad ({pendientes.length})</p>
            <div className="tarjeta__lista">
              {pendientes.map(b => (
                <label key={String(b.id)} className="dato" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--s-2)', minHeight: 44, cursor: 'pointer' }}>
                  <input type="checkbox" style={{ width: 22, height: 22, flexShrink: 0 }} checked={!!backlogSel[String(b.id)]}
                    onChange={e => setBacklogSel(a => { const n2 = { ...a }; if (e.target.checked) n2[String(b.id)] = true; else delete n2[String(b.id)]; return n2; })} />
                  <span className="dato__valor" style={{ flex: 1, fontSize: '0.875rem' }}>
                    {b.tarea || b.tema || 'Sin descripción'}
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--label-2)' }}>{b.backlog_id || `Backlog ${b.id}`}{b.ticket_ot ? ` · ${b.ticket_ot}` : ''}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {cfg.isLoading ? <p className="t-footnote c-secondary">Cargando sistemas…</p> : cfg.isError ? <Notice tone="error">No se pudo cargar la configuración de sistemas.</Notice> : (
          <>
            {bloque('Fallas del tracto', cfg.data?.tracto ?? [], fallasT, setFallasT, 'T')}
            {v.placa_remolque && bloque('Fallas del remolque', cfg.data?.remolque ?? [], fallasR, setFallasR, 'R')}
          </>
        )}

        <Field label="Otra falla (texto libre)" wide>{p => <TextInput {...p} value={manual} onChange={e => setManual(e.target.value)} placeholder="Algo que no está en las listas" />}</Field>

        <div>
          <p className="tarjeta__grupo-titulo">Fotos ({fotos.length}/{MAX_FOTOS}){editando ? ' · las anteriores se conservan' : ''}</p>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            {fotos.map((f, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={f} alt={`Foto ${i + 1}`} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10 }} />
                <button type="button" aria-label="Quitar foto" onClick={() => setFotos(a => a.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: -12, right: -12, width: 44, height: 44, border: 0, padding: 0, background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--ink)', color: 'var(--label-inverse)', display: 'grid', placeItems: 'center' }}><X size={12} /></span>
                </button>
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
          <p className="tarjeta__grupo-titulo">Firma del conductor{editando && reporte?.firma_conductor ? ' · dibuja una nueva para reemplazarla' : ''}</p>
          <Firma ref={firma} />
        </div>
        {!editando && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-3)', minHeight: 44, padding: 'var(--s-3)', borderRadius: 'var(--r-lg)', cursor: 'pointer', background: critica ? 'var(--red-tint)' : 'var(--fill-subtle)' }}>
            <input type="checkbox" checked={critica} onChange={e => setCritica(e.target.checked)} style={{ width: 22, height: 22, flexShrink: 0, marginTop: 2 }} />
            <span>
              <b style={{ color: critica ? 'var(--red-ink)' : 'var(--label)' }}>Falla crítica</b>
              <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--label-2)' }}>La unidad no puede salir. Pasa a mantenimiento y se abre un ítem en el backlog.</span>
            </span>
          </label>
        )}
        {!editando && <Field label="Estado inicial">{p => <SelectInput {...p} disabled value="Pendiente"><option>Pendiente</option></SelectInput>}</Field>}
      </div>
    </Sheet>
  );
}
