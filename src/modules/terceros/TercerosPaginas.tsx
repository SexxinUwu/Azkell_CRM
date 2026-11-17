import { Navigate } from 'react-router-dom';
import { ClientesPage } from '../directorio/ClientesPage';
import { ProveedoresPage } from '../almacen/ProveedoresPage';
import { SelectorTerceros } from './SelectorTerceros';

/** Terceros › Clientes: la misma pantalla que antes estaba en Operaciones, ahora junto a los proveedores */
export function TercerosClientes() {
  return <ClientesPage eyebrow="Terceros" selector={<SelectorTerceros actual="clientes" />} />;
}

/** Terceros › Proveedores: la misma pantalla que antes estaba en Almacén */
export function TercerosProveedores() {
  return <ProveedoresPage eyebrow="Terceros" selector={<SelectorTerceros actual="proveedores" />} />;
}

/** /terceros a secas abre los clientes */
export function RedirigirTerceros() {
  return <Navigate to="/terceros/clientes" replace />;
}

/** Enlaces anteriores de Almacén › Proveedores */
export function RedirigirProveedores() {
  return <Navigate to="/terceros/proveedores" replace />;
}
