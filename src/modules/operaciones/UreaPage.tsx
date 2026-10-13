import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Droplets, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { fmtNum, estadoGuiaColor, useAnalisisUrea, type ViajeCombustible } from './api';

export function UreaPage() {
  const { data, isLoading, isError, error } = useAnalisisUrea();
  const [busqueda, setBusqueda] = useState('');
  const lista: ViajeCombustible[] = data ?? [];

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(v =>
      String(v.placa ?? '').toUpperCase().includes(q) ||
      String(v.conductor ?? '').toUpperCase().includes(q) ||
      String(v.codigo ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Análisis de urea"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} viajes`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('operaciones/urea-analisis') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa, conductor, código…" />

          {visibles.length === 0 ? (
            <EmptyState
              icon={busqueda ? <SearchX size={22} /> : <Droplets size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin datos de análisis'}
            >
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Los datos de análisis de urea aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '46rem' }}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Placa</th>
                    <th>Conductor</th>
                    <th>Fecha salida</th>
                    <th style={{ textAlign: 'right' }}>Km</th>
                    <th style={{ textAlign: 'right' }}>Urea (L)</th>
                    <th style={{ textAlign: 'right' }}>Consumo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((v, i) => (
                    <tr key={String(v.id ?? i)}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--accent)', fontWeight: 600 }}>
                        {v.codigo ?? '—'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{v.placa ?? '—'}</td>
                      <td style={{ fontSize: '0.875rem' }}>{v.conductor ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                        {v.fecha_salida ? String(v.fecha_salida).split('T')[0] : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtNum(v.km_recorridos, 0)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtNum(v.combustible_cargado)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtNum(v.rendimiento)}</td>
                      <td>
                        <span className={`ot-estado ot-estado--${estadoGuiaColor(v.estado)}`}>{v.estado ?? '—'}</span>
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
