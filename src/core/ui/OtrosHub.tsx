import type { CSSProperties, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Page, PageHeader } from './Display';
import './hub-tarjetas.css';

export interface CasillaHub { key: string; titulo: string; descripcion: string; icono: ReactNode; onAbrir: () => void }
export interface SeccionHub { titulo: string; /** Color de la sección: blue, green, violet, amber, teal o rose */ tono: 'blue' | 'green' | 'violet' | 'amber' | 'teal' | 'rose'; casillas: CasillaHub[] }

/**
 * Pantalla «Otros» de un módulo: casillas grandes por sección, cada una con su icono y su descripción.
 * Entra con un escalonado corto (solo transform y opacidad, rápido) y respeta «reducir movimiento».
 */
export function OtrosHub({ eyebrow, subtitle, secciones }: { eyebrow: string; subtitle: string; secciones: SeccionHub[] }) {
  let n = 0;
  return (
    <Page>
      <PageHeader eyebrow={eyebrow} title="Otros" subtitle={subtitle} />
      <div className="hub-panel">
        {secciones.filter(s => s.casillas.length > 0).map(s => (
          <section key={s.titulo} className={`hub-grupo hub-grupo--${s.tono}`}>
            <h2 className="hub-grupo__titulo"><span className="hub-grupo__punto" aria-hidden />{s.titulo}</h2>
            <div className="hub-tarjetas">
              {s.casillas.map(c => (
                <button key={c.key} type="button" className="hub-tile" style={{ ['--i' as string]: Math.min(n++, 14) } as CSSProperties} onClick={c.onAbrir}>
                  <span className="hub-tile__icono" aria-hidden>{c.icono}</span>
                  <span className="hub-tile__texto">
                    <span className="hub-tile__titulo">{c.titulo}</span>
                    <span className="hub-tile__detalle">{c.descripcion}</span>
                  </span>
                  <ChevronRight size={18} className="hub-tile__flecha" aria-hidden />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
