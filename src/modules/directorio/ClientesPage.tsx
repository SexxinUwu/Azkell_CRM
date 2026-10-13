import '../mantenimiento/mant.css';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Building2, SearchX } from 'lucide-react';
import { PageLoader } from '../../core/ui/Button';
import { EmptyState, Notice, Page, PageHeader } from '../../core/ui/Display';
import { SearchField } from '../../core/ui/Field';
import { MenuOtros } from '../../core/ui/MenuOtros';
import { errorMessage } from '../../core/api/client';
import { haptic } from '../../core/lib/haptics';
import { abrirClasico } from '../../core/layout/navigation';
import { useClientes, type Cliente } from './api';

function estaActivo(c: Cliente): boolean {
  return c.activo !== false && c.activo !== 0 && c.activo !== null;
}

export function ClientesPage() {
  const { data, isLoading, isError, error } = useClientes();
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<Cliente | null>(null);

  const clientes: Cliente[] = data ?? [];

  const visibles = useMemo(() => {
    if (!busqueda) return clientes;
    const q = busqueda.toUpperCase();
    return clientes.filter(c =>
      String(c.nombre ?? '').toUpperCase().includes(q) ||
      String(c.razon_social ?? '').toUpperCase().includes(q) ||
      String(c.ruc ?? '').toUpperCase().includes(q)
    );
  }, [clientes, busqueda]);

  if (seleccionado) {
    return (
      <Page push>
        <ClienteDetalle cliente={seleccionado} onVolver={() => setSeleccionado(null)} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Directorio"
        title="Clientes"
        subtitle={isLoading ? 'Cargando…' : `${clientes.length} clientes`}
        actions={
          <MenuOtros opciones={[
            { label: 'Nuevo cliente', icon: <Building2 size={17} />, onSelect: () => abrirClasico('directorio/clientes') },
            { label: 'Abrir en la versión actual', icon: <ArrowUpRight size={17} />, onSelect: () => abrirClasico('directorio/clientes') },
          ]} />
        }
      />

      {isLoading ? <PageLoader /> : isError ? (
        <Notice tone="error">{errorMessage(error)}</Notice>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <SearchField value={busqueda} onChange={setBusqueda} placeholder="Nombre, razón social, RUC…" />

          {visibles.length === 0 ? (
            <EmptyState icon={busqueda ? <SearchX size={22} /> : <Building2 size={22} />}
              title={busqueda ? 'Sin coincidencias' : 'Sin clientes'}>
              {busqueda
                ? <button type="button" className="placas-limpiar" onClick={() => setBusqueda('')}>Quitar búsqueda</button>
                : 'Los clientes registrados aparecerán aquí.'}
            </EmptyState>
          ) : (
            <div className="tarjeta__lista" style={{ overflow: 'auto' }}>
              <table className="inv-kardex">
                <thead>
                  <tr>
                    <th>Nombre / Razón Social</th>
                    <th>RUC</th>
                    <th>Contacto</th>
                    <th>Empresa</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((c, i) => (
                    <tr key={String(c.id ?? i)} style={{ cursor: 'pointer' }}
                      onClick={() => { haptic('selection'); setSeleccionado(c); }}>
                      <td style={{ fontWeight: 600 }}>{c.nombre ?? c.razon_social ?? '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>{c.ruc ?? '—'}</td>
                      <td style={{ color: 'var(--label-2)', fontSize: '0.875rem' }}>{c.contacto ?? c.email ?? '—'}</td>
                      <td style={{ color: 'var(--label-2)', fontSize: '0.875rem' }}>{String(c.empresa ?? '') || '—'}</td>
                      <td>
                        <span className={`ot-estado ot-estado--${estaActivo(c) ? 'green' : 'neutral'}`}>
                          {estaActivo(c) ? 'Activo' : 'Inactivo'}
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

function ClienteDetalle({ cliente, onVolver }: { cliente: Cliente; onVolver: () => void }) {
  return (
    <div className="ot-ficha">
      <div className="tarjeta__barra">
        <button type="button" className="tarjeta__volver" onClick={onVolver}>
          <span style={{ fontSize: '1.2rem' }}>‹</span> Clientes
        </button>
      </div>
      <div className="ot-ficha__hero">
        <span className={`ot-estado ot-estado--${estaActivo(cliente) ? 'green' : 'neutral'}`}>
          {estaActivo(cliente) ? 'Activo' : 'Inactivo'}
        </span>
        <h2 className="ot-ficha__placa">{cliente.nombre ?? cliente.razon_social ?? '—'}</h2>
        {cliente.ruc && <span className="ot-ficha__id">RUC {cliente.ruc}</span>}
      </div>
      <div>
        <p className="tarjeta__grupo-titulo">Datos del cliente</p>
        <div className="tarjeta__lista">
          {cliente.razon_social && cliente.nombre !== cliente.razon_social && (
            <div className="dato"><span className="dato__label">Razón social</span><span className="dato__valor">{cliente.razon_social}</span></div>
          )}
          {cliente.email && <div className="dato"><span className="dato__label">Email</span><span className="dato__valor">{cliente.email}</span></div>}
          {cliente.telefono && <div className="dato"><span className="dato__label">Teléfono</span><span className="dato__valor">{cliente.telefono}</span></div>}
          {cliente.direccion && <div className="dato"><span className="dato__label">Dirección</span><span className="dato__valor">{cliente.direccion}</span></div>}
          {cliente.contacto && <div className="dato"><span className="dato__label">Contacto</span><span className="dato__valor">{cliente.contacto}</span></div>}
          {String(cliente.empresa ?? '') && (
            <div className="dato"><span className="dato__label">Empresa</span><span className="dato__valor">{String(cliente.empresa)}</span></div>
          )}
        </div>
      </div>
    </div>
  );
}
