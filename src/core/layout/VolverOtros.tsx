import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { OTROS_MANTENIMIENTO } from './navigation';
import '../ui/otros-tarjetas.css';

// Botón "← Otros": aparece arriba de cada herramienta que se abre desde el hub de Otros y regresa a ese hub.
const RUTA_HUB = '/mantenimiento/otros';

export function VolverOtros() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  // Una entrada con ?tab=… (como Backlog pendientes) solo cuenta cuando esa pestaña está abierta
  const esHerramienta = OTROS_MANTENIMIENTO.some(i => {
    const [ruta, query] = (i.to ?? '').split('?');
    if (!ruta || !pathname.startsWith(ruta)) return false;
    return !query || search.includes(query);
  });
  if (!esHerramienta) return null;
  return (
    <div className="otros-volver-fila">
      <button type="button" className="otros-volver" onClick={() => navigate(RUTA_HUB)}>
        <ArrowLeft size={18} strokeWidth={2.25} aria-hidden />
        <span>Otros</span>
      </button>
    </div>
  );
}
