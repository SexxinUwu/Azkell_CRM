import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, FileText, Images, Play, Trash2, Video, X } from 'lucide-react';
import { VisorFotos } from '../../core/ui/VisorFotos';
import { useToast } from '../../core/ui/Toast';
import { errorMessage } from '../../core/api/client';
import { prepararEvidencia } from '../../core/lib/imagen';
import { quitarFotoSiniestro, useFotosSiniestro, type FotoSiniestro } from './siniestrosApi';

/** Tamaño máximo por archivo (el servidor también lo valida) */
export const MAX_ARCHIVO_MB = 100;
export const MAX_ARCHIVOS = 30;

export type TipoAdjunto = 'foto' | 'video' | 'pdf';
export const tipoDeFile = (f: File): TipoAdjunto => (f.type.startsWith('video/') ? 'video' : f.type === 'application/pdf' || /\.pdf$/i.test(f.name) ? 'pdf' : 'foto');

/** «3 fotos · 1 video · 2 PDF» */
export function resumenAdjuntos(tipos: TipoAdjunto[]): string {
  const n = (t: TipoAdjunto) => tipos.filter(x => x === t).length;
  const partes = [
    n('foto') ? `${n('foto')} ${n('foto') === 1 ? 'foto' : 'fotos'}` : '',
    n('video') ? `${n('video')} ${n('video') === 1 ? 'video' : 'videos'}` : '',
    n('pdf') ? `${n('pdf')} PDF` : '',
  ].filter(Boolean);
  return partes.join(' · ') || 'Sin archivos';
}

/**
 * Evidencias del daño: fotos, videos y PDF, todos juntos. Se muestran los ya guardados (con visor y opción de quitar)
 * y los nuevos por subir. Las fotos se reducen antes de quedar en la lista; los videos y PDF van tal cual.
 * Se puede tomar la foto o grabar el video con la cámara, o elegir varios archivos a la vez de la galería.
 */
