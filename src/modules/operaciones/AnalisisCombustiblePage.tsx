import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Fuel, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { fmtNum, estadoGuiaColor, useAnalisisCombustible, type ViajeCombustible } from './api';

function difColor(dif: number | string | null | undefined): string {
  const n = Number(dif);
  if (isNaN(n)) return '';
  if (n < 0) return 'var(--red-ink)';
  if (n > 0) return 'var(--green-ink)';
  return '';
}

export function AnalisisCombustiblePage() {
  const { data, isLoading, isError, error } = useAnalisisCombustible();
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
        title="Análisis de combustible"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} viajes`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('operaciones/combustible-analisis') },
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
              icon={busqueda ? <SearchX size={22} /> : <Fuel size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin datos de análisis'}
            >
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Los datos de análisis de combustible aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '52rem' }}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Placa</th>
                    <th>Conductor</th>
                    <th>Fecha salida</th>
                    <th style={{ textAlign: 'right' }}>Km</th>
                    <th style={{ textAlign: 'right' }}>Comb. (L)</th>
                    <th style={{ textAlign: 'right' }}>Rend. real</th>
                    <th style={{ textAlign: 'right' }}>Rend. teórico</th>
                    <th style={{ textAlign: 'right' }}>Diferencia</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((v, i) => {
                    const dif = Number(v.diferencia);
                    return (
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
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--label-2)' }}>{fmtNum(v.rendimiento_teorico)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: difColor(dif) }}>
                          {fmtNum(v.diferencia)}
                        </td>
                        <td>
                          <span className={`ot-estado ot-estado--${estadoGuiaColor(v.estado)}`}>{v.estado ?? '—'}</span>
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
