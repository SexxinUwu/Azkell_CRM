import { useNavigate } from 'react-router-dom';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useAuth } from '../../core/auth/AuthProvider';

export type Libreta = 'personal' | 'conductores' | 'clientes' | 'proveedores' | 'estaciones';
export const RUTA_LIBRETA: Record<Libreta, string> = {
  personal: '/directorio/personal', conductores: '/conductores', clientes: '/directorio/clientes',
  proveedores: '/directorio/proveedores', estaciones: '/directorio/estaciones',
};

/** Libretas que el usuario puede consultar, en el orden en que se ofrecen */
export function useLibretas(): Array<{ value: Libreta; label: string }> {
  const { can } = useAuth();
  return [
    can('rrhh_personal.ver') && { value: 'personal' as const, label: 'Personal' },
    can('cond.ver') && { value: 'conductores' as const, label: 'Conductores' },
    can('clientes.ver') && { value: 'clientes' as const, label: 'Clientes' },
    can('prov_inv.ver') && { value: 'proveedores' as const, label: 'Proveedores' },
    can('combustible_vales.ver') && { value: 'estaciones' as const, label: 'Estaciones' },
  ].filter((o): o is { value: Libreta; label: string } => !!o);
}

/** Alterna entre las libretas del Directorio: solo consulta, para llamar o escribir a alguien */
export function SelectorDirectorio({ actual }: { actual: Libreta }) {
  const nav = useNavigate();
  const opciones = useLibretas();
  if (opciones.length < 2) return null;
  return <SegmentedControl<Libreta> label="Libreta del directorio" value={actual} options={opciones} onChange={v => nav(RUTA_LIBRETA[v])} />;
}
