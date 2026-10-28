import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../../core/ui/Sheet';
import { Button } from '../../core/ui/Button';
import { Notice } from '../../core/ui/Display';

// Escáner de códigos de barras y QR con la misma librería que el clásico (/libs/html5-qrcode.min.js, local).
// Se carga al primer uso. Si la cámara no está disponible, se puede escribir o pegar el código.

type Formatos = Record<string, number>;
interface LectorInstancia {
  start(camara: unknown, config: unknown, alLeer: (texto: string) => void, alFallar?: () => void): Promise<unknown>;
  stop(): Promise<void>;
  clear?: () => void;
}
type LectorClase = new (elemento: string, config?: unknown) => LectorInstancia;
type VentanaLector = Window & { Html5Qrcode?: LectorClase; Html5QrcodeSupportedFormats?: Formatos };

let cargaLector: Promise<void> | null = null;
function cargarLector(): Promise<void> {
  const w = window as VentanaLector;
  if (w.Html5Qrcode) return Promise.resolve();
  if (!cargaLector) {
    cargaLector = new Promise<void>((resolver, rechazar) => {
      const s = document.createElement('script');
      s.src = '/libs/html5-qrcode.min.js';
      s.async = true;
      s.onload = () => resolver();
      s.onerror = () => { cargaLector = null; rechazar(new Error('No se pudo cargar el lector de códigos')); };
      document.head.appendChild(s);
    });
  }
  return cargaLector;
}

const ID_LECTOR = 'salidas-escaner-lector';
const FORMATOS = ['QR_CODE', 'EAN_13', 'EAN_8', 'CODE_128', 'CODE_39', 'CODE_93', 'CODABAR', 'UPC_A', 'UPC_E', 'ITF', 'PDF_417', 'DATA_MATRIX'];

export function EscanerCodigo({ open, onClose, onLeido, titulo = 'Escanear código' }: {
  open: boolean;
  onClose: () => void;
  onLeido: (codigo: string) => void;
  titulo?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [manual, setManual] = useState('');
  const instancia = useRef<LectorInstancia | null>(null);
  const yaLeido = useRef(false);
  // Las funciones llegan nuevas en cada render; el efecto de la cámara no debe reiniciarse por eso
  const leidoRef = useRef(onLeido);
  leidoRef.current = onLeido;

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    yaLeido.current = false;
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
          { fps: 20, qrbox: (ancho: number, alto: number) => ({ width: Math.min(ancho * 0.9, 480), height: Math.min(alto * 0.6, 260) }) },
          texto => {
            if (yaLeido.current) return;
            yaLeido.current = true;
            leidoRef.current(texto.trim());
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
  }, [open]);

  function enviarManual() {
    const codigo = manual.trim();
    if (!codigo || yaLeido.current) return;
    yaLeido.current = true;
    onLeido(codigo);
  }

  return (
    <Sheet open={open} onClose={onClose} title={titulo}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div id={ID_LECTOR} style={{ width: '100%', minHeight: 240, borderRadius: 12, overflow: 'hidden', background: '#000' }} />
        {cargando && <p className="t-footnote" style={{ margin: 0 }}>Abriendo la cámara…</p>}
        {error && <Notice tone="error">{error}. Escribe el código abajo.</Notice>}
        <form style={{ display: 'flex', gap: 'var(--s-2)' }} onSubmit={e => { e.preventDefault(); enviarManual(); }}>
          <input className="input" value={manual} onChange={e => setManual(e.target.value)} placeholder="Código o número de parte"
            style={{ flex: 1, minHeight: 44, fontSize: '1rem' }} />
          <Button type="submit" variant="secondary" disabled={!manual.trim()}>Usar</Button>
        </form>
      </div>
    </Sheet>
  );
}
