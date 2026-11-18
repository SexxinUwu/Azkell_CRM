import { useNavigate } from 'react-router-dom';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useAuth } from '../../core/auth/AuthProvider';

type Tercero = 'clientes' | 'proveedores' | 'estaciones';
const RUTA: Record<Tercero, string> = { clientes: '/terceros/clientes', proveedores: '/terceros/proveedores', estaciones: '/terceros/estaciones' };

/** Alterna entre clientes y proveedores dentro del mismo módulo (solo muestra lo que el usuario puede ver) */
export function SelectorTerceros({ actual }: { actual: Tercero }) {
  const nav = useNavigate();
  const { can } = useAuth();
  const opciones = [
    can('clientes.crear', 'clientes.editar') && { value: 'clientes' as const, label: 'Clientes' },
    can('prov_inv.crear', 'prov_inv.editar') && { value: 'proveedores' as const, label: 'Proveedores' },
    can('combustible_vales.crear', 'combustible_vales.editar') && { value: 'estaciones' as const, label: 'Estaciones de servicio' },
  ].filter((o): o is { value: Tercero; label: string } => !!o);
  if (opciones.length < 2) return null;
  return <SegmentedControl<Tercero> label="Tipo de tercero" value={actual} options={opciones} onChange={v => nav(RUTA[v])} />;
}
