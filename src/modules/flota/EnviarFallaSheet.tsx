import { useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';
import { Field, TextInput } from '../../core/ui/Field';
import { useToast } from '../../core/ui/Toast';
import { api, errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import type { ReporteFalla } from './api';
import { pdfFman, type ConfigSistemas } from './fman';

const archivoBase64 = (blob: Blob) => new Promise<string>((res, rej) => {
  const lector = new FileReader();
  lector.onload = () => res(String(lector.result));
  lector.onerror = () => rej(lector.error);
  lector.readAsDataURL(blob);
});

/** Envía el PDF F-MAN-001 del reporte por correo (mismo endpoint que el clásico, sin programación). */
export function EnviarFallaSheet({ falla, cfg, open, onClose }: {
  falla: ReporteFalla; cfg: ConfigSistemas; open: boolean; onClose: () => void;
}) {
  const toast = useToast();
  const folio = falla.folio;
  const tracto = falla.placa_tracto || 'Tracto';
  const carreta = falla.placa_remolque ? ` / ${falla.placa_remolque}` : '';
  const [para, setPara] = useState('');
  const [cc, setCc] = useState('');
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null); setPara(''); setCc('');
    setAsunto(`[Azkell ERP] Reporte de Fallas Mecánicas N° ${folio} (${tracto})`);
    setMensaje(`Estimados,\n\nAdjunto compartimos el Reporte de Fallas Oficial F-MAN-001 N° ${folio} emitido desde el ERP.\n\n• Unidad Tracto: ${tracto}\n• Semirremolque: ${falla.placa_remolque || 'Sin carreta'}\n• Conductor: ${falla.conductor || '—'}\n\nSaludos cordiales.`);
  }, [open, folio, tracto, falla.placa_remolque, falla.conductor]);

  async function enviar() {
    if (!para.trim()) { setError('Indica al menos un destinatario (Para).'); return; }
    setEnviando(true); setError(null);
    try {
      const pdf = await pdfFman(falla, cfg);
      const r = await api<{ ok?: boolean; error?: string }>('/reportes/enviar-correo', {
        method: 'POST',
        body: {
          para: para.trim(), cc: cc.trim(), asunto, mensaje,
          nombre_reporte: `Reporte de Fallas N° ${folio} — ${tracto}${carreta}`,
          modulo: 'checklist', adjunto_nombre: `Reporte_Fallas_${folio}.pdf`, adjunto_base64: await archivoBase64(pdf),
        },
      });
      if (r.ok === false) throw new Error(r.error || 'No se pudo enviar el correo');
      haptic('success'); toast(`Reporte ${folio} enviado por correo`);
      onClose();
    } catch (err) { setError(errorMessage(err)); haptic('warning'); }
    finally { setEnviando(false); }
  }

  return (
    <Sheet open={open} onClose={() => !enviando && onClose()} title={`Enviar ${folio} por correo`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" onClick={enviar} loading={enviando}>Enviar correo</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {error && <Notice tone="error" icon={<CircleAlert size={16} />}>{error}</Notice>}
        <Field label="Para *" wide>{p => <TextInput {...p} type="email" multiple value={para} onChange={e => setPara(e.target.value)} placeholder="correo@empresa.com, otro@empresa.com" />}</Field>
        <Field label="CC" wide>{p => <TextInput {...p} value={cc} onChange={e => setCc(e.target.value)} />}</Field>
        <Field label="Asunto" wide>{p => <TextInput {...p} value={asunto} onChange={e => setAsunto(e.target.value)} />}</Field>
        <Field label="Mensaje" wide>
          {p => <textarea {...p} className="input" rows={6} value={mensaje} onChange={e => setMensaje(e.target.value)} />}
        </Field>
        <p className="t-footnote c-secondary">Se adjunta el PDF F-MAN-001 del reporte.</p>
      </div>
    </Sheet>
  );
}
