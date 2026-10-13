import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Receipt, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { estadoColor, fmtMonto, useCaja, type CajaMovimiento } from './api';

export function CajaPage() {
  const { data, isLoading, isError, error } = useCaja();
  const [busqueda, setBusqueda] = useState('');
  const movimientos: CajaMovimiento[] = data ?? [];

  const visibles = useMemo(() => {
    if (!busqueda) return movimientos;
    const q = busqueda.toUpperCase();
    return movimientos.filter(m =>
      String(m.concepto ?? '').toUpperCase().includes(q) ||
      String(m.numero ?? '').toUpperCase().includes(q) ||
      String(m.solicitante ?? '').toUpperCase().includes(q)
    );
  }, [movimientos, busqueda]);

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Caja"
        subtitle={isLoading ? 'Cargando…' : `${movimientos.length} movimientos`}
        actions={
          <MenuOtros opciones={[
            { label: 'Nuevo movimiento', icon: <Receipt size={17} />, onSelect: () => abrirClasico('tesoreria/caja') },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('tesoreria/caja') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Concepto, número, solicitante…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <Receipt size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin movimientos'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Los movimientos de caja aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '44rem' }}>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th>Tipo</th>
                    <th style={{ textAlign: 'right' }}>Importe</th>
                    <th>Solicitante</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((m, i) => (
                    <tr key={String(m.id ?? i)}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                        {m.numero ?? String(m.id ?? i + 1)}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--label-2)' }}>
                        {m.fecha ? String(m.fecha).split('T')[0] : '—'}
                      </td>
                      <td style={{ fontWeight: 600, maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.concepto ?? '—'}
                      </td>
                      <td style={{ color: 'var(--label-2)', fontSize: '0.875rem' }}>{m.tipo ?? '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {fmtMonto(m.importe)}
                      </td>
                      <td style={{ color: 'var(--label-2)', fontSize: '0.875rem' }}>{m.solicitante ?? '—'}</td>
                      <td>
                        <span className={`ot-estado ot-estado--${estadoColor(m.estado)}`}>{m.estado ?? '—'}</span>
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
