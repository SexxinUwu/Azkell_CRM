import { ArrowUpRight, Truck } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { abrirClasico } from '../../core/layout/navigation';

export function MarsisaOrdenesViajePage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones · Marsisa"
        title="Órdenes de viaje Marsisa"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('operaciones/marsisa-ordenes-viaje') },
          ]} />
        }
      />
      <EmptyState icon={<Truck size={22} />} title="Abre en la versión actual">
        <Button variant="primary" onClick={() => abrirClasico('operaciones/marsisa-ordenes-viaje')}>
          Abrir en la versión actual
        </Button>
      </EmptyState>
    </Page>
  );
}
