import { useState } from 'react';

// Marca de la empresa del subdominio: su logo (/api/tenant-logo, cuadrado, con el ícono de Azkell
// si la empresa no tiene logo) sobre una placa blanca redondeada.
export const LOGO_URL = '/api/tenant-logo';

export function BrandMark({ size = 32 }: { size?: number }) {
  const [error, setError] = useState(false);
  return (
    <span className="brand-mark" style={{ width: size, height: size, borderRadius: size * 0.27 }} aria-hidden>
      {!error && <img src={LOGO_URL} alt="" width={size} height={size} onError={() => setError(true)} draggable={false} />}
    </span>
  );
}

export function Wordmark() {
  return <span className="wordmark">AZKELL</span>;
}
