import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { haptic } from '../lib/haptics';
import { marcarNovedadesVistas, novedadesPendientes, type Novedad, type PaginaNovedad } from '../lib/novedades';

interface Hoja { novedad: Novedad; pagina: PaginaNovedad }

/**
 * Resumen de lo nuevo, una sola vez después de actualizar. Cada publicación trae varias páginas que se leen de a una,
 * con «Página 1 de 4» abajo. Lo ya visto queda en la pantalla Novedades del menú.
 */
export function Novedades() {
  const [pendientes, setPendientes] = useState<Novedad[]>([]);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const reducir = useReducedMotion();

  useEffect(() => { setPendientes(novedadesPendientes()); }, []);

  const hojas = useMemo<Hoja[]>(() => pendientes.flatMap(n => n.paginas.map(p => ({ novedad: n, pagina: p }))), [pendientes]);
  const cerrar = () => { marcarNovedadesVistas(); setPendientes([]); setI(0); };
  const ir = (n: number) => { if (n < 0 || n >= hojas.length) return; haptic('selection'); setDir(n > i ? 1 : -1); setI(n); };
  const hoja = hojas[i];
  const ultima = i === hojas.length - 1;

  return (
    <Sheet open={hojas.length > 0} onClose={cerrar} title="Qué hay de nuevo"
      footer={hoja && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', width: '100%' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span className="t-footnote c-secondary" style={{ fontWeight: 600 }}>Página {i + 1} de {hojas.length}</span>
            <div role="tablist" aria-label="Páginas" style={{ display: 'flex', gap: 6 }}>
              {hojas.map((_, k) => (
                <button key={k} type="button" role="tab" aria-selected={k === i} aria-label={`Ir a la página ${k + 1}`} onClick={() => ir(k)}
                  style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 999, border: 0, padding: 0, cursor: 'pointer', background: k === i ? 'var(--accent)' : 'var(--separator)', transition: 'width 0.25s cubic-bezier(0.32,0.72,0,1), background 0.2s ease' }} />
              ))}
            </div>
          </div>
          {i > 0 && <Button variant="secondary" onClick={() => ir(i - 1)}>Atrás</Button>}
          {ultima ? <Button variant="primary" onClick={cerrar}>Entendido</Button> : <Button variant="primary" onClick={() => ir(i + 1)}>Siguiente</Button>}
        </div>
      )}>
      {hoja && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', overflow: 'hidden' }}>
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.section key={i} custom={dir}
              initial={reducir ? { opacity: 0 } : { opacity: 0, x: 28 * dir }} animate={{ opacity: 1, x: 0 }} exit={reducir ? { opacity: 0 } : { opacity: 0, x: -28 * dir }}
              transition={{ type: 'spring', bounce: 0, duration: 0.35 }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', color: 'var(--accent-ink)' }}>
                <Sparkles size={16} aria-hidden /><small style={{ fontWeight: 700 }}>{hoja.novedad.fecha}</small>
              </div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', letterSpacing: '-0.01em', color: 'var(--label)' }}>{hoja.pagina.titulo}</h3>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', color: 'var(--label)', fontSize: '0.9375rem', lineHeight: 1.5 }}>
                {hoja.pagina.puntos.map(p => <li key={p}>{p}</li>)}
              </ul>
              {ultima && <Link to="/novedades" onClick={cerrar} className="t-footnote" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Ver todas las novedades</Link>}
            </motion.section>
          </AnimatePresence>
        </div>
      )}
    </Sheet>
  );
}
