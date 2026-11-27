import { useRef, useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, FileText, Image as ImagenIcono, Upload, X } from 'lucide-react';
import { MAX_ARCHIVO_MB, tamano } from './motorPdf';

/** Zona para soltar o elegir archivos. Con `ordenable` se pueden subir, bajar y quitar (el orden es el del resultado). */
export function ZonaArchivos({ archivos, onChange, multiple, accept, tipo, etiqueta, ordenable, disabled, onAviso }: {
  archivos: File[];
  onChange: (a: File[]) => void;
  multiple?: boolean;
  accept: string;
  /** Qué se acepta: decide el filtro y el texto */
  tipo: 'pdf' | 'imagen';
  etiqueta: string;
  ordenable?: boolean;
  disabled?: boolean;
  onAviso?: (msg: string | null) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);

  const valido = (f: File) => (tipo === 'pdf' ? f.type === 'application/pdf' || /\.pdf$/i.test(f.name) : f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name));

  function agregar(lista: FileList | File[] | null) {
    const elegidos = Array.from(lista ?? []);
    if (!elegidos.length) return;
    const buenos = elegidos.filter(valido);
    const grandes = buenos.filter(f => f.size > MAX_ARCHIVO_MB * 1048576);
    const aceptados = buenos.filter(f => f.size <= MAX_ARCHIVO_MB * 1048576);
    const avisos: string[] = [];
    if (buenos.length < elegidos.length) avisos.push(tipo === 'pdf' ? 'Solo se aceptan archivos PDF.' : 'Solo se aceptan imágenes.');
    if (grandes.length) avisos.push(`${grandes.map(f => f.name).join(', ')} pesa más de ${MAX_ARCHIVO_MB} MB y se omitió.`);
    onAviso?.(avisos.length ? avisos.join(' ') : null);
    if (!aceptados.length) return;
    onChange(multiple ? [...archivos, ...aceptados] : [aceptados[0]]);
  }

  const soltar = (e: DragEvent) => { e.preventDefault(); setEncima(false); if (!disabled) agregar(e.dataTransfer.files); };
  const mover = (i: number, d: -1 | 1) => { const c = [...archivos]; [c[i], c[i + d]] = [c[i + d], c[i]]; onChange(c); };
  const Icono = tipo === 'pdf' ? FileText : ImagenIcono;

  return (
    <div className="hp-zona">
      <div
        className={`hp-zona__caja${encima ? ' hp-zona__caja--encima' : ''}${disabled ? ' hp-zona__caja--off' : ''}`}
        onDragOver={e => { e.preventDefault(); if (!disabled) setEncima(true); }} onDragLeave={() => setEncima(false)} onDrop={soltar}
      >
        <Upload size={28} aria-hidden />
        <button type="button" className="btn btn--primary" disabled={disabled} onClick={() => entrada.current?.click()}>{etiqueta}</button>
        <p>o suelta aquí {multiple ? 'los archivos' : 'el archivo'}</p>
        <input ref={entrada} type="file" hidden accept={accept} multiple={multiple} onChange={e => { agregar(e.target.files); e.target.value = ''; }} />
      </div>

      {archivos.length > 0 && (
        <ul className="hp-lista" aria-label="Archivos elegidos">
          {archivos.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="hp-lista__fila">
              <Icono size={18} aria-hidden />
              <span className="hp-lista__nombre">{f.name}</span>
              <span className="hp-lista__peso">{tamano(f.size)}</span>
              {ordenable && archivos.length > 1 && (
                <>
                  <button type="button" className="hp-icono" aria-label="Subir" disabled={disabled || i === 0} onClick={() => mover(i, -1)}><ArrowUp size={15} /></button>
                  <button type="button" className="hp-icono" aria-label="Bajar" disabled={disabled || i === archivos.length - 1} onClick={() => mover(i, 1)}><ArrowDown size={15} /></button>
                </>
              )}
              <button type="button" className="hp-icono" aria-label={`Quitar ${f.name}`} disabled={disabled} onClick={() => onChange(archivos.filter((_, j) => j !== i))}><X size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
