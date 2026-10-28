import { useEffect, useId, useRef, useState } from 'react';
import { Sheet } from '../../core/ui/Sheet';
import { Notice } from '../../core/ui/Display';

// Escáner de códigos QR y de barras con la misma librería del clásico (/libs/html5-qrcode.min.js).
// La librería se carga solo al abrir el escáner y la cámara se apaga al cerrarlo.

interface Html5QrcodeInstancia {
  start(camara: unknown, config: unknown, alLeer: (texto: string) => void, alFallar?: () => void): Promise<unknown>;
  stop(): Promise<void>;
  clear(): void;
}
type Html5QrcodeCtor = new (elementoId: string) => Html5QrcodeInstancia;

let cargaPendiente: Promise<void> | null = null;

function cargarLibreria(): Promise<Html5QrcodeCtor> {
  const ventana = window as unknown as { Html5Qrcode?: Html5QrcodeCtor };
  if (ventana.Html5Qrcode) return Promise.resolve(ventana.Html5Qrcode);
  if (!cargaPendiente) {
    cargaPendiente = new Promise<void>((resolver, rechazar) => {
      const script = document.createElement('script');
      script.src = '/libs/html5-qrcode.min.js';
      script.async = true;
      script.onload = () => resolver();
      script.onerror = () => {
        cargaPendiente = null;
        rechazar(new Error('No se pudo cargar el lector de códigos'));
      };
      document.head.appendChild(script);
    });
  }
  return cargaPendiente.then(() => {
    const ctor = (window as unknown as { Html5Qrcode?: Html5QrcodeCtor }).Html5Qrcode;
    if (!ctor) throw new Error('El lector de códigos no está disponible');
    return ctor;
  });
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Llamado una sola vez con el texto del primer código leído */
  onLeido: (texto: string) => void;
  titulo?: string;
}

export function EscanerQr({ open, onClose, onLeido, titulo = 'Escanear código' }: Props) {
  const elementoId = `qr-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [error, setError] = useState<string | null>(null);
  const yaLeido = useRef(false);
  const alLeerRef = useRef(onLeido);
  alLeerRef.current = onLeido;

  useEffect(() => {
    if (!open) return;
    yaLeido.current = false;
    setError(null);
    let cancelado = false;
    let instancia: Html5QrcodeInstancia | null = null;
    // Espera un instante a que la hoja tenga montado el contenedor de la cámara
    const espera = window.setTimeout(() => {
      cargarLibreria()
        .then(Ctor => {
          if (cancelado) return undefined;
          instancia = new Ctor(elementoId);
          return instancia.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, texto => {
            if (yaLeido.current) return;
            yaLeido.current = true;
            alLeerRef.current(texto);
          }, () => { /* cuadros sin código: se ignoran */ });
        })
        .catch(err => {
          if (!cancelado) setError(err instanceof Error ? err.message : 'No se pudo abrir la cámara');
        });
    }, 150);
    return () => {
      cancelado = true;
      window.clearTimeout(espera);
      const activa = instancia;
      if (activa) {
        activa.stop().catch(() => {}).finally(() => { try { activa.clear(); } catch { /* ya limpio */ } });
      }
    };
  }, [open, elementoId]);

  return (
    <Sheet open={open} onClose={onClose} title={titulo}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--s-3)' }}>
        <div id={elementoId} style={{ width: '100%', maxWidth: 360, minHeight: 280, borderRadius: 16, overflow: 'hidden', background: '#000' }} />
        {error
          ? <Notice tone="error">{error}</Notice>
          : <p className="t-footnote c-secondary" style={{ margin: 0, textAlign: 'center' }}>Apunta la cámara al código del artículo. Se usa la cámara trasera del equipo.</p>}
      </div>
    </Sheet>
  );
}
