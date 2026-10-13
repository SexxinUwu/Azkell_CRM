import './mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Gauge, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { frFecha, frId, frKmCambio, frKmProx, frObs, frPlaca, frTipo, useFleetrun, type FleetrunFila } from './api';

export function FleetrunPage() {
  const { data, isLoading, isError, error } = useFleetrun();
  const [busqueda, setBusqueda] = useState('');

  const filas = data ?? [];

  // Agrupar por placa — mostrar solo el más reciente por placa+tipo (vista "últimos")
  const porPlacaTipo = useMemo(() => {
    const mapa = new Map<string, FleetrunFila>();
    for (const f of filas) {
      const key = `${frPlaca(f)}__${frTipo(f)}`;
      if (!mapa.has(key)) mapa.set(key, f);
    }
    return Array.from(mapa.values());
  }, [filas]);

  const visibles = useMemo(() => {
    if (!busqueda) return porPlacaTipo;
    const q = busqueda.toUpperCase();
    return porPlacaTipo.filter(f =>
      frPlaca(f).toUpperCase().includes(q) ||
      frTipo(f).toUpperCase().includes(q)
    );
  }, [porPlacaTipo, busqueda]);

  // Contar vencidos/próximos (sin km_gps real aquí, solo estimación por km_prox < km_cambio)
  const vencidos = visibles.filter(f => frKmProx(f) > 0 && frKmCambio(f) > 0 && frKmProx(f) <= frKmCambio(f)).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Mantenimiento"
        title="Fleetrun"
        subtitle={isLoading ? 'Cargando…' : `${porPlacaTipo.length} registros (${filas.length} total)`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('mantenimiento/fleetrun') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {vencidos > 0 && (
            <Notice tone="error">{vencidos} mantenimiento{vencidos > 1 ? 's' : ''} con km próximo alcanzado. Revisa la versión completa para detalles.</Notice>
          )}

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Placa o tipo de mantenimiento…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <Gauge size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin registros Fleetrun'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Los registros de mantenimiento preventivo aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '36rem' }}>
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Tipo MP</th>
                    <th>Fecha</th>
                    <th style={{ textAlign: 'right' }}>Km cambio</th>
                    <th style={{ textAlign: 'right' }}>Km próx.</th>
                    <th>Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f) => {
                    const kmC = frKmCambio(f);
                    const kmP = frKmProx(f);
                    const vencido = kmP > 0 && kmC > 0 && kmP <= kmC;
                    return (
                      <tr key={frId(f) || `${frPlaca(f)}-${frTipo(f)}`}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>
                          {frPlaca(f)}
                        </td>
                        <td style={{ fontWeight: 600 }}>{frTipo(f)}</td>
                        <td style={{ color: 'var(--label-2)', fontFamily: 'var(--font-mono)' }}>{frFecha(f)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {kmC > 0 ? kmC.toLocaleString('es-PE') : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: vencido ? 'var(--red-ink)' : undefined, fontWeight: vencido ? 700 : undefined }}>
                          {kmP > 0 ? kmP.toLocaleString('es-PE') : '—'}
                        </td>
                        <td style={{ color: 'var(--label-2)', fontSize: '0.8125rem', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {frObs(f) || '—'}
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
