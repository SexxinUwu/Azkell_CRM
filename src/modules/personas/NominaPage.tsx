import '../mantenimiento/mant.css';
import { ArrowUpRight, DollarSign } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { Notice, Page, PageHeader } from '../../core/ui/Display';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { useNominaResumen } from './api';

function fmtS(v: number | string | null | undefined): string {
  const n = Number(v);
  if (isNaN(n) || v === null || v === undefined || v === '') return '—';
  return 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function NominaPage() {
  const { data, isLoading, isError, error } = useNominaResumen();

  const kpis = [
    { label: 'Empleados', valor: data?.total_empleados ?? null, tipo: 'numero' },
    { label: 'Total bruto', valor: data?.total_bruto ?? null, tipo: 'monto' },
    { label: 'Descuentos', valor: data?.total_descuentos ?? null, tipo: 'monto' },
    { label: 'Total neto', valor: data?.total_neto ?? null, tipo: 'monto' },
  ] as const;

  const periodo = [data?.mes, data?.anio].filter(Boolean).join('/');

  return (
    <Page>
      <PageHeader
        eyebrow="Personas y seguridad"
        title="Nómina"
        subtitle={isLoading ? 'Cargando…' : periodo ? `Período ${periodo}` : 'Resumen'}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('rrhh/nomina') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))', gap: 'var(--s-2)' }}>
            {kpis.map(k => (
              <div key={k.label} className="tarjeta__lista" style={{ padding: 'var(--s-3)', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--s-1)', color: 'var(--accent)' }}>
                  <DollarSign size={20} />
                </div>
                <div style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {k.valor === null || k.valor === undefined
                    ? '—'
                    : k.tipo === 'monto'
                      ? fmtS(k.valor)
                      : String(k.valor)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>

          <Notice>
            Para el detalle de nómina, liquidaciones y boletas usa la versión actual.
          </Notice>
        </div>
      )}
    </Page>
  );
}
