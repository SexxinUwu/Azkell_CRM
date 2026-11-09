import './evidencias.css';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, FileText, Images, X } from 'lucide-react';
import { prepararEvidencia } from '../lib/imagen';

interface Props {
  archivos: File[];
  onCambio: (archivos: File[]) => void;
  titulo?: string;
  ayuda?: string;
  /** Mínimo obligatorio: sin al menos uno, se muestra el aviso de que falta */
  obligatorio?: boolean;
  /** Muestra el aviso en rojo (por ejemplo, tras intentar guardar sin evidencia) */
  mostrarError?: boolean;
  max?: number;
  /** Solo fotos (sin PDF). Con max=1 la galería elige una sola */
  soloImagenes?: boolean;
  disabled?: boolean;
}

/**
 * Evidencias: tomar foto con la cámara o abrir la galería / archivos (varias fotos o PDF a la vez), con miniaturas y contador.
 * Las fotos se reducen antes de quedar en la lista (se suben más rápido). Con `obligatorio` avisa que falta adjuntar.
 */
export function EvidenciasArchivos({ archivos, onCambio, titulo = 'Evidencias', ayuda = 'Fotos de la mercadería, guía de remisión o factura', obligatorio, mostrarError, max = 12, soloImagenes, disabled }: Props) {
  const [urls, setUrls] = useState<Array<string | null>>([]);
  const [procesando, setProcesando] = useState(false);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const u = archivos.map(f => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null));
    setUrls(u);
    return () => u.forEach(x => { if (x) URL.revokeObjectURL(x); });
  }, [archivos]);

  async function agregar(e: ChangeEvent<HTMLInputElement>) {
    const nuevas = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!nuevas.length) return;
    setProcesando(true);
    try {
      const listas = await Promise.all(nuevas.map(prepararEvidencia));
      // Con un solo lugar, la foto nueva reemplaza a la anterior
      onCambio(max === 1 ? listas.slice(0, 1) : [...archivos, ...listas].slice(0, max));
    } finally {
      setProcesando(false);
    }
  }

  const falta = obligatorio && archivos.length === 0;
  return (
    <div className={`evid${falta && mostrarError ? ' evid--error' : ''}`}>
      <div className="evid__cab">
        <div>
          <h4 className="evid__titulo">{titulo}{obligatorio && <span className="evid__req" title="Obligatorio"> *</span>}</h4>
          <small>{ayuda}</small>
        </div>
        <span className={`evid__chip${archivos.length ? ' evid__chip--ok' : ''}`}>{archivos.length} {archivos.length === 1 ? 'archivo' : 'archivos'}</span>
      </div>

      <div className="evid__botones">
        <button type="button" className="btn btn--primary" disabled={disabled || procesando || (max > 1 && archivos.length >= max)} onClick={() => camara.current?.click()}>
          <Camera size={16} /> Tomar foto
        </button>
        <button type="button" className="btn btn--secondary" disabled={disabled || procesando || (max > 1 && archivos.length >= max)} onClick={() => galeria.current?.click()}>
          <Images size={16} /> Galería o archivos
        </button>
        <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={agregar} />
        <input ref={galeria} type="file" accept={soloImagenes ? 'image/*' : 'image/*,application/pdf'} multiple={max > 1} hidden onChange={agregar} />
      </div>

      {archivos.length === 0 ? (
        <div className={`evid__vacio${falta && mostrarError ? ' evid__vacio--error' : ''}`} role={falta && mostrarError ? 'alert' : undefined}>
          {obligatorio ? 'Adjunta al menos una foto o documento. Puedes tomar varias fotos o elegir varios archivos a la vez.' : 'Sin archivos. Toma una foto o elige desde tu galería.'}
        </div>
      ) : (
        <div className="evid__grid">
          {archivos.map((f, i) => (
            <div key={`${f.name}-${f.size}-${i}`} className="evid__item">
              {urls[i]
                ? <img src={urls[i] as string} alt={`Evidencia ${i + 1}`} onClick={() => window.open(urls[i] as string, '_blank', 'noopener')} />
                : <span className="evid__doc"><FileText size={22} /><small>{f.name}</small></span>}
              <button type="button" aria-label={`Quitar ${f.name}`} disabled={disabled} onClick={() => onCambio(archivos.filter((_, j) => j !== i))}><X size={14} /></button>
            </div>
          ))}
          {procesando && <div className="evid__item evid__item--cargando" aria-label="Preparando foto…"><span className="spinner" aria-hidden /></div>}
        </div>
      )}
    </div>
  );
}
