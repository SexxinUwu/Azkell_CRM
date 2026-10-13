import { ArrowUpRight, Fuel } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { abrirClasico } from '../../core/layout/navigation';

export function ValesPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Vales de combustible"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('operaciones/combustible-vales') },
          ]} />
        }
      />
      <EmptyState icon={<Fuel size={22} />} title="Abre en la versión actual">
        <Button variant="primary" onClick={() => abrirClasico('operaciones/combustible-vales')}>
          Abrir en la versión actual
        </Button>
      </EmptyState>
    </Page>
  );
}
