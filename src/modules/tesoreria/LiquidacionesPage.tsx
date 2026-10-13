import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, ScrollText, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { estadoColor, fmtMonto, useLiquidaciones, type Liquidacion } from './api';

export function LiquidacionesPage() {
  const { data, isLoading, isError, error } = useLiquidaciones();
  const [busqueda, setBusqueda] = useState('');
  const lista: Liquidacion[] = data ?? [];

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(l =>
      String(l.numero ?? '').toUpperCase().includes(q) ||
      String(l.solicitante ?? '').toUpperCase().includes(q) ||
      String(l.descripcion ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Liquidaciones"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} registros`}
        actions={
          <MenuOtros opciones={[
            { label: 'Nueva liquidación', icon: <ScrollText size={17} />, onSelect: () => abrirClasico('tesoreria/liquidaciones') },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('tesoreria/liquidaciones') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Número, solicitante, descripción…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <ScrollText size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin liquidaciones'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Las liquidaciones de gastos aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '40rem' }}>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Fecha</th>
                    <th>Solicitante</th>
                    <th>Descripción</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((l, i) => (
                    <tr key={String(l.id ?? i)}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                        {l.numero ?? String(l.id ?? i + 1)}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                        {l.fecha ? String(l.fecha).split('T')[0] : '—'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{l.solicitante ?? '—'}</td>
                      <td style={{ color: 'var(--label-2)', fontSize: '0.875rem', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.descripcion ?? '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {fmtMonto(l.importe_total)}
                      </td>
                      <td>
                        <span className={`ot-estado ot-estado--${estadoColor(l.estado)}`}>{l.estado ?? '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
