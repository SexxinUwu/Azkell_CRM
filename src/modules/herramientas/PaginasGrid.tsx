import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { miniaturas, type PaginaOrden } from './motorPdf';

interface Item { id: number; indice: number; giro: number; url: string }

/**
 * Páginas del PDF como miniaturas: se pueden girar, borrar y cambiar de lugar (arrastrando o con las flechas).
 * Avisa con el orden final; las páginas borradas simplemente no aparecen en él.
 */
export function PaginasGrid({ archivo, onOrden, onError }: { archivo: File; onOrden: (o: PaginaOrden[]) => void; onError: (m: string) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [listo, setListo] = useState(false);
  const cargando = !listo;

  useEffect(() => {
    let cancelado = false;
    const urls: string[] = [];
    setItems([]); setTotal(0); setListo(false);
    miniaturas(archivo, 170, (i, url, n) => {
      urls.push(url);
      setTotal(n);
      setItems(prev => [...prev, { id: i, indice: i, giro: 0, url }]);
    }, () => cancelado).then(() => { if (!cancelado) setListo(true); }).catch(e => { if (!cancelado) onError(String((e as Error).message ?? e)); });
    return () => { cancelado = true; urls.forEach(u => URL.revokeObjectURL(u)); };
    // onError cambia en cada render del padre: solo importa el archivo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivo]);

  useEffect(() => { onOrden(items.map(({ indice, giro }) => ({ indice, giro }))); }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const girar = (id: number, g: number) => setItems(p => p.map(x => (x.id === id ? { ...x, giro: (((x.giro + g) % 360) + 360) % 360 } : x)));
  const quitar = (id: number) => setItems(p => p.filter(x => x.id !== id));
  const mover = (pos: number, d: -1 | 1) => setItems(p => { const c = [...p]; const j = pos + d; if (j < 0 || j >= c.length) return p; [c[pos], c[j]] = [c[j], c[pos]]; return c; });
  const llevarA = (destino: number) => setItems(p => {
    if (arrastrando === null || arrastrando === destino) return p;
    const de = p.findIndex(x => x.id === arrastrando); const a = p.findIndex(x => x.id === destino);
    if (de < 0 || a < 0) return p;
    const c = [...p]; const [m] = c.splice(de, 1); c.splice(a, 0, m); return c;
  });

  return (
    <div>
      {cargando && <p className="hp-ayuda" role="status">Preparando páginas… {items.length}{total ? ` de ${total}` : ''}</p>}
      <div className="hp-paginas">
        {items.map((it, pos) => (
          <div key={it.id} className={`hp-pag${arrastrando === it.id ? ' hp-pag--mov' : ''}`} draggable={!cargando}
            onDragStart={() => setArrastrando(it.id)} onDragEnd={() => setArrastrando(null)}
            onDragOver={e => { e.preventDefault(); llevarA(it.id); }}>
            <div className="hp-pag__vista">
              <img src={it.url} alt={`Página ${it.indice + 1}`} draggable={false} style={{ transform: `rotate(${it.giro}deg)`, maxWidth: it.giro % 180 ? '70%' : '100%', maxHeight: it.giro % 180 ? '70%' : '100%' }} />
            </div>
            <span className="hp-pag__num">{it.indice + 1}</span>
            <div className="hp-pag__acciones">
              <button type="button" className="hp-icono" aria-label="Mover antes" disabled={cargando || pos === 0} onClick={() => mover(pos, -1)}><ArrowLeft size={14} /></button>
              <button type="button" className="hp-icono" aria-label="Girar a la izquierda" disabled={cargando} onClick={() => girar(it.id, -90)}><RotateCcw size={14} /></button>
              <button type="button" className="hp-icono" aria-label="Girar a la derecha" disabled={cargando} onClick={() => girar(it.id, 90)}><RotateCw size={14} /></button>
              <button type="button" className="hp-icono hp-icono--peligro" aria-label="Borrar página" disabled={cargando} onClick={() => quitar(it.id)}><Trash2 size={14} /></button>
              <button type="button" className="hp-icono" aria-label="Mover después" disabled={cargando || pos === items.length - 1} onClick={() => mover(pos, 1)}><ArrowRight size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      {!cargando && items.length === 0 && <p className="hp-ayuda">Borraste todas las páginas. Elige otro archivo para empezar de nuevo.</p>}
    </div>
  );
}
