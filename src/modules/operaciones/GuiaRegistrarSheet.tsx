import './servicios.css';
import './seguimiento.css';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, FileText, PenLine, Sparkles, UploadCloud } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { Combobox } from '../../core/ui/Combobox';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { useOpcionesUbigeo } from './ubigeos';
import type { Guia, LecturaGuia, TipoGuia } from './guiasApi';

interface Form {
  tipo: TipoGuia; serie_numero: string; fecha_emision: string; fecha_traslado: string;
  remitente_ruc: string; remitente_nombre: string; destinatario_doc: string; destinatario_nombre: string;
  transportista_ruc: string; transportista_nombre: string; modalidad: '' | 'PUBLICO' | 'PRIVADO'; motivo: string;
  partida_ubigeo: string; partida_direccion: string; llegada_ubigeo: string; llegada_direccion: string;
  peso: string; bultos: string; descripcion: string; placa: string; conductor_nombre: string; conductor_doc: string; licencia: string;
  fuente: 'XML' | 'IA' | 'MANUAL'; items: LecturaGuia['items']; trae_transporte: boolean;
}
type Campo = 'serie_numero' | 'emisor' | 'peso';

const VACIO: Form = {
  tipo: 'REMITENTE', serie_numero: '', fecha_emision: '', fecha_traslado: '', remitente_ruc: '', remitente_nombre: '', destinatario_doc: '', destinatario_nombre: '',
  transportista_ruc: '', transportista_nombre: '', modalidad: '', motivo: '', partida_ubigeo: '', partida_direccion: '', llegada_ubigeo: '', llegada_direccion: '',
  peso: '', bultos: '', descripcion: '', placa: '', conductor_nombre: '', conductor_doc: '', licencia: '', fuente: 'MANUAL', items: [], trae_transporte: false,
};
const s = (v: unknown) => (v == null ? '' : String(v));
const desdeLectura = (l: LecturaGuia): Form => ({
  tipo: l.tipo ?? 'REMITENTE', serie_numero: s(l.numero_completo), fecha_emision: s(l.fecha_emision), fecha_traslado: s(l.fecha_traslado),
  remitente_ruc: s(l.remitente_ruc), remitente_nombre: s(l.remitente_nombre), destinatario_doc: s(l.destinatario_doc), destinatario_nombre: s(l.destinatario_nombre),
  transportista_ruc: s(l.transportista_ruc), transportista_nombre: s(l.transportista_nombre), modalidad: l.modalidad ?? '', motivo: s(l.motivo),
  partida_ubigeo: s(l.partida_ubigeo), partida_direccion: s(l.partida_direccion), llegada_ubigeo: s(l.llegada_ubigeo), llegada_direccion: s(l.llegada_direccion),
  peso: l.peso_kg != null ? String(l.peso_kg) : '', bultos: s(l.bultos), descripcion: s(l.descripcion), placa: s(l.placa),
  conductor_nombre: s(l.conductor_nombre), conductor_doc: s(l.conductor_doc), licencia: s(l.licencia), fuente: l.fuente, items: l.items ?? [], trae_transporte: l.trae_transporte,
});

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section className="os-seccion">
      <h3 className="os-seccion__titulo">{titulo}</h3>
      {nota && <p className="os-nota">{nota}</p>}
      <div className="os-seccion__cuerpo">{children}</div>
    </section>
  );
}

