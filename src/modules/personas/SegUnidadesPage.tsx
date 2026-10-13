import { ArrowUpRight, Shield } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { abrirClasico } from '../../core/layout/navigation';

export function SegUnidadesPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Personas y seguridad"
        title="Garita: unidades"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('seguridad/unidades') },
          ]} />
        }
      />
      <EmptyState icon={<Shield size={28} />} title="Disponible en la versión actual">
        El módulo de Garita con registro de entradas y salidas de unidades está en la versión actual.
      </EmptyState>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--s-4)' }}>
        <Button variant="primary" onClick={() => abrirClasico('seguridad/unidades')}>
          Abrir garita
        </Button>
      </div>
    </Page>
  );
}
