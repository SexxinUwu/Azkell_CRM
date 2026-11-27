import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { miniaturas } from './motorPdf';

/**
 * Páginas del PDF como miniaturas que se marcan con un toque. `tono` decide el color de la marca:
 * «borrar» (rojo, las que se quitan) o «guardar» (verde, las que se conservan).
 */
export function SelectorPaginas({ archivo, seleccion, onSeleccion, tono, onError }: {
  archivo: File;
  seleccion: Set<number>;
  onSeleccion: (s: Set<number>) => void;
  tono: 'borrar' | 'guardar';
  onError: (m: string) => void;
}) {
  const [vistas, setVistas] = useState<Array<string | null>>([]);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const urls: string[] = [];
    setVistas([]); setListo(false);
    miniaturas(archivo, 150, (i, url, n) => {
      urls.push(url);
      setVistas(prev => { const c = prev.length ? [...prev] : Array<string | null>(n).fill(null); c[i] = url; return c; });
    }, () => cancelado).then(() => { if (!cancelado) setListo(true); }).catch(e => { if (!cancelado) onError(String((e as Error).message ?? e)); });
    return () => { cancelado = true; urls.forEach(u => URL.revokeObjectURL(u)); };
    // onError cambia en cada render del padre: solo importa el archivo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivo]);

  const alternar = (i: number) => { const s = new Set(seleccion); if (s.has(i)) s.delete(i); else s.add(i); onSeleccion(s); };

  return (
    <div>
      {!listo && <p className="hp-ayuda" role="status">Preparando páginas…</p>}
      <div className="hp-paginas">
        {vistas.map((url, i) => {
          const marcada = seleccion.has(i);
          return (
            <button key={i} type="button" className={`hp-pag hp-pag--sel${marcada ? ` hp-pag--marca-${tono}` : ''}`} aria-pressed={marcada} aria-label={`Página ${i + 1}${marcada ? ' (marcada)' : ''}`} onClick={() => alternar(i)}>
              <div className="hp-pag__vista">{url ? <img src={url} alt="" draggable={false} /> : <span className="spinner" aria-hidden />}</div>
              <span className="hp-pag__num">{i + 1}</span>
              {marcada && <span className="hp-pag__check" aria-hidden><Check size={14} strokeWidth={3} /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
