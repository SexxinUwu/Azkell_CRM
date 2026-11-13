import './plantilla-guias.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Switch } from '../../core/ui/Switch';
import { useToast } from '../../core/ui/Toast';
import { api, apiFetch, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';

/** Plantilla del PDF de las guías de remisión (misma forma que services/gre_pdf.js) */
interface Plantilla {
  version: number; logo_url: string; acento: string;
  nombre_comercial: string; direccion: string; telefono: string; correo: string; web: string;
  bloques: Record<string, boolean>; columnas: Record<string, boolean>;
  pie: string; notas: string;
}

const BLOQUES: Array<[string, string, string]> = [
  ['estado', 'Estado de SUNAT', 'Sello «Aceptada por SUNAT» o «Pendiente de validación»'],
  ['cliente', 'Cliente', 'Nombre del cliente en la tarjeta de fechas'],
  ['ruta', 'Puntos de partida y llegada', 'Con dirección y ubigeo'],
  ['partes', 'Remitente y destinatario', ''],
  ['vehiculos', 'Vehículos', 'Placas del tracto y la carreta'],
  ['conductor', 'Conductor', 'Nombre y documento'],
  ['relacionados', 'Documentos relacionados', 'Guías de remisión del cliente en las que se basa'],
  ['observaciones', 'Observaciones', 'El texto de «Notas» de más abajo'],
  ['qr', 'Código QR de SUNAT', 'Aparece cuando SUNAT acepta la guía'],
];
const COLUMNAS: Array<[string, string, string]> = [
  ['unidad', 'Unidad de cada ítem', 'Kilogramos, fardos, unidades…'],
  ['peso_linea', 'Peso por línea', 'Útil cuando los ítems van en kilos'],
  ['placa_carreta', 'Placa de la carreta', ''],
  ['tuc', 'TUC y autorización del vehículo', 'Si el vehículo los tiene registrados'],
  ['licencia', 'Licencia del conductor', ''],
  ['viaje', 'Número de viaje', 'Referencia interna'],
  ['servicio', 'Número de servicio', 'Referencia interna'],
];
const COLORES = ['#0071e3', '#0a7d4b', '#1d1d1f', '#c4161c', '#6f42c1', '#e07b00'];

function Fila({ titulo, nota, valor, onChange }: { titulo: string; nota?: string; valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="pg__fila">
      <div><div className="pg__fila-t">{titulo}</div>{nota && <div className="pg__fila-n">{nota}</div>}</div>
      <Switch label={titulo} checked={valor} onChange={onChange} />
    </div>
  );
}

// Sistema › Plantilla de guías: cómo se ve el PDF de las guías de esta empresa. Formulario a la izquierda, vista previa a la derecha.
export function PlantillaGuiasPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['operaciones', 'plantilla-guias'],
    queryFn: () => api<{ plantilla: Plantilla; defecto: Plantilla }>('/operaciones/gre/pdf-plantilla'),
  });
  const [p, setP] = useState<Plantilla | null>(null);
  const [guardada, setGuardada] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [vista, setVista] = useState<string | null>(null);
  const [cargandoVista, setCargandoVista] = useState(false);
  const [errorVista, setErrorVista] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.data && !p) { setP(q.data.plantilla); setGuardada(JSON.stringify(q.data.plantilla)); }
  }, [q.data, p]);

  const set = (parte: Partial<Plantilla>) => setP(prev => (prev ? { ...prev, ...parte } : prev));
  const setBloque = (k: string, v: boolean) => setP(prev => (prev ? { ...prev, bloques: { ...prev.bloques, [k]: v } } : prev));
  const setColumna = (k: string, v: boolean) => setP(prev => (prev ? { ...prev, columnas: { ...prev.columnas, [k]: v } } : prev));
  const cambios = useMemo(() => !!p && JSON.stringify(p) !== guardada, [p, guardada]);

  // Vista previa en vivo: espera un momento a que termines de escribir y pide el PDF de ejemplo con la plantilla actual
  const clave = useMemo(() => (p ? JSON.stringify(p) : ''), [p]);
  useEffect(() => {
    if (!clave) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setCargandoVista(true); setErrorVista(null);
      try {
        const res = await apiFetch('/operaciones/gre/pdf-plantilla/preview', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plantilla: JSON.parse(clave) }), signal: ctl.signal,
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'No se pudo generar la vista previa');
        const url = URL.createObjectURL(await res.blob());
        setVista(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      } catch (err) {
        if (!ctl.signal.aborted) setErrorVista(errorMessage(err));
      } finally { if (!ctl.signal.aborted) setCargandoVista(false); }
    }, 700);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [clave]);
  useEffect(() => () => { setVista(prev => { if (prev) URL.revokeObjectURL(prev); return null; }); }, []);

  async function guardar() {
    if (!p) return;
    setGuardando(true);
    try {
      await api('/operaciones/gre/pdf-plantilla', { method: 'PUT', body: { plantilla: p } });
      setGuardada(JSON.stringify(p));
      await qc.invalidateQueries({ queryKey: ['operaciones', 'plantilla-guias'] });
      haptic('success'); toast('Plantilla guardada');
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setGuardando(false); }
  }

  async function subirLogo(archivo: File) {
    setSubiendo(true);
    try {
      const form = new FormData();
      form.append('logo', archivo);
      const r = await api<{ ok?: boolean; error?: string; url?: string }>('/operaciones/gre/pdf-plantilla/logo', { method: 'POST', body: form });
      if (r.ok === false || !r.url) throw new Error(r.error || 'No se pudo subir el logo');
      set({ logo_url: r.url });
      haptic('success');
    } catch (err) { toast(errorMessage(err), 'error'); haptic('warning'); }
    finally { setSubiendo(false); }
  }

  const restablecer = () => { if (q.data) { setP(q.data.defecto); haptic('selection'); } };

  return (
    <Page wide>
      <PageHeader
        eyebrow="Operaciones"
        title="Plantilla de guías"
        subtitle="Cómo se ve el PDF de las guías de remisión de esta empresa"
        actions={(
          <>
            <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={restablecer} disabled={!p}>Valores por defecto</Button>
            <Button variant="primary" icon={<Save size={16} />} onClick={guardar} loading={guardando} disabled={!cambios}>Guardar</Button>
          </>
        )}
      />
      {q.isLoading || !p ? (q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : <PageLoader />) : (
        <div className="pg">
          <div className="pg__form">
            <section className="pg__card">
              <h2 className="pg__t">Marca</h2>
              <div className="pg__logo">
                <div className="pg__logo-caja">{p.logo_url ? 'Logo cargado' : 'Sin logo'}</div>
                <div className="pg__logo-acc">
                  <Button variant="secondary" size="sm" icon={<ImagePlus size={15} />} onClick={() => entrada.current?.click()} loading={subiendo}>{p.logo_url ? 'Cambiar' : 'Subir logo'}</Button>
                  {p.logo_url && <Button variant="plain" size="sm" icon={<Trash2 size={15} />} onClick={() => set({ logo_url: '' })}>Quitar</Button>}
                </div>
                <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const a = e.target.files?.[0]; e.target.value = ''; if (a) void subirLogo(a); }} />
              </div>
              <Field label="Nombre comercial" hint="Si lo dejas vacío se usa la razón social">{f => <TextInput {...f} value={p.nombre_comercial} onChange={e => set({ nombre_comercial: e.target.value })} />}</Field>
              <Field label="Dirección">{f => <TextInput {...f} value={p.direccion} onChange={e => set({ direccion: e.target.value })} />}</Field>
              <div className="pg__2">
                <Field label="Teléfono">{f => <TextInput {...f} value={p.telefono} onChange={e => set({ telefono: e.target.value })} />}</Field>
                <Field label="Correo">{f => <TextInput {...f} value={p.correo} onChange={e => set({ correo: e.target.value })} />}</Field>
              </div>
              <Field label="Web">{f => <TextInput {...f} value={p.web} onChange={e => set({ web: e.target.value })} />}</Field>
              <div className="pg__acento">
                <span className="pg__et">Color</span>
                <div className="pg__colores">
                  {COLORES.map(c => (
                    <button key={c} type="button" className={`pg__color${p.acento === c ? ' is-on' : ''}`} style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={p.acento === c} onClick={() => set({ acento: c })} />
                  ))}
                  <input type="color" className="pg__color-libre" value={p.acento} onChange={e => set({ acento: e.target.value })} aria-label="Otro color" />
                </div>
              </div>
            </section>

            <section className="pg__card">
              <h2 className="pg__t">Qué se muestra</h2>
              {BLOQUES.map(([k, t, n]) => <Fila key={k} titulo={t} nota={n} valor={!!p.bloques[k]} onChange={v => setBloque(k, v)} />)}
            </section>

            <section className="pg__card">
              <h2 className="pg__t">Columnas y datos extra</h2>
              {COLUMNAS.map(([k, t, n]) => <Fila key={k} titulo={t} nota={n} valor={!!p.columnas[k]} onChange={v => setColumna(k, v)} />)}
            </section>

            <section className="pg__card">
              <h2 className="pg__t">Textos</h2>
              <Field label="Observaciones (se imprimen en todas las guías)">{f => <textarea {...f} className="input pg__area" rows={3} maxLength={600} value={p.notas} onChange={e => set({ notas: e.target.value })} />}</Field>
              <Field label="Pie de página">{f => <TextInput {...f} maxLength={300} value={p.pie} onChange={e => set({ pie: e.target.value })} />}</Field>
              <Notice tone="accent">La guía siempre lleva los datos que exige SUNAT, la leyenda «Representación impresa de la Guía de Remisión Electrónica» y, cuando está aceptada, su QR.</Notice>
            </section>
          </div>

          <aside className="pg__vista" aria-label="Vista previa">
            <div className="pg__vista-cab">
              <span>Vista previa</span>
              <span className="pg__vista-est">{cargandoVista ? 'Actualizando…' : 'Datos de ejemplo'}</span>
            </div>
            <div className="pg__vista-marco">
              {errorVista ? <div className="pg__vista-vacia"><Notice tone="error">{errorVista}</Notice></div>
                : vista ? <iframe title="Vista previa del PDF" src={`${vista}#toolbar=0&navpanes=0&view=FitH`} className={cargandoVista ? 'is-cargando' : ''} />
                  : <div className="pg__vista-vacia">Generando…</div>}
            </div>
          </aside>
        </div>
      )}
    </Page>
  );
}
