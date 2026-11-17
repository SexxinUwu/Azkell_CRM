import { useNavigate } from 'react-router-dom';
import { SegmentedControl } from '../../core/ui/SegmentedControl';
import { useAuth } from '../../core/auth/AuthProvider';

type Grupo = 'administrativos' | 'conductores';
const RUTAS = {
  rrhh: { administrativos: '/rrhh/personal', conductores: '/rrhh/conductores' },
  directorio: { administrativos: '/directorio/personal', conductores: '/conductores' },
} as const;

/** Alterna entre el personal administrativo y los conductores (solo muestra lo que el usuario puede ver) */
export function SelectorPersonal({ modo, actual }: { modo: 'rrhh' | 'directorio'; actual: Grupo }) {
  const nav = useNavigate();
  const { can } = useAuth();
  const opciones = [
    can('rrhh_personal.ver') && { value: 'administrativos' as const, label: 'Administrativos' },
    can('cond.ver') && { value: 'conductores' as const, label: 'Conductores' },
  ].filter((o): o is { value: Grupo; label: string } => !!o);
  if (opciones.length < 2) return null;
  return <SegmentedControl<Grupo> label="Tipo de personal" value={actual} options={opciones} onChange={v => nav(RUTAS[modo][v])} />;
}