/** Registrar una guía que entrega el cliente: se sube el XML, la foto o el PDF, se leen los datos y la persona los confirma. */
export function GuiaRegistrarSheet({ open, onClose, onRegistrada }: { open: boolean; onClose: () => void; onRegistrada: (guia?: Guia) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const ubi = useOpcionesUbigeo();
  const entrada = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<'subir' | 'leyendo' | 'revisar'>('subir');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [f, setF] = useState<Form>(VACIO);
  const [advertencias, setAdvertencias] = useState<string[]>([]);
  const [duplicada, setDuplicada] = useState(false);
  const [tocados, setTocados] = useState<Set<Campo>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [guardando, setGuardando] = useState<'solo' | 'vincular' | null>(null);

  useEffect(() => {
    if (open) { setFase('subir'); setArchivo(null); setF(VACIO); setAdvertencias([]); setDuplicada(false); setTocados(new Set()); setError(null); setArrastrando(false); }
  }, [open]);

  const set = (p: Partial<Form>) => setF(x => ({ ...x, ...p }));
  const tocar = (c: Campo) => setTocados(x => new Set(x).add(c));
  const emisor = f.tipo === 'TRANSPORTISTA' ? f.transportista_ruc : f.remitente_ruc;
  const errores: Partial<Record<Campo, string>> = {};
  if (!/^[A-Za-z0-9]{3,4}-\d{1,8}$/.test(f.serie_numero.trim())) errores.serie_numero = 'Escribe la serie y el número, por ejemplo T001-00000123.';
  if (!/^\d{11}$/.test(emisor.trim())) errores.emisor = f.tipo === 'TRANSPORTISTA' ? 'Indica el RUC (11 dígitos) del transportista que emitió la guía.' : 'Indica el RUC (11 dígitos) del remitente que emitió la guía.';
  if (!(Number(f.peso.replace(',', '.')) > 0)) errores.peso = 'Indica el peso bruto total en kilos.';
  const ver = (c: Campo) => (tocados.has(c) ? errores[c] ?? null : null);

  async function leer(archivoElegido: File) {
    setArchivo(archivoElegido); setError(null); setFase('leyendo');
    try {
      const form = new FormData();
      form.append('archivo', archivoElegido);
      const r = await api<{ ok: boolean; datos: LecturaGuia; duplicada: { id: number } | null }>('/operaciones/gre/leer', { method: 'POST', body: form });
      setF(desdeLectura(r.datos)); setAdvertencias(r.datos.advertencias ?? []); setDuplicada(!!r.duplicada); haptic('success');
      setFase('revisar');
    } catch (err) { setError(errorMessage(err)); setFase('subir'); haptic('warning'); }
  }

  const soltar = (e: DragEvent) => { e.preventDefault(); setArrastrando(false); const a = e.dataTransfer.files?.[0]; if (a) void leer(a); };

  async function guardar(vincular: boolean) {
    setTocados(new Set(['serie_numero', 'emisor', 'peso']));
    if (Object.keys(errores).length) { haptic('warning'); return; }
    setError(null); setGuardando(vincular ? 'vincular' : 'solo');
    try {
      const cuerpo = new FormData();
      cuerpo.append('datos', JSON.stringify({
        origen: 'RECIBIDA', tipo: f.tipo, numero_completo: f.serie_numero.trim().toUpperCase(), fecha_emision: f.fecha_emision || null, fecha_traslado: f.fecha_traslado || null,
        remitente_ruc: f.remitente_ruc, remitente_nombre: f.remitente_nombre, destinatario_doc: f.destinatario_doc, destinatario_nombre: f.destinatario_nombre,
        transportista_ruc: f.transportista_ruc, transportista_nombre: f.transportista_nombre, modalidad: f.modalidad || null, motivo: f.motivo,
        partida_ubigeo: f.partida_ubigeo, partida_direccion: f.partida_direccion, llegada_ubigeo: f.llegada_ubigeo, llegada_direccion: f.llegada_direccion,
        peso_kg: Number(f.peso.replace(',', '.')), bultos: f.bultos ? Number(f.bultos) : null, descripcion: f.descripcion, items: f.items,
        placa: f.placa, conductor_nombre: f.conductor_nombre, conductor_doc: f.conductor_doc, licencia: f.licencia, trae_transporte: f.trae_transporte, fuente: f.fuente,
      }));
      if (archivo) cuerpo.append('archivo', archivo);
      const r = await api<{ ok?: boolean; error?: string; id?: number; message?: string }>('/operaciones/gre/guias', { method: 'POST', body: cuerpo });
      if (r.ok === false) throw new Error(r.error || 'No se pudo registrar la guía');
      haptic('success'); toast(r.message || 'Guía registrada');
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
      if (vincular && r.id) {
        const d = await api<{ data: Guia }>(`/operaciones/gre/guias/${r.id}`);
        onRegistrada(d.data);
      } else onRegistrada(undefined);
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setGuardando(null); }
  }

  const ocupado = guardando !== null;
  return (
    <Sheet ancho open={open} onClose={() => !ocupado && fase !== 'leyendo' && onClose()} title="Registrar guía"
      footer={fase === 'revisar' ? (
        <>
          <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => setFase('subir')} disabled={ocupado}>Otro archivo</Button>
          <Button variant="secondary" onClick={() => guardar(false)} loading={guardando === 'solo'} disabled={ocupado}>Registrar</Button>
          <Button variant="primary" onClick={() => guardar(true)} loading={guardando === 'vincular'} disabled={ocupado}>Registrar y vincular a un servicio</Button>
        </>
      ) : <Button variant="secondary" onClick={onClose} disabled={fase === 'leyendo'}>Cancelar</Button>}>
      <div className="gr">
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}

        {fase === 'subir' && (
          <>
            <div className={`gr__zona${arrastrando ? ' gr__zona--on' : ''}`} onDragOver={e => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)} onDrop={soltar}
              role="button" tabIndex={0} onClick={() => entrada.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.current?.click(); } }}>
              <span className="gr__icono" aria-hidden><UploadCloud size={28} /></span>
              <strong>Sube la guía que te dio el cliente</strong>
              <span>Arrástrala aquí o toca para elegirla. Foto, PDF o XML.</span>
              <input ref={entrada} type="file" hidden accept="image/*,application/pdf,.pdf,.xml,text/xml,application/xml"
                onChange={e => { const a = e.target.files?.[0]; e.target.value = ''; if (a) void leer(a); }} />
            </div>
            <ul className="gr__ayuda">
              <li><FileText size={16} aria-hidden /><span><b>XML:</b> se lee exacto, sin errores.</span></li>
              <li><Sparkles size={16} aria-hidden /><span><b>Foto o PDF:</b> la IA propone los datos y tú los confirmas antes de guardar.</span></li>
            </ul>
            <Button variant="plain" icon={<PenLine size={16} />} onClick={() => { setF(VACIO); setAdvertencias([]); setFase('revisar'); }}>Prefiero llenarla a mano</Button>
          </>
        )}

        {fase === 'leyendo' && (
          <div className="gr__leyendo">
            <PageLoader />
            <strong>Leyendo la guía…</strong>
            <span>{archivo?.name}</span>
          </div>
        )}

        {fase === 'revisar' && (
          <>
            {archivo && <p className="gr__archivo"><FileText size={15} aria-hidden /> {archivo.name} · {f.fuente === 'XML' ? 'leída del XML' : f.fuente === 'IA' ? 'leída con IA: revisa cada dato' : 'a mano'}</p>}
            {duplicada && <Notice tone="error" icon={<CircleAlert size={16} />}>Esta guía ya está registrada. Si guardas, el sistema lo impedirá; revisa el número y el RUC del emisor.</Notice>}
            {advertencias.length > 0 && <Notice tone="accent" icon={<CircleAlert size={16} />}>{advertencias.map(a => <div key={a}>{a}</div>)}</Notice>}
            {f.trae_transporte && <Notice tone="accent">Esta guía ya trae los datos del transporte (transportista, placa, conductor y fecha de traslado). Según la norma de SUNAT, puede que no haga falta emitir nuestra GRE Transportista: confírmalo antes de decidir.</Notice>}

            <Seccion titulo="La guía">
              <SegmentedControl block label="Tipo de guía" value={f.tipo} onChange={v => set({ tipo: v })} options={[{ value: 'REMITENTE', label: 'GRE Remitente' }, { value: 'TRANSPORTISTA', label: 'GRE Transportista' }]} />
              <div className="os-fila">
                <Field label="Serie y número *" error={ver('serie_numero')} hint="Como está impresa, por ejemplo T001-00000123">
                  {p => <TextInput {...p} value={f.serie_numero} placeholder="T001-00000123" style={{ textTransform: 'uppercase' }} onBlur={() => tocar('serie_numero')} onChange={e => set({ serie_numero: e.target.value })} />}
                </Field>
                <Field label="Emisión">{p => <TextInput {...p} type="date" value={f.fecha_emision} onChange={e => set({ fecha_emision: e.target.value })} />}</Field>
              </div>
              <div className="os-fila">
                <Field label="Inicio del traslado">{p => <TextInput {...p} type="date" value={f.fecha_traslado} onChange={e => set({ fecha_traslado: e.target.value })} />}</Field>
                <Field label="Motivo del traslado">{p => <TextInput {...p} value={f.motivo} placeholder="Venta" onChange={e => set({ motivo: e.target.value })} />}</Field>
              </div>
            </Seccion>

            <Seccion titulo="Quién envía y quién recibe">
              <div className="os-fila">
                <Field label={f.tipo === 'REMITENTE' ? 'RUC del remitente *' : 'RUC del remitente'} error={f.tipo === 'REMITENTE' ? ver('emisor') : null}>
                  {p => <TextInput {...p} inputMode="numeric" maxLength={11} value={f.remitente_ruc} onBlur={() => tocar('emisor')} onChange={e => set({ remitente_ruc: e.target.value.replace(/\D/g, '') })} />}
                </Field>
                <Field label="Remitente">{p => <TextInput {...p} value={f.remitente_nombre} onChange={e => set({ remitente_nombre: e.target.value })} />}</Field>
              </div>
              <div className="os-fila">
                <Field label="RUC o DNI del destinatario">{p => <TextInput {...p} inputMode="numeric" maxLength={11} value={f.destinatario_doc} onChange={e => set({ destinatario_doc: e.target.value.replace(/\D/g, '') })} />}</Field>
                <Field label="Destinatario">{p => <TextInput {...p} value={f.destinatario_nombre} onChange={e => set({ destinatario_nombre: e.target.value })} />}</Field>
              </div>
            </Seccion>

            <Seccion titulo="Punto de partida y de llegada">
              <div className="os-fila">
                <div className="os-punto">
                  <Field label="Distrito de partida" hint={f.partida_ubigeo ? `Ubigeo ${f.partida_ubigeo}` : undefined}>
                    {p => <Combobox {...p} options={ubi.opciones} value={f.partida_ubigeo || null} loading={ubi.cargando} placeholder="Busca el distrito" onChange={v => set({ partida_ubigeo: v ?? '' })} />}
                  </Field>
                  <Field label="Dirección de partida">{p => <TextInput {...p} value={f.partida_direccion} onChange={e => set({ partida_direccion: e.target.value })} />}</Field>
                </div>
                <div className="os-punto">
                  <Field label="Distrito de llegada" hint={f.llegada_ubigeo ? `Ubigeo ${f.llegada_ubigeo}` : undefined}>
                    {p => <Combobox {...p} options={ubi.opciones} value={f.llegada_ubigeo || null} loading={ubi.cargando} placeholder="Busca el distrito" onChange={v => set({ llegada_ubigeo: v ?? '' })} />}
                  </Field>
                  <Field label="Dirección de llegada">{p => <TextInput {...p} value={f.llegada_direccion} onChange={e => set({ llegada_direccion: e.target.value })} />}</Field>
                </div>
              </div>
            </Seccion>

            <Seccion titulo="Carga">
              <div className="os-fila">
                <Field label="Peso bruto total (kg) *" error={ver('peso')} hint="Si la guía lo trae en toneladas, conviértelo a kilos">
                  {p => <TextInput {...p} inputMode="decimal" value={f.peso} placeholder="0" onBlur={() => tocar('peso')} onChange={e => set({ peso: e.target.value.replace(/[^\d.,]/g, '') })} />}
                </Field>
                <Field label="Bultos o unidades">{p => <TextInput {...p} inputMode="numeric" value={f.bultos} onChange={e => set({ bultos: e.target.value.replace(/\D/g, '') })} />}</Field>
              </div>
              <Field label="Qué se transporta">{p => <TextInput {...p} value={f.descripcion} onChange={e => set({ descripcion: e.target.value })} />}</Field>
            </Seccion>

            <Seccion titulo="Transporte" nota="Solo si la guía lo trae. Sirve para saber si hace falta emitir nuestra guía de transportista.">
              <div className="os-fila">
                <Field label={f.tipo === 'TRANSPORTISTA' ? 'RUC del transportista *' : 'RUC del transportista'} error={f.tipo === 'TRANSPORTISTA' ? ver('emisor') : null}>
                  {p => <TextInput {...p} inputMode="numeric" maxLength={11} value={f.transportista_ruc} onBlur={() => tocar('emisor')} onChange={e => set({ transportista_ruc: e.target.value.replace(/\D/g, '') })} />}
                </Field>
                <Field label="Transportista">{p => <TextInput {...p} value={f.transportista_nombre} onChange={e => set({ transportista_nombre: e.target.value })} />}</Field>
              </div>
              <div className="os-fila">
                <Field label="Placa">{p => <TextInput {...p} value={f.placa} style={{ textTransform: 'uppercase' }} onChange={e => set({ placa: e.target.value })} />}</Field>
                <Field label="Conductor">{p => <TextInput {...p} value={f.conductor_nombre} onChange={e => set({ conductor_nombre: e.target.value })} />}</Field>
              </div>
            </Seccion>
          </>
        )}
      </div>
    </Sheet>
  );
}
