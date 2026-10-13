import { MapPin } from 'lucide-react';
import { Button } from '../../core/ui/Button';
import { EmptyState, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { abrirClasico } from '../../core/layout/navigation';

export function UbicacionPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Flota"
        title="Ubicación GPS"
        actions={
          <MenuOtros opciones={[
            {
              label: 'Abrir en la versión actual',
              icon: <MapPin size={17} />,
              onSelect: () => abrirClasico('flota/ubicacion'),
            },
          ]} />
        }
      />

      <EmptyState icon={<MapPin size={28} />} title="Mapa GPS disponible en la versión actual">
        El mapa de ubicaciones en tiempo real con integración Wialon se abre en la versión actual de la aplicación.
      </EmptyState>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--s-4)' }}>
        <Button variant="primary" onClick={() => abrirClasico('flota/ubicacion')}>
          Abrir mapa GPS
        </Button>
      </div>
    </Page>
  );
}
