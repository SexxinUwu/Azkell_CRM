import { Navigate } from 'react-router-dom';
import { useAuth } from '../../core/auth/AuthProvider';
import { ClientesPage } from '../directorio/ClientesPage';
import { ProveedoresPage } from '../almacen/ProveedoresPage';
import { EstacionesProveedoresPage } from '../operaciones/EstacionesProveedoresPage';
import { SelectorTerceros } from './SelectorTerceros';

/** Terceros › Clientes: la misma pantalla que antes estaba en Operaciones, ahora junto a los proveedores */
export function TercerosClientes() {
  return <ClientesPage eyebrow="Terceros" selector={<SelectorTerceros actual="clientes" />} />;
}

/** Terceros › Proveedores: la misma pantalla que antes estaba en Almacén */
export function TercerosProveedores() {
  return <ProveedoresPage eyebrow="Terceros" selector={<SelectorTerceros actual="proveedores" />} />;
}

/** Terceros › Estaciones de servicio: antes estaban en Operaciones › Combustible */
export function TercerosEstaciones() {
  return <EstacionesProveedoresPage eyebrow="Terceros" selector={<SelectorTerceros actual="estaciones" />} />;
}

/** Enlace anterior de Operaciones › Estaciones de proveedores */
export function RedirigirEstaciones() {
  return <Navigate to="/terceros/estaciones" replace />;
}

/** /terceros a secas abre los clientes */
export function RedirigirTerceros() {
  const { can } = useAuth();
  const a = can('clientes.crear', 'clientes.editar') ? 'clientes' : can('prov_inv.crear', 'prov_inv.editar') ? 'proveedores' : 'estaciones';
  return <Navigate to={`/terceros/${a}`} replace />;
}

/** Enlaces anteriores de Almacén › Proveedores */
export function RedirigirProveedores() {
  return <Navigate to="/terceros/proveedores" replace />;
}
