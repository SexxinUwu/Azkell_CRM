import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, FileText, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { estadoColor, fmtMonto, useCuentas, type CuentaPorCobrar } from './api';

function diasAlVencimiento(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const d = new Date(String(fecha).split('T')[0] + 'T00:00:00');
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoy.getTime()) / 86_400_000);
}

function vencColor(dias: number | null): string {
  if (dias === null) return 'neutral';
  if (dias < 0) return 'red';
  if (dias <= 7) return 'amber';
  return 'green';
}

export function CuentasPage() {
  const { data, isLoading, isError, error } = useCuentas();
  const [busqueda, setBusqueda] = useState('');
  const lista: CuentaPorCobrar[] = data ?? [];

  const vencidas = useMemo(() => lista.filter(c => {
    const dias = diasAlVencimiento(c.fecha_vencimiento);
    return dias !== null && dias < 0;
  }).length, [lista]);

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(c =>
      String(c.cliente ?? '').toUpperCase().includes(q) ||
      String(c.numero_factura ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Cuentas por cobrar"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} cuentas`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('tesoreria/cuentas') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {vencidas > 0 && (
            <Notice tone="error">{vencidas} cuenta{vencidas > 1 ? 's' : ''} vencida{vencidas > 1 ? 's' : ''}. Revisa en la versión actual.</Notice>
          )}
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Cliente, factura…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <FileText size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin cuentas'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Las cuentas por cobrar aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '44rem' }}>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Factura</th>
                    <th style={{ textAlign: 'right' }}>Monto</th>
                    <th style={{ textAlign: 'right' }}>Saldo</th>
                    <th>Vencimiento</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((c, i) => {
                    const dias = diasAlVencimiento(c.fecha_vencimiento);
                    const vc = vencColor(dias);
                    return (
                      <tr key={String(c.id ?? i)}>
                        <td style={{ fontWeight: 600 }}>{c.cliente ?? '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>{c.numero_factura ?? '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtMonto(c.monto)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtMonto(c.saldo)}</td>
                        <td style={{ color: `var(--${vc}-ink)`, fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: vc !== 'green' ? 700 : undefined }}>
                          {c.fecha_vencimiento ? String(c.fecha_vencimiento).split('T')[0] : '—'}
                          {dias !== null && (
                            <span style={{ marginLeft: 4, fontSize: '0.75rem' }}>
                              ({dias < 0 ? `${Math.abs(dias)}d vencido` : dias === 0 ? 'hoy' : `${dias}d`})
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`ot-estado ot-estado--${estadoColor(c.estado)}`}>{c.estado ?? '—'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
