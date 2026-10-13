import { ClipboardList, ArrowUpRight } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { abrirClasico } from '../../core/layout/navigation';

export function EntregaPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Entrega de vehículos"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('flota/entrega-vehiculos') },
          ]} />
        }
      />

      <EmptyState icon={<ClipboardList size={28} />} title="Disponible en la versión actual">
        El módulo de entrega y recepción de vehículos con actas de custodia está en la versión actual de la aplicación.
      </EmptyState>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--s-4)' }}>
        <Button variant="primary" onClick={() => abrirClasico('flota/entrega-vehiculos')}>
          Abrir entrega de vehículos
        </Button>
      </div>
    </Page>
  );
}
