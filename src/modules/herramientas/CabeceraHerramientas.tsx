import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { CATEGORIAS, deCategoria, type Herramienta } from './catalogo';

type Panel = 'convertir' | 'todas' | null;

/** Icono de una herramienta: cuadrito de color, como en el menú de referencia */
export function IconoHerramienta({ h, size = 16 }: { h: Herramienta; size?: number }) {
  const I = h.icono;
  return <span className="hp-ico" style={{ background: h.color }} aria-hidden><I size={size} strokeWidth={2} /></span>;
}

function ItemMenu({ h, onElegir }: { h: Herramienta; onElegir: () => void }) {
  return h.listo ? (
    <Link to={`/herramientas/${h.id}`} className="hp-item" onClick={onElegir}>
      <IconoHerramienta h={h} /><span>{h.titulo}</span>
    </Link>
  ) : (
    <Link to={`/herramientas/${h.id}`} className="hp-item hp-item--pronto" onClick={onElegir} title="Todavía no disponible">
      <IconoHerramienta h={h} /><span>{h.titulo}</span><em>Pronto</em>
    </Link>
  );
}

/**
 * Encabezado de Herramientas PDF: accesos directos (Unir, Dividir, Comprimir) y dos menús con todas las herramientas
 * agrupadas por categoría. Se cierra al elegir, con Esc o al tocar fuera.
 */
export function CabeceraHerramientas() {
  const [panel, setPanel] = useState<Panel>(null);
  const caja = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  useEffect(() => { setPanel(null); }, [pathname]);
  useEffect(() => {
    if (!panel) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setPanel(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [panel]);

  const alternar = (p: Exclude<Panel, null>) => setPanel(x => (x === p ? null : p));
  const cerrar = () => setPanel(null);
  const activo = (id: string) => pathname.endsWith(`/herramientas/${id}`);

  return (
    <header className="hp-cab" ref={caja}>
      <nav className="hp-barra" aria-label="Herramientas PDF">
        <Link to="/herramientas" className="hp-barra__inicio">Herramientas PDF</Link>
        <Link to="/herramientas/unir" className={`hp-barra__enlace${activo('unir') ? ' hp-barra__enlace--activo' : ''}`}>Unir PDF</Link>
        <Link to="/herramientas/dividir" className={`hp-barra__enlace${activo('dividir') ? ' hp-barra__enlace--activo' : ''}`}>Dividir PDF</Link>
        <Link to="/herramientas/comprimir" className={`hp-barra__enlace${activo('comprimir') ? ' hp-barra__enlace--activo' : ''}`}>Comprimir PDF</Link>
        <button type="button" className="hp-barra__enlace" aria-expanded={panel === 'convertir'} aria-haspopup="true" onClick={() => alternar('convertir')}>
          Convertir PDF <ChevronDown size={14} className={panel === 'convertir' ? 'hp-giro' : undefined} />
        </button>
        <button type="button" className="hp-barra__enlace" aria-expanded={panel === 'todas'} aria-haspopup="true" onClick={() => alternar('todas')}>
          Todas las herramientas PDF <ChevronDown size={14} className={panel === 'todas' ? 'hp-giro' : undefined} />
        </button>
      </nav>

      {panel === 'convertir' && (
        <div className="hp-panel hp-panel--2" role="menu">
          {CATEGORIAS.filter(c => c.id === 'a-pdf' || c.id === 'desde-pdf').map(c => (
            <section key={c.id} className="hp-col">
              <h3>{c.titulo}</h3>
              {deCategoria(c.id).map(h => <ItemMenu key={h.id} h={h} onElegir={cerrar} />)}
            </section>
          ))}
        </div>
      )}

      {panel === 'todas' && (
        <div className="hp-panel hp-panel--7" role="menu">
          {CATEGORIAS.map(c => (
            <section key={c.id} className="hp-col">
              <h3>{c.titulo}</h3>
              {deCategoria(c.id).map(h => <ItemMenu key={h.id} h={h} onElegir={cerrar} />)}
            </section>
          ))}
        </div>
      )}
    </header>
  );
}
