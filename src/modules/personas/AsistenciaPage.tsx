import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, CalendarCheck, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { tareoEstadoColor, useTareo, type TareoEntrada } from './api';

export function AsistenciaPage() {
  const { data, isLoading, isError, error } = useTareo();
  const [busqueda, setBusqueda] = useState('');
  const lista: TareoEntrada[] = data ?? [];

  const visibles = useMemo(() => {
    if (!busqueda) return lista;
    const q = busqueda.toUpperCase();
    return lista.filter(t =>
      String(t.nombre ?? '').toUpperCase().includes(q) ||
      String(t.apellido ?? '').toUpperCase().includes(q) ||
      String(t.cargo ?? '').toUpperCase().includes(q)
    );
  }, [lista, busqueda]);

  return (
    <Page>
      <PageHeader
        eyebrow="Personas y seguridad"
        title="Asistencia"
        subtitle={isLoading ? 'Cargando…' : `${lista.length} registros`}
        actions={
          <MenuOtros opciones={[
            { label: 'Registrar tareo', icon: <CalendarCheck size={17} />, onSelect: () => abrirClasico('rrhh/asistencia') },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('rrhh/asistencia') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, cargo…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <CalendarCheck size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin registros de asistencia'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Los registros de tareo y asistencia aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '36rem' }}>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Cargo</th>
                    <th>Empresa</th>
                    <th>Fecha</th>
                    <th>Turno</th>
                    <th>Horas</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((t, i) => (
                    <tr key={String(t.id ?? i)}>
                      <td style={{ fontWeight: 600 }}>
                        {[t.nombre, t.apellido].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td style={{ color: 'var(--label-2)', fontSize: '0.875rem' }}>{t.cargo ?? '—'}</td>
                      <td style={{ color: 'var(--label-2)', fontSize: '0.875rem' }}>{t.empresa ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                        {t.fecha ? String(t.fecha).split('T')[0] : '—'}
                      </td>
                      <td style={{ color: 'var(--label-2)', fontSize: '0.875rem' }}>{t.turno ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                        {t.horas ? `${t.horas} h` : '—'}
                      </td>
                      <td>
                        <span className={`ot-estado ot-estado--${tareoEstadoColor(t.estado)}`}>
                          {t.estado ?? '—'}
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
