import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { OTROS_MANTENIMIENTO } from './navigation';
import '../ui/otros-tarjetas.css';

// Botón "← Otros": aparece arriba de cada herramienta que se abre desde el hub de Otros y regresa a ese hub.
const RUTA_HUB = '/mantenimiento/otros';

export function VolverOtros() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const esHerramienta = OTROS_MANTENIMIENTO.some(i => {
    const ruta = i.to?.split('?')[0];
    return !!ruta && pathname.startsWith(ruta);
  });
  if (!esHerramienta) return null;
  return (
    <button type="button" className="otros-volver" onClick={() => navigate(RUTA_HUB)}>
      <ArrowLeft size={14} aria-hidden /> Otros
    </button>
  );
}
