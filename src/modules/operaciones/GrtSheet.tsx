import './servicios.css';
import './seguimiento.css';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, RefreshCw, Send } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button, PageLoader } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { fechaGuia, fmtKg, type Guia } from './guiasApi';

interface Propuesta {
  serie: string; fecha_traslado: string; fecha_traslado_guia: string; descripcion_motivo: string;
  remitente_ruc: string; remitente_razon_social: string; destinatario_ruc: string; destinatario_razon_social: string;
  punto_partida_direccion: string; punto_llegada_direccion: string; peso_bruto_total: number;
  placa_tracto: string; placa_carreta: string; conductor_nombre: string; conductor_apellidos: string; conductor_num_doc: string; conductor_licencia: string; registro_mtc: string; tuc_tracto: string; aut_tracto: string; tuc_carreta: string; aut_carreta: string;
  items: { descripcion: string; cantidad: number; unidad_medida: string }[];
}
interface Respuesta {
  viaje: string | null; propuesta: Propuesta; faltan: string[];
  existente: { id: number; numero_completo: string; estado: string; apisunat_document_id: string | null; apisunat_status: string | null; apisunat_faults: string | null; pdf_url: string | null; modo_emision: string | null } | null;
  guias: { id: number; numero_completo: string; peso_kg: number; descripcion: string | null; servicio: string | null; base: boolean; compatible: boolean; motivo: string }[];
  ambiente: { modo: 'prueba' | 'produccion'; lista: boolean; motivo: string | null }; guia_trae_transporte: boolean;
}

const EDITABLES = /placa del tracto|nombres y apellidos|DNI del conductor|licencia|registro MTC/;

