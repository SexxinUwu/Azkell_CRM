import { ArrowUpRight, Smartphone } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { abrirClasico } from '../../core/layout/navigation';

export function PortalConductorPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Personas y seguridad"
        title="Portal del conductor"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('operaciones/conductor-portal') },
          ]} />
        }
      />
      <EmptyState icon={<Smartphone size={28} />} title="Disponible en la versión actual">
        El portal del conductor con sus órdenes, reportes y checklist está en la versión actual.
      </EmptyState>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--s-4)' }}>
        <Button variant="primary" onClick={() => abrirClasico('operaciones/conductor-portal')}>
          Abrir portal del conductor
        </Button>
      </div>
    </Page>
  );
}
