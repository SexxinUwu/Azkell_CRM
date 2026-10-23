import { Navigate, useSearchParams } from 'react-router-dom';

// Ruta antigua /mantenimiento/neumaticos (pantalla única con pestañas): ahora son dos pantallas.
// Se conservan los enlaces viejos: ?tab=analisis va a Análisis y el resto a Últimas inspecciones.
export function NeumaticosRedirect() {
  const [params] = useSearchParams();
  const tab = params.get('tab');
  if (tab === 'analisis') return <Navigate to="/mantenimiento/neumaticos-analisis" replace />;
  if (tab === 'requerimientos') return <Navigate to="/mantenimiento/neumaticos-ultimas?tab=requerimientos" replace />;
  return <Navigate to="/mantenimiento/neumaticos-ultimas" replace />;
}
