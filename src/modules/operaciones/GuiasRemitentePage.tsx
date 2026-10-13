import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, FileText, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { estadoGuiaColor, useGuiasRemitente, useGuiasRemitenteKpis, type GuiaRemitente } from './api';

export function GuiasRemitentePage() {
  const { data, isLoading, isError, error } = useGuiasRemitente();
  const { data: kpis } = useGuiasRemitenteKpis();
  const [busqueda, setBusqueda] = useState('');
  const lista: GuiaRemitente[] = data ?? [];

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(g =>
      String(g.serie ?? '').toUpperCase().includes(q) ||
      String(g.correlativo ?? '').toUpperCase().includes(q) ||
      String(g.destinatario_nombre ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  return (
    <Page>
      <PageHeader
        eyebrow="Operaciones"
        title="Guías de remitente"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} guías`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('operaciones/guia-remitente') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          {kpis && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: 'var(--s-2)' }}>
              {([
                { label: 'Total', valor: kpis.total },
                { label: 'Emitidas', valor: kpis.emitidas },
                { label: 'Pendientes', valor: kpis.pendientes },
                { label: 'Anuladas', valor: kpis.anuladas },
              ] as { label: string; valor: number | null | undefined }[]).map(k => (
                <div key={k.label} className="tarjeta__lista" style={{ padding: 'var(--s-3)', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    {k.valor ?? '—'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--label-2)', marginTop: 2 }}>{k.label}</div>
                </div>
              ))}
            </div>
          )}

          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Serie, correlativo, destinatario…" />

          {visibles.length === 0 ? (
            <EmptyState
              icon={busqueda ? <SearchX size={22} /> : <FileText size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin guías'}
            >
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Las guías de remitente aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '42rem' }}>
                <thead>
                  <tr>
                    <th>Serie/N°</th>
                    <th>Fecha</th>
                    <th>Destinatario</th>
                    <th>Descripción</th>
                    <th style={{ textAlign: 'right' }}>Peso</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((g, i) => (
                    <tr key={String(g.id ?? i)}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.875rem', color: 'var(--accent)' }}>
                        {[g.serie, g.correlativo].filter(Boolean).join('-') || '—'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                        {g.fecha_emision ? String(g.fecha_emision).split('T')[0] : '—'}
                      </td>
                      <td style={{ fontWeight: 500 }}>{g.destinatario_nombre ?? '—'}</td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--label-2)', maxWidth: '14rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.descripcion ?? '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                        {g.peso_bruto ? `${g.peso_bruto} ${g.unidad_peso ?? ''}`.trim() : '—'}
                      </td>
                      <td>
                        <span className={`ot-estado ot-estado--${estadoGuiaColor(g.estado)}`}>{g.estado ?? '—'}</span>
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