export function AdjuntosSiniestro({ siniestroId, nuevos, onNuevos, puedeQuitar, disabled }: {
  siniestroId: number | null; nuevos: File[]; onNuevos: (a: File[]) => void; puedeQuitar: boolean; disabled?: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const guardados = useFotosSiniestro(siniestroId);
  const camara = useRef<HTMLInputElement>(null);
  const grabadora = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [visor, setVisor] = useState<number | null>(null);
  const [quitando, setQuitando] = useState<number | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const lista = guardados.data ?? [];
  const lleno = lista.length + nuevos.length >= MAX_ARCHIVOS;

  useEffect(() => {
    const u = nuevos.map(f => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach(x => URL.revokeObjectURL(x));
  }, [nuevos]);

  async function agregar(e: ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!elegidos.length) return;
    setAviso(null);
    const validos = elegidos.filter(f => /^(image|video)\//.test(f.type) || f.type === 'application/pdf' || /\.(pdf|heic|heif|mov|mp4|m4v|3gp|webm)$/i.test(f.name));
    const grandes = validos.filter(f => f.size > MAX_ARCHIVO_MB * 1024 * 1024);
    const aceptados = validos.filter(f => f.size <= MAX_ARCHIVO_MB * 1024 * 1024);
    const avisos: string[] = [];
    if (validos.length < elegidos.length) avisos.push('Algún archivo no es foto, video ni PDF y se omitió.');
    if (grandes.length) avisos.push(`${grandes.map(f => f.name).join(', ')} pesa más de ${MAX_ARCHIVO_MB} MB y se omitió.`);
    setProcesando(true);
    try {
      const listos = await Promise.all(aceptados.map(f => (tipoDeFile(f) === 'foto' ? prepararEvidencia(f) : Promise.resolve(f))));
      const cupo = MAX_ARCHIVOS - lista.length - nuevos.length;
      if (listos.length > cupo) avisos.push(`Se pueden adjuntar hasta ${MAX_ARCHIVOS} archivos por siniestro.`);
      onNuevos([...nuevos, ...listos.slice(0, Math.max(0, cupo))]);
    } finally {
      setProcesando(false);
      setAviso(avisos.length ? avisos.join(' ') : null);
    }
  }

  async function quitar(f: FotoSiniestro) {
    if (!siniestroId) return;
    setQuitando(f.id);
    try {
      const r = await quitarFotoSiniestro(siniestroId, f.id);
      if (r.ok === false) throw new Error(r.error || 'No se pudo quitar el archivo');
      toast('Archivo quitado');
      await qc.invalidateQueries({ queryKey: ['mant', 'siniestros'] });
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setQuitando(null);
    }
  }

  // Visor: solo fotos y videos (los PDF se abren aparte)
  const visibles = lista.filter(f => f.tipo !== 'pdf');
  const abrir = (f: FotoSiniestro) => {
    if (f.tipo === 'pdf') { window.open(f.url, '_blank', 'noopener'); return; }
    setVisor(visibles.findIndex(v => v.id === f.id));
  };
  const ocupado = disabled || procesando;

  return (
    <div className="sin-adj">
      <div className="sin-adj__botones">
        <button type="button" className="btn btn--primary" disabled={ocupado || lleno} onClick={() => camara.current?.click()}><Camera size={16} /> Tomar foto</button>
        <button type="button" className="btn btn--secondary" disabled={ocupado || lleno} onClick={() => grabadora.current?.click()}><Video size={16} /> Grabar video</button>
        <button type="button" className="btn btn--secondary" disabled={ocupado || lleno} onClick={() => galeria.current?.click()}><Images size={16} /> Elegir archivos</button>
        <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={agregar} />
        <input ref={grabadora} type="file" accept="video/*" capture="environment" hidden onChange={agregar} />
        <input ref={galeria} type="file" accept="image/*,video/*,application/pdf" multiple hidden onChange={agregar} />
      </div>
      <p className="sin-adj__ayuda">Fotos, videos y PDF todos juntos: puedes elegir varios a la vez (hasta {MAX_ARCHIVO_MB} MB cada uno). Se suben al guardar.</p>
      {aviso && <p className="sin-adj__aviso" role="alert">{aviso}</p>}

      {lista.length > 0 && (
        <>
          <h4 className="sin-adj__titulo">Ya guardados · {resumenAdjuntos(lista.map(f => f.tipo))}</h4>
          <div className="sin-adj__grid" aria-label="Archivos guardados">
            {lista.map((f, i) => (
              <div key={f.id} className="sin-adj__item">
                <button type="button" className="sin-adj__vista" aria-label={`Ver ${f.tipo === 'pdf' ? 'PDF' : f.tipo === 'video' ? 'video' : 'foto'} ${i + 1}`} onClick={() => abrir(f)}>
                  {f.tipo === 'foto' && <img src={f.url} alt={`Daño ${i + 1}`} loading="lazy" />}
                  {f.tipo === 'video' && <><video src={`${f.url}#t=0.1`} preload="metadata" muted playsInline /><span className="sin-adj__play"><Play size={18} fill="currentColor" /></span></>}
                  {f.tipo === 'pdf' && <span className="sin-adj__doc"><FileText size={24} /><small>{f.nombre || 'PDF'}</small></span>}
                </button>
                {puedeQuitar && (
                  <button type="button" className="sin-adj__quitar" aria-label="Quitar archivo" title="Quitar archivo" disabled={quitando === f.id} onClick={() => { void quitar(f); }}><Trash2 size={13} /></button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {(nuevos.length > 0 || procesando) && (
        <>
          <h4 className="sin-adj__titulo">Por subir · {resumenAdjuntos(nuevos.map(tipoDeFile))}</h4>
          <div className="sin-adj__grid" aria-label="Archivos por subir">
            {nuevos.map((f, i) => {
              const t = tipoDeFile(f);
              return (
                <div key={`${f.name}-${f.size}-${i}`} className="sin-adj__item">
                  <div className="sin-adj__vista" aria-hidden={false}>
                    {t === 'foto' && urls[i] && <img src={urls[i]} alt={`Nuevo ${i + 1}`} />}
                    {t === 'video' && urls[i] && <><video src={`${urls[i]}#t=0.1`} preload="metadata" muted playsInline /><span className="sin-adj__play"><Play size={18} fill="currentColor" /></span></>}
                    {t === 'pdf' && <span className="sin-adj__doc"><FileText size={24} /><small>{f.name}</small></span>}
                  </div>
                  <button type="button" className="sin-adj__quitar" aria-label={`Quitar ${f.name}`} title="Quitar" disabled={disabled} onClick={() => onNuevos(nuevos.filter((_, j) => j !== i))}><X size={14} /></button>
                </div>
              );
            })}
            {procesando && <div className="sin-adj__item sin-adj__item--cargando" aria-label="Preparando archivos…"><span className="spinner" aria-hidden /></div>}
          </div>
        </>
      )}

      {lista.length === 0 && nuevos.length === 0 && !procesando && <p className="sin-adj__vacio">Aún no hay archivos. Es opcional, pero ayuda a documentar el daño.</p>}

      <VisorFotos open={visor !== null && visor >= 0} onClose={() => setVisor(null)} indiceInicial={Math.max(0, visor ?? 0)} titulo="Evidencias del daño"
        fotos={visibles.map((f, i) => ({ url: f.url, titulo: `${f.tipo === 'video' ? 'Video' : 'Foto'} ${i + 1}`, tipo: f.tipo === 'video' ? 'video' : 'foto' }))} />
    </div>
  );
}
