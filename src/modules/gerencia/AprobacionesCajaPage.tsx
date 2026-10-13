import { ArrowUpRight, ClipboardCheck } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { abrirClasico } from '../../core/layout/navigation';

export function AprobacionesCajaPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Gerencia"
        title="Aprobación de caja"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('gerencia/aprobaciones-caja') },
          ]} />
        }
      />
      <EmptyState icon={<ClipboardCheck size={28} />} title="Disponible en la versión actual">
        La aprobación de movimientos de caja con flujo de autorización está en la versión actual.
      </EmptyState>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--s-4)' }}>
        <Button variant="primary" onClick={() => abrirClasico('gerencia/aprobaciones-caja')}>
          Abrir aprobaciones de caja
        </Button>
      </div>
    </Page>
  );
}
