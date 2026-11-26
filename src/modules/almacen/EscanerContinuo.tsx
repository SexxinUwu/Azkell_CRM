import { useEffect, useRef, useState } from 'react';
import { cargarLector, FORMATOS, type LectorInstancia, type VentanaLector } from './EscanerCodigo';

const ID_LECTOR = 'picking-escaner-lector';

/**
 * Cámara que sigue leyendo códigos de barras y QR sin cerrarse (para el picking). Cada lectura se avisa una sola vez;
 * el mismo código vuelve a contar si pasan 1,5 segundos (para pistolear el mismo artículo varias veces).
 */
export function EscanerContinuo({ activo, onLeido }: { activo: boolean; onLeido: (codigo: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const instancia = useRef<LectorInstancia | null>(null);
  const ultimo = useRef<{ codigo: string; t: number }>({ codigo: '', t: 0 });
  const leidoRef = useRef(onLeido);
  leidoRef.current = onLeido;

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    setError(null);
    setCargando(true);
    (async () => {
      try {
        await cargarLector();
        if (cancelado) return;
        const w = window as VentanaLector;
        if (!w.Html5Qrcode) throw new Error('El lector de códigos no está disponible');
        const formatos = w.Html5QrcodeSupportedFormats
          ? FORMATOS.map(f => w.Html5QrcodeSupportedFormats?.[f]).filter((f): f is number => typeof f === 'number')
          : undefined;
        const lector = new w.Html5Qrcode(ID_LECTOR, { formatsToSupport: formatos, verbose: false });
        instancia.current = lector;
        await lector.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: (ancho: number, alto: number) => ({ width: Math.min(ancho * 0.9, 420), height: Math.min(alto * 0.7, 150) }) },
          texto => {
            const codigo = texto.trim();
            const t = Date.now();
            if (!codigo || (codigo === ultimo.current.codigo && t - ultimo.current.t < 1500)) return;
            ultimo.current = { codigo, t };
            leidoRef.current(codigo);
          },
          () => { /* cuadro sin código: se sigue buscando */ },
        );
      } catch (err) {
        if (!cancelado) setError(err instanceof Error ? err.message : 'No se pudo abrir la cámara');
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
      const lector = instancia.current;
      instancia.current = null;
      if (lector) lector.stop().catch(() => undefined).finally(() => { try { lector.clear?.(); } catch { /* nada */ } });
    };
  }, [activo]);

  if (!activo) return null;
  return (
    <div className="pk-camara">
      <div id={ID_LECTOR} className="pk-camara__video" />
      {cargando && <p className="pk-camara__aviso">Abriendo la cámara…</p>}
      {error && <p className="pk-camara__aviso pk-camara__aviso--error">{error}. Puedes escribir el código abajo.</p>}
    </div>
  );
}
