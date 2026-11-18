import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Page, PageHeader } from '../../core/ui/Display';
import { NOVEDADES, marcarNovedadesVistas, novedadVista } from '../../core/lib/novedades';

/** Novedades: todo lo que se ha publicado, lo más nuevo arriba. Lo que aún no habías visto lleva la marca «Nuevo». */
export function NovedadesPage() {
  // Se lee antes de marcar como visto, para que la marca «Nuevo» se vea en esta visita
  const [vista] = useState(novedadVista);
  const indiceVista = useMemo(() => NOVEDADES.findIndex(n => n.id === vista), [vista]);
  useEffect(() => { marcarNovedadesVistas(); }, []);

  return (
    <Page narrow>
      <PageHeader eyebrow="Sistema" title="Novedades" subtitle="Lo que se ha mejorado, de lo más reciente a lo más antiguo" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
        {NOVEDADES.map((n, k) => {
          const nueva = vista !== n.id && (indiceVista === -1 || k < indiceVista);
          return (
            <article key={n.id} className="tarjeta__lista" style={{ padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
              <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', color: 'var(--accent-ink)' }}>
                  <Sparkles size={16} aria-hidden /><small style={{ fontWeight: 700 }}>{n.fecha}</small>
                  {nueva && <span className="ot-estado ot-estado--green" style={{ marginLeft: 4 }}>Nuevo</span>}
                </div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', letterSpacing: '-0.01em' }}>{n.titulo}</h2>
              </header>
              {n.paginas.map((p, j) => (
                <section key={p.titulo} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', paddingTop: j ? 'var(--s-3)' : 0, borderTop: j ? '1px solid var(--separator)' : 0 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>{p.titulo}</h3>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', fontSize: '0.9375rem', lineHeight: 1.5 }}>
                    {p.puntos.map(t => <li key={t}>{t}</li>)}
                  </ul>
                </section>
              ))}
            </article>
          );
        })}
      </div>
    </Page>
  );
}
