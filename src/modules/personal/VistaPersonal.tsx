import { useNavigate } from 'react-router-dom';
import { SegmentedControl } from '../../core/ui/SegmentedControl';

type Vista = 'personal' | 'vencimientos';
const RUTA: Record<Vista, string> = { personal: '/rrhh/personal', vencimientos: '/rrhh/documentos' };

/** RRHH › Personal tiene dos vistas en un mismo módulo: la lista con la ficha de cada persona y el tablero de vencimientos de documentos */
export function VistaPersonal({ actual }: { actual: Vista }) {
  const nav = useNavigate();
  return <SegmentedControl<Vista> label="Vista de personal" value={actual} onChange={v => nav(RUTA[v])}
    options={[{ value: 'personal', label: 'Personal' }, { value: 'vencimientos', label: 'Vencimientos' }]} />;
}
