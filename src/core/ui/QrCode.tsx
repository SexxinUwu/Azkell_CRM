import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { spring } from '../lib/motion';

// El generador de QR se descarga solo cuando hace falta: no pesa en la carga inicial.
export async function qrSvg(text: string) {
  const mod = await import('qrcode');
  // Paquete CommonJS: según el empaquetado, las funciones llegan en `default` o sueltas.
  const QR = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
  return QR.toString(text, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M', // tolera polvo o un rasguño en el parabrisas
    color: { dark: '#1d1d1f', light: '#ffffff' },
  });
}

export function QrCode({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setSvg(null);
    qrSvg(value).then(s => alive && setSvg(s));
    return () => { alive = false; };
  }, [value]);

  return (
    <div className="qr" style={{ width: size, height: size }} role="img" aria-label={label}>
      {svg && (
        <motion.div
          className="qr__svg"
          initial={{ opacity: 0, scale: 0.94, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={spring}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
}
