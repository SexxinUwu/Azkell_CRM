import { ArrowUpRight, ClipboardList } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { abrirClasico } from '../../core/layout/navigation';

export function OrdenesServicioPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Órdenes de servicio"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('operaciones/ordenes-servicio') },
          ]} />
        }
      />
      <EmptyState icon={<ClipboardList size={22} />} title="Abre en la versión actual">
        <Button variant="primary" onClick={() => abrirClasico('operaciones/ordenes-servicio')}>
          Abrir en la versión actual
        </Button>
      </EmptyState>
    </Page>
  );
}
