import { Navigate } from 'react-router-dom';

// Clientes pasó al menú de Flota: los enlaces guardados de /directorio/clientes siguen funcionando
export function RedirigirClientes() {
  return <Navigate to="/flota/clientes" replace />;
}
