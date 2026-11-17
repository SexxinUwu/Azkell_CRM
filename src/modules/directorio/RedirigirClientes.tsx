import { Navigate } from 'react-router-dom';

// Clientes pasó a Terceros: los enlaces guardados de /operaciones/clientes, /directorio/clientes y /flota/clientes siguen funcionando
export function RedirigirClientes() {
  return <Navigate to="/terceros/clientes" replace />;
}
