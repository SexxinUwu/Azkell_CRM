import { Navigate } from 'react-router-dom';
import { ClientesPage } from './ClientesPage';
import { ProveedoresPage } from '../almacen/ProveedoresPage';
import { EstacionesProveedoresPage } from '../operaciones/EstacionesProveedoresPage';
import { RUTA_LIBRETA, SelectorDirectorio, useLibretas } from './SelectorDirectorio';

// Directorio: solo consulta. Quien necesita llamar a un cliente, proveedor o estación lo encuentra aquí;
// darlos de alta o editarlos es de Terceros.
export function DirectorioClientes() {
  return <ClientesPage soloLectura eyebrow="Directorio" selector={<SelectorDirectorio actual="clientes" />} />;
}
export function DirectorioProveedores() {
  return <ProveedoresPage soloLectura eyebrow="Directorio" selector={<SelectorDirectorio actual="proveedores" />} />;
}
export function DirectorioEstaciones() {
  return <EstacionesProveedoresPage soloLectura eyebrow="Directorio" selector={<SelectorDirectorio actual="estaciones" />} />;
}

/** /directorio abre la primera libreta que el usuario puede consultar */
export function RedirigirDirectorio() {
  const libretas = useLibretas();
  return <Navigate to={libretas.length ? RUTA_LIBRETA[libretas[0].value] : '/'} replace />;
}
