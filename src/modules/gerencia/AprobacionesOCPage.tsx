import { ArrowUpRight, ClipboardCheck } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { abrirClasico } from '../../core/layout/navigation';

export function AprobacionesOCPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Gerencia"
        title="Aprobación de compras"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('gerencia/aprobaciones-oc') },
          ]} />
        }
      />
      <EmptyState icon={<ClipboardCheck size={28} />} title="Disponible en la versión actual">
        La aprobación de órdenes de compra con flujo de autorización está en la versión actual.
      </EmptyState>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--s-4)' }}>
        <Button variant="primary" onClick={() => abrirClasico('gerencia/aprobaciones-oc')}>
          Abrir aprobaciones de compras
        </Button>
      </div>
    </Page>
  );
}
