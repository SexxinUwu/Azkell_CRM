import { ArrowUpRight, Layers } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { abrirClasico } from '../../core/layout/navigation';

export function AlmacenOtrosPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Almacén"
        title="Otros"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('almacen/otros') },
          ]} />
        }
      />
      <EmptyState icon={<Layers size={22} />} title="Abre en la versión actual">
        <Button variant="primary" onClick={() => abrirClasico('almacen/otros')}>
          Abrir en la versión actual
        </Button>
      </EmptyState>
    </Page>
  );
}
