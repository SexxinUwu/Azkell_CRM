import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { NOVEDADES } from '../lib/novedades';

const CLAVE = 'fleet_novedades_vista';
const leer = (): string | null => { try { return localStorage.getItem(CLAVE); } catch { return null; } };
const guardar = (id: string) => { try { localStorage.setItem(CLAVE, id); } catch { /* sin almacenamiento */ } };

/**
 * Resumen de lo nuevo, una sola vez después de actualizar: cada entrada nueva de novedades.ts se le avisa una vez a cada persona
 * (en este navegador). Quien nunca lo vio recibe las últimas.
 */
export function Novedades() {
  const [pendientes, setPendientes] = useState<typeof NOVEDADES>([]);

  useEffect(() => {
    const ultima = NOVEDADES[0]?.id;
    if (!ultima) return;
    const vista = leer();
    if (vista === ultima) return;
    const i = NOVEDADES.findIndex(n => n.id === vista);
    setPendientes(NOVEDADES.slice(0, i === -1 ? 3 : Math.min(i, 3)));
  }, []);

  const cerrar = () => { guardar(NOVEDADES[0].id); setPendientes([]); };

  return (
    <Sheet open={pendientes.length > 0} onClose={cerrar} title="Qué hay de nuevo"
      footer={<Button variant="primary" onClick={cerrar}>Entendido</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
        {pendientes.map(n => (
          <section key={n.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', color: 'var(--accent-ink)' }}>
              <Sparkles size={16} aria-hidden /><small style={{ fontWeight: 700 }}>{n.fecha}</small>
            </div>
            <h3 style={{ margin: 0, fontSize: '1.125rem', color: 'var(--label)' }}>{n.titulo}</h3>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', color: 'var(--label)', fontSize: '0.9375rem', lineHeight: 1.45 }}>
              {n.puntos.map(p => <li key={p}>{p}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
