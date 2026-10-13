import { ArrowUpRight, CalendarDays } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { abrirClasico } from '../../core/layout/navigation';

export function ProgramacionPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Programación"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('operaciones/programacion') },
          ]} />
        }
      />
      <EmptyState icon={<CalendarDays size={22} />} title="Abre en la versión actual">
        <Button variant="primary" onClick={() => abrirClasico('operaciones/programacion')}>
          Abrir en la versión actual
        </Button>
      </EmptyState>
    </Page>
  );
}
