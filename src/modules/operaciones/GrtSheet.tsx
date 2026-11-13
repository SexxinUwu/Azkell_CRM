import './servicios.css';
import './seguimiento.css';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, RefreshCw, Send } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { fechaGuia, fmtKg, type Guia } from './guiasApi';

interface Propuesta {
  serie: string; fecha_traslado: string; descripcion_motivo: string;
  remitente_ruc: string; remitente_razon_social: string; destinatario_ruc: string; destinatario_razon_social: string;
  punto_partida_direccion: string; punto_llegada_direccion: string; peso_bruto_total: number;
  placa_tracto: string; placa_carreta: string; conductor_nombre: string; conductor_num_doc: string; conductor_licencia: string; registro_mtc: string;
  items: { descripcion: string; cantidad: number; unidad_medida: string }[];
}
interface Respuesta {
  viaje: string | null; propuesta: Propuesta; faltan: string[];
  existente: { id: number; numero_completo: string; estado: string; apisunat_document_id: string | null; apisunat_status: string | null; apisunat_faults: string | null; pdf_url: string | null; modo_emision: string | null } | null;
  ambiente: { modo: 'prueba' | 'produccion'; lista: boolean; motivo: string | null }; guia_trae_transporte: boolean;
}

const EDITABLES = /placa del tracto|DNI del conductor|licencia|registro MTC/;

