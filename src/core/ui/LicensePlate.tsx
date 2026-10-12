// Placa peruana dibujada: franja "PERÚ" y número. La reconoce cualquiera de un vistazo,
// así que reemplaza al texto plano en listas, fichas y escaneos.

export function LicensePlate({ plate, size, placeholder = 'ABC-123' }: { plate: string; size?: 'sm' | 'lg' | 'xl'; placeholder?: string }) {
  const empty = !plate;
  return (
    <span
      className={`plate${size ? ` plate--${size}` : ''}${empty ? ' plate--empty' : ''}`}
      role="img"
      aria-label={empty ? 'Placa sin escribir' : `Placa ${plate}`}
    >
      <span className="plate__band" aria-hidden>PERÚ</span>
      <span className="plate__number" aria-hidden>{empty ? placeholder : plate}</span>
    </span>
  );
}
