import './checklist.css';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Pencil, Trash2, Wrench, MessageCircle, Mail } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { api, errorMessage } from '../../core/api/client';
import { formatFechaHoraPe } from '../../core/lib/format';
import { fallaEstadoColor, type ReporteFalla } from './api';
import { leerFallas, type FallaGuardada } from './fman';

export interface OtGenerada { idOt: string; placa?: string }

/** Lista de OTs generadas, guardada como JSON en el reporte */
export function leerOts(valor: unknown): OtGenerada[] {
  let d = valor;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return []; } }
  return Array.isArray(d) ? (d as OtGenerada[]).filter(o => o && o.idOt) : [];
}

function leerLista(valor: unknown): string[] {
  let d = valor;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return []; } }
  return Array.isArray(d) ? d.filter((x): x is string => typeof x === 'string' && x !== '') : [];
}

/** Ficha del reporte: datos, fallas marcadas, evidencias, OTs generadas y firma. Calca de "Detalle" del clásico. */
export function ChecklistDetalle({ falla, open, puedeEditar, puedeOTs, puedeEliminar, pdfListo, onClose,
  onEditar, onGenerarOTs, onPdf, onWhatsApp, onCorreo, onEliminar }: {
  falla: ReporteFalla; open: boolean; puedeEditar: boolean; puedeOTs: boolean; puedeEliminar: boolean; pdfListo: boolean;
  onClose: () => void; onEditar?: () => void; onGenerarOTs?: () => void; onPdf: () => void; onWhatsApp: () => void;
  onCorreo: () => void; onEliminar?: () => void;
}) {
  const estadoFinal = /final|anula/i.test(falla.estado);
  const tracto = leerFallas(falla.fallas_tracto_json);
  const remolque = leerFallas(falla.fallas_remolque_json);
  const ots = useMemo(() => leerOts(falla.ots_generadas_json), [falla.ots_generadas_json]);
  const fotos = useMemo(() => leerLista(falla.fotos_json), [falla.fotos_json]);
  // Firma y fotos pueden venir de S3 (URL, se firma al abrir) o guardadas como imagen en base64 (se muestran tal cual)
  const firmaRaw = typeof falla.firma_conductor === 'string' && /^(https?:|data:)/.test(falla.firma_conductor) ? falla.firma_conductor : null;
  const firmaUrl = firmaRaw;
  const urls = [...fotos, ...(firmaRaw ? [firmaRaw] : [])].filter(u => u.startsWith('http'));

  // Evidencias y firma guardadas en S3: se piden con URL firmada al abrir la ficha
  const firmadas = useQuery<Record<string, string>>({
    queryKey: ['flota', 'checklist-firmas', String(falla.id), urls.join('|')],
    enabled: open && urls.length > 0,
    queryFn: async () => (await api<{ signed?: Record<string, string> }>('/mantenimiento/checklist/presign-read', { method: 'POST', body: { urls } })).signed ?? {},
    staleTime: 10 * 60_000,
  });
  const src = (u: string) => (u.startsWith('data:') ? u : firmadas.data?.[u] || u);

  const linea = (f: FallaGuardada, i: number, tono: 'tracto' | 'remolque') => (
    <div key={`${tono}-${i}`} className="dato" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <span className="dato__valor" style={{ color: tono === 'tracto' ? 'var(--red-ink)' : 'var(--amber-ink)', fontWeight: 600 }}>
        {f.sistema ? `${f.sistema}: ` : ''}{f.item}
      </span>
      {f.obs && f.obs !== f.item && <span className="t-footnote c-secondary">{f.obs}</span>}
      {f.fecha && <span className="t-footnote c-secondary">{f.fecha}</span>}
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title={`Reporte de fallas ${falla.folio}`}
      footer={<>
        <Button variant="secondary" icon={<FileText size={16} />} onClick={onPdf} disabled={!pdfListo}>PDF F-MAN-001</Button>
        <Button variant="secondary" icon={<MessageCircle size={16} />} onClick={onWhatsApp} disabled={!pdfListo}>WhatsApp</Button>
        <Button variant="secondary" icon={<Mail size={16} />} onClick={onCorreo} disabled={!pdfListo}>Enviar por correo</Button>
        {onEditar && puedeEditar && !estadoFinal && <Button variant="secondary" icon={<Pencil size={16} />} onClick={onEditar}>Editar</Button>}
        {onGenerarOTs && puedeOTs && !estadoFinal && <Button variant="primary" icon={<Wrench size={16} />} onClick={onGenerarOTs}>Generar OTs</Button>}
        {onEliminar && puedeEliminar && <Button variant="secondary" icon={<Trash2 size={16} />} onClick={onEliminar}>Eliminar</Button>}
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <span className={`ot-estado ot-estado--${fallaEstadoColor(falla)}`}>{falla.estado}</span>
          <span className="t-footnote c-secondary">{falla.fecha_reporte ? formatFechaHoraPe(falla.fecha_reporte) : '—'}</span>
        </div>

        <section className="ck-bloque">
          <p className="ck-bloque__titulo">Datos del reporte</p>
          <div className="tarjeta__lista">
            {falla.orden_viaje && <div className="dato"><span className="dato__label">Orden de viaje</span><span className="dato__valor">{falla.orden_viaje}</span></div>}
            <div className="dato"><span className="dato__label">Camión</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)' }}>{falla.placa_tracto || '—'}</span></div>
            <div className="dato"><span className="dato__label">Carreta</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)' }}>{falla.placa_remolque || '—'}</span></div>
            <div className="dato"><span className="dato__label">Conductor</span><span className="dato__valor">{falla.conductor || '—'}</span></div>
            <div className="dato"><span className="dato__label">Procedencia</span><span className="dato__valor">{falla.procedencia || '—'}</span></div>
            {falla.km_inicial != null && Number(falla.km_inicial) > 0 && <div className="dato"><span className="dato__label">Kilometraje</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)' }}>{Number(falla.km_inicial).toLocaleString('es-PE')} km</span></div>}
            {falla.horas_motor != null && String(falla.horas_motor) !== '' && <div className="dato"><span className="dato__label">Horas de motor</span><span className="dato__valor" style={{ fontFamily: 'var(--font-mono)' }}>{String(falla.horas_motor)}</span></div>}
            {falla.ubicacion_gps && <div className="dato"><span className="dato__label">Ubicación GPS</span><span className="dato__valor">{falla.ubicacion_gps}</span></div>}
            {!!falla.creado_por && <div className="dato"><span className="dato__label">Registrado por</span><span className="dato__valor">{String(falla.creado_por)}</span></div>}
          </div>
        </section>

        <section className="ck-bloque">
          <p className="ck-bloque__titulo">Checklist · fallas marcadas</p>
          {tracto.length + remolque.length === 0 && !falla.fallas_libres_text
            ? <p className="t-footnote c-secondary">No hay fallas marcadas.</p>
            : (
              <div className="tarjeta__lista">
                {tracto.map((f, i) => linea(f, i, 'tracto'))}
                {remolque.map((f, i) => linea(f, i, 'remolque'))}
                {falla.fallas_libres_text && <div className="dato"><span className="dato__label">Observaciones</span><span className="dato__valor">{falla.fallas_libres_text}</span></div>}
              </div>
            )}
        </section>

        <section className="ck-bloque">
          <p className="ck-bloque__titulo">Evidencias</p>
          {fotos.length === 0
            ? <p className="t-footnote c-secondary">Sin evidencias adjuntas.</p>
            : <div className="ck-evidencias">{fotos.map((u, i) => <img key={i} src={src(u)} alt={`Evidencia ${i + 1}`} loading="lazy" />)}</div>}
        </section>

        <section className="ck-bloque">
          <p className="ck-bloque__titulo">Órdenes de trabajo generadas</p>
          {ots.length === 0
            ? <p className="t-footnote c-secondary">Sin órdenes de trabajo generadas.</p>
            : <div className="ck-ots">{ots.map(o => <span key={o.idOt} className="ck-ot">{o.idOt}{o.placa ? ` (${o.placa})` : ''}</span>)}</div>}
        </section>

        {firmaUrl && (
          <section className="ck-bloque">
            <p className="ck-bloque__titulo">Firma del conductor</p>
            <img src={src(firmaUrl)} alt="Firma del conductor" style={{ maxHeight: 100, objectFit: 'contain', justifySelf: 'start' }} />
          </section>
        )}
        {firmadas.isError && <Notice tone="error">{errorMessage(firmadas.error)}</Notice>}
      </div>
    </Sheet>
  );
}
