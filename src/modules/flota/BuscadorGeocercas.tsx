import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { GeocercaMapa } from './api';

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Buscador de geocercas del mapa de telemetría: se escribe parte del nombre, aparece la lista con cuántas unidades hay
 * dentro de cada una y, al elegirla, el mapa vuela hasta ella y la resalta.
 */
export function BuscadorGeocercas({ geocercas, contar, onElegir, elegida, onCerrar }: {
  geocercas: GeocercaMapa[];
  /** Unidades dentro de cada geocerca ahora mismo */
  contar: () => Map<string, number>;
  onElegir: (id: string | null) => void;
  elegida: string | null;
  onCerrar: () => void;
}) {
  const [q, setQ] = useState('');
  const [, refrescar] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  useEffect(() => { entrada.current?.focus(); }, []);
  // Los conteos cambian con el GPS: se actualizan mientras el panel está abierto
  useEffect(() => { const t = setInterval(() => refrescar(n => n + 1), 5000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  const conteo = contar();
  const lista = useMemo(() => {
    const t = sinTildes(q.trim());
    return geocercas.filter(g => !t || sinTildes(g.name).includes(t)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [geocercas, q]);

  return (
    <div className="tg-geo tg-glass" role="dialog" aria-label="Buscar geocerca">
      <div className="tg-geo__cab">
        <Search size={16} aria-hidden />
        <input ref={entrada} className="tg-geo__input" type="search" placeholder={`Buscar entre ${geocercas.length} geocercas`} value={q} onChange={e => setQ(e.target.value)} aria-label="Nombre de la geocerca" />
        <button type="button" className="tg-geo__x" onClick={onCerrar} aria-label="Cerrar"><X size={16} /></button>
      </div>
      {elegida && <button type="button" className="tg-geo__quitar" onClick={() => onElegir(null)}>Quitar resaltado</button>}
      <ul className="tg-geo__lista">
        {lista.length === 0 && <li className="tg-geo__vacio">{geocercas.length === 0 ? 'No hay geocercas cargadas.' : 'Ninguna geocerca coincide.'}</li>}
        {lista.slice(0, 60).map(g => {
          const n = conteo.get(g.id) ?? 0;
          return (
            <li key={g.id}>
              <button type="button" className={`tg-geo__fila${g.id === elegida ? ' tg-geo__fila--on' : ''}`} onClick={() => onElegir(g.id)}>
                <span className="tg-geo__punto" style={{ background: g.color }} aria-hidden />
                <span className="tg-geo__nombre">{g.name}</span>
                <span className={`tg-geo__n${n > 0 ? ' tg-geo__n--on' : ''}`}>{n > 0 ? `${n} ${n === 1 ? 'unidad' : 'unidades'}` : 'vacía'}</span>
              </button>
            </li>
          );
        })}
        {lista.length > 60 && <li className="tg-geo__vacio">Hay {lista.length - 60} más: escribe para acotar.</li>}
      </ul>
    </div>
  );
}