/** Emite nuestra GRE Transportista a partir de una guía de remitente recibida y vinculada: los datos salen de la guía y del viaje, la persona los revisa y confirma. */
export function GrtSheet({ guia, onClose }: { guia: Guia | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<Propuesta | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery<Respuesta>({
    queryKey: ['operaciones', 'grt', guia?.id], enabled: !!guia, staleTime: 0,
    queryFn: () => api<Respuesta & { ok: boolean }>(`/operaciones/gre/guias/${guia!.id}/grt`),
  });
  useEffect(() => { if (q.data) setF(q.data.propuesta); setError(null); }, [q.data]);

  const r = q.data;
  const set = (parte: Partial<Propuesta>) => setF(prev => (prev ? { ...prev, ...parte } : prev));
  const fijos = (r?.faltan ?? []).filter(x => !EDITABLES.test(x));
  const propios: string[] = [];
  if (f) {
    if (!f.placa_tracto.trim()) propios.push('placa del tracto');
    if (!/^\d{8}$/.test(f.conductor_num_doc.trim())) propios.push('DNI del conductor (8 dígitos)');
    if (!f.conductor_licencia.trim()) propios.push('licencia del conductor');
    if (!f.registro_mtc.trim()) propios.push('registro MTC de la empresa');
  }
  const faltan = [...fijos, ...propios];
  const yaEmitida = !!r?.existente?.apisunat_document_id;
  const puede = !!f && !!r && r.ambiente.lista && faltan.length === 0 && !yaEmitida;

  async function emitir() {
    if (!guia || !f || !puede) return;
    setOcupado(true); setError(null);
    try {
      const res = await api<{ ok?: boolean; error?: string; message?: string }>(`/operaciones/gre/guias/${guia.id}/grt`, { method: 'POST', body: f });
      if (res.ok === false) throw new Error(res.error || 'No se pudo emitir');
      haptic('success'); toast(res.message || 'GRE Transportista enviada');
      await qc.invalidateQueries({ queryKey: ['operaciones'] });
    } catch (err) { setError(errorMessage(err)); haptic('warning'); await q.refetch(); }
    finally { setOcupado(false); }
  }

  async function actualizarEstado() {
    if (!r?.existente) return;
    setOcupado(true); setError(null);
    try {
      await api(`/operaciones/gre/guias/${r.existente.id}/sincronizar`, { method: 'POST', body: {} });
      await q.refetch();
      toast('Estado actualizado');
    } catch (err) { setError(errorMessage(err)); }
    finally { setOcupado(false); }
  }

  return (
    <Sheet ancho open={!!guia} onClose={() => !ocupado && onClose()} title="GRE Transportista"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={ocupado}>Cerrar</Button>
          {r?.existente && yaEmitida
            ? <Button variant="primary" icon={<RefreshCw size={16} />} onClick={actualizarEstado} loading={ocupado}>Actualizar estado</Button>
            : <Button variant="primary" icon={<Send size={16} />} onClick={emitir} loading={ocupado} disabled={!puede}>{r?.ambiente.modo === 'produccion' ? 'Emitir en producción' : 'Emitir en prueba'}</Button>}
        </>
      )}>
      {q.isLoading || !f ? (q.isError ? <Notice tone="error">{errorMessage(q.error)}</Notice> : <PageLoader />) : r && (
        <div className="fd">
          {!r.ambiente.lista
            ? <Notice tone="error">No se puede emitir todavía: {r.ambiente.motivo} Se configura en Sistema › Integraciones.</Notice>
            : r.ambiente.modo === 'produccion'
              ? <Notice tone="error"><strong>Producción:</strong> esta guía tendrá validez tributaria ante SUNAT.</Notice>
              : <Notice tone="accent">Ambiente de <strong>prueba</strong>: esta guía no tiene validez tributaria.</Notice>}
          {r.guia_trae_transporte && <Notice tone="accent">La guía del cliente ya trae los datos del transporte; puede que no haga falta emitir la nuestra. Confírmalo antes de seguir.</Notice>}
          {r.existente && (
            <Notice tone={r.existente.apisunat_faults ? 'error' : 'accent'}>
              {r.existente.numero_completo}{r.existente.apisunat_status ? ` · APISUNAT: ${r.existente.apisunat_status}` : ''}{r.existente.modo_emision ? ` · ${r.existente.modo_emision}` : ''}
              {r.existente.apisunat_faults ? ` — ${r.existente.apisunat_faults}` : ''}
              {r.existente.pdf_url && <> · <a href={r.existente.pdf_url} target="_blank" rel="noreferrer">Ver PDF <ExternalLink size={13} aria-hidden /></a></>}
            </Notice>
          )}
          {fijos.length > 0 && <Notice tone="error">Faltan datos en la guía del cliente: {fijos.join(', ')}. Complétalos en su ficha (editar) y vuelve.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}

          <section className="os-seccion">
            <h3 className="os-seccion__titulo">Según la guía {guia?.numero_completo}</h3>
            <div className="os-seccion__cuerpo">
              <p className="os-nota">
                {f.remitente_razon_social || f.remitente_ruc} → {f.destinatario_razon_social || f.destinatario_ruc} · {fmtKg(f.peso_bruto_total)} · {f.descripcion_motivo}<br />
                {f.punto_partida_direccion} → {f.punto_llegada_direccion}<br />
                {f.items.map(i => `${i.cantidad} ${i.unidad_medida} ${i.descripcion}`).join(' · ')}
                {r.viaje ? <><br />Viaje {r.viaje}</> : null}
              </p>
            </div>
          </section>

          <section className="os-seccion">
            <h3 className="os-seccion__titulo">Transporte <span className="gr__nota">· sale del viaje, corrígelo si hace falta</span></h3>
            <div className="os-seccion__cuerpo">
              <div className="gr__g4">
                <Field label="Serie">{p => <TextInput {...p} value={f.serie} maxLength={4} onChange={e => set({ serie: e.target.value.toUpperCase() })} disabled />}</Field>
                <Field label="Inicio del traslado">{p => <TextInput {...p} type="date" value={f.fecha_traslado} onChange={e => set({ fecha_traslado: e.target.value })} />}</Field>
                <Field label="Placa del tracto">{p => <TextInput {...p} value={f.placa_tracto} onChange={e => set({ placa_tracto: e.target.value.toUpperCase() })} />}</Field>
                <Field label="Placa de la carreta">{p => <TextInput {...p} value={f.placa_carreta} onChange={e => set({ placa_carreta: e.target.value.toUpperCase() })} />}</Field>
                <div className="gr__s2"><Field label="Conductor">{p => <TextInput {...p} value={f.conductor_nombre} onChange={e => set({ conductor_nombre: e.target.value })} />}</Field></div>
                <Field label="DNI">{p => <TextInput {...p} inputMode="numeric" maxLength={8} value={f.conductor_num_doc} onChange={e => set({ conductor_num_doc: e.target.value.replace(/\D/g, '') })} />}</Field>
                <Field label="Licencia">{p => <TextInput {...p} value={f.conductor_licencia} onChange={e => set({ conductor_licencia: e.target.value.toUpperCase() })} />}</Field>
                <div className="gr__s2"><Field label="Registro MTC de la empresa">{p => <TextInput {...p} value={f.registro_mtc} onChange={e => set({ registro_mtc: e.target.value.toUpperCase() })} />}</Field></div>
              </div>
              <p className="os-nota">Traslado desde {fechaGuia(f.fecha_traslado)}. Modalidad: transporte público.</p>
            </div>
          </section>

          {faltan.length > 0 && !yaEmitida && <Notice tone="accent">Falta: {faltan.join(', ')}.</Notice>}
        </div>
      )}
    </Sheet>
  );
}
