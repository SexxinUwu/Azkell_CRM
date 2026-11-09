import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { recargarVersionNueva } from '../ui/LimiteDeError';

const CADA_MS = 30_000;

async function leerVersion(): Promise<string | null> {
  try {
    const r = await fetch('/api/version', { cache: 'no-store' });
    if (!r.ok) return null;
    const d = (await r.json()) as { version?: string };
    return d.version ? String(d.version) : null;
  } catch { return null; }
}

/**
 * Detecta cuándo se publicó una versión nueva mientras la pestaña estaba abierta.
 * - Consulta la versión al abrir, cada 30 s y al volver a la pestaña.
 * - Si cambió, avisa con un botón «Actualizar» y, además, recarga solo al cambiar de pantalla: así nunca se piden
 *   módulos de la versión anterior (que ya no existen) y no aparecen errores al navegar durante un despliegue.
 */
export function VigilanteVersion() {
  const inicial = useRef<string | null>(null);
  const hayNueva = useRef(false);
  const [aviso, setAviso] = useState(false);
  const { pathname } = useLocation();

  async function revisar() {
    const v = await leerVersion();
    if (!v) return; // sin respuesta (el servidor se está reiniciando): se vuelve a intentar luego
    if (inicial.current === null) { inicial.current = v; return; }
    if (v !== inicial.current && !hayNueva.current) { hayNueva.current = true; setAviso(true); }
  }

  useEffect(() => {
    void revisar();
    const t = window.setInterval(() => { void revisar(); }, CADA_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') void revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al cambiar de pantalla: se comprueba al instante y, si hay versión nueva, se carga ya la pantalla pedida con la versión nueva
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    void (async () => {
      if (!hayNueva.current) await revisar();
      if (hayNueva.current) window.location.reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <AnimatePresence>
      {aviso && (
        <motion.div className="vigilante-version" role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
          <span>Hay una versión nueva de Azkell.</span>
          <button type="button" onClick={recargarVersionNueva}><RefreshCw size={14} /> Actualizar</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
