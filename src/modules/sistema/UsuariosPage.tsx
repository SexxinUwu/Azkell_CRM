import { ArrowUpRight, Users } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { abrirClasico } from '../../core/layout/navigation';

export function UsuariosPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Sistema"
        title="Usuarios y roles"
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('sistema/usuarios') },
          ]} />
        }
      />
      <EmptyState icon={<Users size={28} />} title="Disponible en la versión actual">
        La gestión de usuarios, roles y la matriz de permisos está en la versión actual de la aplicación.
      </EmptyState>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--s-4)' }}>
        <Button variant="primary" onClick={() => abrirClasico('sistema/usuarios')}>
          Abrir usuarios y roles
        </Button>
      </div>
    </Page>
  );
}
