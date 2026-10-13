import '../mantenimiento/mant.css';
import { ArrowUpRight, Landmark, Plus } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { fmtMonto, useBancos, type Banco } from './api';

export function BancosPage() {
  const { data, isLoading, isError, error } = useBancos();
  const bancos: Banco[] = data ?? [];

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Bancos"
        subtitle={isLoading ? 'Cargando…' : `${bancos.length} cuentas`}
        actions={
          <MenuOtros opciones={[
            { label: 'Nueva cuenta', icon: <Plus size={17} />, onSelect: () => abrirClasico('tesoreria/bancos') },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('tesoreria/bancos') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : bancos.length === 0 ? (
        <EmptyState icon={<Landmark size={22} />} title="Sin cuentas bancarias">
          Las cuentas bancarias registradas aparecerán aquí.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {bancos.map((b, i) => (
            <div key={String(b.id ?? i)} className="tarjeta__lista" style={{ padding: 'var(--s-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
                <Landmark size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{b.nombre ?? '—'}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--label-2)', marginTop: 2 }}>
                    {[b.tipo, b.moneda, b.numero_cuenta].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                {b.saldo !== null && b.saldo !== undefined && b.saldo !== '' && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem' }}>{fmtMonto(b.saldo)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--label-2)' }}>{b.moneda ?? ''}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
