import '../mantenimiento/mant.css';
import { ArrowUpRight, Link2, Settings } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { useIntegraciones, type Integracion } from './api';

export function IntegracionesPage() {
  const { data, isLoading, isError, error } = useIntegraciones();
  const lista: Integracion[] = data ?? [];

  return (
    <Page>
      <PageHeader
        eyebrow="Configuración"
        title="Integraciones"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} servicios`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('sistema/integraciones') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : lista.length === 0 ? (
        <EmptyState icon={<Settings size={22} />} title="Sin integraciones">
          Las integraciones configuradas (Wialon GPS, Gemini IA, etc.) aparecerán aquí.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {lista.map((item, i) => (
            <div key={String(item.clave ?? i)} className="tarjeta__lista" style={{ padding: 'var(--s-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                <Link2 size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{item.nombre ?? item.clave}</div>
                  {item.descripcion && (
                    <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)', marginTop: 2 }}>{item.descripcion}</div>
                  )}
                </div>
                {item.activo !== undefined && (
                  <span className={`ot-estado ot-estado--${item.activo ? 'green' : 'neutral'}`}>
                    {item.activo ? 'Activo' : 'Inactivo'}
                  </span>
                )}
              </div>
            </div>
          ))}
          <Notice>Para editar las credenciales usa la versión actual.</Notice>
        </div>
      )}
    </Page>
  );
}
