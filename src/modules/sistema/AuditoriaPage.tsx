import '../mantenimiento/mant.css';
import { useState } from 'react';
import { ArrowUpRight, SearchX, ShieldCheck } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { abrirClasico } from '../../core/layout/navigation';
import { useAuditoria, useLogFirmado, type AuditoriaEntrada } from './api';

function fechaHora(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function accionColor(a: string | null | undefined): string {
  if (!a) return 'neutral';
  const l = a.toLowerCase();
  if (l.includes('elimin') || l.includes('delet') || l.includes('remov')) return 'red';
  if (l.includes('creó') || l.includes('creo') || l.includes('creat') || l.includes('registr')) return 'green';
  if (l.includes('editó') || l.includes('edito') || l.includes('updat') || l.includes('modific')) return 'amber';
  return 'blue';
}

export function AuditoriaPage() {
  const [busqueda, setBusqueda] = useState('');
  const [vista, setVista] = useState<'actividad' | 'firmado'>('actividad');
  const act = useAuditoria({ q: busqueda || undefined });
  const log = useLogFirmado(busqueda || undefined, vista === 'firmado');
  const firmado = vista === 'firmado';
  const { isLoading, isError, error } = firmado ? log : act;
  const entradas: AuditoriaEntrada[] = act.data ?? [];
  const filas = log.data ?? [];
  const total = firmado ? filas.length : entradas.length;

  return (
    <Page>
      <PageHeader
        eyebrow="Sistema"
        title="Auditoría"
        subtitle={isLoading ? 'Cargando…' : `${total} registros`}
        actions={
          <MenuOtros opciones={[
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('sistema/auditoria') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            <button type="button" className={`ot-estado ot-estado--${firmado ? 'neutral' : 'blue'}`} onClick={() => setVista('actividad')}>Actividad</button>
            <button type="button" className={`ot-estado ot-estado--${firmado ? 'blue' : 'neutral'}`} onClick={() => setVista('firmado')}>Registro firmado (antes / después)</button>
          </div>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Usuario, módulo, acción…" />

          {firmado ? (
            filas.length === 0 ? (
              <EmptyState icon={<ShieldCheck size={22} />} title="Sin registros">No hay mutaciones registradas.</EmptyState>
            ) : (
              <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
                <table className="inv-kardex" style={{ minWidth: '60rem' }}>
                  <thead>
                    <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Ruta</th><th>Antes</th><th>Después</th><th>Firma</th></tr>
                  </thead>
                  <tbody>
                    {filas.map(f => (
                      <tr key={f.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{fechaHora(f.created_at)}</td>
                        <td style={{ fontWeight: 600, fontSize: '0.875rem' }}>{f.usuario || '—'}</td>
                        <td><span className={`ot-estado ot-estado--${accionColor(f.accion)}`}>{f.accion || '—'}</span></td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--label-2)' }}>{f.metodo} {f.ruta}</td>
                        <td title={f.antes ?? ''} style={{ color: 'var(--label-2)', fontSize: '0.8125rem', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.antes || '—'}</td>
                        <td title={f.despues ?? f.detalle ?? ''} style={{ color: 'var(--label-2)', fontSize: '0.8125rem', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.despues || f.detalle || '—'}</td>
                        <td title={f.firma_estado ?? f.firma} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--label-3)' }}>{(f.firma_estado ?? f.firma).slice(0, 8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : entradas.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <ShieldCheck size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin registros'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'No hay registros de auditoría.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex" style={{ minWidth: '48rem' }}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Usuario</th>
                    <th>Módulo</th>
                    <th>Acción</th>
                    <th>IP</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {entradas.map((e, i) => (
                    <tr key={String(e.id ?? i)}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                        {fechaHora(e.created_at)}
                      </td>
                      <td style={{ fontWeight: 600, fontSize: '0.875rem' }}>{e.usuario || '—'}</td>
                      <td style={{ color: 'var(--label-2)', fontSize: '0.8125rem' }}>
                        {[e.modulo, e.submodulo].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td>
                        <span className={`ot-estado ot-estado--${accionColor(e.accion)}`}>{e.accion || '—'}</span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--label-3)' }}>
                        {e.ip || '—'}
                      </td>
                      <td style={{ color: 'var(--label-2)', fontSize: '0.8125rem', maxWidth: '14rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {String(e.detalle ?? '') || '—'}
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
