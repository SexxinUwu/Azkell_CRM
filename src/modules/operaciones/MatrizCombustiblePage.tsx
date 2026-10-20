import { Page, PageHeader } from '../../core/ui/Display';
import { useAuth } from '../../core/auth/AuthProvider';
import { MatrizRendimientoPanel } from './MatrizRendimientoSheet';

// Operaciones › Matriz de combustible (D2): consumo teórico por sentido, ruta, motor, configuración y peso
export function MatrizCombustiblePage() {
  const { can } = useAuth();
  const puedeEditar = can('combustible_analisis.editar', 'combustible.editar', 'combustible_analisis.crear');
  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Matriz de combustible (D2)"
        subtitle="Consumo estándar en galones según sentido, ruta, motor, configuración y peso (0 a 30 Tn)."
      />
      <MatrizRendimientoPanel puedeEditar={puedeEditar} />
    </Page>
  );
}
