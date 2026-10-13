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
      <EmptyState
        icon={<ClipboardCheck size={28} />}
        title="Flujo de aprobación de movimientos de caja"
      >
        Revisa y aprueba los movimientos de caja pendientes con flujo de autorización por WhatsApp.
      </EmptyState>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--s-4)' }}>
        <Button variant="primary" onClick={() => abrirClasico('gerencia/aprobaciones-caja')}>
          Abrir aprobaciones de caja
        </Button>
      </div>
    </Page>
  );
}
