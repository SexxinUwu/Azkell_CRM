import { BarChart3 } from 'lucide-react';
import { EmptyState, Page, PageHeader } from '../../core/ui/Display';

/** Dashboard de almacén: en producción, se empieza de cero */
export function DashboardPage() {
  return (
    <Page>
      <PageHeader eyebrow="Almacén" title="Dashboard" subtitle="En producción" />
      <EmptyState icon={<BarChart3 size={22} />} title="En producción">
        Este dashboard se empieza desde cero.
      </EmptyState>
    </Page>
  );
}