/** Emite nuestra GRE Transportista a partir de una guía de remitente recibida y vinculada: los datos salen de la guía y del viaje, la persona los revisa y confirma. */
export function GrtSheet({ guia, onClose }: { guia: Guia | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<Propuesta | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState(false);
  const [sel, setSel] = useState<number[]>([]);

  const q = useQuery<Respuesta>({
    queryKey: ['operaciones', 'grt', guia?.id], enabled: !!guia, staleTime: 0,
    queryFn: () => api<Respuesta & { ok: boolean }>(`/operaciones/gre/guias/${guia!.id}/grt`),
  });
  useEffect(() => {
    if (q.data) {
      const pr = q.data.propuesta;
      setF(pr);
      // El TUC y la autorización son opcionales: la sección queda cerrada salvo que ya haya datos
      setExtra(!!(pr.tuc_tracto || pr.aut_tracto || pr.tuc_carreta || pr.aut_carreta));
      // Por defecto se incluyen todas las guías del viaje que se pueden agrupar con esta
      setSel((q.data.guias ?? []).filter(c => c.compatible).map(c => c.id));
    }
    setError(null);
  }, [q.data]);

  const r = q.data;
  const elegidas = (r?.guias ?? []).filter(c => sel.includes(c.id));
  const pesoSel = elegidas.reduce((t, c) => t + c.peso_kg, 0);
  const alternar = (id: number) => setSel(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));
  const set = (parte: Partial<Propuesta>) => setF(prev => (prev ? { ...prev, ...parte } : prev));
  const fijos = (r?.faltan ?? []).filter(x => !EDITABLES.test(x));
  const propios: string[] = [];
  if (f) {
    if (!f.placa_tracto.trim()) propios.push('placa del tracto');
    if (!f.conductor_nombre.trim() || !f.conductor_apellidos.trim()) propios.push('nombres y apellidos del conductor');
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
      const res = await api<{ ok?: boolean; error?: string; message?: string }>(`/operaciones/gre/guias/${guia.id}/grt`, { method: 'POST', body: { ...f, guias_ids: sel } });
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
                {f.remitente_razon_social || f.remitente_ruc} → {f.destinatario_razon_social || f.destinatario_ruc} · {fmtKg(elegidas.length ? pesoSel : f.peso_bruto_total)} · {f.descripcion_motivo}<br />
                {f.punto_partida_direccion} → {f.punto_llegada_direccion}<br />
                {elegidas.length > 1 ? elegidas.map(c => c.descripcion || c.numero_completo).join(' · ') : f.items.map(i => `${i.cantidad} ${i.unidad_medida} ${i.descripcion}`).join(' · ')}
                {r.viaje ? <><br />Viaje {r.viaje}</> : null}
              </p>
            </div>
          </section>

          {(r.guias?.length ?? 0) > 1 && (
            <section className="os-seccion">
              <h3 className="os-seccion__titulo">Guías del cliente en esta guía <span className="gr__nota">· una sola GRE Transportista puede cubrir varias del mismo viaje</span></h3>
              <div className="os-seccion__cuerpo">
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.guias.map(c => (
                    <li key={c.id}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: c.compatible ? 1 : 0.55, cursor: c.base || !c.compatible || yaEmitida ? 'default' : 'pointer' }}>
                        <input type="checkbox" checked={sel.includes(c.id)} disabled={c.base || !c.compatible || yaEmitida} onChange={() => alternar(c.id)} />
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8125rem' }}>{c.numero_completo}</span>
                        <span className="t-footnote c-secondary" style={{ flex: 1 }}>{fmtKg(c.peso_kg)}{c.descripcion ? ` · ${c.descripcion}` : ''}{c.servicio ? ` · ${c.servicio}` : ''}</span>
                        {!c.compatible && <span className="t-footnote" style={{ color: 'var(--red-ink)' }}>No se agrupa: {c.motivo}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="os-nota">Total a transportar: <strong>{fmtKg(pesoSel)}</strong> en {elegidas.length} {elegidas.length === 1 ? 'guía' : 'guías'}. Deben tener el mismo remitente, destinatario y puntos de partida y llegada.</p>
              </div>
            </section>
          )}

          <section className="os-seccion">
            <h3 className="os-seccion__titulo">Transporte <span className="gr__nota">· sale del viaje, corrígelo si hace falta</span></h3>
            <div className="os-seccion__cuerpo">
              <div className="gr__g4">
                <Field label="Serie">{p => <TextInput {...p} value={f.serie} maxLength={4} onChange={e => set({ serie: e.target.value.toUpperCase() })} disabled />}</Field>
                <Field label="Inicio del traslado">{p => <TextInput {...p} type="date" value={f.fecha_traslado} onChange={e => set({ fecha_traslado: e.target.value })} />}</Field>
                <Field label="Placa del tracto">{p => <TextInput {...p} value={f.placa_tracto} onChange={e => set({ placa_tracto: e.target.value.toUpperCase() })} />}</Field>
                <Field label="Placa de la carreta">{p => <TextInput {...p} value={f.placa_carreta} onChange={e => set({ placa_carreta: e.target.value.toUpperCase() })} />}</Field>
                <Field label="Nombres del conductor">{p => <TextInput {...p} value={f.conductor_nombre} onChange={e => set({ conductor_nombre: e.target.value })} />}</Field>
                <Field label="Apellidos del conductor">{p => <TextInput {...p} value={f.conductor_apellidos} onChange={e => set({ conductor_apellidos: e.target.value })} />}</Field>
                <Field label="DNI">{p => <TextInput {...p} inputMode="numeric" maxLength={8} value={f.conductor_num_doc} onChange={e => set({ conductor_num_doc: e.target.value.replace(/\D/g, '') })} />}</Field>
                <Field label="Licencia">{p => <TextInput {...p} value={f.conductor_licencia} onChange={e => set({ conductor_licencia: e.target.value.toUpperCase() })} />}</Field>
                {extra ? (
                  <>
                    <Field label="TUC del tracto">{p => <TextInput {...p} value={f.tuc_tracto} onChange={e => set({ tuc_tracto: e.target.value.toUpperCase() })} />}</Field>
                    <Field label="Autorización del tracto">{p => <TextInput {...p} value={f.aut_tracto} onChange={e => set({ aut_tracto: e.target.value })} />}</Field>
                    <Field label="TUC de la carreta">{p => <TextInput {...p} value={f.tuc_carreta} onChange={e => set({ tuc_carreta: e.target.value.toUpperCase() })} />}</Field>
                    <Field label="Autorización de la carreta">{p => <TextInput {...p} value={f.aut_carreta} onChange={e => set({ aut_carreta: e.target.value })} />}</Field>
                  </>
                ) : (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Button variant="plain" size="sm" icon={<Plus size={15} />} onClick={() => setExtra(true)}>Agregar TUC y autorización del vehículo (opcional)</Button>
                  </div>
                )}
                <div className="gr__s2"><Field label="Registro MTC de la empresa">{p => <TextInput {...p} value={f.registro_mtc} onChange={e => set({ registro_mtc: e.target.value.toUpperCase() })} />}</Field></div>
              </div>
              <p className="os-nota">Traslado desde {fechaGuia(f.fecha_traslado)}. Modalidad: transporte público.</p>
              {f.fecha_traslado_guia && f.fecha_traslado_guia !== f.fecha_traslado && (
                <p className="os-nota">La guía del cliente dice {fechaGuia(f.fecha_traslado_guia)}, pero SUNAT no acepta que el traslado empiece antes de la emisión: se propone la fecha de hoy.</p>
              )}
            </div>
          </section>

          {faltan.length > 0 && !yaEmitida && <Notice tone="accent">Falta: {faltan.join(', ')}.</Notice>}
        </div>
      )}
    </Sheet>
  );
}
