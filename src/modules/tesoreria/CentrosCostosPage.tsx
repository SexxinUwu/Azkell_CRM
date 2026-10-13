import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Boxes, Plus, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { useCentrosCostos, type CentroCosto } from './api';

export function CentrosCostosPage() {
  const { data, isLoading, isError, error } = useCentrosCostos();
  const [busqueda, setBusqueda] = useState('');
  const lista: CentroCosto[] = data ?? [];

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(c =>
      String(c.nombre ?? '').toUpperCase().includes(q) ||
      String(c.codigo ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  return (
    <Page>
      <PageHeader
        eyebrow="Tesorería"
        title="Centros de costos"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} centros`}
        actions={
          <MenuOtros opciones={[
            { label: 'Nuevo centro', icon: <Plus size={17} />, onSelect: () => abrirClasico('tesoreria/centros-costos') },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('tesoreria/centros-costos') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre o código…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <Boxes size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin centros de costos'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Los centros de costos registrados aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Descripción</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((c, i) => (
                    <tr key={String(c.id ?? i)}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>
                        {c.codigo ?? '—'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{c.nombre ?? '—'}</td>
                      <td style={{ color: 'var(--label-2)', fontSize: '0.875rem' }}>{c.descripcion ?? '—'}</td>
                      <td>
                        <span className={`ot-estado ot-estado--${c.activo !== false && c.activo !== 0 ? 'green' : 'neutral'}`}>
                          {c.activo !== false && c.activo !== 0 ? 'Activo' : 'Inactivo'}
                        </span>
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
