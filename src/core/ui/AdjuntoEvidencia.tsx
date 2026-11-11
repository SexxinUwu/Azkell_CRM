import { Camera, FileText, Images, Paperclip, X } from 'lucide-react';
import './adjunto-evidencia.css';

/** ¿La evidencia guardada es un documento (PDF) y no una foto? */
export const esDocumentoEvidencia = (v: string) => /^data:application\/pdf/i.test(v) || /\.pdf(\?|$)/i.test(v.split('#')[0]);

/**
 * Adjuntar una evidencia: tomar una foto con la cámara o abrir la galería / elegir un documento (PDF).
 * `src` es la dirección para mostrar la foto (la guardada puede necesitar firma); sin ella solo se muestra el nombre.
 */
export function AdjuntoEvidencia({ valor, src, onArchivo, onQuitar, titulo = 'Evidencia', disabled }: {
  valor: string;
  src?: string;
  onArchivo: (f: File) => void;
  onQuitar: () => void;
  titulo?: string;
  disabled?: boolean;
}) {
  const doc = !!valor && esDocumentoEvidencia(valor);
  return (
    <div className="adjunto" role="group" aria-label={titulo}>
      {valor ? (
        <div className="adjunto__vista">
          {doc
            ? <span className="adjunto__doc"><FileText size={22} aria-hidden /></span>
            : (src ? <img className="adjunto__foto" src={src} alt={titulo} /> : <span className="adjunto__doc"><Paperclip size={20} aria-hidden /></span>)}
          <span className="adjunto__texto"><b>{doc ? 'Documento adjunto' : 'Foto adjunta'}</b><small>{titulo}</small></span>
          <button type="button" className="adjunto__quitar" onClick={onQuitar} disabled={disabled} aria-label="Quitar el adjunto"><X size={16} /></button>
        </div>
      ) : (
        <div className="adjunto__botones">
          <label className={`adjunto__btn adjunto__btn--camara${disabled ? ' is-off' : ''}`}>
            <Camera size={18} aria-hidden /> Tomar foto
            <input type="file" accept="image/*" capture="environment" hidden disabled={disabled} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onArchivo(f); }} />
          </label>
          <label className={`adjunto__btn adjunto__btn--galeria${disabled ? ' is-off' : ''}`}>
            <Images size={18} aria-hidden /> Galería o documento
            <input type="file" accept="image/*,application/pdf" hidden disabled={disabled} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onArchivo(f); }} />
          </label>
        </div>
      )}
    </div>
  );
}
